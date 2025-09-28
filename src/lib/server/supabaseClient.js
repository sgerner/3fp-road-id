import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

const baseOptions = {
	auth: {
		persistSession: false,
		autoRefreshToken: false
	},
	global: {
		headers: {}
	}
};

export function createRequestSupabaseClient(accessToken) {
	const options = {
		...baseOptions,
		global: {
			...baseOptions.global,
			headers: { ...baseOptions.global.headers }
		}
	};

	if (accessToken) {
		options.global.headers['Authorization'] = `Bearer ${accessToken}`;
	}

	return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, options);
}
