import { env } from '$env/dynamic/private';
import { sendEmail } from '$lib/services/email';
import { getStripeClient, resolvePublicBaseUrl } from '$lib/server/stripe';
import {
	addDomainToMicrositeProject,
	buyDomainWithVercel,
	getDomainConfigForProject,
	getDomainPriceQuote,
	normalizeDomain,
	searchBulkDomainAvailability,
	updateVercelDomainAutoRenew,
	verifyMicrositeProjectDomain
} from '$lib/server/vercelDomains';

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function cleanLower(value) {
	return cleanText(value).toLowerCase();
}

function toCents(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return 0;
	return Math.max(0, Math.round(numeric));
}

function digitsOnly(value) {
	return cleanText(value).replace(/[^\d]/g, '');
}

export function computeDomainFees({ basePurchasePriceCents, baseRenewalPriceCents }) {
	const purchaseBase = toCents(basePurchasePriceCents);
	const renewalBase = toCents(baseRenewalPriceCents);

	const appMarkupRate = Number(env.DOMAIN_MARKUP_BPS || 300) / 10_000;
	const appMarkupFixedCents = toCents(env.DOMAIN_MARKUP_FIXED_CENTS || 50);
	const stripeFeeRate = Number(env.DOMAIN_STRIPE_FEE_BPS || 290) / 10_000;
	const stripeFeeFixedCents = toCents(env.DOMAIN_STRIPE_FEE_FIXED_CENTS || 30);

	const purchaseMarkupCents = Math.max(
		0,
		Math.round(purchaseBase * appMarkupRate) + appMarkupFixedCents
	);
	const purchaseStripeFeeCents = Math.max(
		0,
		Math.round((purchaseBase + purchaseMarkupCents) * stripeFeeRate) + stripeFeeFixedCents
	);
	const purchaseTotalCents = purchaseBase + purchaseMarkupCents + purchaseStripeFeeCents;

	const renewalMarkupCents = Math.max(
		0,
		Math.round(renewalBase * appMarkupRate) + appMarkupFixedCents
	);
	const renewalStripeFeeCents = Math.max(
		0,
		Math.round((renewalBase + renewalMarkupCents) * stripeFeeRate) + stripeFeeFixedCents
	);
	const renewalTotalCents = renewalBase + renewalMarkupCents + renewalStripeFeeCents;

	return {
		purchase: {
			baseCents: purchaseBase,
			markupCents: purchaseMarkupCents,
			stripeFeeCents: purchaseStripeFeeCents,
			totalCents: purchaseTotalCents
		},
		renewal: {
			baseCents: renewalBase,
			markupCents: renewalMarkupCents,
			stripeFeeCents: renewalStripeFeeCents,
			totalCents: renewalTotalCents
		}
	};
}

const DEFAULT_TLDS = ['bike', 'org', 'com', 'cc', 'club', 'net', 'co', 'community'];

function slugifyLabel(value) {
	return cleanLower(value)
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}

function toCompactLabel(value) {
	return slugifyLabel(value).replace(/-/g, '');
}

function normalizedLabel(value) {
	return cleanLower(value).replace(/[^a-z0-9]/g, '');
}

export function buildSuggestedDomains({ query, group }) {
	const labels = new Set();
	const queryValue = cleanText(query);
	const groupSlug = cleanText(group?.slug);
	const groupName = cleanText(group?.name);
	const groupCity = cleanText(group?.city);
	const groupState = cleanText(group?.state_region);

	const addLabelVariants = (value) => {
		const hyphen = slugifyLabel(value);
		const compact = toCompactLabel(value);
		if (hyphen.length >= 3) labels.add(hyphen);
		if (compact.length >= 3) labels.add(compact);
	};

	addLabelVariants(queryValue);
	addLabelVariants(groupSlug);
	addLabelVariants(groupName);
	if (groupCity) {
		addLabelVariants(groupCity);
		addLabelVariants(`${groupName} ${groupCity}`);
	}
	if (groupState) {
		addLabelVariants(`${groupSlug} ${groupState}`);
	}

	const filtered = Array.from(labels)
		.filter((label) => label.length >= 3 && label.length <= 63)
		.filter((label) => /^[a-z0-9-]+$/.test(label))
		.filter((label) => !label.startsWith('-') && !label.endsWith('-'))
		.slice(0, 10);

	const domains = new Set();
	for (const label of filtered) {
		for (const tld of DEFAULT_TLDS) {
			domains.add(`${label}.${tld}`);
		}
	}

	return Array.from(domains).slice(0, 50);
}

