import { json } from '@sveltejs/kit';
import { getActivityClient } from '$lib/server/activities';

const MAX_FULL_NAME_LENGTH = 120;
const MAX_BIO_LENGTH = 600;
const MAX_LOCATION_LENGTH = 120;
const MAX_INTERESTS = 12;
const MAX_INTEREST_LENGTH = 40;
const ALLOWED_FOCUS = new Set(['groups', 'rides', 'volunteer']);

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

function extractRecommendationContext(metadata) {
	const contextRaw = normalizeMetadataObject(metadata?.recommendation_context);
	return {
		location: safeText(contextRaw.location, MAX_LOCATION_LENGTH),
		interests: normalizeStringArray(contextRaw.interests),
		recommendation_focus: normalizeFocus(contextRaw.recommendation_focus)
	};
}

function normalizeProfileShape(profileRow) {
	if (!profileRow) return null;
	return {
		id: profileRow.id,
		user_id: profileRow.user_id,
		full_name: profileRow.full_name ?? null,
		avatar_url: profileRow.avatar_url ?? null,
		bio: profileRow.bio ?? null,
		email: profileRow.email ?? null,
		phone: profileRow.phone ?? null,
		metadata: normalizeMetadataObject(profileRow.metadata),
		updated_at: profileRow.updated_at ?? null,
		created_at: profileRow.created_at ?? null
	};
}

export async function GET({ cookies }) {
	const { user, supabase } = getActivityClient(cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const { data, error } = await supabase
		.from('profiles')
		.select('id,user_id,full_name,avatar_url,bio,email,phone,metadata,updated_at,created_at')
		.eq('user_id', user.id)
		.maybeSingle();

	if (error) {
		return json({ error: error.message || 'Unable to load profile.' }, { status: 500 });
	}

	const profile = normalizeProfileShape(data);
	return json({
		profile,
		context: extractRecommendationContext(profile?.metadata ?? {})
	});
}

export async function PUT({ cookies, request }) {
	const { user, supabase } = getActivityClient(cookies);
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

	const existingResult = await supabase
		.from('profiles')
		.select('id,email,metadata')
		.eq('user_id', user.id)
		.maybeSingle();

	if (existingResult.error) {
		return json(
			{ error: existingResult.error.message || 'Unable to read existing profile.' },
			{ status: 500 }
		);
	}

	const existingMetadata = normalizeMetadataObject(existingResult.data?.metadata);
	const recommendationContext = {
		location,
		interests,
		recommendation_focus: recommendationFocus,
		updated_at: new Date().toISOString()
	};

	const metadata = {
		...existingMetadata,
		recommendation_context: recommendationContext
	};

	const payload = {
		user_id: user.id,
		email: existingResult.data?.email ?? user.email ?? null,
		full_name: fullName || null,
		avatar_url: avatarUrl || null,
		bio: bio || null,
		metadata
	};

	const { data, error } = await supabase
		.from('profiles')
		.upsert(payload, { onConflict: 'user_id' })
		.select('id,user_id,full_name,avatar_url,bio,email,phone,metadata,updated_at,created_at')
		.single();

	if (error) {
		return json({ error: error.message || 'Unable to save profile.' }, { status: 500 });
	}

	const profile = normalizeProfileShape(data);
	return json({
		profile,
		context: extractRecommendationContext(profile?.metadata ?? {})
	});
}
