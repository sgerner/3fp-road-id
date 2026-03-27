import { sendEmail } from '$lib/services/email';
import { resolveSession } from '$lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { getStripeClient, resolvePublicBaseUrl } from '$lib/server/stripe';
import { PUBLIC_URL_BASE } from '$env/static/public';

const MANAGER_ROLES = ['owner', 'admin'];
const DEFAULT_POLICY_MARKDOWN = `By joining, you agree to this membership policy.

Cancellation:
- You can cancel anytime.
- Cancellation takes effect at the end of your current billing cycle.

Refunds:
- Payments are non-refundable unless required by law.

Questions:
- Contact group organizers through the group page.`;

const DEFAULT_PROGRAM = {
	enabled: true,
	access_mode: 'public',
	cta_label: 'Follow',
	contribution_mode: 'donation',
	policy_markdown: DEFAULT_POLICY_MARKDOWN,
	policy_version: 1,
	policy_updated_at: null,
	default_tier_id: null
};

const PROGRAM_ACCESS_MODES = new Set(['public', 'private_request']);
const PROGRAM_CONTRIBUTION_MODES = new Set(['paid', 'donation']);
const BILLING_TYPES = new Set(['one_time', 'recurring']);
const INTERVAL_UNITS = new Set(['month', 'year']);
const APPLICATION_STATUSES = new Set([
	'submitted',
	'under_review',
	'approved',
	'rejected',
	'withdrawn',
	'payment_pending',
	'completed'
]);
const MEMBERSHIP_STATUSES = new Set(['active', 'past_due', 'cancelled', 'expired', 'paused']);
const DEFAULT_APPLICATION_FIELDS = [
	{
		field_type: 'textarea',
		label: 'What got you interested in joining us?',
		help_text: 'Optional, but helpful for organizers.',
		required: true,
		sort_order: 10
	}
];
const DEFAULT_MEMBERSHIP_TIER_TEMPLATES = [
	{
		name: 'Neighbor',
		description: 'Low friction entry point. Most members start here.',
		amount_cents: 0,
		annual_amount_cents: null,
		currency: 'usd',
		billing_type: 'one_time',
		interval_unit: null,
		interval_count: null,
		is_default: true,
		is_active: true,
		allow_custom_amount: false,
		min_amount_cents: null
	},
	{
		name: 'Supporter',
		description: 'A low-cost way to support the group.',
		amount_cents: 500,
		annual_amount_cents: 5000,
		currency: 'usd',
		billing_type: 'recurring',
		interval_unit: 'month',
		interval_count: 1,
		is_default: false,
		is_active: true,
		allow_custom_amount: false,
		min_amount_cents: null
	},
	{
		name: 'Advocate',
		description: 'A stronger recurring contribution tier.',
		amount_cents: 1500,
		annual_amount_cents: 15000,
		currency: 'usd',
		billing_type: 'recurring',
		interval_unit: 'month',
		interval_count: 1,
		is_default: false,
		is_active: true,
		allow_custom_amount: false,
		min_amount_cents: null
	},
	{
		name: 'Pay What You Want',
		description: 'Choose a custom monthly or annual amount.',
		amount_cents: 0,
		annual_amount_cents: 0,
		currency: 'usd',
		billing_type: 'recurring',
		interval_unit: 'month',
		interval_count: 1,
		is_default: false,
		is_active: true,
		allow_custom_amount: true,
		min_amount_cents: 0
	}
];

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const trimmed = String(value).trim();
	if (!maxLength) return trimmed;
	return trimmed.slice(0, maxLength);
}

function cleanNullableText(value, maxLength = 0) {
	const cleaned = cleanText(value, maxLength);
	return cleaned || null;
}

function normalizeBoolean(value, fallback = false) {
	if (typeof value === 'boolean') return value;
	if (value === 'true' || value === '1' || value === 1) return true;
	if (value === 'false' || value === '0' || value === 0) return false;
	return fallback;
}

function normalizeInteger(value, fallback = null) {
	if (value === null || value === undefined || value === '') return fallback;
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTimestamp(value, fallback = null) {
	if (!value) return fallback;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return fallback;
	return date.toISOString();
}

function normalizeCurrency(value) {
	const cleaned = cleanText(value || 'usd', 10).toLowerCase();
	return cleaned || 'usd';
}

function normalizeContributionMode(value, fallback = 'donation') {
	const cleaned = cleanText(value || '', 32).toLowerCase();
	if (cleaned === 'none') return 'donation';
	if (cleaned === 'required_fee') return 'paid';
	if (PROGRAM_CONTRIBUTION_MODES.has(cleaned)) return cleaned;
	return fallback;
}

function normalizeProfilePayload(profile) {
	if (!profile || typeof profile !== 'object') return null;
	const fullName = cleanText(profile.full_name || profile.fullName || '', 120);
	const email = sanitizeEmail(profile.email || '');
	const phone = cleanText(profile.phone || '', 40);
	if (!fullName && !email && !phone) return null;
	return {
		full_name: fullName || null,
		email: email || null,
		phone: phone || null
	};
}

function normalizeAmountCents(value, fallback = 0) {
	const parsed = Number.parseInt(String(value ?? fallback), 10);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return parsed;
}

function normalizeNullableAmountCents(value) {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return parsed;
}

function resolveTierBillingInterval(tier, requestedInterval = null) {
	const normalizedRequested = cleanText(requestedInterval || '', 16).toLowerCase();
	const monthlyAmount = normalizeNullableAmountCents(
		tier?.monthly_amount_cents ?? tier?.amount_cents
	);
	const annualAmount = normalizeNullableAmountCents(tier?.annual_amount_cents);
	const monthlyAvailable = monthlyAmount !== null || tier?.allow_custom_amount === true;
	const annualAvailable = annualAmount !== null || tier?.allow_custom_amount === true;

	if (normalizedRequested === 'year' && annualAvailable) return 'year';
	if (normalizedRequested === 'month' && monthlyAvailable) return 'month';
	if (monthlyAvailable) return 'month';
	if (annualAvailable) return 'year';
	return null;
}

function resolveTierAmountByInterval(tier, intervalUnit) {
	if (intervalUnit === 'year') return normalizeNullableAmountCents(tier?.annual_amount_cents);
	if (intervalUnit === 'month')
		return normalizeNullableAmountCents(tier?.monthly_amount_cents ?? tier?.amount_cents);
	return null;
}

function normalizeCustomAmountCents(value, minimumCents = 0) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	if (!Number.isFinite(parsed)) return null;
	if (parsed < minimumCents) return null;
	return parsed;
}

function plusInterval(fromDate, intervalUnit, intervalCount) {
	const base = new Date(fromDate);
	const safeCount = Number.isFinite(intervalCount) && intervalCount > 0 ? intervalCount : 1;
	if (intervalUnit === 'week') {
		base.setUTCDate(base.getUTCDate() + 7 * safeCount);
		return base;
	}
	if (intervalUnit === 'year') {
		base.setUTCFullYear(base.getUTCFullYear() + safeCount);
		return base;
	}
	base.setUTCMonth(base.getUTCMonth() + safeCount);
	return base;
}

function calculateRenewalDate(tier, fromDate = new Date()) {
	if (!tier || tier.billing_type !== 'recurring') return null;
	if (!INTERVAL_UNITS.has(tier.interval_unit || '')) return null;
	const count = normalizeInteger(tier.interval_count, 1) || 1;
	return plusInterval(fromDate, tier.interval_unit, count).toISOString();
}

function firstNameFromProfile(profile) {
	const full = cleanText(profile?.full_name || '', 120);
	if (!full) return 'Member';
	const [first] = full.split(/\s+/);
	return first || 'Member';
}

function sanitizeEmail(value) {
	const cleaned = cleanText(value, 320).toLowerCase();
	if (!cleaned) return '';
	return /^\S+@\S+\.\S+$/.test(cleaned) ? cleaned : '';
}

function formatDate(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	}).format(date);
}

function stripHtml(input) {
	if (!input) return '';
	return String(input)
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function renderTemplate(input, context) {
	if (!input) return '';
	let rendered = String(input);
	for (const [key, value] of Object.entries(context || {})) {
		const token = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
		rendered = rendered.replace(token, value ?? '');
	}
	return rendered;
}

function toIsoNow() {
	return new Date().toISOString();
}

function resolveAbsoluteUrl(path) {
	const base = String(PUBLIC_URL_BASE || process.env.PUBLIC_URL_BASE || '')
		.trim()
		.replace(/\/+$/, '');
	const route = `/${String(path || '').replace(/^\/+/, '')}`;
	return base ? `${base}${route}` : route;
}

function ownerPaymentEmailsEnabled(metadata, groupId) {
	const prefs =
		metadata &&
		typeof metadata === 'object' &&
		metadata.notification_preferences &&
		typeof metadata.notification_preferences === 'object'
			? metadata.notification_preferences
			: null;
	if (!prefs) return true;
	const paymentPrefs =
		prefs.membership_owner_payment_emails &&
		typeof prefs.membership_owner_payment_emails === 'object'
			? prefs.membership_owner_payment_emails
			: null;
	if (!paymentPrefs) return true;
	const groupPref = paymentPrefs[groupId];
	if (groupPref === false) return false;
	return true;
}

function isPaymentOwnerNotice(tags) {
	const list = Array.isArray(tags) ? tags : [];
	return list.some(
		(tag) =>
			tag &&
			typeof tag === 'object' &&
			String(tag.Name || '').toLowerCase() === 'context' &&
			String(tag.Value || '')
				.toLowerCase()
				.includes('membership-payment')
	);
}

function isMembershipMetadata(metadata) {
	if (!metadata || typeof metadata !== 'object') return false;
	return Boolean(metadata.membership_group_id && metadata.membership_user_id);
}

async function getServiceSupabase() {
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
	}
	return serviceSupabase;
}

async function getAuthContext(cookies) {
	const { accessToken, user } = resolveSession(cookies);
	if (!accessToken || !user?.id) return null;

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
	}

	const { data: profile } = await requestSupabase
		.from('profiles')
		.select('admin,email,full_name')
		.eq('user_id', user.id)
		.maybeSingle();

	return {
		accessToken,
		user,
		userId: user.id,
		userEmail: profile?.email || user.email || null,
		userName: profile?.full_name || null,
		isAdmin: profile?.admin === true,
		requestSupabase,
		serviceSupabase
	};
}

async function getViewerContext(cookies) {
	const { accessToken, user } = resolveSession(cookies);
	const requestSupabase = createRequestSupabaseClient(accessToken || null);
	let isAdmin = false;
	if (accessToken && user?.id) {
		const { data: profile } = await requestSupabase
			.from('profiles')
			.select('admin,email,full_name')
			.eq('user_id', user.id)
			.maybeSingle();
		isAdmin = profile?.admin === true;
		return {
			accessToken,
			user,
			userId: user.id,
			userEmail: profile?.email || user.email || null,
			userName: profile?.full_name || null,
			isAdmin,
			requestSupabase
		};
	}
	return {
		accessToken: null,
		user: null,
		userId: null,
		userEmail: null,
		userName: null,
		isAdmin: false,
		requestSupabase
	};
}

async function loadGroupBySlug(supabase, groupSlug) {
	const slug = cleanText(groupSlug, 120);
	if (!slug) return null;
	const { data, error } = await supabase
		.from('groups')
		.select('id,slug,name,website_url,social_links,public_contact_email')
		.eq('slug', slug)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function isGroupManager(requestSupabase, groupId, userId, isAdmin) {
	if (!groupId || !userId) return false;
	if (isAdmin) return true;
	const { data, error } = await requestSupabase
		.from('group_members')
		.select('user_id')
		.eq('group_id', groupId)
		.eq('user_id', userId)
		.in('role', MANAGER_ROLES)
		.limit(1);
	if (error) throw new Error(error.message);
	return Array.isArray(data) && data.length > 0;
}

async function resolveOwnerEmails(serviceSupabase, groupId, { paymentOnly = false } = {}) {
	const { data: ownerRows } = await serviceSupabase
		.from('group_members')
		.select('user_id')
		.eq('group_id', groupId)
		.eq('role', 'owner');

	const ownerIds = (ownerRows || []).map((row) => row.user_id).filter(Boolean);
	if (!ownerIds.length) return [];

	const { data: profiles } = await serviceSupabase
		.from('profiles')
		.select('user_id,email,metadata')
		.in('user_id', ownerIds);

	return Array.from(
		new Set(
			(profiles || [])
				.filter((row) => (paymentOnly ? ownerPaymentEmailsEnabled(row?.metadata, groupId) : true))
				.map((row) => sanitizeEmail(row.email))
				.filter(Boolean)
		)
	);
}

async function sendOwnerNotification({
	serviceSupabase,
	group,
	subject,
	html,
	text,
	tags,
	fetchImpl
}) {
	try {
		const paymentNotice = isPaymentOwnerNotice(tags);
		const emails = await resolveOwnerEmails(serviceSupabase, group.id, {
			paymentOnly: paymentNotice
		});
		if (!emails.length) return;
		await sendEmail(
			{
				to: emails,
				subject,
				html,
				text,
				tags: tags || [{ Name: 'context', Value: 'membership-owner-notice' }],
				branding: {
					category: 'Membership',
					recipientReason: `You manage ${group.name} memberships.`,
					actionUrl: paymentNotice
						? resolveAbsoluteUrl(
								`/groups/${group.slug}/manage/membership/unsubscribe-owner-payments`
							)
						: undefined,
					actionLabel: paymentNotice ? 'Unsubscribe from payment alerts' : undefined
				}
			},
			{ fetch: fetchImpl }
		);
	} catch (error) {
		console.error('Failed to send owner membership notification', error);
	}
}

async function sendUserNotification({ to, subject, html, text, tags, fetchImpl }) {
	const email = sanitizeEmail(to);
	if (!email) return;
	try {
		await sendEmail(
			{
				to: email,
				subject,
				html,
				text,
				tags: tags || [{ Name: 'context', Value: 'membership-user-notice' }],
				branding: {
					category: 'Membership'
				}
			},
			{ fetch: fetchImpl }
		);
	} catch (error) {
		console.error('Failed to send membership user notification', error);
	}
}

function formatMoneyFromCents(cents, currency = 'usd') {
	const amount = Number(cents || 0);
	if (!Number.isFinite(amount) || amount <= 0) return 'Free';
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: String(currency || 'usd').toUpperCase()
		}).format(amount / 100);
	} catch {
		return `$${(amount / 100).toFixed(2)}`;
	}
}

function intervalLabel(intervalUnit) {
	return intervalUnit === 'year' ? 'year' : intervalUnit === 'month' ? 'month' : 'period';
}

function escapeHtml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function getMembershipAmountSummary(amountCents, intervalUnit, currency = 'usd') {
	const amount = normalizeAmountCents(amountCents, 0);
	if (amount <= 0) return 'Free';
	return `${formatMoneyFromCents(amount, currency)}/${intervalLabel(intervalUnit)}`;
}

async function sendMembershipPaymentSuccessNotifications({
	serviceSupabase,
	group,
	membership,
	userId,
	metadata,
	fetchImpl
}) {
	const tierId = cleanNullableText(metadata?.membership_tier_id, 64) || membership?.tier_id || null;
	const tier = tierId ? await loadTierById(serviceSupabase, tierId) : null;
	const profileMap = await resolveProfileMapByUserIds(serviceSupabase, [userId]);
	const memberProfile = profileMap.get(userId) || null;
	const memberName = cleanText(memberProfile?.full_name || '', 120) || 'Member';
	const memberEmail = sanitizeEmail(memberProfile?.email || '');
	const amountCents = normalizeAmountCents(metadata?.membership_amount_cents, 0);
	const paidAmount = formatMoneyFromCents(amountCents, tier?.currency || 'usd');
	const billingInterval =
		cleanNullableText(metadata?.membership_interval_unit, 16) || membership?.interval_unit || null;
	const contribution = amountCents > 0 ? `${paidAmount}/${intervalLabel(billingInterval)}` : 'Free';
	const tierName = cleanText(tier?.name || 'Membership', 120);
	const renewsAt = membership?.renews_at ? formatDate(membership.renews_at) : '';
	const memberMembershipUrl = `/groups/${group.slug}/membership`;
	const groupPageUrl = `/groups/${group.slug}`;

	await sendUserNotification({
		to: memberEmail,
		subject: `You're all set in ${group.name}`,
		html: `<p>Hi ${memberName},</p>
<p>Thanks for supporting <strong>${group.name}</strong>. Your membership payment was successful.</p>
<p><strong>Tier:</strong> ${tierName}<br />
<strong>Contribution:</strong> ${contribution}${renewsAt ? `<br /><strong>Next renewal:</strong> ${renewsAt}` : ''}</p>
<p>We're glad you're here. You can view upcoming activities and manage your membership anytime.</p>
<p><a href="${memberMembershipUrl}">View Membership</a> · <a href="${groupPageUrl}">Visit Group Page</a></p>`,
		text: `Hi ${memberName},

Thanks for supporting ${group.name}. Your membership payment was successful.

Tier: ${tierName}
Contribution: ${contribution}${renewsAt ? `\nNext renewal: ${renewsAt}` : ''}

You can manage your membership anytime: ${memberMembershipUrl}
Visit group page: ${groupPageUrl}`,
		tags: [{ Name: 'context', Value: 'membership-payment-success-member' }],
		fetchImpl
	});

	await sendOwnerNotification({
		serviceSupabase,
		group,
		subject: `${group.name} has a successful membership payment`,
		html: `<p><strong>${group.name}</strong> has a successful membership payment.</p>
<p><strong>Member:</strong> ${memberName}${memberEmail ? ` (${memberEmail})` : ''}<br />
<strong>Tier:</strong> ${tierName}<br />
<strong>Contribution:</strong> ${contribution}${renewsAt ? `<br /><strong>Next renewal:</strong> ${renewsAt}` : ''}</p>`,
		text: `${group.name} has a successful membership payment.

Member: ${memberName}${memberEmail ? ` (${memberEmail})` : ''}
Tier: ${tierName}
Contribution: ${contribution}${renewsAt ? `\nNext renewal: ${renewsAt}` : ''}`,
		tags: [{ Name: 'context', Value: 'membership-payment-success-owner' }],
		fetchImpl
	});
}

