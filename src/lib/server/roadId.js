import {
	ROAD_ID_CODE_PATTERN,
	normalizeRoadIdCodeInput,
	resolveConfirmRedirectDestination
} from '#lib/utils/roadId.js';

export { ROAD_ID_CODE_PATTERN, normalizeRoadIdCodeInput, resolveConfirmRedirectDestination };

const ROAD_ID_PROFILE_FIELDS = {
	full_name: 200,
	phone: 64,
	blood_type: 64,
	allergies: 2_000,
	medication: 2_000
};

export function pickRoadIdProfileFields(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const result = {};
	for (const [field, maxLength] of Object.entries(ROAD_ID_PROFILE_FIELDS)) {
		if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
		if (value[field] === null) {
			result[field] = '';
			continue;
		}
		if (typeof value[field] !== 'string' || value[field].length > maxLength) return null;
		result[field] = value[field].trim();
	}
	return Object.keys(result).length ? result : null;
}

export function formatPublicResponderProfile(profile, isOwner = false) {
	if (!profile || typeof profile !== 'object') return null;
	return {
		full_name: profile.full_name ?? '',
		phone: profile.phone ?? '',
		blood_type: profile.blood_type ?? '',
		allergies: profile.allergies ?? '',
		medication: profile.medication ?? '',
		emergency_contacts: Array.isArray(profile.emergency_contacts)
			? profile.emergency_contacts.map((contact) => ({
					id: contact.id,
					contact_name: contact.contact_name ?? '',
					contact_phone: contact.contact_phone ?? '',
					contact_relationship: contact.contact_relationship ?? ''
				}))
			: [],
		claimed: Boolean(profile.user_id),
		is_owner: Boolean(isOwner)
	};
}

export async function loadUserRoadIdBundle(supabase, userId) {
	if (!supabase || !userId) {
		return {
			roadIdProfile: null,
			emergencyContacts: [],
			linkedCodes: []
		};
	}

	const [profileRes, contactsRes, codesRes] = await Promise.all([
		supabase
			.from('road_id_profiles')
			.select('user_id,full_name,phone,blood_type,allergies,medication,created_at')
			.eq('user_id', userId)
			.maybeSingle(),
		supabase
			.from('emergency_contacts')
			.select('id,profile_id,contact_name,contact_phone,contact_relationship,created_at')
			.eq('profile_id', userId)
			.order('id', { ascending: true }),
		supabase
			.from('qr_codes')
			.select('code,profile_id,created_at')
			.eq('profile_id', userId)
			.order('created_at', { ascending: true })
			.order('code', { ascending: true })
	]);

	return {
		roadIdProfile: profileRes.data
			? {
					user_id: profileRes.data.user_id,
					full_name: profileRes.data.full_name ?? '',
					phone: profileRes.data.phone ?? '',
					blood_type: profileRes.data.blood_type ?? '',
					allergies: profileRes.data.allergies ?? '',
					medication: profileRes.data.medication ?? '',
					created_at: profileRes.data.created_at ?? null
				}
			: null,
		emergencyContacts: Array.isArray(contactsRes.data)
			? contactsRes.data.map((row) => ({
					id: row.id,
					contact_name: row.contact_name ?? '',
					contact_phone: row.contact_phone ?? '',
					contact_relationship: row.contact_relationship ?? ''
				}))
			: [],
		linkedCodes: Array.isArray(codesRes.data)
			? codesRes.data.map((row) => ({
					code: row.code,
					created_at: row.created_at ?? null
				}))
			: []
	};
}

