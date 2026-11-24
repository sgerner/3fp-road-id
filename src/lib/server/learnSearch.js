import { json } from '@sveltejs/kit';
import { buildLearnCardExcerpt, stripMarkdown } from '#lib/learn/readingAid.js';
import {
	buildSafetyReportCatalogEntry,
	isProtectedLearnCatalogArticle,
	SAFETY_REPORT_CATEGORY_SLUG
} from '#lib/server/learnCatalog.js';
import { enforceRateLimit } from '#lib/server/security.js';

export const LEARN_SEARCH_MAX_QUERY_LENGTH = 160;
export const LEARN_SEARCH_MAX_RAW_LENGTH = 200;
export const LEARN_SEARCH_DEFAULT_LIMIT = 50;
export const LEARN_SEARCH_MAX_LIMIT = 80;

const SEARCH_STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'by',
	'do',
	'for',
	'from',
	'how',
	'i',
	'if',
	'in',
	'into',
	'is',
	'it',
	'my',
	'of',
	'on',
	'or',
	'our',
	'should',
	'that',
	'the',
	'their',
	'to',
	'what',
	'when',
	'where',
	'with',
	'you',
	'your'
]);

const PHRASE_CONCEPT_EXPANSIONS = [
	{
		pattern:
			/\b(?:3\s*feet|three\s*feet|3\s*ft|3ft|safe\s+passing|passing\s+distance|close\s+pass(?:es|ing)?)\b/i,
		phrases: [
			'3 feet',
			'three feet',
			'passing distance',
			'safe room to pass',
			'wait behind',
			'pass safely',
			'share the road'
		],
		tokens: ['passing', 'feet', 'overtaking']
	},
	{
		pattern: /\b(?:crash\s+checklist|after\s+a\s+(?:bike\s+)?crash|bike\s+crash)\b/i,
		phrases: [
			'crash response',
			'call police',
			'medical help',
			'gather information',
			'assess injury'
		],
		tokens: ['crash', 'collision', 'injury', 'police']
	},
	{
		pattern: /\b(?:bike\s+lanes?|protected\s+bike\s+lanes?|cycle\s+tracks?)\b/i,
		phrases: ['bike lane', 'protected space', 'full lane', 'complete streets', 'door zone'],
		tokens: ['lane', 'protected', 'infrastructure']
	},
	{
		pattern: /\b(?:full\s+lane|share\s+the\s+road|take\s+the\s+lane)\b/i,
		phrases: ['full lane', 'share the road', 'lane position', 'safe room to pass'],
		tokens: ['lane', 'passing', 'road']
	},
	{
		pattern: /\b(?:door\s+zone|car\s+door(?:ing)?|dutch\s+reach)\b/i,
		phrases: ['door zone', 'dutch reach', 'car dooring', 'opening a door', 'far hand'],
		tokens: ['door', 'dooring', 'parked']
	},
	{
		pattern: /\b(?:blind\s+spots?|large\s+vehicles?|truck\s+turns?)\b/i,
		phrases: ['blind spot', 'large vehicles', 'turning across', 'mirrors'],
		tokens: ['blind', 'turning', 'mirrors', 'vehicles']
	},
	{
		pattern: /\b(?:hi[- ]?vis|high[- ]?visibility|reflective\s+gear|bright\s+gear)\b/i,
		phrases: ['high visibility', 'bright gear', 'safety vests', 'lights'],
		tokens: ['visibility', 'visible', 'lights', 'vests']
	},
	{
		pattern: /\b(?:hit\s+and\s+run|police\s+report)\b/i,
		phrases: ['police report', 'call police', 'license plate', 'witnesses', 'gather information'],
		tokens: ['police', 'report', 'license', 'witnesses']
	},
	{
		pattern: /\b(?:first\s+aid|medical\s+help|assess\s+injur(?:y|ies))\b/i,
		phrases: ['first aid', 'medical help', 'medical attention', 'emergency protocols'],
		tokens: ['medical', 'injury', 'injuries', 'emergency']
	},
	{
		pattern: /\b(?:hand\s+signals?|turn\s+signals?)\b/i,
		phrases: ['hand signals', 'signal clearly', 'turning vehicles'],
		tokens: ['signal', 'signals', 'turning']
	},
	{
		pattern: /\b(?:road\s+hazards?|potholes?)\b/i,
		phrases: ['potholes', 'debris', 'report a hazard', 'road hazard'],
		tokens: ['pothole', 'potholes', 'debris', 'hazard', 'hazards']
	}
];

