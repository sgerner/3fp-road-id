import { fail, redirect } from '@sveltejs/kit';
import {
	ensureUniqueLearnSlug,
	getLearnClient,
	listLearnRecentAssets,
	normalizeLearnPayload,
	requireLearnUser,
	withLearnReadingAid
} from '$lib/server/learn';
import {
	buildLearnArticleChunks,
	inferLearnArticleSearchSignals,
	syncLearnArticleChunks
} from '$lib/server/learnDiscovery';

export const load = async ({ cookies, url }) => {
	const { user, supabase } = getLearnClient(cookies);
	if (!user) {
		throw redirect(303, `/learn?auth=required&returnTo=${encodeURIComponent(url.pathname)}`);
	}

	const [{ data: categories }, { data: subcategories }, recentAssets] = await Promise.all([
		supabase.from('learn_categories').select('slug, name').order('name'),
		supabase.from('learn_subcategories').select('slug, name, category_slug').order('sort_order'),
		listLearnRecentAssets(supabase, { uploadedByUserId: user.id })
	]);

	return {
		currentUser: user,
		categories: categories ?? [],
		subcategories: subcategories ?? [],
		recentAssets,
		initialValues: {
			title: '',
			slug: '',
			summary: '',
			bodyMarkdown: '',
			editorMode: 'wysiwyg',
			categoryName: 'General',
			coverImageUrl: ''
		}
	};
};

export const actions = {
	default: async ({ request, cookies }) => {
		try {
			const { user, supabase } = requireLearnUser(cookies);
			const formData = await request.formData();
			const payload = withLearnReadingAid(normalizeLearnPayload(formData));
			const signals = inferLearnArticleSearchSignals({
				title: payload.title,
				summary: payload.summary || '',
				bodyMarkdown: payload.body_markdown,
				categoryName: payload.category_name,
				subcategoryName: payload.subcategory_name || ''
			});
			const slug = await ensureUniqueLearnSlug(supabase, payload.slug || payload.title);
			const chunks = buildLearnArticleChunks({
				title: payload.title,
				summary: payload.summary || '',
				bodyMarkdown: payload.body_markdown,
				categoryName: payload.category_name,
				signals
			});

			const { data, error: insertError } = await supabase
				.from('learn_articles')
				.insert({
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
					slug,
					created_by_user_id: user.id,
					updated_by_user_id: user.id,
					is_published: true
				})
				.select('id,slug')
				.single();

			if (insertError) {
				return fail(400, {
					error: insertError.message,
					values: {
						title: payload.title,
						slug: payload.slug,
						summary: payload.summary ?? '',
						bodyMarkdown: payload.body_markdown,
						editorMode: payload.editor_mode,
						categoryName: payload.category_name,
						coverImageUrl: payload.cover_image_url ?? ''
					}
				});
			}

			await syncLearnArticleChunks(supabase, {
				articleId: data.id,
				chunks,
				userId: user.id
			});

			throw redirect(303, `/learn/${data.slug}`);
		} catch (actionError) {
			if (actionError?.status === 303) throw actionError;

			return fail(actionError?.status || 400, {
				error: actionError?.body?.message || actionError?.message || 'Unable to create article.'
			});
		}
	}
};
