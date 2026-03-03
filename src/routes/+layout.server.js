import { supabase } from '$lib/supabaseClient';
import { isTurnstileEnabled } from '$lib/server/turnstile';

export const load = async ({ cookies }) => {
	const session = cookies.get('sb_session');
	if (!session) {
		return { user: null, isAdmin: false, turnstileEnabled: isTurnstileEnabled() };
	}

	// Parse the session from the cookie
	const parsedSession = JSON.parse(session);

	// Get the user details
	const { data: user, error } = await supabase.auth.getUser(parsedSession.access_token);
	const currentUser = user.user || null;
	let isAdmin = false;

	if (currentUser?.id) {
		const { data: profile } = await supabase
			.from('profiles')
			.select('admin')
			.eq('user_id', currentUser.id)
			.maybeSingle();
		isAdmin = profile?.admin === true;
	}

	return { user: currentUser, isAdmin, turnstileEnabled: isTurnstileEnabled() };
};
