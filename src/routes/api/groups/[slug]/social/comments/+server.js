import { json } from '@sveltejs/kit';
import {
	listGroupSocialCommentRepliesByCommentIds,
	listGroupSocialCommentsPage,
	listGroupSocialPosts,
	serializeSocialPost
} from '$lib/server/social/db';
import { requireGroupSocialManager } from '$lib/server/social/permissions';

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

function attachReplies(comments, replies, posts) {
	const replyMap = new Map();
	for (const reply of replies) {
		const key = String(reply.group_comment_id || '');
		if (!key) continue;
		if (!replyMap.has(key)) replyMap.set(key, []);
		replyMap.get(key).push(reply);
	}
	const postsById = new Map(posts.map((post) => [String(post.id), post]));
	return comments.map((comment) => ({
		...comment,
		replies: replyMap.get(String(comment.id)) || [],
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
}

export async function GET({ cookies, params, url }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const limit = Number.parseInt(url.searchParams.get('limit') || '20', 10);
		const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
		const commentsPage = await listGroupSocialCommentsPage(auth.serviceSupabase, auth.group.id, {
			limit,
			offset
		});
		const [replies, posts] = await Promise.all([
			listGroupSocialCommentRepliesByCommentIds(
				auth.serviceSupabase,
				auth.group.id,
				commentsPage.rows.map((comment) => comment.id),
				{ limit: 500 }
			),
			listGroupSocialPosts(auth.serviceSupabase, auth.group.id, { limit: 250 }).then((rows) =>
				rows.map(serializeSocialPost)
			)
		]);

		return json({
			data: {
				comments: attachReplies(commentsPage.rows, replies, posts),
				pagination: {
					total: commentsPage.total,
					limit: commentsPage.limit,
					offset: commentsPage.offset,
					has_more: commentsPage.has_more
				}
			}
		});
	} catch (error) {
		console.error('Unable to load social comments', error);
		return json({ error: error?.message || 'Unable to load comments.' }, { status: 500 });
	}
}
