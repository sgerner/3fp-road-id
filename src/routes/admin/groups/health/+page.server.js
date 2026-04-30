import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';

export async function load({ fetch, url, cookies }) {
	await requireAdmin(cookies);

	const windowDays = url.searchParams.get('window_days') || '30';
	const apiUrl = `/api/admin/groups/health?window_days=${encodeURIComponent(windowDays)}&limit=0`;

	const res = await fetch(apiUrl);

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