function normalizeContactInformation(raw = {}) {
	const normalized = {
		firstName: cleanText(raw.firstName || raw.first_name),
		lastName: cleanText(raw.lastName || raw.last_name),
		email: cleanLower(raw.email),
		phone: cleanText(raw.phone),
		address1: cleanText(raw.address1 || raw.address_1),
		address2: cleanText(raw.address2 || raw.address_2),
		city: cleanText(raw.city),
		state: cleanText(raw.state),
		zip: cleanText(raw.zip || raw.postalCode || raw.postal_code),
		country: cleanUpperCountry(raw.country),
		companyName: cleanText(raw.companyName || raw.company_name)
	};
	return normalized;
}

function cleanUpperCountry(value) {
	return cleanText(value).toUpperCase().slice(0, 2);
}

function validateContactInformation(contactInfo) {
	const requiredFields = [
		['firstName', 'First name'],
		['lastName', 'Last name'],
		['email', 'Email'],
		['phone', 'Phone'],
		['address1', 'Address line 1'],
		['city', 'City'],
		['state', 'State'],
		['zip', 'Postal code'],
		['country', 'Country']
	];
	for (const [field, label] of requiredFields) {
		if (!cleanText(contactInfo[field])) {
			throw new Error(`${label} is required to register a domain.`);
		}
	}
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactInfo.email)) {
		throw new Error('Please provide a valid email for domain registration.');
	}
	const phoneDigits = digitsOnly(contactInfo.phone);
	if (phoneDigits.length < 8) {
		throw new Error('Please provide a valid phone number for domain registration.');
	}
	if (!/^[A-Z]{2}$/.test(contactInfo.country)) {
		throw new Error('Country must be a 2-letter ISO country code (for example: US).');
	}
}

async function getMainStripeConnectedAccount(serviceSupabase) {
	const { data, error } = await serviceSupabase
		.from('donation_accounts')
		.select('id,stripe_account_id,charges_enabled')
		.eq('id', 'main')
		.maybeSingle();
	if (error) throw error;

	const connectedAccountId = cleanText(data?.stripe_account_id);
	if (!connectedAccountId) {
		throw new Error('Main Stripe account is not connected yet.');
	}
	if (data?.charges_enabled !== true) {
		throw new Error('Main Stripe account is connected but not ready for charges yet.');
	}
	return connectedAccountId;
}

export async function listGroupSiteDomains(serviceSupabase, groupId) {
	const { data } = await serviceSupabase
		.from('group_site_domains')
		.select('*')
		.eq('group_id', groupId)
		.order('created_at', { ascending: false });
	return Array.isArray(data) ? data : [];
}

export async function listGroupSiteDomainOrders(serviceSupabase, groupId, limit = 30) {
	const { data } = await serviceSupabase
		.from('group_site_domain_orders')
		.select('*')
		.eq('group_id', groupId)
		.order('created_at', { ascending: false })
		.limit(limit);
	return Array.isArray(data) ? data : [];
}

