import { safeHttpUrl, safeNavigationUrl } from '../security/urls.js';
import { hasGroupSiteBlock } from './blocks.js';
import { isTbagLegacyUrl, mapTbagLegacyUrl } from './tempeBicycleActionGroup.js';

const SOCIAL_LINK_KEYS = Object.freeze([
	'instagram',
	'facebook',
	'x',
	'youtube',
	'linkedin',
	'threads',
	'mastodon',
	'tiktok',
	'strava',
	'bluesky',
	'discord'
]);

const MICROSITE_BUILTIN_CHILD_PATHS = new Set(['/join', '/updates', '/assets', '/gallery']);
const DEFAULT_ORIGIN = 'https://3fp.org';

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function normalizeMicrositePathname(pathname = '/') {
	const raw = cleanText(pathname) || '/';
	if (raw === '/') return '/';
	const collapsed = raw.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
	return collapsed || '/';
}

/**
 * @typedef {{ key: string; href: string; label?: string; showText?: boolean }} MicrositeContactLink
 */

/**
 * @param {Record<string, any> | null} [siteConfig]
 * @param {string} [blockType]
 */
export function siteHasBlockType(siteConfig = {}, blockType = '') {
	const type = cleanText(blockType).toLowerCase();
	if (!type) return false;
	const pages = Array.isArray(siteConfig?.site_pages) ? siteConfig.site_pages : [];
	if (pages.some((page) => hasGroupSiteBlock(page?.blocks, type))) {
		return true;
	}
	return hasGroupSiteBlock(siteConfig?.page_blocks, type);
}

/**
 * @param {Record<string, any> | null} [group]
 * @param {{ isTbagSite?: boolean }} [options]
 * @returns {MicrositeContactLink[]}
 */
function extractFallbackContactLinks(group = {}, { isTbagSite = false } = {}) {
	/** @type {Record<string, any>} */
	const g = group && typeof group === 'object' ? group : {};
	/** @type {MicrositeContactLink[]} */
	const links = [];

	const websiteHref = safeHttpUrl(g.website_url);
	if (websiteHref && !(isTbagSite && isTbagLegacyUrl(websiteHref))) {
		links.push({ key: 'website', href: websiteHref, label: 'Website' });
	}

	const socialObj = g.social_links && typeof g.social_links === 'object' ? g.social_links : {};
	for (const key of SOCIAL_LINK_KEYS) {
		const rawValue = socialObj[key];
		if (typeof rawValue !== 'string' || !rawValue.trim()) continue;
		const href = safeNavigationUrl(rawValue);
		if (href) links.push({ key, href });
	}

	if (g.public_contact_email) {
		const href = safeNavigationUrl(`mailto:${cleanText(g.public_contact_email)}`);
		if (href) {
			links.push({
				key: 'email',
				href,
				label: cleanText(g.public_contact_email),
				showText: true
			});
		}
	}

	if (g.public_phone_number) {
		const href = safeNavigationUrl(`tel:${cleanText(g.public_phone_number)}`);
		if (href) {
			links.push({
				key: 'phone',
				href,
				label: cleanText(g.public_phone_number),
				showText: true
			});
		}
	}

	return links;
}

/**
 * @param {any} rawLinks
 * @param {Record<string, any> | null} [group]
 * @param {{ isTbagSite?: boolean }} [options]
 * @returns {MicrositeContactLink[]}
 */
