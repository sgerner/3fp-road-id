import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sendEmail } from '$lib/services/email';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { getStripeClient } from '$lib/server/stripe';
import { renewDomainWithVercel, updateVercelDomainAutoRenew } from '$lib/server/vercelDomains';

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function isAuthorized(request) {
	const expected =
		cleanText(env.CRON_SECRET) ||
		cleanText(env.CRON_AUTH_TOKEN) ||
		cleanText(env.VERCEL_CRON_SECRET);
	if (!expected) return false;
	const authHeader = cleanText(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
	const cronHeader = cleanText(request.headers.get('x-vercel-cron-secret'));
	return authHeader === expected || cronHeader === expected;
}

function plusOneYearIso(value) {
	const base = value ? new Date(value) : new Date();
	const next = Number.isNaN(base.getTime()) ? new Date() : base;
	next.setUTCFullYear(next.getUTCFullYear() + 1);
	return next.toISOString();
}

async function getMainStripeConnectedAccountId(serviceSupabase) {
	const { data, error } = await serviceSupabase
		.from('donation_accounts')
		.select('id,stripe_account_id')
		.eq('id', 'main')
		.maybeSingle();
	if (error) throw error;
	return cleanText(data?.stripe_account_id);
}

async function lookupReceiptEmail(serviceSupabase, domainRow) {
	const { data } = await serviceSupabase
		.from('group_site_domain_orders')
		.select('receipt_email')
		.eq('domain_id', domainRow.id)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	return cleanText(data?.receipt_email);
}

async function sendRenewalFailureEmail({ fetch, to, domain, reason }) {
	if (!cleanText(to)) return;
	await sendEmail(
		{
			to,
			subject: `Action required: renewal payment failed for ${domain}`,
			text: [
				`We could not process your domain renewal payment for ${domain}.`,
				``,
				`Reason: ${reason}`,
				``,
				`Auto-renew has been paused to prevent registrar renewal while payment is unresolved.`,
				`Please update your card and retry renewal from the group site manager.`
			].join('\n'),
			html: [
				`<p>We could not process your domain renewal payment for <strong>${domain}</strong>.</p>`,
				`<p><strong>Reason:</strong> ${reason}</p>`,
				`<p>Auto-renew has been paused to prevent registrar renewal while payment is unresolved.</p>`,
				`<p>Please update your card and retry renewal from the group site manager.</p>`
			].join(''),
			tags: [{ Name: 'context', Value: 'domain-renewal-failed' }]
		},
		{ fetch }
	);
}

export async function POST({ request, fetch }) {
	if (!isAuthorized(request)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 500 });
	}

	const horizon = new Date();
	horizon.setUTCDate(horizon.getUTCDate() + 21);
	const { data: dueDomains } = await serviceSupabase
		.from('group_site_domains')
		.select('*')
		.eq('renewal_enabled', true)
		.eq('auto_renew', true)
		.eq('renewal_status', 'active')
		.lte('renews_at', horizon.toISOString())
		.order('renews_at', { ascending: true })
		.limit(40);

	const stripe = getStripeClient();
	const defaultConnectedAccountId = await getMainStripeConnectedAccountId(serviceSupabase).catch(
		() => ''
	);
	let renewed = 0;
	let failed = 0;
	const results = [];
	for (const domainRow of Array.isArray(dueDomains) ? dueDomains : []) {
		const domain = cleanText(domainRow.domain).toLowerCase();
		const amountCents = Number(domainRow.next_renewal_charge_cents || 0);
		const baseRenewalCents =
			Number(domainRow.base_renewal_price_cents || 0) ||
			Number(domainRow.next_renewal_charge_cents || 0);
		const customerId = cleanText(domainRow.stripe_customer_id);
		const paymentMethodId = cleanText(domainRow.stripe_payment_method_id);
		const stripeConnectedAccountId =
			cleanText(domainRow.stripe_connected_account_id) || defaultConnectedAccountId;
		const stripeOptions = stripeConnectedAccountId
			? { stripeAccount: stripeConnectedAccountId }
			: undefined;

		try {
			if (!(amountCents > 0) || !customerId || !paymentMethodId || !(baseRenewalCents > 0)) {
				throw new Error('Missing renewal billing configuration.');
			}
			if (!stripeConnectedAccountId) {
				throw new Error('Missing Stripe connected account for renewal billing.');
			}

			await stripe.paymentIntents.create(
				{
					amount: amountCents,
					currency: 'usd',
					customer: customerId,
					payment_method: paymentMethodId,
					confirm: true,
					off_session: true,
					automatic_payment_methods: {
						enabled: false
					},
					metadata: {
						context: 'group_site_domain_renewal',
						domain,
						group_id: cleanText(domainRow.group_id)
					}
				},
				stripeOptions
			);

			const renewal = await renewDomainWithVercel({
				domain,
				years: 1,
				expectedPriceCents: baseRenewalCents
			});
			const renewalOrderId = cleanText(renewal?.orderId);
			await serviceSupabase
				.from('group_site_domains')
				.update({
					renewal_status: 'active',
					last_payment_failed_at: null,
					last_error: null,
					vercel_order_id: renewalOrderId || domainRow.vercel_order_id || null,
					renews_at: plusOneYearIso(domainRow.renews_at),
					updated_at: new Date().toISOString()
				})
				.eq('id', domainRow.id);
			await serviceSupabase.from('group_site_domain_events').insert({
				group_id: domainRow.group_id,
				domain_id: domainRow.id,
				provider: 'system',
				event_type: 'renewal_completed',
				payload: {
					domain,
					renewalOrderId
				}
			});
			renewed += 1;
			results.push({ domain, status: 'renewed' });
		} catch (error) {
			const reason = error?.message || 'Renewal charge failed.';
			failed += 1;
			await updateVercelDomainAutoRenew({ domain, autoRenew: false }).catch(() => null);
			await serviceSupabase
				.from('group_site_domains')
				.update({
					auto_renew: false,
					renewal_enabled: false,
					renewal_status: 'failed',
					last_payment_failed_at: new Date().toISOString(),
					last_error: reason,
					updated_at: new Date().toISOString()
				})
				.eq('id', domainRow.id);
			await serviceSupabase.from('group_site_domain_events').insert({
				group_id: domainRow.group_id,
				domain_id: domainRow.id,
				provider: 'system',
				event_type: 'renewal_failed',
				processing_status: 'failed',
				error_message: reason,
				payload: {
					domain
				}
			});

			const to = await lookupReceiptEmail(serviceSupabase, domainRow);
			await sendRenewalFailureEmail({ fetch, to, domain, reason }).catch(() => null);
			results.push({ domain, status: 'failed', error: reason });
		}
	}

	return json({
		ok: true,
		renewed,
		failed,
		processed: results.length,
		results
	});
}
