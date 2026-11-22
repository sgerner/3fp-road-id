import { normalizeE164PhoneNumber, normalizePhoneNumber } from '../utils/phone.js';

export const BLOOD_TYPE_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const ALLOWED_BLOOD_TYPES = new Set(['', ...BLOOD_TYPE_OPTIONS]);
export const ROAD_ID_CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

const MAX_NAME_LENGTH = 200;
const MAX_PHONE_LENGTH = 64;
const MAX_BLOOD_TYPE_LENGTH = 64;
const MAX_MEDICAL_TEXT_LENGTH = 2_000;
const MAX_RELATIONSHIP_LENGTH = 120;
const MAX_EMERGENCY_CONTACTS = 10;

export function isValidRoadIdCode(code) {
	return typeof code === 'string' && ROAD_ID_CODE_PATTERN.test(code);
}

function cleanText(value, maxLength) {
	if (value === null || value === undefined) return '';
	return String(value).trim().slice(0, maxLength);
}

export function normalizeMedicationToken(value) {
	const trimmed = String(value ?? '').trim();
	if (!trimmed) return '';
	return trimmed.toLowerCase() === 'asprin' ? 'Aspirin' : trimmed;
}

export function formatMedicationList(value) {
	const raw = cleanText(value, MAX_MEDICAL_TEXT_LENGTH);
	if (!raw) return '';
	return raw
		.split(',')
		.map(normalizeMedicationToken)
		.filter(Boolean)
		.join(', ')
		.slice(0, MAX_MEDICAL_TEXT_LENGTH);
}

export function normalizeContactPhoneInput(value) {
	const raw = cleanText(value, MAX_PHONE_LENGTH);
	if (!raw) return '';
	return normalizeE164PhoneNumber(raw) || raw;
}

export function sortEmergencyContacts(contacts) {
	if (!Array.isArray(contacts)) return [];
	return contacts
		.map((entry, index) => ({ entry, index }))
		.filter(({ entry }) => entry && typeof entry === 'object')
		.sort((a, b) => {
			const aId = a.entry.id;
			const bId = b.entry.id;
			const aHasId = aId !== null && aId !== undefined && aId !== '';
			const bHasId = bId !== null && bId !== undefined && bId !== '';
			if (aHasId && !bHasId) return -1;
			if (!aHasId && bHasId) return 1;
			if (aHasId && bHasId) {
				const aNum = Number(aId);
				const bNum = Number(bId);
				if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
					return aNum - bNum;
				}
				const cmp = String(aId).localeCompare(String(bId));
				if (cmp !== 0) return cmp;
			}
			return a.index - b.index;
		})
		.map(({ entry }) => ({
			id: entry.id ?? null,
			contact_name: cleanText(entry.contact_name, MAX_NAME_LENGTH),
			contact_phone: cleanText(entry.contact_phone, MAX_PHONE_LENGTH),
			contact_relationship: cleanText(entry.contact_relationship, MAX_RELATIONSHIP_LENGTH)
		}))
		.filter((c) => c.contact_name || c.contact_phone || c.contact_relationship);
}

/**
 * Reconciles identity, medical notes, and emergency contacts between public.profiles,
 * public.road_id_profiles, and public.emergency_contacts without overwriting non-empty
 * medical records or contact records with blank values.
 */
export function reconcileRiderSafetyData({
	profileRow = null,
	roadIdRow = null,
	emergencyContacts = [],
	preferRoadIdIdentity = false
} = {}) {
	const profileName = cleanText(profileRow?.full_name, MAX_NAME_LENGTH);
	const roadName = cleanText(roadIdRow?.full_name, MAX_NAME_LENGTH);
	const fullName = preferRoadIdIdentity ? roadName || profileName : profileName || roadName;

	const profilePhone = cleanText(profileRow?.phone, MAX_PHONE_LENGTH);
	const roadPhone = cleanText(roadIdRow?.phone, MAX_PHONE_LENGTH);
	const phone = preferRoadIdIdentity ? roadPhone || profilePhone : profilePhone || roadPhone;

	const bloodType = cleanText(roadIdRow?.blood_type, MAX_BLOOD_TYPE_LENGTH);
	const allergies = cleanText(roadIdRow?.allergies, MAX_MEDICAL_TEXT_LENGTH);
	const medication = formatMedicationList(roadIdRow?.medication);

	let contacts = sortEmergencyContacts(emergencyContacts);
	if (contacts.length === 0) {
		const fallbackName = cleanText(profileRow?.emergency_contact_name, MAX_NAME_LENGTH);
		const fallbackPhone = cleanText(profileRow?.emergency_contact_phone, MAX_PHONE_LENGTH);
		if (fallbackName || fallbackPhone) {
			contacts = [
				{
					id: null,
					contact_name: fallbackName,
					contact_phone: fallbackPhone,
					contact_relationship: ''
				}
			];
		}
	}

	const primaryContact = contacts[0] ?? null;
	return {
		full_name: fullName,
		phone,
		blood_type: bloodType,
		allergies,
		medication,
		emergency_contacts: contacts,
		primary_emergency_contact: primaryContact
	};
}

