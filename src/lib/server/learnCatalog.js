import { error, fail, redirect } from '@sveltejs/kit';
import safetyReport from '../content/safetyReport.json' with { type: 'json' };
import {
	buildLearnCardExcerpt,
	generateLearnReadingAid,
	isGenericLearnPlaceholder
} from '#lib/learn/readingAid.js';
import {
	buildLearnArticleChunks,
	inferLearnArticleSearchSignals,
	syncLearnArticleChunks
} from '#lib/server/learnDiscovery.js';

export const LEARN_EDITOR_MODES = ['wysiwyg', 'markdown'];
export const SAFETY_REPORT_SLUG = 'safer-cycling-better-messages';
export const SAFETY_REPORT_SOURCE_PATH = 'src/lib/content/safetyReport.json';
export const SAFETY_REPORT_CATEGORY_SLUG = 'education';
export const SAFETY_REPORT_CATEGORY_NAME = 'Education';
export const SAFETY_REPORT_FALLBACK_ID = '00000000-0000-4000-8000-000000003f90';

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function isProtectedLearnCatalogSlug(slug) {
	return safeTrim(slug).toLowerCase() === SAFETY_REPORT_SLUG;
}

export function isProtectedLearnCatalogArticle(article) {
	if (!article || typeof article !== 'object') return false;
	if (isProtectedLearnCatalogSlug(article.slug)) return true;
	return safeTrim(article.import_source_path) === SAFETY_REPORT_SOURCE_PATH;
}