async function sendMembershipPaymentFailureNotifications({
	serviceSupabase,
	group,
	userId,
	metadata,
	reason,
	fetchImpl
}) {
	const tierId = cleanNullableText(metadata?.membership_tier_id, 64) || null;
	const tier = tierId ? await loadTierById(serviceSupabase, tierId) : null;
	const profileMap = await resolveProfileMapByUserIds(serviceSupabase, [userId]);
	const memberProfile = profileMap.get(userId) || null;
	const memberName = cleanText(memberProfile?.full_name || '', 120) || 'Member';
	const memberEmail = sanitizeEmail(memberProfile?.email || '');
	const amountCents = normalizeAmountCents(metadata?.membership_amount_cents, 0);
	const billedAmount = formatMoneyFromCents(amountCents, tier?.currency || 'usd');
	const billingInterval = cleanNullableText(metadata?.membership_interval_unit, 16) || null;
	const contribution =
		amountCents > 0 ? `${billedAmount}/${intervalLabel(billingInterval)}` : billedAmount;
	const tierName = cleanText(tier?.name || 'Membership', 120);
	const memberMembershipUrl = `/groups/${group.slug}/membership`;

	await sendUserNotification({
		to: memberEmail,
		subject: `Payment update for ${group.name}`,
		html: `<p>Hi ${memberName},</p>
<p>We couldn't process your membership payment for <strong>${group.name}</strong>.</p>
<p><strong>Tier:</strong> ${tierName}<br />
<strong>Amount:</strong> ${contribution}<br />
<strong>Status:</strong> ${cleanText(reason || 'Payment failed', 200)}</p>
<p>Please update your payment details to keep your membership active.</p>
<p><a href="${memberMembershipUrl}">Manage Membership</a></p>`,
		text: `Hi ${memberName},

We couldn't process your membership payment for ${group.name}.

Tier: ${tierName}
Amount: ${contribution}
Status: ${cleanText(reason || 'Payment failed', 200)}

Please update your payment details here: ${memberMembershipUrl}`,
		tags: [{ Name: 'context', Value: 'membership-payment-failed-member' }],
		fetchImpl
	});

	await sendOwnerNotification({
		serviceSupabase,
		group,
		subject: `Membership payment issue: ${group.name}`,
		html: `<p>A membership payment issue occurred in <strong>${group.name}</strong>.</p>
<p><strong>Member:</strong> ${memberName}${memberEmail ? ` (${memberEmail})` : ''}<br />
<strong>Tier:</strong> ${tierName}<br />
<strong>Amount:</strong> ${contribution}<br />
<strong>Status:</strong> ${cleanText(reason || 'Payment failed', 200)}</p>`,
		text: `A membership payment issue occurred in ${group.name}.

Member: ${memberName}${memberEmail ? ` (${memberEmail})` : ''}
Tier: ${tierName}
Amount: ${contribution}
Status: ${cleanText(reason || 'Payment failed', 200)}`,
		tags: [{ Name: 'context', Value: 'membership-payment-failed-owner' }],
		fetchImpl
	});
}

async function resolveAuthUserIdByEmail(serviceSupabase, email) {
	const target = sanitizeEmail(email);
	if (!target) return null;
	let page = 1;
	while (page <= 20) {
		const { data, error } = await serviceSupabase.auth.admin.listUsers({
			page,
			perPage: 200
		});
		if (error) return null;
		const users = data?.users || [];
		const match = users.find((user) => sanitizeEmail(user?.email || '') === target);
		if (match?.id) return match.id;
		if (users.length < 200) break;
		page += 1;
	}
	return null;
}

async function writeAuditLog(serviceSupabase, payload) {
	try {
		await serviceSupabase.from('group_membership_audit_log').insert({
			group_id: payload.group_id,
			actor_user_id: payload.actor_user_id || null,
			action: payload.action,
			entity_type: payload.entity_type,
			entity_id: payload.entity_id || null,
			before_snapshot: payload.before_snapshot || null,
			after_snapshot: payload.after_snapshot || null
		});
	} catch (error) {
		console.error('Failed to write membership audit log', error);
	}
}

async function loadProgram(serviceSupabase, groupId) {
	const { data, error } = await serviceSupabase
		.from('group_membership_programs')
		.select('*')
		.eq('group_id', groupId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function ensureProgram(serviceSupabase, groupId) {
	let program = await loadProgram(serviceSupabase, groupId);
	if (program) {
		await ensureDefaultApplicationFields(serviceSupabase, program.id);
		return program;
	}
	const { data, error } = await serviceSupabase
		.from('group_membership_programs')
		.insert({
			group_id: groupId,
			...DEFAULT_PROGRAM,
			created_at: toIsoNow(),
			updated_at: toIsoNow()
		})
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	program = data;
	await ensureDefaultApplicationFields(serviceSupabase, program.id);
	return program;
}

async function ensureDefaultApplicationFields(serviceSupabase, programId) {
	if (!programId) return;
	const { data: existing, error: existingError } = await serviceSupabase
		.from('group_membership_form_fields')
		.select('id')
		.eq('program_id', programId)
		.limit(1);
	if (existingError) throw new Error(existingError.message);
	if (Array.isArray(existing) && existing.length > 0) return;

	const now = toIsoNow();
	const rows = DEFAULT_APPLICATION_FIELDS.map((field) => ({
		program_id: programId,
		field_type: field.field_type,
		label: field.label,
		help_text: field.help_text || null,
		required: field.required === true,
		options_json: Array.isArray(field.options_json) ? field.options_json : [],
		sort_order: field.sort_order || 0,
		active: true,
		created_at: now,
		updated_at: now
	}));
	const { error } = await serviceSupabase.from('group_membership_form_fields').insert(rows);
	if (error) throw new Error(error.message);
}

async function loadProgramBundle(supabase, programId, { includeInactive = false } = {}) {
	const [tiersRes, fieldsRes] = await Promise.all([
		supabase
			.from('group_membership_tiers')
			.select('*')
			.eq('program_id', programId)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true }),
		supabase
			.from('group_membership_form_fields')
			.select('*')
			.eq('program_id', programId)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true })
	]);
	if (tiersRes.error) throw new Error(tiersRes.error.message);
	if (fieldsRes.error) throw new Error(fieldsRes.error.message);

	let tiers = tiersRes.data || [];
	let fields = fieldsRes.data || [];
	if (!includeInactive) {
		tiers = tiers.filter((tier) => tier.is_active !== false);
		fields = fields.filter((field) => field.active !== false);
	}

	return { tiers, fields };
}