export async function attachExistingDomainToGroup({ serviceSupabase, group, userId, domain }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!normalizedDomain) throw new Error('Domain is required.');
	const projectDomain = await addDomainToMicrositeProject(normalizedDomain);
	const config = await getDomainConfigForProject(normalizedDomain).catch(() => null);

	const rowPayload = {
		group_id: group.id,
		domain: normalizedDomain,
		source: 'existing',
		status: projectDomain.verified ? 'active' : 'pending_dns',
		vercel_project_id: projectDomain.projectId || null,
		vercel_project_domain: normalizedDomain,
		vercel_verified: projectDomain.verified === true,
		verification: projectDomain.verification || [],
		dns_config: config || {},
		created_by_user_id: userId || null,
		updated_at: new Date().toISOString()
	};

	const { data, error } = await serviceSupabase
		.from('group_site_domains')
		.upsert(rowPayload, { onConflict: 'domain' })
		.select('*')
		.single();
	if (error) throw error;

	return {
		domain: data,
		instructions: {
			title: projectDomain.verified
				? 'Domain added and verified'
				: 'Domain added. Complete DNS verification',
			steps: projectDomain.verified
				? ['Your domain is verified in Vercel and now attached to this microsite.']
				: [
						'Add the DNS verification record below in your DNS provider.',
						'After DNS propagates, click Verify in the domain manager.',
						'Once verified, SSL will provision automatically in Vercel.'
					],
			records: projectDomain.dnsRecords
		}
	};
}

export async function verifyAttachedDomainForGroup({ serviceSupabase, domain }) {
	const normalizedDomain = normalizeDomain(domain);
	if (!normalizedDomain) throw new Error('Domain is required.');
	const verification = await verifyMicrositeProjectDomain(normalizedDomain);
	const config = await getDomainConfigForProject(normalizedDomain).catch(() => null);

	const status = verification.verified ? 'active' : 'pending_dns';
	const { data, error } = await serviceSupabase
		.from('group_site_domains')
		.update({
			status,
			vercel_verified: verification.verified === true,
			verification: verification.verification || [],
			dns_config: config || {},
			updated_at: new Date().toISOString()
		})
		.eq('domain', normalizedDomain)
		.select('*')
		.single();
	if (error) throw error;
	return data;
}

export async function searchDomainsForGroup({ query, group }) {
	const candidates = buildSuggestedDomains({ query, group });
	if (!candidates.length) return [];
	const availability = await searchBulkDomainAvailability(candidates);
	const availableDomains = availability.filter((item) => item.available).map((item) => item.domain);
	const rankedDomains = rankDomainResults(query, group, availableDomains).slice(0, 12);

	const results = [];
	for (const domain of rankedDomains) {
		try {
			const quote = await getDomainPriceQuote(domain, 1);
			const fees = computeDomainFees({
				basePurchasePriceCents: quote.purchasePriceCents,
				baseRenewalPriceCents: quote.renewalPriceCents
			});
			results.push({
				domain,
				years: quote.years,
				pricing: {
					purchase: fees.purchase,
					renewal: fees.renewal,
					basePurchaseCents: quote.purchasePriceCents,
					baseRenewalCents: quote.renewalPriceCents
				}
			});
		} catch {
			// Ignore quote failures for individual domains.
		}
	}
	return results;
}

function rankDomainResults(query, group, domains = []) {
	const queryLabel = normalizedLabel(query);
	const groupLabel = normalizedLabel(group?.slug || group?.name || '');
	const scored = domains.map((domain) => {
		const base = domain.split('.')[0] || '';
		const compact = normalizedLabel(base);
		let score = 0;
		if (queryLabel && compact === queryLabel) score += 8;
		if (queryLabel && compact.startsWith(queryLabel)) score += 4;
		if (groupLabel && compact === groupLabel) score += 6;
		if (groupLabel && compact.includes(groupLabel)) score += 2;
		if (domain.endsWith('.bike')) score += 3;
		if (domain.endsWith('.org')) score += 2;
		return { domain, score };
	});
	return scored.sort((a, b) => b.score - a.score).map((item) => item.domain);
}

