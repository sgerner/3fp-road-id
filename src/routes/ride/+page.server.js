import { getActivityClient } from '$lib/server/activities';

export const load = async ({ fetch, cookies }) => {
	const ridesResponse = await fetch('/api/rides');
	const ridesPayload = await ridesResponse.json().catch(() => ({ data: [] }));
	const { user } = getActivityClient(cookies);

	return {
		rides: ridesPayload?.data ?? [],
		currentUser: user ?? null
	};
};
