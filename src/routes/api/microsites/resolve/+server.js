import { json } from '@sveltejs/kit';
import { lookupCustomDomainMicrositeSlug } from '$lib/server/micrositeRouting';

function cleanHost(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

export const GET = async ({ url }) => {
	const host = cleanHost(url.searchParams.get('host'));
	if (!host) {
		return json({ slug: '' });
	}

	const slug = await lookupCustomDomainMicrositeSlug(host).catch(() => '');
	return json({ slug });
};
