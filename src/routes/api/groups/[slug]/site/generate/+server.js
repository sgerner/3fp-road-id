import { json } from '@sveltejs/kit';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';
import { getGroupSiteConfig } from '$lib/server/groupSites';
import { generateGroupSiteDraft } from '$lib/server/groupSiteDesigner';

async function requireOwner(cookies, groupSlug) {
	const { accessToken, user } = resolveSession(cookies);
	if (!accessToken || !user?.id) return { ok: false, status: 401, error: 'Authentication required.' };

	const supabase = createRequestSupabaseClient(accessToken);
	const { data: group } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', groupSlug)
		.maybeSingle();
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		supabase.from('profiles').select('admin').eq('user_id', user.id).maybeSingle(),
		supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.eq('role', 'owner')
	]);

	if (!(profile?.admin === true) && !(ownerRows ?? []).length) {
		return { ok: false, status: 403, error: 'You do not have permission to manage this site.' };
	}

	return { ok: true, group };
}

export async function POST({ params, request, cookies }) {
	const auth = await requireOwner(cookies, params.slug);
	if (!auth.ok) {
		return json({ error: auth.error }, { status: auth.status });
	}

	const payload = await request.json().catch(() => ({}));
	const prompt = typeof payload?.prompt === 'string' ? payload.prompt : '';
	const currentConfig = await getGroupSiteConfig(auth.group.id, { group: auth.group });
	const generated = await generateGroupSiteDraft({
		group: auth.group,
		currentConfig,
		prompt,
		allowDesignChanges: true
	});

	return json(generated);
}
