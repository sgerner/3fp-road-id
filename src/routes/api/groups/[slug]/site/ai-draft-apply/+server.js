import { json } from '@sveltejs/kit';
import { requireGroupSiteAiOwner } from '#lib/server/groupSiteAuth';
import { mergeGroupSiteConfig } from '#lib/microsites/config';
import { getGroupSiteConfig } from '#lib/server/groupSites';

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export async function POST({ params, request, cookies }) {
	const auth = await requireGroupSiteAiOwner(cookies, params.slug);
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
	return json({
		ok: true,
		source,
		config: nextConfig,
		persisted: false
	});
}
