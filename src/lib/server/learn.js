import { error } from '@sveltejs/kit';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	extractMarkdownHeadings,
	renderLearnMarkdown,
	splitMarkdownIntoSections
} from '#lib/learn/markdown';
import { sanitizeAltText } from '#lib/learn/altText';
import { canManageLearnAsset, isLearnAdminUser } from '#lib/server/learnAiCore';
import { estimateReadMinutes, generateLearnReadingAid } from '#lib/learn/readingAid';

export { canManageLearnAsset };
export const isLearnAdmin = isLearnAdminUser;

const LEARN_EDITOR_MODES = ['wysiwyg', 'markdown'];

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function slugifyLearn(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function normalizeLearnCategory(categoryName) {
	const label = safeTrim(categoryName) || 'General';
	return {
		name: label,
		slug: slugifyLearn(label) || 'general'
	};
}

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

/**
 * @param {any} supabase
 * @param {string} source
 * @param {string | null} [excludeId]
 */
export async function ensureUniqueLearnSlug(supabase, source, excludeId = null) {
	const base = slugifyLearn(source) || 'article';
	let attempt = 0;
	let candidate = base;

	while (attempt < 50) {
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
		coverImageUrl: value('coverImageUrl', 2000),
		coverImageAlt: value('coverImageAlt', 150)
	};
}

export async function listPublishedLearnArticles(supabase) {
	const { data, error: queryError } = await supabase
		.from('learn_articles')
		.select(
			'id, title, slug, summary, category_slug, category_name, cover_image_url, updated_at, created_at, created_by_user_id, updated_by_user_id, last_revision_number'
		)
		.eq('is_published', true)
		.order('updated_at', { ascending: false });

	if (queryError) throw queryError;
	return data ?? [];
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

/**
 * @param {any} supabase
 * @param {object} [options]
 * @param {string} [options.articleId]
 * @param {string} [options.coverImageUrl]
 * @param {string} [options.coverImageAlt]
 * @param {any} [options.user]
 */
export async function syncLearnCoverAsset(
	supabase,
	{ articleId = '', coverImageUrl = '', coverImageAlt = '', user = null } = {}
) {
	const cleanUrl = safeTrim(coverImageUrl);
	if (!supabase || !articleId || !cleanUrl || !user?.id) return;

	const sanitizedCoverAlt = coverImageAlt
		? sanitizeAltText(coverImageAlt, { imageUrl: cleanUrl })
		: '';

	try {
		const { data: coverAsset } = await supabase
			.from('learn_assets')
			.select('id, uploaded_by_user_id, file_name')
			.eq('public_url', cleanUrl)
			.maybeSingle();

		if (!coverAsset) return;

		const isOwner = coverAsset.uploaded_by_user_id === user.id;
		const isAdmin = isOwner ? false : await isLearnAdminUser(supabase, user.id);
		if (canManageLearnAsset(coverAsset, user, { isAdmin })) {
			await supabase
				.from('learn_assets')
				.update({
					...(sanitizedCoverAlt ? { alt_text: sanitizedCoverAlt } : {}),
					article_id: articleId
				})
				.eq('id', coverAsset.id);
		}

		await supabase.from('learn_article_asset_links').upsert(
			{
				article_id: articleId,
				asset_id: coverAsset.id,
				created_by_user_id: user.id,
				usage_kind: 'cover'
			},
			{ onConflict: 'article_id,asset_id' }
		);
	} catch {
		// Non-fatal cover metadata and link sync.
	}
}

/**
 * @param {any} article
 * @param {object} [options]
 * @param {any[]} [options.revisions]
 * @param {any[]} [options.comments]
 * @param {any[]} [options.assets]
 * @param {Map<any, any>} [options.profiles]
 */
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

	const matchingCoverAsset = article?.cover_image_url
		? (assets || []).find((asset) => asset?.public_url === article.cover_image_url)
		: null;
	const coverImageAlt =
		sanitizeAltText(matchingCoverAsset?.alt_text || '', {
			fileName: matchingCoverAsset?.file_name || '',
			imageUrl: article?.cover_image_url || ''
		}) || safeTrim(article?.title);

	return {
		...article,
		coverImageAlt,
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