async function loadTierById(serviceSupabase, tierId) {
	if (!tierId) return null;
	const { data, error } = await serviceSupabase
		.from('group_membership_tiers')
		.select('*')
		.eq('id', tierId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function loadDonationAccountForGroup(serviceSupabase, groupId) {
	const { data, error } = await serviceSupabase
		.from('donation_accounts')
		.select('id,stripe_account_id,charges_enabled')
		.eq('group_id', groupId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function createCheckoutSession({
	serviceSupabase,
	group,
	program,
	tier,
	billingInterval = 'month',
	userId,
	userEmail,
	applicationId = null,
	requestUrl,
	customAmountCents = null
}) {
	const donationAccount = await loadDonationAccountForGroup(serviceSupabase, group.id);
	if (!donationAccount?.stripe_account_id || donationAccount?.charges_enabled !== true) {
		return {
			ok: false,
			status: 409,
			error: 'This group has not connected Stripe for memberships.'
		};
	}

	const baseUrl = resolvePublicBaseUrl(requestUrl);
	if (!baseUrl) {
		return { ok: false, status: 500, error: 'PUBLIC_URL_BASE is not configured.' };
	}

	const amountCents =
		customAmountCents !== null && customAmountCents !== undefined
			? customAmountCents
			: normalizeAmountCents(resolveTierAmountByInterval(tier, billingInterval), 0);

	const stripe = getStripeClient();
	const mode = billingInterval ? 'subscription' : 'payment';
	const currency = normalizeCurrency(tier.currency);

	const lineItemPriceData = {
		currency,
		unit_amount: amountCents,
		product_data: {
			name: `${group.name} Membership: ${tier.name}`,
			description:
				cleanText(tier.description || `${program.cta_label || 'Membership'}`, 1000) || undefined
		}
	};
	if (mode === 'subscription') {
		lineItemPriceData.recurring = {
			interval: billingInterval,
			interval_count: 1
		};
	}

	const metadata = {
		membership_flow: 'group_membership',
		membership_group_id: group.id,
		membership_group_slug: group.slug,
		membership_program_id: program.id,
		membership_tier_id: tier.id,
		membership_user_id: userId,
		membership_application_id: applicationId || '',
		membership_contribution_mode: program.contribution_mode,
		membership_billing_type: mode === 'subscription' ? 'recurring' : 'one_time',
		membership_interval_unit: billingInterval || '',
		membership_amount_cents: String(amountCents)
	};

	const successUrl = `${baseUrl}/groups/${encodeURIComponent(group.slug)}?membership=success&session_id={CHECKOUT_SESSION_ID}`;
	const cancelUrl = `${baseUrl}/groups/${encodeURIComponent(group.slug)}?membership=cancelled`;

	let checkoutSession = null;
	try {
		checkoutSession = await stripe.checkout.sessions.create(
			{
				mode,
				customer_email: userEmail || undefined,
				success_url: successUrl,
				cancel_url: cancelUrl,
				line_items: [
					{
						quantity: 1,
						price_data: lineItemPriceData
					}
				],
				metadata,
				payment_intent_data:
					mode === 'payment'
						? {
								metadata
							}
						: undefined,
				subscription_data:
					mode === 'subscription'
						? {
								metadata
							}
						: undefined
			},
			{ stripeAccount: donationAccount.stripe_account_id }
		);
	} catch (error) {
		return {
			ok: false,
			status: 502,
			error: error?.message || 'Unable to create checkout session.'
		};
	}

	if (!checkoutSession?.url) {
		return { ok: false, status: 502, error: 'Stripe did not return a checkout URL.' };
	}

	return {
		ok: true,
		checkoutUrl: checkoutSession.url,
		sessionId: checkoutSession.id,
		connectedAccountId: donationAccount.stripe_account_id
	};
}

async function findOrCreateMembership({
	serviceSupabase,
	groupId,
	userId,
	tierId,
	billingInterval = null,
	contributionAmountCents = null,
	applicationId = null,
	source = 'online',
	createdByOwnerId = null,
	status = 'active'
}) {
	const { data: existingRows, error: existingError } = await serviceSupabase
		.from('group_memberships')
		.select('*')
		.eq('group_id', groupId)
		.eq('user_id', userId)
		.eq('tier_id', tierId)
		.in('status', ['active', 'past_due', 'paused'])
		.order('created_at', { ascending: false })
		.limit(1);
	if (existingError) throw new Error(existingError.message);
	if (existingRows?.length) return existingRows[0];

	const tier = await loadTierById(serviceSupabase, tierId);
	const now = new Date();
	const normalizedInterval =
		billingInterval && INTERVAL_UNITS.has(billingInterval) ? billingInterval : null;
	const resolvedAmountCents =
		contributionAmountCents === null || contributionAmountCents === undefined
			? normalizeAmountCents(resolveTierAmountByInterval(tier, normalizedInterval), 0)
			: normalizeAmountCents(contributionAmountCents, 0);
	const renewsAt = billingInterval
		? plusInterval(now, billingInterval, 1).toISOString()
		: calculateRenewalDate(tier, now);

	const { data, error } = await serviceSupabase
		.from('group_memberships')
		.insert({
			group_id: groupId,
			user_id: userId,
			tier_id: tierId,
			status: MEMBERSHIP_STATUSES.has(status) ? status : 'active',
			source,
			started_at: now.toISOString(),
			renews_at: renewsAt,
			interval_unit: normalizedInterval,
			contribution_amount_cents: resolvedAmountCents,
			created_by_owner_id: createdByOwnerId,
			created_from_application_id: applicationId,
			created_at: now.toISOString(),
			updated_at: now.toISOString()
		})
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data;
}

async function upsertBillingForMembership({ serviceSupabase, membershipId, updates }) {
	const now = toIsoNow();
	const payload = {
		membership_id: membershipId,
		...updates,
		updated_at: now
	};
	if (!updates?.created_at) payload.created_at = now;

	const { data, error } = await serviceSupabase
		.from('group_membership_billing')
		.upsert(payload, { onConflict: 'membership_id' })
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data;
}

async function resolveProfileMapByUserIds(serviceSupabase, userIds) {
	const ids = Array.from(new Set((userIds || []).filter(Boolean)));
	if (!ids.length) return new Map();
	const { data, error } = await serviceSupabase
		.from('profiles')
		.select('user_id,email,full_name')
		.in('user_id', ids);
	if (error) throw new Error(error.message);
	return new Map((data || []).map((row) => [row.user_id, row]));
}

async function upsertMembershipUserProfile({
	serviceSupabase,
	userId,
	currentEmail = null,
	profilePayload
}) {
	if (!userId) return;
	const normalized = normalizeProfilePayload(profilePayload);
	if (!normalized) return;

	const { data: existing, error: existingError } = await serviceSupabase
		.from('profiles')
		.select('user_id,email,full_name,phone,avatar_url,bio,metadata')
		.eq('user_id', userId)
		.maybeSingle();
	if (existingError) throw new Error(existingError.message);

	const email = normalized.email || sanitizeEmail(existing?.email || currentEmail || '') || null;
	const fullName = normalized.full_name ?? existing?.full_name ?? null;
	const phone = normalized.phone ?? existing?.phone ?? null;

	const payload = {
		user_id: userId,
		email,
		full_name: fullName,
		phone,
		avatar_url: existing?.avatar_url ?? null,
		bio: existing?.bio ?? null,
		metadata: existing?.metadata ?? {}
	};

	const { error: upsertError } = await serviceSupabase
		.from('profiles')
		.upsert(payload, { onConflict: 'user_id' });
	if (upsertError) throw new Error(upsertError.message);
}

async function resolveGroupProgramAndTier(serviceSupabase, groupId, tierId = null) {
	const program = await ensureProgram(serviceSupabase, groupId);
	const bundle = await loadProgramBundle(serviceSupabase, program.id, { includeInactive: true });

	let tier = null;
	if (tierId) {
		tier = bundle.tiers.find((entry) => entry.id === tierId) || null;
	}
	if (!tier) {
		tier =
			bundle.tiers.find(
				(entry) => entry.id === program.default_tier_id && entry.is_active !== false
			) ||
			bundle.tiers.find((entry) => entry.is_default === true && entry.is_active !== false) ||
			bundle.tiers.find((entry) => entry.is_active !== false) ||
			null;
	}

	return { program, tier, tiers: bundle.tiers, fields: bundle.fields };
}

async function resolveApplicationContext(serviceSupabase, applicationId) {
	const { data, error } = await serviceSupabase
		.from('group_membership_applications')
		.select('*')
		.eq('id', applicationId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

function normalizeApplicationStatus(value, fallback = 'submitted') {
	const cleaned = cleanText(value, 40).toLowerCase();
	return APPLICATION_STATUSES.has(cleaned) ? cleaned : fallback;
}

function normalizeMembershipStatus(value, fallback = 'active') {
	const cleaned = cleanText(value, 40).toLowerCase();
	return MEMBERSHIP_STATUSES.has(cleaned) ? cleaned : fallback;
}

async function applyPendingTierChange({ serviceSupabase, membership, stripeAccountId = null }) {
	if (!membership?.id) return { applied: false };
	const { data: pending, error } = await serviceSupabase
		.from('group_membership_tier_change_requests')
		.select('*')
		.eq('membership_id', membership.id)
		.eq('status', 'pending')
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!pending) return { applied: false };

	const requestedTier = await loadTierById(serviceSupabase, pending.requested_tier_id);
	if (!requestedTier || requestedTier.is_active === false) {
		await serviceSupabase
			.from('group_membership_tier_change_requests')
			.update({ status: 'cancelled', updated_at: toIsoNow() })
			.eq('id', pending.id);
		return { applied: false };
	}

	const { data: billing } = await serviceSupabase
		.from('group_membership_billing')
		.select('*')
		.eq('membership_id', membership.id)
		.maybeSingle();

	const now = toIsoNow();
	const nextIntervalUnit = INTERVAL_UNITS.has(membership?.interval_unit || '')
		? membership.interval_unit
		: 'month';
	const nextContributionAmount = normalizeAmountCents(
		resolveTierAmountByInterval(requestedTier, nextIntervalUnit),
		0
	);

	const nextStripePriceId = requestedTier.stripe_price_id || billing?.stripe_price_id || null;

	await serviceSupabase
		.from('group_memberships')
		.update({
			tier_id: requestedTier.id,
			contribution_amount_cents: nextContributionAmount,
			updated_at: now
		})
		.eq('id', membership.id);

	await serviceSupabase
		.from('group_membership_tier_change_requests')
		.update({ status: 'applied', applied_at: now, updated_at: now })
		.eq('id', pending.id);

	await serviceSupabase
		.from('group_membership_billing')
		.update({
			stripe_price_id: nextStripePriceId,
			updated_at: now
		})
		.eq('membership_id', membership.id);

	return { applied: true, tier: requestedTier };
}

async function ensureStripeCatalogForMembershipTier({
	serviceSupabase,
	group,
	tier,
	stripeAccountId,
	intervalUnit,
	amountCents = null
}) {
	if (!tier?.id || !stripeAccountId) {
		return { productId: null, priceId: null, monthlyPriceId: null, annualPriceId: null };
	}

	const accountMatches =
		cleanNullableText(tier?.stripe_account_id, 255) === cleanNullableText(stripeAccountId, 255);
	let productId = accountMatches ? cleanNullableText(tier?.stripe_product_id, 255) : null;
	let monthlyPriceId = accountMatches
		? cleanNullableText(tier?.stripe_monthly_price_id, 255)
		: null;
	let annualPriceId = accountMatches ? cleanNullableText(tier?.stripe_annual_price_id, 255) : null;
	const stripe = getStripeClient();
	const stripeOptions = { stripeAccount: stripeAccountId };

	if (!productId) {
		const product = await stripe.products.create(
			{
				name: `${group?.name || 'Group'} Membership: ${tier.name}`,
				description:
					cleanNullableText(tier?.description || '', 1000) ||
					`${group?.name || 'Group'} membership tier`
			},
			stripeOptions
		);
		productId = cleanNullableText(product?.id, 255);
	} else {
		await stripe.products.update(
			productId,
			{
				name: `${group?.name || 'Group'} Membership: ${tier.name}`,
				description:
					cleanNullableText(tier?.description || '', 1000) ||
					`${group?.name || 'Group'} membership tier`
			},
			stripeOptions
		);
	}

	if (tier.allow_custom_amount !== true) {
		if (
			!monthlyPriceId &&
			tier.monthly_amount_cents !== null &&
			tier.monthly_amount_cents !== undefined
		) {
			const monthlyPrice = await stripe.prices.create(
				{
					product: productId,
					currency: normalizeCurrency(tier.currency),
					unit_amount: normalizeAmountCents(tier.monthly_amount_cents, 0),
					recurring: {
						interval: 'month',
						interval_count: 1
					},
					metadata: {
						membership_flow: 'group_membership',
						membership_group_id: group?.id || '',
						membership_tier_id: tier.id,
						membership_interval_unit: 'month',
						membership_amount_cents: String(normalizeAmountCents(tier.monthly_amount_cents, 0))
					}
				},
				stripeOptions
			);
			monthlyPriceId = cleanNullableText(monthlyPrice?.id, 255);
		}

		if (
			!annualPriceId &&
			tier.annual_amount_cents !== null &&
			tier.annual_amount_cents !== undefined
		) {
			const annualPrice = await stripe.prices.create(
				{
					product: productId,
					currency: normalizeCurrency(tier.currency),
					unit_amount: normalizeAmountCents(tier.annual_amount_cents, 0),
					recurring: {
						interval: 'year',
						interval_count: 1
					},
					metadata: {
						membership_flow: 'group_membership',
						membership_group_id: group?.id || '',
						membership_tier_id: tier.id,
						membership_interval_unit: 'year',
						membership_amount_cents: String(normalizeAmountCents(tier.annual_amount_cents, 0))
					}
				},
				stripeOptions
			);
			annualPriceId = cleanNullableText(annualPrice?.id, 255);
		}
	}

	let priceId =
		intervalUnit === 'year'
			? annualPriceId || monthlyPriceId || null
			: monthlyPriceId || annualPriceId || null;

	if (tier.allow_custom_amount === true) {
		const dynamicAmount = normalizeAmountCents(amountCents, 0);
		const dynamicPrice = await stripe.prices.create(
			{
				product: productId,
				currency: normalizeCurrency(tier.currency),
				unit_amount: dynamicAmount,
				recurring: {
					interval: intervalUnit === 'year' ? 'year' : 'month',
					interval_count: 1
				},
				metadata: {
					membership_flow: 'group_membership',
					membership_group_id: group?.id || '',
					membership_tier_id: tier.id,
					membership_interval_unit: intervalUnit === 'year' ? 'year' : 'month',
					membership_amount_cents: String(dynamicAmount)
				}
			},
			stripeOptions
		);
		priceId = cleanNullableText(dynamicPrice?.id, 255);
	}

	await serviceSupabase
		.from('group_membership_tiers')
		.update({
			stripe_product_id: productId,
			stripe_monthly_price_id: monthlyPriceId,
			stripe_annual_price_id: annualPriceId,
			stripe_account_id: stripeAccountId,
			stripe_price_id: monthlyPriceId || annualPriceId || null,
			updated_at: toIsoNow()
		})
		.eq('id', tier.id);

	return { productId, priceId, monthlyPriceId, annualPriceId };
}

async function updateStripeSubscriptionPriceForTierChange({
	serviceSupabase,
	membership,
	requestedTier,
	stripeAccountId
}) {
	if (!membership?.id || !requestedTier || !stripeAccountId) return null;
	if (requestedTier.billing_type !== 'recurring') return null;

	const { data: billing, error: billingError } = await serviceSupabase
		.from('group_membership_billing')
		.select('*')
		.eq('membership_id', membership.id)
		.maybeSingle();
	if (billingError) throw new Error(billingError.message);
	if (!billing?.stripe_subscription_id) return null;

	const intervalUnit = INTERVAL_UNITS.has(membership?.interval_unit || '')
		? membership.interval_unit
		: 'month';
	const group = await loadGroupById(serviceSupabase, membership.group_id);
	const amountCents = normalizeAmountCents(
		resolveTierAmountByInterval(requestedTier, intervalUnit),
		0
	);
	const { priceId: nextStripePriceId } = await ensureStripeCatalogForMembershipTier({
		serviceSupabase,
		group,
		tier: requestedTier,
		stripeAccountId,
		intervalUnit,
		amountCents
	});
	if (!nextStripePriceId) throw new Error('Unable to create Stripe price for tier change.');

	const stripe = getStripeClient();
	const subscription = await stripe.subscriptions.retrieve(
		billing.stripe_subscription_id,
		{},
		{ stripeAccount: stripeAccountId }
	);
	const item = subscription?.items?.data?.[0];
	if (!item?.id) throw new Error('Stripe subscription item not found.');

	await stripe.subscriptions.update(
		billing.stripe_subscription_id,
		{
			items: [
				{
					id: item.id,
					price: nextStripePriceId
				}
			],
			proration_behavior: 'none'
		},
		{ stripeAccount: stripeAccountId }
	);

	await serviceSupabase
		.from('group_membership_billing')
		.update({
			stripe_price_id: nextStripePriceId,
			updated_at: toIsoNow()
		})
		.eq('membership_id', membership.id);

	return nextStripePriceId;
}

async function loadMembershipById(serviceSupabase, membershipId) {
	const { data, error } = await serviceSupabase
		.from('group_memberships')
		.select('*')
		.eq('id', membershipId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function loadBillingBySubscriptionId(serviceSupabase, subscriptionId) {
	if (!subscriptionId) return null;
	const { data, error } = await serviceSupabase
		.from('group_membership_billing')
		.select('*')
		.eq('stripe_subscription_id', subscriptionId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function loadProgramById(serviceSupabase, programId) {
	if (!programId) return null;
	const { data, error } = await serviceSupabase
		.from('group_membership_programs')
		.select('*')
		.eq('id', programId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

async function loadGroupById(serviceSupabase, groupId) {
	if (!groupId) return null;
	const { data, error } = await serviceSupabase
		.from('groups')
		.select('id,slug,name,website_url,social_links,public_contact_email')
		.eq('id', groupId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

function buildPolicyLink(baseUrl, groupSlug, policyVersion) {
	const suffix = `/groups/${encodeURIComponent(groupSlug)}/membership?policy=v${policyVersion || 1}`;
	if (!baseUrl) return suffix;
	return `${baseUrl}${suffix}`;
}

async function resolveEmailAudience({ serviceSupabase, groupId, audienceFilters = {} }) {
	const statuses = Array.isArray(audienceFilters.statuses)
		? audienceFilters.statuses.map((value) => cleanText(value, 40)).filter(Boolean)
		: ['active'];
	const tierIds = Array.isArray(audienceFilters.tier_ids)
		? audienceFilters.tier_ids.map((value) => cleanText(value, 64)).filter(Boolean)
		: [];

	let query = serviceSupabase
		.from('group_memberships')
		.select('*')
		.eq('group_id', groupId)
		.in('status', statuses.length ? statuses : ['active'])
		.order('created_at', { ascending: false })
		.limit(2000);
	if (tierIds.length) query = query.in('tier_id', tierIds);

	const { data: memberships, error } = await query;
	if (error) throw new Error(error.message);

	const memberRows = memberships || [];
	const profileMap = await resolveProfileMapByUserIds(
		serviceSupabase,
		memberRows.map((row) => row.user_id)
	);

	const tierIdsToLoad = Array.from(new Set(memberRows.map((row) => row.tier_id).filter(Boolean)));
	let tierMap = new Map();
	if (tierIdsToLoad.length) {
		const { data: tiers } = await serviceSupabase
			.from('group_membership_tiers')
			.select('id,name')
			.in('id', tierIdsToLoad);
		tierMap = new Map((tiers || []).map((tier) => [tier.id, tier]));
	}

	return memberRows
		.map((membership) => {
			const profile = profileMap.get(membership.user_id) || null;
			const recipientEmail = sanitizeEmail(profile?.email);
			if (!recipientEmail) return null;
			return {
				membership,
				profile,
				tier: tierMap.get(membership.tier_id) || null,
				email: recipientEmail
			};
		})
		.filter(Boolean);
}

async function loadUpcomingRideRows(serviceSupabase, groupId) {
	const nowIso = toIsoNow();
	const { data } = await serviceSupabase
		.from('activity_events')
		.select('id,slug,title,next_occurrence_start,start_location_name,start_location_address')
		.eq('activity_type', 'ride')
		.eq('host_group_id', groupId)
		.gte('next_occurrence_start', nowIso)
		.order('next_occurrence_start', { ascending: true })
		.limit(4);
	return data || [];
}

async function loadUpcomingVolunteerRows(serviceSupabase, groupId) {
	const nowIso = toIsoNow();
	const { data } = await serviceSupabase
		.from('volunteer_events')
		.select('id,slug,title,event_start,location_name,location_address,status')
		.eq('host_group_id', groupId)
		.eq('status', 'published')
		.gte('event_start', nowIso)
		.order('event_start', { ascending: true })
		.limit(4);
	return data || [];
}

function renderRidesBlock(rides, baseUrl) {
	if (!rides.length)
		return { html: '<p>No upcoming rides scheduled.</p>', text: 'No upcoming rides.' };
	const htmlItems = rides
		.map((ride) => {
			const when = formatDate(ride.next_occurrence_start);
			const href = baseUrl
				? `${baseUrl}/ride/${encodeURIComponent(ride.slug)}`
				: `/ride/${ride.slug}`;
			const location = cleanText(ride.start_location_name || ride.start_location_address, 200);
			return `<li><a href="${href}">${ride.title}</a>${when ? ` - ${when}` : ''}${
				location ? ` (${location})` : ''
			}</li>`;
		})
		.join('');
	const textItems = rides
		.map((ride) => {
			const when = formatDate(ride.next_occurrence_start);
			const location = cleanText(ride.start_location_name || ride.start_location_address, 200);
			return `- ${ride.title}${when ? ` (${when})` : ''}${location ? ` @ ${location}` : ''}`;
		})
		.join('\n');
	return {
		html: `<h3>Upcoming Rides</h3><ul>${htmlItems}</ul>`,
		text: `Upcoming Rides\n${textItems}`
	};
}

function renderVolunteerBlock(events, baseUrl) {
	if (!events.length)
		return { html: '<p>No upcoming volunteer events.</p>', text: 'No upcoming volunteer events.' };
	const htmlItems = events
		.map((event) => {
			const when = formatDate(event.event_start);
			const href = baseUrl
				? `${baseUrl}/volunteer/${encodeURIComponent(event.slug)}`
				: `/volunteer/${event.slug}`;
			const location = cleanText(event.location_name || event.location_address, 200);
			return `<li><a href="${href}">${event.title}</a>${when ? ` - ${when}` : ''}${
				location ? ` (${location})` : ''
			}</li>`;
		})
		.join('');
	const textItems = events
		.map((event) => {
			const when = formatDate(event.event_start);
			const location = cleanText(event.location_name || event.location_address, 200);
			return `- ${event.title}${when ? ` (${when})` : ''}${location ? ` @ ${location}` : ''}`;
		})
		.join('\n');
	return {
		html: `<h3>Upcoming Volunteer Events</h3><ul>${htmlItems}</ul>`,
		text: `Upcoming Volunteer Events\n${textItems}`
	};
}

function renderGroupLinksBlock(group, baseUrl) {
	const links = [];
	if (group?.website_url) {
		links.push({ label: 'Group Website', href: group.website_url });
	}
	if (group?.slug) {
		links.push({
			label: 'Volunteer Page',
			href: `${baseUrl || ''}/volunteer/groups/${encodeURIComponent(group.slug)}`
		});
		links.push({
			label: 'Membership Page',
			href: `${baseUrl || ''}/groups/${encodeURIComponent(group.slug)}/membership`
		});
		links.push({
			label: 'Donation Page',
			href: `${baseUrl || ''}/groups/${encodeURIComponent(group.slug)}/donate`
		});
	}

	let socials = [];
	if (group?.social_links && typeof group.social_links === 'object') {
		socials = Object.entries(group.social_links)
			.filter(([, href]) => Boolean(href))
			.slice(0, 6)
			.map(([platform, href]) => ({
				label: platform,
				href
			}));
	}

	const merged = [...links, ...socials];
	if (!merged.length) {
		return { html: '<p>No group links configured yet.</p>', text: 'No group links configured.' };
	}

	return {
		html: `<h3>Group Links</h3><ul>${merged
			.map((entry) => `<li><a href="${entry.href}">${entry.label}</a></li>`)
			.join('')}</ul>`,
		text: `Group Links\n${merged.map((entry) => `- ${entry.label}: ${entry.href}`).join('\n')}`
	};
}

function extractSubscriptionIdFromInvoice(invoice) {
	const subscription = invoice?.subscription;
	if (!subscription) return null;
	if (typeof subscription === 'string') return subscription;
	if (typeof subscription === 'object') return subscription.id || null;
	return null;
}

function extractCustomerId(value) {
	if (!value) return null;
	if (typeof value === 'string') return value;
	if (typeof value === 'object') return value.id || null;
	return null;
}

function extractCurrentPeriodEndFromSubscription(subscription) {
	if (!subscription) return null;
	const value = subscription.current_period_end;
	if (!value) return null;
	if (typeof value === 'number') return new Date(value * 1000).toISOString();
	const asDate = new Date(value);
	if (Number.isNaN(asDate.getTime())) return null;
	return asDate.toISOString();
}

function extractInvoiceNextBillingAt(invoice) {
	const nextAttempt = invoice?.next_payment_attempt;
	if (typeof nextAttempt === 'number') return new Date(nextAttempt * 1000).toISOString();
	const lines = invoice?.lines?.data;
	if (Array.isArray(lines) && lines.length > 0) {
		const periodEnd = lines[0]?.period?.end;
		if (typeof periodEnd === 'number') return new Date(periodEnd * 1000).toISOString();
	}
	return null;
}

export async function requireMembershipManager(cookies, groupSlug) {
	const auth = await getAuthContext(cookies);
	if (!auth) return { ok: false, status: 401, error: 'Authentication required.' };

	const group = await loadGroupBySlug(auth.requestSupabase, groupSlug);
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	const canManage = await isGroupManager(auth.requestSupabase, group.id, auth.userId, auth.isAdmin);
	if (!canManage) {
		return {
			ok: false,
			status: 403,
			error: 'You do not have permission to manage this membership program.'
		};
	}

	return {
		ok: true,
		...auth,
		group,
		canManage
	};
}

export async function requireMembershipUser(cookies, groupSlug) {
	const auth = await getAuthContext(cookies);
	if (!auth) return { ok: false, status: 401, error: 'Authentication required.' };

	const group = await loadGroupBySlug(auth.requestSupabase, groupSlug);
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	const canManage = await isGroupManager(auth.requestSupabase, group.id, auth.userId, auth.isAdmin);
	return {
		ok: true,
		...auth,
		group,
		canManage
	};
}

export async function getMembershipProgramForViewer({
	cookies,
	groupSlug,
	includeInactive = false
}) {
	const viewer = await getViewerContext(cookies);
	const group = await loadGroupBySlug(viewer.requestSupabase, groupSlug);
	if (!group) {
		return { ok: false, status: 404, error: 'Group not found.' };
	}

	let canManage = false;
	if (viewer.userId) {
		canManage = await isGroupManager(
			viewer.requestSupabase,
			group.id,
			viewer.userId,
			viewer.isAdmin
		);
	}

	const serviceSupabase = await getServiceSupabase();
	const sourceSupabase = canManage ? serviceSupabase : viewer.requestSupabase;
	const donationAccount = await loadDonationAccountForGroup(serviceSupabase, group.id);
	const stripeConnection = donationAccount
		? {
				connected: Boolean(donationAccount.stripe_account_id),
				charges_enabled: donationAccount.charges_enabled === true,
				stripe_account_id: canManage ? donationAccount.stripe_account_id || null : null
			}
		: { connected: false, charges_enabled: false, stripe_account_id: null };

	let program = null;
	if (canManage) {
		program = await ensureProgram(sourceSupabase, group.id);
	} else {
		program = await loadProgram(sourceSupabase, group.id);
		if (program) {
			await ensureDefaultApplicationFields(serviceSupabase, program.id);
		}
	}

	if (!program) {
		return {
			ok: true,
			data: {
				group,
				program: null,
				tiers: [],
				form_fields: [],
				stripe_connection: stripeConnection,
				can_manage: canManage
			}
		};
	}

	const { tiers, fields } = await loadProgramBundle(sourceSupabase, program.id, {
		includeInactive
	});
	return {
		ok: true,
		data: {
			group,
			program,
			tiers,
			form_fields: fields,
			stripe_connection: stripeConnection,
			can_manage: canManage
		}
	};
}

export async function updateMembershipProgram({ cookies, groupSlug, payload }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const before = await ensureProgram(serviceSupabase, auth.group.id);

	const accessMode = PROGRAM_ACCESS_MODES.has(cleanText(payload?.access_mode, 32))
		? cleanText(payload?.access_mode, 32)
		: before.access_mode || 'public';
	const contributionMode = normalizeContributionMode(
		payload?.contribution_mode,
		normalizeContributionMode(before.contribution_mode, 'donation')
	);
	const defaultTierId = cleanNullableText(payload?.default_tier_id, 64);

	if (defaultTierId) {
		const tier = await loadTierById(serviceSupabase, defaultTierId);
		if (!tier || tier.program_id !== before.id) {
			return {
				ok: false,
				status: 400,
				error: 'Default tier must belong to this membership program.'
			};
		}
	}

	const updates = {
		enabled: normalizeBoolean(payload?.enabled, before.enabled !== false),
		access_mode: accessMode,
		cta_label: cleanText(payload?.cta_label || before.cta_label || 'Follow', 80),
		contribution_mode: contributionMode,
		default_tier_id: defaultTierId,
		updated_at: toIsoNow()
	};

	const { data, error } = await serviceSupabase
		.from('group_membership_programs')
		.update(updates)
		.eq('id', before.id)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'program.updated',
		entity_type: 'group_membership_program',
		entity_id: data.id,
		before_snapshot: before,
		after_snapshot: data
	});

	return { ok: true, data };
}

export async function updateMembershipPolicy({ cookies, groupSlug, payload }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const before = await ensureProgram(serviceSupabase, auth.group.id);
	const markdown = cleanText(payload?.policy_markdown ?? '', 50000);
	const bumpVersion = normalizeBoolean(payload?.bump_version, true);

	const updates = {
		policy_markdown: markdown,
		policy_updated_at: toIsoNow(),
		updated_at: toIsoNow(),
		policy_version: bumpVersion
			? (normalizeInteger(before.policy_version, 1) || 1) + 1
			: before.policy_version
	};

	const { data, error } = await serviceSupabase
		.from('group_membership_programs')
		.update(updates)
		.eq('id', before.id)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'policy.updated',
		entity_type: 'group_membership_program',
		entity_id: data.id,
		before_snapshot: {
			policy_markdown: before.policy_markdown,
			policy_version: before.policy_version
		},
		after_snapshot: { policy_markdown: data.policy_markdown, policy_version: data.policy_version }
	});

	return { ok: true, data };
}

export async function listMembershipTiers({ cookies, groupSlug, includeInactive = false }) {
	const viewerResult = await getMembershipProgramForViewer({
		cookies,
		groupSlug,
		includeInactive
	});
	if (!viewerResult.ok) return viewerResult;
	return {
		ok: true,
		data: {
			group: viewerResult.data.group,
			program: viewerResult.data.program,
			tiers: viewerResult.data.tiers,
			can_manage: viewerResult.data.can_manage
		}
	};
}

export async function seedDefaultMembershipTiers({ cookies, groupSlug }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const program = await ensureProgram(serviceSupabase, auth.group.id);
	const { tiers: existingTiers } = await loadProgramBundle(serviceSupabase, program.id, {
		includeInactive: true
	});

	const now = toIsoNow();
	const templateByKey = new Map(
		DEFAULT_MEMBERSHIP_TIER_TEMPLATES.map((template) => [
			[
				cleanText(template.name, 120).toLowerCase(),
				template.billing_type,
				template.interval_unit || '',
				String(template.interval_count || '')
			].join('::'),
			template
		])
	);
	const existingByKey = new Map(
		(existingTiers || []).map((tier) => [
			[
				cleanText(tier.name, 120).toLowerCase(),
				tier.billing_type,
				tier.interval_unit || '',
				String(tier.interval_count || '')
			].join('::'),
			tier
		])
	);

	const created = [];
	const updated = [];
	let desiredDefaultTierId = null;
	for (const [key, template] of templateByKey.entries()) {
		const existing = existingByKey.get(key);
		const payload = {
			name: template.name,
			description: template.description,
			amount_cents: template.amount_cents,
			monthly_amount_cents: normalizeNullableAmountCents(template.amount_cents),
			annual_amount_cents: normalizeNullableAmountCents(template.annual_amount_cents),
			currency: template.currency,
			billing_type: template.billing_type,
			interval_unit: template.billing_type === 'recurring' ? template.interval_unit : null,
			interval_count: template.billing_type === 'recurring' ? template.interval_count : null,
			// Set default in a second pass to avoid unique-index collisions.
			is_default: false,
			is_active: template.is_active !== false,
			allow_custom_amount: template.allow_custom_amount === true,
			min_amount_cents:
				template.allow_custom_amount === true
					? normalizeInteger(template.min_amount_cents, 0) || 0
					: null
		};

		if (existing) {
			const updatePayload = {
				...payload,
				sort_order: template.is_default
					? 0
					: DEFAULT_MEMBERSHIP_TIER_TEMPLATES.indexOf(template) + 1,
				updated_at: now
			};
			const { data: nextTier, error: updateError } = await serviceSupabase
				.from('group_membership_tiers')
				.update(updatePayload)
				.eq('id', existing.id)
				.select('*')
				.single();
			if (updateError) return { ok: false, status: 400, error: updateError.message };
			updated.push(nextTier);
			if (template.is_default === true) {
				desiredDefaultTierId = nextTier.id;
			}
			continue;
		}

		const insertPayload = {
			program_id: program.id,
			...payload,
			sort_order: template.is_default ? 0 : DEFAULT_MEMBERSHIP_TIER_TEMPLATES.indexOf(template) + 1,
			stripe_price_id: null,
			stripe_product_id: null,
			stripe_monthly_price_id: null,
			stripe_annual_price_id: null,
			stripe_account_id: null,
			created_at: now,
			updated_at: now
		};
		const { data: createdTier, error: createError } = await serviceSupabase
			.from('group_membership_tiers')
			.insert(insertPayload)
			.select('*')
			.single();
		if (createError) return { ok: false, status: 400, error: createError.message };
		created.push(createdTier);
		if (template.is_default === true) {
			desiredDefaultTierId = createdTier.id;
		}
	}

	if (desiredDefaultTierId) {
		const { error: unsetDefaultError } = await serviceSupabase
			.from('group_membership_tiers')
			.update({ is_default: false, updated_at: now })
			.eq('program_id', program.id)
			.eq('is_default', true);
		if (unsetDefaultError) return { ok: false, status: 400, error: unsetDefaultError.message };

		const { error: setDefaultError } = await serviceSupabase
			.from('group_membership_tiers')
			.update({ is_default: true, updated_at: now })
			.eq('id', desiredDefaultTierId)
			.eq('program_id', program.id);
		if (setDefaultError) return { ok: false, status: 400, error: setDefaultError.message };

		const { error: updateProgramError } = await serviceSupabase
			.from('group_membership_programs')
			.update({ default_tier_id: desiredDefaultTierId, updated_at: now })
			.eq('id', program.id);
		if (updateProgramError) return { ok: false, status: 400, error: updateProgramError.message };
	}

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'tiers.seeded_default_catalog',
		entity_type: 'group_membership_program',
		entity_id: program.id,
		after_snapshot: {
			created_count: created.length,
			updated_count: updated.length,
			total_templates: DEFAULT_MEMBERSHIP_TIER_TEMPLATES.length
		}
	});

	const { tiers } = await loadProgramBundle(serviceSupabase, program.id, { includeInactive: true });
	return {
		ok: true,
		data: {
			created_count: created.length,
			updated_count: updated.length,
			tiers
		}
	};
}

export async function createMembershipTier({ cookies, groupSlug, payload }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const program = await ensureProgram(serviceSupabase, auth.group.id);

	const isDefault = normalizeBoolean(payload?.is_default, false);
	const allowCustomAmount = normalizeBoolean(payload?.allow_custom_amount, false);
	const monthlyAmountCents = normalizeNullableAmountCents(
		payload?.monthly_amount_cents ?? payload?.amount_cents
	);
	const annualAmountCents = normalizeNullableAmountCents(payload?.annual_amount_cents);
	const hasRecurringRates =
		monthlyAmountCents !== null || annualAmountCents !== null || allowCustomAmount === true;
	const billingType = hasRecurringRates ? 'recurring' : 'one_time';
	const minAmountCents = allowCustomAmount
		? normalizeAmountCents(payload?.min_amount_cents, 0)
		: normalizeInteger(payload?.min_amount_cents, null);

	const insertPayload = {
		program_id: program.id,
		name: cleanText(payload?.name || '', 80),
		description: cleanNullableText(payload?.description, 1000),
		amount_cents: monthlyAmountCents ?? 0,
		monthly_amount_cents: monthlyAmountCents,
		annual_amount_cents: annualAmountCents,
		currency: normalizeCurrency(payload?.currency),
		billing_type: billingType,
		interval_unit: billingType === 'recurring' ? 'month' : null,
		interval_count: billingType === 'recurring' ? 1 : null,
		is_default: isDefault,
		is_active: normalizeBoolean(payload?.is_active, true),
		sort_order: normalizeInteger(payload?.sort_order, 0) || 0,
		allow_custom_amount: allowCustomAmount,
		min_amount_cents: allowCustomAmount ? minAmountCents : minAmountCents,
		stripe_price_id: cleanNullableText(payload?.stripe_price_id, 255),
		stripe_product_id: cleanNullableText(payload?.stripe_product_id, 255),
		stripe_monthly_price_id: cleanNullableText(payload?.stripe_monthly_price_id, 255),
		stripe_annual_price_id: cleanNullableText(payload?.stripe_annual_price_id, 255),
		stripe_account_id: cleanNullableText(payload?.stripe_account_id, 255),
		created_at: toIsoNow(),
		updated_at: toIsoNow()
	};

	if (!insertPayload.name) {
		return { ok: false, status: 400, error: 'Tier name is required.' };
	}

	if (isDefault) {
		await serviceSupabase
			.from('group_membership_tiers')
			.update({ is_default: false, updated_at: toIsoNow() })
			.eq('program_id', program.id)
			.eq('is_default', true);
	}

	const { data, error } = await serviceSupabase
		.from('group_membership_tiers')
		.insert(insertPayload)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	if (isDefault) {
		await serviceSupabase
			.from('group_membership_programs')
			.update({ default_tier_id: data.id, updated_at: toIsoNow() })
			.eq('id', program.id);
	}

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'tier.created',
		entity_type: 'group_membership_tier',
		entity_id: data.id,
		after_snapshot: data
	});

	return { ok: true, data };
}

export async function updateMembershipTier({ cookies, groupSlug, tierId, payload }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const before = await loadTierById(serviceSupabase, tierId);
	if (!before) return { ok: false, status: 404, error: 'Tier not found.' };

	const program = await ensureProgram(serviceSupabase, auth.group.id);
	if (before.program_id !== program.id) {
		return { ok: false, status: 403, error: 'Tier does not belong to this group.' };
	}

	const nextMonthlyAmount =
		payload?.monthly_amount_cents !== undefined || payload?.amount_cents !== undefined
			? normalizeNullableAmountCents(payload?.monthly_amount_cents ?? payload?.amount_cents)
			: normalizeNullableAmountCents(before.amount_cents);
	const nextAnnualAmount =
		payload?.annual_amount_cents !== undefined
			? normalizeNullableAmountCents(payload.annual_amount_cents)
			: normalizeNullableAmountCents(before.annual_amount_cents);
	const nextAllowCustom =
		payload?.allow_custom_amount !== undefined
			? normalizeBoolean(payload.allow_custom_amount, before.allow_custom_amount === true)
			: before.allow_custom_amount === true;
	const nextBillingType =
		nextMonthlyAmount !== null || nextAnnualAmount !== null || nextAllowCustom
			? 'recurring'
			: 'one_time';
	const pricingChanged =
		nextMonthlyAmount !==
			normalizeNullableAmountCents(before.monthly_amount_cents ?? before.amount_cents) ||
		nextAnnualAmount !== normalizeNullableAmountCents(before.annual_amount_cents) ||
		nextBillingType !== before.billing_type ||
		nextAllowCustom !== (before.allow_custom_amount === true) ||
		(payload?.currency !== undefined ? normalizeCurrency(payload.currency) : before.currency) !==
			before.currency;

	const updates = {
		name: payload?.name !== undefined ? cleanText(payload?.name, 80) : before.name,
		description:
			payload?.description !== undefined
				? cleanNullableText(payload?.description, 1000)
				: before.description,
		amount_cents: nextMonthlyAmount ?? 0,
		monthly_amount_cents: nextMonthlyAmount,
		annual_amount_cents: nextAnnualAmount,
		currency:
			payload?.currency !== undefined ? normalizeCurrency(payload.currency) : before.currency,
		billing_type: nextBillingType,
		interval_unit: nextBillingType === 'recurring' ? 'month' : null,
		interval_count: nextBillingType === 'recurring' ? 1 : null,
		is_default:
			payload?.is_default !== undefined
				? normalizeBoolean(payload.is_default, false)
				: before.is_default,
		is_active:
			payload?.is_active !== undefined
				? normalizeBoolean(payload.is_active, before.is_active !== false)
				: before.is_active,
		sort_order:
			payload?.sort_order !== undefined
				? normalizeInteger(payload.sort_order, before.sort_order || 0)
				: before.sort_order,
		allow_custom_amount:
			payload?.allow_custom_amount !== undefined
				? normalizeBoolean(payload.allow_custom_amount, before.allow_custom_amount === true)
				: before.allow_custom_amount,
		min_amount_cents:
			payload?.min_amount_cents !== undefined
				? normalizeInteger(payload.min_amount_cents, before.min_amount_cents)
				: before.min_amount_cents,
		stripe_price_id: pricingChanged
			? null
			: payload?.stripe_price_id !== undefined
				? cleanNullableText(payload.stripe_price_id, 255)
				: before.stripe_price_id,
		stripe_product_id:
			payload?.stripe_product_id !== undefined
				? cleanNullableText(payload.stripe_product_id, 255)
				: before.stripe_product_id,
		stripe_monthly_price_id: pricingChanged
			? null
			: payload?.stripe_monthly_price_id !== undefined
				? cleanNullableText(payload.stripe_monthly_price_id, 255)
				: before.stripe_monthly_price_id,
		stripe_annual_price_id: pricingChanged
			? null
			: payload?.stripe_annual_price_id !== undefined
				? cleanNullableText(payload.stripe_annual_price_id, 255)
				: before.stripe_annual_price_id,
		stripe_account_id: pricingChanged ? null : before.stripe_account_id,
		updated_at: toIsoNow()
	};

	if (!updates.name) return { ok: false, status: 400, error: 'Tier name is required.' };

	if (updates.is_default) {
		await serviceSupabase
			.from('group_membership_tiers')
			.update({ is_default: false, updated_at: toIsoNow() })
			.eq('program_id', before.program_id)
			.neq('id', before.id)
			.eq('is_default', true);
	}

	const { data, error } = await serviceSupabase
		.from('group_membership_tiers')
		.update(updates)
		.eq('id', before.id)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	if (updates.is_default) {
		await serviceSupabase
			.from('group_membership_programs')
			.update({ default_tier_id: data.id, updated_at: toIsoNow() })
			.eq('id', program.id);
	}

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'tier.updated',
		entity_type: 'group_membership_tier',
		entity_id: data.id,
		before_snapshot: before,
		after_snapshot: data
	});

	return { ok: true, data };
}

export async function deleteMembershipTier({ cookies, groupSlug, tierId }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const before = await loadTierById(serviceSupabase, tierId);
	if (!before) return { ok: false, status: 404, error: 'Tier not found.' };

	const program = await ensureProgram(serviceSupabase, auth.group.id);
	if (before.program_id !== program.id) {
		return { ok: false, status: 403, error: 'Tier does not belong to this group.' };
	}

	const { error } = await serviceSupabase.from('group_membership_tiers').delete().eq('id', tierId);
	if (error) return { ok: false, status: 400, error: error.message };

	if (program.default_tier_id === tierId) {
		await serviceSupabase
			.from('group_membership_programs')
			.update({ default_tier_id: null, updated_at: toIsoNow() })
			.eq('id', program.id);
	}

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'tier.deleted',
		entity_type: 'group_membership_tier',
		entity_id: tierId,
		before_snapshot: before
	});

	return { ok: true, data: { id: tierId } };
}

export async function listMembershipFormFields({ cookies, groupSlug, includeInactive = false }) {
	const viewerResult = await getMembershipProgramForViewer({
		cookies,
		groupSlug,
		includeInactive
	});
	if (!viewerResult.ok) return viewerResult;
	return {
		ok: true,
		data: {
			group: viewerResult.data.group,
			program: viewerResult.data.program,
			form_fields: viewerResult.data.form_fields,
			can_manage: viewerResult.data.can_manage
		}
	};
}

export async function createMembershipFormField({ cookies, groupSlug, payload }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;
	const serviceSupabase = auth.serviceSupabase;
	const program = await ensureProgram(serviceSupabase, auth.group.id);

	const fieldType = cleanText(payload?.field_type, 32).toLowerCase();
	const allowedTypes = new Set([
		'text',
		'textarea',
		'email',
		'phone',
		'number',
		'select',
		'multiselect',
		'checkbox',
		'date'
	]);
	if (!allowedTypes.has(fieldType)) {
		return { ok: false, status: 400, error: 'Unsupported field_type.' };
	}

	const options = Array.isArray(payload?.options_json)
		? payload.options_json
		: typeof payload?.options_json === 'string' && payload.options_json
			? payload.options_json
			: [];

	const insertPayload = {
		program_id: program.id,
		field_type: fieldType,
		label: cleanText(payload?.label || '', 120),
		help_text: cleanNullableText(payload?.help_text, 1000),
		required: normalizeBoolean(payload?.required, false),
		options_json: options,
		sort_order: normalizeInteger(payload?.sort_order, 0) || 0,
		active: normalizeBoolean(payload?.active, true),
		created_at: toIsoNow(),
		updated_at: toIsoNow()
	};

	if (!insertPayload.label) {
		return { ok: false, status: 400, error: 'Field label is required.' };
	}

	const { data, error } = await serviceSupabase
		.from('group_membership_form_fields')
		.insert(insertPayload)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'form_field.created',
		entity_type: 'group_membership_form_field',
		entity_id: data.id,
		after_snapshot: data
	});

	return { ok: true, data };
}

