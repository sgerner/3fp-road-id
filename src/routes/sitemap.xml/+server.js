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
	const normalizedHost = String(url.hostname || '')
		.toLowerCase()
		.replace(/:\d+$/, '');
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

async function loadPublicGroupRows() {
	const db = pickDbClient();
	const { data } = await db
		.from('groups')
		.select('id,slug,updated_at,is_published')
		.eq('is_published', true)
		.order('updated_at', { ascending: false })
		.limit(5000);
	return Array.isArray(data) ? data : [];
}

async function loadPublishedRideRows() {
	const db = pickDbClient();
	const { data } = await db
		.from('activity_events')
		.select('slug,updated_at,published_at,created_at')
		.eq('activity_type', 'ride')
		.eq('status', 'published')
		.order('updated_at', { ascending: false })
		.limit(5000);
	return Array.isArray(data) ? data : [];
}

async function loadPublishedLearnRows() {
	const db = pickDbClient();
	const { data } = await db
		.from('learn_articles')
		.select('slug,updated_at,published_at,created_at,category_slug,category_name,is_published')
		.eq('is_published', true)
		.order('updated_at', { ascending: false })
		.limit(5000);
	return Array.isArray(data) ? data : [];
}

async function loadPublishedVolunteerRows() {
	const db = pickDbClient();
	const { data } = await db
		.from('volunteer_events')
		.select('slug,updated_at,published_at,created_at,status,event_start,event_end')
		.eq('status', 'published')
		.order('updated_at', { ascending: false })
		.limit(5000);
	return Array.isArray(data) ? data : [];
}

async function loadPublishedGroupNewsRows() {
	const db = pickDbClient();
	const { data } = await db
		.from('group_news_posts')
		.select('group_id,slug,updated_at,published_at,created_at')
		.not('published_at', 'is', null)
		.eq('is_private', false)
		.order('published_at', { ascending: false, nullsFirst: false })
		.order('updated_at', { ascending: false })
		.limit(5000);
	return Array.isArray(data) ? data : [];
}

function toSitemapTimestamp(...values) {
	for (const value of values) {
		if (!value) continue;
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
	}
	return null;
}

function addSitemapEntry(entryMap, loc, lastmod) {
	if (!loc) return;
	const normalizedLastmod = toSitemapTimestamp(lastmod);
	const current = entryMap.get(loc);
	if (!current) {
		entryMap.set(loc, { loc, lastmod: normalizedLastmod });
		return;
	}
	if (!normalizedLastmod) return;
	if (!current.lastmod) {
		entryMap.set(loc, { loc, lastmod: normalizedLastmod });
		return;
	}
	if (new Date(normalizedLastmod).getTime() > new Date(current.lastmod).getTime()) {
		entryMap.set(loc, { loc, lastmod: normalizedLastmod });
	}
}

function addCommonPublicEntries(entryMap, origin) {
	for (const pathname of [
		'/',
		'/groups',
		'/ride',
		'/volunteer',
		'/learn',
		'/volunteer/groups',
		'/merch',
		'/get-involved',
		'/donate',
		'/roadid',
		'/terms',
		'/privacy',
		'/data-deletion'
	]) {
		addSitemapEntry(entryMap, toAbsoluteUrl(origin, pathname), null);
	}
}

