import { json } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import {
	createGroupSocialPost,
	listGroupSocialAccounts,
	listGroupSocialPosts,
	serializeSocialPost
} from '$lib/server/social/db';
import { requireGroupSocialManager } from '$lib/server/social/permissions';
import { publishSingleGroupSocialPost } from '$lib/server/social/publish';
import { normalizeScheduledPostTime } from '$lib/server/social/scheduler';
import { normalizePlatforms, normalizePostTarget } from '$lib/server/social/types';
import { validatePlatformPostPayload } from '$lib/server/social/meta/permissions';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function normalizeMediaList(value) {
	if (!Array.isArray(value)) return [];
	const normalized = [];
	for (const entry of value) {
		if (typeof entry === 'string') {
			const url = cleanText(entry, 2000);
			if (!url) continue;
			normalized.push({ url });
			continue;
		}
		if (!entry || typeof entry !== 'object') continue;
		const url = cleanText(entry.url || entry.public_url || entry.src, 2000);
		if (!url) continue;
		normalized.push({ url, type: cleanText(entry.type, 40) || 'image' });
	}
	return normalized;
}

function isManagedSocialMediaUrl(url) {
	const value = cleanText(url, 2000);
	if (!value) return false;
	try {
		const parsed = new URL(value);
		const expected = new URL(PUBLIC_SUPABASE_URL);
		if (parsed.host !== expected.host) return false;
		return parsed.pathname.includes('/storage/v1/object/public/group-social-media/');
	} catch {
		return false;
	}
}

function validateRequestedPlatforms({
	requestedPlatforms,
	connectedPlatforms,
	media,
	caption,
	postTarget
}) {
	if (!requestedPlatforms.length) {
		return 'Select at least one connected platform.';
	}

	for (const platform of requestedPlatforms) {
		if (!connectedPlatforms.has(platform)) {
			return `${platform} is not connected.`;
		}
		const validation = validatePlatformPostPayload(platform, { media, caption, postTarget });
		if (!validation.ok) {
			return validation.errors[0] || `Post payload is invalid for ${platform}.`;
		}
	}
	for (const item of media) {
		const mediaUrl = cleanText(item?.url, 2000);
		if (!isManagedSocialMediaUrl(mediaUrl)) {
			return 'Media must be uploaded through the 3FP social uploader.';
		}
	}
	return null;
}

export async function GET({ cookies, params, url }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const status = cleanText(url.searchParams.get('status'), 40) || null;
		const limit = Number.parseInt(cleanText(url.searchParams.get('limit'), 8), 10) || 80;
		const posts = await listGroupSocialPosts(auth.serviceSupabase, auth.group.id, {
			status,
			limit
		});
		return json({ data: posts.map(serializeSocialPost) });
	} catch (error) {
		console.error('Unable to list group social posts', error);
		return json({ error: error?.message || 'Unable to load social posts.' }, { status: 500 });
	}
}

export async function POST({ cookies, params, request }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const body = await request.json().catch(() => ({}));
		const intent = cleanText(body.intent, 40).toLowerCase() || 'save_draft';
		const caption = cleanText(body.caption, 4000);
		const title = cleanText(body.title, 200) || null;
		const aiPrompt = cleanText(body.ai_prompt, 3000) || null;
		const media = normalizeMediaList(body.media);
		const postTarget = normalizePostTarget(body.post_target);
		const requestedPlatforms = normalizePlatforms(body.platforms);

		const accounts = await listGroupSocialAccounts(auth.serviceSupabase, auth.group.id);
		const connectedPlatforms = new Set(
			accounts.filter((account) => account.status === 'active').map((account) => account.platform)
		);

		if (intent === 'publish_now' || intent === 'schedule') {
			const platformError = validateRequestedPlatforms({
				requestedPlatforms,
				connectedPlatforms,
				media,
				caption,
				postTarget
			});
			if (platformError) {
				return json({ error: platformError }, { status: 400 });
			}
		}

		let status = 'draft';
		let scheduledFor = null;
		let scheduleBucket = null;
		let publishAttempts = 0;

		if (intent === 'schedule') {
			const normalizedSchedule = normalizeScheduledPostTime(body.scheduled_for, {
				now: new Date()
			});
			if (!normalizedSchedule.ok) {
				return json({ error: normalizedSchedule.error }, { status: 400 });
			}
			status = 'scheduled';
			scheduledFor = normalizedSchedule.scheduledFor;
			scheduleBucket = normalizedSchedule.scheduleBucket;
		}

		if (intent === 'publish_now') {
			status = 'publishing';
			publishAttempts = 1;
		}

		const createdPost = await createGroupSocialPost(auth.serviceSupabase, {
			group_id: auth.group.id,
			created_by: auth.userId,
			updated_by: auth.userId,
			status,
			post_target: postTarget,
			platforms: requestedPlatforms,
			title,
			caption,
			ai_prompt: aiPrompt,
			media,
			scheduled_for: scheduledFor,
			schedule_bucket: scheduleBucket,
			publish_attempts: publishAttempts,
			meta_publish_results: {
				created_via: 'social_dashboard',
				intent
			}
		});

		if (intent !== 'publish_now') {
			return json({
				data: serializeSocialPost(createdPost),
				schedule_bucket: scheduleBucket ? scheduleBucket.toISOString() : null
			});
		}

		const publishResult = await publishSingleGroupSocialPost(auth.serviceSupabase, {
			groupId: auth.group.id,
			postId: createdPost.id,
			post: createdPost,
			requestedBy: auth.userId
		});

		if (!publishResult.ok && !publishResult.partial) {
			return json(
				{
					error: 'Publish failed.',
					data: publishResult.post,
					results: publishResult.results
				},
				{ status: 500 }
			);
		}

		return json({
			data: publishResult.post,
			results: publishResult.results,
			partial: publishResult.partial === true
		});
	} catch (error) {
		console.error('Unable to create social post', error);
		return json({ error: error?.message || 'Unable to save social post.' }, { status: 500 });
	}
}
