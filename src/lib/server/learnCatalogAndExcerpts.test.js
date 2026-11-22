import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
	buildLearnCardExcerpt,
	generateLearnReadingAid,
	isGenericLearnPlaceholder
} from '#lib/learn/readingAid.js';
import {
	applyCategoryOrderUpdate,
	assertEditableLearnArticle,
	buildSafetyReportCatalogEntry,
	enrichLearnArticleCards,
	ensureUniqueLearnSlug,
	isProtectedLearnCatalogArticle,
	isProtectedLearnCatalogSlug,
	mergeSafetyReportIntoCatalog,
	normalizeLearnPayload,
	redirectIfProtectedLearnSlug,
	SAFETY_REPORT_SLUG,
	SAFETY_REPORT_SOURCE_PATH
} from '#lib/server/learnCatalog.js';
import { classifyContentType, inferLearnArticleSearchSignals } from '#lib/server/learnDiscovery.js';

function walkWikiFiles(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const out = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walkWikiFiles(fullPath));
		else if (entry.name.endsWith('.md') || entry.name.endsWith('.html')) out.push(fullPath);
	}
	return out.sort();
}

function parseRawWikiFile(filePath, docsRoot) {
	const raw = fs.readFileSync(filePath, 'utf8');
	const rel = path.relative(docsRoot, filePath).replace(/\\/g, '/');
	const parts = rel.split('/');
	const categoryName =
		parts.length > 1 ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'General';
	const subcategoryName =
		parts.length > 2 ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : '';

	let meta = {};
	let content = raw;
	if (raw.startsWith('---')) {
		const blocks = raw.split(/^---\s*$/m);
		if (blocks.length >= 3) {
			content = blocks.slice(2).join('---\n').trim();
			for (const line of blocks[1].split(/\r?\n/)) {
				const idx = line.indexOf(':');
				if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}
	} else if (raw.includes('<!--')) {
		const comment = raw.match(/<!--([\s\S]*?)-->/);
		if (comment) {
			for (const line of comment[1].split(/\r?\n/)) {
				const idx = line.indexOf(':');
				if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
			content = raw
				.replace(comment[0], '')
				.replace(/<[^>]+>/g, ' ')
				.trim();
		}
	}

	return {
		rel,
		title: meta.title || path.basename(filePath, path.extname(filePath)),
		summary: meta.description || null,
		bodyMarkdown: content,
		categoryName,
		subcategoryName
	};
}

test('all 73 wiki guides (including all 29 with summary = null) produce clear non-placeholder card excerpts', () => {
	const docsRoot = path.resolve('docs/3ftwiki');
	const files = walkWikiFiles(docsRoot).map((file) => parseRawWikiFile(file, docsRoot));
	assert.equal(files.length, 73);

	const missingSummaries = files.filter((doc) => !doc.summary);
	assert.equal(missingSummaries.length, 29);

	for (const doc of files) {
		const readingAid = generateLearnReadingAid({
			title: doc.title,
			summary: doc.summary || '',
			markdown: doc.bodyMarkdown
		});
		assert.equal(
			isGenericLearnPlaceholder(readingAid.readerSummary),
			false,
			`Expected non-placeholder readerSummary for ${doc.rel}`
		);

		// Simulate stored DB row where summary is null and only reader_summary / key_takeaways are projected
		const excerpt = buildLearnCardExcerpt({
			title: doc.title,
			summary: doc.summary,
			reader_summary: readingAid.readerSummary,
			key_takeaways: readingAid.keyTakeaways,
			category_name: doc.categoryName
		});
		assert.ok(excerpt.length >= 20, `Expected meaningful card excerpt for ${doc.rel}`);
		assert.equal(
			isGenericLearnPlaceholder(excerpt),
			false,
			`Expected zero placeholder copy on ${doc.rel}, got: ${excerpt}`
		);
		assert.ok(
			!/canva template/i.test(excerpt) || doc.rel === 'community/social-media.md',
			`Unexpected Canva boilerplate in excerpt for ${doc.rel}: ${excerpt}`
		);
	}
});

test('enrichLearnArticleCards fetches body_markdown only when reading aids are absent and strips heavy fields', async () => {
	let fetchedIds = [];
	const mockSupabase = {
		from(table) {
			assert.equal(table, 'learn_articles');
			return {
				select() {
					return this;
				},
				in(_col, ids) {
					fetchedIds = ids;
					return Promise.resolve({
						data: [
							{
								id: 'needs-body',
								body_markdown:
									'## Immediate Steps\n\nMove out of traffic if possible and check everyone for injuries before moving bikes.'
							}
						]
					});
				}
			};
		}
	};

	const cards = await enrichLearnArticleCards(mockSupabase, [
		{
			id: 'has-reader-aid',
			title: 'Crash Response',
			slug: 'crash-response',
			summary: null,
			reader_summary: 'Move out of traffic if possible and check for injuries.',
			key_takeaways: [],
			search_document: 'raw-tsvector'
		},
		{
			id: 'needs-body',
			title: 'Unindexed Guide',
			slug: 'unindexed-guide',
			summary: null,
			reader_summary: null,
			key_takeaways: []
		}
	]);

	assert.deepEqual(fetchedIds, ['needs-body']);
	assert.equal(cards.length, 2);
	for (const card of cards) {
		assert.equal('body_markdown' in card, false);
		assert.equal('search_document' in card, false);
		assert.equal(isGenericLearnPlaceholder(card.card_excerpt), false);
	}
	assert.match(cards[1].card_excerpt, /Move out of traffic if possible/);
});

test('safety classification marks Crash Response, Tips for Cyclists Safety, Emergency Protocols, and Safer Cycling as safety', () => {
	const docsRoot = path.resolve('docs/3ftwiki');
	const targetMap = new Map(
		walkWikiFiles(docsRoot)
			.map((file) => parseRawWikiFile(file, docsRoot))
			.map((doc) => [doc.rel, doc])
	);

	for (const relPath of [
		'education/crash-response.md',
		'education/ALERT.md',
		'community/safety.md'
	]) {
		const doc = targetMap.get(relPath);
		assert.ok(doc, `Missing expected wiki file ${relPath}`);
		const signals = inferLearnArticleSearchSignals({
			title: doc.title,
			summary: doc.summary || '',
			bodyMarkdown: doc.bodyMarkdown,
			categoryName: doc.categoryName,
			subcategoryName: doc.subcategoryName
		});
		assert.equal(
			signals.content_type,
			'safety',
			`Expected ${doc.title} (${relPath}) to classify as safety, got ${signals.content_type}`
		);
	}

	const reportEntry = buildSafetyReportCatalogEntry();
	assert.equal(reportEntry.record.content_type, 'safety');
	assert.equal(
		classifyContentType({
			title: 'Safer Cycling, Better Messages',
			summary: reportEntry.record.summary,
			bodyMarkdown: reportEntry.record.body_markdown,
			categoryName: 'Education'
		}),
		'safety'
	);

	// Genuine policy & toolkit articles still classify accurately
	assert.equal(
		classifyContentType({
			title: 'Policy Audit Template',
			summary: 'Audit Complete Streets ordinances and council resolutions',
			bodyMarkdown: 'Review municipal legislation and council ordinances.',
			categoryName: 'Policies'
		}),
		'policy'
	);
	assert.equal(
		classifyContentType({
			title: 'Social Media Graphic Templates',
			summary: 'Canva templates to design social media posts quickly',
			bodyMarkdown: 'Use this template and checklist to plan graphics.',
			categoryName: 'Community'
		}),
		'toolkit'
	);
});

test('Safer Cycling, Better Messages synchronizes cleanly and is protected from wiki editor overwrites', async () => {
	const entry = buildSafetyReportCatalogEntry();
	assert.equal(entry.record.slug, SAFETY_REPORT_SLUG);
	assert.equal(entry.record.import_source_path, SAFETY_REPORT_SOURCE_PATH);
	assert.ok(entry.chunks.length >= 15, 'Expected section chunks for all report chapters');
	assert.equal(isProtectedLearnCatalogSlug('safer-cycling-better-messages'), true);
	assert.equal(isProtectedLearnCatalogArticle(entry.card), true);

	// Deduplicates cleanly when already present in DB rows
	const mergedWithExisting = mergeSafetyReportIntoCatalog([
		{
			id: 'real-db-uuid',
			slug: SAFETY_REPORT_SLUG,
			title: 'Safer Cycling, Better Messages',
			summary: null,
			category_slug: 'education',
			category_name: 'Education',
			import_source_path: SAFETY_REPORT_SOURCE_PATH
		}
	]);
	assert.equal(mergedWithExisting.length, 1);
	assert.equal(mergedWithExisting[0].id, 'real-db-uuid');
	assert.equal(mergedWithExisting[0].content_type, 'safety');
	assert.equal(isGenericLearnPlaceholder(mergedWithExisting[0].card_excerpt), false);

	// Scoped category merge skips unrelated categories
	assert.equal(mergeSafetyReportIntoCatalog([], { categorySlug: 'outreach' }).length, 0);
	assert.equal(mergeSafetyReportIntoCatalog([], { categorySlug: 'education' }).length, 1);

	// Reserved slug cannot be claimed via normalizeLearnPayload
	const reservedForm = new FormData();
	reservedForm.set('title', 'Attempted Overwrite');
	reservedForm.set('slug', SAFETY_REPORT_SLUG);
	reservedForm.set('bodyMarkdown', 'Attempted overwrite body');
	assert.throws(
		() => normalizeLearnPayload(reservedForm),
		(err) => err?.status === 403
	);

	// Auto-slugging a new article with the same title avoids colliding with the protected slug
	const countSupabase = {
		from() {
			return {
				select() {
					return this;
				},
				eq() {
					return Promise.resolve({ count: 0, error: null });
				}
			};
		}
	};
	const generatedSlug = await ensureUniqueLearnSlug(
		countSupabase,
		'Safer Cycling, Better Messages'
	);
	assert.equal(generatedSlug, 'safer-cycling-better-messages-2');

	// assertEditableLearnArticle blocks updates to an existing protected report record
	await assert.rejects(
		assertEditableLearnArticle(countSupabase, {
			articleId: 'report-id',
			existingArticle: {
				id: 'report-id',
				slug: SAFETY_REPORT_SLUG,
				import_source_path: SAFETY_REPORT_SOURCE_PATH
			}
		}),
		(err) => err?.status === 403
	);

	// /learn/safer-cycling-better-messages/edit redirects to dedicated report route
	assert.throws(
		() => redirectIfProtectedLearnSlug(SAFETY_REPORT_SLUG),
		(redirectErr) =>
			redirectErr?.status === 303 && redirectErr?.location === `/learn/${SAFETY_REPORT_SLUG}`
	);
});

test('category updateOrder rejects reorder requests while a search filter is active or when partial', async () => {
	const searchActiveForm = new FormData();
	searchActiveForm.set('type', 'article');
	searchActiveForm.set('searchActive', 'true');
	searchActiveForm.set(
		'items',
		JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', sort_order: 0 }])
	);

	const blockedBySearch = await applyCategoryOrderUpdate({
		supabase: {},
		categorySlug: 'education',
		formData: searchActiveForm
	});
	assert.equal(blockedBySearch.status, 400);
	assert.match(blockedBySearch.data.error, /Clear the active search filter/);

	// Even if searchActive flag were omitted, partial filtered lists are rejected against full category count
	const partialForm = new FormData();
	partialForm.set('type', 'article');
	partialForm.set(
		'items',
		JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', sort_order: 0 }])
	);
	const mockSupabase = {
		from() {
			return {
				select() {
					return this;
				},
				eq() {
					return this;
				},
				then(resolve) {
					resolve({ count: 14, error: null });
				}
			};
		}
	};
	const blockedPartial = await applyCategoryOrderUpdate({
		supabase: mockSupabase,
		categorySlug: 'education',
		formData: partialForm
	});
	assert.equal(blockedPartial.status, 400);
	assert.match(blockedPartial.data.error, /partial article order/);
});
