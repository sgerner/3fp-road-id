import { json } from '@sveltejs/kit';
import {
	deleteGroupSocialPost,
	getGroupSocialPostById,
	serializeSocialPost
} from '$lib/server/social/db';
import { requireGroupSocialManager } from '$lib/server/social/permissions';

const DELETABLE_STATUSES = new Set(['draft', 'scheduled']);

export async function DELETE({ cookies, params }) {
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
		if (!DELETABLE_STATUSES.has(post.status)) {
			return json(
				{ error: `Post status '${post.status}' cannot be deleted.` },
				{ status: 400 }
			);
		}

		await deleteGroupSocialPost(auth.serviceSupabase, auth.group.id, post.id);
		return json({ data: serializeSocialPost(post), deleted: true });
	} catch (error) {
		console.error('Unable to delete social post', error);
		return json({ error: error?.message || 'Unable to delete post.' }, { status: 500 });
	}
}
