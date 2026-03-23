import { fail, redirect } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { buildMicrositeUrl } from '$lib/microsites/host';
import {
	buildDefaultGroupSiteConfig,
	mergeGroupSiteConfig,
	parseGroupSiteFormData
} from '$lib/microsites/config';
import {
	deriveGroupSitePalette,
	getGroupSiteConfig,
	upsertGroupSiteConfig
} from '$lib/server/groupSites';
import { generateGroupSiteDraft } from '$lib/server/groupSiteDesigner';

async function requireSiteManager(cookies, slug) {
	const sessionCookie = cookies.get('sb_session');
	if (!sessionCookie) throw redirect(303, `/groups/${slug}?auth=required`);

	let parsed = null;
	try {
		parsed = JSON.parse(sessionCookie);
	} catch {
		parsed = null;
	}

	const accessToken = parsed?.access_token;
	if (!accessToken) throw redirect(303, `/groups/${slug}?auth=required`);

	const { data: userRes } = await supabase.auth.getUser(accessToken);
	const userId = userRes?.user?.id;
	if (!userId) throw redirect(303, `/groups/${slug}?auth=required`);

	const { data: group } = await supabase.from('groups').select('*').eq('slug', slug).maybeSingle();
	if (!group) throw redirect(303, `/groups/${slug}`);

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
		throw redirect(303, `/groups/${slug}?auth=forbidden`);
	}

	return { group, userId, isAdmin: profile?.admin === true };
}

export const load = async ({ parent, url }) => {
	const parentData = await parent();
	const group = parentData.group;
	const siteConfig = await getGroupSiteConfig(group.id, { group });
	const previewPath = `/site/${encodeURIComponent(group.slug)}`;
	const liveUrl = buildMicrositeUrl(group.slug, url);

	return {
		group,
		siteConfig,
		defaultSiteConfig: buildDefaultGroupSiteConfig(group),
		previewPath,
		liveUrl,
		saved: (url.searchParams.get('saved') || '').trim(),
		generated: (url.searchParams.get('generated') || '').trim(),
		reset: (url.searchParams.get('reset') || '').trim()
	};
};

export const actions = {
	save: async ({ params, request, cookies }) => {
		const auth = await requireSiteManager(cookies, params.slug);
		const formData = await request.formData();
		const nextConfig = parseGroupSiteFormData(formData, { group: auth.group });
		await upsertGroupSiteConfig(auth.group.id, nextConfig);
		throw redirect(303, `/groups/${params.slug}/manage/site?saved=1`);
	},
	deriveTheme: async ({ params, cookies }) => {
		const auth = await requireSiteManager(cookies, params.slug);
		const currentConfig = await getGroupSiteConfig(auth.group.id, { group: auth.group });
		const palette = await deriveGroupSitePalette(auth.group, currentConfig);
		const nextConfig = mergeGroupSiteConfig(currentConfig, {
			theme_mode: 'custom',
			theme_colors: palette
		});
		await upsertGroupSiteConfig(auth.group.id, nextConfig);
		throw redirect(303, `/groups/${params.slug}/manage/site?saved=palette`);
	},
	generate: async ({ params, request, cookies }) => {
		const auth = await requireSiteManager(cookies, params.slug);
		const formData = await request.formData();
		const prompt = (formData.get('generation_prompt') || '').toString();
		const currentConfig = await getGroupSiteConfig(auth.group.id, { group: auth.group });
		const generated = await generateGroupSiteDraft({
			group: auth.group,
			currentConfig,
			prompt
		});

		const nextConfig = mergeGroupSiteConfig(generated.config, {
			ai_prompt: prompt
		});
		await upsertGroupSiteConfig(auth.group.id, nextConfig);
		throw redirect(
			303,
			`/groups/${params.slug}/manage/site?generated=${generated.source === 'ai' ? 'ai' : 'fallback'}`
		);
	},
	reset: async ({ params, cookies }) => {
		const auth = await requireSiteManager(cookies, params.slug);
		const { error } = await supabase.from('group_site_configs').delete().eq('group_id', auth.group.id);
		if (error) {
			return fail(400, { error: error.message });
		}
		throw redirect(303, `/groups/${params.slug}/manage/site?reset=1`);
	}
};

