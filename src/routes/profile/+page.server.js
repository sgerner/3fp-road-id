import { getActivityClient } from '$lib/server/activities';

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

function normalizeMetadataObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return value;
}

function safeText(value, maxLength) {
	if (value === null || value === undefined) return '';
	return String(value).trim().slice(0, maxLength);
}

function normalizeStringArray(values, limit = 12, itemMaxLength = 40) {
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
	const allowed = new Set(['groups', 'rides', 'volunteer']);
	return normalizeStringArray(values, 3, 20)
		.map((value) => value.toLowerCase())
		.filter((value) => allowed.has(value));
}

function extractContext(metadata) {
	const source = normalizeMetadataObject(metadata?.recommendation_context);
	return {
		location: safeText(source.location, 120),
		interests: normalizeStringArray(source.interests),
		recommendation_focus: normalizeFocus(source.recommendation_focus)
	};
}

export const load = async ({ cookies }) => {
	const { user, supabase } = getActivityClient(cookies);

	if (!user?.id) {
		return {
			currentUser: null,
			profile: null,
			context: { location: '', interests: [], recommendation_focus: [] },
			interestSuggestions: INTEREST_SUGGESTIONS,
			recommendationOptions: RECOMMENDATION_OPTIONS
		};
	}

	const { data } = await supabase
		.from('profiles')
		.select('id,user_id,full_name,avatar_url,bio,email,metadata,updated_at,created_at')
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
				metadata: normalizeMetadataObject(data.metadata),
				updated_at: data.updated_at ?? null,
				created_at: data.created_at ?? null
			}
		: null;

	return {
		currentUser: user,
		profile,
		context: extractContext(profile?.metadata ?? {}),
		interestSuggestions: INTEREST_SUGGESTIONS,
		recommendationOptions: RECOMMENDATION_OPTIONS
	};
};