export async function createDomainCheckoutForGroup({
	serviceSupabase,
	group,
	userId,
	payload,
	url
}) {
	const domain = normalizeDomain(payload?.domain);
	if (!domain) throw new Error('Domain is required.');
	const contactInformation = normalizeContactInformation(payload?.contactInformation || {});
	validateContactInformation(contactInformation);

	const quote = await getDomainPriceQuote(domain, 1);
	const fees = computeDomainFees({
		basePurchasePriceCents: quote.purchasePriceCents,
		baseRenewalPriceCents: quote.renewalPriceCents
	});
	const stripeConnectedAccountId = await getMainStripeConnectedAccount(serviceSupabase);
	const stripe = getStripeClient();
	const successUrl = `${resolvePublicBaseUrl(url)}/groups/${group.slug}/manage/site?domain_checkout=success&session_id={CHECKOUT_SESSION_ID}`;
	const cancelUrl = `${resolvePublicBaseUrl(url)}/groups/${group.slug}/manage/site?domain_checkout=cancel`;

	const session = await stripe.checkout.sessions.create(
		{
			mode: 'payment',
			customer_creation: 'always',
			payment_method_collection: 'always',
			success_url: successUrl,
			cancel_url: cancelUrl,
			allow_promotion_codes: false,
			billing_address_collection: 'required',
			customer_email: contactInformation.email || undefined,
			line_items: [
				{
					price_data: {
						currency: 'usd',
						product_data: {
							name: `Domain registration: ${domain}`,
							description: 'Base annual registrar price from Vercel Domains'
						},
						unit_amount: fees.purchase.baseCents
					},
					quantity: 1
				},
				{
					price_data: {
						currency: 'usd',
						product_data: {
							name: '3FP domain service fee',
							description: '3% + $0.50 platform fee'
						},
						unit_amount: fees.purchase.markupCents
					},
					quantity: 1
				},
				{
					price_data: {
						currency: 'usd',
						product_data: {
							name: 'Card processing fee',
							description: 'Estimated Stripe card processing fee'
						},
						unit_amount: fees.purchase.stripeFeeCents
					},
					quantity: 1
				}
			],
			payment_intent_data: {
				setup_future_usage: 'off_session',
				metadata: {
					context: 'group_site_domain_order',
					group_id: group.id,
					domain
				}
			},
			metadata: {
				context: 'group_site_domain_order',
				group_id: group.id,
				group_slug: group.slug,
				domain
			}
		},
		{ stripeAccount: stripeConnectedAccountId }
	);

	const rowPayload = {
		group_id: group.id,
		requested_domain: domain,
		status: 'checkout_pending',
		years: 1,
		currency: 'USD',
		base_price_cents: fees.purchase.baseCents,
		markup_cents: fees.purchase.markupCents,
		stripe_fee_cents: fees.purchase.stripeFeeCents,
		total_cents: fees.purchase.totalCents,
		contact_information: contactInformation,
		price_snapshot: {
			quote,
			fees
		},
		stripe_connected_account_id: stripeConnectedAccountId,
		stripe_checkout_session_id: session.id,
		receipt_email: contactInformation.email || null,
		created_by_user_id: userId || null,
		updated_at: new Date().toISOString()
	};

	const { data, error } = await serviceSupabase
		.from('group_site_domain_orders')
		.insert(rowPayload)
		.select('*')
		.single();
	if (error) throw error;

	return {
		order: data,
		checkoutUrl: cleanText(session.url)
	};
}

