import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { enforceRateLimit, readJsonBody } from '#lib/server/security';
import { claimRoadIdCodeForUser, loadUserRoadIdBundle } from '#lib/server/roadId';
import { reconcileAfterBraceletClaim } from '#lib/server/roadIdProfile';

export async function GET({ cookies }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const requestSupabase = createRequestSupabaseClient(accessToken);
	const bundle = await loadUserRoadIdBundle(requestSupabase, user.id);

	return json({ codes: bundle.linkedCodes });
}

export async function POST(event) {
	const limited = enforceRateLimit(event, {
		name: 'road-id-claim',
		limit: 20,
		windowMs: 60 * 60 * 1000
	});
	if (limited) return limited;

	const { accessToken, user } = await resolveVerifiedSession(event.cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const userLimited = enforceRateLimit(event, {
		name: 'road-id-claim-user',
		limit: 20,
		windowMs: 60 * 60 * 1000,
		key: user.id
	});
	if (userLimited) return userLimited;

	const parsedBody = await readJsonBody(event.request, { maxBytes: 4 * 1024 });
	if (!parsedBody.ok) {
		return json({ error: parsedBody.error }, { status: parsedBody.status });
	}
	const body = parsedBody.value;
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const serviceSupabase = createServiceSupabaseClient();
	const result = await claimRoadIdCodeForUser({
		serviceSupabase,
		userId: user.id,
		rawCode: body.code,
		seedFullName:
			typeof user.user_metadata?.full_name === 'string'
				? user.user_metadata.full_name.trim().slice(0, 200)
				: null,
		allowAlreadyOwned: body.allowAlreadyOwned === true
	});

	if (!result.ok) {
		return json({ error: result.error }, { status: result.status });
	}

	let resolvedProfile = result.profile;
	let resolvedCodes = result.codes;
	if (accessToken) {
		try {
			const requestSupabase = createRequestSupabaseClient(accessToken);
			await reconcileAfterBraceletClaim(requestSupabase, user.id);
			const refreshed = await loadUserRoadIdBundle(requestSupabase, user.id);
			resolvedProfile = refreshed.roadIdProfile ?? resolvedProfile;
			resolvedCodes = refreshed.linkedCodes.length ? refreshed.linkedCodes : resolvedCodes;
		} catch (err) {
			console.warn('Unable to reconcile rider safety data after bracelet claim:', err);
		}
	}

	return json({
		ok: true,
		status: result.claimStatus,
		code: result.code,
		profile: resolvedProfile,
		codes: resolvedCodes
	});
}
