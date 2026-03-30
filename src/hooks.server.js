import {
	extractMicrositeSlugFromHostname,
	normalizeHostname,
	normalizeMicrositeSlug
} from '$lib/microsites/host';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

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

const CUSTOM_DOMAIN_LOOKUP_CACHE_TTL_MS = 60_000;
const customDomainSlugCache = new Map();

function isCoreHostname(hostname) {
	return (
		!hostname ||
		hostname === '3fp.bike' ||
		hostname === 'www.3fp.bike' ||
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname.endsWith('.localhost')
	);
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

async function lookupCustomDomainMicrositeSlug(hostname) {
	const normalizedHost = normalizeHostname(hostname);
	if (!normalizedHost || isCoreHostname(normalizedHost)) return '';

	const cached = customDomainSlugCache.get(normalizedHost);
	const now = Date.now();
	if (cached && cached.expiresAt > now) return cached.slug;

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) return '';

	const { data, error } = await serviceSupabase
		.from('group_site_domains')
		.select('domain,status,groups!inner(microsite_slug,slug)')
		.eq('domain', normalizedHost)
		.eq('status', 'active')
		.maybeSingle();

	if (error || !data) {
		customDomainSlugCache.set(normalizedHost, {
			slug: '',
			expiresAt: now + CUSTOM_DOMAIN_LOOKUP_CACHE_TTL_MS
		});
		return '';
	}

	const slug = normalizeMicrositeSlug(data?.groups?.microsite_slug || data?.groups?.slug || '');
	customDomainSlugCache.set(normalizedHost, {
		slug,
		expiresAt: now + CUSTOM_DOMAIN_LOOKUP_CACHE_TTL_MS
	});
	return slug;
}

export const handle = async ({ event, resolve }) => {
	const path = event.url.pathname.slice(1); // remove leading slash
	if (redirectCodes.has(path)) {
		return Response.redirect(`${event.url.origin}/roadid/${path}`, 301);
	}

	const pathname = event.url.pathname || '/';
	const normalizedHost = normalizeHostname(event.url.hostname);
	const slugFromSubdomain = extractMicrositeSlugFromHostname(normalizedHost);

	if (!slugFromSubdomain && !shouldSkipMicrositeRedirect(pathname)) {
		const slugFromCustomDomain = await lookupCustomDomainMicrositeSlug(normalizedHost);
		if (slugFromCustomDomain) {
			const prefix = `/${encodeURIComponent(slugFromCustomDomain)}`;
			if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
				const targetUrl = new URL(event.url);
				targetUrl.pathname = `${prefix}${pathname === '/' ? '' : pathname}`;
				return Response.redirect(targetUrl.toString(), 307);
			}
		}
	}

	return resolve(event);
};
