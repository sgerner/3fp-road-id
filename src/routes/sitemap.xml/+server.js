import { loadGroupMicrosite } from '$lib/server/groupSites';
import { extractMicrositeSlugFromHostname, normalizeMicrositeSlug } from '$lib/microsites/host';
import { lookupCustomDomainMicrositeSlug } from '$lib/server/micrositeRouting';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';

function escapeXml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function normalizePathname(pathname) {
	const value = String(pathname || '').trim() || '/';
	const stripped = value.replace(/\/+$/g, '');
	return stripped || '/';
}

function joinPathname(basePath, segment) {
	const base = normalizePathname(basePath);
	const cleanSegment = String(segment || '').replace(/^\/+|\/+$/g, '');
	if (!cleanSegment) return base;
	return base === '/' ? `/${cleanSegment}` : `${base}/${cleanSegment}`;
}

function toAbsoluteUrl(origin, pathname) {
	try {
		return new URL(pathname, origin).toString();
	} catch {
		return `${origin}${pathname}`;
	}
}

function pickDbClient() {
	return createServiceSupabaseClient() ?? createRequestSupabaseClient(null);
}

async function resolveRequestMicrositeSlug(url) {
	const normalizedHost = String(url.hostname || '').toLowerCase().replace(/:\d+$/, '');
	const subdomainSlug = extractMicrositeSlugFromHostname(normalizedHost);
	if (subdomainSlug) return subdomainSlug;

	return lookupCustomDomainMicrositeSlug(normalizedHost);
}

async function loadPublishedGroupRows() {
	const db = pickDbClient();
	const { data: groups } = await db
		.from('groups')
		.select('id,slug,microsite_slug,updated_at,is_published')
		.eq('is_published', true)
		.order('updated_at', { ascending: false })
		.limit(5000);
	const rows = Array.isArray(groups) ? groups : [];
	const groupIds = rows.map((group) => group?.id).filter(Boolean);
	if (!groupIds.length) return rows.map((group) => ({ group, config: null }));

	const { data: configs } = await db
		.from('group_site_configs')
		.select('group_id,published,updated_at')
		.in('group_id', groupIds);
	const configByGroupId = new Map(
		(Array.isArray(configs) ? configs : []).map((config) => [config.group_id, config])
	);

	return rows
		.map((group) => ({
			group,
			config: configByGroupId.get(group.id) || null
		}))
		.filter(({ config }) => config?.published !== false);
}

function buildMicrositeEntries(site, origin) {
	const entries = [];
	const homePath = normalizePathname(site?.basePath || '/');
	const homeUrl = toAbsoluteUrl(origin, homePath);
	const homeLastmod = site?.group?.updated_at || site?.siteConfig?.updated_at || null;

	entries.push({ loc: homeUrl, lastmod: homeLastmod });

	if (site?.siteConfig?.sections?.news && (site?.newsPosts?.length || 0) > 0) {
		const latestNews = site.newsPosts.find((post) => post?.published_at || post?.created_at) || null;
		entries.push({
			loc: toAbsoluteUrl(origin, joinPathname(homePath, 'updates')),
			lastmod: latestNews?.published_at || latestNews?.created_at || homeLastmod
		});
	}

	if (site?.siteConfig?.sections?.gallery && (site?.photoBucket?.asset_count || 0) > 0) {
		entries.push({
			loc: toAbsoluteUrl(origin, joinPathname(homePath, 'gallery')),
			lastmod: homeLastmod
		});
	}

	if (site?.siteConfig?.sections?.join) {
		entries.push({
			loc: toAbsoluteUrl(origin, joinPathname(homePath, 'join')),
			lastmod: homeLastmod
		});
	}

	if ((site?.assetBuckets || []).some((bucket) => (bucket?.asset_count || 0) > 0)) {
		entries.push({
			loc: toAbsoluteUrl(origin, joinPathname(homePath, 'assets')),
			lastmod: homeLastmod
		});
	}

	return entries;
}

function buildCoreEntries(origin) {
	return [
		'/',
		'/groups',
		'/ride',
		'/volunteer',
		'/learn',
		'/merch',
		'/get-involved',
		'/donate',
		'/roadid',
		'/terms',
		'/privacy',
		'/data-deletion'
	].map((pathname) => ({ loc: toAbsoluteUrl(origin, pathname), lastmod: null }));
}

function buildXmlUrlEntry({ loc, lastmod = null }) {
	const pieces = [`    <loc>${escapeXml(loc)}</loc>`];
	if (lastmod) {
		const parsed = new Date(lastmod);
		if (!Number.isNaN(parsed.getTime())) {
			pieces.push(`    <lastmod>${escapeXml(parsed.toISOString())}</lastmod>`);
		}
	}
	return `<url>\n${pieces.join('\n')}\n  </url>`;
}

function buildSitemapXml(entries) {
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
		.map((entry) => buildXmlUrlEntry(entry))
		.join('\n')}\n</urlset>\n`;
}

export const GET = async ({ fetch, url }) => {
	const micrositeSlug = await resolveRequestMicrositeSlug(url);
	const entries = [];

	if (micrositeSlug) {
		const site = await loadGroupMicrosite({
			siteSlug: micrositeSlug,
			fetch,
			url,
			publicPathname: '/'
		}).catch(() => null);
		if (site) {
			entries.push(...buildMicrositeEntries(site, url.origin));
		}
	}

	if (!entries.length) {
		const publishedSites = await loadPublishedGroupRows().catch(() => []);
		for (const { group, config } of publishedSites) {
			const micrositePath = `/${normalizeMicrositeSlug(group?.microsite_slug || group?.slug || '')}`;
			if (!micrositePath || micrositePath === '/') continue;
			entries.push({
				loc: toAbsoluteUrl(url.origin, micrositePath),
				lastmod: config?.updated_at || group?.updated_at || null
			});
		}
		entries.push(...buildCoreEntries(url.origin));
	}

	const xml = buildSitemapXml(entries);
	return new Response(xml, {
		status: 200,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400'
		}
	});
};