export function validateSafetyPayload(body) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return {
			ok: true,
			value: {
				hasMedicalFields: false,
				blood_type: '',
				allergies: '',
				medication: '',
				hasContactsList: false,
				emergency_contacts: []
			}
		};
	}

	const hasNestedSafety =
		Boolean(body.safety) && typeof body.safety === 'object' && !Array.isArray(body.safety);
	const safetySource = hasNestedSafety ? body.safety : body;

	const hasEmergencyName =
		hasNestedSafety && Object.prototype.hasOwnProperty.call(safetySource, 'full_name');
	const hasEmergencyPhone =
		hasNestedSafety && Object.prototype.hasOwnProperty.call(safetySource, 'phone');

	let emergencyFullName = '';
	if (hasEmergencyName) {
		const rawEmergencyName =
			safetySource.full_name === null || safetySource.full_name === undefined
				? ''
				: String(safetySource.full_name).trim();
		if (rawEmergencyName.length > MAX_NAME_LENGTH) {
			return { ok: false, error: 'Emergency name is too long.' };
		}
		emergencyFullName = rawEmergencyName;
	}

	let emergencyPhone = '';
	if (hasEmergencyPhone) {
		const rawEmergencyPhone =
			safetySource.phone === null || safetySource.phone === undefined
				? ''
				: String(safetySource.phone).trim();
		if (rawEmergencyPhone.length > MAX_PHONE_LENGTH) {
			return { ok: false, error: 'Emergency card phone number is too long.' };
		}
		if (rawEmergencyPhone && normalizePhoneNumber(rawEmergencyPhone).length < 7) {
			return { ok: false, error: 'Enter a valid phone number for your Emergency ID card.' };
		}
		emergencyPhone = rawEmergencyPhone ? normalizeContactPhoneInput(rawEmergencyPhone) : '';
	}

	const hasBloodType = Object.prototype.hasOwnProperty.call(safetySource, 'blood_type');
	const hasAllergies = Object.prototype.hasOwnProperty.call(safetySource, 'allergies');
	const hasMedication = Object.prototype.hasOwnProperty.call(safetySource, 'medication');
	const hasMedicalFields = hasBloodType || hasAllergies || hasMedication;

	let bloodType = '';
	if (hasBloodType) {
		const rawBlood =
			safetySource.blood_type === null || safetySource.blood_type === undefined
				? ''
				: String(safetySource.blood_type).trim();
		if (!ALLOWED_BLOOD_TYPES.has(rawBlood)) {
			return { ok: false, error: 'Select a valid blood type.' };
		}
		bloodType = rawBlood;
	}

	const allergies = hasAllergies ? cleanText(safetySource.allergies, MAX_MEDICAL_TEXT_LENGTH) : '';
	const medication = hasMedication ? formatMedicationList(safetySource.medication) : '';

	const contactsRaw = Array.isArray(safetySource.emergency_contacts)
		? safetySource.emergency_contacts
		: Array.isArray(body.emergency_contacts)
			? body.emergency_contacts
			: null;
	const hasContactsList = Array.isArray(contactsRaw);
	const validatedContacts = [];

	if (hasContactsList) {
		if (contactsRaw.length > MAX_EMERGENCY_CONTACTS) {
			return {
				ok: false,
				error: `You can save up to ${MAX_EMERGENCY_CONTACTS} emergency contacts.`
			};
		}

		for (const rawEntry of contactsRaw) {
			if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
				return { ok: false, error: 'Invalid emergency contact entry.' };
			}
			const rawName =
				rawEntry.contact_name === null || rawEntry.contact_name === undefined
					? ''
					: String(rawEntry.contact_name).trim();
			const rawPhone =
				rawEntry.contact_phone === null || rawEntry.contact_phone === undefined
					? ''
					: String(rawEntry.contact_phone).trim();
			const rawRelationship =
				rawEntry.contact_relationship === null || rawEntry.contact_relationship === undefined
					? ''
					: String(rawEntry.contact_relationship).trim();

			if (!rawName && !rawPhone && !rawRelationship) {
				continue;
			}

			if (!rawName) {
				return { ok: false, error: 'Enter a name for each emergency contact.' };
			}
			if (rawName.length > MAX_NAME_LENGTH) {
				return { ok: false, error: 'Emergency contact name is too long.' };
			}
			if (!rawPhone || normalizePhoneNumber(rawPhone).length < 7) {
				return { ok: false, error: 'Enter a valid phone number for each emergency contact.' };
			}
			if (rawPhone.length > MAX_PHONE_LENGTH) {
				return { ok: false, error: 'Emergency contact phone number is too long.' };
			}
			if (rawRelationship.length > MAX_RELATIONSHIP_LENGTH) {
				return { ok: false, error: 'Emergency contact relationship is too long.' };
			}

			const contactId =
				rawEntry.id !== null && rawEntry.id !== undefined && String(rawEntry.id).trim() !== ''
					? rawEntry.id
					: null;

			validatedContacts.push({
				id: contactId,
				contact_name: rawName,
				contact_phone: normalizeContactPhoneInput(rawPhone),
				contact_relationship: rawRelationship
			});
		}
	}

	return {
		ok: true,
		value: {
			hasEmergencyName,
			emergency_full_name: emergencyFullName,
			hasEmergencyPhone,
			emergency_phone: emergencyPhone,
			hasMedicalFields,
			blood_type: bloodType,
			allergies,
			medication,
			hasContactsList,
			emergency_contacts: validatedContacts
		}
	};
}