export function slugifyLearn(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function normalizeLearnCategory(categoryName) {
	const label = safeTrim(categoryName) || 'General';
	return {
		name: label,
		slug: slugifyLearn(label) || 'general'
	};
}

export function redirectIfProtectedLearnSlug(slug) {
	if (isProtectedLearnCatalogSlug(slug)) {
		throw redirect(303, `/learn/${SAFETY_REPORT_SLUG}`);
	}
}

export async function assertEditableLearnArticle(
	supabase,
	{ articleId = null, existingArticle = null, requestedSlug = '' } = {}
) {
	if (existingArticle && isProtectedLearnCatalogArticle(existingArticle)) {
		throw error(
			403,
			'Safer Cycling, Better Messages is managed from its authoritative report source and cannot be overwritten in the wiki editor.'
		);
	}
	if (articleId && !existingArticle && supabase) {
		const { data: current } = await supabase
			.from('learn_articles')
			.select('id, slug, import_source_path')
			.eq('id', articleId)
			.maybeSingle();
		if (current && isProtectedLearnCatalogArticle(current)) {
			throw error(
				403,
				'Safer Cycling, Better Messages is managed from its authoritative report source and cannot be overwritten in the wiki editor.'
			);
		}
	}
	if (requestedSlug && isProtectedLearnCatalogSlug(slugifyLearn(requestedSlug))) {
		throw error(
			403,
			'Safer Cycling, Better Messages is managed from its authoritative report source and cannot be overwritten in the wiki editor.'
		);
	}
}

export async function ensureUniqueLearnSlug(supabase, source, excludeId = null) {
	const base = slugifyLearn(source) || 'article';
	let attempt = 0;
	let candidate = base;

	while (attempt < 50) {
		if (isProtectedLearnCatalogSlug(candidate)) {
			attempt += 1;
			candidate = `${base}-${attempt + 1}`;
			continue;
		}
		let query = supabase
			.from('learn_articles')
			.select('id', { count: 'exact', head: true })
			.eq('slug', candidate);
		if (excludeId) query = query.neq('id', excludeId);
		const { count, error: queryError } = await query;
		if (queryError) throw queryError;
		if (!count) return candidate;
		attempt += 1;
		candidate = `${base}-${attempt + 1}`;
	}

	return `${base}-${Date.now()}`;
}

export function normalizeLearnPayload(formData) {
	const title = safeTrim(formData.get('title'));
	const summary = safeTrim(formData.get('summary')) || null;
	const bodyMarkdown = safeTrim(formData.get('bodyMarkdown'));
	const requestedSlug = safeTrim(formData.get('slug'));
	const editorMode = safeTrim(formData.get('editorMode')) || 'wysiwyg';
	const category = normalizeLearnCategory(formData.get('categoryName'));
	const subcategorySlug = safeTrim(formData.get('subcategorySlug')) || null;
	const coverImageUrl = safeTrim(formData.get('coverImageUrl')) || null;

	if (!title) {
		throw error(400, 'Title is required.');
	}

	if (!bodyMarkdown) {
		throw error(400, 'Article content is required.');
	}

	if (!LEARN_EDITOR_MODES.includes(editorMode)) {
		throw error(400, 'Invalid editor mode.');
	}

	if (requestedSlug && isProtectedLearnCatalogSlug(slugifyLearn(requestedSlug))) {
		throw error(
			403,
			'The Safer Cycling, Better Messages slug is reserved for the authoritative research report.'
		);
	}

	return {
		title,
		summary,
		body_markdown: bodyMarkdown,
		slug: requestedSlug,
		editor_mode: editorMode,
		category_slug: category.slug,
		category_name: category.name,
		subcategory_slug: subcategorySlug,
		cover_image_url: coverImageUrl
	};
}

export async function enrichLearnArticleCards(supabase, rows = []) {
	const items = Array.isArray(rows) ? rows : [];
	if (!items.length) return [];

	const missingBodyIds = items
		.filter((item) => {
			if (!item?.id) return false;
			const hasSummary = item.summary && !isGenericLearnPlaceholder(item.summary);
			const hasReaderSummary =
				item.reader_summary && !isGenericLearnPlaceholder(item.reader_summary);
			const hasTakeaways = Array.isArray(item.key_takeaways) && item.key_takeaways.length > 0;
			return !hasSummary && !hasReaderSummary && !hasTakeaways && !item.body_markdown;
		})
		.map((item) => item.id);

	const bodyMap = new Map();
	if (supabase && missingBodyIds.length > 0) {
		const { data: bodyRows } = await supabase
			.from('learn_articles')
			.select('id, body_markdown')
			.in('id', missingBodyIds);
		for (const row of bodyRows || []) {
			if (row?.id && row?.body_markdown) {
				bodyMap.set(row.id, row.body_markdown);
			}
		}
	}

	return items.map((item) => {
		const fallbackBody = item.body_markdown || bodyMap.get(item.id) || '';
		const card_excerpt = buildLearnCardExcerpt({
			...item,
			body_markdown: fallbackBody
		});
		const {
			body_markdown: _bodyMarkdown,
			search_document: _searchDocument,
			article_embedding: _embedding,
			...lightweight
		} = item;
		return {
			...lightweight,
			card_excerpt
		};
	});
}

export function normalizeCategoryOrderItemList(type, value) {
	if (!Array.isArray(value)) return [];
	if (type === 'subcategory') {
		return value
			.map((item) => ({
				id: String(item?.id || '').trim(),
				sort_order: Number.parseInt(String(item?.sort_order), 10)
			}))
			.filter((item) => item.id && Number.isFinite(item.sort_order));
	}
	if (type === 'article') {
		return value
			.map((item) => ({
				id: String(item?.id || '').trim(),
				sort_order: Number.parseInt(String(item?.sort_order), 10),
				subcategory_slug: item?.subcategory_slug ? String(item.subcategory_slug).trim() : null
			}))
			.filter(
				(item) =>
					item.id && item.id !== SAFETY_REPORT_FALLBACK_ID && Number.isFinite(item.sort_order)
			);
	}
	return [];
}

export async function applyCategoryOrderUpdate({ supabase, categorySlug, formData }) {
	const searchActive = String(formData.get('searchActive') || '').trim() === 'true';
	if (searchActive) {
		return fail(400, {
			error: 'Clear the active search filter before reordering category content.'
		});
	}

	const type = formData.get('type');
	const itemsStr = formData.get('items');
	try {
		if (type !== 'subcategory' && type !== 'article') {
			return fail(400, { error: 'Invalid order update type' });
		}

		const parsedItems = JSON.parse(String(itemsStr || '[]'));
		const normalizedItems = normalizeCategoryOrderItemList(type, parsedItems);

		if (type === 'article') {
			const { count, error: countError } = await supabase
				.from('learn_articles')
				.select('id', { count: 'exact', head: true })
				.eq('category_slug', categorySlug)
				.eq('is_published', true);
			if (countError) return fail(500, { error: countError.message });
			if (typeof count === 'number' && normalizedItems.length < count) {
				return fail(400, {
					error: 'Cannot save a partial article order while a filter is active.'
				});
			}
		}

		const { error: updateError } = await supabase.rpc('learn_apply_order_updates', {
			p_type: type,
			p_items: normalizedItems
		});
		if (updateError) return fail(400, { error: updateError.message });
	} catch {
		return fail(400, { error: 'Invalid order data' });
	}
	return { success: true };
}

function buildReportMarkdown(report) {
	const sections = Array.isArray(report?.sections) ? report.sections : [];
	const blocks = [];

	for (const section of sections) {
		const heading = safeTrim(section?.title) || 'Section';
		const takeaways = Array.isArray(section?.takeaways)
			? section.takeaways.map((item) => safeTrim(item)).filter(Boolean)
			: [];
		const plainText = safeTrim(section?.plainText);
		const lines = [`## ${heading}`];
		if (takeaways.length) {
			for (const takeaway of takeaways) {
				lines.push(`- ${takeaway}`);
			}
		}
		if (plainText) {
			lines.push('', plainText);
		}
		blocks.push(lines.join('\n'));
	}

	const quickSteps = Array.isArray(report?.quickGuide?.steps) ? report.quickGuide.steps : [];
	if (quickSteps.length) {
		const stepLines = ['## Quick Campaign Guide'];
		for (const step of quickSteps) {
			const title = safeTrim(step?.title || step?.heading);
			const summary = safeTrim(step?.body || step?.description || step?.summary);
			if (title || summary) {
				stepLines.push(`- ${[title, summary].filter(Boolean).join(': ')}`);
			}
		}
		if (stepLines.length > 1) blocks.push(stepLines.join('\n'));
	}

	return blocks.join('\n\n').trim();
}

function buildReportTimestamp(meta = {}) {
	const rawDate = safeTrim(meta.updatedAt || meta.publishedAt || '2026-11-01');
	if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
		return `${rawDate}T00:00:00.000Z`;
	}
	const parsed = new Date(rawDate);
	return Number.isNaN(parsed.getTime()) ? '2026-11-01T00:00:00.000Z' : parsed.toISOString();
}

