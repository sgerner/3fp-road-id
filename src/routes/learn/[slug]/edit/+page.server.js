import { fail, redirect } from '@sveltejs/kit';
import {
	ensureUniqueLearnSlug,
	getLearnArticleBySlug,
	getLearnClient,
	normalizeLearnPayload,
	requireLearnUser,
	withLearnReadingAid
} from '$lib/server/learn';

export const load = async ({ params, url, cookies }) => {
	const { user, supabase } = getLearnClient(cookies);
	if (!user) {
		throw redirect(303, `/learn/${params.slug}?auth=required&returnTo=${encodeURIComponent(url.pathname)}`);
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

	const [{ data: categories }, { data: subcategories }] = await Promise.all([
		supabase.from('learn_categories').select('slug, name').order('name'),
		supabase.from('learn_subcategories').select('slug, name, category_slug').order('sort_order')
	]);

	return {
		currentUser: user,
		categories: categories ?? [],
		subcategories: subcategories ?? [],
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
			const slug = await ensureUniqueLearnSlug(supabase, payload.slug || payload.title, article.id);

			const { data, error: updateError } = await supabase
				.from('learn_articles')
				.update({
					...payload,
					slug,
					updated_by_user_id: user.id
				})
				.eq('id', article.id)
				.select('slug')
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

			throw redirect(303, `/learn/${data.slug}`);
		} catch (actionError) {
			if (actionError?.status === 303) throw actionError;

			return fail(actionError?.status || 400, {
				error: actionError?.body?.message || actionError?.message || 'Unable to update article.'
			});
		}
	}
};
