import { createGroupSiteBlock, normalizeGroupSiteBlocks } from './blocks.js';

export const GROUP_SITE_PAGE_LIMIT = 12;
export const GROUP_SITE_RESERVED_PAGE_SLUGS = new Set(['gallery', 'join', 'updates', 'assets']);
export const GROUP_SITE_PRIMARY_NAV_LIMIT = 5;
export const GROUP_SITE_NAV_PLACEMENTS = ['primary', 'more', 'hidden'];
export const GROUP_SITE_SPECIAL_NAV_ITEMS = Object.freeze([
	{ id: 'special:updates', label: 'Updates', type: 'updates' },
	{ id: 'special:join', label: 'Follow', type: 'membership' },
	{ id: 'special:gallery', label: 'Gallery', type: 'gallery' },
	{ id: 'special:resources', label: 'Resources', type: 'resources' },
	{ id: 'special:contact', label: 'Contact', type: 'contact' }
]);

function clean(value, limit = 0) {
	const text = String(value ?? '').trim();
	return limit ? text.slice(0, limit) : text;
}

export function normalizeGroupSitePageSlug(value) {
	return clean(value, 80)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64);
}

function defaultSpecialPlacement(item, blockTypes) {
	if (item.id === 'special:join' && blockTypes.has('email_signup')) return 'hidden';
	if (blockTypes.has(item.type)) return 'hidden';
	return 'more';
}

export function normalizeGroupSiteNavigation(value, { pages = [] } = {}) {
	const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
	const sourceItems = Array.isArray(source.items) ? source.items : [];
	const sourceById = new Map(
		sourceItems
			.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
			.map((item) => [clean(item.id, 100), item])
	);
	const blockTypes = new Set(
		pages.flatMap((page) => (page.blocks || []).map((block) => block.type)).filter(Boolean)
	);
	const candidates = [
		...pages.map((page, index) => ({
			id: `page:${page.id}`,
			label: page.nav_label || page.title,
			defaultPlacement:
				page.is_home || (page.show_in_nav !== false && index < GROUP_SITE_PRIMARY_NAV_LIMIT)
					? 'primary'
					: page.show_in_nav === false
						? 'hidden'
						: 'more'
		})),
		...GROUP_SITE_SPECIAL_NAV_ITEMS.map((item) => ({
			...item,
			defaultPlacement: defaultSpecialPlacement(item, blockTypes)
		}))
	];
	const candidateById = new Map(candidates.map((item) => [item.id, item]));
	const orderedIds = [
		'page:home',
		...sourceItems
			.map((item) => clean(item?.id, 100))
			.filter((id) => id !== 'page:home' && candidateById.has(id)),
		...candidates.map((item) => item.id).filter((id) => id !== 'page:home' && !sourceById.has(id))
	];
	let primaryCount = 0;
	const items = [];
	for (const id of orderedIds) {
		const candidate = candidateById.get(id);
		if (!candidate || items.some((item) => item.id === id)) continue;
		const saved = sourceById.get(id) || {};
		let placement = GROUP_SITE_NAV_PLACEMENTS.includes(saved.placement)
			? saved.placement
			: candidate.defaultPlacement;
		if (id === 'page:home') placement = 'primary';
		if (placement === 'primary') {
			if (primaryCount >= GROUP_SITE_PRIMARY_NAV_LIMIT) placement = 'more';
			else primaryCount += 1;
		}
		items.push({
			id,
			label: clean(saved.label || candidate.label, 40) || candidate.label,
			placement
		});
	}
	return { items };
}

function uniqueSlug(candidate, used) {
	const base = normalizeGroupSitePageSlug(candidate) || 'page';
	let slug = base;
	let suffix = 2;
	while (used.has(slug) || GROUP_SITE_RESERVED_PAGE_SLUGS.has(slug)) {
		slug = `${base.slice(0, 58)}-${suffix++}`;
	}
	used.add(slug);
	return slug;
}

export function createGroupSitePage({
	id = '',
	slug = '',
	title = 'New page',
	nav_label = '',
	description = '',
	seo_description = '',
	show_in_nav = true,
	is_home = false,
	blocks = [],
	navigation = null
} = {}) {
	const pageTitle = clean(title, 120) || 'New page';
	return {
		id: clean(id, 80) || `page-${normalizeGroupSitePageSlug(pageTitle) || 'new'}`,
		slug: is_home ? '' : normalizeGroupSitePageSlug(slug || pageTitle),
		title: pageTitle,
		nav_label: clean(nav_label || pageTitle, 40),
		description: clean(description, 360),
		seo_description: clean(seo_description || description, 180),
		show_in_nav: is_home ? true : show_in_nav !== false,
		is_home: Boolean(is_home),
		blocks: normalizeGroupSiteBlocks(blocks),
		...(is_home && navigation && typeof navigation === 'object' ? { navigation } : {})
	};
}

export function buildDefaultGroupSitePages(homeBlocks = []) {
	const pages = [
		createGroupSitePage({
			id: 'home',
			title: 'Home',
			nav_label: 'Home',
			is_home: true,
			blocks: homeBlocks
		})
	];
	pages[0].navigation = normalizeGroupSiteNavigation(null, { pages });
	return pages;
}

export function normalizeGroupSitePages(value, { homeBlocks = [] } = {}) {
	let source = value;
	if (typeof source === 'string') {
		try {
			source = JSON.parse(source);
		} catch {
			source = null;
		}
	}
	if (!Array.isArray(source) || !source.length) return buildDefaultGroupSitePages(homeBlocks);

	const usedIds = new Set();
	const usedSlugs = new Set();
	const pages = [];
	for (const [index, entry] of source.entries()) {
		if (pages.length >= GROUP_SITE_PAGE_LIMIT) break;
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
		const isHome =
			!pages.some((page) => page.is_home) &&
			(entry.is_home === true || (index === 0 && !clean(entry.slug)));
		const title = clean(entry.title, 120) || (isHome ? 'Home' : `Page ${index + 1}`);
		let id = clean(entry.id, 80) || `page-${normalizeGroupSitePageSlug(title) || index + 1}`;
		while (usedIds.has(id)) id = `${id.slice(0, 72)}-${index + 1}`;
		usedIds.add(id);
		const slug = isHome ? '' : uniqueSlug(entry.slug || title, usedSlugs);
		pages.push(
			createGroupSitePage({
				...entry,
				id,
				slug,
				title,
				is_home: isHome,
				blocks: entry.blocks
			})
		);
	}

	let home = pages.find((page) => page.is_home);
	if (!home) {
		home = createGroupSitePage({ id: 'home', title: 'Home', is_home: true, blocks: homeBlocks });
	}
	const normalizedHome = { ...home, id: 'home', slug: '', is_home: true, show_in_nav: true };
	const normalizedPages = [
		normalizedHome,
		...pages.filter((page) => page !== home).map((page) => ({ ...page, is_home: false }))
	].slice(0, GROUP_SITE_PAGE_LIMIT);
	normalizedPages[0].navigation = normalizeGroupSiteNavigation(home.navigation, {
		pages: normalizedPages
	});
	return normalizedPages;
}

export function groupSitePageBySlug(pages, slug = '') {
	const normalized = normalizeGroupSitePageSlug(slug);
	return (Array.isArray(pages) ? pages : []).find((page) => page.slug === normalized) || null;
}

export function pageBlock(type, overrides = {}, id = '') {
	return createGroupSiteBlock(type, { id, overrides });
}
