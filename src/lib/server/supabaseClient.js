import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
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

let cachedServiceClient = null;
let cachedServiceKey = null;

export function createServiceSupabaseClient() {
	const serviceKey =
		env.SUPABASE_SERVICE_ROLE_KEY ||
		env.SUPABASE_SERVICE_KEY ||
		env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY ||
		env.PRIVATE_SUPABASE_SERVICE_KEY ||
		null;

	if (!serviceKey) {
		return null;
	}

	if (cachedServiceClient && cachedServiceKey === serviceKey) {
		return cachedServiceClient;
	}

	cachedServiceClient = createClient(PUBLIC_SUPABASE_URL, serviceKey, {
		...baseOptions,
		global: {
			...baseOptions.global,
			headers: { ...baseOptions.global.headers }
		}
	});
	cachedServiceKey = serviceKey;

	return cachedServiceClient;
}
