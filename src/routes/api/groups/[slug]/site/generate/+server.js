import { json } from '@sveltejs/kit';
import { requireGroupSiteAiOwner } from '#lib/server/groupSiteAuth';
import { getGroupSiteConfig } from '#lib/server/groupSites';
import { generateGroupSiteDraft } from '#lib/server/groupSiteDesigner';

export async function POST({ params, request, cookies }) {
	const auth = await requireGroupSiteAiOwner(cookies, params.slug);
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
