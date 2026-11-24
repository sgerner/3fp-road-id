import { ensureUniqueLearnSlug, listLearnRecentAssets, normalizeLearnPayload } from './learn';
import { withLearnAiReadingAid } from './learnAi';
import { enforceRateLimit } from './security';
import { buildLearnArticleChunks, inferLearnArticleSearchSignals } from './learnDiscovery';

export async function loadLearnEditorOptions(supabase, userId) {
	const [{ data: categories }, { data: subcategories }, recentAssets] = await Promise.all([
		supabase.from('learn_categories').select('slug, name').order('name'),
		supabase.from('learn_subcategories').select('slug, name, category_slug').order('sort_order'),
		listLearnRecentAssets(supabase, { uploadedByUserId: userId })
	]);

	return { categories: categories ?? [], subcategories: subcategories ?? [], recentAssets };
}

/**
 * @param {any} event
 * @param {{ supabase: any, user: any, formData: FormData, articleId?: string | null }} options
 */
export async function prepareLearnArticleSave(
	event,
	{ supabase, user, formData, articleId = null }
) {
	const normalized = normalizeLearnPayload(formData);
	const userLimited = enforceRateLimit(event, {
		name: 'learn-ai-save-user',
		key: user.id,
		limit: 12,
		windowMs: 60 * 60 * 1000
	});
	const aiAllowed = !userLimited;
	const payload = await withLearnAiReadingAid(normalized, { generateAi: aiAllowed });
	const signals = inferLearnArticleSearchSignals({
		title: payload.title,
		summary: payload.summary || '',
		bodyMarkdown: payload.body_markdown,
		categoryName: payload.category_name,
		subcategoryName: payload.subcategory_name || ''
	});
	const slug = await ensureUniqueLearnSlug(supabase, payload.slug || payload.title, articleId);
	const chunks = buildLearnArticleChunks({
		title: payload.title,
		summary: payload.summary || '',
		bodyMarkdown: payload.body_markdown,
		categoryName: payload.category_name,
		signals
	});
	return {
		record: {
			...payload,
			tags: signals.tags,
			audience: signals.audience,
			difficulty_level: signals.difficulty_level,
			ride_type: signals.ride_type,
			geo_scope: signals.geo_scope,
			geo_city: signals.geo_city,
			geo_state: signals.geo_state,
			content_type: signals.content_type,
			is_evergreen: signals.is_evergreen,
			metadata_confidence: signals.metadata_confidence,
			article_embedding: signals.embedding_literal,
			slug
		},
		chunks
	};
}
