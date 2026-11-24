const PROGRAM_ACCESS_MODES = new Set(['public', 'private_request']);
const PROGRAM_CONTRIBUTION_MODES = new Set(['paid', 'donation']);

/**
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string}
 */
function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const trimmed = String(value).trim();
	if (!maxLength) return trimmed;
	return trimmed.slice(0, maxLength);
}

/**
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string | null}
 */
function cleanNullableText(value, maxLength = 0) {
	const cleaned = cleanText(value, maxLength);
	return cleaned || null;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeEmail(value) {
	const cleaned = cleanText(value, 320).toLowerCase();
	if (!cleaned) return '';
	return /^\S+@\S+\.\S+$/.test(cleaned) ? cleaned : '';
}

/**
 * @param {unknown} value
 * @param {boolean} [fallback]
 * @returns {boolean}
 */
function normalizeBoolean(value, fallback = false) {
	if (typeof value === 'boolean') return value;
	if (value === 'true' || value === '1' || value === 1) return true;
	if (value === 'false' || value === '0' || value === 0) return false;
	return fallback;
}

/**
 * @param {unknown} value
 * @param {number | null} [fallback]
 * @returns {number | null}
 */
function normalizeInteger(value, fallback = null) {
	if (value === null || value === undefined || value === '') return fallback;
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function normalizeNullableAmountCents(value) {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return parsed;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeCurrency(value) {
	const cleaned = cleanText(value || 'usd', 10).toLowerCase();
	return cleaned || 'usd';
}

/**
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function normalizeContributionMode(value, fallback = 'donation') {
	const cleaned = cleanText(value || '', 32).toLowerCase();
	if (cleaned === 'none') return 'donation';
	if (cleaned === 'required_fee') return 'paid';
	if (PROGRAM_CONTRIBUTION_MODES.has(cleaned)) return cleaned;
	return fallback;
}

/**
 * @param {Record<string, any> | null | undefined} profile
 */
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

export const SCOPED_CONTACT_COLUMNS = ['contact_full_name', 'contact_email', 'contact_phone'];

/**
 * @param {Record<string, any> | null | undefined} payload
 */
export function stripScopedContactColumns(payload) {
	if (!payload || typeof payload !== 'object') return payload;
	const next = { ...payload };
	for (const column of SCOPED_CONTACT_COLUMNS) {
		delete next[column];
	}
	return next;
}

/**
 * @param {any} error
 * @returns {boolean}
 */
export function isMissingScopedContactColumnError(error) {
	if (!error) return false;
	const code = cleanText(error?.code || '', 32).toUpperCase();
	const text = [error?.message, error?.details, error?.hint]
		.filter((part) => typeof part === 'string' && part.trim())
		.join(' ')
		.toLowerCase();
	const mentionsContactColumn = SCOPED_CONTACT_COLUMNS.some((column) => text.includes(column));
	if (!mentionsContactColumn) return false;
	if (code === 'PGRST204' || code === '42703') return true;
	return (
		text.includes('schema cache') ||
		text.includes('does not exist') ||
		text.includes('could not find')
	);
}

/**
 * @param {any} serviceSupabase
 * @param {string} tableName
 * @param {Record<string, any>} payload
 */
export async function insertWithScopedContactFallback(serviceSupabase, tableName, payload) {
	const first = await serviceSupabase.from(tableName).insert(payload).select('*').single();
	if (!first.error || !isMissingScopedContactColumnError(first.error)) {
		return first;
	}
	return serviceSupabase
		.from(tableName)
		.insert(stripScopedContactColumns(payload))
		.select('*')
		.single();
}

/**
 * @param {any} serviceSupabase
 * @param {Record<string, any>} existingRow
 * @param {Record<string, any>} contactUpdates
 * @param {string} updatedAt
 */
export async function updateExistingMembershipContactWithFallback(
	serviceSupabase,
	existingRow,
	contactUpdates,
	updatedAt
) {
	const result = await serviceSupabase
		.from('group_memberships')
		.update({
			...contactUpdates,
			updated_at: updatedAt
		})
		.eq('id', existingRow.id)
		.select('*')
		.single();
	if (result.error && isMissingScopedContactColumnError(result.error)) {
		return { data: existingRow, error: null, skippedScopedContactColumns: true };
	}
	return result;
}

/**
 * @param {Record<string, any> | null | undefined} profilePayload
 * @param {Record<string, any> | null} [fallbackContact]
 */
export function extractScopedContactColumns(profilePayload, fallbackContact = null) {
	const normalized = normalizeProfilePayload(profilePayload);
	const fallbackName = cleanNullableText(
		fallbackContact?.contact_full_name ?? fallbackContact?.full_name,
		120
	);
	const fallbackEmail =
		sanitizeEmail(fallbackContact?.contact_email || fallbackContact?.email || '') || null;
	const fallbackPhone = cleanNullableText(
		fallbackContact?.contact_phone ?? fallbackContact?.phone,
		40
	);

	return {
		contact_full_name: normalized?.full_name ?? fallbackName ?? null,
		contact_email: normalized?.email ?? fallbackEmail ?? null,
		contact_phone: normalized?.phone ?? fallbackPhone ?? null
	};
}

/**
 * @param {Record<string, any> | null | undefined} existingProfile
 * @param {{ currentEmail?: string | null; profilePayload?: Record<string, any> | null }} [options]
 */
export function computeGlobalProfileBackfill(
	existingProfile,
	{ currentEmail = null, profilePayload = null } = {}
) {
	const normalized = normalizeProfilePayload(profilePayload);
	const existingFullName = cleanNullableText(existingProfile?.full_name, 120);
	const existingEmail = sanitizeEmail(existingProfile?.email || '') || null;
	const existingPhone = cleanNullableText(existingProfile?.phone, 40);

	const nextFullName = existingFullName || normalized?.full_name || null;
	const nextEmail = existingEmail || sanitizeEmail(currentEmail || '') || normalized?.email || null;

	const hasExistingRow = Boolean(existingProfile?.user_id);
	const needsNameBackfill = !existingFullName && Boolean(nextFullName);
	const needsEmailBackfill = !existingEmail && Boolean(nextEmail);
	const shouldUpdate = hasExistingRow
		? needsNameBackfill || needsEmailBackfill
		: Boolean(nextFullName || nextEmail);

	return {
		shouldUpdate,
		updates: {
			email: nextEmail,
			full_name: nextFullName,
			phone: existingPhone
		}
	};
}

/**
 * @param {Record<string, any> | null | undefined} record
 * @param {Record<string, any> | null} [globalProfile]
 */
export function mergeScopedMemberContact(record, globalProfile = null) {
	const scopedName = cleanNullableText(record?.contact_full_name, 120);
	const scopedEmail = sanitizeEmail(record?.contact_email || '') || null;
	const scopedPhone = cleanNullableText(record?.contact_phone, 40);

	const fallbackName = cleanNullableText(globalProfile?.full_name, 120);
	const fallbackEmail = sanitizeEmail(globalProfile?.email || '') || null;
	const fallbackPhone = cleanNullableText(globalProfile?.phone, 40);

	if (!scopedName && !scopedEmail && !scopedPhone && !globalProfile) {
		return null;
	}

	return {
		...(globalProfile || {}),
		user_id: record?.user_id || globalProfile?.user_id || null,
		full_name: scopedName || fallbackName || null,
		email: scopedEmail || fallbackEmail || null,
		phone: scopedPhone || fallbackPhone || null,
		avatar_url: globalProfile?.avatar_url ?? null
	};
}

/**
 * @param {{
 *   serviceSupabase: any;
 *   userId: string | null | undefined;
 *   currentEmail?: string | null;
 *   profilePayload?: Record<string, any> | null;
 * }} params
 */
export async function ensureUserGlobalProfileDefaults({
	serviceSupabase,
	userId,
	currentEmail = null,
	profilePayload = null
}) {
	if (!userId) return { updated: false };
	const { data: existing, error: existingError } = await serviceSupabase
		.from('profiles')
		.select('user_id,email,full_name,phone,avatar_url,bio,metadata')
		.eq('user_id', userId)
		.maybeSingle();
	if (existingError) throw new Error(existingError.message);

	const backfill = computeGlobalProfileBackfill(existing, {
		currentEmail,
		profilePayload
	});
	if (!backfill.shouldUpdate) return { updated: false };

	const payload = {
		user_id: userId,
		email: backfill.updates.email,
		full_name: backfill.updates.full_name,
		phone: existing?.phone ?? null,
		avatar_url: existing?.avatar_url ?? null,
		bio: existing?.bio ?? null,
		metadata: existing?.metadata ?? {}
	};

	const { error: upsertError } = await serviceSupabase
		.from('profiles')
		.upsert(payload, { onConflict: 'user_id' });
	if (upsertError) throw new Error(upsertError.message);
	return { updated: true, payload };
}

/**
 * @param {Record<string, any>} before
 * @param {Record<string, any>} payload
 * @param {string} [now]
 */
export function buildTierUpdatePayload(before, payload, now = new Date().toISOString()) {
	const nextMonthlyAmount =
		payload?.monthly_amount_cents !== undefined || payload?.amount_cents !== undefined
			? normalizeNullableAmountCents(payload?.monthly_amount_cents ?? payload?.amount_cents)
			: normalizeNullableAmountCents(before.monthly_amount_cents ?? before.amount_cents);
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

	return {
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
		allow_custom_amount: nextAllowCustom,
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
		updated_at: now
	};
}

/**
 * @param {any} serviceSupabase
 * @param {string} programId
 * @param {string | null} [desiredDefaultTierId]
 * @param {string} [now]
 */
export async function syncProgramDefaultTier(
	serviceSupabase,
	programId,
	desiredDefaultTierId = null,
	now = new Date().toISOString()
) {
	const { data: tierRows, error: tierError } = await serviceSupabase
		.from('group_membership_tiers')
		.select('id,program_id,is_active,is_default')
		.eq('program_id', programId);
	if (tierError) return { ok: false, status: 400, error: tierError.message };

	const tiers = /** @type {Array<Record<string, any>>} */ (tierRows || []);
	const tierById = new Map(tiers.map((tier) => [tier.id, tier]));
	let resolvedDefaultTierId = cleanNullableText(desiredDefaultTierId, 64);

	if (resolvedDefaultTierId) {
		const targetTier = tierById.get(resolvedDefaultTierId);
		if (!targetTier || targetTier.program_id !== programId) {
			return {
				ok: false,
				status: 400,
				error: 'Default tier must belong to this membership program.'
			};
		}
		if (targetTier.is_active === false) {
			resolvedDefaultTierId = null;
		}
	}

	let clearQuery = serviceSupabase
		.from('group_membership_tiers')
		.update({ is_default: false, updated_at: now })
		.eq('program_id', programId)
		.eq('is_default', true);
	if (resolvedDefaultTierId) {
		clearQuery = clearQuery.neq('id', resolvedDefaultTierId);
	}
	const { error: clearError } = await clearQuery;
	if (clearError) return { ok: false, status: 400, error: clearError.message };

	if (resolvedDefaultTierId) {
		const { error: setDefaultError } = await serviceSupabase
			.from('group_membership_tiers')
			.update({ is_default: true, updated_at: now })
			.eq('id', resolvedDefaultTierId)
			.eq('program_id', programId);
		if (setDefaultError) return { ok: false, status: 400, error: setDefaultError.message };
	}

	const { data: updatedProgram, error: programError } = await serviceSupabase
		.from('group_membership_programs')
		.update({ default_tier_id: resolvedDefaultTierId, updated_at: now })
		.eq('id', programId)
		.select('*')
		.single();
	if (programError) return { ok: false, status: 400, error: programError.message };

	return {
		ok: true,
		defaultTierId: resolvedDefaultTierId,
		program: updatedProgram
	};
}

/**
 * @param {{
 *   serviceSupabase: any;
 *   before: Record<string, any>;
 *   existingTiers?: Array<Record<string, any>>;
 *   payload?: Record<string, any>;
 *   now?: string;
 *   onTierUpdated?: ((beforeTier: Record<string, any>, updatedTier: Record<string, any>) => Promise<void> | void) | null;
 * }} params
 */
export async function executeUnifiedProgramAndTiersSave({
	serviceSupabase,
	before,
	existingTiers = [],
	payload = {},
	now = new Date().toISOString(),
	onTierUpdated = null
}) {
	const existingTierById = new Map((existingTiers || []).map((tier) => [tier.id, tier]));
	const accessMode = PROGRAM_ACCESS_MODES.has(cleanText(payload?.access_mode, 32))
		? cleanText(payload?.access_mode, 32)
		: before.access_mode || 'public';
	const contributionMode = normalizeContributionMode(
		payload?.contribution_mode,
		normalizeContributionMode(before.contribution_mode, 'donation')
	);

	const tierBatchInputs = Array.isArray(payload?.tiers) ? payload.tiers : null;
	const validatedTierUpdates = [];
	if (tierBatchInputs) {
		for (const tierInput of tierBatchInputs) {
			const tierId = cleanNullableText(tierInput?.id, 64);
			const existingTier = tierId ? existingTierById.get(tierId) : null;
			if (!existingTier || existingTier.program_id !== before.id) {
				return {
					ok: false,
					status: 400,
					error: 'All edited tiers must belong to this membership program.'
				};
			}
			const nextUpdates = buildTierUpdatePayload(existingTier, tierInput, now);
			if (!nextUpdates.name) {
				return { ok: false, status: 400, error: 'Tier name is required.' };
			}
			validatedTierUpdates.push({
				before: existingTier,
				updates: {
					...nextUpdates,
					// Synchronize is_default in syncProgramDefaultTier to avoid unique index conflicts.
					is_default: existingTier.is_default
				},
				requestedDefault:
					tierInput?.is_default !== undefined ? normalizeBoolean(tierInput.is_default, false) : null
			});
		}
	}

	let desiredDefaultTierId = before.default_tier_id || null;
	if (payload?.default_tier_id !== undefined) {
		desiredDefaultTierId = cleanNullableText(payload.default_tier_id, 64);
	} else if (validatedTierUpdates.some((entry) => entry.requestedDefault === true)) {
		desiredDefaultTierId =
			validatedTierUpdates.find((entry) => entry.requestedDefault === true)?.before.id || null;
	}

	if (desiredDefaultTierId) {
		const targetTier = existingTierById.get(desiredDefaultTierId) || null;
		if (!targetTier || targetTier.program_id !== before.id) {
			return {
				ok: false,
				status: 400,
				error: 'Default tier must belong to this membership program.'
			};
		}
	}

	for (const entry of validatedTierUpdates) {
		const { data: updatedTier, error: tierUpdateError } = await serviceSupabase
			.from('group_membership_tiers')
			.update(entry.updates)
			.eq('id', entry.before.id)
			.select('*')
			.single();
		if (tierUpdateError) {
			return { ok: false, status: 400, error: tierUpdateError.message };
		}
		if (typeof onTierUpdated === 'function') {
			await onTierUpdated(entry.before, updatedTier);
		}
	}

	const hasPolicyMarkdown = payload?.policy_markdown !== undefined;
	const nextPolicyMarkdown = hasPolicyMarkdown
		? cleanText(payload.policy_markdown ?? '', 50000)
		: before.policy_markdown;
	const policyChanged =
		hasPolicyMarkdown && nextPolicyMarkdown !== cleanText(before.policy_markdown ?? '', 50000);
	const explicitBump =
		payload?.bump_policy_version !== undefined
			? normalizeBoolean(payload.bump_policy_version, policyChanged)
			: payload?.bump_version !== undefined
				? normalizeBoolean(payload.bump_version, policyChanged)
				: null;
	const shouldBumpPolicyVersion =
		hasPolicyMarkdown && (explicitBump !== null ? explicitBump : policyChanged);

	/** @type {Record<string, any>} */
	const updates = {
		enabled: normalizeBoolean(payload?.enabled, before.enabled !== false),
		access_mode: accessMode,
		cta_label: cleanText(payload?.cta_label || before.cta_label || 'Follow', 80),
		contribution_mode: contributionMode,
		default_tier_id: desiredDefaultTierId,
		updated_at: now
	};

	if (hasPolicyMarkdown) {
		updates.policy_markdown = nextPolicyMarkdown;
		if (policyChanged || shouldBumpPolicyVersion) {
			updates.policy_updated_at = now;
		}
		updates.policy_version = shouldBumpPolicyVersion
			? (normalizeInteger(before.policy_version, 1) || 1) + 1
			: before.policy_version;
	}

	const { error: programError } = await serviceSupabase
		.from('group_membership_programs')
		.update(updates)
		.eq('id', before.id);
	if (programError) return { ok: false, status: 400, error: programError.message };

	const syncResult = await syncProgramDefaultTier(
		serviceSupabase,
		before.id,
		desiredDefaultTierId,
		now
	);
	if (!syncResult.ok) return syncResult;

	return {
		ok: true,
		program: syncResult.program,
		hasPolicyMarkdown,
		policyChanged,
		shouldBumpPolicyVersion
	};
}
