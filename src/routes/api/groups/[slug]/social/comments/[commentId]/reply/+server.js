import { json } from '@sveltejs/kit';
import { replyToGroupSocialComment } from '$lib/server/social/comments';
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

		const payload = await request.json().catch(() => ({}));
		const body = cleanText(payload.body, 2200);
		if (!body) {
			return json({ error: 'Reply body is required.' }, { status: 400 });
		}

		const result = await replyToGroupSocialComment(auth.serviceSupabase, {
			groupId: auth.group.id,
			commentId: params.commentId || '',
			body,
			createdBy: auth.userId
		});

		if (!result.ok) {
			return json(
				{ error: result.error || 'Unable to send reply.' },
				{ status: result.status || 500 }
			);
		}
		return json({ data: result.reply });
	} catch (error) {
		console.error('Unable to reply to social comment', error);
		return json({ error: error?.message || 'Unable to reply to comment.' }, { status: 500 });
	}
}
