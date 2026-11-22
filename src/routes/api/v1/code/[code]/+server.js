import { json } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '#lib/server/supabaseClient';
import { enforceRateLimit } from '#lib/server/security';
import { resolveVerifiedSession } from '#lib/server/session';
import { formatPublicResponderProfile, ROAD_ID_CODE_PATTERN } from '#lib/server/roadId';

export async function GET(event) {
	const limited = enforceRateLimit(event, {
		name: 'road-id-code-lookup',
		limit: 120,
		windowMs: 60 * 1000
	});
	if (limited) return limited;

	const { code } = event.params;
	if (!ROAD_ID_CODE_PATTERN.test(code || '')) {
		return json({ error: 'Profile not found.' }, { status: 404 });
	}
	const supabase = createServiceSupabaseClient();

	if (!supabase) {
		return json({ error: 'Service client is unavailable.' }, { status: 500 });
	}

	const [{ data, error }, { user }] = await Promise.all([
		supabase
			.from('qr_codes')
			.select(
				`
				code,
				profile:road_id_profiles (
					user_id,
					full_name,
					phone,
					blood_type,
					allergies,
					medication,
					emergency_contacts (
						id,
						contact_name,
						contact_phone,
						contact_relationship
					)
				)
			`
			)
			.eq('code', code)
			.single(),
		resolveVerifiedSession(event.cookies)
	]);

	if (error) {
		return json({ error: 'Profile not found.' }, { status: 404 });
	}

	const profile = data?.profile || null;
	const isOwner = Boolean(user?.id && profile?.user_id && user.id === profile.user_id);
	return json({
		code: data.code,
		profile: formatPublicResponderProfile(profile, isOwner)
	});
}