function normalizeContactLinksList(rawLinks, group, { isTbagSite = false } = {}) {
	const source =
		Array.isArray(rawLinks) && rawLinks.length
			? rawLinks
			: extractFallbackContactLinks(group, { isTbagSite });
	const seen = new Set();
	/** @type {MicrositeContactLink[]} */
	const normalized = [];

	for (const entry of source) {
		const key = cleanText(entry?.key);
		const href = safeNavigationUrl(entry?.href);
		if (!key || !href) continue;
		if (isTbagSite && key === 'website' && isTbagLegacyUrl(href)) continue;
		const dedupeKey = `${key}|${href.toLowerCase()}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		/** @type {MicrositeContactLink} */
		const item = { key, href };
		const label = cleanText(entry?.label);
		if (label) item.label = label;
		if (entry?.showText) item.showText = true;
		normalized.push(item);
	}

	return normalized;
}

/**
 * @param {Record<string, any> | null} [site]
 */
export function deriveMicrositeCapabilities(site = {}) {
	/** @type {Record<string, any>} */
	const s = site && typeof site === 'object' ? site : {};
	/** @type {Record<string, any>} */
	const group = s.group && typeof s.group === 'object' ? s.group : {};
	/** @type {Record<string, any>} */
	const siteConfig = s.siteConfig && typeof s.siteConfig === 'object' ? s.siteConfig : {};
	const isTbagSite = cleanText(siteConfig.site_variant).toLowerCase() === 'tbag';

	const ownerCount = Number(s?.trust?.ownerCount || 0);
	const isClaimed = Boolean(s?.trust?.isClaimed === true || ownerCount > 0);

	const membershipTiers = Array.isArray(s.membershipTiers) ? s.membershipTiers : [];
	const hasMembership = Boolean(
		s?.membershipProgram?.enabled === true && membershipTiers.length > 0
	);
	const membershipCtaLabel = cleanText(s?.membershipProgram?.cta_label) || 'Follow';

	const hasDonation = Boolean(s.donationEnabled === true);
	const hasConfiguredEmailSignup = siteHasBlockType(siteConfig, 'email_signup');
	const hasEmailFollow = Boolean(isClaimed || hasConfiguredEmailSignup);
	const hasFollowOptions = Boolean(hasMembership || hasDonation || hasEmailFollow);
	const canShowFollowNav = Boolean(siteConfig?.sections?.join !== false && hasFollowOptions);

	const rawWebsiteHref = safeHttpUrl(group.website_url);
	const externalWebsiteUrl =
		rawWebsiteHref && !(isTbagSite && isTbagLegacyUrl(rawWebsiteHref)) ? rawWebsiteHref : '';
	const contactLinks = normalizeContactLinksList(s.contactLinks, group, { isTbagSite });
	const groupSlug = cleanText(group.slug);
	const groupProfileHref = groupSlug ? `/groups/${encodeURIComponent(groupSlug)}` : '/groups';
	const hasContactLinks = contactLinks.length > 0;
	const hasContact = Boolean(hasContactLinks || externalWebsiteUrl || groupSlug);

	const pages = Array.isArray(siteConfig.site_pages) ? siteConfig.site_pages : [];
	const homePage = pages.find((page) => page?.is_home) || pages[0] || null;
	const homeBlocks = homePage?.blocks || siteConfig.page_blocks || [];
	const homeHasContactBlock = hasGroupSiteBlock(homeBlocks, 'contact');
	const canShowContactNav = Boolean(
		siteConfig?.sections?.contact !== false && hasContactLinks && homeHasContactBlock
	);

	const hasRideCalendarBlock = siteHasBlockType(siteConfig, 'ride_calendar');
	const hasRideWidget = Boolean(siteConfig.ride_widget_enabled || hasRideCalendarBlock);
	const hasRides = Boolean(Array.isArray(s.rides) && s.rides.length > 0);
	const hasWidgetRides = Boolean(Array.isArray(s.widgetRides) && s.widgetRides.length > 0);
	const hasVolunteerEvents = Boolean(
		Array.isArray(s.volunteerEvents) && s.volunteerEvents.length > 0
	);
	const hasNewsPosts = Boolean(Array.isArray(s.newsPosts) && s.newsPosts.length > 0);
	const hasUpcomingEvents = Boolean(hasRides || hasVolunteerEvents || hasNewsPosts);
	const hasCalendarContent = Boolean(
		hasRideWidget || hasRides || hasWidgetRides || hasVolunteerEvents
	);

	return {
		isClaimed,
		ownerCount,
		hasMembership,
		membershipCtaLabel,
		hasDonation,
		hasConfiguredEmailSignup,
		hasEmailFollow,
		hasFollowOptions,
		canShowFollowNav,
		externalWebsiteUrl,
		contactLinks,
		groupProfileHref,
		hasContactLinks,
		hasContact,
		homeHasContactBlock,
		canShowContactNav,
		hasRideCalendarBlock,
		hasRideWidget,
		hasRides,
		hasWidgetRides,
		hasVolunteerEvents,
		hasNewsPosts,
		hasUpcomingEvents,
		hasCalendarContent
	};
}

export function buildMicrositeChildHref(basePath = '', path = '/') {
	const cleanBase = cleanText(basePath).replace(/\/+$/, '');
	const raw = cleanText(path);
	if (!raw) return cleanBase || '/';
	if (raw.startsWith('#')) return raw;

	const [pathAndQuery, rawHash = ''] = raw.split('#', 2);
	const hash = rawHash ? `#${rawHash}` : '';
	if (!pathAndQuery || pathAndQuery === '/') {
		return `${cleanBase || '/'}${hash}`;
	}
	const normalizedChild = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
	if (cleanBase && (normalizedChild === cleanBase || normalizedChild.startsWith(`${cleanBase}/`))) {
		return `${normalizedChild}${hash}`;
	}
	return `${cleanBase}${normalizedChild}${hash}`;
}

function getRelativeMicrositePath(pathname, basePath = '') {
	const normalizedPath = normalizeMicrositePathname(pathname);
	const cleanBase = cleanText(basePath).replace(/\/+$/, '');
	if (!cleanBase) return normalizedPath;
	if (normalizedPath === cleanBase) return '/';
	if (normalizedPath.startsWith(`${cleanBase}/`)) {
		return normalizedPath.slice(cleanBase.length) || '/';
	}
	return normalizedPath;
}

/**
 * @param {{
 *   site?: Record<string, any> | null;
 *   capabilities?: ReturnType<typeof deriveMicrositeCapabilities> | null;
 *   currentPage?: Record<string, any> | null;
 *   currentPathname?: string;
 *   basePath?: string;
 * }} [options]
 */
export function resolveMicrositeContactHref({
	site = {},
	capabilities = null,
	currentPage = null,
	currentPathname = '/',
	basePath = ''
} = {}) {
	const caps = capabilities || site?.capabilities || deriveMicrositeCapabilities(site);
	const resolvedBase = cleanText(basePath || site?.basePath);
	const currentBlocks = Array.isArray(currentPage?.blocks) ? currentPage.blocks : [];
	const currentRelativePath = getRelativeMicrositePath(currentPathname, resolvedBase);

	if (currentRelativePath === '/join') {
		return '#contact';
	}

	if (caps.hasContactLinks && hasGroupSiteBlock(currentBlocks, 'contact')) {
		return '#contact';
	}

	if (caps.hasContactLinks && caps.homeHasContactBlock) {
		if (currentPage?.is_home || currentRelativePath === '/') {
			return '#contact';
		}
		return buildMicrositeChildHref(resolvedBase, '/#contact');
	}

	if (caps.hasContact) {
		return buildMicrositeChildHref(resolvedBase, '/join#contact');
	}

	return caps.groupProfileHref || '/';
}

/**
 * @param {any} href
 * @param {{ currentPathname?: string; currentSearch?: string; origin?: string }} [options]
 */
export function isSamePageReloadHref(
	href,
	{ currentPathname = '/', currentSearch = '', origin = DEFAULT_ORIGIN } = {}
) {
	const raw = cleanText(href);
	if (!raw) return false;
	if (raw === '#') return true;
	if (raw.startsWith('#')) return false;
	if (/^(?:mailto|tel):/i.test(raw)) return false;

	let baseUrl;
	let targetUrl;
	try {
		baseUrl = new URL(origin || DEFAULT_ORIGIN);
		const normalizedCurrentPath = normalizeMicrositePathname(currentPathname);
		const currentUrl = new URL(`${normalizedCurrentPath}${currentSearch || ''}`, baseUrl.origin);
		targetUrl = new URL(raw, currentUrl);
		if (targetUrl.origin !== currentUrl.origin) return false;
		if (targetUrl.hash && targetUrl.hash !== '#') return false;
		return (
			normalizeMicrositePathname(targetUrl.pathname) === normalizedCurrentPath &&
			(targetUrl.search || '') === (currentUrl.search || '')
		);
	} catch {
		return false;
	}
}

/**
 * @param {any} href
 * @param {{ currentPathname?: string; currentSearch?: string; origin?: string }} [options]
 */
function simplifySamePageHashHref(
	href,
	{ currentPathname = '/', currentSearch = '', origin = DEFAULT_ORIGIN } = {}
) {
	const raw = cleanText(href);
	if (!raw || raw.startsWith('#') || /^(?:mailto|tel):/i.test(raw)) return raw;

	try {
		const baseUrl = new URL(origin || DEFAULT_ORIGIN);
		const normalizedCurrentPath = normalizeMicrositePathname(currentPathname);
		const currentUrl = new URL(`${normalizedCurrentPath}${currentSearch || ''}`, baseUrl.origin);
		const targetUrl = new URL(raw, currentUrl);
		if (
			targetUrl.origin === currentUrl.origin &&
			targetUrl.hash &&
			targetUrl.hash.length > 1 &&
			normalizeMicrositePathname(targetUrl.pathname) === normalizedCurrentPath &&
			(targetUrl.search || '') === (currentUrl.search || '')
		) {
			return targetUrl.hash;
		}
	} catch {
		// keep original href
	}
	return raw;
}

/**
 * @param {Record<string, any> | null} [block]
 * @param {{
 *   site?: Record<string, any> | null;
 *   capabilities?: ReturnType<typeof deriveMicrositeCapabilities> | null;
 *   currentPage?: Record<string, any> | null;
 *   currentPathname?: string;
 *   currentSearch?: string;
 *   basePath?: string;
 *   origin?: string;
 * }} [options]
 */
export function resolveMicrositeActionHref(
	block = {},
	{
		site = {},
		capabilities = null,
		currentPage = null,
		currentPathname = '/',
		currentSearch = '',
		basePath = '',
		origin = DEFAULT_ORIGIN
	} = {}
) {
	const caps = capabilities || site?.capabilities || deriveMicrositeCapabilities(site);
	/** @type {Record<string, any>} */
	const siteConfig = site?.siteConfig && typeof site.siteConfig === 'object' ? site.siteConfig : {};
	/** @type {Record<string, any>} */
	const group = site?.group && typeof site.group === 'object' ? site.group : {};
	const isTbagSite = cleanText(siteConfig.site_variant).toLowerCase() === 'tbag';
	const resolvedBase = cleanText(basePath || site?.basePath);

	const configured = cleanText(block?.button_url || block?.href);
	let internalized = isTbagSite ? mapTbagLegacyUrl(configured) : configured;

	if (!internalized) {
		if (block?.type === 'volunteer') {
			internalized = group?.slug ? `/volunteer/groups/${encodeURIComponent(group.slug)}` : '';
		} else if (block?.type === 'updates') {
			internalized = '/updates';
		} else if (block?.type === 'resources') {
			internalized = '/assets';
		} else if (block?.type === 'membership' || block?.type === 'email_signup') {
			internalized = caps.hasFollowOptions
				? '/join'
				: resolveMicrositeContactHref({
						site,
						capabilities: caps,
						currentPage,
						currentPathname,
						basePath: resolvedBase
					});
		}
	}

	if (!internalized) return '';

	let resolved = internalized;
	if (internalized.startsWith('#')) {
		if (internalized.toLowerCase() === '#donate' && !caps.hasDonation) {
			resolved = resolveMicrositeContactHref({
				site,
				capabilities: caps,
				currentPage,
				currentPathname,
				basePath: resolvedBase
			});
		}
	} else if (internalized.startsWith('/')) {
		const [pathAndQuery, rawHash = ''] = internalized.split('#', 2);
		const [rawPath] = pathAndQuery.split('?', 1);
		const normalizedPath = normalizeMicrositePathname(rawPath);
		const relativePath = getRelativeMicrositePath(normalizedPath, resolvedBase);
		const lowerHash = rawHash ? `#${rawHash.toLowerCase()}` : '';

		const isMicrositePage = Boolean(
			relativePath === '/' ||
			MICROSITE_BUILTIN_CHILD_PATHS.has(relativePath) ||
			(Array.isArray(siteConfig.site_pages) &&
				siteConfig.site_pages.some(
					(page) =>
						page?.slug &&
						(relativePath === `/${page.slug}` || relativePath.startsWith(`/${page.slug}/`))
				))
		);

		if (relativePath === '/join' && lowerHash === '#donate') {
			resolved = caps.hasDonation
				? buildMicrositeChildHref(resolvedBase, '/join#donate')
				: resolveMicrositeContactHref({
						site,
						capabilities: caps,
						currentPage,
						currentPathname,
						basePath: resolvedBase
					});
		} else if (relativePath === '/join' && lowerHash === '#membership' && !caps.hasMembership) {
			resolved = caps.hasEmailFollow
				? buildMicrositeChildHref(resolvedBase, '/join#follow')
				: resolveMicrositeContactHref({
						site,
						capabilities: caps,
						currentPage,
						currentPathname,
						basePath: resolvedBase
					});
		} else if (relativePath === '/join' && !rawHash && !caps.hasFollowOptions) {
			resolved = resolveMicrositeContactHref({
				site,
				capabilities: caps,
				currentPage,
				currentPathname,
				basePath: resolvedBase
			});
		} else if (isMicrositePage) {
			resolved = buildMicrositeChildHref(resolvedBase, internalized);
		}
	}

	if (isSamePageReloadHref(resolved, { currentPathname, currentSearch, origin })) {
		return '';
	}

	return simplifySamePageHashHref(resolved, { currentPathname, currentSearch, origin });
}
