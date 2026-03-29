import { normalizeRideWidgetConfig } from '$lib/rides/widgetConfig';

export const GROUP_SITE_THEME_OPTIONS = [
	{ value: '3fp', label: '3FP' },
	{ value: 'mint', label: 'Mint' },
	{ value: 'cerberus', label: 'Cerberus' },
	{ value: 'catppuccin', label: 'Catppuccin' },
	{ value: 'legacy', label: 'Legacy' },
	{ value: 'nouveau', label: 'Nouveau' },
	{ value: 'rose', label: 'Rose' },
	{ value: 'sahara', label: 'Sahara' },
	{ value: 'seafoam', label: 'Seafoam' },
	{ value: 'wintry', label: 'Wintry' }
];

export const GROUP_SITE_THEME_MODES = ['derived', 'repo', 'custom'];
export const GROUP_SITE_HERO_STYLES = ['immersive', 'bold', 'orbit'];
export const GROUP_SITE_BACKGROUND_STYLES = ['cinematic', 'aurora', 'prism', 'void'];
export const GROUP_SITE_PANEL_STYLES = ['glass', 'filled', 'outlined'];
export const GROUP_SITE_PANEL_TONES = ['surface', 'primary', 'secondary', 'tertiary'];
export const GROUP_SITE_PANEL_DENSITIES = ['compact', 'comfortable', 'airy'];
export const GROUP_SITE_FONT_PAIRINGS = ['poster', 'editorial', 'friendly', 'utility'];
export const GROUP_SITE_FONT_PAIRING_OPTIONS = [
	{ value: 'poster', label: 'Poster (Bold headlines + clean sans body)' },
	{ value: 'editorial', label: 'Editorial (Serif body + classic headings)' },
	{ value: 'friendly', label: 'Friendly (Humanist sans, softer feel)' },
	{ value: 'utility', label: 'Utility (Monospace / technical style)' }
];
export const GROUP_SITE_SECTION_KEYS = [
	'story',
	'stats',
	'join',
	'rides',
	'volunteer',
	'news',
	'gallery',
	'contact'
];
export const GROUP_SITE_RIDE_WIDGET_HOST_SCOPES = ['all', 'group_only', 'selected_groups'];

const DEFAULT_SITE_SECTIONS = Object.freeze({
	story: true,
	stats: true,
	join: true,
	rides: true,
	volunteer: true,
	news: true,
	gallery: true,
	contact: true
});

const DEFAULT_THEME_COLORS = Object.freeze({
	primary: '',
	secondary: '',
	accent: '',
	surface: ''
});

const DEFAULT_SPONSOR_LINKS = Object.freeze([]);
const DEFAULT_SPONSOR_ITEMS = Object.freeze([]);
const MAX_SPONSOR_ITEMS = 12;

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function clampText(value, maxLength = 0) {
	const cleaned = cleanText(value);
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function normalizeBoolean(value, fallback = false) {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	const raw = cleanText(value).toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
	if (['0', 'false', 'no', 'off'].includes(raw)) return false;
	return fallback;
}

export function normalizeHexColor(value) {
	const raw = cleanText(value).replace(/^#/, '');
	if (!raw) return '';
	if (/^[0-9a-f]{3}$/i.test(raw)) {
		return `#${raw
			.split('')
			.map((char) => `${char}${char}`)
			.join('')
			.toUpperCase()}`;
	}
	if (/^[0-9a-f]{6}$/i.test(raw)) {
		return `#${raw.toUpperCase()}`;
	}
	return '';
}

function hasThemeName(value) {
	return GROUP_SITE_THEME_OPTIONS.some((option) => option.value === value);
}

function normalizeChoice(value, options, fallback) {
	const raw = cleanText(value).toLowerCase();
	return options.includes(raw) ? raw : fallback;
}

function normalizeThemeColors(value) {
	const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
	return {
		primary: normalizeHexColor(source.primary),
		secondary: normalizeHexColor(source.secondary),
		accent: normalizeHexColor(source.accent),
		surface: normalizeHexColor(source.surface)
	};
}

function normalizeUrlish(value) {
	const raw = cleanText(value);
	if (!raw) return '';
	if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw) || /^tel:/i.test(raw)) return raw;
	if (raw.startsWith('/')) return raw;
	return `https://${raw}`;
}

function normalizeSponsorLinks(value) {
	const list = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value
					.split('\n')
					.map((item) => item.trim())
					.filter(Boolean)
			: [];
	const cleaned = list
		.map((item) => normalizeUrlish(item))
		.filter(Boolean)
		.slice(0, 3);
	return cleaned;
}

