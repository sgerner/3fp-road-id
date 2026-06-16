import { env } from '$env/dynamic/private';
import { PUBLIC_URL_BASE } from '$env/static/public';
import { wrapHtmlWithBranding, wrapTextWithBranding } from '$lib/email/branding';
import { domainMatchesManagedZone, resolveSenderSelection } from '$lib/server/emailDomainRules';
import { resolveSession } from '$lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { upsertDnsRecordsForVercelDomain } from '$lib/server/vercelDomains';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
	CreateEmailIdentityCommand,
	GetEmailIdentityCommand,
	PutEmailIdentityMailFromAttributesCommand,
	SESv2Client
} from '@aws-sdk/client-sesv2';

const MANAGER_ROLES = ['owner', 'admin'];
const AWS_CREDENTIALS = {
	accessKeyId:
		env.AWS_SES_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || env.AWS_BEDROCK_ACCESS_KEY_ID || null,
	secretAccessKey:
		env.AWS_SES_SECRET_ACCESS_KEY ||
		env.AWS_SECRET_ACCESS_KEY ||
		env.AWS_BEDROCK_SECRET_ACCESS_KEY ||
		null,
	sessionToken: env.AWS_SESSION_TOKEN || env.AWS_BEDROCK_SESSION_TOKEN || null
};

let cachedSesV2Client = null;
let cachedSesClient = null;

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const trimmed = String(value).trim();
	return maxLength > 0 ? trimmed.slice(0, maxLength) : trimmed;
}

function cleanNullableText(value, maxLength = 0) {
	const cleaned = cleanText(value, maxLength);
	return cleaned || null;
}

function cleanLower(value, maxLength = 0) {
	return cleanText(value, maxLength).toLowerCase();
}

export function normalizeDomain(value) {
	return cleanLower(value, 255)
		.replace(/^https?:\/\//, '')
		.replace(/\/.*$/, '')
		.replace(/\.+$/, '');
}

function normalizeSubdomain(value) {
	return cleanLower(value, 255).replace(/\.+$/, '');
}

function normalizeEmail(value) {
	const cleaned = cleanLower(value, 320);
	if (!cleaned) return '';
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : '';
}

function normalizeBoolean(value, fallback = false) {
	if (typeof value === 'boolean') return value;
	if (value === 'true' || value === '1' || value === 1) return true;
	if (value === 'false' || value === '0' || value === 0) return false;
	return fallback;
}

function nowIso() {
	return new Date().toISOString();
}

function resolveAwsRegion() {
	return env.AWS_SES_REGION || env.AWS_REGION || null;
}

function requireAwsCredentials() {
	const region = resolveAwsRegion();
	if (!region) {
		throw new Error('AWS_SES_REGION or AWS_REGION is not configured.');
	}
	if (!AWS_CREDENTIALS.accessKeyId || !AWS_CREDENTIALS.secretAccessKey) {
		throw new Error('AWS credentials are not configured for SES automation.');
	}
	return {
		region,
		credentials: {
			accessKeyId: AWS_CREDENTIALS.accessKeyId,
			secretAccessKey: AWS_CREDENTIALS.secretAccessKey,
			sessionToken: AWS_CREDENTIALS.sessionToken || undefined
		}
	};
}

function ensureSesV2Client() {
	if (cachedSesV2Client) return cachedSesV2Client;
	const { region, credentials } = requireAwsCredentials();
	cachedSesV2Client = new SESv2Client({ region, credentials });
	return cachedSesV2Client;
}

function ensureSesClient() {
	if (cachedSesClient) return cachedSesClient;
	const { region, credentials } = requireAwsCredentials();
	cachedSesClient = new SESClient({ region, credentials });
	return cachedSesClient;
}

async function requireGroupEmailManager(cookies, groupSlug) {
	const { accessToken, user } = resolveSession(cookies);
	if (!user?.id) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}

	const supabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return { ok: false, status: 500, error: 'Service database client is not configured.' };
	}

	const { data: group, error: groupError } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', groupSlug)
		.maybeSingle();
	if (groupError) return { ok: false, status: 400, error: groupError.message };
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	const [{ data: profile }, { data: memberRows, error: memberError }] = await Promise.all([
		supabase.from('profiles').select('admin').eq('user_id', user.id).maybeSingle(),
		supabase
			.from('group_members')
			.select('role')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.in('role', MANAGER_ROLES)
	]);
	if (memberError) return { ok: false, status: 400, error: memberError.message };

	const isAdmin = Boolean(profile?.admin);
	const isManager = Array.isArray(memberRows) && memberRows.length > 0;
	if (!isAdmin && !isManager) {
		return { ok: false, status: 403, error: 'You do not have permission to manage email.' };
	}

	return {
		ok: true,
		group,
		userId: user.id,
		supabase,
		serviceSupabase
	};
}

