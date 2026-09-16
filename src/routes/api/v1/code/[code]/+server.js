import { json } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { enforceRateLimit } from '$lib/server/security';
import { resolveVerifiedSession } from '$lib/server/session';

export async function GET(event) {
	const limited = enforceRateLimit(event, {
		name: 'road-id-code-lookup',
		limit: 120,
		windowMs: 60 * 1000
	});
	if (limited) return limited;

	const { code } = event.params;
	if (!/^[A-Za-z0-9_-]{4,64}$/.test(code || '')) {
		return json({ error: 'Profile not found.' }, { status: 404 });
	}
	const supabase = createServiceSupabaseClient();

	if (!supabase) {
		return json({ error: 'Service client is unavailable.' }, { status: 500 });
	}

	// Query the qr_codes table, joining the related profile and emergency contacts
	const { data, error } = await supabase
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
		.single();

	if (error) {
		return json({ error: 'Profile not found.' }, { status: 404 });
	}

	const { user } = await resolveVerifiedSession(event.cookies);
	const profile = data?.profile || null;
	const isOwner = Boolean(user?.id && profile?.user_id && user.id === profile.user_id);
	return json({
		code: data.code,
		profile: profile
			? {
					...profile,
					user_id: isOwner ? profile.user_id : null,
					claimed: Boolean(profile.user_id),
					is_owner: isOwner
				}
			: null
	});
}
