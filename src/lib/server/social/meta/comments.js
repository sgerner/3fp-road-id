import { callInstagramApi, callMetaApi } from '$lib/server/social/meta/client';
import { normalizeMetaError } from '$lib/server/social/meta/normalize';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function toIso(value) {
	if (!value) return new Date().toISOString();
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeFacebookComment(comment, sourcePost = null) {
	const fromName = cleanText(comment?.from?.name, 200) || null;
	const postId = cleanText(sourcePost?.id, 200) || null;
	return {
		platform: 'facebook',
		meta_comment_id: cleanText(comment?.id, 200) || null,
		meta_media_id: postId,
		meta_parent_comment_id: cleanText(comment?.parent?.id, 200) || null,
		author_name: fromName,
		author_username: fromName,
		body: cleanText(comment?.message, 8000),
		is_hidden: comment?.is_hidden === true,
		can_reply: true,
		raw_payload: {
			comment,
			source_post: sourcePost
				? {
						id: postId,
						message: cleanText(sourcePost?.message, 8000) || null,
						permalink_url: cleanText(sourcePost?.permalink_url, 2000) || null,
						full_picture: cleanText(sourcePost?.full_picture, 2000) || null,
						created_time: sourcePost?.created_time || null
					}
				: null
		},
		commented_at: toIso(comment?.created_time)
	};
}

function normalizeInstagramComment(comment, media = null) {
	const mediaId = cleanText(media?.id, 200) || null;
	const username =
		cleanText(comment?.username || comment?.from?.username || comment?.from?.name, 200) || null;
	const parentId = cleanText(comment?.parent_id, 200) || null;
	return {
		platform: 'instagram',
		meta_comment_id: cleanText(comment?.id, 200) || null,
		meta_media_id: cleanText(mediaId, 200) || null,
		meta_parent_comment_id: parentId,
		author_name: username,
		author_username: username,
		body: cleanText(comment?.text || comment?.message, 8000),
		is_hidden: comment?.hidden === true,
		can_reply: !parentId,
		raw_payload: {
			comment,
			source_post: media
				? {
						id: mediaId,
						message: cleanText(media?.caption, 8000) || null,
						permalink_url: cleanText(media?.permalink, 2000) || null,
						full_picture:
							cleanText(media?.media_url || media?.thumbnail_url || media?.display_url, 2000) || null,
						created_time: media?.timestamp || null
					}
				: null
		},
		commented_at: toIso(comment?.timestamp || comment?.created_time)
	};
}

export async function fetchFacebookComments({ account, limitPosts = 10, limitComments = 25 } = {}) {
	const pageId = cleanText(account?.meta_page_id, 120);
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	if (!pageId || !accessToken) return [];
	const fields = `id,message,created_time,full_picture,permalink_url,comments.limit(${Math.max(1, limitComments)}){id,message,created_time,from{id,name},parent{id},is_hidden}`;
	let response = null;
	try {
		response = await callMetaApi({
			path: `/${pageId}/feed`,
			accessToken,
			query: {
				fields,
				limit: Math.max(1, limitPosts)
			}
		});
	} catch {
		response = await callMetaApi({
			path: `/${pageId}/posts`,
			accessToken,
			query: {
				fields,
				limit: Math.max(1, limitPosts)
			}
		});
	}

	const rows = [];
	for (const post of Array.isArray(response?.data) ? response.data : []) {
		for (const comment of Array.isArray(post?.comments?.data) ? post.comments.data : []) {
			const normalized = normalizeFacebookComment(comment, post);
			if (!normalized.meta_comment_id) continue;
			rows.push(normalized);
		}
	}
	return rows;
}

export async function fetchInstagramComments({
	account,
	limitMedia = 10,
	limitComments = 25
} = {}) {
	const igAccountId = cleanText(account?.meta_instagram_account_id, 120);
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	if (!igAccountId || !accessToken) return [];

	const callInstagramReadEdge = async (path, query) => {
		try {
			return await callInstagramApi({
				path,
				accessToken,
				query
			});
		} catch (primaryError) {
			// Backward compatibility for existing FB-linked IG tokens.
			return callMetaApi({
				path,
				accessToken,
				query
			}).catch(() => {
				throw primaryError;
			});
		}
	};

	const mediaResponse = await callInstagramReadEdge(`/${igAccountId}/media`, {
		fields: 'id,caption,timestamp,comments_count,permalink,media_type,media_url,thumbnail_url',
		limit: Math.max(1, limitMedia)
	});

	const rows = [];
	for (const media of Array.isArray(mediaResponse?.data) ? mediaResponse.data : []) {
		const mediaId = cleanText(media?.id, 200);
		if (!mediaId) continue;
		if (Number(media?.comments_count || 0) <= 0) continue;

		const commentsResponse = await callInstagramReadEdge(`/${mediaId}/comments`, {
			fields: 'id,text,timestamp,username,parent_id,hidden,from{id,username}',
			limit: Math.max(1, limitComments)
		});

		for (const comment of Array.isArray(commentsResponse?.data) ? commentsResponse.data : []) {
			const normalized = normalizeInstagramComment(comment, media);
			if (!normalized.meta_comment_id) continue;
			rows.push(normalized);
		}
	}

	return rows;
}

export async function fetchConnectedAccountComments({ account, limit = 50 } = {}) {
	const platform = cleanText(account?.platform, 40).toLowerCase();
	const cappedLimit = Math.max(5, Math.min(100, Number.parseInt(String(limit), 10) || 50));
	if (platform === 'facebook') {
		return fetchFacebookComments({
			account,
			limitPosts: Math.max(5, Math.ceil(cappedLimit / 5)),
			limitComments: 20
		});
	}
	if (platform === 'instagram') {
		return fetchInstagramComments({
			account,
			limitMedia: Math.max(5, Math.ceil(cappedLimit / 5)),
			limitComments: 20
		});
	}
	return [];
}

export async function replyToConnectedComment({ platform, account, metaCommentId, body }) {
	const accessToken = cleanText(account?.accessToken || account?.access_token, 5000);
	const commentId = cleanText(metaCommentId, 200);
	const message = cleanText(body, 2200);
	if (!accessToken) throw new Error('Missing connected account access token.');
	if (!commentId) throw new Error('Missing comment id.');
	if (!message) throw new Error('Reply message is required.');

	try {
		if (platform === 'facebook') {
			const response = await callMetaApi({
				path: `/${commentId}/comments`,
				method: 'POST',
				accessToken,
				query: { message }
			});
			return {
				ok: true,
				platform,
				meta_reply_id: cleanText(response?.id, 200) || null
			};
		}

		if (platform === 'instagram') {
			const response = await (async () => {
				try {
					return await callInstagramApi({
						path: `/${commentId}/replies`,
						method: 'POST',
						accessToken,
						query: { message }
					});
				} catch (primaryError) {
					return callMetaApi({
						path: `/${commentId}/replies`,
						method: 'POST',
						accessToken,
						query: { message }
					}).catch(() => {
						throw primaryError;
					});
				}
			})();
			return {
				ok: true,
				platform,
				meta_reply_id: cleanText(response?.id, 200) || null
			};
		}

		throw new Error(`Unsupported platform: ${platform}`);
	} catch (error) {
		return {
			ok: false,
			platform,
			error: normalizeMetaError(error, 'Unable to send comment reply.')
		};
	}
}
