import { fail, redirect } from '@sveltejs/kit';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { resolveVerifiedSession } from '#lib/server/session';
import { buildMicrositeUrl, normalizeMicrositeSlug } from '#lib/microsites/host';
import { buildDefaultGroupSiteConfig } from '#lib/microsites/config';
import { recommendGroupSiteTemplate } from '#lib/microsites/templates';
import {
	getGroupSiteConfig,
	invalidateMicrositePageCache,
	upsertGroupSiteConfig
} from '#lib/server/groupSites';
import { invalidateGroupSnapshotCache } from '#lib/server/groupSnapshots';
import { getGroupStripeBillingGuard } from '#lib/server/groupStripeConnection.js';
import {
	managedSponsorLogoObjectPaths,
	publishGroupPresence,
	removeStorageObjects,
	SPONSOR_LOGO_BUCKET
} from '#lib/server/groupPresencePublish';
import { readFormData } from '#lib/server/security';
import {
	extractPresenceStudioFormValues,
	normalizePresenceStudioView,
	syncSiteConfigWithCoreGroup
} from '#lib/groups/presenceStudio';

/**
 * @param {any} cookies
 * @param {string} slug
 * @returns {Promise<
 *   | { ok: false, response: any }
 *   | { ok: true, slug: string, group: Record<string, any>, groupId: string, userId: string, isAdmin: boolean, supabase: any }
 * >}
 */
async function requirePresenceManager(cookies, slug) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return { ok: false, response: fail(401, { error: 'Authentication required.' }) };
	}

	const supabase = createRequestSupabaseClient(accessToken);
	const { data: group, error: groupError } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', slug)
		.maybeSingle();
	if (groupError || !group) {
		return { ok: false, response: fail(404, { error: 'Group not found.' }) };
	}

	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		supabase.from('profiles').select('user_id,email,admin').eq('user_id', user.id).maybeSingle(),
		supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.eq('role', 'owner')
	]);

	const isAdmin = profile?.admin === true;
	if (!isAdmin && !(ownerRows ?? []).length) {
		return {
			ok: false,
			response: fail(403, { error: 'You do not have permission to edit this group.' })
		};
	}

	return {
		ok: true,
		slug,
		group,
		groupId: group.id,
		userId: user.id,
		isAdmin,
		supabase
	};
}

/**
 * @param {{ params: Record<string, string>, request: Request, cookies: any }} event
 */
async function publishPresenceChanges({ params, request, cookies }) {
	const auth = await requirePresenceManager(cookies, params.slug);
	if (!auth.ok) return auth.response;
	const { slug, group, groupId, supabase } = auth;

	const parsedForm = await readFormData(request, { maxBytes: 64 * 1024 * 1024 });
	if (!parsedForm.ok) {
		return fail(parsedForm.status, { error: parsedForm.error });
	}

	const result = await publishGroupPresence({
		slug,
		group,
		groupId,
		supabase,
		form: parsedForm.value,
		getSiteConfig: getGroupSiteConfig,
		upsertSiteConfig: upsertGroupSiteConfig,
		getServiceSupabase: createServiceSupabaseClient,
		invalidateSnapshotCache: invalidateGroupSnapshotCache
	});

	if (!result.ok) {
		return fail(result.status, result.body);
	}

	throw redirect(303, result.redirectTo);
}

