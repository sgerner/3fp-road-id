import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import sharp from 'sharp';
import {
	getGroupSocialPostById,
	listGroupSocialAccounts,
	serializeSocialPost,
	updateGroupSocialPost
} from '$lib/server/social/db';
import { resolveMetaAccountAccessToken } from '$lib/server/social/meta/tokens';
import { publishGroupSocialPostToPlatform } from '$lib/server/social/meta/publish';
import {
	normalizePlatforms,
	normalizePostTarget,
	SOCIAL_MAX_PUBLISH_ATTEMPTS
} from '$lib/server/social/types';

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

function parseManagedStoragePath(value) {
	const mediaUrl = cleanText(value, 2000);
	if (!mediaUrl) return null;
	try {
		const parsed = new URL(mediaUrl);
		const expected = new URL(PUBLIC_SUPABASE_URL);
		if (parsed.host !== expected.host) return null;
		const segments = parsed.pathname.split('/').filter(Boolean);
		if (segments.length < 6) return null;
		if (
			segments[0] !== 'storage' ||
			segments[1] !== 'v1' ||
			segments[2] !== 'object' ||
			segments[3] !== 'public'
		) {
			return null;
		}
		const bucket = segments[4];
		const objectPath = decodeURIComponent(segments.slice(5).join('/'));
		if (!bucket || !objectPath) return null;
		return { bucket, objectPath };
	} catch {
		return null;
	}
}

function isJpegUrl(value) {
	const mediaUrl = cleanText(value, 2000);
	if (!mediaUrl) return false;
	try {
		const parsed = new URL(mediaUrl);
		const pathname = parsed.pathname.toLowerCase();
		return pathname.endsWith('.jpg') || pathname.endsWith('.jpeg');
	} catch {
		return false;
	}
}