export async function loadRiderSafetyState(supabase, userId) {
	if (!supabase || !userId) {
		return {
			roadIdProfile: null,
			emergencyContacts: [],
			claimedCodes: [],
			linkedCodes: []
		};
	}

	const [roadIdResult, contactsResult, codesResult] = await Promise.all([
		supabase
			.from('road_id_profiles')
			.select('user_id,full_name,phone,blood_type,allergies,medication,created_at')
			.eq('user_id', userId)
			.maybeSingle(),
		supabase
			.from('emergency_contacts')
			.select('id,profile_id,contact_name,contact_phone,contact_relationship')
			.eq('profile_id', userId)
			.order('id', { ascending: true }),
		supabase
			.from('qr_codes')
			.select('code,created_at')
			.eq('profile_id', userId)
			.order('code', { ascending: true })
	]);

	if (roadIdResult.error) throw roadIdResult.error;
	if (contactsResult.error) throw contactsResult.error;
	if (codesResult.error) throw codesResult.error;

	const linkedCodes = Array.isArray(codesResult.data)
		? codesResult.data
				.map((row) => ({
					code: cleanText(row?.code, 64),
					created_at: row?.created_at ?? null
				}))
				.filter((row) => Boolean(row.code))
				.sort((a, b) => {
					if (a.created_at && b.created_at && a.created_at !== b.created_at) {
						return String(a.created_at).localeCompare(String(b.created_at));
					}
					return a.code.localeCompare(b.code);
				})
		: [];
	const claimedCodes = linkedCodes.map((row) => row.code);

	return {
		roadIdProfile: roadIdResult.data ?? null,
		emergencyContacts: sortEmergencyContacts(contactsResult.data ?? []),
		claimedCodes,
		linkedCodes
	};
}

export async function upsertOwnProfileRow(
	supabase,
	userId,
	mutablePayload,
	selectColumns = 'id,user_id,full_name,avatar_url,bio,email,phone,emergency_contact_name,emergency_contact_phone,admin,metadata,updated_at,created_at'
) {
	const cleaned = { ...mutablePayload };
	delete cleaned.user_id;
	delete cleaned.id;
	delete cleaned.email;
	delete cleaned.admin;

	let result = await supabase
		.from('profiles')
		.update(cleaned)
		.eq('user_id', userId)
		.select(selectColumns)
		.maybeSingle();

	if (!result.error && !result.data) {
		result = await supabase
			.from('profiles')
			.insert({ user_id: userId, ...cleaned })
			.select(selectColumns)
			.single();
	}

	return result;
}

