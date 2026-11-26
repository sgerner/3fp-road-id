import { error } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import { createRequestSupabaseClient } from '#lib/server/supabaseClient';
import { isTurnstileEnabled } from '#lib/server/turnstile';

async function safeJson(fetchPromise, fallback = null) {
	try {
		const response = await fetchPromise;
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) return fallback;
		return payload?.data ?? fallback;
	} catch {
		return fallback;
	}
}

export const load = async ({ params, fetch, cookies }) => {
	const slug = params.slug;

	const group = await safeJson(
		fetch(`/api/v1/groups?slug=eq.${encodeURIComponent(slug)}&single=true`),
		null
	);
	if (!group) {
		throw error(404, 'Group not found.');
	}

	const programData = await safeJson(
		fetch(`/api/groups/${encodeURIComponent(slug)}/membership/program?include_inactive=false`),
		null
	);

	const { accessToken, user } = await resolveVerifiedSession(cookies);
	let myApplications = [];
	let myMemberships = [];
	let myTierChangeRequests = [];
	let currentUserProfile = null;

	if (accessToken && user?.id) {
		const requestSupabase = createRequestSupabaseClient(accessToken);
		const [appsRes, membershipsRes, profileRes] = await Promise.all([
			requestSupabase
				.from('group_membership_applications')
				.select('*')
				.eq('group_id', group.id)
				.eq('user_id', user.id)
				.order('submitted_at', { ascending: false })
				.limit(20),
			requestSupabase
				.from('group_memberships')
				.select('*')
				.eq('group_id', group.id)
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(20),
			requestSupabase
				.from('profiles')
				.select('full_name,email,phone')
				.eq('user_id', user.id)
				.maybeSingle()
		]);

		myApplications = appsRes.data || [];
		myMemberships = membershipsRes.data || [];
		const latestScoped =
			myMemberships.find(
				(row) => row?.contact_full_name || row?.contact_email || row?.contact_phone
			) ||
			myApplications.find(
				(row) => row?.contact_full_name || row?.contact_email || row?.contact_phone
			) ||
			null;
		currentUserProfile = {
			full_name: latestScoped?.contact_full_name || profileRes.data?.full_name || null,
			email: latestScoped?.contact_email || profileRes.data?.email || user.email || null,
			phone: latestScoped?.contact_phone || profileRes.data?.phone || null
		};

		const membershipIds = myMemberships.map((row) => row?.id).filter(Boolean);
		if (membershipIds.length) {
			const { data: tierChangeRows } = await requestSupabase
				.from('group_membership_tier_change_requests')
				.select('*')
				.in('membership_id', membershipIds)
				.eq('status', 'pending')
				.order('updated_at', { ascending: false })
				.limit(20);
			myTierChangeRequests = tierChangeRows || [];
		}
	}

	return {
		group,
		program_data: programData,
		my_applications: myApplications,
		my_memberships: myMemberships,
		my_tier_change_requests: myTierChangeRequests,
		current_user_profile: currentUserProfile,
		current_user_id: user?.id || null,
		turnstile_enabled: isTurnstileEnabled()
	};
};
