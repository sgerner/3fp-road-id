import { json } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import { createServiceSupabaseClient } from '#lib/server/supabaseClient';
import { enforceRateLimit } from '#lib/server/security';
import { unlinkRoadIdCodeForUser } from '#lib/server/roadId';

export async function DELETE(event) {
	const limited = enforceRateLimit(event, {
		name: 'road-id-unlink',
		limit: 30,
		windowMs: 60 * 60 * 1000
	});
	if (limited) return limited;

	const { user } = await resolveVerifiedSession(event.cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const serviceSupabase = createServiceSupabaseClient();
	const result = await unlinkRoadIdCodeForUser({
		serviceSupabase,
		userId: user.id,
		rawCode: event.params.code
	});

	if (!result.ok) {
		return json({ error: result.error }, { status: result.status });
	}

	return json({
		ok: true,
		unlinkedCode: result.unlinkedCode,
		codes: result.codes
	});
}
