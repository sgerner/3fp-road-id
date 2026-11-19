import { fail, redirect } from '@sveltejs/kit';
import {
	getLearnArticleBySlug,
	getLearnClient,
	listLearnAssetsForArticle,
	requireLearnUser,
	learnFormDataValues
} from '#lib/server/learn';
import { loadLearnEditorOptions, prepareLearnArticleSave } from '#lib/server/learnEditor';
import { syncLearnArticleChunks } from '#lib/server/learnDiscovery';

export const load = async ({ params, url, cookies }) => {
	const { user, supabase } = await getLearnClient(cookies);
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

	const [editorOptions, articleAssets] = await Promise.all([
		loadLearnEditorOptions(supabase, user.id),
		listLearnAssetsForArticle(supabase, article.id)
	]);

	return {
		currentUser: user,
		...editorOptions,
		articleAssets,
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
	default: async (event) => {
		const { request, cookies, params } = event;
		let values = null;
		try {
			const { user, supabase } = await requireLearnUser(cookies);
			const article = await getLearnArticleBySlug(supabase, params.slug);
			if (!article) {
				throw redirect(303, '/learn');
			}

			const formData = await request.formData();
			values = learnFormDataValues(formData);
			const { record, chunks } = await prepareLearnArticleSave(event, {
				supabase,
				user,
				formData,
				articleId: article.id
			});

			const { data, error: updateError } = await supabase
				.from('learn_articles')
				.update({
					...record,
					updated_by_user_id: user.id
				})
				.eq('id', article.id)
				.select('id,slug')
				.single();

			if (updateError) {
				return fail(400, {
					error: updateError.message,
					values
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
				error: actionError?.body?.message || actionError?.message || 'Unable to update article.',
				...(values ? { values } : {})
			});
		}
	}
};
