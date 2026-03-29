import { loadMicrositeNewsViews } from '$lib/server/groupSites';

export const load = async ({ parent, url }) => {
	const parentData = await parent();
	const posts = await loadMicrositeNewsViews(parentData.site.group.id);
	const requestedSlug = (url.searchParams.get('open') || '').trim();
	const initialOpenSlug = posts.some((post) => post.slug === requestedSlug) ? requestedSlug : '';

	return {
		isMicrosite: true,
		site: parentData.site,
		posts,
		initialOpenSlug
	};
};

