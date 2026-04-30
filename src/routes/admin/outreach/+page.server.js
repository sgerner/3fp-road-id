import { redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';

export async function load({ cookies }) {
	await requireAdmin(cookies);
	throw redirect(302, '/admin/groups/outreach');
}
