import { loadMicrositeNewsArchive } from '$lib/server/groupSites';

export const load = async ({ parent, url }) => {
	const parentData = await parent();
	const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
	const search = url.searchParams.get('q') || '';
	const requestedSlug = (url.searchParams.get('open') || '').trim();
	const archive = await loadMicrositeNewsArchive(parentData.site.group.id, {
		page: requestedPage,
		pageSize: 24,
		search,
		openSlug: requestedSlug
	});
	const totalPages = Math.max(1, Math.ceil(archive.totalCount / archive.pageSize));
	const normalizedPage = requestedPage > totalPages ? totalPages : requestedPage;
	const finalArchive =
		normalizedPage === archive.page
			? archive
			: await loadMicrositeNewsArchive(parentData.site.group.id, {
					page: normalizedPage,
					pageSize: archive.pageSize,
					search,
					openSlug: requestedSlug
				});
	const initialOpenSlug = finalArchive.openPost?.slug || '';

	return {
		isMicrosite: true,
		site: parentData.site,
		...finalArchive,
		initialOpenSlug
	};
};
