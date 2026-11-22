import { json } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '#lib/server/supabaseClient';
import { isValidRoadIdCode, reconcileRiderSafetyData } from '#lib/server/roadIdProfile';
import { enforceRateLimit } from '#lib/server/security';
import { resolveVerifiedSession } from '#lib/server/session';

export async function GET(event) {
	const limited = enforceRateLimit(event, {
		name: 'road-id-code-lookup',
		limit: 120,
		windowMs: 60 * 1000
	});
	if (limited) return limited;

	const { code } = event.params;
	if (!isValidRoadIdCode(code || '')) {
		return json({ error: 'Profile not found.' }, { status: 404 });
	}
	const supabase = createServiceSupabaseClient();

	if (!supabase) {
		return json({ error: 'Service client is unavailable.' }, { status: 500 });
	}

	const { data, error } = await supabase
		.from('qr_codes')
		.select(
			`
			code,
			profile_id,
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
	const roadIdRow = data?.profile || null;
	const ownerUserId = data?.profile_id || roadIdRow?.user_id || null;
	const isOwner = Boolean(user?.id && ownerUserId && user.id === ownerUserId);

	if (!ownerUserId) {
		return json({
			code: data.code,
			profile: null
		});
	}

	let profileFallback = null;
	const needsProfileFallback =
		!roadIdRow?.full_name || !roadIdRow?.phone || !roadIdRow?.emergency_contacts?.length;
	if (needsProfileFallback) {
		const profileRes = await supabase
			.from('profiles')
			.select('full_name,phone,emergency_contact_name,emergency_contact_phone')
			.eq('user_id', ownerUserId)
			.maybeSingle();
		if (!profileRes.error) {
			profileFallback = profileRes.data ?? null;
		}
	}

	const reconciled = reconcileRiderSafetyData({
		profileRow: profileFallback,
		roadIdRow,
		emergencyContacts: roadIdRow?.emergency_contacts ?? []
	});

	return json({
		code: data.code,
		profile: {
			user_id: isOwner ? ownerUserId : null,
			full_name: reconciled.full_name,
			phone: reconciled.phone,
			blood_type: reconciled.blood_type,
			allergies: reconciled.allergies,
			medication: reconciled.medication,
			emergency_contacts: reconciled.emergency_contacts,
			claimed: true,
			is_owner: isOwner
		}
	});
}