function buildFromAddress(domainRow) {
	const local = cleanText(domainRow?.from_local_part || 'hello', 64) || 'hello';
	return `${local}@${domainRow.domain}`;
}

function deriveDomainStatus(identity) {
	const verified = identity?.VerifiedForSendingStatus === true;
	const dkimStatus = cleanLower(identity?.DkimAttributes?.Status || '', 32);
	const mailFromStatus = cleanLower(identity?.MailFromAttributes?.MailFromDomainStatus || '', 32);

	if (verified && (!mailFromStatus || mailFromStatus === 'success')) return 'verified';
	if (dkimStatus === 'failed' || mailFromStatus === 'failed') return 'failed';
	if (verified) return 'pending_verification';
	return 'pending_dns';
}

function buildIdentityDnsRecords({ domain, mailFromSubdomain, identity }) {
	const region = resolveAwsRegion();
	const records = [];
	const tokens = Array.isArray(identity?.DkimAttributes?.Tokens)
		? identity.DkimAttributes.Tokens
		: [];

	for (const token of tokens) {
		const cleaned = cleanText(token, 255);
		if (!cleaned) continue;
		records.push({
			id: `dkim-${cleaned}`,
			type: 'CNAME',
			name: `${cleaned}._domainkey.${domain}`,
			value: `${cleaned}.dkim.amazonses.com`,
			ttl: 300,
			required: true,
			purpose: 'Easy DKIM signing and SES domain verification'
		});
	}

	if (mailFromSubdomain && region) {
		records.push({
			id: `mailfrom-mx-${mailFromSubdomain}`,
			type: 'MX',
			name: mailFromSubdomain,
			value: `10 feedback-smtp.${region}.amazonses.com`,
			ttl: 300,
			required: true,
			purpose: 'Custom MAIL FROM bounce handling'
		});
		records.push({
			id: `mailfrom-txt-${mailFromSubdomain}`,
			type: 'TXT',
			name: mailFromSubdomain,
			value: 'v=spf1 include:amazonses.com -all',
			ttl: 300,
			required: true,
			purpose: 'SPF alignment for the custom MAIL FROM subdomain'
		});
	}

	records.push({
		id: `dmarc-${domain}`,
		type: 'TXT',
		name: `_dmarc.${domain}`,
		value: 'v=DMARC1; p=none; adkim=s; aspf=s; pct=100',
		ttl: 300,
		required: false,
		purpose: 'Recommended DMARC policy to improve deliverability'
	});

	return records;
}

async function syncAwsSenderIdentity({ domain, mailFromSubdomain }) {
	const ses = ensureSesV2Client();
	const normalizedDomain = normalizeDomain(domain);
	const normalizedMailFrom = normalizeSubdomain(mailFromSubdomain || `mail.${normalizedDomain}`);

	try {
		await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: normalizedDomain }));
	} catch (error) {
		const message = cleanText(error?.name || error?.Code || error?.message, 120);
		if (!/AlreadyExists/i.test(message)) throw error;
	}

	await ses.send(
		new PutEmailIdentityMailFromAttributesCommand({
			EmailIdentity: normalizedDomain,
			MailFromDomain: normalizedMailFrom,
			BehaviorOnMxFailure: 'USE_DEFAULT_VALUE'
		})
	);

	const identity = await ses.send(
		new GetEmailIdentityCommand({
			EmailIdentity: normalizedDomain
		})
	);

	return {
		identity,
		dnsRecords: buildIdentityDnsRecords({
			domain: normalizedDomain,
			mailFromSubdomain: normalizedMailFrom,
			identity
		})
	};
}

function serializeIdentity(identity) {
	return {
		verifiedForSendingStatus: identity?.VerifiedForSendingStatus === true,
		dkimStatus: cleanNullableText(identity?.DkimAttributes?.Status, 60),
		dkimTokens: Array.isArray(identity?.DkimAttributes?.Tokens)
			? identity.DkimAttributes.Tokens
			: [],
		mailFromDomain: cleanNullableText(identity?.MailFromAttributes?.MailFromDomain, 255),
		mailFromStatus: cleanNullableText(identity?.MailFromAttributes?.MailFromDomainStatus, 60),
		identityType: cleanNullableText(identity?.IdentityType, 60),
		verifiedForSending: identity?.VerifiedForSendingStatus === true
	};
}

