import { getActivityClient } from '#lib/server/activities';
import { getConfiguredPublicOrigin } from '#lib/server/publicOrigin';
import {
	BLOOD_TYPE_OPTIONS,
	isValidRoadIdCode,
	loadRiderSafetyState,
	reconcileRiderSafetyData
} from '#lib/server/roadIdProfile';
import { SMS_CONSENT_TEXT, SMS_CONSENT_VERSION } from '#lib/server/sms';

/** @type {any} */
const INTEREST_SUGGESTIONS = [
	'Road riding',
	'Mountain biking',
	'Gravel rides',
	'Bike commuting',
	'Family rides',
	'Advocacy',
	'Volunteer events',
	'Bike safety',
	'Community meetups',
	'Beginner-friendly rides'
];

/** @type {any} */
const RECOMMENDATION_OPTIONS = [
	{
		value: 'groups',
		label: 'Groups',
		description: 'Local clubs and communities that match your interests.'
	},
	{
		value: 'rides',
		label: 'Rides',
		description: 'Upcoming rides based on your location and style.'
	},
	{
		value: 'volunteer',
		label: 'Volunteer',
		description: 'Nearby opportunities to support safer streets and events.'
	}
];

/**
 * @param {any} value
 */
function normalizeMetadataObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return value;
}

/**
 * @param {any} value
 * @param {any} maxLength
 */
function safeText(value, maxLength) {
	if (value === null || value === undefined) return '';
	return String(value).trim().slice(0, maxLength);
}

/**
 * @param {any} values
 * @param {any} [limit]
 * @param {any} [itemMaxLength]
 */
