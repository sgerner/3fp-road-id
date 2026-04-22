import { extractMicrositeSlugFromHostname, normalizeHostname } from '$lib/microsites/host';
import { lookupCustomDomainMicrositeSlug } from '$lib/server/micrositeRouting';

const redirectCodes = new Set([
	'1NOS2hP3',
	'3feetpls',
	'49y051AL',
	'7TdxihGT',
	'87EzrSTD',
	'8mXja9Bi',
	'brbWc9Wt',
	'cgebSvLJ',
	'cIiYtomM',
	'f4nA6gQ9',
	'GoLFpbz7',
	'GykzHI7g',
	'hw87evAy',
	'J6p2LDn0',
	'kb1DlLij',
	'L3UROZDC',
	'LBsLxXfT',
	'LIiNAkPh',
	'LIKdWjDp',
	'mhEWnzsw',
	'mlzSKnFF',
	'mSlveUhE',
	'N3q1WvT7',
	'OzwFh9wJ',
	'qM540UyA',
	'R9PnlNMv',
	'RoIwoKOp',
	't04XPKxh',
	't2vz0k3w',
	'v7FbGYwz',
	'YdXQh5Ho',
	'YpIDE3Lz',
	'ZCwL6ysl'
]);

function firstHeaderValue(value) {
	return String(value || '')
		.split(',')[0]
		?.trim();
}

function shouldSkipMicrositeRedirect(pathname) {
	if (!pathname) return false;
	if (
		pathname.startsWith('/api') ||
		pathname.startsWith('/_app') ||
		pathname.startsWith('/site/') ||
		pathname.startsWith('/favicon')
	) {
		return true;
	}
	return /\.[a-z0-9]+$/i.test(pathname);
}

function resolveRequestHostname(event) {
	const headers = event.request.headers;
	const forwardedHost = normalizeHostname(firstHeaderValue(headers.get('x-forwarded-host')));
	if (forwardedHost) return forwardedHost;

	const hostHeader = normalizeHostname(firstHeaderValue(headers.get('host')));
	if (hostHeader) return hostHeader;

	return normalizeHostname(event.url.hostname);
}

export const handle = async ({ event, resolve }) => {
	const path = event.url.pathname.slice(1); // remove leading slash
	if (redirectCodes.has(path)) {
		return Response.redirect(`${event.url.origin}/roadid/${path}`, 301);
	}

	const pathname = event.url.pathname || '/';
	const normalizedHost = resolveRequestHostname(event);
	const slugFromSubdomain = extractMicrositeSlugFromHostname(normalizedHost);
	const slugFromCustomDomain =
		!slugFromSubdomain && !shouldSkipMicrositeRedirect(pathname)
			? await lookupCustomDomainMicrositeSlug(normalizedHost)
			: '';
	const micrositeSlug = slugFromSubdomain || slugFromCustomDomain;

	if (micrositeSlug) {
		event.locals.micrositeSlug = micrositeSlug;
		event.locals.micrositePublicPathname = pathname;
	}

	return resolve(event);
};
