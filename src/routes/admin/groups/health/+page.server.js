import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';

export async function load({ fetch, url, cookies }) {
	await requireAdmin(cookies);

	const windowDays = url.searchParams.get('window_days') || '30';

	const apiUrl = new URL('/api/admin/groups/health', url.origin);
	apiUrl.searchParams.set('window_days', windowDays);
	// We set limit=0 to get all groups for client-side search/pagination
	apiUrl.searchParams.set('limit', '0');

	const res = await fetch(apiUrl.toString());

	if (!res.ok) {
		const errData = await res.json().catch(() => ({}));
		throw error(res.status, errData.error || 'Failed to load group health data');
	}

	const healthData = await res.json();

	return {
		healthData,
		windowDays: Number.parseInt(windowDays, 10)
	};
}