export async function updateMembershipFormField({ cookies, groupSlug, fieldId, payload }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;
	const serviceSupabase = auth.serviceSupabase;

	const { data: before, error: beforeError } = await serviceSupabase
		.from('group_membership_form_fields')
		.select('*')
		.eq('id', fieldId)
		.maybeSingle();
	if (beforeError) return { ok: false, status: 400, error: beforeError.message };
	if (!before) return { ok: false, status: 404, error: 'Form field not found.' };

	const program = await ensureProgram(serviceSupabase, auth.group.id);
	if (before.program_id !== program.id) {
		return { ok: false, status: 403, error: 'Field does not belong to this group.' };
	}

	const updates = {
		label: payload?.label !== undefined ? cleanText(payload.label, 120) : before.label,
		help_text:
			payload?.help_text !== undefined
				? cleanNullableText(payload.help_text, 1000)
				: before.help_text,
		required:
			payload?.required !== undefined
				? normalizeBoolean(payload.required, before.required === true)
				: before.required,
		options_json:
			payload?.options_json !== undefined ? payload.options_json : before.options_json || [],
		sort_order:
			payload?.sort_order !== undefined
				? normalizeInteger(payload.sort_order, before.sort_order || 0)
				: before.sort_order,
		active:
			payload?.active !== undefined
				? normalizeBoolean(payload.active, before.active !== false)
				: before.active,
		updated_at: toIsoNow()
	};

	if (!updates.label) {
		return { ok: false, status: 400, error: 'Field label is required.' };
	}

	const { data, error } = await serviceSupabase
		.from('group_membership_form_fields')
		.update(updates)
		.eq('id', fieldId)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'form_field.updated',
		entity_type: 'group_membership_form_field',
		entity_id: data.id,
		before_snapshot: before,
		after_snapshot: data
	});

	return { ok: true, data };
}

export async function deleteMembershipFormField({ cookies, groupSlug, fieldId }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;
	const serviceSupabase = auth.serviceSupabase;

	const { data: before, error: beforeError } = await serviceSupabase
		.from('group_membership_form_fields')
		.select('*')
		.eq('id', fieldId)
		.maybeSingle();
	if (beforeError) return { ok: false, status: 400, error: beforeError.message };
	if (!before) return { ok: false, status: 404, error: 'Form field not found.' };

	const program = await ensureProgram(serviceSupabase, auth.group.id);
	if (before.program_id !== program.id) {
		return { ok: false, status: 403, error: 'Field does not belong to this group.' };
	}

	const { error } = await serviceSupabase
		.from('group_membership_form_fields')
		.delete()
		.eq('id', fieldId);
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'form_field.deleted',
		entity_type: 'group_membership_form_field',
		entity_id: fieldId,
		before_snapshot: before
	});

	return { ok: true, data: { id: fieldId } };
}