export async function ensureRoadIdProfileExists({
	client,
	userId,
	fallbackFullName = '',
	fallbackPhone = ''
}) {
	if (!client || !userId) return { ok: false, error: 'Database client unavailable.' };

	const { data: existing, error: existingErr } = await client
		.from('road_id_profiles')
		.select('user_id,full_name,phone,blood_type,allergies,medication')
		.eq('user_id', userId)
		.maybeSingle();

	if (existingErr) {
		return { ok: false, error: existingErr.message || 'Unable to check emergency profile.' };
	}
	if (existing) {
		return { ok: true, profile: existing };
	}

	let seedName = String(fallbackFullName || '').trim();
	let seedPhone = String(fallbackPhone || '').trim();
	if (!seedName || !seedPhone) {
		const { data: accountProfile } = await client
			.from('profiles')
			.select('full_name,phone')
			.eq('user_id', userId)
			.maybeSingle();
		if (!seedName && accountProfile?.full_name) {
			seedName = String(accountProfile.full_name).trim();
		}
		if (!seedPhone && accountProfile?.phone) {
			seedPhone = String(accountProfile.phone).trim();
		}
	}

	const { data: inserted, error: upsertErr } = await client
		.from('road_id_profiles')
		.upsert(
			{
				user_id: userId,
				full_name: seedName || null,
				phone: seedPhone || null
			},
			{ onConflict: 'user_id' }
		)
		.select('user_id,full_name,phone,blood_type,allergies,medication')
		.single();

	if (upsertErr) {
		return { ok: false, error: upsertErr.message || 'Unable to initialize emergency profile.' };
	}
	return { ok: true, profile: inserted };
}

export async function claimRoadIdCodeForUser({
	serviceSupabase,
	userId,
	rawCode,
	seedFullName = null,
	seedPhone = null,
	allowAlreadyOwned = false
}) {
	if (!userId) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}
	const code = normalizeRoadIdCodeInput(rawCode);
	if (!code) {
		return {
			ok: false,
			status: 400,
			error: 'Enter a valid bracelet code (4–64 letters, numbers, hyphens, or underscores).'
		};
	}
	if (!serviceSupabase) {
		return { ok: false, status: 503, error: 'Bracelet claiming is temporarily unavailable.' };
	}

	const { data: rpcData, error: rpcError } = await serviceSupabase.rpc('claim_road_id_code', {
		target_code: code,
		claimant_user_id: userId,
		seed_full_name: seedFullName || null,
		seed_phone: seedPhone || null
	});

	if (rpcError) {
		console.error('Atomic Road ID claim failed:', rpcError);
		return { ok: false, status: 400, error: 'Unable to claim bracelet code.' };
	}

	const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
	const outcome = row?.status || 'invalid';

	if (outcome === 'invalid') {
		return { ok: false, status: 400, error: 'Enter a valid bracelet code.' };
	}
	if (outcome === 'not_found') {
		return {
			ok: false,
			status: 404,
			error: `Bracelet code "${code}" was not found. Check the code printed on your band.`
		};
	}
	if (outcome === 'conflict') {
		return {
			ok: false,
			status: 409,
			error: 'This bracelet code is already claimed by another rider.'
		};
	}
	if (outcome === 'already_owned' && !allowAlreadyOwned) {
		return {
			ok: false,
			status: 409,
			error: 'This bracelet code is already linked to your Emergency ID.'
		};
	}
	if (outcome !== 'claimed' && outcome !== 'already_owned') {
		return { ok: false, status: 400, error: 'Unable to claim bracelet code.' };
	}

	const bundle = await loadUserRoadIdBundle(serviceSupabase, userId);
	return {
		ok: true,
		status: 200,
		claimStatus: outcome,
		code: row?.code || code,
		profile: bundle.roadIdProfile,
		codes: bundle.linkedCodes
	};
}

export async function unlinkRoadIdCodeForUser({ serviceSupabase, userId, rawCode }) {
	if (!userId) {
		return { ok: false, status: 401, error: 'Authentication required.' };
	}
	const code = normalizeRoadIdCodeInput(rawCode);
	if (!code) {
		return { ok: false, status: 400, error: 'Invalid bracelet code.' };
	}
	if (!serviceSupabase) {
		return { ok: false, status: 503, error: 'Bracelet management is temporarily unavailable.' };
	}

	const { data: unlinked, error: rpcError } = await serviceSupabase.rpc('unlink_road_id_code', {
		target_code: code,
		owner_user_id: userId
	});

	if (rpcError) {
		console.error('Road ID unlink failed:', rpcError);
		return { ok: false, status: 400, error: 'Unable to unlink bracelet code.' };
	}
	if (unlinked !== true) {
		return { ok: false, status: 404, error: 'Linked bracelet code not found.' };
	}

	const bundle = await loadUserRoadIdBundle(serviceSupabase, userId);
	return {
		ok: true,
		status: 200,
		unlinkedCode: code,
		codes: bundle.linkedCodes
	};
}
