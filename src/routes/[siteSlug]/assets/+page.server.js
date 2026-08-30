export const load = async ({ parent }) => {
	const { site } = await parent();
	return {
		site,
		basePath: site.basePath || ''
	};
};