let cachedCatalogEntry = null;

export function buildSafetyReportCatalogEntry(report = safetyReport) {
	if (report === safetyReport && cachedCatalogEntry) {
		return cachedCatalogEntry;
	}

	const title = safeTrim(report?.meta?.title) || 'Safer Cycling, Better Messages';
	const summary =
		'Targeted research review on road-safety messages, safe passing distance, dooring and turning checks, rider education, visibility, helmets, and campaign evaluation.';
	const bodyMarkdown = buildReportMarkdown(report);
	const executiveTakeaways = Array.isArray(report?.sections?.[0]?.takeaways)
		? report.sections[0].takeaways.map((item) => safeTrim(item)).filter(Boolean)
		: [];
	const readingAid = generateLearnReadingAid({
		title,
		summary,
		markdown: bodyMarkdown
	});
	const keyTakeaways = (
		executiveTakeaways.length ? executiveTakeaways : readingAid.keyTakeaways
	).slice(0, 5);
	const readerSummary =
		'Evidence review translating cycling safety studies into practical actions on safe passing (3 feet / minimum passing distance), dooring and turning conflicts, rider skills, helmets and lights, and campaign evaluation — while keeping safer street design first.';

	const signals = inferLearnArticleSearchSignals({
		title,
		summary: `${summary} ${readerSummary}`,
		bodyMarkdown,
		categoryName: SAFETY_REPORT_CATEGORY_NAME,
		subcategoryName: ''
	});
	signals.content_type = 'safety';
	signals.tags = Array.from(
		new Set([
			'safety',
			'passing',
			'3-feet',
			'dooring',
			'helmet',
			'visibility',
			'bike-lane',
			'campaigns',
			...signals.tags
		])
	).slice(0, 16);

	const chunks = buildLearnArticleChunks({
		title,
		summary: `${summary} ${readerSummary}`,
		bodyMarkdown,
		categoryName: SAFETY_REPORT_CATEGORY_NAME,
		signals,
		maxChunkChars: 950
	});

	const timestamp = buildReportTimestamp(report?.meta);
	const record = {
		title,
		slug: SAFETY_REPORT_SLUG,
		summary,
		body_markdown: bodyMarkdown,
		editor_mode: 'markdown',
		category_slug: SAFETY_REPORT_CATEGORY_SLUG,
		category_name: SAFETY_REPORT_CATEGORY_NAME,
		subcategory_slug: null,
		subcategory_name: null,
		import_source_path: SAFETY_REPORT_SOURCE_PATH,
		cover_image_url: '/reports/safer-cycling-better-messages/figures/passing.webp',
		is_published: true,
		reader_summary: readerSummary,
		key_takeaways: keyTakeaways,
		tags: signals.tags,
		audience: signals.audience,
		difficulty_level: signals.difficulty_level,
		ride_type: signals.ride_type,
		geo_scope: signals.geo_scope,
		geo_city: signals.geo_city,
		geo_state: signals.geo_state,
		content_type: 'safety',
		is_evergreen: true,
		metadata_confidence: 0.95,
		article_embedding: signals.embedding_literal
	};

	const card = {
		id: SAFETY_REPORT_FALLBACK_ID,
		title: record.title,
		slug: record.slug,
		summary: record.summary,
		reader_summary: record.reader_summary,
		key_takeaways: record.key_takeaways,
		card_excerpt: buildLearnCardExcerpt(record),
		category_slug: record.category_slug,
		category_name: record.category_name,
		subcategory_slug: null,
		subcategory_name: null,
		sort_order: 0,
		cover_image_url: record.cover_image_url,
		content_type: 'safety',
		tags: record.tags,
		audience: record.audience,
		difficulty_level: record.difficulty_level,
		ride_type: record.ride_type,
		geo_scope: record.geo_scope,
		geo_city: record.geo_city,
		geo_state: record.geo_state,
		is_evergreen: true,
		metadata_confidence: record.metadata_confidence,
		article_embedding: record.article_embedding,
		import_source_path: SAFETY_REPORT_SOURCE_PATH,
		is_published: true,
		created_at: timestamp,
		updated_at: timestamp,
		created_by_user_id: null,
		updated_by_user_id: null,
		last_revision_number: 1
	};

	const entry = {
		record,
		card,
		chunks: chunks.map((chunk, idx) => ({
			...chunk,
			id: `${SAFETY_REPORT_FALLBACK_ID}-chunk-${idx}`,
			article_id: SAFETY_REPORT_FALLBACK_ID
		})),
		signals
	};

	if (report === safetyReport) {
		cachedCatalogEntry = entry;
	}
	return entry;
}

