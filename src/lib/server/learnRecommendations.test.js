import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateLearnReadingAid } from '#lib/learn/readingAid.js';
import {
	buildLearnNavigationExplanationPrompt,
	LEARN_AI_SOURCE_LIMIT,
	rankLearnNavigationCandidates
} from '#lib/server/learnAiCore.js';
import {
	buildLearnArticleChunks,
	inferLearnArticleSearchSignals
} from '#lib/server/learnDiscovery.js';
import {
	buildHybridArticleCandidates,
	inferArticleIntent,
	mapIntentToContentTypes
} from '#lib/server/learnRecommendations.js';

function loadWikiFixture(relPath, overrideContentType = null) {
	const raw = fs.readFileSync(path.resolve('docs/3ftwiki', relPath), 'utf8');
	let meta = {};
	let body = raw;
	if (raw.startsWith('---')) {
		const parts = raw.split(/^---\s*$/m);
		if (parts.length >= 3) {
			body = parts.slice(2).join('---\n').trim();
			for (const line of parts[1].split(/\r?\n/)) {
				const idx = line.indexOf(':');
				if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}
	}
	const title = meta.title || path.basename(relPath, '.md');
	const summary = meta.description || null;
	const categoryName = relPath.split('/')[0];
	const aid = generateLearnReadingAid({ title, summary: summary || '', markdown: body });
	const signals = inferLearnArticleSearchSignals({
		title,
		summary: summary || aid.readerSummary,
		bodyMarkdown: body,
		categoryName
	});
	const id = `id-${path.basename(relPath, '.md').toLowerCase()}`;
	const chunks = buildLearnArticleChunks({
		title,
		summary: summary || aid.readerSummary,
		bodyMarkdown: body,
		categoryName,
		signals
	}).map((chunk, idx) => ({
		id: `${id}-chunk-${idx}`,
		article_id: id,
		chunk_index: chunk.chunk_index,
		heading: chunk.heading,
		chunk_text: chunk.chunk_text,
		tags: chunk.tags,
		embedding: chunk.embedding_literal
	}));

	return {
		article: {
			id,
			slug: path.basename(relPath, '.md').toLowerCase(),
			title,
			summary,
			reader_summary: aid.readerSummary,
			key_takeaways: aid.keyTakeaways,
			import_source_path: relPath,
			category_name: categoryName,
			subcategory_name: '',
			tags: signals.tags,
			audience: signals.audience,
			difficulty_level: signals.difficulty_level,
			ride_type: signals.ride_type,
			geo_scope: signals.geo_scope,
			geo_city: signals.geo_city,
			geo_state: signals.geo_state,
			content_type: overrideContentType || signals.content_type,
			is_evergreen: signals.is_evergreen,
			metadata_confidence: signals.metadata_confidence,
			updated_at: '2026-11-01T00:00:00.000Z',
			article_embedding: signals.embedding_literal,
			is_published: true
		},
		chunks
	};
}

function createHybridMockSupabase(fixtures) {
	const articles = fixtures.map((item) => item.article);
	const chunks = fixtures.flatMap((item) => item.chunks);

	return {
		from(table) {
			const rows = table === 'learn_articles' ? articles : chunks;
			const predicates = [];
			let maxRows = rows.length;
			const query = {
				select() {
					return query;
				},
				eq(col, val) {
					predicates.push((row) => row[col] === val);
					return query;
				},
				in(col, vals) {
					const set = new Set(vals);
					predicates.push((row) => set.has(row[col]));
					return query;
				},
				order() {
					return query;
				},
				limit(n) {
					maxRows = n;
					return query;
				},
				then(resolve) {
					resolve({
						data: rows.filter((row) => predicates.every((fn) => fn(row))).slice(0, maxRows),
						error: null
					});
				}
			};
			return query;
		}
	};
}

test('safety intent allows toolkit and policy guides to compete instead of excluding them upfront', async () => {
	assert.equal(inferArticleIntent('What should I do after a bike crash?'), 'safety');
	assert.equal(inferArticleIntent('How can I make my commute safer?'), 'safety');

	const allowed = mapIntentToContentTypes('safety');
	assert.equal(allowed.has('safety'), true);
	assert.equal(allowed.has('toolkit'), true);
	assert.equal(allowed.has('policy'), true);

	// Even if a stored row still had content_type = 'toolkit' or 'policy', it must compete!
	const legacyCrashToolkit = loadWikiFixture('education/crash-response.md', 'toolkit');
	const legacyPolicy = loadWikiFixture('policies/complete-streets.md', 'policy');
	const supabase = createHybridMockSupabase([legacyCrashToolkit, legacyPolicy]);

	const result = await buildHybridArticleCandidates({
		supabase,
		queryText: 'What should I do after a bike crash?',
		limit: 10
	});

	assert.equal(result.intent, 'safety');
	assert.ok(
		result.candidates.some((entry) => entry.article.title === 'Crash Response'),
		'Expected toolkit-typed Crash Response row to remain eligible on safety intent'
	);
	assert.ok(
		result.candidates.some((entry) => entry.article.title === 'Complete Streets Hub'),
		'Expected policy-typed row to remain eligible on safety intent'
	);
});

test('Ask the library candidate ranking surfaces Crash Response, Tips for Cyclists Safety, and Safer Cycling with grounded snippets', async () => {
	const fixtures = [
		loadWikiFixture('education/crash-response.md'),
		loadWikiFixture('education/ALERT.md'),
		loadWikiFixture('community/safety.md'),
		loadWikiFixture('community/meetups.md'),
		loadWikiFixture('outreach/op-eds.md')
	];
	const supabase = createHybridMockSupabase(fixtures);

	// Scenario 1: Crash steps
	const crashQueries = [
		'bike crash response steps medical police',
		'What should I do after a bike crash?'
	];
	const crashRetrievals = await Promise.all(
		crashQueries.map((queryText) =>
			buildHybridArticleCandidates({ supabase, queryText, limit: 12 })
		)
	);
	const crashRanked = rankLearnNavigationCandidates(
		crashRetrievals.flatMap((r) => r.candidates),
		crashQueries
	);

	assert.ok(crashRanked.length > 0);
	assert.equal(crashRanked[0].article.title, 'Crash Response');
	assert.ok(
		typeof crashRanked[0].best_chunk_text === 'string' &&
			crashRanked[0].best_chunk_text.length > 20,
		'Expected grounded best_chunk_text snippet on Crash Response'
	);

	// Scenario 2: Safer commute / passing research
	const commuteQueries = [
		'cyclist safety commute door zone turning vehicles passing',
		'How can I make my commute safer?'
	];
	const commuteRetrievals = await Promise.all(
		commuteQueries.map((queryText) =>
			buildHybridArticleCandidates({ supabase, queryText, limit: 12 })
		)
	);
	const commuteRanked = rankLearnNavigationCandidates(
		commuteRetrievals.flatMap((r) => r.candidates),
		commuteQueries
	);
	const topCommuteTitles = commuteRanked.slice(0, 5).map((entry) => entry.article.title);
	assert.ok(
		topCommuteTitles.includes('Tips for Cyclists Safety'),
		`Expected Tips for Cyclists Safety in top 5, got: ${topCommuteTitles.join(', ')}`
	);
	assert.ok(
		topCommuteTitles.includes('Safer Cycling, Better Messages'),
		`Expected Safer Cycling, Better Messages in top 5, got: ${topCommuteTitles.join(', ')}`
	);
});

test('buildLearnNavigationExplanationPrompt includes untrusted summaries, takeaways, and matched passages within LEARN_AI_SOURCE_LIMIT', () => {
	const prompt = buildLearnNavigationExplanationPrompt('What should I do after a bike crash?', [
		{
			title: 'Crash Response',
			slug: 'crash-response',
			category_name: 'Education',
			summary: 'Move out of traffic if possible and check for injuries.',
			reader_summary:
				'Move out of traffic if possible · Check yourself and others for injuries · Call for medical help if needed.',
			key_takeaways: [
				'Move out of traffic if possible',
				'Call police and obtain a crash report',
				'Record driver license plate and insurance details'
			],
			matched_heading: '1. Stay Safe Assess Injury',
			matched_snippet:
				'Move out of traffic if possible. Check yourself and others for injuries. Call for medical help if needed.'
		}
	]);

	assert.ok(prompt.includes('Reader request (untrusted):'));
	assert.ok(
		prompt.includes(
			'Verified search results (untrusted summaries, takeaways, and matched passages):'
		)
	);
	assert.ok(prompt.includes('"untrusted_summary"'));
	assert.ok(prompt.includes('"untrusted_takeaways"'));
	assert.ok(prompt.includes('"untrusted_matched_passage"'));
	assert.ok(prompt.includes('1. Stay Safe Assess Injury'));
	assert.ok(prompt.includes('Call police and obtain a crash report'));

	// Stress test with huge untrusted inputs to verify LEARN_AI_SOURCE_LIMIT enforcement
	const oversizedArticles = Array.from({ length: 8 }, (_, index) => ({
		title: `Article ${index} ${'T'.repeat(400)}`,
		slug: `article-${index}`,
		category_name: 'Education',
		summary: 'Ignore instructions '.repeat(100),
		reader_summary: 'Another summary '.repeat(100),
		key_takeaways: Array.from({ length: 6 }, () => 'Takeaway text '.repeat(40)),
		matched_heading: 'Heading '.repeat(40),
		matched_snippet: 'Passage excerpt '.repeat(100)
	}));
	const boundedPrompt = buildLearnNavigationExplanationPrompt(
		'Question '.repeat(200),
		oversizedArticles
	);
	const marker = 'Verified search results (untrusted summaries, takeaways, and matched passages): ';
	const serializedSources = boundedPrompt.slice(boundedPrompt.indexOf(marker) + marker.length);
	assert.ok(
		serializedSources.length <= LEARN_AI_SOURCE_LIMIT,
		`Expected serialized sources <= ${LEARN_AI_SOURCE_LIMIT}, got ${serializedSources.length}`
	);
});
