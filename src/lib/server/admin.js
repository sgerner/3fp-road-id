import { error, redirect } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/session';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';

export async function requireAdmin(cookies, { redirectTo = null } = {}) {
	const { accessToken, user } = resolveSession(cookies);
	if (!user?.id || !accessToken) {
		if (redirectTo) throw redirect(303, redirectTo);
		throw error(401, 'Authentication required.');
	}

	const supabase = createRequestSupabaseClient(accessToken);
	const { data: profile, error: profileError } = await supabase
		.from('profiles')
		.select('admin')
		.eq('user_id', user.id)
		.maybeSingle();

	if (profileError) {
		throw error(500, profileError.message);
	}

	if (!profile?.admin) {
		if (redirectTo) throw redirect(303, redirectTo);
		throw error(403, 'Admin access required.');
	}

	return { user, supabase };
}
