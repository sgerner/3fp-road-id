import { json } from '@sveltejs/kit';
import {
	listGroupSocialOauthPendingConnections,
	listGroupSocialAccounts,
	listGroupSocialCommentReplies,
	listGroupSocialComments,
	listGroupSocialPosts,
	serializeSocialPost,
	summarizeSocialAccount
} from '$lib/server/social/db';
import { requireGroupSocialManager } from '$lib/server/social/permissions';
import { SOCIAL_SCHEDULING_INTERVAL_MINUTES } from '$lib/server/social/types';

function buildReplyMap(replies = []) {
	const map = new Map();
	for (const reply of replies) {
		const key = String(reply.group_comment_id || '');
		if (!key) continue;
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(reply);
	}
	return map;
}

export async function GET({ cookies, params }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const [accounts, posts, comments, replies, pendingConnections] = await Promise.all([
			listGroupSocialAccounts(auth.serviceSupabase, auth.group.id).then((rows) =>
				rows.map(summarizeSocialAccount)
			),
			listGroupSocialPosts(auth.serviceSupabase, auth.group.id, { limit: 120 }).then((rows) =>
				rows.map(serializeSocialPost)
			),
			listGroupSocialComments(auth.serviceSupabase, auth.group.id, { limit: 120 }),
			listGroupSocialCommentReplies(auth.serviceSupabase, auth.group.id, { limit: 300 }),
			listGroupSocialOauthPendingConnections(auth.serviceSupabase, {
				groupId: auth.group.id,
				userId: auth.userId
			})
		]);

		const repliesByComment = buildReplyMap(replies);
		const hydratedComments = comments.map((comment) => ({
			...comment,
			replies: repliesByComment.get(String(comment.id)) || []
		}));

		return json({
			data: {
				group: auth.group,
				schedule_interval_minutes: SOCIAL_SCHEDULING_INTERVAL_MINUTES,
				accounts,
				pending_connections: pendingConnections,
				posts,
				comments: hydratedComments
			}
		});
	} catch (error) {
		console.error('Unable to load group social dashboard', error);
		return json({ error: error?.message || 'Unable to load social dashboard.' }, { status: 500 });
	}
}
