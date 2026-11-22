import { buildDefaultGroupSiteConfig } from '#lib/microsites/config.js';
import { deriveLegacySiteVisibility } from '#lib/microsites/blocks.js';
import {
	extractGroupSiteEditorFormValues,
	mergeGroupSiteEditorConfig
} from '#lib/groups/siteEditor.js';
import { cleanSeoText, limitSeoText } from '#lib/seo.js';

const PRESENCE_SOCIAL_KEYS = [
	'instagram',
	'facebook',
	'x',
	'threads',
	'youtube',
	'mastodon',
	'tiktok',
	'strava',
	'bluesky',
	'discord',
	'linkedin'
];
const MAX_SERIALIZED_CROP_LENGTH = 14 * 1024 * 1024;

export const PRESENCE_STUDIO_VIEWS = [
	'profile',
	'builder',
	'quick',
	'navigation',
	'appearance',
	'rides',
	'address',
	'more'
];

export const WEBSITE_LAYER_VIEWS = [
	'builder',
	'quick',
	'navigation',
	'appearance',
	'rides',
	'address',
	'more'
];

const VIEW_ALIASES = {
	edit: 'profile',
	identity: 'profile',
	site: 'builder',
	buillder: 'builder',
	details: 'quick',
	design: 'appearance',
	domain: 'address',
	domains: 'address',
	settings: 'more',
	publishing: 'more'
};

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const text = String(value).trim();
	if (!maxLength) return text;
	return text.slice(0, maxLength).trim();
}

function toSearchParams(searchParamsOrUrl) {
	if (!searchParamsOrUrl) return new URLSearchParams();
	if (searchParamsOrUrl instanceof URLSearchParams) {
		return new URLSearchParams(searchParamsOrUrl);
	}
	if (searchParamsOrUrl instanceof URL) {
		return new URLSearchParams(searchParamsOrUrl.searchParams);
	}
	const raw = String(searchParamsOrUrl);
	const queryIndex = raw.indexOf('?');
	return new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : raw);
}

export function normalizePresenceStudioView(value, fallback = 'profile') {
	const raw = cleanText(value).toLowerCase();
	const mapped = VIEW_ALIASES[raw] || raw;
	if (PRESENCE_STUDIO_VIEWS.includes(mapped)) return mapped;
	return PRESENCE_STUDIO_VIEWS.includes(fallback) ? fallback : 'profile';
}

export function isWebsiteLayerView(view) {
	return WEBSITE_LAYER_VIEWS.includes(view);
}

export function buildPresenceRedirectFromEdit(slug, searchParamsOrUrl = '') {
	const encodedSlug = encodeURIComponent(cleanText(slug));
	const params = toSearchParams(searchParamsOrUrl);
	if (params.has('view')) {
		params.set('view', normalizePresenceStudioView(params.get('view'), 'profile'));
	}
	const query = params.toString();
	return `/groups/${encodedSlug}/manage/presence${query ? `?${query}` : ''}`;
}

export function buildPresenceRedirectFromSite(slug, searchParamsOrUrl = '') {
	const encodedSlug = encodeURIComponent(cleanText(slug));
	const params = toSearchParams(searchParamsOrUrl);
	const hasDomainReturn = params.has('domain_checkout') || params.has('domain_payment');
	const defaultView = hasDomainReturn ? 'address' : 'builder';
	const resolvedView = normalizePresenceStudioView(params.get('view'), defaultView);
	params.set('view', resolvedView);
	const query = params.toString();
	return `/groups/${encodedSlug}/manage/presence?${query}`;
}

export function syncSiteConfigWithCoreGroup(siteConfig = {}, group = {}, options = {}) {
	const defaults = buildDefaultGroupSiteConfig(group);
	const nextName =
		cleanText(group?.name, 120) || cleanText(siteConfig?.site_title, 120) || defaults.site_title;
	const nextTagline = cleanText(group?.tagline, 180) || defaults.site_tagline;
	const nextHomeIntro = cleanText(group?.description, 1400) || defaults.home_intro;
	const nextSeoDescription = cleanText(
		options.seoDescription !== undefined ? options.seoDescription : siteConfig?.seo_description,
		180
	);

	const pages = Array.isArray(siteConfig?.site_pages)
		? siteConfig.site_pages.map((page, index) => {
				if (page?.is_home || index === 0) {
					return {
						...page,
						seo_description: nextSeoDescription
					};
				}
				const pageDescription = cleanText(page?.description, 360);
				return {
					...page,
					seo_description: cleanText(pageDescription || page?.seo_description, 180)
				};
			})
		: siteConfig?.site_pages;

	return {
		...siteConfig,
		site_title: nextName,
		site_tagline: nextTagline,
		home_intro: nextHomeIntro,
		seo_description: nextSeoDescription,
		...(Array.isArray(pages) ? { site_pages: pages } : {})
	};
}

