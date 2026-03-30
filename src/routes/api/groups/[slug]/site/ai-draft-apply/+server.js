import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { mergeGroupSiteConfig } from '$lib/microsites/config';
import { getGroupSiteConfig, upsertGroupSiteConfig } from '$lib/server/groupSites';

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

async function requireOwner(cookies, groupSlug) {
	const sessionCookie = cookies.get('sb_session');
	if (!sessionCookie) return { ok: false, status: 401, error: 'Authentication required.' };

	let parsed = null;
	try {
		parsed = JSON.parse(sessionCookie);
	} catch {
		parsed = null;
	}

	const accessToken = parsed?.access_token;
	if (!accessToken) return { ok: false, status: 401, error: 'Authentication required.' };
	const { data: userRes } = await supabase.auth.getUser(accessToken);
	const userId = userRes?.user?.id ?? null;
	if (!userId) return { ok: false, status: 401, error: 'Authentication required.' };

	const { data: group } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', groupSlug)
		.maybeSingle();
	if (!group) return { ok: false, status: 404, error: 'Group not found.' };

	const [{ data: profile }, { data: ownerRows }] = await Promise.all([
		supabase.from('profiles').select('admin').eq('user_id', userId).maybeSingle(),
		supabase
			.from('group_members')
			.select('user_id')
			.eq('group_id', group.id)
			.eq('user_id', userId)
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
	const proposedConfig =
		payload?.config && typeof payload.config === 'object' && !Array.isArray(payload.config)
			? payload.config
			: null;
	if (!proposedConfig) {
		return json({ error: 'Draft config is required.' }, { status: 400 });
	}

	const generationPrompt = cleanText(payload?.generationPrompt);
	const source = cleanText(payload?.source) || 'ai';
	const currentConfig = await getGroupSiteConfig(auth.group.id, { group: auth.group });
	const nextConfig = mergeGroupSiteConfig(currentConfig, proposedConfig, {
		ai_prompt: generationPrompt || currentConfig.ai_prompt || ''
	});
	await upsertGroupSiteConfig(auth.group.id, nextConfig);

	return json({
		ok: true,
		source,
		config: nextConfig
	});
}
