function cleanSlug(value, maxLength = 120) {
	if (value === null || value === undefined) return '';
	const trimmed = String(value).trim();
	return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

const PUBLIC_MEMBERSHIP_GROUP_FIELD_LIST = [
	'id',
	'slug',
	'name',
	'website_url',
	'social_links',
	'public_contact_email'
];

const PUBLIC_MEMBERSHIP_PROGRAM_FIELD_LIST = [
	'id',
	'group_id',
	'enabled',
	'access_mode',
	'cta_label',
	'contribution_mode',
	'default_tier_id',
	'policy_markdown',
	'policy_version',
	'policy_updated_at',
	'created_at',
	'updated_at'
];

const PUBLIC_MEMBERSHIP_TIER_FIELD_LIST = [
	'id',
	'program_id',
	'name',
	'description',
	'amount_cents',
	'monthly_amount_cents',
	'annual_amount_cents',
	'currency',
	'billing_type',
	'interval_unit',
	'interval_count',
	'is_default',
	'is_active',
	'sort_order',
	'allow_custom_amount',
	'min_amount_cents',
	'created_at',
	'updated_at'
];

const PUBLIC_MEMBERSHIP_FORM_FIELD_FIELD_LIST = [
	'id',
	'program_id',
	'field_type',
	'label',
	'help_text',
	'required',
	'options_json',
	'sort_order',
	'active',
	'created_at',
	'updated_at'
];

export const PUBLIC_MEMBERSHIP_GROUP_COLUMNS = PUBLIC_MEMBERSHIP_GROUP_FIELD_LIST.join(',');
export const PUBLIC_MEMBERSHIP_PROGRAM_COLUMNS = PUBLIC_MEMBERSHIP_PROGRAM_FIELD_LIST.join(',');
export const PUBLIC_MEMBERSHIP_TIER_COLUMNS = PUBLIC_MEMBERSHIP_TIER_FIELD_LIST.join(',');
export const PUBLIC_MEMBERSHIP_FORM_FIELD_COLUMNS =
	PUBLIC_MEMBERSHIP_FORM_FIELD_FIELD_LIST.join(',');

function pickFields(row, keys) {
	if (!row || typeof row !== 'object') return null;
	return Object.fromEntries(
		keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]])
	);
}

export function resolveViewerIncludeInactive(includeInactive, { canManage = false } = {}) {
	return canManage === true ? Boolean(includeInactive) : false;
}

export function buildViewerStripeConnection(donationAccount, { canManage = false } = {}) {
	if (!donationAccount) {
		return {
			connected: false,
			charges_enabled: false,
			stripe_account_id: null
		};
	}

	return {
		connected: Boolean(donationAccount.stripe_account_id),
		charges_enabled: donationAccount.charges_enabled === true,
		stripe_account_id: canManage === true ? donationAccount.stripe_account_id || null : null
	};
}

export function sanitizeMembershipTierForViewer(tier, { canManage = false } = {}) {
	if (!tier || typeof tier !== 'object') return tier;
	if (canManage === true) return tier;
	return pickFields(tier, PUBLIC_MEMBERSHIP_TIER_FIELD_LIST);
}

async function loadPublicGroupBySlug(serviceSupabase, groupSlug) {
	const slug = cleanSlug(groupSlug, 120);
	if (!slug) return null;

	const { data, error } = await serviceSupabase
		.from('groups')
		.select(PUBLIC_MEMBERSHIP_GROUP_COLUMNS)
		.eq('slug', slug)
		.eq('is_published', true)
		.maybeSingle();

	if (error) throw new Error(error.message);
	if (!data || data.is_published === false) return null;
	return pickFields(data, PUBLIC_MEMBERSHIP_GROUP_FIELD_LIST);
}

async function loadPublicDonationAccountForGroup(serviceSupabase, groupId) {
	const { data, error } = await serviceSupabase
		.from('donation_accounts')
		.select('id,stripe_account_id,charges_enabled')
		.eq('group_id', groupId)
		.maybeSingle();

	if (error) throw new Error(error.message);
	return data ?? null;
}

async function loadPublicProgramForGroup(serviceSupabase, groupId) {
	const { data, error } = await serviceSupabase
		.from('group_membership_programs')
		.select(PUBLIC_MEMBERSHIP_PROGRAM_COLUMNS)
		.eq('group_id', groupId)
		.eq('enabled', true)
		.eq('access_mode', 'public')
		.maybeSingle();

	if (error) throw new Error(error.message);
	if (!data || data.enabled !== true || data.access_mode !== 'public') {
		return null;
	}
	return pickFields(data, PUBLIC_MEMBERSHIP_PROGRAM_FIELD_LIST);
}

