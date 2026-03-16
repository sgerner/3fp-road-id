import { json } from '@sveltejs/kit';
import { syncGroupSocialComments } from '$lib/server/social/comments';
import { requireGroupSocialManager } from '$lib/server/social/permissions';
import { normalizePlatform } from '$lib/server/social/types';

export async function POST({ cookies, params, request }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const payload = await request.json().catch(() => ({}));
		const limit = Number.parseInt(String(payload.limit ?? '60'), 10) || 60;
		const platform = normalizePlatform(payload?.platform);
		const result = await syncGroupSocialComments(auth.serviceSupabase, auth.group.id, {
			limit,
			platforms: platform ? [platform] : []
		});
		return json({ data: result });
	} catch (error) {
		console.error('Unable to sync social comments', error);
		return json({ error: error?.message || 'Unable to sync comments.' }, { status: 500 });
	}
}
