import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';

export async function load({ fetch, url, cookies }) {
	await requireAdmin(cookies);

	const status = url.searchParams.get('status') || 'pending';
	const sort = url.searchParams.get('sort') || 'completeness';

	const apiUrl = new URL('/api/admin/groups/unclaimed', url.origin);
	apiUrl.searchParams.set('status', status);
	apiUrl.searchParams.set('sort', sort);

	let data = { groups: [], total: 0 };
	try {
		const res = await fetch(apiUrl.toString());
		if (res.ok) {
			data = await res.json();
		} else {
			const errData = await res.json().catch(() => ({}));
			console.error('Unclaimed API Error:', res.status, errData);
		}
	} catch (e) {
		console.error('Unclaimed Load Exception:', e);
	}

	// Calculate stats
	const stats = {
		pending: (data.groups || []).filter((g) => g.outreach_status === 'pending').length,
		contacted: (data.groups || []).filter((g) => g.outreach_status === 'contacted').length,
		avgCompleteness: data.groups?.length
			? Math.round(data.groups.reduce((acc, g) => acc + g.completeness, 0) / data.groups.length)
			: 0
	};

	return {
		groups: data.groups || [],
		total: data.total || 0,
		status,
		sort,
		stats
	};
}
