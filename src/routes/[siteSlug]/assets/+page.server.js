import { error } from '@sveltejs/kit';
import { loadGroupMicrosite } from '$lib/server/groupSites';

export const load = async ({ params, fetch, url, locals }) => {
	const site = await loadGroupMicrosite({
		siteSlug: params.siteSlug,
		fetch,
		url,
		publicPathname: locals?.micrositePublicPathname || url.pathname
	});

	if (!site) {
		throw error(404, 'Microsite not found.');
	}

	return {
		site,
		basePath: site.basePath || ''
	};
};
