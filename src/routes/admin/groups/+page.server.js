import { requireAdmin } from '$lib/server/admin';

export async function load({ cookies }) {
	await requireAdmin(cookies);
	return {};
}
