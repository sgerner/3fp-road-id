import { sendEmail } from '$lib/services/email';
import {
	ANONYMITY_NOTICE,
	GROUP_TAX_NOTICE,
	MAIN_ORG_DONATION_ACCOUNT_ID,
	MAIN_ORG_TAX_NOTICE
} from '$lib/donations/constants';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';
import {
	createSignedConnectState,
	getStripeClient,
	resolvePublicBaseUrl,
	verifySignedConnectState
} from '$lib/server/stripe';

function normalizeEmail(value) {
	if (!value || typeof value !== 'string') return '';
	const trimmed = value.trim().toLowerCase();
	return /^\S+@\S+\.\S+$/.test(trimmed) ? trimmed : '';
}

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const trimmed = String(value).trim();
	if (!maxLength) return trimmed;
	return trimmed.slice(0, maxLength);
}

function normalizeAmountToCents(value) {
	const amount = Number(value);
	if (!Number.isFinite(amount)) return null;
	const cents = Math.round(amount * 100);
	if (cents < 100 || cents > 2500000) return null;
	return cents;
}

function formatCents(cents, currency = 'usd') {
	const amount = Number(cents || 0) / 100;
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency.toUpperCase()
		}).format(amount);
	} catch {
		return `$${amount.toFixed(2)}`;
	}
}

export function buildGroupDonationAccountId(groupId) {
	return `group:${groupId}`;
}

async function getAuthContext(cookies) {
	const { accessToken, user } = resolveSession(cookies);
	const userId = user?.id ?? null;
	if (!accessToken || !userId) return null;

	const supabase = createRequestSupabaseClient(accessToken);
	let isAdmin = false;
	try {
		const { data: profile } = await supabase
			.from('profiles')
			.select('admin')
			.eq('user_id', userId)
			.maybeSingle();
		isAdmin = profile?.admin === true;
	} catch {
		isAdmin = false;
	}

	return { accessToken, userId, supabase, isAdmin };
}

export async function requireMainDonationManager(cookies) {
	const auth = await getAuthContext(cookies);
	if (!auth) return { ok: false, status: 401, error: 'Authentication required.' };
	if (!auth.isAdmin) return { ok: false, status: 403, error: 'Admin access required.' };
	return { ok: true, ...auth };
}

export async function requireGroupDonationManager(cookies, groupSlug) {
	const auth = await getAuthContext(cookies);
	if (!auth) return { ok: false, status: 401, error: 'Authentication required.' };
	const slug = cleanText(groupSlug);
	if (!slug) return { ok: false, status: 400, error: 'Group slug is required.' };

	const { data: group, error: groupError } = await auth.supabase
		.from('groups')
		.select('id,slug,name')
		.eq('slug', slug)
		.maybeSingle();
	if (groupError) return { ok: false, status: 500, error: groupError.message };
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	if (!auth.isAdmin) {
		const { data: ownerRows, error: ownerError } = await auth.supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('role', 'owner')
			.eq('user_id', auth.userId)
			.limit(1);
		if (ownerError) return { ok: false, status: 500, error: ownerError.message };
		if (!ownerRows || ownerRows.length === 0) {
			return { ok: false, status: 403, error: 'You do not have permission to manage this group.' };
		}
	}

	return { ok: true, ...auth, group };
}

function buildConnectReturnPath(target) {
	if (!target || target.type === 'main') return '/donate?manage=1';
	if (target.type === 'group') return `/groups/${encodeURIComponent(target.slug)}/edit`;
	return '/donate';
}

export function createConnectStateToken(target, userId) {
	return createSignedConnectState({
		type: target?.type === 'group' ? 'group' : 'main',
		slug: target?.slug || null,
		userId
	});
}

export function parseConnectStateToken(stateToken) {
	return verifySignedConnectState(stateToken);
}

async function getServiceSupabase() {
	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
	}
	return supabase;
}

