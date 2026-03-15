import { json } from '@sveltejs/kit';
import { getCronSecretVerifier } from '$lib/server/activities';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { publishSingleGroupSocialPost } from '$lib/server/social/publish';

async function verifyCronRequest(request) {
	const providedSecret =
		request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
		request.headers.get('x-cron-secret') ||
		request.headers.get('x-vercel-secret') ||
		'';
	if (!providedSecret) return false;
	return getCronSecretVerifier('social_publish', providedSecret);
}

async function processBatch(supabase, { batchSize = 20 } = {}) {
	const { data, error } = await supabase.rpc('claim_group_social_posts', {
		target_batch_size: Math.max(1, Math.min(100, Number.parseInt(String(batchSize), 10) || 20))
	});
	if (error) throw new Error(error.message);
	const posts = Array.isArray(data) ? data : [];

	const summary = {
		claimed: posts.length,
		published: 0,
		failed: 0,
		partial: 0,
		results: []
	};

	for (const post of posts) {
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
	}

	return summary;
}

async function handleCron(event) {
	const authorized = await verifyCronRequest(event.request);
	if (!authorized) {
		return json({ error: 'Unauthorized cron request' }, { status: 401 });
	}

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		return json({ error: 'Service role Supabase client unavailable.' }, { status: 500 });
	}

	try {
		const summary = await processBatch(supabase, {
			batchSize: Number.parseInt(event.url.searchParams.get('batch') || '20', 10) || 20
		});
		return json({ data: summary });
	} catch (error) {
		console.error('Social publish cron failed', error);
		return json({ error: error?.message || 'Social publish cron failed.' }, { status: 500 });
	}
}

export const GET = handleCron;
export const POST = handleCron;
