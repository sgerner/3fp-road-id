import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { getGroupSocialPostById, updateGroupSocialPost } from '$lib/server/social/db';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { publishSingleGroupSocialPost } from '$lib/server/social/publish';

export const config = { runtime: 'nodejs20.x', maxDuration: 60 };

async function verifyCronRequest(request) {
	const providedSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-secret') ||
		'';
	if (!providedSecret) return false;
	return getCronSecretVerifier('social_publish', providedSecret);
}

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

async function persistUnexpectedCronFailure(supabase, post, error) {
	if (!post?.id || !post?.group_id) return;
	const nowIso = new Date().toISOString();
	const message = cleanText(error?.message, 1000) || 'Unexpected publish failure in cron worker.';
	const stack = cleanText(error?.stack, 4000) || null;
	const latest = await getGroupSocialPostById(supabase, post.group_id, post.id).catch(() => null);
	const latestMeta =
		latest?.meta_publish_results && typeof latest.meta_publish_results === 'object'
			? latest.meta_publish_results
			: {};
	const latestDebugTimeline = Array.isArray(latestMeta.debug_timeline) ? latestMeta.debug_timeline : [];
	const debugTimeline = [
		...latestDebugTimeline,
		{
			at: nowIso,
			stage: 'cron_unexpected_exception',
			error: message
		}
	].slice(-40);

	await updateGroupSocialPost(supabase, post.group_id, post.id, {
		status: 'failed',
		updated_by: null,
		last_publish_error: message,
		meta_publish_results: {
			...latestMeta,
			last_error: message,
			last_attempt_at: nowIso,
			unexpected_cron_error: true,
			cron_error_details: {
				at: nowIso,
				message,
				stack
			},
			debug_timeline: debugTimeline,
			debug_last_stage: 'cron_unexpected_exception',
			debug_last_at: nowIso
		}
	});
}

async function processBatch(supabase, { batchSize = 5 } = {}) {
	const { data, error } = await supabase.rpc('claim_group_social_posts', {
		target_batch_size: Math.max(1, Math.min(100, Number.parseInt(String(batchSize), 10) || 5))
	});
	if (error) throw new Error(error.message);
	const posts = Array.isArray(data) ? data : [];
	console.info('social_publish_cron_claimed', {
		claimed: posts.length,
		post_ids: posts.map((post) => post?.id).filter(Boolean)
	});

	const summary = {
		claimed: posts.length,
		published: 0,
		failed: 0,
		partial: 0,
		results: []
	};

	for (const post of posts) {
		try {
			const result = await publishSingleGroupSocialPost(supabase, {
				groupId: post.group_id,
				postId: post.id,
				post,
				requestedBy: null
			});
			summary.results.push({
				post_id: post.id,
				group_id: post.group_id,
				ok: result.ok,
				partial: result.partial === true,
				all_failed: result.all_failed === true
			});
			if (result.ok) summary.published += 1;
			else if (result.partial) summary.partial += 1;
			else summary.failed += 1;
		} catch (error) {
			const message = cleanText(error?.message, 1000) || 'Unexpected publish failure.';
			console.error('social_publish_cron_post_exception', {
				post_id: post.id,
				group_id: post.group_id,
				error: message,
				stack: cleanText(error?.stack, 4000) || null
			});
			await persistUnexpectedCronFailure(supabase, post, error).catch((updateError) => {
				console.error('social_publish_cron_post_exception_update_failed', {
					post_id: post.id,
					group_id: post.group_id,
					error: cleanText(updateError?.message, 1000) || 'Unable to persist cron error.',
					stack: cleanText(updateError?.stack, 4000) || null
				});
			});
			summary.results.push({
				post_id: post.id,
				group_id: post.group_id,
				ok: false,
				partial: false,
				all_failed: true,
				error: message
			});
			summary.failed += 1;
		}
	}

	return summary;
}

async function handleCron(event) {
	const requestedBatch = Number.parseInt(event.url.searchParams.get('batch') || '5', 10) || 5;
	console.info('social_publish_cron_start', {
		method: event.request.method,
		batch: requestedBatch
	});
	const authorized = await verifyCronRequest(event.request);
	if (!authorized) {
		console.warn('social_publish_cron_unauthorized');
		return json({ error: 'Unauthorized cron request' }, { status: 401 });
	}

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		console.error('social_publish_cron_no_service_client');
		return json({ error: 'Service role Supabase client unavailable.' }, { status: 500 });
	}

	try {
		const summary = await processBatch(supabase, {
			batchSize: requestedBatch
		});
		console.info('social_publish_cron_finish', summary);
		return json({ data: summary });
	} catch (error) {
		console.error('Social publish cron failed', error);
		return json({ error: error?.message || 'Social publish cron failed.' }, { status: 500 });
	}
}

export const GET = handleCron;
export const POST = handleCron;
