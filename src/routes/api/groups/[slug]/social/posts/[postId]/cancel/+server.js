import { json } from '@sveltejs/kit';
import {
	getGroupSocialPostById,
	serializeSocialPost,
	updateGroupSocialPost
} from '$lib/server/social/db';
import { requireGroupSocialManager } from '$lib/server/social/permissions';

const CANCELLABLE_STATUSES = new Set(['scheduled', 'queued']);

export async function POST({ cookies, params }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const post = await getGroupSocialPostById(
			auth.serviceSupabase,
			auth.group.id,
			params.postId || ''
		);
		if (!post) return json({ error: 'Post not found.' }, { status: 404 });
		if (!CANCELLABLE_STATUSES.has(post.status)) {
			return json({ error: `Post status '${post.status}' cannot be cancelled.` }, { status: 400 });
		}

		const updated = await updateGroupSocialPost(auth.serviceSupabase, auth.group.id, post.id, {
			status: 'cancelled',
			updated_by: auth.userId,
			last_publish_error: null
		});

		return json({ data: serializeSocialPost(updated) });
	} catch (error) {
		console.error('Unable to cancel social post', error);
		return json({ error: error?.message || 'Unable to cancel post.' }, { status: 500 });
	}
}
