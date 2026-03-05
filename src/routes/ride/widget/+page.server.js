import { getActivityClient } from '$lib/server/activities';

function uniqOrganizations(rows = []) {
	const seen = new Set();
	return rows
		.map((row) => ({
			slug: row?.slug || '',
			name: row?.name || '',
			city: row?.city || '',
			state: row?.state_region || ''
		}))
		.filter((row) => {
			if (!row.slug || !row.name || seen.has(row.slug)) return false;
			seen.add(row.slug);
			return true;
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export const load = async ({ cookies, fetch, url }) => {
	const { supabase } = getActivityClient(cookies);
	let organizations = [];

	const { data: groupRows, error: groupError } = await supabase
		.from('groups')
		.select('slug,name,city,state_region')
		.order('name', { ascending: true })
		.limit(400);

	if (!groupError) {
		organizations = uniqOrganizations(groupRows);
	}

	if (!organizations.length) {
		const ridesResponse = await fetch('/api/rides');
		const ridesPayload = await ridesResponse.json().catch(() => ({ data: [] }));
		const fromRides = (ridesPayload?.data ?? []).map((ride) => ride?.group).filter(Boolean);
		organizations = uniqOrganizations(fromRides);
	}

	return {
		organizations,
		origin: url.origin
	};
};