async function findRegisteredVercelManagedDomain(serviceSupabase, groupId, domain) {
	const normalizedDomain = normalizeDomain(domain);
	if (!normalizedDomain) return null;
	const { data, error } = await serviceSupabase
		.from('group_site_domains')
		.select('id,domain,source')
		.eq('group_id', groupId)
		.eq('source', 'registered');
	if (error) {
		console.warn('Unable to load group domain source for sender sync', error);
		return null;
	}
	const rows = Array.isArray(data) ? data : [];
	return (
		rows
			.filter((row) => domainMatchesManagedZone(normalizedDomain, row?.domain))
			.sort((left, right) => cleanText(right?.domain).length - cleanText(left?.domain).length)[0] ||
		null
	);
}

async function syncSesRecordsToVercelWhenManaged({ serviceSupabase, groupId, domain, dnsRecords }) {
	const managedDomain = await findRegisteredVercelManagedDomain(serviceSupabase, groupId, domain);
	if (!managedDomain?.domain) {
		return {
			status: 'manual_dns',
			registered_via_vercel: false,
			managed_domain: null,
			synced: false,
			created: 0,
			updated: 0,
			skipped: 0,
			error: null
		};
	}

	try {
		const result = await upsertDnsRecordsForVercelDomain({
			domain: managedDomain.domain,
			records: Array.isArray(dnsRecords) ? dnsRecords : []
		});
		return {
			status: 'synced',
			registered_via_vercel: true,
			managed_domain: managedDomain.domain,
			synced: true,
			created: Number(result?.created || 0),
			updated: Number(result?.updated || 0),
			skipped: Number(result?.skipped || 0),
			error: null
		};
	} catch (error) {
		return {
			status: 'failed',
			registered_via_vercel: true,
			managed_domain: managedDomain.domain,
			synced: false,
			created: 0,
			updated: 0,
			skipped: 0,
			error: cleanText(error?.message || 'Unable to sync SES records to Vercel DNS.', 1000)
		};
	}
}

function buildDomainRowPayload({
	groupId,
	userId,
	existingRow,
	payload,
	syncResult,
	vercelDnsSync
}) {
	const status = deriveDomainStatus(syncResult.identity);
	const domain = normalizeDomain(payload?.domain || existingRow?.domain);
	const isDefault = normalizeBoolean(payload?.is_default, existingRow?.is_default ?? true);
	return {
		group_id: groupId,
		domain,
		mail_from_subdomain: normalizeSubdomain(
			payload?.mail_from_subdomain ||
				existingRow?.mail_from_subdomain ||
				`mail.${payload?.domain || existingRow?.domain}`
		),
		from_name: cleanNullableText(payload?.from_name ?? existingRow?.from_name, 120),
		from_local_part:
			cleanText(payload?.from_local_part ?? (existingRow?.from_local_part || 'hello'), 64) ||
			'hello',
		reply_to_email:
			normalizeEmail(payload?.reply_to_email ?? existingRow?.reply_to_email ?? '') || null,
		is_default: isDefault,
		status,
		ses_identity_arn: cleanNullableText(existingRow?.ses_identity_arn, 255),
		ses_verified_for_sending: syncResult.identity?.VerifiedForSendingStatus === true,
		ses_dkim_status: cleanNullableText(syncResult.identity?.DkimAttributes?.Status, 60),
		ses_mail_from_status: cleanNullableText(
			syncResult.identity?.MailFromAttributes?.MailFromDomainStatus,
			60
		),
		dns_records: syncResult.dnsRecords,
		verification_details: {
			identity: serializeIdentity(syncResult.identity),
			vercel_dns: vercelDnsSync,
			last_checked_at: nowIso()
		},
		error_text: cleanNullableText(vercelDnsSync?.error || '', 1000),
		created_by: existingRow?.created_by || userId || null,
		updated_at: nowIso(),
		last_synced_at: nowIso(),
		last_verified_at: nowIso()
	};
}

async function upsertSenderDomainRow({ serviceSupabase, payload, auth, existingRow = null }) {
	const domain = normalizeDomain(payload?.domain || existingRow?.domain);
	const syncResult = await syncAwsSenderIdentity({
		domain,
		mailFromSubdomain: payload.mail_from_subdomain || existingRow?.mail_from_subdomain
	});
	const vercelDnsSync = await syncSesRecordsToVercelWhenManaged({
		serviceSupabase,
		groupId: auth.group.id,
		domain,
		dnsRecords: syncResult.dnsRecords
	});

	const rowPayload = buildDomainRowPayload({
		groupId: auth.group.id,
		userId: auth.userId,
		existingRow,
		payload,
		syncResult,
		vercelDnsSync
	});

	if (rowPayload.is_default) {
		await serviceSupabase
			.from('group_email_sending_domains')
			.update({ is_default: false, updated_at: nowIso() })
			.eq('group_id', auth.group.id)
			.neq('id', existingRow?.id || '00000000-0000-0000-0000-000000000000')
			.eq('is_default', true);
	}

	const query = existingRow
		? serviceSupabase
				.from('group_email_sending_domains')
				.update(rowPayload)
				.eq('id', existingRow.id)
		: serviceSupabase.from('group_email_sending_domains').insert(rowPayload);

	const { data, error } = await query.select('*').single();
	if (error) {
		throw new Error(error.message);
	}
	return {
		...data,
		from_email_address: buildFromAddress(data)
	};
}

