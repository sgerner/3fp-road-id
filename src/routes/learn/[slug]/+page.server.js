import { error, fail } from '@sveltejs/kit';
import {
	buildLearnArticleView,
	getLearnArticleBySlug,
	getLearnClient,
	getLearnProfilesMap
} from '$lib/server/learn';

export const load = async ({ params, url, cookies }) => {
	const { user, supabase } = getLearnClient(cookies);
	const article = await getLearnArticleBySlug(supabase, params.slug);

	if (!article) {
		throw error(404, 'Article not found.');
	}

	const revisionId = url.searchParams.get('revision');

	const [{ data: revisions, error: revisionsError }, { data: comments, error: commentsError }, { data: assets, error: assetsError }, { data: related, error: relatedError }] =
		await Promise.all([
			supabase
				.from('learn_article_revisions')
				.select('*')
				.eq('article_id', article.id)
				.order('revision_number', { ascending: false }),
			supabase
				.from('learn_comments')
				.select('*')
				.eq('article_id', article.id)
				.order('created_at', { ascending: true }),
			supabase
				.from('learn_assets')
				.select('*')
				.eq('article_id', article.id)
				.order('created_at', { ascending: false }),
			supabase
				.from('learn_articles')
				.select('id, title, slug, summary, category_name, updated_at')
				.eq('category_slug', article.category_slug)
				.neq('id', article.id)
				.eq('is_published', true)
				.order('updated_at', { ascending: false })
				.limit(4)
		]);

	if (revisionsError) throw revisionsError;
	if (commentsError) throw commentsError;
	if (assetsError) throw assetsError;
	if (relatedError) throw relatedError;

	const requestedRevision = revisionId ? (revisions ?? []).find((item) => item.id === revisionId) : null;
	const articleForDisplay = requestedRevision
		? {
				...article,
				title: requestedRevision.title,
				summary: requestedRevision.summary,
				body_markdown: requestedRevision.body_markdown,
				editor_mode: requestedRevision.editor_mode,
				category_slug: requestedRevision.category_slug,
				category_name: requestedRevision.category_name,
				cover_image_url: requestedRevision.cover_image_url,
				updated_at: requestedRevision.created_at,
				updated_by_user_id: requestedRevision.created_by_user_id
			}
		: article;

	const profiles = await getLearnProfilesMap(
		supabase,
		[
			article.created_by_user_id,
			article.updated_by_user_id,
			...(revisions ?? []).map((item) => item.created_by_user_id),
			...(comments ?? []).map((item) => item.author_user_id),
			...(assets ?? []).map((item) => item.uploaded_by_user_id)
		]
	);

	return {
		currentUser: user ?? null,
		canEdit: Boolean(user),
		viewingRevision: requestedRevision
			? {
					id: requestedRevision.id,
					revisionNumber: requestedRevision.revision_number,
					createdAt: requestedRevision.created_at,
					profile: profiles.get(requestedRevision.created_by_user_id) ?? null
				}
			: null,
		article: await buildLearnArticleView(articleForDisplay, {
			revisions,
			comments,
			assets,
			profiles
		}),
		relatedArticles: related ?? []
	};
};

export const actions = {
	comment: async ({ request, cookies, params }) => {
		const { user, supabase } = getLearnClient(cookies);
		if (!user?.id) {
			return fail(401, { commentError: 'Sign in to leave a comment.' });
		}

		const formData = await request.formData();
		const bodyMarkdown = String(formData.get('bodyMarkdown') || '').trim();

		if (!bodyMarkdown) {
			return fail(400, { commentError: 'Comment text is required.' });
		}

		const article = await getLearnArticleBySlug(supabase, params.slug);
		if (!article) {
			throw error(404, 'Article not found.');
		}

		const { error: insertError } = await supabase.from('learn_comments').insert({
			article_id: article.id,
			author_user_id: user.id,
			body_markdown: bodyMarkdown
		});

		if (insertError) {
			return fail(400, { commentError: insertError.message });
		}

		return { commentSuccess: true };
	}
};
