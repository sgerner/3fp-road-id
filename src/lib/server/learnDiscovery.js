const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'by',
	'for',
	'from',
	'in',
	'is',
	'it',
	'of',
	'on',
	'or',
	'that',
	'the',
	'to',
	'with'
]);

export const LEARN_EMBEDDING_DIM = 64;

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

export function tokenizeLearnText(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9\s-]/g, ' ')
		.split(/\s+/)
		.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function hashToken(token) {
	let hash = 2166136261;
	for (let i = 0; i < token.length; i += 1) {
		hash ^= token.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

export function buildDeterministicEmbedding(text, dimensions = LEARN_EMBEDDING_DIM) {
	const vector = new Array(dimensions).fill(0);
	const tokens = tokenizeLearnText(text);
	if (!tokens.length) return vector;

	for (const token of tokens) {
		const hash = hashToken(token);
		const index = hash % dimensions;
		const sign = (hash & 1) === 0 ? 1 : -1;
		const weight = 1 + (token.length > 7 ? 0.25 : 0);
		vector[index] += sign * weight;
	}

	const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
	if (magnitude > 0) {
		for (let i = 0; i < vector.length; i += 1) {
			vector[i] = Number((vector[i] / magnitude).toFixed(6));
		}
	}
	return vector;
}

export function cosineSimilarity(a = [], b = []) {
	if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
	const length = Math.min(a.length, b.length);
	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < length; i += 1) {
		const av = Number(a[i] || 0);
		const bv = Number(b[i] || 0);
		dot += av * bv;
		magA += av * av;
		magB += bv * bv;
	}
	if (!magA || !magB) return 0;
	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function embeddingToVectorLiteral(embedding = []) {
	const vector = Array.isArray(embedding) ? embedding : [];
	return `[${vector.map((value) => Number(value || 0).toFixed(6)).join(',')}]`;
}

function extractTopTerms(text, limit = 12) {
	const frequencies = new Map();
	for (const token of tokenizeLearnText(text)) {
		if (!token || token.length < 3) continue;
		frequencies.set(token, (frequencies.get(token) || 0) + 1);
	}
	return Array.from(frequencies.entries())
		.sort((a, b) => {
			if (b[1] !== a[1]) return b[1] - a[1];
			return a[0].localeCompare(b[0]);
		})
		.slice(0, limit)
		.map(([term]) => term);
}

function classifyDifficulty(text) {
	const haystack = safeTrim(text).toLowerCase();
	if (/\b(beginner|starter|new rider|first time|intro)\b/.test(haystack)) return 'beginner';
	if (/\b(intermediate|moderate)\b/.test(haystack)) return 'intermediate';
	if (/\b(advanced|expert|race pace|technical)\b/.test(haystack)) return 'advanced';
	return 'all-levels';
}

function classifyRideType(text) {
	const haystack = safeTrim(text).toLowerCase();
	if (/\b(gravel)\b/.test(haystack)) return 'gravel';
	if (/\b(mtb|mountain|trail)\b/.test(haystack)) return 'mountain';
	if (/\b(commut|city ride|transportation)\b/.test(haystack)) return 'commute';
	if (/\b(family|kids|youth)\b/.test(haystack)) return 'family';
	if (/\b(road|pace line|peloton)\b/.test(haystack)) return 'road';
	return 'mixed';
}

function classifyContentType({ title = '', summary = '', bodyMarkdown = '', categoryName = '' }) {
	const haystack = `${title} ${summary} ${categoryName} ${bodyMarkdown}`.toLowerCase();
	if (/\b(policy|ordinance|resolution|council|legislation)\b/.test(haystack)) return 'policy';
	if (/\b(checklist|template|worksheet|tracker|spreadsheet)\b/.test(haystack)) return 'toolkit';
	if (/\b(crash|safety|response|alert|waiver)\b/.test(haystack)) return 'safety';
	if (/\b(story|case study|spotlight|interview)\b/.test(haystack)) return 'story';
	if (/\b(how to|guide|playbook|manual|steps?)\b/.test(haystack)) return 'guide';
	if (/\b(event|calendar|upcoming|meetup)\b/.test(haystack)) return 'event';
	return 'reference';
}

function extractAudience(text) {
	const haystack = safeTrim(text).toLowerCase();
	const audience = [];
	if (/\b(beginner|new rider)\b/.test(haystack)) audience.push('beginners');
	if (/\b(youth|kid|student|school)\b/.test(haystack)) audience.push('youth');
	if (/\b(women|girls|femme)\b/.test(haystack)) audience.push('women');
	if (/\b(advocate|organizer|leader)\b/.test(haystack)) audience.push('organizers');
	if (/\b(commuter|commuting)\b/.test(haystack)) audience.push('commuters');
	if (/\b(family|parents?)\b/.test(haystack)) audience.push('families');
	return Array.from(new Set(audience));
}

function extractLocation(text) {
	const source = safeTrim(text);
	if (!source) return { geo_scope: 'global', geo_city: null, geo_state: null };

	const cityStateMatch = source.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s*,\s*([A-Z]{2})\b/);
	if (cityStateMatch) {
		return {
			geo_scope: 'city',
			geo_city: cityStateMatch[1],
			geo_state: cityStateMatch[2]
		};
	}

	const stateCodeMatch = source.match(/\b(AZ|CA|CO|NM|NV|TX|UT|WA|OR|NY|FL|IL)\b/i);
	if (stateCodeMatch) {
		return {
			geo_scope: 'state',
			geo_city: null,
			geo_state: stateCodeMatch[1].toUpperCase()
		};
	}

	if (/\b(local|neighborhood|community|tempe|phoenix|mesa|tucson|scottsdale)\b/i.test(source)) {
		return { geo_scope: 'metro', geo_city: null, geo_state: null };
	}

	if (/\b(usa|united states|national|federal)\b/i.test(source)) {
		return { geo_scope: 'national', geo_city: null, geo_state: null };
	}

	return { geo_scope: 'global', geo_city: null, geo_state: null };
}

function inferEvergreen(text) {
	const haystack = safeTrim(text).toLowerCase();
	if (/\b(20\d{2})\b/.test(haystack)) return false;
	if (/\b(upcoming|this month|next week|register by|deadline)\b/.test(haystack)) return false;
	return true;
}

function safeUnique(values, limit = 16) {
	const out = [];
	for (const value of values || []) {
		const cleaned = safeTrim(value).toLowerCase();
		if (!cleaned) continue;
		if (out.includes(cleaned)) continue;
		out.push(cleaned);
		if (out.length >= limit) break;
	}
	return out;
}

export function inferLearnArticleSearchSignals({
	title = '',
	summary = '',
	bodyMarkdown = '',
	categoryName = '',
	subcategoryName = '',
	locationHint = ''
}) {
	const contextText = [title, summary, categoryName, subcategoryName, bodyMarkdown].join('\n');
	const combinedLocationText = [locationHint, title, summary, bodyMarkdown].join(' ');
	const location = extractLocation(combinedLocationText);
	const tags = safeUnique(
		[
			...extractTopTerms(`${title} ${summary}`, 6),
			...extractTopTerms(`${categoryName} ${subcategoryName}`, 4),
			...extractTopTerms(bodyMarkdown, 8)
		],
		14
	);
	const audience = extractAudience(contextText);
	const difficulty = classifyDifficulty(contextText);
	const rideType = classifyRideType(contextText);
	const contentType = classifyContentType({ title, summary, bodyMarkdown, categoryName });
	const isEvergreen = inferEvergreen(contextText);
	const embedding = buildDeterministicEmbedding(
		[title, summary, categoryName, subcategoryName, tags.join(' '), bodyMarkdown].join('\n')
	);

	const metadataConfidence = clamp(
		0.4 +
			(tags.length >= 5 ? 0.15 : 0) +
			(audience.length ? 0.1 : 0) +
			(location.geo_scope !== 'global' ? 0.1 : 0) +
			(contentType !== 'reference' ? 0.08 : 0),
		0.4,
		0.95
	);

	return {
		tags,
		audience,
		difficulty_level: difficulty,
		ride_type: rideType,
		geo_scope: location.geo_scope,
		geo_city: location.geo_city,
		geo_state: location.geo_state,
		content_type: contentType,
		is_evergreen: isEvergreen,
		metadata_confidence: Number(metadataConfidence.toFixed(2)),
		embedding,
		embedding_literal: embeddingToVectorLiteral(embedding)
	};
}

function splitByHeadings(markdown = '') {
	const lines = String(markdown || '').split('\n');
	const sections = [];
	let current = { heading: 'Overview', lines: [] };

	for (const line of lines) {
		const headingMatch = line.match(/^#{1,3}\s+(.+)/);
		if (headingMatch) {
			if (current.lines.length) sections.push(current);
			current = { heading: safeTrim(headingMatch[1]) || 'Section', lines: [] };
			continue;
		}
		current.lines.push(line);
	}
	if (current.lines.length) sections.push(current);
	return sections;
}

export function buildLearnArticleChunks({
	title = '',
	summary = '',
	bodyMarkdown = '',
	categoryName = '',
	signals = null,
	maxChunkChars = 900
}) {
	const resolvedSignals =
		signals ||
		inferLearnArticleSearchSignals({
			title,
			summary,
			bodyMarkdown,
			categoryName,
			subcategoryName: ''
		});
	const sections = splitByHeadings(bodyMarkdown);
	const chunks = [];
	let index = 0;

	for (const section of sections) {
		const raw = section.lines.join('\n').replace(/\s+/g, ' ').trim();
		if (!raw) continue;
		for (let cursor = 0; cursor < raw.length; cursor += maxChunkChars) {
			const chunkText = raw.slice(cursor, cursor + maxChunkChars).trim();
			if (!chunkText) continue;
			const chunkEmbedding = buildDeterministicEmbedding(
				`${title}\n${section.heading}\n${chunkText}\n${resolvedSignals.tags.join(' ')}`
			);
			chunks.push({
				chunk_index: index,
				heading: section.heading,
				chunk_text: chunkText,
				chunk_chars: chunkText.length,
				tags: safeUnique(
					[...resolvedSignals.tags, ...extractTopTerms(`${section.heading} ${chunkText}`, 8)],
					16
				),
				embedding: chunkEmbedding,
				embedding_literal: embeddingToVectorLiteral(chunkEmbedding)
			});
			index += 1;
		}
	}

	if (!chunks.length) {
		const fallbackText = safeTrim(summary || bodyMarkdown || title);
		if (fallbackText) {
			const fallbackEmbedding = buildDeterministicEmbedding(fallbackText);
			chunks.push({
				chunk_index: 0,
				heading: 'Overview',
				chunk_text: fallbackText,
				chunk_chars: fallbackText.length,
				tags: safeUnique(resolvedSignals.tags, 16),
				embedding: fallbackEmbedding,
				embedding_literal: embeddingToVectorLiteral(fallbackEmbedding)
			});
		}
	}

	return chunks;
}

function parseVectorColumn(raw, dimensions = LEARN_EMBEDDING_DIM) {
	if (Array.isArray(raw)) return raw.map((value) => Number(value || 0));
	const text = safeTrim(raw);
	if (!text) return new Array(dimensions).fill(0);
	const stripped = text.replace(/^\[/, '').replace(/\]$/, '');
	const values = stripped
		.split(',')
		.map((entry) => Number(entry.trim()))
		.filter((entry) => Number.isFinite(entry));
	if (values.length === dimensions) return values;
	if (values.length > dimensions) return values.slice(0, dimensions);
	return [...values, ...new Array(dimensions - values.length).fill(0)];
}

export function parseLearnEmbedding(raw) {
	return parseVectorColumn(raw, LEARN_EMBEDDING_DIM);
}

export async function syncLearnArticleChunks(supabase, { articleId, chunks, userId = null }) {
	if (!articleId || !supabase) return;
	await supabase.from('learn_article_chunks').delete().eq('article_id', articleId);
	if (!Array.isArray(chunks) || !chunks.length) return;

	const rows = chunks.map((chunk) => ({
		article_id: articleId,
		chunk_index: chunk.chunk_index,
		heading: chunk.heading,
		chunk_text: chunk.chunk_text,
		chunk_chars: chunk.chunk_chars,
		tags: chunk.tags,
		embedding: chunk.embedding_literal,
		created_by_user_id: userId || null,
		updated_by_user_id: userId || null
	}));
	const { error } = await supabase.from('learn_article_chunks').insert(rows);
	if (error) {
		console.warn('Unable to sync learn article chunks', error);
	}
}
