import { json } from '@sveltejs/kit';
import {
	cancelEventSponsorshipRequest,
	createOrUpdateEventSponsorshipRequest
} from '#lib/server/eventSponsorships';
import { enforceRateLimit, readJsonBody } from '#lib/server/security';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';

export async function POST(event) {
	const ipLimited = enforceRateLimit(event, {
		name: 'event-sponsorship-ip',
		limit: 20,
		windowMs: 60 * 60 * 1000
	});
	if (ipLimited) return ipLimited;

	const { accessToken, user } = await resolveVerifiedSession(event.cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const userLimited = enforceRateLimit(event, {
		name: 'event-sponsorship-user',
		limit: 10,
		windowMs: 60 * 60 * 1000,
		key: user.id
	});
	if (userLimited) return userLimited;

	const parsedBody = await readJsonBody(event.request, { maxBytes: 32 * 1024 });
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

	const result = await createOrUpdateEventSponsorshipRequest({
		supabase,
		serviceSupabase,
		user,
		eventType: body.eventType,
		eventId: body.eventId,
		groupId: body.groupId,
		message: body.message,
		fetchImpl: event.fetch
	});

	if (!result.ok) {
		return json({ error: result.error, code: result.code }, { status: result.status || 400 });
	}

	return json({ data: result.data, notified: result.notified }, { status: result.status || 201 });
}

/** @param {import('./$types').RequestEvent} event */
export async function DELETE(event) {
	const ipLimited = enforceRateLimit(event, {
		name: 'event-sponsorship-cancel-ip',
		limit: 30,
		windowMs: 60 * 60 * 1000
	});
	if (ipLimited) return ipLimited;

	const { accessToken, user } = await resolveVerifiedSession(event.cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	/** @type {Record<string, any>} */
	let body = {};
	if (event.request.headers.get('content-type')?.includes('application/json')) {
		const parsedBody = await readJsonBody(event.request, { maxBytes: 16 * 1024 });
		if (
			parsedBody.ok &&
			parsedBody.value &&
			typeof parsedBody.value === 'object' &&
			!Array.isArray(parsedBody.value)
		) {
			body = /** @type {Record<string, any>} */ (parsedBody.value);
		}
	}

	const requestId = body.requestId || event.url.searchParams.get('requestId') || '';
	const eventType = body.eventType || event.url.searchParams.get('eventType') || '';
	const eventId = body.eventId || event.url.searchParams.get('eventId') || '';

	const supabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();

	const result = await cancelEventSponsorshipRequest({
		supabase,
		serviceSupabase,
		user,
		requestId,
		eventType,
		eventId
	});

	if (!result.ok) {
		return json({ error: result.error }, { status: result.status || 400 });
	}

	return json({ data: result.data });
}
