import { fetchSingle, fetchList } from '#lib/server/internalApi';
import { redirect } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import { getGroupAssetsReadClient, listGroupAssetBuckets } from '#lib/server/groupAssets';
import { listPublishedGroupNewsPosts } from '#lib/server/groupNews';
import { getGroupClaimStatus } from '#lib/server/groupClaimStatus';
import { joinMembership } from '#lib/server/memberships';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { supabase } from '#lib/supabaseClient';
import { publicAccountingReport } from '#lib/server/groupAccountingPublic';

export const load = async ({ params, cookies, fetch, url }) => {
	const slug = params.slug;

	let group = null;
	try {
		group = await fetchSingle(fetch, 'groups', {
			slug: `eq.${slug}`,
			single: 'true'
		});
	} catch (err) {
		console.warn('Failed to load group details', err);
		return { error: err?.message ?? 'Failed to load group' };
	}
	if (!group) {
		return { error: 'Group not found' };
	}

	const { user: sessionUser, accessToken } = await resolveVerifiedSession(cookies);
	const sessionUserId = sessionUser?.id ?? null;
	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	const publicClaimStatus = getGroupClaimStatus(serviceSupabase, group.id).catch((err) => {
		console.warn('Failed to load public group claim status', err);
		return null;
	});
	let sessionIsAdmin = false;
	if (sessionUserId) {
		try {
			const profileRow = await fetchSingle(fetch, 'profiles', {
				user_id: `eq.${sessionUserId}`,
				select: 'admin',
				single: 'true'
			});
			sessionIsAdmin = profileRow?.admin === true;
		} catch (err) {
			console.warn('Failed to resolve session profile for group page', err);
			sessionIsAdmin = false;
		}
	}

	const [
		groupTypes,
		audienceFocuses,
		ridingDisciplines,
		skillLevels,
		groupTypeSelections,
		audienceSelections,
		disciplineSelections,
		skillSelections,
		ownerRows,
		managerRows,
		serviceClaimStatus
	] = await Promise.all([
		fetchList(fetch, 'group-types', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load group types', err);
			return [];
		}),
		fetchList(fetch, 'audience-focuses', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load audience focuses', err);
			return [];
		}),
		fetchList(fetch, 'riding-disciplines', { select: 'id,name', order: 'name.asc' }).catch(
			(err) => {
				console.warn('Failed to load riding disciplines', err);
				return [];
			}
		),
		fetchList(fetch, 'skill-levels', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load skill levels', err);
			return [];
		}),
		fetchList(fetch, 'group-x-group-types', {
			select: 'group_type_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load group type selections', err);
			return [];
		}),
		fetchList(fetch, 'group-x-audience-focuses', {
			select: 'audience_focus_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load audience focus selections', err);
			return [];
		}),
		fetchList(fetch, 'group-x-riding-disciplines', {
			select: 'riding_discipline_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load riding discipline selections', err);
			return [];
		}),
		fetchList(fetch, 'group-x-skill-levels', {
			select: 'skill_level_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load skill level selections', err);
			return [];
		}),
		fetchList(fetch, 'group-members', {
			select: 'user_id',
			group_id: `eq.${group.id}`,
			role: 'eq.owner'
		}).catch((err) => {
			console.warn('Failed to load group owners', err);
			return [];
		}),
		fetchList(fetch, 'group-members', {
			select: 'user_id,role',
			group_id: `eq.${group.id}`,
			role: 'in.(owner,admin)'
		}).catch((err) => {
			console.warn('Failed to load group social managers', err);
			return [];
		}),
		publicClaimStatus
	]);

	const ownerIds = ownerRows.map((row) => row?.user_id).filter(Boolean);
	const managerIds = managerRows.map((row) => row?.user_id).filter(Boolean);
	const is_owner = sessionUserId ? ownerIds.includes(sessionUserId) : false;
	const is_social_manager = sessionUserId ? managerIds.includes(sessionUserId) : false;
	const can_edit = sessionIsAdmin || is_owner;
	const is_claimed = serviceClaimStatus ?? ownerIds.length > 0;
	const can_manage_social = is_claimed && is_social_manager;

	let donationEnabled = false;
	try {
		const { data } = await supabase
			.from('donation_accounts_public')
			.select('is_connected')
			.eq('group_id', group.id)
			.maybeSingle();
		donationEnabled = Boolean(data?.is_connected);
	} catch (err) {
		console.warn('Failed to load donation account for group page', err);
	}

	let membershipProgram = null;
	let membershipTiers = [];
	let membershipFormFields = [];
	let myMemberships = [];
	try {
		const response = await fetch(
			`/api/groups/${encodeURIComponent(slug)}/membership/program?include_inactive=false`
		);
		const payload = await response.json().catch(() => ({}));
		if (response.ok && payload?.data) {
			membershipProgram = payload.data.program ?? null;
			membershipTiers = Array.isArray(payload.data.tiers) ? payload.data.tiers : [];
			membershipFormFields = Array.isArray(payload.data.form_fields)
				? payload.data.form_fields
				: [];
		}
	} catch (err) {
		console.warn('Failed to load membership program for group page', err);
	}

	if (sessionUserId) {
		try {
			const { data: membershipRows, error: membershipError } = await requestSupabase
				.from('group_memberships')
				.select('id,status,tier_id,started_at,renews_at,ends_at,created_at')
				.eq('group_id', group.id)
				.eq('user_id', sessionUserId)
				.order('created_at', { ascending: false })
				.limit(20);
			if (membershipError) {
				console.warn('Failed to load current user memberships for group page', membershipError);
			} else {
				myMemberships = membershipRows || [];
			}
		} catch (err) {
			console.warn('Failed to load current user memberships for group page', err);
		}
	}

	const autoFollowRequested = (url.searchParams.get('auto_follow') || '').trim() === '1';
	const autoFollowTierId = (url.searchParams.get('auto_follow_tier') || '').trim();
	if (autoFollowRequested && sessionUserId) {
		const selectedTier =
			membershipTiers.find((tier) => tier.id === autoFollowTierId) ||
			(membershipTiers.length === 1 ? membershipTiers[0] : null);
		const normalizedContributionMode =
			membershipProgram?.contribution_mode === 'required_fee'
				? 'paid'
				: membershipProgram?.contribution_mode || 'donation';
		const monthlyAmount = Number(
			selectedTier?.monthly_amount_cents ?? selectedTier?.amount_cents ?? 0
		);
		const annualAmount = Number(selectedTier?.annual_amount_cents ?? 0);
		const isFreeTier =
			Boolean(selectedTier) &&
			monthlyAmount <= 0 &&
			annualAmount <= 0 &&
			selectedTier?.allow_custom_amount !== true;
		const canAutoFollow =
			membershipProgram?.enabled === true &&
			Boolean(selectedTier) &&
			membershipTiers.length === 1 &&
			isFreeTier &&
			normalizedContributionMode !== 'paid' &&
			membershipProgram?.access_mode !== 'private_request';

		const nextUrl = new URL(`/groups/${encodeURIComponent(slug)}`, url.origin);
		if (canAutoFollow) {
			const followResult = await joinMembership({
				cookies,
				groupSlug: slug,
				payload: {
					tier_id: selectedTier.id,
					billing_interval: 'month'
				}
			});
			if (followResult?.ok) {
				nextUrl.searchParams.set('follow', 'success');
			} else {
				nextUrl.searchParams.set('follow', 'error');
				if (followResult?.error) {
					nextUrl.searchParams.set('follow_msg', String(followResult.error).slice(0, 140));
				}
			}
		} else {
			nextUrl.searchParams.set('follow', 'error');
			nextUrl.searchParams.set(
				'follow_msg',
				'This group requires selecting a membership option before joining.'
			);
		}
		throw redirect(303, `${nextUrl.pathname}${nextUrl.search}`);
	}

	let assetBuckets = [];
	try {
		assetBuckets = await listGroupAssetBuckets(getGroupAssetsReadClient(), group.id);
	} catch (err) {
		console.warn('Failed to load group asset buckets for group page', err);
		assetBuckets = [];
	}

	const nowIso = new Date().toISOString();

	let groupNewsPosts = [];
	try {
		groupNewsPosts = await listPublishedGroupNewsPosts(supabase, group.id, { limit: 3 });
	} catch (err) {
		console.warn('Failed to load group news for group page', err);
		groupNewsPosts = [];
	}

	let accountingPublicReports = [];
	try {
		if (serviceSupabase) {
			const { data: reportRows, error: reportError } = await serviceSupabase
				.from('group_accounting_public_reports')
				.select(
					'id,slug,title,report_period_start,report_period_end,visibility,snapshot,notes,published_at'
				)
				.eq('group_id', group.id)
				.eq('published', true)
				.order('published_at', { ascending: false })
				.limit(3);
			if (reportError) {
				console.warn('Failed to load public accounting snapshots for group page', reportError);
			} else {
				accountingPublicReports = (reportRows ?? []).map(publicAccountingReport);
			}
		}
	} catch (err) {
		console.warn('Failed to load public accounting snapshots for group page', err);
		accountingPublicReports = [];
	}

	async function loadVolunteerEvents() {
		try {
			const eventRows = await fetchList(fetch, 'volunteer-events', {
				select: [
					'id',
					'slug',
					'title',
					'summary',
					'event_start',
					'event_end',
					'timezone',
					'location_name',
					'location_address',
					'host_group_id',
					'host_user_id'
				].join(','),
				host_group_id: `eq.${group.id}`,
				status: 'eq.published',
				event_start: `gte.${nowIso}`,
				order: 'event_start.asc',
				limit: '3'
			});

			let eventHostIds = new Set();
			if (sessionUserId && Array.isArray(eventRows) && eventRows.length) {
				const eventIds = eventRows
					.map((row) => row?.id)
					.filter((value) => value !== null && value !== undefined);
				if (eventIds.length) {
					try {
						const hostRows = await fetchList(fetch, 'v-volunteer-event-hosts-with-profiles', {
							event_id: `in.(${eventIds.join(',')})`,
							user_id: `eq.${sessionUserId}`
						});
						eventHostIds = new Set(hostRows.map((row) => row?.event_id).filter(Boolean));
					} catch (err) {
						console.warn('Failed to load volunteer event host assignments for group page', err);
					}
				}
			}

			return Array.isArray(eventRows)
				? eventRows.map((row) => ({
						id: row.id,
						slug: row.slug,
						title: row.title,
						summary: row.summary,
						event_start: row.event_start,
						event_end: row.event_end,
						timezone: row.timezone,
						location_name: row.location_name,
						location_address: row.location_address,
						host_group_id: row.host_group_id,
						can_manage:
							sessionIsAdmin ||
							is_owner ||
							(sessionUserId && row.host_user_id && row.host_user_id === sessionUserId) ||
							(sessionUserId && eventHostIds.has(row.id))
					}))
				: [];
		} catch (err) {
			console.warn('Unexpected error loading volunteer events for group page', err);
			return [];
		}
	}

	async function loadRides() {
		try {
			const qs = new URLSearchParams({ host_group_id: group.id }).toString();
			const response = await fetch(`/api/rides?${qs}`);
			if (!response.ok) throw new Error('Failed to load rides');
			const payload = await response.json();
			return Array.isArray(payload?.data) ? payload.data : [];
		} catch (err) {
			console.warn('Unexpected error loading rides for group page', err);
			return [];
		}
	}

	const [volunteerEvents, rides] = await Promise.all([loadVolunteerEvents(), loadRides()]);

	return {
		group,
		group_types: groupTypes,
		audience_focuses: audienceFocuses,
		riding_disciplines: ridingDisciplines,
		skill_levels: skillLevels,
		selected: {
			group_type_ids: groupTypeSelections
				.map((r) => r?.group_type_id)
				.filter((value) => value !== null && value !== undefined),
			audience_focus_ids: audienceSelections
				.map((r) => r?.audience_focus_id)
				.filter((value) => value !== null && value !== undefined),
			riding_discipline_ids: disciplineSelections
				.map((r) => r?.riding_discipline_id)
				.filter((value) => value !== null && value !== undefined),
			skill_level_ids: skillSelections
				.map((r) => r?.skill_level_id)
				.filter((value) => value !== null && value !== undefined)
		},
		owners_count: ownerIds.length,
		is_claimed,
		is_owner,
		is_social_manager,
		can_manage_social,
		asset_buckets: assetBuckets,
		session_user_id: sessionUserId,
		can_edit,
		donation_enabled: donationEnabled,
		membership_program: membershipProgram,
		membership_tiers: membershipTiers,
		membership_form_fields: membershipFormFields,
		my_memberships: myMemberships,
		group_news_posts: groupNewsPosts,
		accounting_public_reports: accountingPublicReports,
		volunteer_events: volunteerEvents,
		rides
	};
};