export async function upsertDonationAccountForMain(stripeAccount) {
	const supabase = await getServiceSupabase();
	const accountId = cleanText(stripeAccount?.id);
	if (!accountId) throw new Error('Stripe account id is required.');

	const { error } = await supabase.from('donation_accounts').upsert(
		{
			id: MAIN_ORG_DONATION_ACCOUNT_ID,
			recipient_type: 'organization',
			group_id: null,
			display_name: '3 Feet Please',
			stripe_account_id: accountId,
			stripe_account_email: stripeAccount?.email || null,
			charges_enabled: stripeAccount?.charges_enabled === true,
			payouts_enabled: stripeAccount?.payouts_enabled === true,
			connected_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'id' }
	);
	if (error) throw new Error(error.message);
}

export async function upsertDonationAccountForGroup(group, stripeAccount) {
	const supabase = await getServiceSupabase();
	const accountId = cleanText(stripeAccount?.id);
	if (!accountId) throw new Error('Stripe account id is required.');
	if (!group?.id) throw new Error('Group is required.');

	const { error } = await supabase.from('donation_accounts').upsert(
		{
			id: buildGroupDonationAccountId(group.id),
			recipient_type: 'group',
			group_id: group.id,
			display_name: group.name,
			stripe_account_id: accountId,
			stripe_account_email: stripeAccount?.email || null,
			charges_enabled: stripeAccount?.charges_enabled === true,
			payouts_enabled: stripeAccount?.payouts_enabled === true,
			connected_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'id' }
	);
	if (error) throw new Error(error.message);
}

export async function clearDonationAccountConnection(accountId) {
	const supabase = await getServiceSupabase();
	const cleaned = cleanText(accountId);
	if (!cleaned) throw new Error('Donation account id is required.');

	const { error } = await supabase
		.from('donation_accounts')
		.update({
			stripe_account_id: null,
			stripe_account_email: null,
			charges_enabled: false,
			payouts_enabled: false,
			connected_at: null,
			updated_at: new Date().toISOString()
		})
		.eq('id', cleaned);
	if (error) throw new Error(error.message);
}

export async function getDonationRecipient({ recipientType, groupSlug }) {
	const supabase = await getServiceSupabase();
	const target = recipientType === 'group' ? 'group' : 'main';

	if (target === 'main') {
		const { data: donationAccount, error: accountError } = await supabase
			.from('donation_accounts')
			.select('*')
			.eq('id', MAIN_ORG_DONATION_ACCOUNT_ID)
			.maybeSingle();
		if (accountError) throw new Error(accountError.message);
		return {
			type: 'main',
			label: '3 Feet Please',
			group: null,
			donationAccount
		};
	}

	const slug = cleanText(groupSlug);
	if (!slug) throw new Error('Group slug is required.');

	const { data: group, error: groupError } = await supabase
		.from('groups')
		.select('id,slug,name,public_contact_email')
		.eq('slug', slug)
		.maybeSingle();
	if (groupError) throw new Error(groupError.message);
	if (!group) throw new Error('Group not found.');

	const { count: ownerCount, error: ownerError } = await supabase
		.from('group_members')
		.select('user_id', { count: 'exact', head: true })
		.eq('group_id', group.id)
		.eq('role', 'owner');
	if (ownerError) throw new Error(ownerError.message);

	const { data: donationAccount, error: accountError } = await supabase
		.from('donation_accounts')
		.select('*')
		.eq('group_id', group.id)
		.maybeSingle();
	if (accountError) throw new Error(accountError.message);

	return {
		type: 'group',
		label: group.name,
		group,
		claimed: (ownerCount ?? 0) > 0,
		donationAccount
	};
}