/**
 * Saves road_id_profiles and emergency_contacts using the authenticated user's
 * RLS-bound Supabase client. Always ensures road_id_profiles exists first so
 * emergency_contacts RLS policies pass even when zero bracelets are claimed.
 */
export async function saveUnifiedRiderSafety(
	supabase,
	userId,
	{
		fullName,
		phone,
		safety,
		existingRoadId = undefined,
		existingContacts = undefined,
		allowBlankIdentity = false
	} = {}
) {
	let currentRoadId = existingRoadId;
	let currentContacts = existingContacts;

	if (currentRoadId === undefined || (safety?.hasContactsList && currentContacts === undefined)) {
		const loaded = await loadRiderSafetyState(supabase, userId);
		if (currentRoadId === undefined) currentRoadId = loaded.roadIdProfile;
		if (currentContacts === undefined) currentContacts = loaded.emergencyContacts;
	}

	const cleanedName = cleanText(fullName, MAX_NAME_LENGTH);
	const cleanedPhone = cleanText(phone, MAX_PHONE_LENGTH);

	const nextFullName = safety?.hasEmergencyName
		? cleanText(safety.emergency_full_name, MAX_NAME_LENGTH) || cleanedName
		: allowBlankIdentity
			? cleanedName
			: cleanedName || cleanText(currentRoadId?.full_name, MAX_NAME_LENGTH);
	const nextPhone = safety?.hasEmergencyPhone
		? cleanText(safety.emergency_phone, MAX_PHONE_LENGTH) || cleanedPhone
		: allowBlankIdentity
			? cleanedPhone
			: cleanedPhone || cleanText(currentRoadId?.phone, MAX_PHONE_LENGTH);

	const nextBloodType = safety?.hasMedicalFields
		? cleanText(safety.blood_type, MAX_BLOOD_TYPE_LENGTH)
		: cleanText(currentRoadId?.blood_type, MAX_BLOOD_TYPE_LENGTH);
	const nextAllergies = safety?.hasMedicalFields
		? cleanText(safety.allergies, MAX_MEDICAL_TEXT_LENGTH)
		: cleanText(currentRoadId?.allergies, MAX_MEDICAL_TEXT_LENGTH);
	const nextMedication = safety?.hasMedicalFields
		? formatMedicationList(safety.medication)
		: formatMedicationList(currentRoadId?.medication);

	const shouldWriteRoadId =
		Boolean(currentRoadId) ||
		Boolean(safety?.hasMedicalFields) ||
		Boolean(safety?.hasContactsList) ||
		Boolean(nextFullName) ||
		Boolean(nextPhone);

	let savedRoadId = currentRoadId ?? null;
	if (shouldWriteRoadId) {
		const roadIdPayload = {
			user_id: userId,
			full_name: nextFullName,
			phone: nextPhone,
			blood_type: nextBloodType,
			allergies: nextAllergies,
			medication: nextMedication
		};
		const roadIdResult = await supabase
			.from('road_id_profiles')
			.upsert(roadIdPayload, { onConflict: 'user_id' })
			.select('user_id,full_name,phone,blood_type,allergies,medication')
			.single();
		if (roadIdResult.error) throw roadIdResult.error;
		savedRoadId = roadIdResult.data;
	}

	let savedContacts = sortEmergencyContacts(currentContacts ?? []);
	if (safety?.hasContactsList) {
		const ownedById = new Map(
			(currentContacts ?? [])
				.filter((row) => row?.id !== null && row?.id !== undefined)
				.map((row) => [String(row.id), row])
		);

		const retainedIds = new Set();
		for (const item of safety.emergency_contacts) {
			if (item.id !== null && item.id !== undefined && ownedById.has(String(item.id))) {
				retainedIds.add(String(item.id));
			}
		}

		const idsToDelete = [...ownedById.keys()].filter((idKey) => !retainedIds.has(idKey));
		for (const idKey of idsToDelete) {
			const target = ownedById.get(idKey);
			const deleteRes = await supabase
				.from('emergency_contacts')
				.delete()
				.eq('id', target.id)
				.eq('profile_id', userId);
			if (deleteRes.error) throw deleteRes.error;
		}

		const finalContacts = [];
		for (const item of safety.emergency_contacts) {
			const idKey = item.id !== null && item.id !== undefined ? String(item.id) : null;
			const contactFields = {
				contact_name: item.contact_name,
				contact_phone: item.contact_phone,
				contact_relationship: item.contact_relationship
			};
			if (idKey && ownedById.has(idKey)) {
				const target = ownedById.get(idKey);
				const updateRes = await supabase
					.from('emergency_contacts')
					.update(contactFields)
					.eq('id', target.id)
					.eq('profile_id', userId)
					.select('id,profile_id,contact_name,contact_phone,contact_relationship')
					.single();
				if (updateRes.error) throw updateRes.error;
				finalContacts.push(updateRes.data);
			} else {
				const insertRes = await supabase
					.from('emergency_contacts')
					.insert({
						profile_id: userId,
						...contactFields
					})
					.select('id,profile_id,contact_name,contact_phone,contact_relationship')
					.single();
				if (insertRes.error) throw insertRes.error;
				finalContacts.push(insertRes.data);
			}
		}
		savedContacts = sortEmergencyContacts(finalContacts);
	}

	return {
		roadIdProfile: savedRoadId,
		emergencyContacts: savedContacts
	};
}

