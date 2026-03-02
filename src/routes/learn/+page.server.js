import { getLearnClient, getLearnProfilesMap, listPublishedLearnArticles } from '$lib/server/learn';

export const load = async ({ cookies }) => {
	const { user, supabase } = getLearnClient(cookies);
	const articles = await listPublishedLearnArticles(supabase);
	const profiles = await getLearnProfilesMap(
		supabase,
		articles.flatMap((article) => [article.created_by_user_id, article.updated_by_user_id])
	);

	return {
		currentUser: user ?? null,
		articles: articles.map((article) => ({
			...article,
			authorProfile: profiles.get(article.created_by_user_id) ?? null,
			editorProfile: profiles.get(article.updated_by_user_id) ?? null
		}))
	};
};