export async function createDonationCheckout({
	requestUrl,
	recipientType,
	groupSlug,
	amount,
	donorName,
	donorEmail,
	donorMessage,
	requestAnonymity
}) {
	const amountCents = normalizeAmountToCents(amount);
	if (!amountCents) {
		return { ok: false, status: 400, error: 'Donation amount must be between $1 and $25,000.' };
	}

	const normalizedDonorName = cleanText(donorName, 120);
	const normalizedDonorEmail = normalizeEmail(donorEmail);
	const normalizedMessage = cleanText(donorMessage, 1000);
	const wantsAnonymity = requestAnonymity === true;
	if (!normalizedDonorEmail) {
		return {
			ok: false,
			status: 400,
			error: 'A valid donor email is required so we can send your confirmation.'
		};
	}

	const recipient = await getDonationRecipient({ recipientType, groupSlug });
	if (recipient.type === 'group' && !recipient.claimed) {
		return { ok: false, status: 400, error: 'This group has not been claimed yet.' };
	}

	const donationAccount = recipient.donationAccount;
	if (!donationAccount?.stripe_account_id) {
		return { ok: false, status: 409, error: 'This recipient has not connected Stripe yet.' };
	}
	if (!donationAccount?.charges_enabled) {
		return {
			ok: false,
			status: 409,
			error: 'Stripe account is connected but not ready to accept charges yet.'
		};
	}

	const baseUrl = resolvePublicBaseUrl(requestUrl);
	if (!baseUrl) {
		return { ok: false, status: 500, error: 'PUBLIC_URL_BASE is not configured.' };
	}

	const stripe = getStripeClient();
	const groupParam =
		recipient.type === 'group' && recipient.group?.slug
			? `group=${encodeURIComponent(recipient.group.slug)}&`
			: '';

	const session = await stripe.checkout.sessions.create(
		{
			mode: 'payment',
			submit_type: 'donate',
			customer_email: normalizedDonorEmail,
			success_url: `${baseUrl}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${baseUrl}/donate?${groupParam}canceled=1`,
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency: 'usd',
						unit_amount: amountCents,
						product_data: {
							name: `Donation to ${recipient.label}`,
							description:
								recipient.type === 'main'
									? '501(c)(3) charitable donation'
									: 'Community support donation'
						}
					}
				}
			],
			metadata: {
				recipient_type: recipient.type,
				recipient_slug: recipient.group?.slug || '',
				recipient_name: recipient.label,
				donor_name: normalizedDonorName,
				donor_email: normalizedDonorEmail,
				request_anonymity: wantsAnonymity ? '1' : '0'
			},
			payment_intent_data: {
				metadata: {
					recipient_type: recipient.type,
					recipient_slug: recipient.group?.slug || '',
					request_anonymity: wantsAnonymity ? '1' : '0'
				}
			}
		},
		{ stripeAccount: donationAccount.stripe_account_id }
	);

	const supabase = await getServiceSupabase();
	const { error: insertError } = await supabase.from('donations').insert({
		stripe_checkout_session_id: session.id,
		donation_account_id: donationAccount.id,
		recipient_type: recipient.type === 'group' ? 'group' : 'organization',
		recipient_group_id: recipient.group?.id || null,
		recipient_display_name: recipient.label,
		recipient_contact_email:
			recipient.type === 'group'
				? normalizeEmail(recipient.group?.public_contact_email) || null
				: null,
		connected_account_id: donationAccount.stripe_account_id,
		amount_total_cents: amountCents,
		currency: 'usd',
		donor_name: normalizedDonorName || null,
		donor_email: normalizedDonorEmail || null,
		donor_message: normalizedMessage || null,
		donor_requested_anonymity: wantsAnonymity,
		status: 'pending',
		updated_at: new Date().toISOString()
	});
	if (insertError) {
		return { ok: false, status: 500, error: insertError.message };
	}

	return { ok: true, checkoutUrl: session.url };
}

async function resolveGroupOwnerEmails(supabase, groupId) {
	const { data: ownerRows, error: ownerError } = await supabase
		.from('group_members')
		.select('user_id')
		.eq('group_id', groupId)
		.eq('role', 'owner');
	if (ownerError || !ownerRows?.length) return [];

	const ownerIds = ownerRows.map((row) => row.user_id).filter(Boolean);
	if (!ownerIds.length) return [];

	const { data: profileRows, error: profileError } = await supabase
		.from('profiles')
		.select('email')
		.in('user_id', ownerIds);
	if (profileError || !profileRows?.length) return [];

	return Array.from(new Set(profileRows.map((row) => normalizeEmail(row.email)).filter(Boolean)));
}