export function mergeAiProposalIntoPresenceDraft({
	currentConfig = {},
	proposalConfig = {},
	groupDraft = {}
} = {}) {
	const merged = mergeGroupSiteEditorConfig(currentConfig, proposalConfig);
	const homeBlocks = merged.site_pages?.[0]?.blocks || merged.page_blocks || [];
	const visibility = deriveLegacySiteVisibility(homeBlocks, merged.sections);

	const groupPatch = {};
	const proposedTagline = cleanText(proposalConfig?.site_tagline, 180);
	if (proposedTagline && proposedTagline !== cleanText(currentConfig?.site_tagline, 180)) {
		groupPatch.tagline = proposedTagline;
	}
	const proposedIntro = cleanText(proposalConfig?.home_intro, 1400);
	if (proposedIntro && proposedIntro !== cleanText(currentConfig?.home_intro, 1400)) {
		groupPatch.description = proposedIntro;
	}
	const proposedSeo = cleanText(proposalConfig?.seo_description, 180);
	const nextSeoDescription =
		proposedSeo && proposedSeo !== cleanText(currentConfig?.seo_description, 180)
			? proposedSeo
			: cleanText(merged.seo_description, 180);

	const nextGroup = { ...groupDraft, ...groupPatch };
	const syncedConfig = syncSiteConfigWithCoreGroup(
		{
			...merged,
			page_blocks: homeBlocks,
			sections: visibility.sections,
			ride_widget_enabled: visibility.ride_widget_enabled
		},
		nextGroup,
		{ seoDescription: nextSeoDescription }
	);

	return {
		siteConfig: syncedConfig,
		groupPatch,
		seoDescription: nextSeoDescription
	};
}

export function resolveMicrositeSeoDescription({
	site = null,
	group = null,
	customPage = null,
	isHomePage = true,
	seoTitle = 'Cycling Group',
	seoSection = ''
} = {}) {
	if (isHomePage) {
		const homePage = (site?.siteConfig?.site_pages || []).find((candidate) => candidate?.is_home);
		const configuredHomeSeo = cleanSeoText(
			site?.siteConfig?.seo_description || homePage?.seo_description
		);
		if (configuredHomeSeo) {
			return limitSeoText(configuredHomeSeo, 180);
		}
	}

	if (!isHomePage && (customPage?.seo_description || customPage?.description)) {
		return limitSeoText(customPage.seo_description || customPage.description, 180);
	}

	const sectionDescriptions = {
		updates: limitSeoText(
			`${seoTitle} updates, announcements, route changes, volunteer asks, and public notes.`,
			165
		),
		gallery: limitSeoText(
			`Photo gallery from rides, events, and community days with ${seoTitle}.`,
			165
		),
		join: limitSeoText(
			`Join ${seoTitle} to follow membership options, support the group, and stay connected.`,
			165
		),
		assets: limitSeoText(`Official links and downloadable resources shared by ${seoTitle}.`, 165)
	};
	if (!isHomePage && sectionDescriptions[seoSection]) {
		return sectionDescriptions[seoSection];
	}

	const city = cleanSeoText(group?.city);
	const state = cleanSeoText(group?.state_region);
	const locality = [city, state].filter(Boolean).join(', ');
	const primary = cleanSeoText(
		group?.tagline || site?.siteConfig?.site_tagline || site?.siteConfig?.home_intro
	);
	const fallback = cleanSeoText(
		group?.description ||
			group?.service_area_description ||
			group?.membership_info ||
			'Community bike rides, local events, and advocacy.'
	);
	const tail = locality ? ` Join rides in ${locality}.` : ' Join local rides and events.';
	return limitSeoText(`${primary || fallback}${tail}`, 165);
}

function parseSortedNumericIds(values) {
	return [
		...new Set(
			(Array.isArray(values) ? values : [])
				.map((value) => Number(value))
				.filter((value) => Number.isFinite(value) && value > 0)
		)
	].sort((a, b) => a - b);
}

