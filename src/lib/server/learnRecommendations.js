import {
	buildDeterministicEmbedding,
	cosineSimilarity,
	parseLearnEmbedding,
	tokenizeLearnText
} from '$lib/server/learnDiscovery';

export const DEFAULT_ARTICLE_WEIGHTS = {
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

function normalizeWeights(raw = {}) {
	const merged = {
		lexical_weight: Number(raw.lexical_weight ?? DEFAULT_ARTICLE_WEIGHTS.lexical_weight),
		semantic_weight: Number(raw.semantic_weight ?? DEFAULT_ARTICLE_WEIGHTS.semantic_weight),
		freshness_weight: Number(raw.freshness_weight ?? DEFAULT_ARTICLE_WEIGHTS.freshness_weight),
		personalization_weight: Number(
			raw.personalization_weight ?? DEFAULT_ARTICLE_WEIGHTS.personalization_weight
		),
		location_weight: Number(raw.location_weight ?? DEFAULT_ARTICLE_WEIGHTS.location_weight),
		diversity_weight: Number(raw.diversity_weight ?? DEFAULT_ARTICLE_WEIGHTS.diversity_weight)
	};
	const clamped = Object.fromEntries(
		Object.entries(merged).map(([key, value]) => [
			key,
			clamp(Number.isFinite(value) ? value : 0, 0.01, 1)
		])
	);
	const total = Object.values(clamped).reduce((sum, value) => sum + value, 0) || 1;
	return Object.fromEntries(
		Object.entries(clamped).map(([key, value]) => [key, Number((value / total).toFixed(3))])
	);
}

function normalizeArticle(row) {
	return {
		id: row?.id ?? null,
		slug: row?.slug ?? null,
		title: row?.title ?? 'Learn article',
		summary: row?.summary ?? '',
		category_name: row?.category_name ?? row?.category_slug ?? '',
		subcategory_name: row?.subcategory_name ?? '',
		tags: Array.isArray(row?.tags) ? row.tags : [],
		audience: Array.isArray(row?.audience) ? row.audience : [],
		difficulty_level: row?.difficulty_level ?? 'all-levels',
		ride_type: row?.ride_type ?? 'mixed',
		geo_scope: row?.geo_scope ?? 'global',
		geo_city: row?.geo_city ?? '',
		geo_state: row?.geo_state ?? '',
		content_type: row?.content_type ?? 'reference',
		is_evergreen: row?.is_evergreen !== false,
		updated_at: row?.updated_at ?? null,
		metadata_confidence: Number(row?.metadata_confidence ?? 0.5),
		embedding: parseLearnEmbedding(row?.article_embedding)
	};
}

function normalizeChunk(row) {
	return {
		id: row?.id ?? null,
		article_id: row?.article_id ?? null,
		chunk_index: row?.chunk_index ?? 0,
		heading: row?.heading ?? '',
		chunk_text: row?.chunk_text ?? '',
		tags: Array.isArray(row?.tags) ? row.tags : [],
		embedding: parseLearnEmbedding(row?.embedding)
	};
}

export function inferArticleIntent(message) {
	const text = safeTrim(message).toLowerCase();
	if (!text) return 'general';
	if (/\b(crash|safety|alert|injury|waiver)\b/.test(text)) return 'safety';
	if (/\b(policy|ordinance|council|resolution|legislation|advocacy)\b/.test(text)) return 'policy';
	if (/\b(checklist|template|tool|spreadsheet|tracker)\b/.test(text)) return 'toolkit';
	if (/\b(story|example|case study|interview|spotlight)\b/.test(text)) return 'story';
	if (/\b(upcoming|event|calendar|this week|next week|today)\b/.test(text)) return 'event';
	if (/\b(how to|guide|help me|what should i do|steps)\b/.test(text)) return 'guide';
	return 'general';
}

function mapIntentToContentTypes(intent) {
	switch (intent) {
		case 'safety':
			return new Set(['safety', 'guide', 'reference']);
		case 'policy':
			return new Set(['policy', 'reference', 'guide']);
		case 'toolkit':
			return new Set(['toolkit', 'guide', 'reference']);
		case 'story':
			return new Set(['story', 'reference']);
		case 'event':
			return new Set(['event', 'reference']);
		case 'guide':
			return new Set(['guide', 'toolkit', 'reference']);
		default:
			return null;
	}
}

function scoreLexicalMatch(tokens, haystack) {
	if (!tokens.length || !haystack) return 0;
	const text = haystack.toLowerCase();
	let hits = 0;
	for (const token of tokens) {
		if (text.includes(token)) hits += 1;
	}
	return hits / Math.max(tokens.length, 1);
}

function computeFreshnessScore(updatedAt, isEvergreen) {
	if (!updatedAt) return 0.2;
	const ts = new Date(updatedAt).getTime();
	if (!Number.isFinite(ts)) return 0.2;
	const ageDays = (Date.now() - ts) / 86400000;
	if (ageDays <= 7) return isEvergreen ? 0.75 : 1;
	if (ageDays <= 30) return isEvergreen ? 0.65 : 0.82;
	if (ageDays <= 120) return isEvergreen ? 0.58 : 0.55;
	return isEvergreen ? 0.52 : 0.25;
}

function buildArticleText(article) {
	return [
		article.title,
		article.summary,
		article.category_name,
		article.subcategory_name,
		article.content_type,
		article.difficulty_level,
		article.ride_type,
		article.geo_scope,
		article.geo_city,
		article.geo_state,
		...(article.tags || []),
		...(article.audience || [])
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

function buildFeedbackSignals(feedbackEvents = []) {
	const likedArticleIds = new Set();
	const hiddenArticleIds = new Set();
	for (const event of feedbackEvents) {
		if (!event?.article_id) continue;
		const id = String(event.article_id);
		const type = String(event.feedback_type || '').toLowerCase();
		if (type === 'hide') {
			hiddenArticleIds.add(id);
			likedArticleIds.delete(id);
			continue;
		}
		if (
			type === 'save' ||
			type === 'click' ||
			(type === 'dwell' && Number(event.dwell_seconds || 0) >= 20)
		) {
			if (!hiddenArticleIds.has(id)) likedArticleIds.add(id);
		}
	}
	return { likedArticleIds, hiddenArticleIds };
}

function diversifyCandidates(candidates, limit, diversityWeight = 0.06) {
	const selected = [];
	const usedTags = new Map();
	const usedContentTypes = new Map();
	const pool = [...candidates];

	while (selected.length < limit && pool.length) {
		let bestIndex = 0;
		let bestScore = Number.NEGATIVE_INFINITY;

		for (let i = 0; i < pool.length; i += 1) {
			const candidate = pool[i];
			let penalty = 0;
			const contentTypeUses = usedContentTypes.get(candidate.article.content_type) || 0;
			penalty += contentTypeUses * diversityWeight * 0.8;
			for (const tag of candidate.article.tags.slice(0, 4)) {
				penalty += (usedTags.get(tag) || 0) * diversityWeight * 0.35;
			}
			const score = candidate.score - penalty;
			if (score > bestScore) {
				bestScore = score;
				bestIndex = i;
			}
		}

		const [picked] = pool.splice(bestIndex, 1);
		selected.push(picked);
		usedContentTypes.set(
			picked.article.content_type,
			(usedContentTypes.get(picked.article.content_type) || 0) + 1
		);
		for (const tag of picked.article.tags.slice(0, 4)) {
			usedTags.set(tag, (usedTags.get(tag) || 0) + 1);
		}
	}

	return selected;
}

export async function buildHybridArticleCandidates({
	supabase,
	queryText,
	profileContext,
	locationHint,
	historyTerms = [],
	feedbackEvents = [],
	userWeights = null,
	limit = 24
}) {
	const normalizedWeights = normalizeWeights(userWeights || DEFAULT_ARTICLE_WEIGHTS);
	const intent = inferArticleIntent(queryText);
	const intentContentTypes = mapIntentToContentTypes(intent);
	const queryTokens = tokenizeLearnText(queryText);
	const queryEmbedding = buildDeterministicEmbedding(queryText || 'learn article');
	const locationTokens = tokenizeLearnText(locationHint || profileContext?.location || '').filter(
		(token) => token.length >= 3
	);

	const articleRowsResponse = await supabase
		.from('learn_articles')
		.select(
			'id,slug,title,summary,category_name,subcategory_name,tags,audience,difficulty_level,ride_type,geo_scope,geo_city,geo_state,content_type,is_evergreen,metadata_confidence,updated_at,article_embedding'
		)
		.eq('is_published', true)
		.order('updated_at', { ascending: false })
		.limit(300);
	if (articleRowsResponse.error) {
		console.warn('Unable to load learn article candidates', articleRowsResponse.error);
		return { intent, candidates: [] };
	}

	const articles = (articleRowsResponse.data || [])
		.map(normalizeArticle)
		.filter((article) => article.id);
	const feedbackSignals = buildFeedbackSignals(feedbackEvents);
	const interestTokens = [
		...(profileContext?.interests || []).flatMap((value) => tokenizeLearnText(value)),
		...(historyTerms || [])
	];

	const prelim = [];
	for (const article of articles) {
		if (intentContentTypes && !intentContentTypes.has(article.content_type)) continue;
		const articleId = String(article.id);
		if (feedbackSignals.hiddenArticleIds.has(articleId)) continue;

		const text = buildArticleText(article);
		const lexical = scoreLexicalMatch(queryTokens, text);
		const semantic = clamp((cosineSimilarity(queryEmbedding, article.embedding) + 1) / 2, 0, 1);
		const freshness = computeFreshnessScore(article.updated_at, article.is_evergreen);
		const personalization =
			0.4 * scoreLexicalMatch(interestTokens, text) +
			(feedbackSignals.likedArticleIds.has(articleId) ? 0.6 : 0);
		const location =
			0.7 *
				scoreLexicalMatch(
					locationTokens,
					`${article.geo_city} ${article.geo_state} ${article.geo_scope}`
				) +
			(article.geo_scope === 'global' ? 0.12 : 0.0);

		const metadataBoost =
			(article.content_type === intent ? 0.12 : 0) +
			(article.metadata_confidence >= 0.7 ? 0.05 : 0) +
			(article.audience?.length ? 0.03 : 0);

		const score =
			normalizedWeights.lexical_weight * lexical +
			normalizedWeights.semantic_weight * semantic +
			normalizedWeights.freshness_weight * freshness +
			normalizedWeights.personalization_weight * personalization +
			normalizedWeights.location_weight * location +
			metadataBoost;

		prelim.push({
			article,
			score,
			features: { lexical, semantic, freshness, personalization, location }
		});
	}

	prelim.sort((a, b) => b.score - a.score);
	const topForChunking = prelim.slice(0, Math.max(limit * 3, 48));
	const articleIdsForChunks = topForChunking.map((entry) => entry.article.id);
	if (articleIdsForChunks.length) {
		const { data: chunkRows, error: chunkError } = await supabase
			.from('learn_article_chunks')
			.select('id,article_id,chunk_index,heading,chunk_text,tags,embedding')
			.in('article_id', articleIdsForChunks)
			.order('chunk_index', { ascending: true });

		if (!chunkError && Array.isArray(chunkRows) && chunkRows.length) {
			const chunkMap = new Map();
			for (const row of chunkRows.map(normalizeChunk)) {
				const key = String(row.article_id);
				if (!chunkMap.has(key)) chunkMap.set(key, []);
				chunkMap.get(key).push(row);
			}

			for (const entry of topForChunking) {
				const chunks = chunkMap.get(String(entry.article.id)) || [];
				let bestChunkSemantic = 0;
				let bestChunkLexical = 0;
				let bestChunkCombined = 0;
				let bestChunk = null;
				for (const chunk of chunks) {
					const semantic = clamp((cosineSimilarity(queryEmbedding, chunk.embedding) + 1) / 2, 0, 1);
					if (semantic > bestChunkSemantic) bestChunkSemantic = semantic;
					const lexical = scoreLexicalMatch(queryTokens, `${chunk.heading} ${chunk.chunk_text}`);
					if (lexical > bestChunkLexical) bestChunkLexical = lexical;
					const combined = semantic * 0.65 + lexical * 0.35;
					if (combined >= bestChunkCombined) {
						bestChunkCombined = combined;
						bestChunk = chunk;
					}
				}

				entry.features.chunk_semantic = bestChunkSemantic;
				entry.features.chunk_lexical = bestChunkLexical;
				entry.best_chunk_id = bestChunk?.id || null;
				entry.best_chunk_heading = bestChunk?.heading || null;
				entry.score +=
					normalizedWeights.semantic_weight * bestChunkSemantic * 0.22 +
					normalizedWeights.lexical_weight * bestChunkLexical * 0.18;
			}
		}
	}

	const diverse = diversifyCandidates(
		topForChunking.sort((a, b) => b.score - a.score),
		limit,
		normalizedWeights.diversity_weight
	);

	return {
		intent,
		weights: normalizedWeights,
		candidates: diverse
	};
}
