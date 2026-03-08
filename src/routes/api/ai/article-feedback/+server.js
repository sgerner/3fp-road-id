import { json } from '@sveltejs/kit';
import { getActivityClient } from '$lib/server/activities';

const ALLOWED_FEEDBACK_TYPES = new Set(['impression', 'click', 'dwell', 'save', 'hide']);
const DEFAULT_WEIGHTS = {
	lexical_weight: 0.28,
	semantic_weight: 0.32,
	freshness_weight: 0.15,
	personalization_weight: 0.17,
	location_weight: 0.08,
	diversity_weight: 0.06
};

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
	const num = Number(value);
	if (!Number.isFinite(num)) return fallback;
	return num;
}

function normalizeWeights(raw = {}) {
	const merged = {
		lexical_weight: toNumber(raw.lexical_weight, DEFAULT_WEIGHTS.lexical_weight),
		semantic_weight: toNumber(raw.semantic_weight, DEFAULT_WEIGHTS.semantic_weight),
		freshness_weight: toNumber(raw.freshness_weight, DEFAULT_WEIGHTS.freshness_weight),
		personalization_weight: toNumber(
			raw.personalization_weight,
			DEFAULT_WEIGHTS.personalization_weight
		),
		location_weight: toNumber(raw.location_weight, DEFAULT_WEIGHTS.location_weight),
		diversity_weight: toNumber(raw.diversity_weight, DEFAULT_WEIGHTS.diversity_weight)
	};
	const clamped = Object.fromEntries(
		Object.entries(merged).map(([key, value]) => [key, clamp(value, 0.02, 1)])
	);
	const total = Object.values(clamped).reduce((sum, value) => sum + value, 0) || 1;
	return Object.fromEntries(
		Object.entries(clamped).map(([key, value]) => [key, Number((value / total).toFixed(3))])
	);
}

function adjustWeights(currentWeights, feedbackType, dwellSeconds = 0) {
	const next = { ...currentWeights };
	const dwellBoost = clamp(dwellSeconds / 180, 0, 0.08);

	switch (feedbackType) {
		case 'click':
			next.semantic_weight += 0.02;
			next.personalization_weight += 0.03;
			next.freshness_weight += 0.01;
			break;
		case 'save':
			next.personalization_weight += 0.05;
			next.lexical_weight += 0.02;
			next.semantic_weight += 0.02;
			break;
		case 'hide':
			next.semantic_weight -= 0.03;
			next.personalization_weight -= 0.04;
			next.diversity_weight += 0.05;
			break;
		case 'dwell':
			next.semantic_weight += dwellBoost;
			next.personalization_weight += dwellBoost / 2;
			break;
		default:
			break;
	}

	return normalizeWeights(next);
}

export async function POST({ request, cookies }) {
	const { supabase, user } = getActivityClient(cookies);
	const payload = await request.json().catch(() => null);
	const articleId = safeTrim(payload?.articleId);
	const chunkId = safeTrim(payload?.chunkId) || null;
	const feedbackType = safeTrim(payload?.feedbackType).toLowerCase();
	const sessionId = safeTrim(payload?.sessionId).slice(0, 120) || null;
	const dwellSeconds = clamp(Math.round(toNumber(payload?.dwellSeconds, 0)), 0, 3600);
	const context = payload?.context && typeof payload.context === 'object' ? payload.context : {};

	if (!articleId) return json({ error: 'articleId is required.' }, { status: 400 });
	if (!ALLOWED_FEEDBACK_TYPES.has(feedbackType)) {
		return json({ error: 'Unsupported feedbackType.' }, { status: 400 });
	}

	const { error: feedbackError } = await supabase.from('learn_article_feedback_events').insert({
		user_id: user?.id || null,
		session_id: sessionId,
		article_id: articleId,
		chunk_id: chunkId,
		feedback_type: feedbackType,
		dwell_seconds: feedbackType === 'dwell' ? dwellSeconds : null,
		context
	});

	if (feedbackError) {
		console.warn('Unable to insert learn article feedback event', feedbackError);
		return json({ error: feedbackError.message || 'Unable to save feedback.' }, { status: 400 });
	}

	if (user?.id) {
		const { data: currentRow } = await supabase
			.from('learn_article_user_weights')
			.select(
				'user_id,lexical_weight,semantic_weight,freshness_weight,personalization_weight,location_weight,diversity_weight'
			)
			.eq('user_id', user.id)
			.maybeSingle();
		const currentWeights = normalizeWeights(currentRow || DEFAULT_WEIGHTS);
		const nextWeights = adjustWeights(currentWeights, feedbackType, dwellSeconds);
		await supabase.from('learn_article_user_weights').upsert(
			{
				user_id: user.id,
				...nextWeights
			},
			{ onConflict: 'user_id' }
		);
	}

	return json({ ok: true });
}
