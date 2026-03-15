import { json } from '@sveltejs/kit';
import { listGroupSocialCommentReplies, listGroupSocialComments } from '$lib/server/social/db';
import { requireGroupSocialManager } from '$lib/server/social/permissions';

function attachReplies(comments, replies) {
	const replyMap = new Map();
	for (const reply of replies) {
		const key = String(reply.group_comment_id || '');
		if (!key) continue;
		if (!replyMap.has(key)) replyMap.set(key, []);
		replyMap.get(key).push(reply);
	}
	return comments.map((comment) => ({
		...comment,
		replies: replyMap.get(String(comment.id)) || []
	}));
}

export async function GET({ cookies, params, url }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const limit = Number.parseInt(url.searchParams.get('limit') || '120', 10);
		const [comments, replies] = await Promise.all([
			listGroupSocialComments(auth.serviceSupabase, auth.group.id, { limit }),
			listGroupSocialCommentReplies(auth.serviceSupabase, auth.group.id, { limit: 400 })
		]);

		return json({ data: attachReplies(comments, replies) });
	} catch (error) {
		console.error('Unable to load social comments', error);
		return json({ error: error?.message || 'Unable to load comments.' }, { status: 500 });
	}
}
