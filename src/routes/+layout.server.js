import { isTurnstileEnabled } from '$lib/server/turnstile';
import { loadOwnedGroups } from '$lib/server/sectionNavigation';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { resolveVerifiedSession } from '$lib/server/session';

export const load = async ({ cookies, fetch, route }) => {
	const isMicrosite = Boolean(route?.id?.startsWith('/[siteSlug]'));
	if (isMicrosite) {
		return {
			user: null,
			userProfile: null,
			ownedGroups: [],
			isAdmin: false,
			turnstileEnabled: false,
			isMicrosite: true
		};
	}

	const { accessToken, user: currentUser } = await resolveVerifiedSession(cookies);
	if (!accessToken || !currentUser?.id) {
		return {
			user: null,
			userProfile: null,
			ownedGroups: [],
			isAdmin: false,
			turnstileEnabled: isTurnstileEnabled(),
			isMicrosite: false
		};
	}

	let isAdmin = false;
	let userProfile = null;
	let ownedGroups = [];

	ownedGroups = await loadOwnedGroups(fetch, currentUser.id).catch((err) => {
		console.warn('Failed to load owned groups for app layout', err);
		return [];
	});
	const requestSupabase = createRequestSupabaseClient(accessToken);
	const { data: profile } = await requestSupabase
		.from('profiles')
		.select('id,user_id,full_name,avatar_url,bio,email,metadata,admin')
		.eq('user_id', currentUser.id)
		.maybeSingle();
	isAdmin = profile?.admin === true;
	userProfile = profile
		? {
				id: profile.id ?? null,
				user_id: profile.user_id ?? currentUser.id,
				full_name: profile.full_name ?? null,
				avatar_url: profile.avatar_url ?? null,
				bio: profile.bio ?? null,
				email: profile.email ?? currentUser.email ?? null,
				metadata:
					profile.metadata &&
					typeof profile.metadata === 'object' &&
					!Array.isArray(profile.metadata)
						? profile.metadata
						: {}
			}
		: null;

	return {
		user: currentUser,
		userProfile,
		ownedGroups,
		isAdmin,
		turnstileEnabled: isTurnstileEnabled(),
		isMicrosite: false
	};
};
