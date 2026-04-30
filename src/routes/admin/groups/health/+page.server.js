import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';

export async function load({ fetch, url, cookies }) {
	await requireAdmin(cookies);

	const windowDays = url.searchParams.get('window_days') || '30';
	const limit = url.searchParams.get('limit') || '100';

	const apiUrl = new URL('/api/admin/groups/health', url.origin);
	apiUrl.searchParams.set('window_days', windowDays);
	apiUrl.searchParams.set('limit', limit);

	const res = await fetch(apiUrl.toString());

	if (!res.ok) {
		const errData = await res.json().catch(() => ({}));
		throw error(res.status, errData.error || 'Failed to load group health data');
	}

	const healthData = await res.json();

	return {
		healthData,
		windowDays: Number.parseInt(windowDays, 10),
		limit: Number.parseInt(limit, 10)
	};
}
