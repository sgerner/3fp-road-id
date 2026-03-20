import { redirect } from '@sveltejs/kit';

export const load = async ({ params, url }) => {
	const search = new URLSearchParams(url.searchParams);
	search.set('edit', params.newsSlug);
	throw redirect(
		303,
		`/groups/${params.slug}/manage/news${search.toString() ? `?${search.toString()}` : ''}`
	);
};
