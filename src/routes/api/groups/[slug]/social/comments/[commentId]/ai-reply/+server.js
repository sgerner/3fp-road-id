import { json } from '@sveltejs/kit';
import { getGroupSocialCommentById } from '$lib/server/social/db';
import { generateGroupSocialCommentReplyDraft } from '$lib/server/social/ai';
import { requireGroupSocialManager } from '$lib/server/social/permissions';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

export async function POST({ cookies, params, request }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const comment = await getGroupSocialCommentById(
			auth.serviceSupabase,
			auth.group.id,
			params.commentId || ''
		);
		if (!comment) {
			return json({ error: 'Comment not found.' }, { status: 404 });
		}

		const payload = await request.json().catch(() => ({}));
		const result = await generateGroupSocialCommentReplyDraft({
			group_name: auth.group.name,
			platform: cleanText(comment.platform, 40),
			comment_text: cleanText(comment.body, 1800),
			post_caption: cleanText(comment?.raw_payload?.source_post?.message, 1800),
			post_context: cleanText(comment?.raw_payload?.source_post?.permalink_url, 600),
			target_tone: cleanText(payload?.target_tone, 120)
		});

		if (!result.ok) {
			return json({ error: result.error || 'Unable to generate comment reply.' }, { status: 503 });
		}

		return json({
			data: {
				reply: result.reply,
				ai_prompt: result.prompt
			}
		});
	} catch (error) {
		console.error('Unable to generate social comment reply', error);
		return json({ error: error?.message || 'Unable to generate comment reply.' }, { status: 500 });
	}
}