export function extractPresenceStudioFormValues(formData, { group = null } = {}) {
	const siteValues = extractGroupSiteEditorFormValues(formData, { group });
	const socialInputs = {};
	for (const key of PRESENCE_SOCIAL_KEYS) {
		socialInputs[key] = String(formData.get(`social_${key}`) ?? '');
	}

	const rawLogoCropped = String(formData.get('logo_file_cropped') ?? '');
	const rawCoverCropped = String(formData.get('cover_file_cropped') ?? '');
	const logoCropped = rawLogoCropped.length <= MAX_SERIALIZED_CROP_LENGTH ? rawLogoCropped : '';
	const coverCropped = rawCoverCropped.length <= MAX_SERIALIZED_CROP_LENGTH ? rawCoverCropped : '';

	const pendingProfileFiles = [];
	const logoFile = formData.get('logo_file');
	if (
		!logoCropped &&
		logoFile &&
		typeof logoFile === 'object' &&
		'size' in logoFile &&
		Number(logoFile.size) > 0
	) {
		pendingProfileFiles.push(String(logoFile.name || 'Logo image'));
	}
	const coverFile = formData.get('cover_file');
	if (
		!coverCropped &&
		coverFile &&
		typeof coverFile === 'object' &&
		'size' in coverFile &&
		Number(coverFile.size) > 0
	) {
		pendingProfileFiles.push(String(coverFile.name || 'Cover image'));
	}

	const returnView = normalizePresenceStudioView(formData.get('return_view'), 'profile');
	const seoDescription = cleanText(formData.get('seo_description'), 180);

	return {
		site: {
			...siteValues,
			seo_description: seoDescription
		},
		profile: {
			name: String(formData.get('name') ?? ''),
			tagline: String(formData.get('tagline') ?? ''),
			description: String(formData.get('description') ?? ''),
			city: String(formData.get('city') ?? ''),
			state_region: String(formData.get('state_region') ?? ''),
			country: String(formData.get('country') ?? 'US').toUpperCase(),
			zip_code: String(formData.get('zip_code') ?? ''),
			specific_meeting_point_address: String(formData.get('specific_meeting_point_address') ?? ''),
			service_area_description: String(formData.get('service_area_description') ?? ''),
			latitude: String(formData.get('latitude') ?? ''),
			longitude: String(formData.get('longitude') ?? ''),
			website_url: String(formData.get('website_url') ?? ''),
			public_contact_email: String(formData.get('public_contact_email') ?? ''),
			public_phone_number: String(formData.get('public_phone_number') ?? ''),
			preferred_contact_method_instructions: String(
				formData.get('preferred_contact_method_instructions') ?? ''
			),
			how_to_join_instructions: String(formData.get('how_to_join_instructions') ?? ''),
			membership_info: String(formData.get('membership_info') ?? ''),
			activity_frequency: String(formData.get('activity_frequency') ?? ''),
			typical_activity_day_time: String(formData.get('typical_activity_day_time') ?? ''),
			preferred_cta_kind: String(formData.get('preferred_cta_kind') || 'auto'),
			preferred_cta_label: String(formData.get('preferred_cta_label') ?? ''),
			preferred_cta_url: String(formData.get('preferred_cta_url') ?? ''),
			socialInputs,
			instagramPostsText: String(formData.get('social_instagram_posts') ?? ''),
			group_type_ids: parseSortedNumericIds(formData.getAll('group_type_ids')),
			audience_focus_ids: parseSortedNumericIds(formData.getAll('audience_focus_ids')),
			riding_discipline_ids: parseSortedNumericIds(formData.getAll('riding_discipline_ids')),
			skill_level_ids: parseSortedNumericIds(formData.getAll('skill_level_ids')),
			logoUrl: String(formData.get('logo_url') ?? ''),
			coverUrl: String(formData.get('cover_photo_url') ?? ''),
			logoCropped,
			coverCropped,
			clearLogo: String(formData.get('clear_logo') ?? '') === '1',
			clearCover: String(formData.get('clear_cover') ?? '') === '1'
		},
		seo_description: seoDescription,
		return_view: returnView,
		pending_sponsor_logo_files: siteValues.pending_sponsor_logo_files || [],
		pending_profile_files: pendingProfileFiles
	};
}
