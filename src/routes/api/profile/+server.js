import { json } from '@sveltejs/kit';
import { getActivityClient } from '#lib/server/activities';
import { searchGeocode } from '#lib/server/geocoding';
import {
	loadRiderSafetyState,
	reconcileRiderSafetyData,
	saveUnifiedRiderSafety,
	syncVolunteerContactToProfile,
	upsertOwnProfileRow,
	validateSafetyPayload
} from '#lib/server/roadIdProfile';
import { getSmsServiceClient, hasSmsInboxAccess } from '#lib/server/sms';
import { normalizeE164PhoneNumber } from '#lib/utils/phone';

const MAX_FULL_NAME_LENGTH = 120;
const MAX_BIO_LENGTH = 600;
const MAX_LOCATION_LENGTH = 120;
const MAX_INTERESTS = 12;
const MAX_INTEREST_LENGTH = 40;
const ALLOWED_FOCUS = new Set(['groups', 'rides', 'volunteer']);

const PROFILE_SELECT_COLUMNS =
	'id,user_id,full_name,avatar_url,bio,email,phone,emergency_contact_name,emergency_contact_phone,admin,metadata,updated_at,created_at';

function safeText(value, maxLength) {
	if (value === null || value === undefined) return '';
	return String(value).trim().slice(0, maxLength);
}

function safeUrl(value) {
	const candidate = safeText(value, 2000);
	if (!candidate) return '';
	return /^https?:\/\//i.test(candidate) ? candidate : '';
}

function normalizeStringArray(values, limit = MAX_INTERESTS, itemMaxLength = MAX_INTEREST_LENGTH) {
	if (!Array.isArray(values)) return [];
	const next = [];
	for (const value of values) {
		const cleaned = safeText(value, itemMaxLength);
		if (!cleaned) continue;
		if (next.some((item) => item.toLowerCase() === cleaned.toLowerCase())) continue;
		next.push(cleaned);
		if (next.length >= limit) break;
	}
	return next;
}

function normalizeFocus(values) {
	const normalized = normalizeStringArray(values, 3, 20)
		.map((value) => value.toLowerCase())
		.filter((value) => ALLOWED_FOCUS.has(value));
	return Array.from(new Set(normalized));
}

function normalizeMetadataObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return value;
}

function normalizeHomeLocation(value) {
	const source = normalizeMetadataObject(value);
	const latitude = Number(source.latitude);
	const longitude = Number(source.longitude);
	return {
		label: safeText(source.label, MAX_LOCATION_LENGTH),
		latitude: Number.isFinite(latitude) ? latitude : null,
		longitude: Number.isFinite(longitude) ? longitude : null
	};
}

function extractRecommendationContext(metadata) {
	const contextRaw = normalizeMetadataObject(metadata?.recommendation_context);
	return {
		location: safeText(contextRaw.location, MAX_LOCATION_LENGTH),
		home_location: normalizeHomeLocation(contextRaw.home_location),
		interests: normalizeStringArray(contextRaw.interests),
		recommendation_focus: normalizeFocus(contextRaw.recommendation_focus)
	};
}

/**
 * @param {Record<string, any> | null | undefined} profileRow
 * @param {Record<string, any> | null} [reconciled]
 */
function normalizeProfileShape(profileRow, reconciled = null) {
	if (!profileRow && !reconciled) return null;
	return {
		id: profileRow?.id ?? null,
		user_id: profileRow?.user_id ?? null,
		full_name: (reconciled?.full_name || profileRow?.full_name) ?? null,
		avatar_url: profileRow?.avatar_url ?? null,
		bio: profileRow?.bio ?? null,
		email: profileRow?.email ?? null,
		phone: (reconciled?.phone || profileRow?.phone) ?? null,
		emergency_contact_name:
			(reconciled?.primary_emergency_contact?.contact_name || profileRow?.emergency_contact_name) ??
			null,
		emergency_contact_phone:
			(reconciled?.primary_emergency_contact?.contact_phone ||
				profileRow?.emergency_contact_phone) ??
			null,
		admin: profileRow?.admin === true,
		metadata: normalizeMetadataObject(profileRow?.metadata),
		updated_at: profileRow?.updated_at ?? null,
		created_at: profileRow?.created_at ?? null
	};
}