export async function listGroupEmailSendingDomains({ cookies, groupSlug }) {
	const auth = await requireGroupEmailManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const { data, error } = await auth.serviceSupabase
		.from('group_email_sending_domains')
		.select('*')
		.eq('group_id', auth.group.id)
		.order('is_default', { ascending: false })
		.order('updated_at', { ascending: false });
	if (error) return { ok: false, status: 400, error: error.message };

	return {
		ok: true,
		data: (data || []).map((row) => ({
			...row,
			from_email_address: buildFromAddress(row)
		}))
	};
}

export async function upsertGroupEmailSendingDomain({ cookies, groupSlug, payload }) {
	const auth = await requireGroupEmailManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const domain = normalizeDomain(payload?.domain);
	if (!domain || domain.split('.').length < 2) {
		return { ok: false, status: 400, error: 'A valid sender domain is required.' };
	}

	const fromLocalPart = cleanText(payload?.from_local_part || 'hello', 64) || 'hello';
	if (!/^[a-z0-9._%+-]+$/i.test(fromLocalPart)) {
		return { ok: false, status: 400, error: 'From address local part is invalid.' };
	}

	const replyToEmail = cleanText(payload?.reply_to_email, 320);
	if (replyToEmail && !normalizeEmail(replyToEmail)) {
		return { ok: false, status: 400, error: 'Reply-to email is invalid.' };
	}

	const { data: existingRow, error: existingError } = await auth.serviceSupabase
		.from('group_email_sending_domains')
		.select('*')
		.eq('group_id', auth.group.id)
		.eq('domain', domain)
		.maybeSingle();
	if (existingError) return { ok: false, status: 400, error: existingError.message };

	try {
		const data = await upsertSenderDomainRow({
			serviceSupabase: auth.serviceSupabase,
			auth,
			existingRow,
			payload: {
				...payload,
				domain,
				from_local_part: fromLocalPart,
				reply_to_email: normalizeEmail(replyToEmail) || null
			}
		});
		return { ok: true, data };
	} catch (error) {
		return { ok: false, status: 500, error: error?.message || 'Unable to sync sender domain.' };
	}
}

export async function verifyGroupEmailSendingDomain({ cookies, groupSlug, domainId }) {
	const auth = await requireGroupEmailManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const { data: existingRow, error } = await auth.serviceSupabase
		.from('group_email_sending_domains')
		.select('*')
		.eq('id', domainId)
		.eq('group_id', auth.group.id)
		.maybeSingle();
	if (error) return { ok: false, status: 400, error: error.message };
	if (!existingRow) return { ok: false, status: 404, error: 'Sender domain not found.' };

	try {
		const data = await upsertSenderDomainRow({
			serviceSupabase: auth.serviceSupabase,
			auth,
			existingRow,
			payload: {
				...existingRow,
				domain: existingRow.domain,
				mail_from_subdomain: existingRow.mail_from_subdomain
			}
		});
		return { ok: true, data };
	} catch (verifyError) {
		return {
			ok: false,
			status: 500,
			error: verifyError?.message || 'Unable to verify sender domain.'
		};
	}
}

