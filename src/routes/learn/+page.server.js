import {
	getLearnClient,
	getLearnProfilesMap,
	listPublishedLearnArticles
} from '#lib/server/learn.js';
import { sanitizeLearnSearchQuery, searchLearnArticles } from '#lib/server/learnSearch.js';

export const load = async ({ cookies, url }) => {
	const { user, supabase } = await getLearnClient(cookies);
	const initialQuery = sanitizeLearnSearchQuery(url.searchParams.get('q') ?? '');
	const initialCategory = (url.searchParams.get('category') ?? '').trim();

	const [articles, searchResult] = await Promise.all([
		listPublishedLearnArticles(supabase),
		initialQuery ? searchLearnArticles({ supabase, query: initialQuery }) : Promise.resolve(null)
	]);

	const profileUserIds = [
		...articles.flatMap((article) => [article.created_by_user_id, article.updated_by_user_id]),
		...(searchResult?.articles ?? []).flatMap((article) => [
			article.created_by_user_id,
			article.updated_by_user_id
		])
	];
	const profiles = await getLearnProfilesMap(supabase, profileUserIds);

	const attachProfiles = (article) => ({
		...article,
		authorProfile: profiles.get(article.created_by_user_id) ?? null,
		editorProfile: profiles.get(article.updated_by_user_id) ?? null
	});

	return {
		currentUser: user ?? null,
		initialQuery,
		initialCategory: initialCategory || 'all',
		initialSearchResults: searchResult ? searchResult.articles.map(attachProfiles) : null,
		articles: articles.map(attachProfiles)
	};
};