async function resolveRecipientEmails(supabase, donationRow) {
	if (donationRow.recipient_type === 'organization') {
		const { data: adminRows, error: adminError } = await supabase
			.from('profiles')
			.select('email')
			.eq('admin', true);
		if (adminError || !adminRows?.length) return [];
		return Array.from(new Set(adminRows.map((row) => normalizeEmail(row.email)).filter(Boolean)));
	}

	const emails = [];
	const publicEmail = normalizeEmail(donationRow.recipient_contact_email);
	if (publicEmail) emails.push(publicEmail);
	if (emails.length) return emails;
	if (!donationRow.recipient_group_id) return [];
	return resolveGroupOwnerEmails(supabase, donationRow.recipient_group_id);
}

function buildDonorEmailContent(donationRow) {
	const amount = formatCents(donationRow.amount_total_cents, donationRow.currency);
	const taxNotice =
		donationRow.recipient_type === 'organization' ? MAIN_ORG_TAX_NOTICE : GROUP_TAX_NOTICE;
	const htmlParts = [
		`Thanks for your donation to <strong>${donationRow.recipient_display_name}</strong>.`,
		`<strong>Amount:</strong> ${amount}`,
		taxNotice
	];
	if (donationRow.donor_requested_anonymity)
		htmlParts.push(`<strong>Anonymity request:</strong> ${ANONYMITY_NOTICE}`);
	if (donationRow.donor_message)
		htmlParts.push(`<strong>Your message:</strong><br />${donationRow.donor_message}`);

	return {
		subject: `Donation confirmation: ${donationRow.recipient_display_name}`,
		html: htmlParts.map((section) => `<p>${section}</p>`).join(''),
		text: [
			`Thanks for your donation to ${donationRow.recipient_display_name}.`,
			`Amount: ${amount}`,
			'',
			taxNotice,
			donationRow.donor_requested_anonymity ? `\nAnonymity request: ${ANONYMITY_NOTICE}` : '',
			donationRow.donor_message ? `\nYour message: ${donationRow.donor_message}` : ''
		]
			.filter(Boolean)
			.join('\n')
	};
}

function buildRecipientEmailContent(donationRow) {
	const amount = formatCents(donationRow.amount_total_cents, donationRow.currency);
	const donorLabel = donationRow.donor_requested_anonymity
		? 'Anonymous donor (privacy requested)'
		: donationRow.donor_name || donationRow.donor_email || 'Unnamed donor';
	const donorEmailLine =
		!donationRow.donor_requested_anonymity && donationRow.donor_email
			? `<p><strong>Donor email:</strong> ${donationRow.donor_email}</p>`
			: '';
	const donorMessageLine = donationRow.donor_message
		? `<p><strong>Donor message:</strong><br />${donationRow.donor_message}</p>`
		: '';
	const anonymityLine = donationRow.donor_requested_anonymity
		? `<p><strong>Anonymity request:</strong> ${ANONYMITY_NOTICE}</p>`
		: '';

	return {
		subject: `New donation received: ${donationRow.recipient_display_name}`,
		html: `<p>Your organization received a new donation.</p><p><strong>Amount:</strong> ${amount}</p><p><strong>Donor:</strong> ${donorLabel}</p>${donorEmailLine}${donorMessageLine}${anonymityLine}`,
		text: [
			`Your organization received a new donation.`,
			`Amount: ${amount}`,
			`Donor: ${donorLabel}`,
			!donationRow.donor_requested_anonymity && donationRow.donor_email
				? `Donor email: ${donationRow.donor_email}`
				: '',
			donationRow.donor_message ? `Donor message: ${donationRow.donor_message}` : '',
			donationRow.donor_requested_anonymity ? `Anonymity request: ${ANONYMITY_NOTICE}` : ''
		]
			.filter(Boolean)
			.join('\n')
	};
}

