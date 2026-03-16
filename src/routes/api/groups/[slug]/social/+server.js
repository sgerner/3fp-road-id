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

function deriveSourcePostFromComment(comment) {
	const source = comment?.raw_payload?.source_post;
	if (!source || typeof source !== 'object') return null;
	const sourceImage =
		source.full_picture ||
		source.picture ||
		source.attachments?.data?.[0]?.media?.image?.src ||
		source.attachments?.data?.[0]?.media?.source ||
		source.attachments?.data?.[0]?.subattachments?.data?.[0]?.media?.image?.src ||
		source.attachments?.data?.[0]?.subattachments?.data?.[0]?.media?.source ||
		null;
	return {
		id: source.id || null,
		caption: source.message || null,
		image_url: sourceImage,
		permalink_url: source.permalink_url || null,
		created_at: source.created_time || null,
		origin: 'source_payload'
	};
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
		const postsById = new Map(posts.map((post) => [String(post.id), post]));
		const hydratedComments = comments.map((comment) => ({
			...comment,
			replies: repliesByComment.get(String(comment.id)) || [],
			linked_post: (() => {
				const socialPostId = String(comment?.social_post_id || '');
				if (socialPostId && postsById.has(socialPostId)) {
					const post = postsById.get(socialPostId);
					const firstMedia = Array.isArray(post?.media) ? post.media[0] : null;
					return {
						id: post.id,
						caption: post.caption || null,
						image_url: firstMedia?.url || firstMedia?.public_url || firstMedia || null,
						permalink_url: null,
						created_at: post.created_at || null,
						origin: 'group_social_post'
					};
				}
				return deriveSourcePostFromComment(comment);
			})()
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