export function mergeSafetyReportIntoCatalog(articles = [], { categorySlug = null } = {}) {
	const list = Array.isArray(articles) ? [...articles] : [];
	if (categorySlug && safeTrim(categorySlug).toLowerCase() !== SAFETY_REPORT_CATEGORY_SLUG) {
		return list;
	}
	const existingIndex = list.findIndex((item) => isProtectedLearnCatalogArticle(item));
	const { card } = buildSafetyReportCatalogEntry();

	if (existingIndex >= 0) {
		const existing = list[existingIndex];
		list[existingIndex] = {
			...card,
			...existing,
			slug: SAFETY_REPORT_SLUG,
			content_type: 'safety',
			summary: existing.summary || card.summary,
			reader_summary: existing.reader_summary || card.reader_summary,
			key_takeaways:
				Array.isArray(existing.key_takeaways) && existing.key_takeaways.length
					? existing.key_takeaways
					: card.key_takeaways,
			card_excerpt: buildLearnCardExcerpt({
				...card,
				...existing,
				summary: existing.summary || card.summary,
				reader_summary: existing.reader_summary || card.reader_summary
			})
		};
		return list;
	}

	return [card, ...list];
}

export async function resolveLearnCatalogSyncUserId(supabase, preferredUserId = null) {
	if (preferredUserId) return preferredUserId;
	if (!supabase) return null;

	const { data: existingArticle } = await supabase
		.from('learn_articles')
		.select('created_by_user_id, updated_by_user_id')
		.limit(1)
		.maybeSingle();
	if (existingArticle?.updated_by_user_id || existingArticle?.created_by_user_id) {
		return existingArticle.updated_by_user_id || existingArticle.created_by_user_id;
	}

	const { data: adminProfile } = await supabase
		.from('profiles')
		.select('user_id')
		.eq('admin', true)
		.limit(1)
		.maybeSingle();
	return adminProfile?.user_id || null;
}

export async function syncSafetyReportToDatabase(supabase, { userId = null } = {}) {
	if (!supabase) return null;
	const authorUserId = await resolveLearnCatalogSyncUserId(supabase, userId);
	if (!authorUserId) {
		return null;
	}

	const { record, chunks } = buildSafetyReportCatalogEntry();

	await supabase.from('learn_categories').upsert(
		{
			slug: SAFETY_REPORT_CATEGORY_SLUG,
			name: SAFETY_REPORT_CATEGORY_NAME
		},
		{ onConflict: 'slug' }
	);

	const { data: existing, error: lookupError } = await supabase
		.from('learn_articles')
		.select('id, sort_order, subcategory_slug, created_by_user_id')
		.eq('slug', SAFETY_REPORT_SLUG)
		.maybeSingle();
	if (lookupError) throw lookupError;

	let articleId = existing?.id || null;
	if (articleId) {
		const { error: updateError } = await supabase
			.from('learn_articles')
			.update({
				...record,
				sort_order: existing.sort_order ?? 0,
				subcategory_slug: existing.subcategory_slug ?? null,
				updated_by_user_id: authorUserId
			})
			.eq('id', articleId);
		if (updateError) throw updateError;
	} else {
		const { data: inserted, error: insertError } = await supabase
			.from('learn_articles')
			.insert({
				...record,
				created_by_user_id: authorUserId,
				updated_by_user_id: authorUserId
			})
			.select('id')
			.single();
		if (insertError) throw insertError;
		articleId = inserted.id;
	}

	await syncLearnArticleChunks(supabase, {
		articleId,
		chunks,
		userId: authorUserId
	});

	return { articleId, chunkCount: chunks.length };
}
