import { json } from '@sveltejs/kit';
import { claimBraceletForUser, isValidRoadIdCode } from '#lib/server/roadIdProfile';
import { enforceRateLimit } from '#lib/server/security';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';

export async function POST(event) {
	const { accessToken, user } = await resolveVerifiedSession(event.cookies);
	if (!accessToken || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const limited = enforceRateLimit(event, {
		name: 'road-id-code-claim',
		limit: 20,
		windowMs: 15 * 60 * 1000,
		key: user.id
	});
	if (limited) return limited;

	const code = event.params.code || '';
	if (!isValidRoadIdCode(code)) {
		return json({ error: 'Invalid bracelet code.' }, { status: 400 });
	}

	const serviceSupabase = createServiceSupabaseClient();
	const userSupabase = createRequestSupabaseClient(accessToken);

	const result = await claimBraceletForUser({
		serviceSupabase,
		userSupabase,
		userId: user.id,
		code
	});

	if (!result.ok) {
		return json({ error: result.error }, { status: result.status || 400 });
	}

	return json({
		code: result.code,
		claimed: true,
		redirectTo: `/profile?claimed=${encodeURIComponent(result.code)}#safety`
	});
}