function normalizeSponsorItems(value, fallbackLinks = []) {
	const rawItems = Array.isArray(value) ? value : [];
	const fromItems = rawItems
		.map((entry) => {
			const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
			const name = clampText(source.name || source.label || '', 120);
			const text = clampText(source.text || source.description || '', 220);
			const logo = normalizeUrlish(source.logo || source.logo_url || source.image || '');
			const url = normalizeUrlish(source.url || source.href || '');
			if (!name && !text && !logo && !url) return null;
			return { name, text, logo, url };
		})
		.filter(Boolean)
		.slice(0, MAX_SPONSOR_ITEMS);

	if (fromItems.length) return fromItems;

	const links = normalizeSponsorLinks(fallbackLinks);
	return links.slice(0, MAX_SPONSOR_ITEMS).map((url) => ({ name: '', text: '', logo: '', url }));
}

function parseSponsorItemsJson(value) {
	const raw = cleanText(value);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function normalizeIsoDateTime(value) {
	const raw = cleanText(value);
	if (!raw) return null;
	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

function normalizeSections(value) {
	const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
	return GROUP_SITE_SECTION_KEYS.reduce((acc, key) => {
		acc[key] = normalizeBoolean(source[key], DEFAULT_SITE_SECTIONS[key]);
		return acc;
	}, {});
}

export function buildDefaultGroupSiteConfig(group = {}) {
	const name = clampText(group?.name, 120) || 'Community Cycling Group';
	const location = [cleanText(group?.city), cleanText(group?.state_region)]
		.filter(Boolean)
		.join(', ');
	const locationSuffix = location ? ` in ${location}` : '';
	const siteTagline =
		clampText(group?.tagline, 160) ||
		clampText(group?.service_area_description, 160) ||
		`Local rides, people, and momentum${locationSuffix}.`;

	const description =
		clampText(group?.description, 900) ||
		clampText(group?.membership_info, 900) ||
		clampText(group?.how_to_join_instructions, 900);

	const homeIntro =
		description ||
		`We bring people together${locationSuffix ? locationSuffix : ''} through rides, volunteer efforts, and a welcoming bike community.`;

	const footerBlurb = location
		? `${name} is based in ${location}.`
		: `${name} is a local cycling community group.`;

	return {
		site_title: name,
		site_tagline: siteTagline,
		home_intro: homeIntro,
		featured_quote: clampText(group?.how_to_join_instructions || group?.membership_info, 220),
		footer_blurb: clampText(footerBlurb, 180),
		seo_description: clampText(description || `${name}${locationSuffix}.`, 180),
		hero_style: 'immersive',
		background_style: 'cinematic',
		panel_style: 'glass',
		panel_tone: 'surface',
		panel_density: 'comfortable',
		font_pairing: 'poster',
		theme_mode: 'derived',
		theme_name: '',
		theme_colors: { ...DEFAULT_THEME_COLORS },
		simple_mode: true,
		microsite_notice: '',
		microsite_notice_href: '',
		new_rider_note: '',
		meeting_instructions: '',
		faq_1_q: '',
		faq_1_a: '',
		faq_2_q: '',
		faq_2_a: '',
		safety_note: '',
		sponsor_links: [...DEFAULT_SPONSOR_LINKS],
		sponsor_items: [...DEFAULT_SPONSOR_ITEMS],
		ride_widget_enabled: false,
		ride_widget_title: 'Ride calendar',
		ride_widget_host_scope: 'group_only',
		ride_widget_group_ids: [],
		ride_widget_config: normalizeRideWidgetConfig({}),
		announcement_expires_at: null,
		sections: { ...DEFAULT_SITE_SECTIONS },
		ai_prompt: '',
		published: true
	};
}

export function normalizeGroupSiteConfig(value, { group = null } = {}) {
	const base = buildDefaultGroupSiteConfig(group || {});
	const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
	const themeMode = normalizeChoice(source.theme_mode, GROUP_SITE_THEME_MODES, base.theme_mode);
	const themeName = hasThemeName(source.theme_name) ? cleanText(source.theme_name) : '';
	const sponsorItems = normalizeSponsorItems(source.sponsor_items, source.sponsor_links);
	const sponsorLinks = sponsorItems
		.map((item) => normalizeUrlish(item.url))
		.filter(Boolean)
		.slice(0, MAX_SPONSOR_ITEMS);

	return {
		site_title: clampText(source.site_title || base.site_title, 120) || base.site_title,
		site_tagline: clampText(source.site_tagline || base.site_tagline, 180),
		home_intro: clampText(source.home_intro || base.home_intro, 1400),
		featured_quote: clampText(source.featured_quote || base.featured_quote, 260),
		footer_blurb: clampText(source.footer_blurb || base.footer_blurb, 180),
		seo_description: clampText(source.seo_description || base.seo_description, 180),
		hero_style: normalizeChoice(source.hero_style, GROUP_SITE_HERO_STYLES, base.hero_style),
		background_style: normalizeChoice(
			source.background_style,
			GROUP_SITE_BACKGROUND_STYLES,
			base.background_style
		),
		panel_style: normalizeChoice(source.panel_style, GROUP_SITE_PANEL_STYLES, base.panel_style),
		panel_tone: normalizeChoice(source.panel_tone, GROUP_SITE_PANEL_TONES, base.panel_tone),
		panel_density: normalizeChoice(
			source.panel_density,
			GROUP_SITE_PANEL_DENSITIES,
			base.panel_density
		),
		font_pairing: normalizeChoice(source.font_pairing, GROUP_SITE_FONT_PAIRINGS, base.font_pairing),
		theme_mode: themeMode,
		theme_name: themeMode === 'repo' ? themeName || '3fp' : themeName,
		theme_colors: normalizeThemeColors(source.theme_colors),
		simple_mode: normalizeBoolean(source.simple_mode, true),
		microsite_notice: clampText(source.microsite_notice || '', 180),
		microsite_notice_href: normalizeUrlish(source.microsite_notice_href || ''),
		new_rider_note: clampText(source.new_rider_note || '', 600),
		meeting_instructions: clampText(source.meeting_instructions || '', 600),
		faq_1_q: clampText(source.faq_1_q || '', 120),
		faq_1_a: clampText(source.faq_1_a || '', 320),
		faq_2_q: clampText(source.faq_2_q || '', 120),
		faq_2_a: clampText(source.faq_2_a || '', 320),
		safety_note: clampText(source.safety_note || '', 360),
		sponsor_links: sponsorLinks,
		sponsor_items: sponsorItems,
		ride_widget_enabled: normalizeBoolean(source.ride_widget_enabled, base.ride_widget_enabled),
		ride_widget_title: clampText(source.ride_widget_title || base.ride_widget_title, 120),
		ride_widget_host_scope: normalizeChoice(
			source.ride_widget_host_scope,
			GROUP_SITE_RIDE_WIDGET_HOST_SCOPES,
			base.ride_widget_host_scope
		),
		ride_widget_group_ids: Array.from(
			new Set(
				(Array.isArray(source.ride_widget_group_ids) ? source.ride_widget_group_ids : [])
					.map((value) => cleanText(value).toLowerCase())
					.filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
			)
		).slice(0, 48),
		ride_widget_config: normalizeRideWidgetConfig(source.ride_widget_config || {}),
		announcement_expires_at: normalizeIsoDateTime(source.announcement_expires_at),
		sections: normalizeSections(source.sections),
		ai_prompt: clampText(source.ai_prompt || '', 2000),
		published: normalizeBoolean(source.published, true)
	};
}

export function serializeGroupSiteConfig(config) {
	const normalized = normalizeGroupSiteConfig(config);
	return {
		site_title: normalized.site_title,
		site_tagline: normalized.site_tagline,
		home_intro: normalized.home_intro,
		featured_quote: normalized.featured_quote || null,
		footer_blurb: normalized.footer_blurb || null,
		seo_description: normalized.seo_description || null,
		hero_style: normalized.hero_style,
		background_style: normalized.background_style,
		panel_style: normalized.panel_style,
		panel_tone: normalized.panel_tone,
		panel_density: normalized.panel_density,
		font_pairing: normalized.font_pairing,
		theme_mode: normalized.theme_mode,
		theme_name: normalized.theme_name || null,
		theme_colors: normalized.theme_colors,
		simple_mode: normalized.simple_mode,
		microsite_notice: normalized.microsite_notice || null,
		microsite_notice_href: normalized.microsite_notice_href || null,
		new_rider_note: normalized.new_rider_note || null,
		meeting_instructions: normalized.meeting_instructions || null,
		faq_1_q: normalized.faq_1_q || null,
		faq_1_a: normalized.faq_1_a || null,
		faq_2_q: normalized.faq_2_q || null,
		faq_2_a: normalized.faq_2_a || null,
		safety_note: normalized.safety_note || null,
		sponsor_links: normalized.sponsor_links,
		sponsor_items: normalized.sponsor_items,
		ride_widget_enabled: normalized.ride_widget_enabled,
		ride_widget_title: normalized.ride_widget_title || null,
		ride_widget_host_scope: normalized.ride_widget_host_scope,
		ride_widget_group_ids: normalized.ride_widget_group_ids,
		ride_widget_config: normalized.ride_widget_config,
		announcement_expires_at: normalized.announcement_expires_at || null,
		sections: normalized.sections,
		ai_prompt: normalized.ai_prompt || null,
		published: normalized.published
	};
}

export function parseGroupSiteFormData(formData, { group = null } = {}) {
	const sections = {};
	for (const key of GROUP_SITE_SECTION_KEYS) {
		sections[key] = formData.get(`section_${key}`) === 'on';
	}
	const sponsorItemsFromJson = parseSponsorItemsJson(formData.get('sponsor_items_json'));
	const rideWidgetFilterMode = (() => {
		const mode = cleanText(formData.get('ride_widget_filter_mode'));
		if (mode === 'radius') return 'radius';
		if (mode === 'location') return 'location';
		return 'none';
	})();

	return normalizeGroupSiteConfig(
		{
			site_title: formData.get('site_title'),
			site_tagline: formData.get('site_tagline'),
			home_intro: formData.get('home_intro'),
			featured_quote: formData.get('featured_quote'),
			footer_blurb: formData.get('footer_blurb'),
			seo_description: formData.get('seo_description'),
			hero_style: formData.get('hero_style'),
			background_style: formData.get('background_style'),
			panel_style: formData.get('panel_style'),
			panel_tone: formData.get('panel_tone'),
			panel_density: formData.get('panel_density'),
			font_pairing: formData.get('font_pairing'),
			theme_mode: formData.get('theme_mode'),
			theme_name: formData.get('theme_name'),
			theme_colors: {
				primary: formData.get('theme_primary'),
				secondary: formData.get('theme_secondary'),
				accent: formData.get('theme_accent'),
				surface: formData.get('theme_surface')
			},
			simple_mode: formData.get('simple_mode') === 'on',
			microsite_notice: formData.get('microsite_notice'),
			microsite_notice_href: formData.get('microsite_notice_href'),
			new_rider_note: formData.get('new_rider_note'),
			meeting_instructions: formData.get('meeting_instructions'),
			faq_1_q: formData.get('faq_1_q'),
			faq_1_a: formData.get('faq_1_a'),
			faq_2_q: formData.get('faq_2_q'),
			faq_2_a: formData.get('faq_2_a'),
			safety_note: formData.get('safety_note'),
			sponsor_links: [
				formData.get('sponsor_link_1'),
				formData.get('sponsor_link_2'),
				formData.get('sponsor_link_3')
			],
			sponsor_items: sponsorItemsFromJson || [
				{
					name: formData.get('sponsor_name_1'),
					text: formData.get('sponsor_text_1'),
					logo: formData.get('sponsor_logo_1'),
					url: formData.get('sponsor_link_1')
				},
				{
					name: formData.get('sponsor_name_2'),
					text: formData.get('sponsor_text_2'),
					logo: formData.get('sponsor_logo_2'),
					url: formData.get('sponsor_link_2')
				},
				{
					name: formData.get('sponsor_name_3'),
					text: formData.get('sponsor_text_3'),
					logo: formData.get('sponsor_logo_3'),
					url: formData.get('sponsor_link_3')
				}
			],
			ride_widget_enabled: formData.get('ride_widget_enabled') === 'on',
			ride_widget_title: formData.get('ride_widget_title'),
			ride_widget_host_scope: formData.get('ride_widget_host_scope'),
			ride_widget_group_ids: cleanText(formData.get('ride_widget_group_ids'))
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean),
			ride_widget_config: {
				organizationSlug: '',
				location: rideWidgetFilterMode === 'location' ? formData.get('ride_widget_location') : '',
				city: '',
				state: '',
				near: rideWidgetFilterMode === 'radius' ? formData.get('ride_widget_near') : '',
				radiusMiles:
					rideWidgetFilterMode === 'radius' ? formData.get('ride_widget_radius_miles') : null,
				latitude: null,
				longitude: null,
				defaultTab: formData.get('ride_widget_default_tab'),
				theme: formData.get('ride_widget_theme'),
				density: formData.get('ride_widget_density'),
				showUserFilters: formData.get('ride_widget_show_user_filters') === 'on',
				showAddButton: formData.get('ride_widget_show_add_button') === 'on',
				prefixCity: formData.get('ride_widget_prefix_city') === 'on',
				difficultyColors: formData.get('ride_widget_difficulty_colors') === 'on',
				excludeRideSlugs: []
			},
			announcement_expires_at: formData.get('announcement_expires_at'),
			sections,
			ai_prompt: formData.get('ai_prompt'),
			published: formData.get('published') !== 'off'
		},
		{ group }
	);
}

export function mergeGroupSiteConfig(...values) {
	let merged = {};
	for (const value of values) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
		merged = {
			...merged,
			...value,
			theme_colors: {
				...(merged.theme_colors || {}),
				...(value.theme_colors || {})
			},
			sections: {
				...(merged.sections || {}),
				...(value.sections || {})
			}
		};
	}
	return normalizeGroupSiteConfig(merged);
}