export async function finalizeDomainOrderByCheckoutSessionId({
	serviceSupabase,
	sessionId,
	fetch: fetchImpl
}) {
	const checkoutSessionId = cleanText(sessionId);
	if (!checkoutSessionId) return { ok: false, matched: false, reason: 'missing_session_id' };

	const { data: order } = await serviceSupabase
		.from('group_site_domain_orders')
		.select('*')
		.eq('stripe_checkout_session_id', checkoutSessionId)
		.maybeSingle();
	if (!order) return { ok: true, matched: false, reason: 'order_not_found' };
	if (['registered', 'failed', 'refunded', 'cancelled'].includes(cleanLower(order.status))) {
		return { ok: true, matched: true, reason: 'already_terminal' };
	}

	const stripe = getStripeClient();
	const fallbackConnectedAccountId = await getMainStripeConnectedAccount(serviceSupabase).catch(
		() => ''
	);
	const stripeConnectedAccountId =
		cleanText(order.stripe_connected_account_id) || fallbackConnectedAccountId;
	const stripeOptions = stripeConnectedAccountId
		? { stripeAccount: stripeConnectedAccountId }
		: undefined;
	const session = await stripe.checkout.sessions.retrieve(
		checkoutSessionId,
		{ expand: ['payment_intent'] },
		stripeOptions
	);

	const paymentStatus = cleanLower(session?.payment_status);
	if (paymentStatus !== 'paid') {
		await serviceSupabase
			.from('group_site_domain_orders')
			.update({
				status: 'failed',
				last_error: `Checkout session is not paid (status: ${paymentStatus || 'unknown'}).`,
				updated_at: new Date().toISOString()
			})
			.eq('id', order.id);
		return { ok: true, matched: true, reason: 'session_not_paid' };
	}

	const paymentIntentId =
		typeof session.payment_intent === 'string'
			? session.payment_intent
			: cleanText(session.payment_intent?.id);
	let paymentMethodId = '';
	if (paymentIntentId) {
		const paymentIntent = await stripe.paymentIntents.retrieve(
			paymentIntentId,
			{},
			stripeOptions
		);
		paymentMethodId =
			typeof paymentIntent.payment_method === 'string'
				? paymentIntent.payment_method
				: cleanText(paymentIntent.payment_method?.id);
	}

	const contactInformation = order.contact_information || {};
	const domain = normalizeDomain(order.requested_domain);

	await serviceSupabase
		.from('group_site_domain_orders')
		.update({
			status: 'registering',
			stripe_connected_account_id: stripeConnectedAccountId || null,
			stripe_payment_intent_id: paymentIntentId || null,
			stripe_customer_id: cleanText(session.customer) || null,
			stripe_payment_method_id: paymentMethodId || null,
			paid_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', order.id);

	try {
		const registration = await buyDomainWithVercel({
			domain,
			years: order.years || 1,
			autoRenew: true,
			expectedPriceCents: order.base_price_cents,
			contactInformation
		});
		const projectDomain = await addDomainToMicrositeProject(domain);
		const config = await getDomainConfigForProject(domain).catch(() => null);

		const { data: domainRow } = await serviceSupabase
			.from('group_site_domains')
			.upsert(
				{
					group_id: order.group_id,
					domain,
					source: 'registered',
					status: projectDomain.verified ? 'active' : 'provisioning',
					vercel_project_domain: domain,
					vercel_order_id: registration.orderId || null,
					vercel_verified: projectDomain.verified === true,
					verification: projectDomain.verification || [],
					dns_config: config || {},
					auto_renew: true,
					renewal_enabled: true,
					renewal_status: 'active',
					base_renewal_price_cents: order.base_price_cents || null,
					renewal_markup_cents: order.markup_cents || null,
					renewal_stripe_fee_cents: order.stripe_fee_cents || null,
					next_renewal_charge_cents: order.total_cents || null,
					stripe_connected_account_id: stripeConnectedAccountId || null,
					stripe_customer_id: cleanText(session.customer) || null,
					stripe_payment_method_id: paymentMethodId || null,
					created_by_user_id: order.created_by_user_id || null,
					updated_at: new Date().toISOString()
				},
				{ onConflict: 'domain' }
			)
			.select('*')
			.single();

		await serviceSupabase
			.from('group_site_domain_orders')
			.update({
				status: 'registered',
				domain_id: domainRow?.id || null,
				vercel_order_id: registration.orderId || null,
				fulfilled_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', order.id);

		await serviceSupabase.from('group_site_domain_events').insert({
			group_id: order.group_id,
			domain_id: domainRow?.id || null,
			order_id: order.id,
			provider: 'system',
			event_type: 'domain_order_registered',
			payload: {
				checkoutSessionId,
				domain,
				vercelOrderId: registration.orderId || null
			}
		});

		if (cleanText(order.receipt_email)) {
			await sendDomainReceiptEmail({
				to: order.receipt_email,
				domain,
				totalCents: order.total_cents,
				fetch: fetchImpl
			}).catch((error) => {
				console.error('Failed to send domain receipt email', error);
			});
		}

		return { ok: true, matched: true, reason: 'registered', domain };
	} catch (error) {
		await serviceSupabase
			.from('group_site_domain_orders')
			.update({
				status: 'failed',
				last_error: error?.message || 'Failed to register domain after payment.',
				updated_at: new Date().toISOString()
			})
			.eq('id', order.id);
		await serviceSupabase.from('group_site_domain_events').insert({
			group_id: order.group_id,
			order_id: order.id,
			provider: 'system',
			event_type: 'domain_order_failed',
			processing_status: 'failed',
			error_message: error?.message || 'Domain order registration failed',
			payload: {
				checkoutSessionId,
				domain
			}
		});
		return {
			ok: false,
			matched: true,
			reason: 'registration_failed',
			error: error?.message || 'Domain registration failed.'
		};
	}
}

async function sendDomainReceiptEmail({ to, domain, totalCents, fetch: fetchImpl }) {
	const amount = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	}).format(toCents(totalCents) / 100);

	const subject = `Your domain order receipt for ${domain}`;
	const text = [
		`Thank you for your order.`,
		``,
		`Domain: ${domain}`,
		`Total charged: ${amount}`,
		``,
		`We are provisioning the domain and SSL certificate now.`
	].join('\n');

	const html = [
		`<p>Thank you for your order.</p>`,
		`<p><strong>Domain:</strong> ${domain}<br/><strong>Total charged:</strong> ${amount}</p>`,
		`<p>We are provisioning the domain and SSL certificate now.</p>`
	].join('');

	return sendEmail(
		{
			to,
			subject,
			text,
			html,
			tags: [{ Name: 'context', Value: 'group-site-domain-receipt' }]
		},
		{ fetch: fetchImpl }
	);
}

export async function setDomainAutoRenewForGroup({ serviceSupabase, groupId, domain, autoRenew }) {
	const normalizedDomain = normalizeDomain(domain);
	await updateVercelDomainAutoRenew({ domain: normalizedDomain, autoRenew });
	const { data, error } = await serviceSupabase
		.from('group_site_domains')
		.update({
			auto_renew: autoRenew === true,
			renewal_enabled: autoRenew === true,
			renewal_status: autoRenew === true ? 'active' : 'paused',
			updated_at: new Date().toISOString()
		})
		.eq('group_id', groupId)
		.eq('domain', normalizedDomain)
		.select('*')
		.single();
	if (error) throw error;
	return data;
}

export async function createDomainBillingPortalSession({
	serviceSupabase,
	domainRow,
	groupSlug,
	url
}) {
	const customerId = cleanText(domainRow?.stripe_customer_id);
	if (!customerId) {
		throw new Error('No Stripe customer found for this domain yet.');
	}
	const fallbackConnectedAccountId = serviceSupabase
		? await getMainStripeConnectedAccount(serviceSupabase).catch(() => '')
		: '';
	const stripeConnectedAccountId =
		cleanText(domainRow?.stripe_connected_account_id) || fallbackConnectedAccountId;
	if (!stripeConnectedAccountId) {
		throw new Error('No Stripe connected account is configured for this domain.');
	}
	const stripe = getStripeClient();
	const returnUrl = `${resolvePublicBaseUrl(url)}/groups/${groupSlug}/manage/site`;
	const session = await stripe.billingPortal.sessions.create(
		{
			customer: customerId,
			return_url: returnUrl
		},
		{ stripeAccount: stripeConnectedAccountId }
	);
	return cleanText(session.url);
}