export async function GET({ cookies }) {
	const { user, supabase } = await getActivityClient(cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	let profileResult;
	let safetyState;
	try {
		[profileResult, safetyState] = await Promise.all([
			supabase.from('profiles').select(PROFILE_SELECT_COLUMNS).eq('user_id', user.id).maybeSingle(),
			loadRiderSafetyState(supabase, user.id)
		]);
	} catch (err) {
		return json({ error: err?.message || 'Unable to load profile.' }, { status: 500 });
	}

	if (profileResult.error) {
		return json(
			{ error: profileResult.error.message || 'Unable to load profile.' },
			{ status: 500 }
		);
	}

	const reconciled = reconcileRiderSafetyData({
		profileRow: profileResult.data,
		roadIdRow: safetyState.roadIdProfile,
		emergencyContacts: safetyState.emergencyContacts
	});
	const profile = normalizeProfileShape(profileResult.data, reconciled);
	const smsAccessClient = getSmsServiceClient() ?? supabase;
	const canManageSms =
		profile?.admin === true ||
		(await hasSmsInboxAccess(smsAccessClient, user.id).catch((err) => {
			console.warn('Unable to resolve SMS inbox access for profile', err);
			return false;
		}));

	return json({
		profile,
		context: extractRecommendationContext(profile?.metadata ?? {}),
		canManageSms,
		roadIdProfile: safetyState.roadIdProfile,
		safetyProfile: {
			blood_type: reconciled.blood_type,
			allergies: reconciled.allergies,
			medication: reconciled.medication
		},
		emergencyContacts: reconciled.emergency_contacts,
		claimedCodes: safetyState.claimedCodes,
		linkedCodes: safetyState.linkedCodes
	});
}

export async function PUT({ cookies, fetch, request }) {
	const { user, supabase } = await getActivityClient(cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}

	const fullName = safeText(body?.full_name ?? body?.fullName, MAX_FULL_NAME_LENGTH);
	const bio = safeText(body?.bio, MAX_BIO_LENGTH);
	const avatarUrl = safeUrl(body?.avatar_url ?? body?.avatarUrl);
	const location = safeText(body?.location ?? body?.homeLocation, MAX_LOCATION_LENGTH);
	const interests = normalizeStringArray(body?.interests);
	const recommendationFocus = normalizeFocus(
		body?.recommendation_focus ?? body?.recommendationFocus
	);
	const hasPhoneInput = Object.prototype.hasOwnProperty.call(body || {}, 'phone');
	const rawPhoneInput = hasPhoneInput ? safeText(body.phone, 64) : '';
	const phone = hasPhoneInput && rawPhoneInput ? normalizeE164PhoneNumber(rawPhoneInput) : null;
	if (hasPhoneInput && rawPhoneInput && !phone) {
		return json({ error: 'Enter a valid phone number.' }, { status: 400 });
	}

	const validatedSafety = validateSafetyPayload(body);
	if (!validatedSafety.ok) {
		return json({ error: validatedSafety.error }, { status: 400 });
	}

	let existingResult;
	let safetyState;
	try {
		[existingResult, safetyState] = await Promise.all([
			supabase
				.from('profiles')
				.select('id,email,phone,emergency_contact_name,emergency_contact_phone,metadata')
				.eq('user_id', user.id)
				.maybeSingle(),
			loadRiderSafetyState(supabase, user.id)
		]);
	} catch (err) {
		return json({ error: err?.message || 'Unable to read existing profile.' }, { status: 500 });
	}

	if (existingResult.error) {
		return json(
			{ error: existingResult.error.message || 'Unable to read existing profile.' },
			{ status: 500 }
		);
	}

	const existingMetadata = normalizeMetadataObject(existingResult.data?.metadata);
	const geocoded = location
		? await searchGeocode(location, { limit: 1, fetchImpl: fetch }).catch(() => [])
		: [];
	const match = geocoded[0] ?? null;
	const recommendationContext = {
		location,
		home_location: location
			? {
					label: match?.label || location,
					latitude: Number.isFinite(match?.latitude) ? match.latitude : null,
					longitude: Number.isFinite(match?.longitude) ? match.longitude : null
				}
			: null,
		interests,
		recommendation_focus: recommendationFocus,
		updated_at: new Date().toISOString()
	};

	const metadata = {
		...existingMetadata,
		recommendation_context: recommendationContext
	};

	const isUnifiedSafetySubmit =
		validatedSafety.value.hasMedicalFields || validatedSafety.value.hasContactsList;
	const effectivePhone = hasPhoneInput
		? phone || ''
		: (existingResult.data?.phone ?? safetyState.roadIdProfile?.phone ?? '');

	let savedSafety;
	try {
		savedSafety = await saveUnifiedRiderSafety(supabase, user.id, {
			fullName,
			phone: effectivePhone,
			safety: validatedSafety.value,
			existingRoadId: safetyState.roadIdProfile,
			existingContacts: safetyState.emergencyContacts,
			allowBlankIdentity: isUnifiedSafetySubmit
		});
	} catch (err) {
		return json({ error: err?.message || 'Unable to save safety details.' }, { status: 500 });
	}

	const primaryContact = savedSafety.emergencyContacts[0] ?? null;
	/** @type {Record<string, any>} */
	const mutableProfilePayload = {
		full_name: fullName || null,
		avatar_url: avatarUrl || null,
		bio: bio || null,
		metadata
	};
	if (hasPhoneInput) {
		mutableProfilePayload.phone = phone || null;
	}
	if (validatedSafety.value.hasContactsList) {
		mutableProfilePayload.emergency_contact_name = primaryContact?.contact_name || null;
		mutableProfilePayload.emergency_contact_phone = primaryContact?.contact_phone || null;
	}

	const { data, error } = await upsertOwnProfileRow(
		supabase,
		user.id,
		mutableProfilePayload,
		PROFILE_SELECT_COLUMNS
	);

	if (error) {
		return json({ error: error.message || 'Unable to save profile.' }, { status: 500 });
	}

	const reconciled = reconcileRiderSafetyData({
		profileRow: data,
		roadIdRow: savedSafety.roadIdProfile,
		emergencyContacts: savedSafety.emergencyContacts
	});
	const profile = normalizeProfileShape(data, reconciled);
	const smsAccessClient = getSmsServiceClient() ?? supabase;
	const canManageSms =
		profile?.admin === true ||
		(await hasSmsInboxAccess(smsAccessClient, user.id).catch((err) => {
			console.warn('Unable to resolve SMS inbox access for profile update', err);
			return false;
		}));

	return json({
		profile,
		context: extractRecommendationContext(profile?.metadata ?? {}),
		canManageSms,
		roadIdProfile: savedSafety.roadIdProfile,
		safetyProfile: {
			blood_type: reconciled.blood_type,
			allergies: reconciled.allergies,
			medication: reconciled.medication
		},
		emergencyContacts: reconciled.emergency_contacts,
		claimedCodes: safetyState.claimedCodes,
		linkedCodes: safetyState.linkedCodes
	});
}

export async function PATCH({ cookies, request }) {
	const { user, supabase } = await getActivityClient(cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}

	try {
		const synced = await syncVolunteerContactToProfile(supabase, user.id, {
			fullName: body?.full_name ?? body?.fullName,
			phone: body?.phone,
			emergencyContactName: body?.emergency_contact_name ?? body?.emergencyContactName,
			emergencyContactPhone: body?.emergency_contact_phone ?? body?.emergencyContactPhone
		});
		const reconciled = reconcileRiderSafetyData({
			profileRow: synced.profile,
			roadIdRow: synced.roadIdProfile,
			emergencyContacts: synced.emergencyContacts
		});
		return json({
			profile: normalizeProfileShape(synced.profile, reconciled),
			roadIdProfile: synced.roadIdProfile,
			safetyProfile: {
				blood_type: reconciled.blood_type,
				allergies: reconciled.allergies,
				medication: reconciled.medication
			},
			emergencyContacts: reconciled.emergency_contacts
		});
	} catch (err) {
		return json({ error: err?.message || 'Unable to sync contact details.' }, { status: 500 });
	}
}
