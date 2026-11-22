import { getActivityClient } from '#lib/server/activities';
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

export const load = async ({ cookies }) => {
	const { user, supabase } = await getActivityClient(cookies);

	if (!user?.id) {
		return {
			currentUser: null,
			profile: null,
			context: { location: '', home_location: {}, interests: [], recommendation_focus: [] },
			smsPreferences: null,
			smsConsentText: SMS_CONSENT_TEXT,
			smsConsentVersion: SMS_CONSENT_VERSION,
			interestSuggestions: INTEREST_SUGGESTIONS,
			recommendationOptions: RECOMMENDATION_OPTIONS
		};
	}

	const { data } = await supabase
		.from('profiles')
		.select('id,user_id,full_name,avatar_url,bio,email,phone,metadata,updated_at,created_at')
		.eq('user_id', user.id)
		.maybeSingle();

	const { data: smsSubscription } = await supabase
		.from('sms_subscriptions')
		.select(
			'phone_e164,status,ride_reminders,volunteer_reminders,admin_messages,bike_valet_messages,consent_version,opted_in_at,opted_out_at' +
				',phone_verified_at,verification_expires_at'
		)
		.eq('user_id', user.id)
		.maybeSingle();

	const profile = data
		? {
				id: data.id,
				user_id: data.user_id,
				full_name: data.full_name ?? null,
				avatar_url: data.avatar_url ?? null,
				bio: data.bio ?? null,
				email: data.email ?? null,
				phone: data.phone ?? null,
				metadata: normalizeMetadataObject(data.metadata),
				updated_at: data.updated_at ?? null,
				created_at: data.created_at ?? null
			}
		: null;

	return {
		currentUser: user,
		profile,
		context: extractContext(profile?.metadata ?? {}),
		smsPreferences: smsSubscription
			? {
					phone: data?.phone ?? '',
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
					phone: data?.phone ?? '',
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
