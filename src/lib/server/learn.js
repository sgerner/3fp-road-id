import { error } from '@sveltejs/kit';
import { createRequestSupabaseClient, createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';
import {
	extractMarkdownHeadings,
	renderLearnMarkdown,
	splitMarkdownIntoSections
} from '$lib/learn/markdown';
import { estimateReadMinutes, generateLearnReadingAid } from '$lib/learn/readingAid';

export const LEARN_EDITOR_MODES = ['wysiwyg', 'markdown'];

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

export function normalizeLearnCategory(categoryName) {
	const label = safeTrim(categoryName) || 'General';
	return {
		name: label,
		slug: slugifyLearn(label) || 'general'
	};
}

export function getLearnClient(cookies) {
	const { accessToken, user } = resolveSession(cookies);
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

export function requireLearnUser(cookies) {
	const { user, supabase } = getLearnClient(cookies);
	if (!user?.id) {
		throw error(401, 'Authentication required.');
	}
	return { user, supabase };
}

export async function ensureUniqueLearnSlug(supabase, source, excludeId = null) {
	const base = slugifyLearn(source) || 'article';
	let attempt = 0;
	let candidate = base;

	while (attempt < 50) {
		let query = supabase.from('learn_articles').select('id', { count: 'exact', head: true }).eq('slug', candidate);
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

export function withLearnReadingAid(payload) {
	const readingAid = generateLearnReadingAid({
		title: payload.title,
		summary: payload.summary,
		markdown: payload.body_markdown
	});

	return {
		...payload,
		reader_summary: readingAid.readerSummary,
		key_takeaways: readingAid.keyTakeaways
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
		.from('profiles')
		.select('user_id, full_name, email, avatar_url')
		.in('user_id', uniqueIds);

	if (queryError) throw queryError;
	return new Map((data ?? []).map((profile) => [profile.user_id, profile]));
}

export async function buildLearnArticleView(article, { revisions = [], comments = [], assets = [], profiles = new Map() } = {}) {
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