export async function applyForMembership({ cookies, groupSlug, payload, fetchImpl }) {
	const auth = await requireMembershipUser(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	await upsertMembershipUserProfile({
		serviceSupabase,
		userId: auth.userId,
		currentEmail: auth.userEmail,
		profilePayload: payload?.profile
	});
	const { program, tier, fields } = await resolveGroupProgramAndTier(
		serviceSupabase,
		auth.group.id,
		cleanNullableText(payload?.selected_tier_id, 64)
	);

	if (!program || program.enabled === false) {
		return { ok: false, status: 409, error: 'Membership is not currently enabled for this group.' };
	}
	const contributionMode = normalizeContributionMode(program.contribution_mode, 'donation');
	if (contributionMode === 'paid' && tier) {
		const requestedInterval = cleanNullableText(payload?.billing_interval, 16);
		const billingInterval = resolveTierBillingInterval(tier, requestedInterval || 'month');
		const amountCents = normalizeAmountCents(resolveTierAmountByInterval(tier, billingInterval), 0);
		if (amountCents <= 0) {
			return {
				ok: false,
				status: 400,
				error: 'Paid mode requires selecting a tier with a non-zero monthly or annual amount.'
			};
		}
	}

	const selectedTierId = tier?.id || null;
	const submittedAt = toIsoNow();
	const answers = Array.isArray(payload?.answers) ? payload.answers : [];
	const answerByFieldId = new Map(
		answers.map((answer) => [cleanText(answer?.field_id, 64), answer?.value_json ?? null])
	);
	for (const field of fields.filter((entry) => entry.active !== false && entry.required === true)) {
		const value = answerByFieldId.get(field.id);
		const hasValue = Array.isArray(value)
			? value.length > 0
			: typeof value === 'boolean'
				? value === true
				: cleanText(value ?? '', 1000).length > 0;
		if (!hasValue) {
			return { ok: false, status: 400, error: `${field.label} is required.` };
		}
	}
	const applicationPayload = {
		group_id: auth.group.id,
		user_id: auth.userId,
		status: 'submitted',
		selected_tier_id: selectedTierId,
		policy_version_accepted: normalizeInteger(program.policy_version, 1) || 1,
		submitted_at: submittedAt,
		created_at: submittedAt,
		updated_at: submittedAt
	};

	const { data: application, error: appError } = await serviceSupabase
		.from('group_membership_applications')
		.insert(applicationPayload)
		.select('*')
		.single();
	if (appError) return { ok: false, status: 400, error: appError.message };

	if (answers.length && fields.length) {
		const validFieldIds = new Set(
			fields.filter((field) => field.active !== false).map((field) => field.id)
		);
		const insertAnswers = answers
			.map((answer) => ({
				application_id: application.id,
				field_id: cleanText(answer?.field_id, 64),
				value_json: answer?.value_json ?? null,
				created_at: submittedAt,
				updated_at: submittedAt
			}))
			.filter((answer) => answer.field_id && validFieldIds.has(answer.field_id));
		if (insertAnswers.length) {
			await serviceSupabase.from('group_membership_application_answers').insert(insertAnswers);
		}
	}

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'application.submitted',
		entity_type: 'group_membership_application',
		entity_id: application.id,
		after_snapshot: application
	});

	await sendOwnerNotification({
		serviceSupabase,
		group: auth.group,
		subject: `New membership application: ${auth.group.name}`,
		html: `<p>A new membership application was submitted for <strong>${auth.group.name}</strong>.</p><p>Application ID: ${application.id}</p>`,
		text: `A new membership application was submitted for ${auth.group.name}.\nApplication ID: ${application.id}`,
		tags: [{ Name: 'context', Value: 'membership-application-submitted' }],
		fetchImpl
	});

	return { ok: true, data: application };
}

export async function joinMembership({ cookies, groupSlug, payload }) {
	const auth = await requireMembershipUser(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	await upsertMembershipUserProfile({
		serviceSupabase,
		userId: auth.userId,
		currentEmail: auth.userEmail,
		profilePayload: payload?.profile
	});
	const requestedTierId = cleanNullableText(payload?.tier_id, 64);
	const requestedInterval = cleanNullableText(payload?.billing_interval, 16);
	const { program, tier } = await resolveGroupProgramAndTier(
		serviceSupabase,
		auth.group.id,
		requestedTierId
	);

	if (!program || program.enabled === false) {
		return { ok: false, status: 409, error: 'Membership is not currently enabled for this group.' };
	}
	if (program.access_mode === 'private_request') {
		return {
			ok: false,
			status: 403,
			error: 'This group requires an approved application before joining.'
		};
	}
	if (!tier) {
		return { ok: false, status: 400, error: 'Select a membership tier.' };
	}

	const billingInterval = resolveTierBillingInterval(tier, requestedInterval);
	const amountCents = normalizeAmountCents(resolveTierAmountByInterval(tier, billingInterval), 0);
	const customAmountCents = tier.allow_custom_amount
		? normalizeCustomAmountCents(payload?.custom_amount_cents, tier.min_amount_cents || 0)
		: null;
	const finalAmountCents = customAmountCents ?? amountCents;
	const contributionMode = normalizeContributionMode(program.contribution_mode, 'donation');
	const requiresCheckout =
		contributionMode === 'paid' ? true : Boolean(billingInterval) && finalAmountCents > 0;
	if (tier.allow_custom_amount && contributionMode === 'paid' && customAmountCents === null) {
		return {
			ok: false,
			status: 400,
			error: `Enter an amount of at least ${formatMoneyFromCents(tier.min_amount_cents || 0)}.`
		};
	}
	if (contributionMode === 'paid' && finalAmountCents <= 0) {
		return { ok: false, status: 400, error: 'Paid mode requires a tier with a non-zero amount.' };
	}
	if (requiresCheckout) {
		return {
			ok: true,
			data: {
				requires_checkout: true,
				billing_interval: billingInterval,
				custom_amount_cents: customAmountCents,
				tier,
				message: 'Complete checkout to activate this membership.'
			}
		};
	}

	const membership = await findOrCreateMembership({
		serviceSupabase,
		groupId: auth.group.id,
		userId: auth.userId,
		tierId: tier.id,
		billingInterval,
		contributionAmountCents: finalAmountCents,
		source: 'online',
		status: 'active'
	});

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'membership.joined',
		entity_type: 'group_membership',
		entity_id: membership.id,
		after_snapshot: membership
	});

	return { ok: true, data: { membership, requires_checkout: false } };
}

