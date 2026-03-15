import {
	createGroupSocialCommentReply,
	getGroupSocialCommentById,
	listGroupSocialAccounts,
	listGroupSocialComments,
	upsertGroupSocialComment
} from '$lib/server/social/db';
import {
	fetchConnectedAccountComments,
	replyToConnectedComment
} from '$lib/server/social/meta/comments';
import { resolveMetaAccountAccessToken } from '$lib/server/social/meta/tokens';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

export async function syncGroupSocialComments(supabase, groupId, { limit = 60 } = {}) {
	const accounts = await listGroupSocialAccounts(supabase, groupId, { includeTokens: true });
	const activeAccounts = accounts.filter((account) => account?.status === 'active');
	const syncSummary = [];
	let inserted = 0;

	for (const account of activeAccounts) {
		try {
			const tokenResult = await resolveMetaAccountAccessToken(supabase, account);
			const accessToken = tokenResult.accessToken;
			const comments = await fetchConnectedAccountComments({
				account: { ...account, accessToken },
				limit
			});
			for (const comment of comments) {
				await upsertGroupSocialComment(supabase, {
					group_id: groupId,
					social_account_id: account.id,
					social_post_id: null,
					...comment
				});
				inserted += 1;
			}
			syncSummary.push({
				platform: account.platform,
				ok: true,
				count: comments.length
			});
		} catch (error) {
			syncSummary.push({
				platform: account.platform,
				ok: false,
				error: cleanText(error?.message, 1000) || 'Unable to sync comments.'
			});
		}
	}

	const comments = await listGroupSocialComments(supabase, groupId, { limit: 100 });
	return {
		ok: true,
		inserted,
		summary: syncSummary,
		comments
	};
}

export async function replyToGroupSocialComment(supabase, { groupId, commentId, body, createdBy }) {
	const comment = await getGroupSocialCommentById(supabase, groupId, commentId);
	if (!comment) {
		return { ok: false, status: 404, error: 'Comment not found.' };
	}
	if (!comment.can_reply) {
		return { ok: false, status: 400, error: 'This comment cannot be replied to from 3FP.' };
	}

	const accounts = await listGroupSocialAccounts(supabase, groupId, { includeTokens: true });
	const account = accounts.find((entry) => entry.id === comment.social_account_id);
	if (!account || account.status !== 'active') {
		return { ok: false, status: 400, error: 'Connected social account is unavailable.' };
	}

	let accessToken = '';
	try {
		const tokenResult = await resolveMetaAccountAccessToken(supabase, account);
		accessToken = tokenResult.accessToken;
	} catch {
		return { ok: false, status: 500, error: 'Unable to resolve account token.' };
	}

	const result = await replyToConnectedComment({
		platform: comment.platform,
		account: { ...account, accessToken },
		metaCommentId: comment.meta_comment_id,
		body
	});

	if (!result.ok) {
		const failed = await createGroupSocialCommentReply(supabase, {
			group_comment_id: comment.id,
			group_id: groupId,
			social_account_id: account.id,
			created_by: createdBy,
			body,
			status: 'failed',
			error_text: result.error || 'Reply failed.'
		});
		return {
			ok: false,
			status: 500,
			error: result.error || 'Reply failed.',
			reply: failed
		};
	}

	const reply = await createGroupSocialCommentReply(supabase, {
		group_comment_id: comment.id,
		group_id: groupId,
		social_account_id: account.id,
		created_by: createdBy,
		body,
		status: 'sent',
		meta_reply_id: result.meta_reply_id || null
	});

	return {
		ok: true,
		reply
	};
}
