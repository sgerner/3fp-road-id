import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateLearnReadingAid } from '#lib/learn/readingAid.js';
import {
	buildLearnArticleChunks,
	inferLearnArticleSearchSignals
} from '#lib/server/learnDiscovery.js';
import { buildSafetyReportCatalogEntry } from '#lib/server/learnCatalog.js';
import {
	extractMatchedSnippet,
	handleLearnSearchRequest,
	LEARN_SEARCH_MAX_QUERY_LENGTH,
	LEARN_SEARCH_MAX_RAW_LENGTH,
	parseLearnSearchConcepts,
	sanitizeLearnSearchQuery,
	searchLearnArticles,
	validateLearnSearchQuery
} from '#lib/server/learnSearch.js';

function walkWikiFiles(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const out = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walkWikiFiles(fullPath));
		} else if (entry.name.endsWith('.md') || entry.name.endsWith('.html')) {
			out.push(fullPath);
		}
	}
	return out;
}

function parseWikiDoc(filePath, docsRoot) {
	const raw = fs.readFileSync(filePath, 'utf8');
	const rel = path.relative(docsRoot, filePath).replace(/\\/g, '/');
	const parts = rel.split('/');
	const categorySlug = parts.length > 1 ? parts[0].toLowerCase() : 'general';
	const categoryName =
		categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1).replace(/-/g, ' ');

	let meta = {};
	let content = raw;
	if (raw.startsWith('---')) {
		const blocks = raw.split(/^---\s*$/m);
		if (blocks.length >= 3) {
			content = blocks.slice(2).join('---\n').trim();
			for (const line of blocks[1].split(/\r?\n/)) {
				const idx = line.indexOf(':');
				if (idx > 0) {
					meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
				}
			}
		}
	} else if (raw.includes('<!--')) {
		const comment = raw.match(/<!--([\s\S]*?)-->/);
		if (comment) {
			for (const line of comment[1].split(/\r?\n/)) {
				const idx = line.indexOf(':');
				if (idx > 0) {
					meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
				}
			}
			content = raw
				.replace(comment[0], '')
				.replace(/<[^>]+>/g, ' ')
				.trim();
		}
	}

	const title = meta.title || path.basename(filePath, path.extname(filePath));
	const summary = meta.description || null;
	const slug = path
		.basename(filePath, path.extname(filePath))
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-');
	const aid = generateLearnReadingAid({ title, summary: summary || '', markdown: content });
	const signals = inferLearnArticleSearchSignals({
		title,
		summary: summary || aid.readerSummary,
		bodyMarkdown: content,
		categoryName
	});
	const id = `wiki-${rel.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
	const chunks = buildLearnArticleChunks({
		title,
		summary: summary || aid.readerSummary,
		bodyMarkdown: content,
		categoryName,
		signals
	}).map((chunk, idx) => ({
		...chunk,
		id: `${id}-chunk-${idx}`,
		article_id: id,
		search_text:
			`${chunk.heading} ${chunk.chunk_text} ${(chunk.tags || []).join(' ')}`.toLowerCase()
	}));

	return {
		article: {
			id,
			title,
			slug,
			summary,
			reader_summary: aid.readerSummary,
			key_takeaways: aid.keyTakeaways,
			body_markdown: content,
			category_slug: categorySlug,
			category_name: categoryName,
			subcategory_slug: null,
			subcategory_name: null,
			content_type: signals.content_type,
			tags: signals.tags,
			import_source_path: rel,
			is_published: true,
			created_by_user_id: null,
			updated_by_user_id: null,
			search_text: [
				title,
				summary,
				categoryName,
				content,
				aid.readerSummary,
				...(aid.keyTakeaways || []),
				...(signals.tags || []),
				signals.content_type
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
		},
		chunks
	};
}

function stemEnglish(word) {
	if (!word || /^\d+$/.test(word)) return word;
	if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
	if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
	if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
	if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
	return word;
}

/**
 * Simulates PostgreSQL websearch_to_tsquery('english', webQuery) against search_document.
 */
function matchesSimulatedPostgresWebsearch(searchText, webQuery) {
	if (!webQuery || !searchText) return false;
	const docNorm = searchText
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, ' ')
		.replace(/\s+/g, ' ');
	const docStems = new Set(
		docNorm
			.split(/[\s-]+/)
			.filter(Boolean)
			.flatMap((token) => [token, stemEnglish(token)])
	);

	// Split by top-level OR clauses (mirroring PostgreSQL websearch OR precedence)
	const orParts = webQuery.split(/\s+OR\s+/i).filter(Boolean);
	return orParts.some((clause) => {
		const phrases = [];
		const remainder = clause.replace(/"([^"]+)"/g, (_, phrase) => {
			phrases.push(phrase.toLowerCase().trim());
			return ' ';
		});
		const words = remainder
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, ' ')
			.split(/\s+/)
			.filter((w) => w.length >= 2 || /^\d+$/.test(w));

		const phrasesMatch = phrases.every((phrase) => {
			const cleanPhrase = phrase
				.replace(/[^a-z0-9\s-]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();
			if (docNorm.includes(cleanPhrase)) return true;
			return cleanPhrase
				.split(/[\s-]+/)
				.filter(Boolean)
				.every((token) => docStems.has(token) || docStems.has(stemEnglish(token)));
		});
		if (!phrasesMatch) return false;

		return words.every((word) => {
			if (word.includes('-')) {
				return word
					.split('-')
					.filter(Boolean)
					.every((part) => docStems.has(part) || docStems.has(stemEnglish(part)));
			}
			return docStems.has(word) || docStems.has(stemEnglish(word));
		});
	});
}

function createCatalogMockSupabase() {
	const docsRoot = path.resolve('docs/3ftwiki');
	const parsedDocs = walkWikiFiles(docsRoot).map((file) => parseWikiDoc(file, docsRoot));
	const reportEntry = buildSafetyReportCatalogEntry();
	const reportSearchText = [
		reportEntry.record.title,
		reportEntry.record.summary,
		reportEntry.record.reader_summary,
		...(reportEntry.record.key_takeaways || []),
		reportEntry.record.body_markdown,
		...(reportEntry.record.tags || [])
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();

	const allArticles = [
		...parsedDocs.map((item) => item.article),
		{
			...reportEntry.card,
			id: 'db-safer-cycling-report-id',
			search_text: reportSearchText
		},
		{
			id: 'draft-secret-article',
			title: 'Draft Unpublished 911 Helmet Crash Checklist',
			slug: 'draft-unpublished-secret',
			summary: 'Should never appear in public search results',
			reader_summary: 'Secret draft',
			key_takeaways: [],
			category_slug: 'education',
			category_name: 'Education',
			is_published: false,
			search_text: '911 helmet crash checklist 3 feet bike lane unpublished secret'
		}
	];

	const allChunks = [
		...parsedDocs.flatMap((item) => item.chunks),
		...reportEntry.chunks.map((chunk) => ({
			...chunk,
			article_id: 'db-safer-cycling-report-id',
			search_text:
				`${chunk.heading} ${chunk.chunk_text} ${(chunk.tags || []).join(' ')}`.toLowerCase()
		}))
	];

	function createQueryBuilder(table) {
		const source =
			table === 'learn_articles' ? allArticles : table === 'learn_article_chunks' ? allChunks : [];
		const filters = [];
		let rowLimit = source.length;

		const builder = {
			select() {
				return builder;
			},
			eq(column, value) {
				filters.push((row) => row[column] === value);
				return builder;
			},
			is(column, value) {
				filters.push((row) => (row[column] ?? null) === value);
				return builder;
			},
			in(column, values) {
				const set = new Set(values);
				filters.push((row) => set.has(row[column]));
				return builder;
			},
			lte(column, value) {
				filters.push((row) => Number(row[column] ?? 0) <= value);
				return builder;
			},
			textSearch(_column, webQuery, options = {}) {
				assert.equal(options.type, 'websearch');
				filters.push((row) => matchesSimulatedPostgresWebsearch(row.search_text, webQuery));
				return builder;
			},
			order() {
				return builder;
			},
			limit(n) {
				rowLimit = n;
				return builder;
			},
			then(resolve, reject) {
				try {
					const matched = source
						.filter((row) => filters.every((predicate) => predicate(row)))
						.slice(0, rowLimit);
					resolve({ data: matched, error: null });
				} catch (err) {
					reject?.(err);
				}
			}
		};
		return builder;
	}

	return {
		from(table) {
			return createQueryBuilder(table);
		}
	};
}

const AUDITED_SAFETY_QUERIES = [
	'3 feet',
	'three feet',
	'passing distance',
	'close pass',
	'911',
	'emergency',
	'helmet',
	'crash checklist',
	'bike crash',
	'police report',
	'first aid',
	'bike lane',
	'dooring',
	'dutch reach',
	'door zone',
	'blind spot',
	'lights',
	'high visibility',
	'hand signals',
	'pothole'
];

test('sanitizeLearnSearchQuery and validateLearnSearchQuery enforce bounds and clean unsafe input', () => {
	assert.equal(sanitizeLearnSearchQuery('  3   feet \u0000\u0007 '), '3 feet');
	assert.equal(sanitizeLearnSearchQuery('911 & (crash | checklist)!'), '911 crash checklist');
	assert.equal(sanitizeLearnSearchQuery('"unclosed quote 3 feet'), 'unclosed quote 3 feet');
	assert.equal(sanitizeLearnSearchQuery('"3 feet" passing'), '"3 feet" passing');
	assert.equal(sanitizeLearnSearchQuery('bike -negated'), 'bike negated');

	const maxSanitized = sanitizeLearnSearchQuery('a'.repeat(LEARN_SEARCH_MAX_QUERY_LENGTH + 25));
	assert.equal(maxSanitized.length, LEARN_SEARCH_MAX_QUERY_LENGTH);

	const tooLong = validateLearnSearchQuery('x'.repeat(LEARN_SEARCH_MAX_RAW_LENGTH + 1));
	assert.equal(tooLong.ok, false);
	assert.match(tooLong.error ?? '', /200 characters or fewer/);
});

test('server search matches all audited rider-safety queries on /learn and /learn/category/education with snippets', async () => {
	const supabase = createCatalogMockSupabase();

	for (const safetyQuery of AUDITED_SAFETY_QUERIES) {
		const libraryResult = await searchLearnArticles({
			supabase,
			query: safetyQuery
		});
		assert.ok(
			libraryResult.articles.length > 0,
			`Expected /learn server search to match safety query "${safetyQuery}"`
		);

		const categoryResult = await searchLearnArticles({
			supabase,
			query: safetyQuery,
			categorySlug: 'education'
		});
		assert.ok(
			categoryResult.articles.length > 0,
			`Expected /learn/category/education server search to match safety query "${safetyQuery}"`
		);

		for (const item of libraryResult.articles) {
			assert.notEqual(item.slug, 'draft-unpublished-secret', 'Must never leak unpublished drafts');
			assert.equal('body_markdown' in item, false, 'Must keep search payload lightweight');
			assert.equal('search_document' in item, false, 'Must not expose raw tsvector');
			assert.ok(
				typeof item.matched_snippet === 'string' && item.matched_snippet.length >= 15,
				`Expected non-empty matched_snippet on "${item.title}" for query "${safetyQuery}"`
			);
		}
	}

	// Verify key top results for flagship user scenarios
	const crashChecklist = await searchLearnArticles({ supabase, query: 'crash checklist' });
	assert.ok(
		crashChecklist.articles.slice(0, 3).some((article) => article.title === 'Crash Response'),
		'Expected Crash Response in top results for "crash checklist"'
	);

	const threeFeet = await searchLearnArticles({ supabase, query: '3 feet' });
	assert.ok(
		threeFeet.articles.some((article) => article.slug === 'safer-cycling-better-messages'),
		'Expected Safer Cycling, Better Messages in results for "3 feet"'
	);

	const emergency911 = await searchLearnArticles({ supabase, query: '911' });
	assert.ok(
		emergency911.articles
			.slice(0, 3)
			.some((article) =>
				['Emergency Protocols', 'Victim Resource Template', 'Crash Response'].includes(
					article.title
				)
			),
		'Expected Emergency Protocols, Victim Resource Template, or Crash Response in top results for "911"'
	);
});

test('extractMatchedSnippet centers on matched terms and strips markdown cleanly', () => {
	const snippet = extractMatchedSnippet({
		query: parseLearnSearchConcepts('911 medical help'),
		heading: 'Emergency Response Steps',
		text:
			'Introductory context. '.repeat(12) +
			'**Call 911 immediately** if someone has a serious head or neck injury and keep the lane clear.',
		fallbackExcerpt: 'Fallback excerpt',
		maxLength: 140
	});
	assert.equal(snippet.matched_heading, 'Emergency Response Steps');
	assert.ok(snippet.matched_snippet.toLowerCase().includes('call 911 immediately'));
	assert.ok(!snippet.matched_snippet.includes('**'));
	assert.ok(snippet.matched_snippet.length <= 145);
});

test('/api/learn/search enforces length bounds, returns matched snippets, and enforces per-IP rate limiting', async () => {
	const supabase = createCatalogMockSupabase();
	const getClient = async () => ({ user: null, supabase });

	const validResponse = await handleLearnSearchRequest(
		{
			url: new URL('https://3fp.org/api/learn/search?q=crash+checklist'),
			cookies: { get: () => undefined },
			getClientAddress: () => '203.0.113.75'
		},
		{ getClient }
	);
	assert.equal(validResponse.status, 200);
	const payload = await validResponse.json();
	assert.equal(payload.query, 'crash checklist');
	assert.ok(payload.articles.length > 0);
	assert.ok(payload.articles.some((item) => item.title === 'Crash Response'));

	const oversizedEvent = {
		url: new URL(`https://3fp.org/api/learn/search?q=${'x'.repeat(205)}`),
		cookies: { get: () => undefined },
		getClientAddress: () => '203.0.113.77'
	};
	const badResponse = await handleLearnSearchRequest(oversizedEvent, { getClient });
	assert.equal(badResponse.status, 400);

	// Exhaust rate limit bucket for a synthetic test IP
	let rateLimitedResponse = null;
	for (let i = 0; i < 95; i += 1) {
		const res = await handleLearnSearchRequest(
			{
				url: new URL('https://3fp.org/api/learn/search?q='),
				cookies: { get: () => undefined },
				getClientAddress: () => '203.0.113.88'
			},
			{ getClient }
		);
		if (res.status === 429) {
			rateLimitedResponse = res;
			break;
		}
	}
	assert.ok(rateLimitedResponse, 'Expected 429 response once rate limit is exceeded');
	assert.ok(Number(rateLimitedResponse.headers.get('retry-after')) >= 1);
});