export async function createMembershipCheckout({ cookies, groupSlug, payload, requestUrl }) {
	const auth = await requireMembershipUser(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	await upsertMembershipUserProfile({
		serviceSupabase,
		userId: auth.userId,
		currentEmail: auth.userEmail,
		profilePayload: payload?.profile
	});
	const requestedTierId = cleanNullableText(payload?.tier_id, 64);
	const requestedInterval = cleanNullableText(payload?.billing_interval, 16);
	const applicationId = cleanNullableText(payload?.application_id, 64);
	const { program, tier } = await resolveGroupProgramAndTier(
		serviceSupabase,
		auth.group.id,
		requestedTierId
	);

	if (!program || program.enabled === false) {
		return { ok: false, status: 409, error: 'Membership is not currently enabled for this group.' };
	}
	if (!tier) return { ok: false, status: 400, error: 'Select a membership tier.' };

	let application = null;
	if (program.access_mode === 'private_request') {
		if (!applicationId) {
			return {
				ok: false,
				status: 400,
				error: 'Application ID is required before payment for private memberships.'
			};
		}
		application = await resolveApplicationContext(serviceSupabase, applicationId);
		if (
			!application ||
			application.group_id !== auth.group.id ||
			application.user_id !== auth.userId
		) {
			return { ok: false, status: 404, error: 'Application not found.' };
		}
		if (!['approved', 'payment_pending'].includes(application.status)) {
			return {
				ok: false,
				status: 409,
				error: 'Application must be approved before checkout is available.'
			};
		}
	}

	const billingInterval = resolveTierBillingInterval(tier, requestedInterval);
	const contributionMode = normalizeContributionMode(program.contribution_mode, 'donation');
	if (!billingInterval) {
		return {
			ok: false,
			status: 400,
			error: 'This tier does not have a monthly or annual rate configured.'
		};
	}
	const tierAmount = normalizeAmountCents(resolveTierAmountByInterval(tier, billingInterval), 0);
	const customAmountCents = tier.allow_custom_amount
		? normalizeCustomAmountCents(payload?.custom_amount_cents, tier.min_amount_cents || 0)
		: null;
	if (
		tier.allow_custom_amount &&
		payload?.custom_amount_cents !== undefined &&
		customAmountCents === null
	) {
		return {
			ok: false,
			status: 400,
			error: `Enter an amount of at least ${formatMoneyFromCents(tier.min_amount_cents || 0)}.`
		};
	}
	const finalAmount = customAmountCents ?? tierAmount;

	if (contributionMode === 'donation' && finalAmount <= 0) {
		const membership = await findOrCreateMembership({
			serviceSupabase,
			groupId: auth.group.id,
			userId: auth.userId,
			tierId: tier.id,
			billingInterval,
			contributionAmountCents: 0,
			source: 'online',
			applicationId: application?.id || null,
			status: 'active'
		});
		return { ok: true, data: { requires_checkout: false, membership } };
	}

	if (contributionMode === 'paid' && finalAmount <= 0) {
		return { ok: false, status: 400, error: 'Paid mode requires a tier with a non-zero amount.' };
	}

	const checkout = await createCheckoutSession({
		serviceSupabase,
		group: auth.group,
		program,
		tier,
		billingInterval,
		userId: auth.userId,
		userEmail: auth.userEmail,
		applicationId: application?.id || null,
		requestUrl,
		customAmountCents: customAmountCents ?? null
	});
	if (!checkout.ok) return checkout;

	if (application?.id) {
		await serviceSupabase
			.from('group_membership_applications')
			.update({
				status: 'payment_pending',
				payment_link_expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
				updated_at: toIsoNow()
			})
			.eq('id', application.id);
	}

	return {
		ok: true,
		data: {
			requires_checkout: true,
			checkout_url: checkout.checkoutUrl,
			session_id: checkout.sessionId,
			connected_account_id: checkout.connectedAccountId
		}
	};
}

export async function createMembershipPaymentIntent({ cookies, groupSlug, payload, requestUrl }) {
	const auth = await requireMembershipUser(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	await upsertMembershipUserProfile({
		serviceSupabase,
		userId: auth.userId,
		currentEmail: auth.userEmail,
		profilePayload: payload?.profile
	});
	const requestedTierId = cleanNullableText(payload?.tier_id, 64);
	const requestedInterval = cleanNullableText(payload?.billing_interval, 16);
	const applicationId = cleanNullableText(payload?.application_id, 64);
	const { program, tier } = await resolveGroupProgramAndTier(
		serviceSupabase,
		auth.group.id,
		requestedTierId
	);

	if (!program || program.enabled === false) {
		return { ok: false, status: 409, error: 'Membership is not currently enabled for this group.' };
	}
	if (!tier) return { ok: false, status: 400, error: 'Select a membership tier.' };

	let application = null;
	if (program.access_mode === 'private_request') {
		if (!applicationId) {
			return {
				ok: false,
				status: 400,
				error: 'Application ID is required before payment for private memberships.'
			};
		}
		application = await resolveApplicationContext(serviceSupabase, applicationId);
		if (
			!application ||
			application.group_id !== auth.group.id ||
			application.user_id !== auth.userId
		) {
			return { ok: false, status: 404, error: 'Application not found.' };
		}
		if (!['approved', 'payment_pending'].includes(application.status)) {
			return {
				ok: false,
				status: 409,
				error: 'Application must be approved before checkout is available.'
			};
		}
	}

	const billingInterval = resolveTierBillingInterval(tier, requestedInterval);
	const contributionMode = normalizeContributionMode(program.contribution_mode, 'donation');
	if (!billingInterval) {
		return {
			ok: false,
			status: 400,
			error: 'This tier does not have a monthly or annual rate configured.'
		};
	}

	const tierAmount = normalizeAmountCents(resolveTierAmountByInterval(tier, billingInterval), 0);
	const customAmountCents = tier.allow_custom_amount
		? normalizeCustomAmountCents(payload?.custom_amount_cents, tier.min_amount_cents || 0)
		: null;
	if (
		tier.allow_custom_amount &&
		payload?.custom_amount_cents !== undefined &&
		customAmountCents === null
	) {
		return {
			ok: false,
			status: 400,
			error: `Enter an amount of at least ${formatMoneyFromCents(tier.min_amount_cents || 0)}.`
		};
	}
	const finalAmount = customAmountCents ?? tierAmount;

	if (contributionMode === 'donation' && finalAmount <= 0) {
		const membership = await findOrCreateMembership({
			serviceSupabase,
			groupId: auth.group.id,
			userId: auth.userId,
			tierId: tier.id,
			billingInterval,
			contributionAmountCents: 0,
			source: 'online',
			applicationId: application?.id || null,
			status: 'active'
		});
		return { ok: true, data: { requires_payment: false, membership } };
	}

	if (contributionMode === 'paid' && finalAmount <= 0) {
		return { ok: false, status: 400, error: 'Paid mode requires a tier with a non-zero amount.' };
	}

	const donationAccount = await loadDonationAccountForGroup(serviceSupabase, auth.group.id);
	if (!donationAccount?.stripe_account_id || donationAccount?.charges_enabled !== true) {
		return {
			ok: false,
			status: 409,
			error: 'This group has not connected Stripe for memberships.'
		};
	}

	const baseUrl = resolvePublicBaseUrl(requestUrl);
	if (!baseUrl) {
		return { ok: false, status: 500, error: 'PUBLIC_URL_BASE is not configured.' };
	}

	const stripe = getStripeClient();
	const currency = normalizeCurrency(tier.currency);
	const billingType = tier?.billing_type === 'one_time' ? 'one_time' : 'recurring';
	const paymentMode = billingType === 'one_time' ? 'payment' : 'subscription';
	const metadata = {
		membership_flow: 'group_membership',
		membership_group_id: auth.group.id,
		membership_group_slug: auth.group.slug,
		membership_program_id: program.id,
		membership_tier_id: tier.id,
		membership_user_id: auth.userId,
		membership_application_id: application?.id || '',
		membership_contribution_mode: contributionMode,
		membership_billing_type: billingType,
		membership_interval_unit: billingInterval || '',
		membership_amount_cents: String(finalAmount)
	};

	let paymentIntent = null;
	let subscription = null;
	let latestInvoiceSnapshot = null;
	let clientSecret = '';
	let clientSecretSource = '';
	try {
		if (paymentMode === 'payment') {
			paymentIntent = await stripe.paymentIntents.create(
				{
					amount: finalAmount,
					currency,
					automatic_payment_methods: { enabled: true },
					receipt_email: auth.userEmail || undefined,
					description: `${auth.group.name} Membership: ${tier.name}`,
					metadata
				},
				{ stripeAccount: donationAccount.stripe_account_id }
			);
			clientSecret = cleanText(paymentIntent?.client_secret || '', 2000);
			clientSecretSource = clientSecret ? 'payment_intent.create.client_secret' : '';
		} else {
			const customer = await stripe.customers.create(
				{
					email: auth.userEmail || undefined,
					metadata: {
						membership_group_id: auth.group.id,
						membership_user_id: auth.userId
					}
				},
				{ stripeAccount: donationAccount.stripe_account_id }
			);
			const { priceId: recurringPriceId } = await ensureStripeCatalogForMembershipTier({
				serviceSupabase,
				group: auth.group,
				tier,
				stripeAccountId: donationAccount.stripe_account_id,
				intervalUnit: billingInterval,
				amountCents: finalAmount
			});
			if (!recurringPriceId) {
				throw new Error('Unable to prepare Stripe price for this membership tier.');
			}
			metadata.membership_tier_price_id = recurringPriceId;
			subscription = await stripe.subscriptions.create(
				{
					customer: customer.id,
					collection_method: 'charge_automatically',
					payment_behavior: 'default_incomplete',
					payment_settings: {
						save_default_payment_method: 'on_subscription'
					},
					items: [
						{
							price: recurringPriceId
						}
					],
					metadata,
					expand: [
						'latest_invoice.confirmation_secret',
						'latest_invoice.payment_intent',
						'pending_setup_intent'
					]
				},
				{ stripeAccount: donationAccount.stripe_account_id }
			);
			latestInvoiceSnapshot =
				subscription?.latest_invoice && typeof subscription.latest_invoice === 'object'
					? subscription.latest_invoice
					: null;
			paymentIntent =
				subscription?.latest_invoice &&
				typeof subscription.latest_invoice === 'object' &&
				subscription.latest_invoice.payment_intent &&
				typeof subscription.latest_invoice.payment_intent === 'object'
					? subscription.latest_invoice.payment_intent
					: null;
			clientSecret = cleanText(
				subscription?.latest_invoice &&
					typeof subscription.latest_invoice === 'object' &&
					subscription.latest_invoice.confirmation_secret &&
					typeof subscription.latest_invoice.confirmation_secret === 'object'
					? subscription.latest_invoice.confirmation_secret.client_secret || ''
					: '',
				2000
			);
			clientSecretSource = clientSecret ? 'subscription.latest_invoice.confirmation_secret' : '';

			if (!paymentIntent) {
				const latestInvoiceId =
					typeof subscription?.latest_invoice === 'string'
						? subscription.latest_invoice
						: subscription?.latest_invoice?.id || null;
				if (latestInvoiceId) {
					const latestInvoice = await stripe.invoices.retrieve(
						latestInvoiceId,
						{ expand: ['confirmation_secret', 'payment_intent'] },
						{ stripeAccount: donationAccount.stripe_account_id }
					);
					latestInvoiceSnapshot = latestInvoice || null;
					if (latestInvoice?.payment_intent) {
						paymentIntent = latestInvoice.payment_intent;
					}
					if (
						!clientSecret &&
						latestInvoice?.confirmation_secret &&
						typeof latestInvoice.confirmation_secret === 'object'
					) {
						clientSecret = cleanText(latestInvoice.confirmation_secret.client_secret || '', 2000);
						clientSecretSource = clientSecret
							? 'invoice.retrieve.confirmation_secret'
							: clientSecretSource;
					}
				}
			}

			let paymentIntentId =
				typeof paymentIntent === 'string'
					? paymentIntent
					: paymentIntent && typeof paymentIntent === 'object'
						? paymentIntent.id || null
						: null;

			const missingClientSecret =
				!paymentIntent ||
				typeof paymentIntent !== 'object' ||
				!cleanText(paymentIntent.client_secret || '', 2000);
			if (paymentIntentId && missingClientSecret) {
				const expandedIntent = await stripe.paymentIntents.retrieve(
					paymentIntentId,
					{},
					{ stripeAccount: donationAccount.stripe_account_id }
				);
				if (expandedIntent?.id) {
					paymentIntent = expandedIntent;
					paymentIntentId = expandedIntent.id;
					clientSecret = cleanText(expandedIntent.client_secret || '', 2000) || clientSecret;
					if (cleanText(expandedIntent.client_secret || '', 2000)) {
						clientSecretSource = 'payment_intent.retrieve.client_secret';
					}
				}
			}
		}
	} catch (error) {
		return {
			ok: false,
			status: 502,
			error: error?.message || 'Unable to prepare Stripe payment form.'
		};
	}

	const paymentIntentId =
		typeof paymentIntent === 'string'
			? paymentIntent
			: paymentIntent && typeof paymentIntent === 'object'
				? paymentIntent.id || null
				: null;
	const resolvedClientSecret =
		cleanText(
			typeof paymentIntent === 'object' && paymentIntent ? paymentIntent.client_secret || '' : '',
			2000
		) || clientSecret;
	if (!resolvedClientSecret) {
		const invoicePaid =
			latestInvoiceSnapshot?.paid === true ||
			cleanText(latestInvoiceSnapshot?.status || '', 20) === 'paid' ||
			Number(latestInvoiceSnapshot?.amount_due || 0) <= 0;
		if (subscription?.id && invoicePaid) {
			const activation = await activateMembershipFromMetadata({
				serviceSupabase,
				metadata,
				stripeSession: {
					payment_status: 'paid',
					status: 'succeeded',
					customer: subscription.customer || null,
					subscription: subscription.id
				},
				stripeAccountId: donationAccount.stripe_account_id,
				fetchImpl: null
			});
			if (activation?.ok) {
				return {
					ok: true,
					data: {
						requires_payment: false,
						membership_id: activation.membership_id || null,
						connected_account_id: donationAccount.stripe_account_id,
						payment_mode: paymentMode,
						return_url: `${baseUrl}/groups/${encodeURIComponent(auth.group.slug)}/membership`
					}
				};
			}
		}
		return { ok: false, status: 502, error: 'Stripe did not return a usable payment intent.' };
	}

	if (application?.id) {
		await serviceSupabase
			.from('group_membership_applications')
			.update({
				status: 'payment_pending',
				payment_link_expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
				updated_at: toIsoNow()
			})
			.eq('id', application.id);
	}

	return {
		ok: true,
		data: {
			requires_payment: true,
			client_secret: resolvedClientSecret,
			payment_intent_id: paymentIntentId,
			subscription_id: subscription?.id || null,
			connected_account_id: donationAccount.stripe_account_id,
			payment_mode: paymentMode,
			return_url: `${baseUrl}/groups/${encodeURIComponent(auth.group.slug)}/membership`
		}
	};
}

export async function updateMembershipPaymentIntent({ cookies, groupSlug, payload, requestUrl }) {
	// Membership pricing can affect recurring invoice setup; safest path is to recreate the Stripe intent/subscription.
	return createMembershipPaymentIntent({ cookies, groupSlug, payload, requestUrl });
}

export async function finalizeMembershipPaymentIntent({ cookies, groupSlug, payload, fetchImpl }) {
	const auth = await requireMembershipUser(cookies, groupSlug);
	if (!auth.ok) return auth;

	const paymentIntentId = cleanNullableText(payload?.payment_intent_id, 255);
	const subscriptionIdFromPayload = cleanNullableText(payload?.subscription_id, 255);
	if (!paymentIntentId && !subscriptionIdFromPayload) {
		return {
			ok: false,
			status: 400,
			error: 'payment_intent_id or subscription_id is required.'
		};
	}

	const donationAccount = await loadDonationAccountForGroup(auth.serviceSupabase, auth.group.id);
	if (!donationAccount?.stripe_account_id || donationAccount?.charges_enabled !== true) {
		return {
			ok: false,
			status: 409,
			error: 'This group has not connected Stripe for memberships.'
		};
	}

	const stripe = getStripeClient();
	let paymentIntent = null;
	let resolvedSubscriptionId = subscriptionIdFromPayload || null;
	let subscriptionMetadata = null;
	try {
		if (paymentIntentId) {
			paymentIntent = await stripe.paymentIntents.retrieve(
				paymentIntentId,
				{ expand: ['invoice.subscription'] },
				{ stripeAccount: donationAccount.stripe_account_id }
			);
			if (
				paymentIntent?.invoice &&
				typeof paymentIntent.invoice === 'object' &&
				paymentIntent.invoice.subscription &&
				typeof paymentIntent.invoice.subscription === 'object'
			) {
				resolvedSubscriptionId = paymentIntent.invoice.subscription.id || resolvedSubscriptionId;
				subscriptionMetadata =
					paymentIntent.invoice.subscription.metadata &&
					typeof paymentIntent.invoice.subscription.metadata === 'object'
						? paymentIntent.invoice.subscription.metadata
						: null;
			}
			if (!subscriptionMetadata && subscriptionIdFromPayload) {
				const payloadSubscription = await stripe.subscriptions.retrieve(
					subscriptionIdFromPayload,
					{},
					{ stripeAccount: donationAccount.stripe_account_id }
				);
				resolvedSubscriptionId = payloadSubscription.id || resolvedSubscriptionId;
				subscriptionMetadata =
					payloadSubscription?.metadata && typeof payloadSubscription.metadata === 'object'
						? payloadSubscription.metadata
						: null;
			}
		} else if (subscriptionIdFromPayload) {
			const subscription = await stripe.subscriptions.retrieve(
				subscriptionIdFromPayload,
				{ expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payment_intent'] },
				{ stripeAccount: donationAccount.stripe_account_id }
			);
			resolvedSubscriptionId = subscription.id;
			subscriptionMetadata =
				subscription?.metadata && typeof subscription.metadata === 'object'
					? subscription.metadata
					: null;
			const latestInvoice =
				subscription?.latest_invoice && typeof subscription.latest_invoice === 'object'
					? subscription.latest_invoice
					: null;
			if (latestInvoice?.payment_intent) {
				paymentIntent =
					typeof latestInvoice.payment_intent === 'object'
						? latestInvoice.payment_intent
						: await stripe.paymentIntents.retrieve(
								latestInvoice.payment_intent,
								{ expand: ['invoice.subscription'] },
								{ stripeAccount: donationAccount.stripe_account_id }
							);
			}
		}
	} catch {
		return { ok: false, status: 502, error: 'Unable to verify Stripe payment intent.' };
	}
	if (!paymentIntent) {
		return {
			ok: true,
			data: {
				completed: false,
				payment_status: 'processing'
			}
		};
	}

	const metadata = isMembershipMetadata(paymentIntent?.metadata)
		? paymentIntent.metadata
		: isMembershipMetadata(subscriptionMetadata)
			? subscriptionMetadata
			: {};
	if (!isMembershipMetadata(metadata)) {
		return { ok: false, status: 409, error: 'This payment intent is not a membership payment.' };
	}
	if (
		cleanText(metadata.membership_group_id, 64) !== auth.group.id ||
		cleanText(metadata.membership_user_id, 64) !== auth.userId
	) {
		return {
			ok: false,
			status: 403,
			error: 'Payment intent does not belong to this membership context.'
		};
	}

	if (paymentIntent.status !== 'succeeded') {
		return {
			ok: true,
			data: {
				completed: false,
				payment_status: paymentIntent.status
			}
		};
	}

	const subscriptionId =
		paymentIntent?.invoice &&
		typeof paymentIntent.invoice === 'object' &&
		paymentIntent.invoice.subscription &&
		typeof paymentIntent.invoice.subscription === 'object'
			? paymentIntent.invoice.subscription.id || null
			: resolvedSubscriptionId;

	const activation = await activateMembershipFromMetadata({
		serviceSupabase: auth.serviceSupabase,
		metadata,
		stripeSession: {
			payment_status: 'paid',
			status: 'succeeded',
			customer: paymentIntent.customer,
			subscription: subscriptionId
		},
		stripeAccountId: donationAccount.stripe_account_id,
		fetchImpl
	});

	if (!activation?.ok) {
		return {
			ok: false,
			status: 500,
			error: activation?.error || 'Unable to activate membership after payment confirmation.'
		};
	}

	return {
		ok: true,
		data: {
			completed: true,
			membership_id: activation.membership_id || null,
			payment_status: paymentIntent.status
		}
	};
}

export async function requestMembershipTierChange({ cookies, groupSlug, payload }) {
	const auth = await requireMembershipUser(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const membershipId = cleanNullableText(payload?.membership_id, 64);
	const requestedTierId = cleanNullableText(payload?.requested_tier_id, 64);
	if (!requestedTierId) {
		return { ok: false, status: 400, error: 'requested_tier_id is required.' };
	}

	let membership = null;
	if (membershipId) {
		membership = await loadMembershipById(serviceSupabase, membershipId);
	} else {
		const { data } = await serviceSupabase
			.from('group_memberships')
			.select('*')
			.eq('group_id', auth.group.id)
			.eq('user_id', auth.userId)
			.in('status', ['active', 'past_due', 'paused'])
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		membership = data || null;
	}

	if (!membership || membership.group_id !== auth.group.id) {
		return { ok: false, status: 404, error: 'Membership not found.' };
	}
	if (!auth.canManage && membership.user_id !== auth.userId) {
		return { ok: false, status: 403, error: 'You cannot change this membership.' };
	}

	const requestedTier = await loadTierById(serviceSupabase, requestedTierId);
	if (!requestedTier) return { ok: false, status: 404, error: 'Requested tier not found.' };
	if (requestedTier.allow_custom_amount === true) {
		return {
			ok: false,
			status: 400,
			error:
				'Changing to a pay-what-you-want tier is not supported yet. Join that tier separately with an amount.'
		};
	}

	const { data: program } = await serviceSupabase
		.from('group_membership_programs')
		.select('id')
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (!program || requestedTier.program_id !== program.id) {
		return { ok: false, status: 400, error: 'Requested tier does not belong to this group.' };
	}

	const now = toIsoNow();
	const { data: existingPending, error: existingPendingError } = await serviceSupabase
		.from('group_membership_tier_change_requests')
		.select('*')
		.eq('membership_id', membership.id)
		.eq('status', 'pending')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (existingPendingError) {
		return { ok: false, status: 400, error: existingPendingError.message };
	}

	let rollbackPending = null;
	let data = null;
	if (existingPending) {
		rollbackPending = {
			mode: 'update',
			record: {
				requested_tier_id: existingPending.requested_tier_id,
				effective_at_cycle_end: existingPending.effective_at_cycle_end,
				requested_by: existingPending.requested_by,
				updated_at: existingPending.updated_at
			}
		};
		const { data: updatedRequest, error: updateError } = await serviceSupabase
			.from('group_membership_tier_change_requests')
			.update({
				requested_tier_id: requestedTier.id,
				effective_at_cycle_end: true,
				requested_by: auth.userId,
				updated_at: now
			})
			.eq('id', existingPending.id)
			.select('*')
			.single();
		if (updateError) return { ok: false, status: 400, error: updateError.message };
		data = updatedRequest;
	} else {
		rollbackPending = { mode: 'delete' };
		const { data: insertedRequest, error: insertError } = await serviceSupabase
			.from('group_membership_tier_change_requests')
			.insert({
				membership_id: membership.id,
				requested_tier_id: requestedTier.id,
				effective_at_cycle_end: true,
				status: 'pending',
				requested_by: auth.userId,
				updated_at: now,
				created_at: now
			})
			.select('*')
			.single();
		if (insertError) return { ok: false, status: 400, error: insertError.message };
		data = insertedRequest;
	}

	try {
		const donationAccount = await loadDonationAccountForGroup(serviceSupabase, auth.group.id);
		if (donationAccount?.stripe_account_id && requestedTier.billing_type === 'recurring') {
			await updateStripeSubscriptionPriceForTierChange({
				serviceSupabase,
				membership,
				requestedTier,
				stripeAccountId: donationAccount.stripe_account_id
			});
		}
	} catch (error) {
		if (data?.id && rollbackPending?.mode === 'delete') {
			await serviceSupabase
				.from('group_membership_tier_change_requests')
				.delete()
				.eq('id', data.id);
		}
		if (data?.id && rollbackPending?.mode === 'update' && rollbackPending.record) {
			await serviceSupabase
				.from('group_membership_tier_change_requests')
				.update(rollbackPending.record)
				.eq('id', data.id);
		}
		return {
			ok: false,
			status: 502,
			error: error?.message || 'Unable to update the Stripe subscription for this tier change.'
		};
	}

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'tier_change.requested',
		entity_type: 'group_membership_tier_change_request',
		entity_id: data.id,
		after_snapshot: data
	});

	return { ok: true, data };
}

export async function cancelMembership({ cookies, groupSlug, payload, fetchImpl }) {
	const auth = await requireMembershipUser(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const membershipId = cleanNullableText(payload?.membership_id, 64);
	const resumeRequested = normalizeBoolean(payload?.resume, false);
	if (!membershipId) return { ok: false, status: 400, error: 'membership_id is required.' };

	const membership = await loadMembershipById(serviceSupabase, membershipId);
	if (!membership || membership.group_id !== auth.group.id) {
		return { ok: false, status: 404, error: 'Membership not found.' };
	}
	if (!auth.canManage && membership.user_id !== auth.userId) {
		return { ok: false, status: 403, error: 'You cannot cancel this membership.' };
	}

	const { data: billing } = await serviceSupabase
		.from('group_membership_billing')
		.select('*')
		.eq('membership_id', membership.id)
		.maybeSingle();

	if (resumeRequested) {
		if (!membership.cancel_at_period_end) {
			return { ok: false, status: 409, error: 'This membership is not pending cancellation.' };
		}
		if (billing?.stripe_subscription_id) {
			const donationAccount = await loadDonationAccountForGroup(serviceSupabase, auth.group.id);
			const stripeAccount = donationAccount?.stripe_account_id || null;
			try {
				const stripe = getStripeClient();
				await stripe.subscriptions.update(
					billing.stripe_subscription_id,
					{ cancel_at_period_end: false },
					stripeAccount ? { stripeAccount } : undefined
				);
			} catch (error) {
				return { ok: false, status: 502, error: error?.message || 'Unable to renew subscription.' };
			}
		}

		const { data, error } = await serviceSupabase
			.from('group_memberships')
			.update({
				cancel_at_period_end: false,
				status: 'active',
				ends_at: null,
				updated_at: toIsoNow()
			})
			.eq('id', membership.id)
			.select('*')
			.single();
		if (error) return { ok: false, status: 400, error: error.message };

		await writeAuditLog(serviceSupabase, {
			group_id: auth.group.id,
			actor_user_id: auth.userId,
			action: 'membership.renewed',
			entity_type: 'group_membership',
			entity_id: membership.id,
			before_snapshot: membership,
			after_snapshot: data
		});

		return { ok: true, data };
	}

	let updates = null;
	if (billing?.stripe_subscription_id) {
		const donationAccount = await loadDonationAccountForGroup(serviceSupabase, auth.group.id);
		const stripeAccount = donationAccount?.stripe_account_id || null;
		try {
			const stripe = getStripeClient();
			await stripe.subscriptions.update(
				billing.stripe_subscription_id,
				{ cancel_at_period_end: true },
				stripeAccount ? { stripeAccount } : undefined
			);
		} catch (error) {
			return { ok: false, status: 502, error: error?.message || 'Unable to cancel subscription.' };
		}

		updates = {
			cancel_at_period_end: true,
			updated_at: toIsoNow()
		};
	} else {
		updates = {
			status: 'cancelled',
			cancel_at_period_end: false,
			ends_at: toIsoNow(),
			updated_at: toIsoNow()
		};
	}

	const { data, error } = await serviceSupabase
		.from('group_memberships')
		.update(updates)
		.eq('id', membership.id)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'membership.cancelled',
		entity_type: 'group_membership',
		entity_id: membership.id,
		before_snapshot: membership,
		after_snapshot: data
	});

	const profileMap = await resolveProfileMapByUserIds(serviceSupabase, [membership.user_id]);
	const memberProfile = profileMap.get(membership.user_id) || null;
	const tier = membership.tier_id ? await loadTierById(serviceSupabase, membership.tier_id) : null;
	const memberName = cleanText(memberProfile?.full_name || '', 120) || 'Member';
	const memberEmail = sanitizeEmail(memberProfile?.email || '');
	const tierName = cleanText(tier?.name || 'Membership', 120);
	const amountCents = normalizeAmountCents(
		data?.contribution_amount_cents ?? membership?.contribution_amount_cents,
		0
	);
	const billingInterval =
		cleanNullableText(data?.interval_unit || membership?.interval_unit, 16) || null;
	const contribution =
		amountCents > 0
			? `${formatMoneyFromCents(amountCents, tier?.currency || 'usd')}/${intervalLabel(billingInterval)}`
			: 'Free';
	const effectiveLabel =
		data?.cancel_at_period_end === true
			? data?.renews_at
				? `Cancels at the end of the current billing period on ${formatDate(data.renews_at)}.`
				: 'Cancels at the end of the current billing period.'
			: data?.ends_at
				? `Ended on ${formatDate(data.ends_at)}.`
				: 'Ended immediately.';
	const memberMembershipUrl = resolveAbsoluteUrl(`/groups/${auth.group.slug}/membership`);

	await sendOwnerNotification({
		serviceSupabase,
		group: auth.group,
		subject: `Membership cancelled: ${auth.group.name}`,
		html: `<p>A membership was cancelled in <strong>${auth.group.name}</strong>.</p>
<p><strong>Member:</strong> ${memberName}${memberEmail ? ` (${memberEmail})` : ''}<br />
<strong>Tier:</strong> ${tierName}<br />
<strong>Contribution:</strong> ${contribution}<br />
<strong>Status:</strong> ${effectiveLabel}</p>`,
		text: `A membership was cancelled in ${auth.group.name}.

Member: ${memberName}${memberEmail ? ` (${memberEmail})` : ''}
Tier: ${tierName}
Contribution: ${contribution}
Status: ${effectiveLabel}`,
		tags: [{ Name: 'context', Value: 'membership-cancelled' }],
		fetchImpl
	});

	await sendUserNotification({
		to: memberEmail,
		subject: `Membership update for ${auth.group.name}`,
		html: `<p>Hi ${memberName},</p>
<p>Your membership in <strong>${auth.group.name}</strong> has been cancelled.</p>
<p><strong>Tier:</strong> ${tierName}<br />
<strong>Contribution:</strong> ${contribution}<br />
<strong>Status:</strong> ${effectiveLabel}</p>
<p>You can revisit your membership anytime if you decide to join again.</p>
<p><a href="${memberMembershipUrl}">View Membership</a></p>`,
		text: `Hi ${memberName},

Your membership in ${auth.group.name} has been cancelled.

Tier: ${tierName}
Contribution: ${contribution}
Status: ${effectiveLabel}

View membership: ${memberMembershipUrl}`,
		tags: [{ Name: 'context', Value: 'membership-cancelled-member' }],
		fetchImpl
	});

	return { ok: true, data };
}

export async function listMembershipApplications({ cookies, groupSlug, status = null }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;
	const serviceSupabase = auth.serviceSupabase;

	let query = serviceSupabase
		.from('group_membership_applications')
		.select('*')
		.eq('group_id', auth.group.id)
		.order('submitted_at', { ascending: false })
		.limit(500);
	if (status) {
		query = query.eq('status', normalizeApplicationStatus(status, status));
	}

	const { data: applications, error } = await query;
	if (error) return { ok: false, status: 400, error: error.message };

	const rows = applications || [];
	const appIds = rows.map((row) => row.id);
	const userIds = rows.map((row) => row.user_id);
	const tierIds = rows.map((row) => row.selected_tier_id).filter(Boolean);

	const [answersRes, profileMap, tierRowsRes] = await Promise.all([
		appIds.length
			? serviceSupabase
					.from('group_membership_application_answers')
					.select('*')
					.in('application_id', appIds)
			: Promise.resolve({ data: [], error: null }),
		resolveProfileMapByUserIds(serviceSupabase, userIds),
		tierIds.length
			? serviceSupabase.from('group_membership_tiers').select('id,name').in('id', tierIds)
			: Promise.resolve({ data: [], error: null })
	]);
	if (answersRes.error) return { ok: false, status: 400, error: answersRes.error.message };
	if (tierRowsRes.error) return { ok: false, status: 400, error: tierRowsRes.error.message };

	const answersByApp = new Map();
	for (const answer of answersRes.data || []) {
		if (!answersByApp.has(answer.application_id)) answersByApp.set(answer.application_id, []);
		answersByApp.get(answer.application_id).push(answer);
	}

	const tierMap = new Map((tierRowsRes.data || []).map((tier) => [tier.id, tier]));
	const merged = rows.map((application) => ({
		...application,
		applicant_profile: profileMap.get(application.user_id) || null,
		selected_tier: tierMap.get(application.selected_tier_id) || null,
		answers: answersByApp.get(application.id) || []
	}));

	return { ok: true, data: merged };
}

export async function approveMembershipApplication({
	cookies,
	groupSlug,
	applicationId,
	payload,
	requestUrl,
	fetchImpl
}) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const application = await resolveApplicationContext(serviceSupabase, applicationId);
	if (!application || application.group_id !== auth.group.id) {
		return { ok: false, status: 404, error: 'Application not found.' };
	}
	if (['rejected', 'completed', 'withdrawn'].includes(application.status)) {
		return { ok: false, status: 409, error: 'This application can no longer be approved.' };
	}

	const { program, tier } = await resolveGroupProgramAndTier(
		serviceSupabase,
		auth.group.id,
		application.selected_tier_id
	);
	if (!program) return { ok: false, status: 404, error: 'Membership program not found.' };
	if (!tier) return { ok: false, status: 400, error: 'Application must include a valid tier.' };

	const defaultInterval = resolveTierBillingInterval(tier, 'month');
	const contributionMode = normalizeContributionMode(program.contribution_mode, 'donation');
	const defaultAmount = normalizeAmountCents(resolveTierAmountByInterval(tier, defaultInterval), 0);
	const needsPayment = contributionMode === 'paid' ? true : defaultAmount > 0;
	if (contributionMode === 'paid' && defaultAmount <= 0) {
		return {
			ok: false,
			status: 400,
			error: 'Paid mode requires the selected tier to have a non-zero monthly or annual amount.'
		};
	}

	const reviewNotes = cleanNullableText(payload?.review_notes, 5000);
	const now = toIsoNow();
	let paymentLink = null;

	if (needsPayment) {
		const checkout = await createCheckoutSession({
			serviceSupabase,
			group: auth.group,
			program,
			tier,
			billingInterval: defaultInterval || 'month',
			userId: application.user_id,
			userEmail: null,
			applicationId: application.id,
			requestUrl,
			customAmountCents: null
		});
		if (!checkout.ok) return checkout;
		paymentLink = checkout.checkoutUrl;
	}

	const nextStatus = needsPayment ? 'payment_pending' : 'completed';

	const { data: updatedApplication, error: updateError } = await serviceSupabase
		.from('group_membership_applications')
		.update({
			status: nextStatus,
			reviewed_by: auth.userId,
			reviewed_at: now,
			review_notes: reviewNotes,
			updated_at: now
		})
		.eq('id', application.id)
		.select('*')
		.single();
	if (updateError) return { ok: false, status: 400, error: updateError.message };

	let membership = null;
	if (!needsPayment) {
		membership = await findOrCreateMembership({
			serviceSupabase,
			groupId: auth.group.id,
			userId: application.user_id,
			tierId: tier.id,
			applicationId: application.id,
			source: 'online',
			status: 'active'
		});
	}

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: needsPayment ? 'application.approved_payment_pending' : 'application.approved',
		entity_type: 'group_membership_application',
		entity_id: application.id,
		before_snapshot: application,
		after_snapshot: updatedApplication
	});

	const profileMap = await resolveProfileMapByUserIds(serviceSupabase, [application.user_id]);
	const applicantProfile = profileMap.get(application.user_id) || null;
	if (needsPayment) {
		await sendUserNotification({
			to: applicantProfile?.email,
			subject: `Application approved: ${auth.group.name}`,
			html: `<p>Your membership application for <strong>${auth.group.name}</strong> was approved.</p><p>Complete payment to activate your membership:</p><p><a href="${paymentLink}">Complete membership payment</a></p>`,
			text: `Your membership application for ${auth.group.name} was approved. Complete payment here: ${paymentLink}`,
			tags: [{ Name: 'context', Value: 'membership-application-approved-payment' }],
			fetchImpl
		});
	} else {
		await sendUserNotification({
			to: applicantProfile?.email,
			subject: `Application approved: ${auth.group.name}`,
			html: `<p>Your membership application for <strong>${auth.group.name}</strong> was approved and activated.</p>`,
			text: `Your membership application for ${auth.group.name} was approved and activated.`,
			tags: [{ Name: 'context', Value: 'membership-application-approved' }],
			fetchImpl
		});
	}

	return {
		ok: true,
		data: {
			application: updatedApplication,
			membership,
			requires_payment: needsPayment,
			payment_link: paymentLink
		}
	};
}

