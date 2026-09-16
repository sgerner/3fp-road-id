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
	const requestUrlHostname = normalizeHostname(event.url.hostname);
	if (requestUrlHostname) return requestUrlHostname;

	const hostHeader = normalizeHostname(firstHeaderValue(headers.get('host')));
	if (hostHeader) return hostHeader;

	return normalizeHostname(event.url.hostname);
}

export const handle = async ({ event, resolve }) => {
	const path = event.url.pathname.slice(1); // remove leading slash
	if (redirectCodes.has(path)) {
		return new Response(null, {
			status: 301,
			headers: { location: `/roadid/${path}` }
		});
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

	const response = await resolve(event);
	const securityHeaders = {
		'x-content-type-options': 'nosniff',
		'referrer-policy': 'strict-origin-when-cross-origin',
		'permissions-policy':
			'camera=(), geolocation=(), microphone=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()',
		'x-dns-prefetch-control': 'off',
		'x-permitted-cross-domain-policies': 'none'
	};
	for (const [name, value] of Object.entries(securityHeaders)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	if (!pathname.startsWith('/ride/widget/frame')) {
		if (!response.headers.has('x-frame-options')) {
			response.headers.set('x-frame-options', 'SAMEORIGIN');
		}
		response.headers.append('content-security-policy', "frame-ancestors 'self'");
	}

	if (event.url.protocol === 'https:') {
		response.headers.set('strict-transport-security', 'max-age=31536000');
	}

	return response;
};
