import { error } from '@sveltejs/kit';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient.js';
import { resolveVerifiedSession } from '#lib/server/session.js';
import {
	extractMarkdownHeadings,
	renderLearnMarkdown,
	splitMarkdownIntoSections
} from '#lib/learn/markdown.js';
import { estimateReadMinutes, generateLearnReadingAid } from '#lib/learn/readingAid.js';
import {
	enrichLearnArticleCards,
	ensureUniqueLearnSlug,
	mergeSafetyReportIntoCatalog,
	normalizeLearnPayload,
	slugifyLearn
} from '#lib/server/learnCatalog.js';

export { enrichLearnArticleCards, ensureUniqueLearnSlug, normalizeLearnPayload, slugifyLearn };

export async function getLearnClient(cookies) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	return {
		user,
		supabase: createRequestSupabaseClient(accessToken)
	};
}

export function getLearnServiceClient() {
	const service = createServiceSupabaseClient();
	if (!service) {
		throw error(500, 'Supabase service role is not configured.');
	}
	return service;
}

export async function requireLearnUser(cookies) {
	const { user, supabase } = await getLearnClient(cookies);
	if (!user?.id) {
		throw error(401, 'Authentication required.');
	}
	return { user, supabase };
}

export function learnFormDataValues(formData) {
	const value = (key, limit = 80_000) => {
		const raw = formData.get(key);
		return typeof raw === 'string' ? raw.slice(0, limit) : '';
	};
	return {
		title: value('title', 300),
		slug: value('slug', 180),
		summary: value('summary', 1000),
		bodyMarkdown: value('bodyMarkdown'),
		editorMode: value('editorMode', 30) || 'wysiwyg',
		categoryName: value('categoryName', 120),
		subcategorySlug: value('subcategorySlug', 180),
		coverImageUrl: value('coverImageUrl', 2000)
	};
}

export async function listPublishedLearnArticles(supabase) {
	const { data, error: queryError } = await supabase
		.from('learn_articles')
		.select(
			'id, title, slug, summary, reader_summary, key_takeaways, category_slug, category_name, subcategory_slug, subcategory_name, sort_order, content_type, import_source_path, cover_image_url, updated_at, created_at, created_by_user_id, updated_by_user_id, last_revision_number'
		)
		.eq('is_published', true)
		.order('updated_at', { ascending: false });

	if (queryError) throw queryError;
	const enriched = await enrichLearnArticleCards(supabase, data ?? []);
	return mergeSafetyReportIntoCatalog(enriched);
}

export async function getLearnArticleBySlug(supabase, slug) {
	const { data, error: queryError } = await supabase
		.from('learn_articles')
		.select('*')
		.eq('slug', slug)
		.maybeSingle();

	if (queryError) throw queryError;
	return data;
}

export async function getLearnProfilesMap(supabase, userIds) {
	const uniqueIds = Array.from(new Set((userIds || []).filter(Boolean)));
	if (!uniqueIds.length) return new Map();

	const { data, error: queryError } = await supabase
		.from('public_profiles')
		.select('user_id, full_name, avatar_url')
		.in('user_id', uniqueIds);

	if (queryError) throw queryError;
	return new Map((data ?? []).map((profile) => [profile.user_id, profile]));
}

function normalizeLearnAssetRecord(asset) {
	if (!asset) return null;
	const base = asset.asset ? { ...asset.asset } : { ...asset };
	return {
		...base,
		link_id: asset.id ?? null,
		usage_kind: asset.usage_kind ?? 'attachment',
		sort_order: asset.sort_order ?? 0,
		linked_at: asset.created_at ?? base.created_at ?? null
	};
}

export async function listLearnAssetsForArticle(supabase, articleId) {
	if (!articleId) return [];

	const { data, error: queryError } = await supabase
		.from('learn_article_asset_links')
		.select('id, usage_kind, sort_order, created_at, asset:learn_assets(*)')
		.eq('article_id', articleId)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: true });

	if (queryError) throw queryError;
	return (data ?? []).map(normalizeLearnAssetRecord).filter(Boolean);
}

export async function listLearnRecentAssets(
	supabase,
	{ uploadedByUserId = null, limit = 18 } = {}
) {
	let query = supabase
		.from('learn_assets')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(limit);

	if (uploadedByUserId) {
		query = query.eq('uploaded_by_user_id', uploadedByUserId);
	}

	const { data, error: queryError } = await query;
	if (queryError) throw queryError;
	return (data ?? []).map(normalizeLearnAssetRecord).filter(Boolean);
}

export async function buildLearnArticleView(
	article,
	{ revisions = [], comments = [], assets = [], profiles = new Map() } = {}
) {
	const headings = extractMarkdownHeadings(article?.body_markdown || '');
	const { introMarkdown, sections } = splitMarkdownIntoSections(article?.body_markdown || '');
	const introHtml = introMarkdown ? await renderLearnMarkdown(introMarkdown, { headings }) : '';
	const bodyHtml = await renderLearnMarkdown(article?.body_markdown || '', { headings });
	const renderedSections = await Promise.all(
		sections.map(async (section) => {
			const sectionHeadings = extractMarkdownHeadings(section.markdown);
			const wordCount = section.markdown.split(/\s+/).filter(Boolean).length;
			return {
				...section,
				headings: sectionHeadings,
				html: await renderLearnMarkdown(section.markdown, { headings: sectionHeadings }),
				isCollapsible: wordCount > 180,
				wordCount
			};
		})
	);
	const readingAid = generateLearnReadingAid({
		title: article?.title,
		summary: article?.summary,
		markdown: article?.body_markdown
	});

	return {
		...article,
		bodyHtml,
		introHtml,
		headings,
		sections: renderedSections,
		hasStructuredSections: renderedSections.length > 0,
		readerSummary: article?.reader_summary || readingAid.readerSummary,
		keyTakeaways:
			Array.isArray(article?.key_takeaways) && article.key_takeaways.length
				? article.key_takeaways
				: readingAid.keyTakeaways,
		estimatedReadMinutes: estimateReadMinutes(article?.body_markdown || ''),
		authorProfile: profiles.get(article?.created_by_user_id) ?? null,
		editorProfile: profiles.get(article?.updated_by_user_id) ?? null,
		revisions: await Promise.all(
			(revisions || []).map(async (revision) => ({
				...revision,
				authorProfile: profiles.get(revision.created_by_user_id) ?? null,
				bodyHtml: await renderLearnMarkdown(revision.body_markdown || '')
			}))
		),
		comments: await Promise.all(
			(comments || []).map(async (comment) => ({
				...comment,
				authorProfile: profiles.get(comment.author_user_id) ?? null,
				bodyHtml: await renderLearnMarkdown(comment.body_markdown || '')
			}))
		),
		assets: (assets || []).map((asset) => ({
			...asset,
			uploadedByProfile: profiles.get(asset.uploaded_by_user_id) ?? null
		}))
	};
}