export async function rejectMembershipApplication({
	cookies,
	groupSlug,
	applicationId,
	payload,
	fetchImpl
}) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const application = await resolveApplicationContext(serviceSupabase, applicationId);
	if (!application || application.group_id !== auth.group.id) {
		return { ok: false, status: 404, error: 'Application not found.' };
	}
	if (['completed', 'withdrawn'].includes(application.status)) {
		return { ok: false, status: 409, error: 'This application can no longer be rejected.' };
	}

	const now = toIsoNow();
	const reviewNotes = cleanNullableText(payload?.review_notes, 5000);

	const { data, error } = await serviceSupabase
		.from('group_membership_applications')
		.update({
			status: 'rejected',
			reviewed_by: auth.userId,
			reviewed_at: now,
			review_notes: reviewNotes,
			updated_at: now
		})
		.eq('id', application.id)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'application.rejected',
		entity_type: 'group_membership_application',
		entity_id: application.id,
		before_snapshot: application,
		after_snapshot: data
	});

	const profileMap = await resolveProfileMapByUserIds(serviceSupabase, [application.user_id]);
	const applicantProfile = profileMap.get(application.user_id) || null;
	await sendUserNotification({
		to: applicantProfile?.email,
		subject: `Application update: ${auth.group.name}`,
		html: `<p>Your membership application for <strong>${auth.group.name}</strong> was not approved.</p>`,
		text: `Your membership application for ${auth.group.name} was not approved.`,
		tags: [{ Name: 'context', Value: 'membership-application-rejected' }],
		fetchImpl
	});

	return { ok: true, data };
}

export async function listMembershipMembers({ cookies, groupSlug, filters = {} }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	let query = serviceSupabase
		.from('group_memberships')
		.select('*')
		.eq('group_id', auth.group.id)
		.order('created_at', { ascending: false })
		.limit(2000);

	const status = cleanNullableText(filters?.status, 40);
	const normalizedStatus = status ? normalizeMembershipStatus(status, status) : null;

	const { data: memberships, error } = await query;
	if (error) return { ok: false, status: 400, error: error.message };

	const rows = memberships || [];
	const latestMembershipByUser = new Map();
	for (const row of rows) {
		if (!row?.user_id || latestMembershipByUser.has(row.user_id)) continue;
		latestMembershipByUser.set(row.user_id, row);
	}
	const latestRows = Array.from(latestMembershipByUser.values());
	const userIds = latestRows.map((row) => row.user_id);
	const tierIds = latestRows.map((row) => row.tier_id).filter(Boolean);
	const membershipIds = latestRows.map((row) => row.id);

	const [profileMap, tierRes, billingRes] = await Promise.all([
		resolveProfileMapByUserIds(serviceSupabase, userIds),
		tierIds.length
			? serviceSupabase.from('group_membership_tiers').select('id,name').in('id', tierIds)
			: Promise.resolve({ data: [], error: null }),
		membershipIds.length
			? serviceSupabase
					.from('group_membership_billing')
					.select('*')
					.in('membership_id', membershipIds)
			: Promise.resolve({ data: [], error: null })
	]);
	if (tierRes.error) return { ok: false, status: 400, error: tierRes.error.message };
	if (billingRes.error) return { ok: false, status: 400, error: billingRes.error.message };

	const tierMap = new Map((tierRes.data || []).map((tier) => [tier.id, tier]));
	const billingMap = new Map(
		(billingRes.data || []).map((billing) => [billing.membership_id, billing])
	);

	const queryText = cleanText(filters?.query || '', 120).toLowerCase();
	const mapped = latestRows
		.map((membership) => {
			const profile = profileMap.get(membership.user_id) || null;
			const tier = tierMap.get(membership.tier_id) || null;
			const billing = billingMap.get(membership.id) || null;
			return {
				...membership,
				profile,
				tier,
				billing
			};
		})
		.filter((row) => {
			if (normalizedStatus && row.status !== normalizedStatus) return false;
			if (!queryText) return true;
			const haystack = [
				row.profile?.full_name || '',
				row.profile?.email || '',
				row.tier?.name || ''
			]
				.join(' ')
				.toLowerCase();
			return haystack.includes(queryText);
		});

	return { ok: true, data: mapped };
}

export async function lookupMembershipUserByEmail({ cookies, groupSlug, email }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const normalizedEmail = sanitizeEmail(email);
	if (!normalizedEmail) {
		return { ok: false, status: 400, error: 'A valid email is required.' };
	}

	const { data: profile } = await serviceSupabase
		.from('profiles')
		.select('user_id,full_name,email')
		.eq('email', normalizedEmail)
		.maybeSingle();

	if (profile?.user_id) {
		return {
			ok: true,
			data: {
				found: true,
				user_id: profile.user_id,
				email: profile.email || normalizedEmail,
				full_name: profile.full_name || ''
			}
		};
	}

	const existingAuthUserId = await resolveAuthUserIdByEmail(serviceSupabase, normalizedEmail);
	if (existingAuthUserId) {
		return {
			ok: true,
			data: {
				found: true,
				user_id: existingAuthUserId,
				email: normalizedEmail,
				full_name: ''
			}
		};
	}

	return {
		ok: true,
		data: {
			found: false,
			user_id: null,
			email: normalizedEmail,
			full_name: ''
		}
	};
}

export async function createManualMembership({
	cookies,
	groupSlug,
	payload,
	fetchImpl,
	requestUrl
}) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const email = sanitizeEmail(payload?.user_email || payload?.email || '');
	const requestedFullName = cleanNullableText(payload?.full_name, 120);
	const tierId = cleanNullableText(payload?.tier_id, 64);
	if (!email || !tierId) {
		return { ok: false, status: 400, error: 'user_email and tier_id are required.' };
	}

	const tier = await loadTierById(serviceSupabase, tierId);
	if (!tier) return { ok: false, status: 404, error: 'Tier not found.' };
	const program = await ensureProgram(serviceSupabase, auth.group.id);
	if (tier.program_id !== program.id) {
		return { ok: false, status: 400, error: 'Tier does not belong to this group.' };
	}

	let userId = null;
	let inviteSent = false;

	const { data: existingProfile } = await serviceSupabase
		.from('profiles')
		.select('user_id,full_name,email')
		.eq('email', email)
		.maybeSingle();
	if (existingProfile?.user_id) {
		userId = existingProfile.user_id;
	}

	if (!userId) {
		if (!requestedFullName) {
			return {
				ok: false,
				status: 400,
				error: 'Full name is required when creating a new user from email.'
			};
		}

		const joinPath = `/groups/${encodeURIComponent(auth.group.slug)}/membership`;
		const baseUrl = resolvePublicBaseUrl(requestUrl);
		const redirectTo = baseUrl ? `${baseUrl}/auth?next=${encodeURIComponent(joinPath)}` : undefined;
		const inviteResult = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
			data: {
				full_name: requestedFullName
			},
			redirectTo
		});

		if (inviteResult.error) {
			const existingAuthUserId = await resolveAuthUserIdByEmail(serviceSupabase, email);
			if (!existingAuthUserId) {
				return { ok: false, status: 400, error: inviteResult.error.message };
			}
			userId = existingAuthUserId;
			inviteSent = false;
		} else {
			userId = inviteResult.data?.user?.id || null;
			inviteSent = true;
		}

		if (!userId) {
			return {
				ok: false,
				status: 500,
				error: 'Unable to resolve invited user account. Please retry.'
			};
		}
	}

	await upsertMembershipUserProfile({
		serviceSupabase,
		userId,
		currentEmail: email,
		profilePayload: {
			full_name: requestedFullName || existingProfile?.full_name || '',
			email
		}
	});

	const status = normalizeMembershipStatus(payload?.status, 'active');
	const startedAt = normalizeTimestamp(payload?.started_at, toIsoNow());
	const renewsAt = normalizeTimestamp(
		payload?.renews_at,
		calculateRenewalDate(tier, new Date(startedAt))
	);
	const endsAt = normalizeTimestamp(payload?.ends_at, null);
	const manualPaymentNotes = cleanNullableText(payload?.manual_payment_notes, 5000);
	const manualIntervalUnit =
		tier?.billing_type === 'recurring' && INTERVAL_UNITS.has(tier?.interval_unit || '')
			? tier.interval_unit
			: tier?.billing_type === 'recurring'
				? 'month'
				: null;
	const manualContributionAmount = normalizeAmountCents(
		resolveTierAmountByInterval(tier, manualIntervalUnit),
		0
	);

	const { data, error } = await serviceSupabase
		.from('group_memberships')
		.insert({
			group_id: auth.group.id,
			user_id: userId,
			tier_id: tier.id,
			status,
			source: 'manual_offline',
			started_at: startedAt,
			renews_at: renewsAt,
			ends_at: endsAt,
			interval_unit: manualIntervalUnit,
			contribution_amount_cents: manualContributionAmount,
			cancel_at_period_end: false,
			manual_payment_notes: manualPaymentNotes,
			created_by_owner_id: auth.userId,
			created_at: toIsoNow(),
			updated_at: toIsoNow()
		})
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'membership.manual_created',
		entity_type: 'group_membership',
		entity_id: data.id,
		after_snapshot: data
	});

	await sendOwnerNotification({
		serviceSupabase,
		group: auth.group,
		subject: `Manual membership added: ${auth.group.name}`,
		html: `
			<p><strong>${auth.group.name}</strong> has a new manual member.</p>
			<p>Member: ${escapeHtml(requestedFullName || existingProfile?.full_name || email)} (${escapeHtml(email)})</p>
			<p>Tier: ${escapeHtml(tier.name || 'Member')}</p>
			<p>Contribution: ${escapeHtml(getMembershipAmountSummary(manualContributionAmount, manualIntervalUnit))}</p>
			<p>Status: ${escapeHtml(status)}</p>
		`,
		text:
			`${auth.group.name} has a new manual member.\n\n` +
			`Member: ${requestedFullName || existingProfile?.full_name || email} (${email})\n` +
			`Tier: ${tier.name || 'Member'}\n` +
			`Contribution: ${getMembershipAmountSummary(manualContributionAmount, manualIntervalUnit)}\n` +
			`Status: ${status}`,
		tags: [{ Name: 'context', Value: 'membership-manual-created' }],
		fetchImpl
	});

	return {
		ok: true,
		data: {
			membership: data,
			user_email: email,
			invite_sent: inviteSent
		}
	};
}

export async function updateMembershipStatus({ cookies, groupSlug, membershipId, payload }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const serviceSupabase = auth.serviceSupabase;
	const membership = await loadMembershipById(serviceSupabase, membershipId);
	if (!membership || membership.group_id !== auth.group.id) {
		return { ok: false, status: 404, error: 'Membership not found.' };
	}

	const updates = {
		status:
			payload?.status !== undefined
				? normalizeMembershipStatus(payload.status, membership.status)
				: membership.status,
		cancel_at_period_end:
			payload?.cancel_at_period_end !== undefined
				? normalizeBoolean(payload.cancel_at_period_end, membership.cancel_at_period_end === true)
				: membership.cancel_at_period_end,
		manual_payment_notes:
			payload?.manual_payment_notes !== undefined
				? cleanNullableText(payload.manual_payment_notes, 5000)
				: membership.manual_payment_notes,
		started_at:
			payload?.started_at !== undefined
				? normalizeTimestamp(payload.started_at, membership.started_at)
				: membership.started_at,
		renews_at:
			payload?.renews_at !== undefined
				? normalizeTimestamp(payload.renews_at, membership.renews_at)
				: membership.renews_at,
		ends_at:
			payload?.ends_at !== undefined
				? normalizeTimestamp(payload.ends_at, membership.ends_at)
				: membership.ends_at,
		updated_at: toIsoNow()
	};

	const { data, error } = await serviceSupabase
		.from('group_memberships')
		.update(updates)
		.eq('id', membership.id)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'membership.status_updated',
		entity_type: 'group_membership',
		entity_id: membership.id,
		before_snapshot: membership,
		after_snapshot: data
	});

	return { ok: true, data };
}

export async function createMembershipEmailCampaign({ cookies, groupSlug, payload }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;
	const serviceSupabase = auth.serviceSupabase;

	const campaignName = cleanText(payload?.campaign_name || '', 120);
	const subjectTemplate = cleanText(payload?.subject_template || '', 300);
	const bodyTemplate = cleanText(payload?.body_template || '', 50000);
	if (!campaignName || !subjectTemplate || !bodyTemplate) {
		return {
			ok: false,
			status: 400,
			error: 'campaign_name, subject_template, and body_template are required.'
		};
	}

	const audienceFilters =
		payload?.audience_filters && typeof payload.audience_filters === 'object'
			? payload.audience_filters
			: {};

	const now = toIsoNow();
	const { data, error } = await serviceSupabase
		.from('group_membership_emails')
		.insert({
			group_id: auth.group.id,
			campaign_name: campaignName,
			audience_filters: audienceFilters,
			subject_template: subjectTemplate,
			body_template: bodyTemplate,
			status: 'draft',
			created_by: auth.userId,
			created_at: now,
			updated_at: now
		})
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'email_campaign.created',
		entity_type: 'group_membership_email',
		entity_id: data.id,
		after_snapshot: data
	});

	return { ok: true, data };
}

export async function scheduleMembershipEmailCampaign({ cookies, groupSlug, emailId, payload }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;
	const serviceSupabase = auth.serviceSupabase;

	const { data: before, error: beforeError } = await serviceSupabase
		.from('group_membership_emails')
		.select('*')
		.eq('id', emailId)
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (beforeError) return { ok: false, status: 400, error: beforeError.message };
	if (!before) return { ok: false, status: 404, error: 'Email campaign not found.' };

	const scheduledAt = normalizeTimestamp(payload?.scheduled_at, null);
	if (!scheduledAt) return { ok: false, status: 400, error: 'scheduled_at is required.' };

	const { data, error } = await serviceSupabase
		.from('group_membership_emails')
		.update({
			status: 'scheduled',
			scheduled_at: scheduledAt,
			updated_at: toIsoNow()
		})
		.eq('id', emailId)
		.select('*')
		.single();
	if (error) return { ok: false, status: 400, error: error.message };

	await writeAuditLog(serviceSupabase, {
		group_id: auth.group.id,
		actor_user_id: auth.userId,
		action: 'email_campaign.scheduled',
		entity_type: 'group_membership_email',
		entity_id: emailId,
		before_snapshot: before,
		after_snapshot: data
	});

	return { ok: true, data };
}

