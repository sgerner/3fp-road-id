import { supabase } from '$lib/supabaseClient';
import { isTurnstileEnabled } from '$lib/server/turnstile';
import { loadOwnedGroups } from '$lib/server/sectionNavigation';

export const load = async ({ cookies, fetch, route }) => {
	const isMicrosite = Boolean(route?.id?.startsWith('/site/'));
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

	const session = cookies.get('sb_session');
	if (!session) {
		return {
			user: null,
			userProfile: null,
			ownedGroups: [],
			isAdmin: false,
			turnstileEnabled: isTurnstileEnabled(),
			isMicrosite: false
		};
	}

	// Parse the session from the cookie
	let parsedSession = null;
	try {
		parsedSession = JSON.parse(session);
	} catch {
		parsedSession = null;
	}
	if (!parsedSession?.access_token) {
		return {
			user: null,
			userProfile: null,
			ownedGroups: [],
			isAdmin: false,
			turnstileEnabled: isTurnstileEnabled(),
			isMicrosite: false
		};
	}

	// Get the user details
	const { data: user } = await supabase.auth.getUser(parsedSession.access_token);
	const currentUser = user.user || null;
	let isAdmin = false;
	let userProfile = null;
	let ownedGroups = [];

	if (currentUser?.id) {
		ownedGroups = await loadOwnedGroups(fetch, currentUser.id).catch((err) => {
			console.warn('Failed to load owned groups for app layout', err);
			return [];
		});
		const { data: profile } = await supabase
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
	}

	return {
		user: currentUser,
		userProfile,
		ownedGroups,
		isAdmin,
		turnstileEnabled: isTurnstileEnabled(),
		isMicrosite: false
	};
};
