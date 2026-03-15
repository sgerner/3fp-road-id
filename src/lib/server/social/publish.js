import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import {
	getGroupSocialPostById,
	listGroupSocialAccounts,
	serializeSocialPost,
	updateGroupSocialPost
} from '$lib/server/social/db';
import { resolveMetaAccountAccessToken } from '$lib/server/social/meta/tokens';
import { publishGroupSocialPostToPlatform } from '$lib/server/social/meta/publish';
import { normalizePlatforms, SOCIAL_MAX_PUBLISH_ATTEMPTS } from '$lib/server/social/types';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function extractPostMedia(post) {
	return Array.isArray(post?.media) ? post.media : [];
}

function isManagedMediaUrl(value) {
	const mediaUrl = cleanText(value, 2000);
	if (!mediaUrl) return false;
	try {
		const parsed = new URL(mediaUrl);
		const expected = new URL(PUBLIC_SUPABASE_URL);
		if (parsed.host !== expected.host) return false;
		return parsed.pathname.includes('/storage/v1/object/public/group-social-media/');
	} catch {
		return false;
	}
}

function validateManagedMedia(post) {
	const media = extractPostMedia(post);
	for (const item of media) {
		const mediaUrl = cleanText(item?.url || item, 2000);
		if (!isManagedMediaUrl(mediaUrl)) {
			return {
				ok: false,
				error: 'Post media must be uploaded through the 3FP social uploader.'
			};
		}
	}
	return { ok: true };
}

function findConnectedAccount(accounts, platform) {
	return (
		(accounts || []).find((entry) => entry?.platform === platform && entry?.status === 'active') ||
		null
	);
}

export async function publishSingleGroupSocialPost(
	supabase,
	{ groupId, postId, post = null, requestedBy = null } = {}
) {
	const targetPost = post || (await getGroupSocialPostById(supabase, groupId, postId));
	if (!targetPost) {
		return {
			ok: false,
			error: 'Post not found.'
		};
	}

	const platforms = normalizePlatforms(targetPost.platforms);
	if (!platforms.length) {
		await updateGroupSocialPost(supabase, groupId, targetPost.id, {
			status: 'failed',
			updated_by: requestedBy,
			last_publish_error: 'No target platforms were selected.',
			meta_publish_results: {
				...(targetPost.meta_publish_results || {}),
				last_error: 'No target platforms were selected.'
			}
		});
		return { ok: false, error: 'No target platforms were selected.' };
	}
	const mediaValidation = validateManagedMedia(targetPost);
	if (!mediaValidation.ok) {
		await updateGroupSocialPost(supabase, groupId, targetPost.id, {
			status: 'failed',
			updated_by: requestedBy,
			last_publish_error: mediaValidation.error,
			meta_publish_results: {
				...(targetPost.meta_publish_results || {}),
				last_error: mediaValidation.error
			}
		});
		return { ok: false, error: mediaValidation.error };
	}

	if ((targetPost.publish_attempts || 0) > SOCIAL_MAX_PUBLISH_ATTEMPTS) {
		return {
			ok: false,
			error: `Post reached max publish attempts (${SOCIAL_MAX_PUBLISH_ATTEMPTS}).`
		};
	}

	const accounts = await listGroupSocialAccounts(supabase, groupId, { includeTokens: true });
	const platformResults = {};
	let successCount = 0;
	let failureCount = 0;

	for (const platform of platforms) {
		const account = findConnectedAccount(accounts, platform);
		if (!account) {
			platformResults[platform] = {
				ok: false,
				error: `No active ${platform} connection found.`
			};
			failureCount += 1;
			continue;
		}

		try {
			const tokenResult = await resolveMetaAccountAccessToken(supabase, account);
			const accessToken = tokenResult.accessToken;
			const publishResult = await publishGroupSocialPostToPlatform({
				platform,
				account: {
					...account,
					accessToken
				},
				post: {
					caption: targetPost.caption,
					media: extractPostMedia(targetPost)
				}
			});
			platformResults[platform] = publishResult;
			if (publishResult.ok) successCount += 1;
			else failureCount += 1;
		} catch (error) {
			platformResults[platform] = {
				ok: false,
				error: cleanText(error?.message, 1000) || 'Unable to resolve connected account token.'
			};
			failureCount += 1;
		}
	}

	const nowIso = new Date().toISOString();
	const allSucceeded = successCount > 0 && failureCount === 0;
	const allFailed = successCount === 0 && failureCount > 0;
	const partial = successCount > 0 && failureCount > 0;

	let nextStatus = targetPost.status;
	let lastPublishError = null;
	if (allSucceeded) {
		nextStatus = 'published';
	} else if (allFailed || partial) {
		nextStatus = 'failed';
		const failureMessage = Object.values(platformResults)
			.filter((result) => !result?.ok)
			.map((result) => result?.error)
			.filter(Boolean)
			.join(' | ');
		lastPublishError = failureMessage || 'Publishing failed.';
	}

	const mergedResults = {
		...(targetPost.meta_publish_results || {}),
		last_attempt_at: nowIso,
		platforms: {
			...(targetPost.meta_publish_results?.platforms || {}),
			...platformResults
		},
		success_count: successCount,
		failure_count: failureCount,
		partial_success: partial
	};

	const updated = await updateGroupSocialPost(supabase, groupId, targetPost.id, {
		status: nextStatus,
		updated_by: requestedBy,
		published_at: allSucceeded ? nowIso : targetPost.published_at,
		last_publish_error: lastPublishError,
		meta_publish_results: mergedResults
	});

	return {
		ok: allSucceeded,
		partial,
		all_failed: allFailed,
		post: serializeSocialPost(updated),
		results: platformResults
	};
}