const TOKEN_SYNONYMS = new Map([
	['911', ['911', 'emergency', 'medical help', 'call police', 'ambulance']],
	['3ft', ['3 feet', 'three feet', 'passing distance', 'safe room to pass']],
	['crash', ['crash', 'collision', 'accident', 'wreck']],
	['checklist', ['checklist', 'steps', 'tips', 'protocol', 'gather']],
	['helmet', ['helmet', 'helmets', 'gear', 'equipment']],
	['helmets', ['helmet', 'helmets', 'gear', 'equipment']],
	['dooring', ['dooring', 'door zone', 'dutch reach', 'opening a door']],
	['lights', ['lights', 'light', 'visibility', 'visible', 'bright']],
	['light', ['light', 'lights', 'visibility', 'visible']],
	['hivis', ['visibility', 'visible', 'bright gear', 'vests', 'lights']],
	['ebike', ['e-bike', 'e-bikes', 'ebike', 'electric']],
	['e-bike', ['e-bike', 'e-bikes', 'electric']],
	['pothole', ['pothole', 'potholes', 'debris', 'hazard']],
	['potholes', ['pothole', 'potholes', 'debris', 'hazard']],
	['emergency', ['emergency', '911', 'protocols', 'medical', 'urgent']],
	['waiver', ['waiver', 'waivers', 'liability', 'insurance']],
	['ghost', ['ghost bike', 'memorial', 'vigil']]
]);