/**
 * Syncs rider name, phone, and primary emergency contact from volunteer signup
 * back to public.profiles, public.road_id_profiles, and public.emergency_contacts
 * without overwriting medical fields or secondary emergency contacts.
 */
export async function syncVolunteerContactToProfile(
	supabase,
	userId,
	{ fullName, phone, emergencyContactName, emergencyContactPhone } = {}
) {
	const [profileRes, safetyState] = await Promise.all([
		supabase
			.from('profiles')
			.select(
				'id,user_id,full_name,avatar_url,bio,email,phone,emergency_contact_name,emergency_contact_phone,admin,metadata,updated_at,created_at'
			)
			.eq('user_id', userId)
			.maybeSingle(),
		loadRiderSafetyState(supabase, userId)
	]);
	if (profileRes.error) throw profileRes.error;

	const currentProfile = profileRes.data ?? null;
	const currentRoadId = safetyState.roadIdProfile;
	const currentContacts = safetyState.emergencyContacts;

	const nextFullName =
		fullName !== undefined
			? cleanText(fullName, MAX_NAME_LENGTH) ||
				cleanText(currentProfile?.full_name, MAX_NAME_LENGTH)
			: cleanText(currentProfile?.full_name, MAX_NAME_LENGTH);

	const rawPhone = phone !== undefined ? cleanText(phone, MAX_PHONE_LENGTH) : null;
	const normalizedPhone =
		rawPhone !== null
			? rawPhone
				? normalizeContactPhoneInput(rawPhone)
				: cleanText(currentProfile?.phone, MAX_PHONE_LENGTH)
			: cleanText(currentProfile?.phone, MAX_PHONE_LENGTH);

	const nextEmergencyName =
		emergencyContactName !== undefined
			? cleanText(emergencyContactName, MAX_NAME_LENGTH)
			: cleanText(currentProfile?.emergency_contact_name, MAX_NAME_LENGTH);

	const rawEmergencyPhone =
		emergencyContactPhone !== undefined ? cleanText(emergencyContactPhone, MAX_PHONE_LENGTH) : null;
	const nextEmergencyPhone =
		rawEmergencyPhone !== null
			? rawEmergencyPhone
				? normalizeContactPhoneInput(rawEmergencyPhone)
				: ''
			: cleanText(currentProfile?.emergency_contact_phone, MAX_PHONE_LENGTH);

	const profileUpdates = {};
	if (nextFullName !== (currentProfile?.full_name ?? '')) {
		profileUpdates.full_name = nextFullName || null;
	}
	if (normalizedPhone !== (currentProfile?.phone ?? '')) {
		profileUpdates.phone = normalizedPhone || null;
	}
	if (emergencyContactName !== undefined) {
		profileUpdates.emergency_contact_name = nextEmergencyName || null;
	}
	if (emergencyContactPhone !== undefined) {
		profileUpdates.emergency_contact_phone = nextEmergencyPhone || null;
	}

	let updatedProfile = currentProfile;
	if (!currentProfile || Object.keys(profileUpdates).length > 0) {
		const upserted = await upsertOwnProfileRow(supabase, userId, {
			full_name: nextFullName || null,
			phone: normalizedPhone || null,
			emergency_contact_name:
				emergencyContactName !== undefined
					? nextEmergencyName || null
					: (currentProfile?.emergency_contact_name ?? null),
			emergency_contact_phone:
				emergencyContactPhone !== undefined
					? nextEmergencyPhone || null
					: (currentProfile?.emergency_contact_phone ?? null)
		});
		if (upserted.error) throw upserted.error;
		updatedProfile = upserted.data;
	}

	const hasEmergencyData = Boolean(nextEmergencyName && nextEmergencyPhone);
	const shouldEnsureRoadId =
		Boolean(currentRoadId) || hasEmergencyData || Boolean(nextFullName) || Boolean(normalizedPhone);

	let updatedRoadId = currentRoadId;
	if (shouldEnsureRoadId) {
		const roadIdRes = await supabase
			.from('road_id_profiles')
			.upsert(
				{
					user_id: userId,
					full_name: nextFullName || cleanText(currentRoadId?.full_name, MAX_NAME_LENGTH),
					phone: normalizedPhone || cleanText(currentRoadId?.phone, MAX_PHONE_LENGTH),
					blood_type: cleanText(currentRoadId?.blood_type, MAX_BLOOD_TYPE_LENGTH),
					allergies: cleanText(currentRoadId?.allergies, MAX_MEDICAL_TEXT_LENGTH),
					medication: formatMedicationList(currentRoadId?.medication)
				},
				{ onConflict: 'user_id' }
			)
			.select('user_id,full_name,phone,blood_type,allergies,medication')
			.single();
		if (roadIdRes.error) throw roadIdRes.error;
		updatedRoadId = roadIdRes.data;
	}

	let updatedContacts = currentContacts;
	if (hasEmergencyData) {
		if (currentContacts.length > 0 && currentContacts[0]?.id !== null) {
			const primary = currentContacts[0];
			if (
				primary.contact_name !== nextEmergencyName ||
				primary.contact_phone !== nextEmergencyPhone
			) {
				const contactUpdate = await supabase
					.from('emergency_contacts')
					.update({
						contact_name: nextEmergencyName,
						contact_phone: nextEmergencyPhone,
						contact_relationship: primary.contact_relationship || 'Emergency contact'
					})
					.eq('id', primary.id)
					.eq('profile_id', userId)
					.select('id,profile_id,contact_name,contact_phone,contact_relationship')
					.single();
				if (contactUpdate.error) throw contactUpdate.error;
				updatedContacts = [contactUpdate.data, ...currentContacts.slice(1)];
			}
		} else if (currentContacts.length === 0) {
			const contactInsert = await supabase
				.from('emergency_contacts')
				.insert({
					profile_id: userId,
					contact_name: nextEmergencyName,
					contact_phone: nextEmergencyPhone,
					contact_relationship: 'Emergency contact'
				})
				.select('id,profile_id,contact_name,contact_phone,contact_relationship')
				.single();
			if (contactInsert.error) throw contactInsert.error;
			updatedContacts = [contactInsert.data];
		}
	}

	return {
		profile: updatedProfile,
		roadIdProfile: updatedRoadId,
		emergencyContacts: updatedContacts
	};
}