function normalizeStringArray(values, limit = 12, itemMaxLength = 40) {
	if (!Array.isArray(values)) return [];
	/** @type {any} */
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

/**
 * @param {any} values
 */
function normalizeFocus(values) {
	const allowed = new Set(['groups', 'rides', 'volunteer']);
	return normalizeStringArray(values, 3, 20)
		.map((value) => value.toLowerCase())
		.filter((value) => allowed.has(value));
}

/**
 * @param {any} metadata
 */
function extractContext(metadata) {
	const source = normalizeMetadataObject(metadata?.recommendation_context);
	return {
		location: safeText(source.location, 120),
		home_location: normalizeMetadataObject(source.home_location),
		interests: normalizeStringArray(source.interests),
		recommendation_focus: normalizeFocus(source.recommendation_focus)
	};
}

export const load = async ({ cookies, url }) => {
	const { user, supabase } = await getActivityClient(cookies);
	const publicOrigin = getConfiguredPublicOrigin();
	const rawClaimed = url.searchParams.get('claimed') || '';
	const claimedCode = isValidRoadIdCode(rawClaimed) ? rawClaimed : null;

	if (!user?.id) {
		return {
			currentUser: null,
			profile: null,
			roadIdProfile: null,
			safetyProfile: { blood_type: '', allergies: '', medication: '' },
			emergencyContacts: [],
			claimedCodes: [],
			linkedCodes: [],
			claimedCode: null,
			bloodTypeOptions: BLOOD_TYPE_OPTIONS,
			publicOrigin,
			context: { location: '', home_location: {}, interests: [], recommendation_focus: [] },
			hasSmsSubscription: false,
			smsPreferences: null,
			smsConsentText: SMS_CONSENT_TEXT,
			smsConsentVersion: SMS_CONSENT_VERSION,
			interestSuggestions: INTEREST_SUGGESTIONS,
			recommendationOptions: RECOMMENDATION_OPTIONS
		};
	}

	const [profileRes, smsRes, safetyState] = await Promise.all([
		supabase
			.from('profiles')
			.select(
				'id,user_id,full_name,avatar_url,bio,email,phone,emergency_contact_name,emergency_contact_phone,metadata,updated_at,created_at'
			)
			.eq('user_id', user.id)
			.maybeSingle(),
		supabase
			.from('sms_subscriptions')
			.select(
				'phone_e164,status,ride_reminders,volunteer_reminders,admin_messages,bike_valet_messages,consent_version,opted_in_at,opted_out_at,phone_verified_at,verification_expires_at'
			)
			.eq('user_id', user.id)
			.maybeSingle(),
		loadRiderSafetyState(supabase, user.id).catch((err) => {
			console.warn('Unable to load rider safety state for profile page', err);
			return {
				roadIdProfile: null,
				emergencyContacts: [],
				claimedCodes: /** @type {string[]} */ ([]),
				linkedCodes: /** @type {{ code: string, created_at: any }[]} */ ([])
			};
		})
	]);

	const data = /** @type {any} */ (profileRes.data ?? null);
	const smsSubscription = /** @type {any} */ (smsRes.data ?? null);
	const reconciled = reconcileRiderSafetyData({
		profileRow: data,
		roadIdRow: safetyState.roadIdProfile,
		emergencyContacts: safetyState.emergencyContacts
	});

	const profile =
		data || safetyState.roadIdProfile
			? {
					id: data?.id ?? null,
					user_id: data?.user_id ?? user.id,
					full_name: reconciled.full_name || null,
					avatar_url: data?.avatar_url ?? null,
					bio: data?.bio ?? null,
					email: data?.email ?? user.email ?? null,
					phone: reconciled.phone || null,
					emergency_contact_name: reconciled.primary_emergency_contact?.contact_name || null,
					emergency_contact_phone: reconciled.primary_emergency_contact?.contact_phone || null,
					metadata: normalizeMetadataObject(data?.metadata),
					updated_at: data?.updated_at ?? null,
					created_at: data?.created_at ?? null
				}
			: null;

	const roadIdProfile = safetyState.roadIdProfile
		? {
				...safetyState.roadIdProfile,
				user_id: safetyState.roadIdProfile.user_id ?? user.id,
				full_name: safetyState.roadIdProfile.full_name ?? '',
				phone: safetyState.roadIdProfile.phone ?? '',
				blood_type: reconciled.blood_type,
				allergies: reconciled.allergies,
				medication: reconciled.medication
			}
		: null;

	return {
		currentUser: user,
		profile,
		roadIdProfile,
		safetyProfile: {
			blood_type: reconciled.blood_type,
			allergies: reconciled.allergies,
			medication: reconciled.medication
		},
		emergencyContacts: reconciled.emergency_contacts,
		claimedCodes: safetyState.claimedCodes,
		linkedCodes: safetyState.linkedCodes,
		claimedCode:
			claimedCode && safetyState.claimedCodes.includes(claimedCode) ? claimedCode : claimedCode,
		bloodTypeOptions: BLOOD_TYPE_OPTIONS,
		publicOrigin,
		context: extractContext(profile?.metadata ?? {}),
		hasSmsSubscription: Boolean(smsSubscription),
		smsPreferences: smsSubscription
			? {
					phone: /** @type {any} */ (smsSubscription).phone_e164 ?? '',
					status: /** @type {any} */ (smsSubscription).status ?? 'paused',
					ride_reminders: /** @type {any} */ (smsSubscription).ride_reminders === true,
					volunteer_reminders: /** @type {any} */ (smsSubscription).volunteer_reminders === true,
					admin_messages: /** @type {any} */ (smsSubscription).admin_messages === true,
					bike_valet_messages: /** @type {any} */ (smsSubscription).bike_valet_messages === true,
					consent_version: /** @type {any} */ (smsSubscription).consent_version ?? null,
					opted_in_at: /** @type {any} */ (smsSubscription).opted_in_at ?? null,
					opted_out_at: /** @type {any} */ (smsSubscription).opted_out_at ?? null,
					verificationRequired: false
				}
			: {
					phone: '',
					status: 'paused',
					ride_reminders: false,
					volunteer_reminders: false,
					admin_messages: false,
					bike_valet_messages: false,
					consent_version: null,
					opted_in_at: null,
					opted_out_at: null,
					verificationRequired: false
				},
		smsConsentText: SMS_CONSENT_TEXT,
		smsConsentVersion: SMS_CONSENT_VERSION,
		interestSuggestions: INTEREST_SUGGESTIONS,
		recommendationOptions: RECOMMENDATION_OPTIONS
	};
};