const GENERIC_MODIFIER_TOKENS = new Set([
	'checklist',
	'checklists',
	'guide',
	'guides',
	'tips',
	'steps',
	'step',
	'list',
	'template',
	'templates',
	'help',
	'info',
	'information',
	'rules',
	'rule',
	'bike',
	'bikes',
	'bicycle',
	'bicycles',
	'cycling',
	'cyclist',
	'cyclists',
	'ride',
	'rider',
	'riders'
]);

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function sanitizeLearnSearchQuery(raw) {
	if (typeof raw !== 'string') return '';
	let cleaned = raw
		.normalize('NFKC')
		.replace(/\p{Cc}+/gu, ' ')
		.replace(/[^\p{L}\p{N}\s"'-]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	const quoteCount = (cleaned.match(/"/g) || []).length;
	if (quoteCount % 2 !== 0) {
		cleaned = cleaned.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
	}

	if (cleaned.length > LEARN_SEARCH_MAX_QUERY_LENGTH) {
		cleaned = cleaned.slice(0, LEARN_SEARCH_MAX_QUERY_LENGTH).trim();
		const balancedQuotes = (cleaned.match(/"/g) || []).length;
		if (balancedQuotes % 2 !== 0) {
			cleaned = cleaned.replace(/"/g, '').trim();
		}
	}

	// Strip dangling hyphen operators that could act as accidental negation in websearch
	cleaned = cleaned
		.replace(/(?:^|\s)-+(?=\s|$)/g, ' ')
		.replace(/\s+-(\w)/g, ' $1')
		.replace(/\s+/g, ' ')
		.trim();

	return cleaned;
}

export function validateLearnSearchQuery(raw) {
	if (raw === null || raw === undefined) {
		return { ok: true, query: '' };
	}
	if (typeof raw !== 'string') {
		return { ok: false, error: 'Invalid search query.' };
	}
	if (raw.trim().length > LEARN_SEARCH_MAX_RAW_LENGTH) {
		return {
			ok: false,
			error: `Search query must be ${LEARN_SEARCH_MAX_RAW_LENGTH} characters or fewer.`
		};
	}
	return {
		ok: true,
		query: sanitizeLearnSearchQuery(raw)
	};
}

function normalizeForMatch(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9\s-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function stemToken(token) {
	if (!token || /^\d+$/.test(token)) return token;
	if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
	if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
	if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
	if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
	return token;
}

export function parseLearnSearchConcepts(rawQuery) {
	const sanitized = sanitizeLearnSearchQuery(rawQuery);
	if (!sanitized) {
		return {
			sanitized: '',
			normalized: '',
			tokens: [],
			conceptGroups: [],
			strictWebQuery: '',
			expandedWebQuery: ''
		};
	}

	const normalized = normalizeForMatch(sanitized);
	const rawTokens = normalized
		.split(/\s+/)
		.map((token) => token.replace(/^-+|-+$/g, ''))
		.filter((token) => (token.length >= 2 || /^\d+$/.test(token)) && !SEARCH_STOP_WORDS.has(token));

	const matchedPhraseRules = PHRASE_CONCEPT_EXPANSIONS.filter((rule) =>
		rule.pattern.test(normalized)
	);
	const conceptGroups = [];
	const webTerms = new Set();

	for (const rule of matchedPhraseRules) {
		const terms = Array.from(new Set([...rule.phrases, ...rule.tokens])).map((t) =>
			t.toLowerCase()
		);
		conceptGroups.push({
			terms,
			isCore: true
		});
		for (const phrase of rule.phrases) {
			webTerms.add(phrase.includes(' ') ? `"${phrase}"` : phrase);
		}
		for (const token of rule.tokens) {
			webTerms.add(token);
		}
	}

	// Build token-level concept groups for tokens not already fully covered by a phrase rule
	for (const token of rawTokens) {
		const compact = token.replace(/-/g, '');
		const synonyms = TOKEN_SYNONYMS.get(token) || TOKEN_SYNONYMS.get(compact) || [token];
		const stemmed = stemToken(token);
		const groupTerms = Array.from(
			new Set([token, ...(stemmed && stemmed !== token ? [stemmed] : []), ...synonyms])
		).map((entry) => entry.toLowerCase());

		const coveredByPhraseRule = matchedPhraseRules.some(
			(rule) =>
				rule.phrases.some((phrase) => phrase.split(/\s+/).includes(token)) ||
				rule.tokens.includes(token)
		);
		if (!coveredByPhraseRule) {
			conceptGroups.push({
				terms: groupTerms,
				isCore: !GENERIC_MODIFIER_TOKENS.has(token)
			});
		}

		for (const term of groupTerms.slice(0, 5)) {
			webTerms.add(term.includes(' ') ? `"${term}"` : term);
		}
	}

	if (!conceptGroups.length && normalized) {
		conceptGroups.push({
			terms: [normalized],
			isCore: true
		});
		webTerms.add(normalized.includes(' ') ? `"${normalized}"` : normalized);
	}

	// Ensure at least one group is marked core
	if (conceptGroups.length && !conceptGroups.some((group) => group.isCore)) {
		conceptGroups[0].isCore = true;
	}

	const strictWebQuery = sanitized;
	const expandedTerms = Array.from(webTerms).filter(Boolean).slice(0, 18);
	const expandedWebQuery = expandedTerms.join(' OR ');

	return {
		sanitized,
		normalized,
		tokens: rawTokens,
		conceptGroups,
		strictWebQuery,
		expandedWebQuery
	};
}

function textContainsTerm(normalizedHaystack, term) {
	const cleanTerm = normalizeForMatch(term);
	if (!cleanTerm || !normalizedHaystack) return false;
	if (cleanTerm.includes(' ')) {
		return normalizedHaystack.includes(cleanTerm);
	}
	if (/^\d+$/.test(cleanTerm)) {
		const boundary = new RegExp(`(?:^|\\s|-)${cleanTerm}(?:$|\\s|-)`);
		return boundary.test(normalizedHaystack);
	}
	if (cleanTerm.length <= 3) {
		const boundary = new RegExp(`(?:^|\\s|-)${cleanTerm}[a-z0-9]*(?:$|\\s|-)`);
		return boundary.test(normalizedHaystack);
	}
	return normalizedHaystack.includes(cleanTerm);
}

/**
 * @param {{
 *   query?: string | ReturnType<typeof parseLearnSearchConcepts>,
 *   heading?: string,
 *   text?: string,
 *   fallbackExcerpt?: string,
 *   maxLength?: number
 * }} options
 */
export function extractMatchedSnippet({
	query = '',
	heading = '',
	text = '',
	fallbackExcerpt = '',
	maxLength = 220
}) {
	const cleanedText = stripMarkdown(text);
	if (!cleanedText) {
		return {
			matched_heading: safeTrim(heading) || null,
			matched_snippet: fallbackExcerpt || ''
		};
	}

	const parsed = typeof query === 'string' ? parseLearnSearchConcepts(query) : query;
	const primaryTerms = Array.from(new Set([parsed.normalized, ...parsed.tokens])).filter(
		(term) => term && term.length >= 2
	);
	const synonymTerms = Array.from(
		new Set(parsed.conceptGroups.flatMap((group) => group.terms))
	).filter((term) => term && term.length >= 2);

	const lower = cleanedText.toLowerCase();
	let bestIndex = -1;
	let bestTermLength = 0;

	const findBestMatch = (terms) => {
		for (const term of terms) {
			const idx = lower.indexOf(term.toLowerCase());
			if (idx >= 0 && term.length > bestTermLength) {
				bestIndex = idx;
				bestTermLength = term.length;
			}
		}
	};

	findBestMatch(primaryTerms);
	if (bestIndex < 0) {
		findBestMatch(synonymTerms);
	}

	if (bestIndex < 0) {
		const snippet =
			cleanedText.length <= maxLength
				? cleanedText
				: `${cleanedText.slice(0, maxLength - 1).trimEnd()}…`;
		return {
			matched_heading: safeTrim(heading) || null,
			matched_snippet: snippet
		};
	}

	const leadPadding = Math.max(24, Math.floor((maxLength - bestTermLength) * 0.35));
	let start = Math.max(0, bestIndex - leadPadding);
	if (start > 0) {
		const nextSpace = cleanedText.indexOf(' ', start);
		if (nextSpace > 0 && nextSpace < bestIndex) {
			start = nextSpace + 1;
		}
	}

	let end = Math.min(cleanedText.length, start + maxLength);
	if (end < cleanedText.length) {
		const lastSpace = cleanedText.lastIndexOf(' ', end);
		if (lastSpace > start + Math.floor(maxLength * 0.55)) {
			end = lastSpace;
		}
	}

	const prefix = start > 0 ? '…' : '';
	const suffix = end < cleanedText.length ? '…' : '';
	return {
		matched_heading: safeTrim(heading) || null,
		matched_snippet: `${prefix}${cleanedText.slice(start, end).trim()}${suffix}`
	};
}

/**
 * @param {{
 *   article: Record<string, any>,
 *   chunks?: Array<Record<string, any>>,
 *   parsedQuery: ReturnType<typeof parseLearnSearchConcepts>
 * }} options
 */
export function scoreLearnSearchCandidate({ article, chunks = [], parsedQuery }) {
	if (!article || !parsedQuery?.sanitized) return null;

	const titleNorm = normalizeForMatch(article.title);
	const summaryNorm = normalizeForMatch(
		`${article.summary || ''} ${article.reader_summary || ''} ${(article.key_takeaways || []).join(' ')}`
	);
	const metaNorm = normalizeForMatch(
		`${article.category_name || ''} ${article.subcategory_name || ''} ${(article.tags || []).join(' ')}`
	);
	const chunkEntries = Array.isArray(chunks) ? chunks : [];
	const chunksNorm = normalizeForMatch(
		chunkEntries.map((chunk) => `${chunk.heading || ''} ${chunk.chunk_text || ''}`).join(' ')
	);
	const fullHaystack = `${titleNorm} ${summaryNorm} ${metaNorm} ${chunksNorm}`.trim();
	if (!fullHaystack) return null;

	const groups = parsedQuery.conceptGroups;
	let matchedGroups = 0;
	let matchedCoreGroups = 0;
	const totalCoreGroups = groups.filter((group) => group.isCore).length;

	for (const group of groups) {
		const matched = group.terms.some((term) => textContainsTerm(fullHaystack, term));
		if (matched) {
			matchedGroups += 1;
			if (group.isCore) matchedCoreGroups += 1;
		}
	}

	if (matchedGroups === 0) return null;
	if (totalCoreGroups > 0 && matchedCoreGroups === 0) return null;
	if (groups.length >= 3 && matchedGroups < Math.ceil(groups.length * 0.5)) return null;

	let score = (matchedGroups / Math.max(groups.length, 1)) * 45;
	if (matchedGroups === groups.length) score += 25;
	if (totalCoreGroups > 0 && matchedCoreGroups === totalCoreGroups) score += 18;

	// Exact normalized query match boosts
	if (parsedQuery.normalized && titleNorm.includes(parsedQuery.normalized)) {
		score += 40;
	} else if (parsedQuery.normalized && summaryNorm.includes(parsedQuery.normalized)) {
		score += 24;
	} else if (parsedQuery.normalized && chunksNorm.includes(parsedQuery.normalized)) {
		score += 18;
	}

	// Token & concept boosts by field weight
	for (const token of parsedQuery.tokens) {
		if (textContainsTerm(titleNorm, token)) score += 14;
		if (textContainsTerm(summaryNorm, token)) score += 7;
		if (textContainsTerm(metaNorm, token)) score += 5;
	}

	for (const group of groups) {
		if (group.terms.some((term) => textContainsTerm(titleNorm, term))) score += 10;
		if (group.terms.some((term) => textContainsTerm(summaryNorm, term))) score += 5;
	}

	if (article.content_type === 'safety') {
		score += 4;
	}

	// Select best matching chunk for snippet display
	let bestChunk = null;
	let bestChunkScore = -1;
	for (const chunk of chunkEntries) {
		const headingNorm = normalizeForMatch(chunk.heading);
		const textNorm = normalizeForMatch(chunk.chunk_text);
		const combinedNorm = `${headingNorm} ${textNorm}`;
		let chunkScore = 0;

		if (parsedQuery.normalized && combinedNorm.includes(parsedQuery.normalized)) {
			chunkScore += 25;
		}
		for (const token of parsedQuery.tokens) {
			if (textContainsTerm(headingNorm, token)) chunkScore += 10;
			if (textContainsTerm(textNorm, token)) chunkScore += 6;
		}
		for (const group of groups) {
			if (group.terms.some((term) => textContainsTerm(headingNorm, term))) chunkScore += 7;
			if (group.terms.some((term) => textContainsTerm(textNorm, term))) chunkScore += 4;
		}
		if (chunkScore > bestChunkScore) {
			bestChunkScore = chunkScore;
			bestChunk = chunk;
		}
	}

	const cardExcerpt = buildLearnCardExcerpt(article);
	const snippetSource =
		bestChunk && bestChunkScore > 0
			? extractMatchedSnippet({
					query: parsedQuery,
					heading: bestChunk.heading,
					text: bestChunk.chunk_text,
					fallbackExcerpt: cardExcerpt
				})
			: extractMatchedSnippet({
					query: parsedQuery,
					heading: '',
					text:
						article.summary ||
						article.reader_summary ||
						(article.key_takeaways || []).join(' · ') ||
						cardExcerpt,
					fallbackExcerpt: cardExcerpt
				});

	return {
		score: Number(score.toFixed(3)),
		card_excerpt: cardExcerpt,
		matched_heading: snippetSource.matched_heading,
		matched_snippet: snippetSource.matched_snippet || cardExcerpt
	};
}

/**
 * @param {{
 *   articles?: any[],
 *   chunksByArticleId?: Map<string, any[]>,
 *   query?: string,
 *   categorySlug?: string | null,
 *   categoryName?: string | null,
 *   subcategorySlug?: string | null,
 *   limit?: number
 * }} options
 */
export function rankLearnSearchCatalog({
	articles = [],
	chunksByArticleId = new Map(),
	query = '',
	categorySlug = null,
	categoryName = null,
	subcategorySlug = null,
	limit = LEARN_SEARCH_DEFAULT_LIMIT
}) {
	const parsedQuery = parseLearnSearchConcepts(query);
	if (!parsedQuery.sanitized) return [];

	const normalizedCategorySlug = safeTrim(categorySlug).toLowerCase();
	const normalizedCategoryName = safeTrim(categoryName).toLowerCase();
	const normalizedSubcategorySlug = safeTrim(subcategorySlug).toLowerCase();

	const scored = [];
	for (const article of articles) {
		if (!article || article.is_published === false) continue;
		if (
			normalizedCategorySlug &&
			normalizedCategorySlug !== 'all' &&
			safeTrim(article.category_slug).toLowerCase() !== normalizedCategorySlug
		) {
			continue;
		}
		if (
			normalizedCategoryName &&
			normalizedCategoryName !== 'all' &&
			safeTrim(article.category_name).toLowerCase() !== normalizedCategoryName
		) {
			continue;
		}
		if (
			normalizedSubcategorySlug &&
			normalizedSubcategorySlug !== 'all' &&
			(normalizedSubcategorySlug === 'uncategorized'
				? Boolean(article.subcategory_slug)
				: safeTrim(article.subcategory_slug).toLowerCase() !== normalizedSubcategorySlug)
		) {
			continue;
		}

		const chunks = chunksByArticleId.get(String(article.id)) || [];
		const evaluation = scoreLearnSearchCandidate({ article, chunks, parsedQuery });
		if (!evaluation) continue;

		const {
			body_markdown: _bodyMarkdown,
			search_document: _searchDocument,
			article_embedding: _embedding,
			...lightweightArticle
		} = article;

		scored.push({
			article: {
				...lightweightArticle,
				card_excerpt: evaluation.card_excerpt,
				matched_heading: evaluation.matched_heading,
				matched_snippet: evaluation.matched_snippet
			},
			score: evaluation.score
		});
	}

	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return String(a.article.title || '').localeCompare(String(b.article.title || ''));
	});

	const boundedLimit = Math.max(
		1,
		Math.min(LEARN_SEARCH_MAX_LIMIT, Number(limit) || LEARN_SEARCH_DEFAULT_LIMIT)
	);
	return scored.slice(0, boundedLimit).map((entry) => entry.article);
}

const ARTICLE_SEARCH_SELECT =
	'id, title, slug, summary, reader_summary, key_takeaways, category_slug, category_name, subcategory_slug, subcategory_name, sort_order, cover_image_url, content_type, tags, import_source_path, is_published, updated_at, created_at, created_by_user_id, updated_by_user_id, last_revision_number';

/**
 * @param {any} supabase
 * @param {string} webQuery
 * @param {{ categorySlug?: string | null, categoryName?: string | null, subcategorySlug?: string | null, limit?: number }} [options]
 */
async function runArticleWebsearch(
	supabase,
	webQuery,
	{ categorySlug = null, categoryName = null, subcategorySlug = null, limit = 80 } = {}
) {
	if (!webQuery) return [];
	let query = supabase
		.from('learn_articles')
		.select(ARTICLE_SEARCH_SELECT)
		.eq('is_published', true)
		.textSearch('search_document', webQuery, { type: 'websearch', config: 'english' })
		.limit(limit);

	if (categorySlug && categorySlug !== 'all') {
		query = query.eq('category_slug', categorySlug);
	}
	if (categoryName && categoryName !== 'all') {
		query = query.eq('category_name', categoryName);
	}
	if (subcategorySlug && subcategorySlug !== 'all') {
		if (subcategorySlug === 'uncategorized') {
			query = query.is('subcategory_slug', null);
		} else {
			query = query.eq('subcategory_slug', subcategorySlug);
		}
	}

	const { data, error } = await query;
	if (error) {
		console.warn('Learn article websearch query failed', error);
		return [];
	}
	return data || [];
}

/**
 * @param {any} supabase
 * @param {string} webQuery
 * @param {{ articleIds?: string[] | null, limit?: number }} [options]
 */
async function runChunkWebsearch(supabase, webQuery, { articleIds = null, limit = 120 } = {}) {
	if (!webQuery) return [];
	if (Array.isArray(articleIds) && articleIds.length === 0) return [];

	let query = supabase
		.from('learn_article_chunks')
		.select('id, article_id, chunk_index, heading, chunk_text, tags')
		.textSearch('search_document', webQuery, { type: 'websearch', config: 'english' })
		.order('chunk_index', { ascending: true })
		.limit(limit);

	if (Array.isArray(articleIds)) {
		query = query.in('article_id', articleIds);
	}

	const { data, error } = await query;
	if (error) {
		console.warn('Learn chunk websearch query failed', error);
		return [];
	}
	return data || [];
}

/**
 * @param {{
 *   supabase: any,
 *   query: string,
 *   categorySlug?: string | null,
 *   categoryName?: string | null,
 *   subcategorySlug?: string | null,
 *   limit?: number
 * }} options
 */
export async function searchLearnArticles({
	supabase,
	query,
	categorySlug = null,
	categoryName = null,
	subcategorySlug = null,
	limit = LEARN_SEARCH_DEFAULT_LIMIT
}) {
	const parsed = parseLearnSearchConcepts(query);
	if (!parsed.sanitized) {
		return { query: '', articles: [], total: 0 };
	}

	const articleMap = new Map();
	const chunksByArticleId = new Map();

	const addArticle = (row) => {
		if (!row?.id) return;
		articleMap.set(String(row.id), row);
	};
	const addChunk = (chunk) => {
		if (!chunk?.article_id) return;
		const key = String(chunk.article_id);
		if (!chunksByArticleId.has(key)) chunksByArticleId.set(key, []);
		const list = chunksByArticleId.get(key);
		if (!list.some((existing) => existing.chunk_index === chunk.chunk_index)) {
			list.push(chunk);
		}
	};

	if (supabase) {
		let scopedCategoryIds = null;
		if (categorySlug && categorySlug !== 'all') {
			const { data: catRows } = await supabase
				.from('learn_articles')
				.select('id')
				.eq('is_published', true)
				.eq('category_slug', categorySlug);
			scopedCategoryIds = (catRows || []).map((row) => row.id).filter(Boolean);
		}

		const webQueries = Array.from(
			new Set([parsed.strictWebQuery, parsed.expandedWebQuery].filter(Boolean))
		);

		const [articleBatches, chunkBatches] = await Promise.all([
			Promise.all(
				webQueries.map((webQuery) =>
					runArticleWebsearch(supabase, webQuery, {
						categorySlug,
						categoryName,
						subcategorySlug
					})
				)
			),
			Promise.all(
				webQueries.map((webQuery) =>
					runChunkWebsearch(supabase, webQuery, {
						articleIds: scopedCategoryIds
					})
				)
			)
		]);

		for (const batch of articleBatches) {
			for (const row of batch) addArticle(row);
		}
		for (const batch of chunkBatches) {
			for (const chunk of batch) addChunk(chunk);
		}

		const missingParentIds = Array.from(chunksByArticleId.keys()).filter(
			(id) => !articleMap.has(id)
		);
		if (missingParentIds.length) {
			let parentQuery = supabase
				.from('learn_articles')
				.select(ARTICLE_SEARCH_SELECT)
				.eq('is_published', true)
				.in('id', missingParentIds);
			if (categorySlug && categorySlug !== 'all') {
				parentQuery = parentQuery.eq('category_slug', categorySlug);
			}
			if (categoryName && categoryName !== 'all') {
				parentQuery = parentQuery.eq('category_name', categoryName);
			}
			const { data: parentRows } = await parentQuery;
			for (const row of parentRows || []) addArticle(row);
		}

		// Fetch chunks for matched articles that did not yet have matching chunks loaded,
		// so snippet generation can still surface the most relevant section passage.
		const articlesMissingChunks = Array.from(articleMap.keys())
			.filter((id) => !chunksByArticleId.has(id))
			.slice(0, 24);
		if (articlesMissingChunks.length) {
			const { data: extraChunks } = await supabase
				.from('learn_article_chunks')
				.select('id, article_id, chunk_index, heading, chunk_text, tags')
				.in('article_id', articlesMissingChunks)
				.lte('chunk_index', 3)
				.order('chunk_index', { ascending: true });
			for (const chunk of extraChunks || []) addChunk(chunk);
		}
	}

	// Ensure the authoritative Safer Cycling, Better Messages report participates in search
	// even if the database has not yet run the catalog backfill.
	const hasSyncedReport = Array.from(articleMap.values()).some((row) =>
		isProtectedLearnCatalogArticle(row)
	);
	const reportMatchesScope =
		(!categorySlug || categorySlug === 'all' || categorySlug === SAFETY_REPORT_CATEGORY_SLUG) &&
		(!categoryName ||
			categoryName === 'all' ||
			categoryName.toLowerCase() === SAFETY_REPORT_CATEGORY_SLUG);

	if (!hasSyncedReport && reportMatchesScope) {
		const reportEntry = buildSafetyReportCatalogEntry();
		addArticle(reportEntry.card);
		for (const chunk of reportEntry.chunks) {
			addChunk(chunk);
		}
	}

	const ranked = rankLearnSearchCatalog({
		articles: Array.from(articleMap.values()),
		chunksByArticleId,
		query: parsed.sanitized,
		categorySlug,
		categoryName,
		subcategorySlug,
		limit
	});

	return {
		query: parsed.sanitized,
		articles: ranked,
		total: ranked.length
	};
}

function cleanFilterParam(value, maxLength = 120) {
	if (typeof value !== 'string') return '';
	return value.trim().slice(0, maxLength);
}

/**
 * @param {any} event
 * @param {{
 *   getClient?: (cookies: any) => Promise<{ user: any, supabase: any }>,
 *   getProfilesMap?: (supabase?: any, userIds?: any[]) => Promise<Map<any, any>>
 * }} [deps]
 */
export async function handleLearnSearchRequest(
	event,
	{ getClient, getProfilesMap = async () => new Map() } = {}
) {
	const limited = enforceRateLimit(event, {
		name: 'learn-search-ip',
		limit: 90,
		windowMs: 60_000
	});
	if (limited) return limited;

	const rawQuery = event.url.searchParams.get('q') ?? '';
	const validation = validateLearnSearchQuery(rawQuery);
	if (!validation.ok) {
		return json({ error: validation.error }, { status: 400 });
	}

	const categorySlug = cleanFilterParam(event.url.searchParams.get('categorySlug') ?? '');
	const categoryName = cleanFilterParam(event.url.searchParams.get('category') ?? '');
	const subcategorySlug = cleanFilterParam(event.url.searchParams.get('subcategory') ?? '');
	const requestedLimit = Number.parseInt(event.url.searchParams.get('limit') ?? '', 10);
	const limit = Number.isFinite(requestedLimit)
		? Math.max(1, Math.min(LEARN_SEARCH_MAX_LIMIT, requestedLimit))
		: LEARN_SEARCH_DEFAULT_LIMIT;

	if (!validation.query) {
		return json(
			{ query: '', articles: [], total: 0 },
			{ headers: { 'cache-control': 'no-store' } }
		);
	}

	try {
		const { user, supabase } = (await getClient?.(event.cookies)) || {
			user: null,
			supabase: null
		};
		const result = await searchLearnArticles({
			supabase,
			query: validation.query,
			categorySlug: categorySlug || null,
			categoryName: categoryName || null,
			subcategorySlug: subcategorySlug || null,
			limit
		});

		const profiles = await getProfilesMap(
			supabase,
			result.articles.flatMap((article) => [article.created_by_user_id, article.updated_by_user_id])
		);

		const articles = result.articles.map((article) => ({
			...article,
			authorProfile: profiles.get(article.created_by_user_id) ?? null,
			editorProfile: profiles.get(article.updated_by_user_id) ?? null
		}));

		return json(
			{
				query: result.query,
				articles,
				total: articles.length
			},
			{
				headers: {
					'cache-control': user?.id
						? 'private, no-store'
						: 'public, max-age=15, stale-while-revalidate=60'
				}
			}
		);
	} catch (err) {
		console.error('Learn search endpoint error', err);
		return json({ error: 'Unable to search the Learn library right now.' }, { status: 500 });
	}
}