function buildMicrositeEntries(site, origin) {
	const entries = [];
	const homePath = normalizePathname(site?.basePath || '/');
	const homeUrl = toAbsoluteUrl(origin, homePath);
	const homeLastmod = site?.group?.updated_at || site?.siteConfig?.updated_at || null;

	entries.push({ loc: homeUrl, lastmod: homeLastmod });

	if (site?.siteConfig?.sections?.news && (site?.newsPosts?.length || 0) > 0) {
		const latestNews =
			site.newsPosts.find((post) => post?.published_at || post?.created_at) || null;
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
	const entryMap = new Map();

	if (micrositeSlug) {
		const site = await loadGroupMicrosite({
			siteSlug: micrositeSlug,
			fetch,
			url,
			publicPathname: '/'
		}).catch(() => null);
		if (site) {
			for (const entry of buildMicrositeEntries(site, url.origin)) {
				addSitemapEntry(entryMap, entry.loc, entry.lastmod);
			}
		}
	}

	if (!entryMap.size) {
		const [publishedSites, publicGroups, rideRows, learnRows, volunteerRows, groupNewsRows] =
			await Promise.all([
				loadPublishedGroupRows().catch(() => []),
				loadPublicGroupRows().catch(() => []),
				loadPublishedRideRows().catch(() => []),
				loadPublishedLearnRows().catch(() => []),
				loadPublishedVolunteerRows().catch(() => []),
				loadPublishedGroupNewsRows().catch(() => [])
			]);

		for (const { group, config } of publishedSites) {
			const groupSlug = normalizeMicrositeSlug(group?.slug || '');
			if (groupSlug) {
				addSitemapEntry(
					entryMap,
					toAbsoluteUrl(url.origin, `/groups/${groupSlug}`),
					config?.updated_at || group?.updated_at || null
				);
			}
		}

		for (const row of rideRows) {
			if (!row?.slug) continue;
			addSitemapEntry(
				entryMap,
				toAbsoluteUrl(url.origin, `/ride/${encodeURIComponent(row.slug)}`),
				row.published_at || row.updated_at || row.created_at || null
			);
		}

		const learnCategoryMap = new Map();
		for (const row of learnRows) {
			if (!row?.slug) continue;
			addSitemapEntry(
				entryMap,
				toAbsoluteUrl(url.origin, `/learn/${encodeURIComponent(row.slug)}`),
				row.published_at || row.updated_at || row.created_at || null
			);
			if (!row.category_slug) continue;
			const current = learnCategoryMap.get(row.category_slug) || null;
			const nextStamp = row.updated_at || row.published_at || row.created_at || null;
			if (!current) {
				learnCategoryMap.set(row.category_slug, {
					slug: row.category_slug,
					lastmod: nextStamp
				});
				continue;
			}
			const currentStamp = toSitemapTimestamp(current.lastmod);
			const nextTs = toSitemapTimestamp(nextStamp);
			if (
				nextTs &&
				(!currentStamp || new Date(nextTs).getTime() > new Date(currentStamp).getTime())
			) {
				learnCategoryMap.set(row.category_slug, {
					slug: row.category_slug,
					lastmod: nextStamp
				});
			}
		}

		for (const category of learnCategoryMap.values()) {
			addSitemapEntry(
				entryMap,
				toAbsoluteUrl(url.origin, `/learn/category/${encodeURIComponent(category.slug)}`),
				category.lastmod
			);
		}

		for (const row of volunteerRows) {
			if (!row?.slug) continue;
			addSitemapEntry(
				entryMap,
				toAbsoluteUrl(url.origin, `/volunteer/${encodeURIComponent(row.slug)}`),
				row.published_at ||
					row.updated_at ||
					row.created_at ||
					row.event_start ||
					row.event_end ||
					null
			);
		}

		const groupNewsLatestByGroupId = new Map();
		for (const row of groupNewsRows) {
			if (!row?.group_id) continue;
			const nextStamp = row.published_at || row.updated_at || row.created_at || null;
			const current = groupNewsLatestByGroupId.get(row.group_id);
			if (!current) {
				groupNewsLatestByGroupId.set(row.group_id, nextStamp);
				continue;
			}
			const currentStamp = toSitemapTimestamp(current);
			const nextTs = toSitemapTimestamp(nextStamp);
			if (
				nextTs &&
				(!currentStamp || new Date(nextTs).getTime() > new Date(currentStamp).getTime())
			) {
				groupNewsLatestByGroupId.set(row.group_id, nextStamp);
			}
		}

		for (const group of publicGroups) {
			const groupSlug = normalizeMicrositeSlug(group?.slug || '');
			if (!groupSlug) continue;
			addSitemapEntry(
				entryMap,
				toAbsoluteUrl(url.origin, `/groups/${groupSlug}`),
				group?.updated_at || null
			);
			addSitemapEntry(
				entryMap,
				toAbsoluteUrl(url.origin, `/volunteer/groups/${groupSlug}`),
				group?.updated_at || null
			);
			const newsLastmod = groupNewsLatestByGroupId.get(group.id) || null;
			if (newsLastmod) {
				addSitemapEntry(
					entryMap,
					toAbsoluteUrl(url.origin, `/groups/${groupSlug}/news`),
					newsLastmod
				);
			}
		}

		addCommonPublicEntries(entryMap, url.origin);
	}

	const xml = buildSitemapXml(Array.from(entryMap.values()));
	return new Response(xml, {
		status: 200,
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400'
		}
	});
};