/**
 * Reconciles existing rider details under RLS and atomically claims an unclaimed
 * QR code on public.qr_codes without overwriting non-empty medical records.
 */
export async function claimBraceletForUser({ serviceSupabase, userSupabase, userId, code }) {
	if (!isValidRoadIdCode(code)) {
		return { ok: false, status: 400, reason: 'invalid_code', error: 'Invalid bracelet code.' };
	}
	if (!serviceSupabase || !userSupabase || !userId) {
		return {
			ok: false,
			status: 503,
			reason: 'unavailable',
			error: 'Bracelet claim service is unavailable.'
		};
	}

	const qrLookup = await serviceSupabase
		.from('qr_codes')
		.select('code,profile_id')
		.eq('code', code)
		.maybeSingle();

	if (qrLookup.error) {
		return { ok: false, status: 500, reason: 'lookup_error', error: 'Unable to verify bracelet.' };
	}
	if (!qrLookup.data) {
		return { ok: false, status: 404, reason: 'not_found', error: 'Bracelet code not found.' };
	}
	if (qrLookup.data.profile_id && qrLookup.data.profile_id !== userId) {
		return {
			ok: false,
			status: 409,
			reason: 'already_claimed',
			error: 'This bracelet has already been claimed.'
		};
	}

	const [profileRes, safetyState] = await Promise.all([
		userSupabase
			.from('profiles')
			.select('id,user_id,full_name,phone,emergency_contact_name,emergency_contact_phone')
			.eq('user_id', userId)
			.maybeSingle(),
		loadRiderSafetyState(userSupabase, userId)
	]);
	if (profileRes.error) {
		return { ok: false, status: 500, reason: 'profile_error', error: 'Unable to load profile.' };
	}

	const profileRow = profileRes.data ?? null;
	const roadIdRow = safetyState.roadIdProfile;
	const contacts = safetyState.emergencyContacts;
	const reconciled = reconcileRiderSafetyData({
		profileRow,
		roadIdRow,
		emergencyContacts: contacts
	});

	// Ensure road_id_profiles exists with reconciled identity and preserved medical fields
	const roadIdUpsert = await userSupabase
		.from('road_id_profiles')
		.upsert(
			{
				user_id: userId,
				full_name: reconciled.full_name,
				phone: reconciled.phone,
				blood_type: reconciled.blood_type,
				allergies: reconciled.allergies,
				medication: reconciled.medication
			},
			{ onConflict: 'user_id' }
		)
		.select('user_id')
		.single();

	if (roadIdUpsert.error) {
		return {
			ok: false,
			status: 500,
			reason: 'road_id_upsert_error',
			error: 'Unable to prepare safety profile.'
		};
	}

	// Seed emergency_contacts from profiles if none exist in emergency_contacts yet
	if (
		contacts.length === 0 &&
		reconciled.primary_emergency_contact?.contact_name &&
		reconciled.primary_emergency_contact?.contact_phone
	) {
		const seedContact = await userSupabase.from('emergency_contacts').insert({
			profile_id: userId,
			contact_name: reconciled.primary_emergency_contact.contact_name,
			contact_phone: reconciled.primary_emergency_contact.contact_phone,
			contact_relationship:
				reconciled.primary_emergency_contact.contact_relationship || 'Emergency contact'
		});
		if (seedContact.error) {
			return {
				ok: false,
				status: 500,
				reason: 'contact_seed_error',
				error: 'Unable to sync emergency contact.'
			};
		}
	}

	// Backfill blank profiles fields from existing road_id_profiles / emergency_contacts
	const profileBackfill = {};
	if (!cleanText(profileRow?.full_name, MAX_NAME_LENGTH) && reconciled.full_name) {
		profileBackfill.full_name = reconciled.full_name;
	}
	if (!cleanText(profileRow?.phone, MAX_PHONE_LENGTH) && reconciled.phone) {
		profileBackfill.phone = reconciled.phone;
	}
	if (
		!cleanText(profileRow?.emergency_contact_name, MAX_NAME_LENGTH) &&
		reconciled.primary_emergency_contact?.contact_name
	) {
		profileBackfill.emergency_contact_name = reconciled.primary_emergency_contact.contact_name;
	}
	if (
		!cleanText(profileRow?.emergency_contact_phone, MAX_PHONE_LENGTH) &&
		reconciled.primary_emergency_contact?.contact_phone
	) {
		profileBackfill.emergency_contact_phone = reconciled.primary_emergency_contact.contact_phone;
	}
	if (Object.keys(profileBackfill).length > 0) {
		await upsertOwnProfileRow(userSupabase, userId, profileBackfill, 'id,user_id');
	}

	if (qrLookup.data.profile_id === userId) {
		return { ok: true, code, alreadyOwned: true };
	}

	if (typeof serviceSupabase.rpc === 'function') {
		const rpcRes = await serviceSupabase.rpc('claim_road_id_code', {
			target_code: code,
			claimant_user_id: userId,
			seed_full_name: reconciled.full_name || null,
			seed_phone: reconciled.phone || null
		});
		if (!rpcRes.error) {
			const row = Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data;
			const outcome = row?.status || '';
			if (outcome === 'claimed') {
				return { ok: true, code: row?.code || code, alreadyOwned: false };
			}
			if (outcome === 'already_owned') {
				return { ok: true, code: row?.code || code, alreadyOwned: true };
			}
			if (outcome === 'conflict') {
				return {
					ok: false,
					status: 409,
					reason: 'already_claimed',
					error: 'This bracelet has already been claimed.'
				};
			}
			if (outcome === 'not_found') {
				return { ok: false, status: 404, reason: 'not_found', error: 'Bracelet code not found.' };
			}
		}
	}

	const claimRes = await serviceSupabase
		.from('qr_codes')
		.update({ profile_id: userId })
		.eq('code', code)
		.is('profile_id', null)
		.select('code,profile_id')
		.maybeSingle();

	if (claimRes.error) {
		return { ok: false, status: 500, reason: 'claim_error', error: 'Unable to claim bracelet.' };
	}

	if (!claimRes.data) {
		const recheck = await serviceSupabase
			.from('qr_codes')
			.select('code,profile_id')
			.eq('code', code)
			.maybeSingle();
		if (recheck.data?.profile_id === userId) {
			return { ok: true, code, alreadyOwned: true };
		}
		return {
			ok: false,
			status: 409,
			reason: 'already_claimed',
			error: 'This bracelet has already been claimed.'
		};
	}

	return { ok: true, code, alreadyOwned: false };
}

