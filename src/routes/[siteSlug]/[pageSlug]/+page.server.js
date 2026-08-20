import { error } from '@sveltejs/kit';
import { groupSitePageBySlug } from '$lib/microsites/pages';

export const load = async ({ parent, params }) => {
	const data = await parent();
	const currentPage = groupSitePageBySlug(data.site?.siteConfig?.site_pages, params.pageSlug);
	if (!currentPage || currentPage.is_home) throw error(404, 'Website page not found.');
	return { ...data, currentPage };
};
