import { json } from '@sveltejs/kit';
import { reviewEventSponsorshipRequest } from '#lib/server/eventSponsorships';
import { enforceRateLimit, readJsonBody } from '#lib/server/security';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';

export async function POST(event) {
	const ipLimited = enforceRateLimit(event, {
		name: 'group-sponsorship-review-ip',
		limit: 60,
		windowMs: 60 * 60 * 1000
	});
	if (ipLimited) return ipLimited;

	const { accessToken, user } = await resolveVerifiedSession(event.cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const userLimited = enforceRateLimit(event, {
		name: 'group-sponsorship-review-user',
		limit: 60,
		windowMs: 60 * 60 * 1000,
		key: user.id
	});
	if (userLimited) return userLimited;

	const parsedBody = await readJsonBody(event.request, { maxBytes: 16 * 1024 });
	if (!parsedBody.ok) {
		return json({ error: parsedBody.error }, { status: parsedBody.status });
	}

	const rawBody = parsedBody.value;
	if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
		return json({ error: 'JSON object body is required.' }, { status: 400 });
	}
	const body = /** @type {Record<string, any>} */ (rawBody);

	const supabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();

	const result = await reviewEventSponsorshipRequest({
		supabase,
		serviceSupabase,
		user,
		groupSlug: event.params.slug,
		requestId: event.params.requestId,
		decision: body.action || body.decision,
		decisionNote: body.decisionNote || body.note || '',
		fetchImpl: event.fetch
	});

	if (!result.ok) {
		return json({ error: result.error }, { status: result.status || 400 });
	}

	return json({ data: result.data });
}
