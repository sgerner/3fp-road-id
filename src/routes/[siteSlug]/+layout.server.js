import { error } from '@sveltejs/kit';
import { loadGroupMicrosite } from '$lib/server/groupSites';

export const load = async ({ params, fetch, url, locals, setHeaders }) => {
	const site = await loadGroupMicrosite({
		siteSlug: params.siteSlug,
		fetch,
		url,
		publicPathname: locals?.micrositePublicPathname || url.pathname
	});

	if (!site) {
		throw error(404, 'Microsite not found.');
	}

	setHeaders({
		'cache-control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=3600'
	});

	return {
		isMicrosite: true,
		site
	};
};