export const load = async ({ parent, url, cookies }) => {
	const parentData = await parent();
	const group = parentData.group;
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	const supabase = createRequestSupabaseClient(accessToken);
	const privateSupabase = createServiceSupabaseClient() || supabase;

	const [
		profileResponse,
		ownersResponse,
		groupTypesResponse,
		audienceFocusesResponse,
		ridingDisciplinesResponse,
		skillLevelsResponse,
		selectedTypesResponse,
		selectedAudiencesResponse,
		selectedDisciplinesResponse,
		selectedSkillsResponse,
		donationResponse,
		membershipBillingGuard,
		storedSiteConfig,
		groupsResponse
	] = await Promise.all([
		user?.id
			? supabase.from('profiles').select('user_id,email,admin').eq('user_id', user.id).maybeSingle()
			: Promise.resolve({ data: null }),
		supabase.from('group_members').select('user_id').eq('group_id', group.id).eq('role', 'owner'),
		supabase.from('group_types').select('id, name').neq('name', 'Bike Shop').order('name'),
		supabase.from('audience_focuses').select('id, name').order('name'),
		supabase.from('riding_disciplines').select('id, name').order('name'),
		supabase.from('skill_levels').select('id, name').order('name'),
		supabase.from('group_x_group_types').select('group_type_id').eq('group_id', group.id),
		supabase.from('group_x_audience_focuses').select('audience_focus_id').eq('group_id', group.id),
		supabase
			.from('group_x_riding_disciplines')
			.select('riding_discipline_id')
			.eq('group_id', group.id),
		supabase.from('group_x_skill_levels').select('skill_level_id').eq('group_id', group.id),
		Promise.resolve(
			privateSupabase
				.from('donation_accounts')
				.select(
					'id,stripe_account_id,stripe_account_email,charges_enabled,payouts_enabled,connected_at'
				)
				.eq('group_id', group.id)
				.maybeSingle()
		).catch(() => ({ data: null })),
		getGroupStripeBillingGuard(privateSupabase, group.id, group.slug).catch(() => null),
		getGroupSiteConfig(group.id, { group, supabaseClient: supabase }),
		supabase
			.from('groups')
			.select('id,slug,name,city,state_region')
			.order('name', { ascending: true })
			.limit(500)
	]);

	const allOwners = ownersResponse?.data ?? [];
	const ownerIds = allOwners.map((row) => row.user_id).filter(Boolean);
	let ownerEmails = [];
	if (ownerIds.length) {
		const { data: emailsData } = await privateSupabase
			.from('profiles')
			.select('user_id,email')
			.in('user_id', ownerIds);
		ownerEmails = emailsData || [];
	}

	const groupTypes = groupTypesResponse?.data ?? [];
	const selectedGroupTypeIds = (selectedTypesResponse?.data ?? []).map((row) => row.group_type_id);
	const selectedTypeSet = new Set(selectedGroupTypeIds);
	const groupTypeNames = groupTypes
		.filter((item) => selectedTypeSet.has(item.id))
		.map((item) => item.name)
		.filter(Boolean);

	const defaultSiteConfig = buildDefaultGroupSiteConfig(group);
	const siteConfig = syncSiteConfigWithCoreGroup(storedSiteConfig, group);
	const micrositeSlug = normalizeMicrositeSlug(group.microsite_slug || group.slug);
	const previewPath = `/${encodeURIComponent(micrositeSlug)}`;
	const directoryPreviewPath = `/groups/${encodeURIComponent(group.slug)}`;
	const liveUrl = buildMicrositeUrl(micrositeSlug, url);
	const directoryUrl = `${url.origin}/groups/${encodeURIComponent(group.slug)}`;

	const hasDomainReturn =
		url.searchParams.has('domain_checkout') || url.searchParams.has('domain_payment');
	const initialView = normalizePresenceStudioView(
		url.searchParams.get('view'),
		hasDomainReturn ? 'address' : 'profile'
	);

	return {
		group,
		group_types: groupTypes,
		audience_focuses: audienceFocusesResponse?.data ?? [],
		riding_disciplines: ridingDisciplinesResponse?.data ?? [],
		skill_levels: skillLevelsResponse?.data ?? [],
		selected: {
			group_type_ids: selectedGroupTypeIds,
			audience_focus_ids: (selectedAudiencesResponse?.data ?? []).map(
				(row) => row.audience_focus_id
			),
			riding_discipline_ids: (selectedDisciplinesResponse?.data ?? []).map(
				(row) => row.riding_discipline_id
			),
			skill_level_ids: (selectedSkillsResponse?.data ?? []).map((row) => row.skill_level_id)
		},
		owners: allOwners.map((row) => ({
			user_id: row.user_id,
			email: ownerEmails.find((entry) => entry.user_id === row.user_id)?.email || ''
		})),
		donation_account: donationResponse?.data ?? null,
		membership_billing_guard: membershipBillingGuard,
		stripe_status: url.searchParams.get('stripe') || '',
		stripe_reason: url.searchParams.get('reason') || '',
		current_user_id: user?.id || parentData.session_user_id || '',
		current_profile: profileResponse?.data ?? null,
		micrositeSlug,
		availableGroups: Array.isArray(groupsResponse?.data) ? groupsResponse.data : [],
		groupTypeNames,
		recommendedSiteTemplateId: recommendGroupSiteTemplate({ group, groupTypeNames }),
		siteConfig,
		defaultSiteConfig,
		previewPath,
		directoryPreviewPath,
		liveUrl,
		directoryUrl,
		initialView,
		saved: (url.searchParams.get('saved') || '').trim(),
		generated: (url.searchParams.get('generated') || '').trim(),
		reset: (url.searchParams.get('reset') || '').trim()
	};
};

export const actions = {
	publish: publishPresenceChanges,
	save: publishPresenceChanges,
	reset: async ({ params, request, cookies }) => {
		const auth = await requirePresenceManager(cookies, params.slug);
		if (!auth.ok) return auth.response;
		const { slug, group, groupId, supabase } = auth;

		const parsedForm = await readFormData(request, { maxBytes: 64 * 1024 * 1024 });
		const values =
			parsedForm.ok && [...parsedForm.value.keys()].length > 0
				? extractPresenceStudioFormValues(parsedForm.value, { group })
				: null;
		const previousConfig = await getGroupSiteConfig(groupId, { group, supabaseClient: supabase });
		const { error } = await supabase.from('group_site_configs').delete().eq('group_id', groupId);
		if (error) {
			return fail(400, {
				error: error.message,
				...(values ? { values } : {})
			});
		}
		invalidateMicrositePageCache(groupId);
		invalidateGroupSnapshotCache({ groupId, slug: group.slug || slug });
		await removeStorageObjects(createServiceSupabaseClient(), SPONSOR_LOGO_BUCKET, [
			...managedSponsorLogoObjectPaths(previousConfig, groupId)
		]);
		throw redirect(303, `/groups/${encodeURIComponent(slug)}/manage/presence?reset=1&view=builder`);
	},
	delete: async ({ params, cookies }) => {
		const auth = await requirePresenceManager(cookies, params.slug);
		if (!auth.ok) return auth.response;

		const { group, groupId, supabase } = auth;
		const { error: deleteError } = await supabase
			.from('groups')
			.update({
				is_published: false,
				updated_at: new Date().toISOString()
			})
			.eq('id', groupId);
		if (deleteError) return fail(500, { error: deleteError.message });

		invalidateMicrositePageCache(groupId);
		invalidateGroupSnapshotCache({ groupId, slug: group?.slug || params.slug });
		throw redirect(303, '/groups/my');
	}
};