async function sendMembershipCampaignNowInternal({
	serviceSupabase,
	group,
	emailCampaign,
	actorUserId,
	fetchImpl,
	originBaseUrl = null
}) {
	const now = toIsoNow();
	await serviceSupabase
		.from('group_membership_emails')
		.update({ status: 'sending', updated_at: now })
		.eq('id', emailCampaign.id);

	const recipients = await resolveEmailAudience({
		serviceSupabase,
		groupId: group.id,
		audienceFilters: emailCampaign.audience_filters || {}
	});

	const program = await ensureProgram(serviceSupabase, group.id);
	const rides = await loadUpcomingRideRows(serviceSupabase, group.id);
	const volunteerEvents = await loadUpcomingVolunteerRows(serviceSupabase, group.id);
	const ridesBlock = renderRidesBlock(rides, originBaseUrl);
	const volunteerBlock = renderVolunteerBlock(volunteerEvents, originBaseUrl);
	const linksBlock = renderGroupLinksBlock(group, originBaseUrl);
	const policyLink = buildPolicyLink(originBaseUrl, group.slug, program.policy_version);

	const queuedSendRows = recipients.map((recipient) => ({
		email_id: emailCampaign.id,
		membership_id: recipient.membership.id,
		recipient_user_id: recipient.membership.user_id,
		recipient_email: recipient.email,
		send_state: 'pending',
		created_at: now,
		updated_at: now
	}));
	if (queuedSendRows.length) {
		await serviceSupabase
			.from('group_membership_email_sends')
			.upsert(queuedSendRows, { onConflict: 'email_id,recipient_user_id' });
	}

	let sentCount = 0;
	let failedCount = 0;

	for (const recipient of recipients) {
		const tierName = recipient.tier?.name || 'Member';
		const context = {
			first_name: firstNameFromProfile(recipient.profile),
			membership_tier: tierName,
			renewal_date: formatDate(recipient.membership.renews_at),
			group_name: group.name,
			policy_link: policyLink,
			'block.upcoming_rides': ridesBlock.html,
			'block.upcoming_volunteer_events': volunteerBlock.html,
			'block.group_links': linksBlock.html,
			'block_text.upcoming_rides': ridesBlock.text,
			'block_text.upcoming_volunteer_events': volunteerBlock.text,
			'block_text.group_links': linksBlock.text
		};

		const subject = renderTemplate(emailCampaign.subject_template, context);
		let htmlBody = renderTemplate(emailCampaign.body_template, context);
		htmlBody = renderTemplate(htmlBody, {
			upcoming_rides_block: ridesBlock.html,
			upcoming_volunteer_events_block: volunteerBlock.html,
			group_links_block: linksBlock.html
		});

		const textBody = stripHtml(
			renderTemplate(
				renderTemplate(emailCampaign.body_template, {
					upcoming_rides_block: ridesBlock.text,
					upcoming_volunteer_events_block: volunteerBlock.text,
					group_links_block: linksBlock.text
				}),
				context
			)
		);

		try {
			await sendEmail(
				{
					to: recipient.email,
					subject: subject || `${group.name} Membership Update`,
					html: htmlBody,
					text: textBody,
					tags: [
						{ Name: 'context', Value: 'membership-campaign-send' },
						{ Name: 'membership_email_id', Value: String(emailCampaign.id) }
					]
				},
				{ fetch: fetchImpl }
			);

			sentCount += 1;
			await serviceSupabase
				.from('group_membership_email_sends')
				.update({
					send_state: 'sent',
					sent_at: toIsoNow(),
					updated_at: toIsoNow(),
					error_text: null
				})
				.eq('email_id', emailCampaign.id)
				.eq('recipient_user_id', recipient.membership.user_id);
		} catch (error) {
			failedCount += 1;
			await serviceSupabase
				.from('group_membership_email_sends')
				.update({
					send_state: 'failed',
					error_text: cleanText(error?.message || 'Unable to send email', 2000),
					updated_at: toIsoNow()
				})
				.eq('email_id', emailCampaign.id)
				.eq('recipient_user_id', recipient.membership.user_id);
		}
	}

	const finalStatus = failedCount > 0 && sentCount === 0 ? 'failed' : 'sent';
	const { data: updatedEmail } = await serviceSupabase
		.from('group_membership_emails')
		.update({
			status: finalStatus,
			sent_at: toIsoNow(),
			sent_count: sentCount,
			failed_count: failedCount,
			updated_at: toIsoNow()
		})
		.eq('id', emailCampaign.id)
		.select('*')
		.single();

	if (actorUserId) {
		await writeAuditLog(serviceSupabase, {
			group_id: group.id,
			actor_user_id: actorUserId,
			action: 'email_campaign.sent',
			entity_type: 'group_membership_email',
			entity_id: emailCampaign.id,
			after_snapshot: {
				sent_count: sentCount,
				failed_count: failedCount,
				status: finalStatus
			}
		});
	}

	return {
		email: updatedEmail || emailCampaign,
		sent_count: sentCount,
		failed_count: failedCount,
		recipient_count: recipients.length,
		status: finalStatus
	};
}

export async function sendMembershipEmailCampaignNow({
	cookies,
	groupSlug,
	emailId,
	fetchImpl,
	originBaseUrl
}) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;
	const serviceSupabase = auth.serviceSupabase;

	const { data: emailCampaign, error } = await serviceSupabase
		.from('group_membership_emails')
		.select('*')
		.eq('id', emailId)
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (error) return { ok: false, status: 400, error: error.message };
	if (!emailCampaign) return { ok: false, status: 404, error: 'Email campaign not found.' };

	const result = await sendMembershipCampaignNowInternal({
		serviceSupabase,
		group: auth.group,
		emailCampaign,
		actorUserId: auth.userId,
		fetchImpl,
		originBaseUrl
	});

	return { ok: true, data: result };
}

export async function listMembershipEmailHistory({ cookies, groupSlug }) {
	const auth = await requireMembershipManager(cookies, groupSlug);
	if (!auth.ok) return auth;
	const serviceSupabase = auth.serviceSupabase;

	const { data, error } = await serviceSupabase
		.from('group_membership_emails')
		.select('*')
		.eq('group_id', auth.group.id)
		.order('created_at', { ascending: false })
		.limit(500);
	if (error) return { ok: false, status: 400, error: error.message };
	return { ok: true, data: data || [] };
}

export async function processScheduledMembershipEmails({
	fetchImpl,
	maxCampaigns = 25,
	now = new Date()
}) {
	const serviceSupabase = await getServiceSupabase();
	const nowIso = now.toISOString();
	const { data: campaigns, error } = await serviceSupabase
		.from('group_membership_emails')
		.select('*')
		.eq('status', 'scheduled')
		.lte('scheduled_at', nowIso)
		.order('scheduled_at', { ascending: true })
		.limit(maxCampaigns);
	if (error) throw new Error(error.message);

	const list = campaigns || [];
	const groupIds = Array.from(new Set(list.map((row) => row.group_id).filter(Boolean)));
	let groupMap = new Map();
	if (groupIds.length) {
		const { data: groups } = await serviceSupabase
			.from('groups')
			.select('id,slug,name,website_url,social_links,public_contact_email')
			.in('id', groupIds);
		groupMap = new Map((groups || []).map((group) => [group.id, group]));
	}

	const baseUrl = process.env.PUBLIC_URL_BASE || null;
	const results = [];
	for (const campaign of list) {
		const group = groupMap.get(campaign.group_id);
		if (!group) {
			results.push({ email_id: campaign.id, skipped: true, reason: 'group_not_found' });
			continue;
		}
		const sent = await sendMembershipCampaignNowInternal({
			serviceSupabase,
			group,
			emailCampaign: campaign,
			actorUserId: campaign.created_by,
			fetchImpl,
			originBaseUrl: baseUrl
		});
		results.push({ email_id: campaign.id, ...sent });
	}

	return { processed: list.length, results };
}

async function activateMembershipFromMetadata({
	serviceSupabase,
	metadata,
	stripeSession,
	stripeAccountId = null,
	fetchImpl
}) {
	if (!isMembershipMetadata(metadata)) {
		return { ok: false, matched: false, error: 'Not a membership payment metadata payload.' };
	}

	const groupId = cleanText(metadata.membership_group_id, 64);
	const userId = cleanText(metadata.membership_user_id, 64);
	const tierId = cleanText(metadata.membership_tier_id, 64);
	const applicationId = cleanNullableText(metadata.membership_application_id, 64);
	const billingInterval = cleanNullableText(metadata.membership_interval_unit, 16);
	const membershipAmountCents = normalizeNullableAmountCents(metadata.membership_amount_cents);

	if (!groupId || !userId || !tierId) {
		return { ok: false, matched: true, error: 'Missing required membership metadata fields.' };
	}

	const group = await loadGroupById(serviceSupabase, groupId);
	if (!group)
		return { ok: false, matched: true, error: 'Group not found for membership metadata.' };

	const membership = await findOrCreateMembership({
		serviceSupabase,
		groupId,
		userId,
		tierId,
		billingInterval,
		applicationId,
		source: 'online',
		status: 'active'
	});

	const subscriptionId =
		typeof stripeSession?.subscription === 'string'
			? stripeSession.subscription
			: stripeSession?.subscription?.id || null;
	const customerId = extractCustomerId(stripeSession?.customer) || null;
	const paymentStatus = cleanNullableText(
		stripeSession?.payment_status || stripeSession?.status || 'paid',
		120
	);

	await serviceSupabase
		.from('group_memberships')
		.update({
			status: 'active',
			interval_unit: INTERVAL_UNITS.has(billingInterval || '') ? billingInterval : null,
			contribution_amount_cents:
				membershipAmountCents === null ? null : normalizeAmountCents(membershipAmountCents, 0),
			updated_at: toIsoNow()
		})
		.eq('id', membership.id);

	await upsertBillingForMembership({
		serviceSupabase,
		membershipId: membership.id,
		updates: {
			stripe_customer_id: customerId,
			stripe_subscription_id: subscriptionId,
			stripe_price_id: cleanNullableText(metadata.membership_tier_price_id || '', 255),
			last_payment_status: paymentStatus,
			next_billing_at: null
		}
	});

	if (applicationId) {
		await serviceSupabase
			.from('group_membership_applications')
			.update({ status: 'completed', updated_at: toIsoNow() })
			.eq('id', applicationId);
	}

	await writeAuditLog(serviceSupabase, {
		group_id: groupId,
		actor_user_id: userId,
		action: 'payment.completed',
		entity_type: 'group_membership',
		entity_id: membership.id,
		after_snapshot: {
			membership_id: membership.id,
			subscription_id: subscriptionId,
			payment_status: paymentStatus
		}
	});

	if (!subscriptionId && cleanText(metadata?.membership_billing_type || '', 20) !== 'recurring') {
		await sendMembershipPaymentSuccessNotifications({
			serviceSupabase,
			group,
			membership,
			userId,
			metadata,
			fetchImpl
		});
	}

	if (subscriptionId && stripeAccountId) {
		await applyPendingTierChange({
			serviceSupabase,
			membership,
			stripeAccountId
		}).catch((error) => {
			console.error('Unable to apply pending membership tier change after activation', error);
		});
	}

	return { ok: true, matched: true, membership_id: membership.id };
}

export async function handleMembershipStripeEvent(event, fetchImpl) {
	if (!event || !event.type) {
		return { ok: false, matched: false, error: 'Invalid Stripe event payload.' };
	}

	const serviceSupabase = await getServiceSupabase();
	const stripeAccountId = cleanNullableText(event.account, 255);
	const eventType = event.type;
	const dataObject = event?.data?.object || null;

	if (
		eventType === 'checkout.session.completed' ||
		eventType === 'checkout.session.async_payment_succeeded' ||
		eventType === 'checkout.session.expired'
	) {
		const metadata = dataObject?.metadata || {};
		if (!isMembershipMetadata(metadata)) {
			return { ok: true, matched: false };
		}

		if (eventType === 'checkout.session.expired' || dataObject?.payment_status === 'unpaid') {
			if (metadata.membership_application_id) {
				await serviceSupabase
					.from('group_membership_applications')
					.update({ status: 'approved', updated_at: toIsoNow() })
					.eq('id', metadata.membership_application_id)
					.eq('status', 'payment_pending');
			}

			const group = await loadGroupById(serviceSupabase, metadata.membership_group_id);
			if (group) {
				await sendMembershipPaymentFailureNotifications({
					serviceSupabase,
					group,
					userId: cleanText(metadata.membership_user_id, 64),
					metadata,
					reason: 'Checkout expired or remained unpaid',
					fetchImpl
				});
			}

			return { ok: true, matched: true, skipped: true };
		}

		return activateMembershipFromMetadata({
			serviceSupabase,
			metadata,
			stripeSession: dataObject,
			stripeAccountId,
			fetchImpl
		});
	}

	if (eventType === 'payment_intent.succeeded') {
		const metadata = dataObject?.metadata || {};
		if (!isMembershipMetadata(metadata)) return { ok: true, matched: false };
		return activateMembershipFromMetadata({
			serviceSupabase,
			metadata,
			stripeSession: {
				payment_status: 'paid',
				status: 'succeeded',
				customer: dataObject?.customer,
				subscription: null
			},
			stripeAccountId,
			fetchImpl
		});
	}

	if (eventType === 'payment_intent.payment_failed' || eventType === 'payment_intent.canceled') {
		const metadata = dataObject?.metadata || {};
		if (!isMembershipMetadata(metadata)) return { ok: true, matched: false };

		if (metadata.membership_application_id) {
			await serviceSupabase
				.from('group_membership_applications')
				.update({ status: 'approved', updated_at: toIsoNow() })
				.eq('id', metadata.membership_application_id)
				.eq('status', 'payment_pending');
		}

		const group = await loadGroupById(serviceSupabase, metadata.membership_group_id);
		if (group) {
			await sendMembershipPaymentFailureNotifications({
				serviceSupabase,
				group,
				userId: cleanText(metadata.membership_user_id, 64),
				metadata,
				reason:
					eventType === 'payment_intent.canceled'
						? 'Payment was canceled before completion'
						: 'Payment could not be processed',
				fetchImpl
			});
		}

		return { ok: true, matched: true };
	}

	if (eventType === 'invoice.paid' || eventType === 'invoice.payment_failed') {
		const subscriptionId = extractSubscriptionIdFromInvoice(dataObject);
		if (!subscriptionId) return { ok: true, matched: false };

		let billing = await loadBillingBySubscriptionId(serviceSupabase, subscriptionId);
		let membership = billing
			? await loadMembershipById(serviceSupabase, billing.membership_id)
			: null;

		if ((!billing || !membership) && stripeAccountId && eventType === 'invoice.paid') {
			try {
				const stripe = getStripeClient();
				const subscription = await stripe.subscriptions.retrieve(
					subscriptionId,
					{},
					stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
				);
				const metadata = subscription?.metadata || {};
				if (isMembershipMetadata(metadata)) {
					const activation = await activateMembershipFromMetadata({
						serviceSupabase,
						metadata,
						stripeSession: {
							payment_status: 'paid',
							status: 'paid',
							customer: subscription?.customer || null,
							subscription: subscription.id
						},
						stripeAccountId,
						fetchImpl
					});
					if (activation?.ok) {
						billing = await loadBillingBySubscriptionId(serviceSupabase, subscriptionId);
						membership = billing
							? await loadMembershipById(serviceSupabase, billing.membership_id)
							: activation?.membership_id
								? await loadMembershipById(serviceSupabase, activation.membership_id)
								: null;
					}
				}
			} catch (error) {
				console.error('Unable to bootstrap membership from invoice event', error);
			}
		}

		if (!billing) return { ok: true, matched: false };
		if (!membership) return { ok: true, matched: false };

		const nextBillingAt = extractInvoiceNextBillingAt(dataObject);
		const isPaid = eventType === 'invoice.paid';
		const paymentStatus = isPaid ? 'paid' : 'failed';

		await serviceSupabase
			.from('group_membership_billing')
			.update({
				last_invoice_id: cleanNullableText(dataObject?.id, 255),
				last_payment_status: paymentStatus,
				next_billing_at: nextBillingAt,
				updated_at: toIsoNow()
			})
			.eq('membership_id', membership.id);

		await serviceSupabase
			.from('group_memberships')
			.update({
				status: isPaid ? 'active' : 'past_due',
				renews_at: nextBillingAt || membership.renews_at,
				updated_at: toIsoNow()
			})
			.eq('id', membership.id);

		if (isPaid) {
			const group = await loadGroupById(serviceSupabase, membership.group_id);
			if (group) {
				const metadata = {
					membership_tier_id: membership.tier_id,
					membership_amount_cents: membership.contribution_amount_cents,
					membership_interval_unit: membership.interval_unit || 'month'
				};
				await sendMembershipPaymentSuccessNotifications({
					serviceSupabase,
					group,
					membership,
					userId: membership.user_id,
					metadata,
					fetchImpl
				});
			}
			await applyPendingTierChange({
				serviceSupabase,
				membership,
				stripeAccountId
			}).catch((error) => {
				console.error('Unable to apply pending tier change after invoice payment', error);
			});
		} else {
			const group = await loadGroupById(serviceSupabase, membership.group_id);
			if (group) {
				const metadata = {
					membership_tier_id: membership.tier_id,
					membership_amount_cents: membership.contribution_amount_cents,
					membership_interval_unit: membership.interval_unit || 'month'
				};
				await sendMembershipPaymentFailureNotifications({
					serviceSupabase,
					group,
					userId: membership.user_id,
					metadata,
					reason: 'Recurring invoice payment failed',
					fetchImpl
				});
			}
		}

		return { ok: true, matched: true };
	}

	if (
		eventType === 'customer.subscription.updated' ||
		eventType === 'customer.subscription.deleted'
	) {
		const subscriptionId = cleanNullableText(dataObject?.id, 255);
		if (!subscriptionId) return { ok: true, matched: false };

		const billing = await loadBillingBySubscriptionId(serviceSupabase, subscriptionId);
		if (!billing) return { ok: true, matched: false };
		const membership = await loadMembershipById(serviceSupabase, billing.membership_id);
		if (!membership) return { ok: true, matched: false };

		const subStatus = cleanText(dataObject?.status, 40);
		let membershipStatus = membership.status;
		if (['active', 'trialing'].includes(subStatus)) membershipStatus = 'active';
		if (subStatus === 'past_due' || subStatus === 'unpaid') membershipStatus = 'past_due';
		if (subStatus === 'paused') membershipStatus = 'paused';
		if (subStatus === 'canceled' || eventType === 'customer.subscription.deleted') {
			membershipStatus = 'cancelled';
		}

		const renewsAt = extractCurrentPeriodEndFromSubscription(dataObject) || membership.renews_at;
		await serviceSupabase
			.from('group_memberships')
			.update({
				status: membershipStatus,
				renews_at: renewsAt,
				ends_at:
					membershipStatus === 'cancelled'
						? normalizeTimestamp(dataObject?.ended_at, toIsoNow())
						: membership.ends_at,
				updated_at: toIsoNow()
			})
			.eq('id', membership.id);

		await serviceSupabase
			.from('group_membership_billing')
			.update({
				last_payment_status: subStatus || billing.last_payment_status,
				next_billing_at: renewsAt,
				stripe_price_id:
					cleanNullableText(dataObject?.items?.data?.[0]?.price?.id, 255) ||
					billing.stripe_price_id,
				updated_at: toIsoNow()
			})
			.eq('membership_id', membership.id);

		return { ok: true, matched: true };
	}

	return { ok: true, matched: false };
}
