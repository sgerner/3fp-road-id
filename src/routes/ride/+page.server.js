import { getActivityClient } from '#lib/server/activities';
import { buildRideApiSearchParams, hasServerRideFilterParams } from '#lib/url/directoryUrlState';

export const load = async ({ url, fetch, cookies }) => {
	const apiSearchParams = buildRideApiSearchParams(url.searchParams);
	const apiQuery = apiSearchParams.toString();
	const ridesResponse = await fetch(apiQuery ? `/api/rides?${apiQuery}` : '/api/rides');
	const ridesPayload = await ridesResponse.json().catch(() => ({ data: [] }));
	const { user } = await getActivityClient(cookies);
	const rides = ridesPayload?.data ?? [];

	return {
		rides,
		ridesMeta: ridesPayload?.meta ?? null,
		totalAvailable:
			typeof ridesPayload?.meta?.total === 'number'
				? ridesPayload.meta.total
				: typeof ridesPayload?.count === 'number'
					? ridesPayload.count
					: rides.length,
		serverFiltered: hasServerRideFilterParams(url.searchParams),
		currentUser: user ?? null
	};
};