function isSocialPublishDebugEnabled() {
	const value = cleanText(process.env.SOCIAL_PUBLISH_DEBUG, 20).toLowerCase();
	return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function logSocialPublishDebug(event, payload = {}) {
	if (!isSocialPublishDebugEnabled()) return;
	console.info(event, payload);
}

function logSocialPublishEvent(event, payload = {}) {
	console.info(event, payload);
	logSocialPublishDebug(event, payload);
}

function appendDebugTimelineEntry(timeline, stage, details = {}) {
	if (!Array.isArray(timeline)) return;
	const entry = {
		at: new Date().toISOString(),
		stage: cleanText(stage, 120) || 'unknown'
	};
	for (const [key, value] of Object.entries(details || {})) {
		const cleanedKey = cleanText(key, 80);
		if (!cleanedKey) continue;
		if (value === null || value === undefined) {
			entry[cleanedKey] = null;
			continue;
		}
		if (typeof value === 'boolean' || typeof value === 'number') {
			entry[cleanedKey] = value;
			continue;
		}
		entry[cleanedKey] = cleanText(value, 1200) || null;
	}
	timeline.push(entry);
	if (timeline.length > 40) {
		timeline.splice(0, timeline.length - 40);
	}
}

async function createInstagramJpegDerivative(supabase, mediaUrl) {
	const reference = parseManagedStoragePath(mediaUrl);
	if (!reference) {
		throw new Error('Instagram requires JPEG media. Re-upload the image as JPEG.');
	}

	const response = await fetch(mediaUrl);
	if (!response.ok) {
		throw new Error('Unable to fetch media for Instagram JPEG conversion.');
	}
	logSocialPublishDebug('social_publish_instagram_media_fetch', {
		media_url: mediaUrl,
		status: response.status,
		content_type: cleanText(response.headers.get('content-type'), 120) || null
	});
	const sourceBuffer = Buffer.from(await response.arrayBuffer());
	let convertedBuffer = null;
	try {
		convertedBuffer = await sharp(sourceBuffer).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
	} catch {
		throw new Error('Unable to convert media to JPEG for Instagram publishing.');
	}

	const basePath = reference.objectPath.replace(/\.[a-z0-9]+$/i, '');
	const objectPath = `${basePath}-ig.jpg`;
	const upload = await supabase.storage.from(reference.bucket).upload(objectPath, convertedBuffer, {
		contentType: 'image/jpeg',
		upsert: true
	});
	if (upload.error) {
		throw new Error(upload.error.message || 'Unable to upload Instagram JPEG derivative.');
	}
	const { data } = supabase.storage.from(reference.bucket).getPublicUrl(objectPath);
	const publicUrl = cleanText(data?.publicUrl, 2000);
	if (!publicUrl) {
		throw new Error('Unable to resolve public URL for Instagram JPEG derivative.');
	}
	logSocialPublishDebug('social_publish_instagram_media_derivative', {
		source_media_url: mediaUrl,
		derived_media_url: publicUrl,
		source_bytes: sourceBuffer.length,
		derived_bytes: convertedBuffer.length
	});
	return publicUrl;
}

async function ensureInstagramCompatibleMedia({ supabase, media }) {
	const list = Array.isArray(media) ? [...media] : [];
	if (!list.length) return { changed: false, media: list };
	const first = list[0];
	const firstUrl = cleanText(
		typeof first === 'string' ? first : first?.url || first?.public_url || first?.src,
		2000
	);
	if (!firstUrl) {
		throw new Error('Instagram publishing requires at least one media URL.');
	}
	const isAlreadyPrepared =
		typeof first === 'object' &&
		first !== null &&
		first.derived_for === 'instagram' &&
		isJpegUrl(firstUrl);
	if (isAlreadyPrepared) {
		logSocialPublishDebug('social_publish_instagram_media_already_prepared', {
			media_url: firstUrl
		});
		return { changed: false, media: list };
	}
	const jpegUrl = await createInstagramJpegDerivative(supabase, firstUrl);
	if (typeof first === 'string') {
		list[0] = jpegUrl;
	} else {
		list[0] = {
			...(first || {}),
			url: jpegUrl,
			mime_type: 'image/jpeg',
			type: 'image',
			derived_for: 'instagram'
		};
	}
	logSocialPublishDebug('social_publish_instagram_media_prepared', {
		original_media_url: firstUrl,
		prepared_media_url: jpegUrl
	});
	return { changed: true, media: list };
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
	const postTarget = normalizePostTarget(targetPost.post_target);
	const baseMetaPublishResults =
		targetPost?.meta_publish_results && typeof targetPost.meta_publish_results === 'object'
			? targetPost.meta_publish_results
			: {};
	const debugTimeline = Array.isArray(baseMetaPublishResults.debug_timeline)
		? [...baseMetaPublishResults.debug_timeline]
		: [];
	const getDebugMeta = (extra = {}) => ({
		...baseMetaPublishResults,
		...extra,
		debug_timeline: debugTimeline,
		debug_last_stage: debugTimeline[debugTimeline.length - 1]?.stage || null,
		debug_last_at: debugTimeline[debugTimeline.length - 1]?.at || null
	});

	appendDebugTimelineEntry(debugTimeline, 'publish_start', {
		post_id: targetPost.id,
		group_id: groupId,
		post_target: postTarget,
		platforms: platforms.join(','),
		status: cleanText(targetPost.status, 40) || null,
		publish_attempts: Number(targetPost.publish_attempts || 0)
	});
	logSocialPublishEvent('social_publish_post_start', {
		post_id: targetPost.id,
		group_id: groupId,
		post_target: postTarget,
		platforms,
		publish_attempts: Number(targetPost.publish_attempts || 0),
		status: cleanText(targetPost.status, 40) || null
	});
	if (!platforms.length) {
		appendDebugTimelineEntry(debugTimeline, 'validation_failed_no_platforms');
		await updateGroupSocialPost(supabase, groupId, targetPost.id, {
			status: 'failed',
			updated_by: requestedBy,
			last_publish_error: 'No target platforms were selected.',
			meta_publish_results: getDebugMeta({
				last_error: 'No target platforms were selected.'
			})
		});
		return { ok: false, error: 'No target platforms were selected.' };
	}
	const mediaValidation = validateManagedMedia(targetPost);
	if (!mediaValidation.ok) {
		appendDebugTimelineEntry(debugTimeline, 'validation_failed_media', {
			error: mediaValidation.error
		});
		await updateGroupSocialPost(supabase, groupId, targetPost.id, {
			status: 'failed',
			updated_by: requestedBy,
			last_publish_error: mediaValidation.error,
			meta_publish_results: getDebugMeta({
				last_error: mediaValidation.error
			})
		});
		return { ok: false, error: mediaValidation.error };
	}
	if (postTarget === 'story' && extractPostMedia(targetPost).length === 0) {
		appendDebugTimelineEntry(debugTimeline, 'validation_failed_story_requires_media');
		await updateGroupSocialPost(supabase, groupId, targetPost.id, {
			status: 'failed',
			updated_by: requestedBy,
			last_publish_error: 'Stories require at least one media item.',
			meta_publish_results: getDebugMeta({
				last_error: 'Stories require at least one media item.'
			})
		});
		return { ok: false, error: 'Stories require at least one media item.' };
	}

	if ((targetPost.publish_attempts || 0) > SOCIAL_MAX_PUBLISH_ATTEMPTS) {
		return {
			ok: false,
			error: `Post reached max publish attempts (${SOCIAL_MAX_PUBLISH_ATTEMPTS}).`
		};
	}

	let preparedMedia = extractPostMedia(targetPost);
	if (platforms.includes('instagram')) {
		try {
			logSocialPublishDebug('social_publish_instagram_prepare_start', {
				post_id: targetPost.id,
				media_count: preparedMedia.length
			});
			const prepared = await ensureInstagramCompatibleMedia({
				supabase,
				media: preparedMedia
			});
			if (prepared.changed) {
				preparedMedia = prepared.media;
				await updateGroupSocialPost(supabase, groupId, targetPost.id, {
					media: preparedMedia,
					updated_by: requestedBy || targetPost.updated_by || targetPost.created_by || null
				});
				logSocialPublishDebug('social_publish_instagram_prepare_saved', {
					post_id: targetPost.id,
					prepared_media_url:
						cleanText(
							typeof preparedMedia[0] === 'string'
								? preparedMedia[0]
								: preparedMedia[0]?.url || preparedMedia[0]?.public_url || preparedMedia[0]?.src,
							2000
						) || null
				});
			}
		} catch (conversionError) {
			const message =
				cleanText(conversionError?.message, 1000) || 'Unable to prepare Instagram media.';
			appendDebugTimelineEntry(debugTimeline, 'instagram_media_prepare_failed', {
				error: message
			});
			console.error('social_publish_instagram_prepare_failed', {
				post_id: targetPost.id,
				group_id: groupId,
				error: message
			});
			await updateGroupSocialPost(supabase, groupId, targetPost.id, {
				status: 'failed',
				updated_by: requestedBy,
				last_publish_error: message,
				meta_publish_results: getDebugMeta({
					last_error: message
				})
			});
			return { ok: false, error: message };
		}
	}

	const accounts = await listGroupSocialAccounts(supabase, groupId, { includeTokens: true });
	const platformResults = {};
	let successCount = 0;
	let failureCount = 0;
	const priorPlatformResults =
		baseMetaPublishResults.platforms && typeof baseMetaPublishResults.platforms === 'object'
			? baseMetaPublishResults.platforms
			: {};

	const buildFailureMessage = () => {
		const message = Object.values(platformResults)
			.filter((result) => !result?.ok)
			.map((result) => result?.error)
			.filter(Boolean)
			.join(' | ');
		return message || null;
	};

	const buildMergedResults = (attemptedAtIso) =>
		getDebugMeta({
			post_target: postTarget,
			last_attempt_at: attemptedAtIso,
			platforms: {
				...(baseMetaPublishResults.platforms || {}),
				...platformResults
			},
			success_count: successCount,
			failure_count: failureCount,
			partial_success: successCount > 0 && failureCount > 0
		});

	const persistPublishingProgress = async () => {
		const attemptedAtIso = new Date().toISOString();
		const mergedResults = buildMergedResults(attemptedAtIso);
		await updateGroupSocialPost(supabase, groupId, targetPost.id, {
			status: 'publishing',
			updated_by: requestedBy,
			last_publish_error: buildFailureMessage(),
			meta_publish_results: mergedResults
		});
		logSocialPublishEvent('social_publish_post_checkpoint', {
			post_id: targetPost.id,
			group_id: groupId,
			success_count: successCount,
			failure_count: failureCount,
			last_error: buildFailureMessage(),
			platforms: Object.keys(mergedResults?.platforms || {})
		});
	};

	for (const platform of platforms) {
		const prior = priorPlatformResults[platform];
		if (prior?.ok === true) {
			appendDebugTimelineEntry(debugTimeline, 'platform_skipped_already_published', {
				platform
			});
			platformResults[platform] = {
				...prior,
				ok: true,
				skipped: true,
				note: 'Already published in a previous attempt.'
			};
			successCount += 1;
			continue;
		}

		const account = findConnectedAccount(accounts, platform);
		if (!account) {
			appendDebugTimelineEntry(debugTimeline, 'platform_missing_account', {
				platform
			});
			platformResults[platform] = {
				ok: false,
				error: `No active ${platform} connection found.`
			};
			failureCount += 1;
			await persistPublishingProgress();
			continue;
		}

		try {
			appendDebugTimelineEntry(debugTimeline, 'platform_publish_start', {
				platform
			});
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
					media: preparedMedia,
					post_target: postTarget
				}
			});
			platformResults[platform] = publishResult;
			if (publishResult.ok) successCount += 1;
			else failureCount += 1;
			appendDebugTimelineEntry(debugTimeline, 'platform_publish_result', {
				platform,
				ok: publishResult.ok === true,
				error: publishResult?.ok === true ? null : publishResult?.error || null,
				meta_id: publishResult?.meta_id || null
			});
			logSocialPublishEvent('social_publish_platform_result', {
				post_id: targetPost.id,
				group_id: groupId,
				platform,
				ok: publishResult.ok === true,
				error: publishResult?.ok === true ? null : publishResult?.error || null,
				meta_id: publishResult?.meta_id || null
			});
			await persistPublishingProgress();
		} catch (error) {
			const message =
				cleanText(error?.message, 1000) || 'Unable to resolve connected account token.';
			appendDebugTimelineEntry(debugTimeline, 'platform_publish_exception', {
				platform,
				error: message
			});
			platformResults[platform] = {
				ok: false,
				error: message
			};
			failureCount += 1;
			console.error('social_publish_platform_exception', {
				post_id: targetPost.id,
				group_id: groupId,
				platform,
				error: message,
				stack: cleanText(error?.stack, 4000) || null
			});
			await persistPublishingProgress();
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
		lastPublishError = buildFailureMessage() || 'Publishing failed.';
	}
	appendDebugTimelineEntry(debugTimeline, 'publish_finish', {
		status: nextStatus,
		success_count: successCount,
		failure_count: failureCount,
		partial
	});

	const mergedResults = buildMergedResults(nowIso);

	const updated = await updateGroupSocialPost(supabase, groupId, targetPost.id, {
		status: nextStatus,
		updated_by: requestedBy,
		published_at: allSucceeded ? nowIso : targetPost.published_at,
		last_publish_error: lastPublishError,
		meta_publish_results: mergedResults
	});
	logSocialPublishEvent('social_publish_post_finish', {
		post_id: targetPost.id,
		group_id: groupId,
		status: nextStatus,
		ok: allSucceeded,
		partial,
		success_count: successCount,
		failure_count: failureCount,
		last_error: lastPublishError
	});

	return {
		ok: allSucceeded,
		partial,
		all_failed: allFailed,
		post: serializeSocialPost(updated),
		results: platformResults
	};
}
