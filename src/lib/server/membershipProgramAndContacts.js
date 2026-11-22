const PROGRAM_ACCESS_MODES = new Set(['public', 'private_request']);
const PROGRAM_CONTRIBUTION_MODES = new Set(['paid', 'donation']);

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

function sanitizeEmail(value) {
	const cleaned = cleanText(value, 320).toLowerCase();
	if (!cleaned) return '';
	return /^\S+@\S+\.\S+$/.test(cleaned) ? cleaned : '';
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

function normalizeNullableAmountCents(value) {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return parsed;
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

export async function ensureUserGlobalProfileDefaults({
	serviceSupabase,
	userId,
	currentEmail = null,
	profilePayload
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

	const tiers = tierRows || [];
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