async function loadPublicProgramBundle(serviceSupabase, programId) {
	const [tiersRes, fieldsRes] = await Promise.all([
		serviceSupabase
			.from('group_membership_tiers')
			.select(PUBLIC_MEMBERSHIP_TIER_COLUMNS)
			.eq('program_id', programId)
			.eq('is_active', true)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true }),
		serviceSupabase
			.from('group_membership_form_fields')
			.select(PUBLIC_MEMBERSHIP_FORM_FIELD_COLUMNS)
			.eq('program_id', programId)
			.eq('active', true)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true })
	]);

	if (tiersRes.error) throw new Error(tiersRes.error.message);
	if (fieldsRes.error) throw new Error(fieldsRes.error.message);

	const tiers = (tiersRes.data || [])
		.filter((tier) => tier?.is_active !== false)
		.map((tier) => pickFields(tier, PUBLIC_MEMBERSHIP_TIER_FIELD_LIST));
	const fields = (fieldsRes.data || [])
		.filter((field) => field?.active !== false)
		.map((field) => pickFields(field, PUBLIC_MEMBERSHIP_FORM_FIELD_FIELD_LIST));

	return { tiers, fields };
}

/**
 * @typedef {| { ok: false, status: number, error: string }
 *   | {
 *       ok: true,
 *       data: {
 *         group: any,
 *         program: any,
 *         tiers: any[],
 *         form_fields: any[],
 *         stripe_connection: {
 *           connected: boolean,
 *           charges_enabled: boolean,
 *           stripe_account_id: string | null,
 *           stripe_account_email?: string | null,
 *           active_tier_count?: number,
 *           active_paid_tier_count?: number,
 *           active_subscription_count?: number,
 *           past_due_count?: number,
 *           can_disconnect?: boolean,
 *           disconnect_blocked_reason?: string | null,
 *           manage_url?: string
 *         },
 *         can_manage: boolean
 *       }
 *     }} MembershipProgramViewerResult
 */

/**
 * @param {any} serviceSupabase
 * @param {any} groupSlug
 * @returns {Promise<MembershipProgramViewerResult>}
 */
export async function getPublicMembershipProgram(serviceSupabase, groupSlug) {
	if (!serviceSupabase) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
	}

	const group = await loadPublicGroupBySlug(serviceSupabase, groupSlug);
	if (!group) {
		return { ok: false, status: 404, error: 'Group not found.' };
	}

	const [donationAccount, program] = await Promise.all([
		loadPublicDonationAccountForGroup(serviceSupabase, group.id),
		loadPublicProgramForGroup(serviceSupabase, group.id)
	]);

	const stripeConnection = buildViewerStripeConnection(donationAccount, { canManage: false });

	if (!program) {
		return {
			ok: true,
			data: {
				group,
				program: null,
				tiers: [],
				form_fields: [],
				stripe_connection: stripeConnection,
				can_manage: false
			}
		};
	}

	const { tiers, fields } = await loadPublicProgramBundle(serviceSupabase, program.id);
	return {
		ok: true,
		data: {
			group,
			program,
			tiers,
			form_fields: fields,
			stripe_connection: stripeConnection,
			can_manage: false
		}
	};
}

/**
 * @param {{
 *   viewer: any,
 *   serviceSupabase: any,
 *   groupSlug: any,
 *   includeInactive?: boolean,
 *   loadGroupBySlugFn?: any,
 *   isGroupManagerFn?: any,
 *   loadDonationAccountFn?: any,
 *   buildStripeConnectionFn?: any,
 *   ensureProgramFn?: any,
 *   loadProgramFn?: any,
 *   ensureDefaultApplicationFieldsFn?: any,
 *   loadProgramBundleFn?: any
 * }} options
 * @returns {Promise<MembershipProgramViewerResult>}
 */
export async function resolveMembershipProgramForViewer({
	viewer,
	serviceSupabase,
	groupSlug,
	includeInactive = false,
	loadGroupBySlugFn,
	isGroupManagerFn,
	loadDonationAccountFn,
	buildStripeConnectionFn,
	ensureProgramFn,
	loadProgramFn,
	ensureDefaultApplicationFieldsFn,
	loadProgramBundleFn
}) {
	if (!viewer?.userId) {
		return getPublicMembershipProgram(serviceSupabase, groupSlug);
	}

	const group = await loadGroupBySlugFn(viewer.requestSupabase, groupSlug);
	if (!group) {
		return { ok: false, status: 404, error: 'Group not found.' };
	}

	const canManage = Boolean(
		await isGroupManagerFn(viewer.requestSupabase, group.id, viewer.userId, viewer.isAdmin)
	);
	const effectiveIncludeInactive = resolveViewerIncludeInactive(includeInactive, { canManage });
	const sourceSupabase = canManage ? serviceSupabase : viewer.requestSupabase;
	const stripeConnection = buildStripeConnectionFn
		? await buildStripeConnectionFn(serviceSupabase, group, { canManage })
		: buildViewerStripeConnection(await loadDonationAccountFn(serviceSupabase, group.id), {
				canManage
			});

	let program = null;
	if (canManage) {
		program = await ensureProgramFn(sourceSupabase, group.id);
	} else {
		program = await loadProgramFn(sourceSupabase, group.id);
		if (program && ensureDefaultApplicationFieldsFn) {
			await ensureDefaultApplicationFieldsFn(serviceSupabase, program.id);
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

	const { tiers, fields } = await loadProgramBundleFn(sourceSupabase, program.id, {
		includeInactive: effectiveIncludeInactive
	});

	return {
		ok: true,
		data: {
			group,
			program,
			tiers: (tiers || []).map((tier) => sanitizeMembershipTierForViewer(tier, { canManage })),
			form_fields: fields || [],
			stripe_connection: stripeConnection,
			can_manage: canManage
		}
	};
}
