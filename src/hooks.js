import { extractMicrositeSlugFromHostname } from '$lib/microsites/host';

export function reroute({ url }) {
	const micrositeSlug = extractMicrositeSlugFromHostname(url.hostname);
	if (!micrositeSlug) return;

	if (
		url.pathname.startsWith('/api') ||
		url.pathname.startsWith('/_app') ||
		url.pathname.startsWith('/site/')
	) {
		return;
	}

	if (/\.[a-z0-9]+$/i.test(url.pathname)) return;

	return `/site/${encodeURIComponent(micrositeSlug)}${url.pathname === '/' ? '' : url.pathname}`;
}
