import {
	isCoreHostname,
	normalizeHostname,
	normalizeMicrositeSlug
} from '$lib/microsites/host';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

const CUSTOM_DOMAIN_LOOKUP_CACHE_TTL_MS = 60_000;
const customDomainSlugCache = new Map();

export async function lookupCustomDomainMicrositeSlug(hostname) {
	const normalizedHost = normalizeHostname(hostname);
	if (!normalizedHost || isCoreHostname(normalizedHost)) return '';

	const cached = customDomainSlugCache.get(normalizedHost);
	const now = Date.now();
	if (cached && cached.expiresAt > now) return cached.slug;

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) return '';

	const candidateHosts = normalizedHost.startsWith('www.')
		? [normalizedHost, normalizedHost.slice(4)]
		: [normalizedHost];

	const { data, error } = await serviceSupabase
		.from('group_site_domains')
		.select('domain,status,groups!inner(microsite_slug,slug)')
		.in('domain', candidateHosts)
		.eq('status', 'active')
		.limit(1)
		.maybeSingle();

	if (error || !data) {
		for (const candidateHost of candidateHosts) {
			customDomainSlugCache.set(candidateHost, {
				slug: '',
				expiresAt: now + CUSTOM_DOMAIN_LOOKUP_CACHE_TTL_MS
			});
		}
		return '';
	}

	const slug = normalizeMicrositeSlug(data?.groups?.microsite_slug || data?.groups?.slug || '');
	for (const candidateHost of candidateHosts) {
		customDomainSlugCache.set(candidateHost, {
			slug,
			expiresAt: now + CUSTOM_DOMAIN_LOOKUP_CACHE_TTL_MS
		});
	}
	return slug;
}
