import { fail, redirect } from '@sveltejs/kit';
import {
	ensureUniqueLearnSlug,
	getLearnArticleBySlug,
	getLearnClient,
	listLearnAssetsForArticle,
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

export const load = async ({ params, url, cookies }) => {
	const { user, supabase } = getLearnClient(cookies);
	if (!user) {
		throw redirect(
			303,
			`/learn/${params.slug}?auth=required&returnTo=${encodeURIComponent(url.pathname)}`
		);
	}

	const article = await getLearnArticleBySlug(supabase, params.slug);
	if (!article) {
		throw redirect(303, '/learn');
	}

	const fromRevisionId = url.searchParams.get('fromRevision');
	let revision = null;

	if (fromRevisionId) {
		const { data } = await supabase
			.from('learn_article_revisions')
			.select('*')
			.eq('article_id', article.id)
			.eq('id', fromRevisionId)
			.maybeSingle();
		revision = data ?? null;
	}

	const source = revision || article;

	const [{ data: categories }, { data: subcategories }, articleAssets, recentAssets] =
		await Promise.all([
			supabase.from('learn_categories').select('slug, name').order('name'),
			supabase.from('learn_subcategories').select('slug, name, category_slug').order('sort_order'),
			listLearnAssetsForArticle(supabase, article.id),
			listLearnRecentAssets(supabase, { uploadedByUserId: user.id })
		]);

	return {
		currentUser: user,
		categories: categories ?? [],
		subcategories: subcategories ?? [],
		articleAssets,
		recentAssets,
		article: {
			id: article.id,
			slug: article.slug,
			title: article.title
		},
		initialValues: {
			title: source.title,
			slug: source.slug,
			summary: source.summary || '',
			bodyMarkdown: source.body_markdown,
			editorMode: source.editor_mode,
			categoryName: source.category_name,
			subcategorySlug: source.subcategory_slug || '',
			coverImageUrl: source.cover_image_url || ''
		}
	};
};

export const actions = {
	default: async ({ request, cookies, params }) => {
		try {
			const { user, supabase } = requireLearnUser(cookies);
			const article = await getLearnArticleBySlug(supabase, params.slug);
			if (!article) {
				throw redirect(303, '/learn');
			}

			const formData = await request.formData();
			const payload = withLearnReadingAid(normalizeLearnPayload(formData));
			const signals = inferLearnArticleSearchSignals({
				title: payload.title,
				summary: payload.summary || '',
				bodyMarkdown: payload.body_markdown,
				categoryName: payload.category_name,
				subcategoryName: payload.subcategory_name || ''
			});
			const slug = await ensureUniqueLearnSlug(supabase, payload.slug || payload.title, article.id);
			const chunks = buildLearnArticleChunks({
				title: payload.title,
				summary: payload.summary || '',
				bodyMarkdown: payload.body_markdown,
				categoryName: payload.category_name,
				signals
			});

			const { data, error: updateError } = await supabase
				.from('learn_articles')
				.update({
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
					updated_by_user_id: user.id
				})
				.eq('id', article.id)
				.select('id,slug')
				.single();

			if (updateError) {
				return fail(400, {
					error: updateError.message,
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
				error: actionError?.body?.message || actionError?.message || 'Unable to update article.'
			});
		}
	}
};
