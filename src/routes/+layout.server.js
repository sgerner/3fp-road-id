import { supabase } from '$lib/supabaseClient';
import { isTurnstileEnabled } from '$lib/server/turnstile';

export const load = async ({ cookies }) => {
	const session = cookies.get('sb_session');
	if (!session) {
		return { user: null, turnstileEnabled: isTurnstileEnabled() };
	}

	// Parse the session from the cookie
	const parsedSession = JSON.parse(session);

	// Get the user details
	const { data: user, error } = await supabase.auth.getUser(parsedSession.access_token);

	return { user: user.user || null, turnstileEnabled: isTurnstileEnabled() };
};
