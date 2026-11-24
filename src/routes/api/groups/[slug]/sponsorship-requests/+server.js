import { json } from '@sveltejs/kit';
import { canUserManageGroup, listGroupSponsorshipRequests } from '#lib/server/eventSponsorships';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';

export async function GET(event) {
	const { accessToken, user } = await resolveVerifiedSession(event.cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return json({ error: 'Sponsorship requests are temporarily unavailable.' }, { status: 503 });
	}

	const slug = String(event.params.slug || '').trim();
	const { data: group, error: groupError } = await serviceSupabase
		.from('groups')
		.select('id, name, slug')
		.eq('slug', slug)
		.maybeSingle();

	if (groupError || !group) {
		return json({ error: 'Organization not found.' }, { status: 404 });
	}

	const supabase = createRequestSupabaseClient(accessToken);
	const canManage = await canUserManageGroup(supabase, serviceSupabase, user.id, group.id);
	if (!canManage) {
		return json(
			{ error: 'You do not have permission to view sponsorship requests for this organization.' },
			{ status: 403 }
		);
	}

	const requests = await listGroupSponsorshipRequests({
		serviceSupabase,
		groupId: group.id,
		group
	});

	return json({ data: requests });
}