export async function finalizeDonationBySessionId(sessionId, fetchImpl) {
	const cleanedSessionId = cleanText(sessionId, 255);
	if (!cleanedSessionId) {
		return { ok: false, status: 400, error: 'Missing session id.' };
	}

	const supabase = await getServiceSupabase();
	const { data: donationRow, error: donationError } = await supabase
		.from('donations')
		.select('*')
		.eq('stripe_checkout_session_id', cleanedSessionId)
		.maybeSingle();
	if (donationError) return { ok: false, status: 500, error: donationError.message };
	if (!donationRow) return { ok: false, status: 404, error: 'Donation record not found.' };

	const stripe = getStripeClient();
	let session = null;
	try {
		session = await stripe.checkout.sessions.retrieve(
			cleanedSessionId,
			{ expand: ['payment_intent'] },
			{ stripeAccount: donationRow.connected_account_id }
		);
	} catch (error) {
		return { ok: false, status: 502, error: 'Unable to verify Stripe session.' };
	}

	const paymentIntentId =
		typeof session.payment_intent === 'string'
			? session.payment_intent
			: session.payment_intent?.id || null;
	const paid = session.payment_status === 'paid';
	const nextStatus = paid ? 'paid' : session.status === 'expired' ? 'expired' : donationRow.status;
	const amountTotal = Number(session.amount_total ?? donationRow.amount_total_cents);
	const currency = cleanText(session.currency || donationRow.currency || 'usd', 10).toLowerCase();

	const donorEmail = normalizeEmail(session.customer_details?.email || donationRow.donor_email);
	const donorName = cleanText(session.customer_details?.name || donationRow.donor_name, 120);

	const updatePayload = {
		status: nextStatus,
		stripe_payment_intent_id: paymentIntentId,
		amount_total_cents:
			Number.isFinite(amountTotal) && amountTotal > 0
				? amountTotal
				: donationRow.amount_total_cents,
		currency: currency || 'usd',
		donor_email: donorEmail || donationRow.donor_email || null,
		donor_name: donorName || donationRow.donor_name || null,
		paid_at: paid ? new Date().toISOString() : donationRow.paid_at,
		updated_at: new Date().toISOString()
	};

	const { data: updatedRows, error: updateError } = await supabase
		.from('donations')
		.update(updatePayload)
		.eq('id', donationRow.id)
		.select('*')
		.limit(1);
	if (updateError) return { ok: false, status: 500, error: updateError.message };
	const current = updatedRows?.[0] ?? { ...donationRow, ...updatePayload };

	if (!paid) {
		return { ok: true, paid: false, donation: current };
	}

	if (!current.donor_receipt_sent_at && donorEmail) {
		const donorEmailContent = buildDonorEmailContent(current);
		try {
			await sendEmail(
				{
					to: donorEmail,
					subject: donorEmailContent.subject,
					html: donorEmailContent.html,
					text: donorEmailContent.text,
					tags: [{ Name: 'context', Value: 'donation-confirmation' }]
				},
				{ fetch: fetchImpl }
			);
			await supabase
				.from('donations')
				.update({
					donor_receipt_sent_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.eq('id', current.id)
				.is('donor_receipt_sent_at', null);
		} catch (error) {
			console.error('Failed to send donor donation email', error);
		}
	}

	if (!current.recipient_notice_sent_at) {
		const recipientEmails = await resolveRecipientEmails(supabase, current);
		if (recipientEmails.length) {
			const recipientContent = buildRecipientEmailContent(current);
			try {
				await sendEmail(
					{
						to: recipientEmails,
						subject: recipientContent.subject,
						html: recipientContent.html,
						text: recipientContent.text,
						tags: [{ Name: 'context', Value: 'donation-notification' }]
					},
					{ fetch: fetchImpl }
				);
				await supabase
					.from('donations')
					.update({
						recipient_notice_sent_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					})
					.eq('id', current.id)
					.is('recipient_notice_sent_at', null);
			} catch (error) {
				console.error('Failed to send recipient donation email', error);
			}
		}
	}

	const { data: reloadedDonation } = await supabase
		.from('donations')
		.select('*')
		.eq('id', current.id)
		.maybeSingle();

	return { ok: true, paid: true, donation: reloadedDonation ?? current };
}

export { cleanText, normalizeAmountToCents, buildConnectReturnPath };