export async function autoProvisionEmailSenderForRegisteredDomain({
	serviceSupabase,
	groupId,
	domain,
	createdByUserId = null,
	fromName = ''
}) {
	const normalizedDomain = normalizeDomain(domain);
	if (!serviceSupabase || !groupId || !normalizedDomain) {
		return { ok: false, error: 'Missing required sender provisioning inputs.' };
	}

	const [{ data: existingRow, error: existingError }, { count: totalRows, error: countError }] =
		await Promise.all([
			serviceSupabase
				.from('group_email_sending_domains')
				.select('*')
				.eq('group_id', groupId)
				.eq('domain', normalizedDomain)
				.maybeSingle(),
			serviceSupabase
				.from('group_email_sending_domains')
				.select('id', { count: 'exact', head: true })
				.eq('group_id', groupId)
		]);

	if (existingError) return { ok: false, error: existingError.message };
	if (countError) return { ok: false, error: countError.message };

	try {
		const data = await upsertSenderDomainRow({
			serviceSupabase,
			auth: {
				group: { id: groupId },
				userId: createdByUserId || null
			},
			existingRow,
			payload: {
				domain: normalizedDomain,
				from_name: cleanNullableText(fromName || existingRow?.from_name, 120),
				from_local_part: cleanText(existingRow?.from_local_part || 'hello', 64) || 'hello',
				reply_to_email: normalizeEmail(existingRow?.reply_to_email || ''),
				is_default: existingRow ? existingRow.is_default === true : Number(totalRows || 0) === 0
			}
		});
		return { ok: true, data };
	} catch (error) {
		return { ok: false, error: error?.message || 'Unable to provision sender domain.' };
	}
}

export async function getGroupEmailSenderConfig(
	serviceSupabase,
	groupId,
	{ preferredDomainId = null } = {}
) {
	if (!serviceSupabase || !groupId) return null;

	const { data, error } = await serviceSupabase
		.from('group_email_sending_domains')
		.select('*')
		.eq('group_id', groupId)
		.eq('ses_verified_for_sending', true)
		.order('is_default', { ascending: false })
		.order('updated_at', { ascending: false });
	if (error) {
		console.warn('Unable to load group sender domain config', error);
		return null;
	}

	const rows = Array.isArray(data) ? data : [];
	const selection = resolveSenderSelection(rows, preferredDomainId);
	if (!selection.selected) {
		return {
			selectionStatus: selection.status,
			preferredDomainId: preferredDomainId || null,
			fromEmailAddress: null,
			replyToEmail: null,
			preferred: selection.preferred || null
		};
	}
	const selected = selection.selected;

	return {
		...selected,
		selectionStatus: selection.status,
		fromEmailAddress: buildFromAddress(selected),
		replyToEmail: normalizeEmail(selected.reply_to_email) || buildFromAddress(selected)
	};
}

export async function sendGroupManagedEmail({
	to,
	subject,
	html,
	text,
	replyTo,
	fromAddress,
	tags = [],
	branding = {},
	originBaseUrl = null
}) {
	if (!Array.isArray(to) && typeof to !== 'string') {
		throw new Error('Recipient email address is required.');
	}
	const recipients = (Array.isArray(to) ? to : [to])
		.map((value) => normalizeEmail(value))
		.filter(Boolean);
	if (!recipients.length) {
		throw new Error('Recipient email address is required.');
	}

	const normalizedSubject = cleanText(subject, 300);
	if (!normalizedSubject) {
		throw new Error('Subject is required.');
	}

	const normalizedFrom = cleanText(fromAddress, 320);
	if (!normalizedFrom) {
		throw new Error('From address is required.');
	}

	const client = ensureSesClient();
	const brandingOrigin = cleanText(originBaseUrl || PUBLIC_URL_BASE, 2000) || undefined;
	const brandedHtml = html
		? wrapHtmlWithBranding(html, {
				origin: brandingOrigin,
				category: cleanNullableText(branding?.category, 80),
				subjectLine: normalizedSubject,
				recipientReason: cleanNullableText(branding?.recipientReason, 280),
				portalUrl: cleanNullableText(branding?.actionUrl, 2000),
				actionLabel: cleanNullableText(branding?.actionLabel, 80)
			})
		: '';
	const brandedText = text
		? wrapTextWithBranding(text, {
				origin: brandingOrigin,
				category: cleanNullableText(branding?.category, 80),
				subjectLine: normalizedSubject,
				recipientReason: cleanNullableText(branding?.recipientReason, 280),
				portalUrl: cleanNullableText(branding?.actionUrl, 2000),
				actionLabel: cleanNullableText(branding?.actionLabel, 80)
			})
		: '';

	const response = await client.send(
		new SendEmailCommand({
			Source: normalizedFrom,
			Destination: {
				ToAddresses: recipients
			},
			ReplyToAddresses: replyTo ? [replyTo] : undefined,
			Message: {
				Subject: {
					Data: normalizedSubject,
					Charset: 'UTF-8'
				},
				Body: {
					Text: brandedText
						? {
								Data: brandedText,
								Charset: 'UTF-8'
							}
						: undefined,
					Html: brandedHtml
						? {
								Data: brandedHtml,
								Charset: 'UTF-8'
							}
						: undefined
				}
			},
			Tags: Array.isArray(tags) ? tags : undefined
		})
	);

	return {
		message: 'Email accepted for delivery.',
		messageId: response?.MessageId || null
	};
}
