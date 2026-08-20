import { json } from '@sveltejs/kit';
import { mergeGroupSiteConfig } from '$lib/microsites/config';
import { requireGroupSiteManager } from '$lib/server/groupSiteAuth';
import { deriveGroupSitePalette, getGroupSiteConfig } from '$lib/server/groupSites';

export async function POST({ params, request, cookies }) {
	const auth = await requireGroupSiteManager({ cookies, groupSlug: params.slug });
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

	const payload = await request.json().catch(() => ({}));
	const localConfig =
		payload?.config && typeof payload.config === 'object' && !Array.isArray(payload.config)
			? payload.config
			: {};
	const persistedConfig = await getGroupSiteConfig(auth.group.id, { group: auth.group });
	const config = mergeGroupSiteConfig(persistedConfig, localConfig);
	const palette = await deriveGroupSitePalette(auth.group, config);
	return json({ data: { palette } });
}
