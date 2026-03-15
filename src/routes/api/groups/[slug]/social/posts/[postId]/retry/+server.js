import { json } from '@sveltejs/kit';
import {
	getGroupSocialPostById,
	serializeSocialPost,
	updateGroupSocialPost
} from '$lib/server/social/db';
import { requireGroupSocialManager } from '$lib/server/social/permissions';
import { publishSingleGroupSocialPost } from '$lib/server/social/publish';

const RETRYABLE_STATUSES = new Set(['failed']);

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
		if (!RETRYABLE_STATUSES.has(post.status)) {
			return json({ error: `Post status '${post.status}' is not retryable.` }, { status: 400 });
		}
		if (Number(post.publish_attempts || 0) >= 3) {
			return json({ error: 'Post reached max publish attempts.' }, { status: 400 });
		}

		const staged = await updateGroupSocialPost(auth.serviceSupabase, auth.group.id, post.id, {
			status: 'publishing',
			updated_by: auth.userId,
			publish_attempts: Number(post.publish_attempts || 0) + 1,
			last_publish_error: null
		});

		const result = await publishSingleGroupSocialPost(auth.serviceSupabase, {
			groupId: auth.group.id,
			postId: post.id,
			post: staged,
			requestedBy: auth.userId
		});

		if (!result.ok && !result.partial) {
			return json(
				{
					error: 'Retry publish failed.',
					data: serializeSocialPost(result.post),
					results: result.results
				},
				{ status: 500 }
			);
		}

		return json({
			data: serializeSocialPost(result.post),
			partial: result.partial === true,
			results: result.results
		});
	} catch (error) {
		console.error('Unable to retry social post publish', error);
		return json({ error: error?.message || 'Unable to retry publish.' }, { status: 500 });
	}
}
