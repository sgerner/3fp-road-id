import {
	shouldSkipMicrositeRouting,
	extractMicrositeSlugFromHostname,
	isCoreHostname,
	normalizeHostname
} from '#lib/microsites/host';

function buildMicrositeRoutePath(pathname, micrositeSlug) {
	const prefix = `/${encodeURIComponent(micrositeSlug)}`;
	if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return '';
	return `${prefix}${pathname === '/' ? '' : pathname}`;
}

export async function reroute({ url, fetch }) {
	const pathname = url.pathname || '/';
	if (shouldSkipMicrositeRouting(pathname)) return;

	const normalizedHost = normalizeHostname(url.hostname);
	const slugFromSubdomain = extractMicrositeSlugFromHostname(normalizedHost);
	let micrositeSlug = slugFromSubdomain;

	if (!micrositeSlug && !isCoreHostname(normalizedHost)) {
		const lookupUrl = new URL('/api/microsites/resolve', url);
		lookupUrl.searchParams.set('host', normalizedHost);
		const response = await fetch(lookupUrl).catch(() => null);
		if (response?.ok) {
			const payload = await response.json().catch(() => ({}));
			micrositeSlug = String(payload?.slug || '').trim();
		}
	}

	if (!micrositeSlug) return;
	return buildMicrositeRoutePath(pathname, micrositeSlug) || undefined;
}
