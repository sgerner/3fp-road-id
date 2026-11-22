import { error, redirect } from '@sveltejs/kit';
import { normalizeMicrositeSlug } from '../microsites/host.js';
import { cleanSeoText } from '../seo.js';
import { fetchSingle } from './internalApi.js';

export const DEFAULT_GROUP_DISPLAY_NAME = 'Cycling Group';

export function cleanGroupSlug(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function encodeGroupSlug(value) {
	const cleaned = cleanGroupSlug(value);
	return cleaned ? encodeURIComponent(cleaned) : '';
}

export function buildGroupPath(slug) {
	const encoded = encodeGroupSlug(slug);
	return encoded ? `/groups/${encoded}` : '';
}

export function buildGroupNewsPath(slug) {
	const encoded = encodeGroupSlug(slug);
	return encoded ? `/groups/${encoded}/news` : '';
}

export function buildVolunteerGroupPath(slug) {
	const encoded = encodeGroupSlug(slug);
	return encoded ? `/volunteer/groups/${encoded}` : '';
}

export function buildMicrositeRootPath(group) {
	const siteSlug = normalizeMicrositeSlug(group?.microsite_slug || group?.slug || '');
	return siteSlug ? `/${siteSlug}` : '';
}

export function buildGroupSitemapPaths(group) {
	const slug = group?.slug;
	return {
		groupPath: buildGroupPath(slug),
		groupNewsPath: buildGroupNewsPath(slug),
		volunteerGroupPath: buildVolunteerGroupPath(slug),
		micrositePath: buildMicrositeRootPath(group)
	};
}

export function buildGroupRedirectLocation(slug, search = '') {
	const groupPath = buildGroupPath(slug);
	if (!groupPath) return '';
	const rawSearch = typeof search === 'string' ? search.trim() : '';
	if (!rawSearch || rawSearch === '?') return groupPath;
	const normalizedSearch = rawSearch.startsWith('?') ? rawSearch : `?${rawSearch}`;
	return `${groupPath}${normalizedSearch}`;
}

export function resolveGroupDisplayName(group, fallback = DEFAULT_GROUP_DISPLAY_NAME) {
	return cleanSeoText(group?.name) || fallback;
}

export async function lookupGroupBySlugOrMicrositeSlug(fetchImpl, rawSlug) {
	const requestedSlug = cleanGroupSlug(rawSlug);
	if (!requestedSlug) {
		return { group: null, matchedBy: null };
	}

	const exactGroup = await fetchSingle(fetchImpl, 'groups', {
		slug: `eq.${requestedSlug}`,
		single: 'true'
	});
	if (exactGroup) {
		return { group: exactGroup, matchedBy: 'slug' };
	}

	const normalizedSlug = normalizeMicrositeSlug(requestedSlug);
	if (!normalizedSlug) {
		return { group: null, matchedBy: null };
	}

	const micrositeGroup = await fetchSingle(fetchImpl, 'groups', {
		microsite_slug: `eq.${normalizedSlug}`,
		single: 'true'
	});
	if (micrositeGroup) {
		return { group: micrositeGroup, matchedBy: 'microsite_slug' };
	}

	return { group: null, matchedBy: null };
}

export async function resolveGroupRoute({ fetch: fetchImpl, slug, search = '' }) {
	const rawSlug = typeof slug === 'string' ? slug : cleanGroupSlug(slug);
	if (!cleanGroupSlug(rawSlug)) {
		throw error(404, 'Group not found');
	}

	let lookup;
	try {
		lookup = await lookupGroupBySlugOrMicrositeSlug(fetchImpl, rawSlug);
	} catch (err) {
		console.warn('Failed to load group details', err);
		throw error(500, 'Failed to load group');
	}

	const group = lookup?.group ?? null;
	const canonicalSlug = cleanGroupSlug(group?.slug);
	if (!group || !canonicalSlug) {
		throw error(404, 'Group not found');
	}

	if (rawSlug !== canonicalSlug) {
		throw redirect(308, buildGroupRedirectLocation(canonicalSlug, search));
	}

	return group;
}