/**
 * Reconciles profiles, road_id_profiles, and emergency_contacts under RLS after
 * an atomic RPC bracelet claim so existing profile/medical fields stay synced.
 */
export async function reconcileAfterBraceletClaim(userSupabase, userId) {
	if (!userSupabase || !userId) return;
	const [profileRes, safetyState] = await Promise.all([
		userSupabase
			.from('profiles')
			.select('id,user_id,full_name,phone,emergency_contact_name,emergency_contact_phone')
			.eq('user_id', userId)
			.maybeSingle(),
		loadRiderSafetyState(userSupabase, userId)
	]);
	if (profileRes.error) return;

	const profileRow = profileRes.data ?? null;
	const roadIdRow = safetyState.roadIdProfile;
	const contacts = safetyState.emergencyContacts;
	const reconciled = reconcileRiderSafetyData({
		profileRow,
		roadIdRow,
		emergencyContacts: contacts
	});

	if (
		(!cleanText(roadIdRow?.full_name, MAX_NAME_LENGTH) && reconciled.full_name) ||
		(!cleanText(roadIdRow?.phone, MAX_PHONE_LENGTH) && reconciled.phone)
	) {
		await userSupabase.from('road_id_profiles').upsert(
			{
				user_id: userId,
				full_name: cleanText(roadIdRow?.full_name, MAX_NAME_LENGTH) || reconciled.full_name,
				phone: cleanText(roadIdRow?.phone, MAX_PHONE_LENGTH) || reconciled.phone,
				blood_type: reconciled.blood_type,
				allergies: reconciled.allergies,
				medication: reconciled.medication
			},
			{ onConflict: 'user_id' }
		);
	}

	if (
		contacts.length === 0 &&
		reconciled.primary_emergency_contact?.contact_name &&
		reconciled.primary_emergency_contact?.contact_phone
	) {
		await userSupabase.from('emergency_contacts').insert({
			profile_id: userId,
			contact_name: reconciled.primary_emergency_contact.contact_name,
			contact_phone: reconciled.primary_emergency_contact.contact_phone,
			contact_relationship:
				reconciled.primary_emergency_contact.contact_relationship || 'Emergency contact'
		});
	}

	const profileBackfill = {};
	if (!cleanText(profileRow?.full_name, MAX_NAME_LENGTH) && reconciled.full_name) {
		profileBackfill.full_name = reconciled.full_name;
	}
	if (!cleanText(profileRow?.phone, MAX_PHONE_LENGTH) && reconciled.phone) {
		profileBackfill.phone = reconciled.phone;
	}
	if (
		!cleanText(profileRow?.emergency_contact_name, MAX_NAME_LENGTH) &&
		reconciled.primary_emergency_contact?.contact_name
	) {
		profileBackfill.emergency_contact_name = reconciled.primary_emergency_contact.contact_name;
	}
	if (
		!cleanText(profileRow?.emergency_contact_phone, MAX_PHONE_LENGTH) &&
		reconciled.primary_emergency_contact?.contact_phone
	) {
		profileBackfill.emergency_contact_phone = reconciled.primary_emergency_contact.contact_phone;
	}
	if (Object.keys(profileBackfill).length > 0) {
		await upsertOwnProfileRow(userSupabase, userId, profileBackfill, 'id,user_id');
	}
}
