import { parseGroupSiteFormData } from '../microsites/config.js';
import { isReservedMicrositeSlug, normalizeMicrositeSlug } from '../microsites/host.js';

export const GROUP_SITE_EDITOR_VIEWS = Object.freeze([
	'builder',
	'quick',
	'navigation',
	'appearance',
	'rides',
	'address',
	'more'
]);

export const GROUP_SITE_LOGO_MAX_BYTES = 5 * 1024 * 1024;

const EDITOR_ENVELOPE_KEYS = new Set([
	'microsite_slug',
	'return_view',
	'ride_widget_filter_mode',
	'pending_sponsor_logo_files'
]);

export function normalizeGroupSiteEditorView(value, fallback = 'builder') {
	const raw = String(value ?? '').trim();
	const normalized = raw === 'buillder' ? 'builder' : raw;
	return GROUP_SITE_EDITOR_VIEWS.includes(normalized) ? normalized : fallback;
}

export function validateGroupSiteDraftSubmission({
	slug,
	files = [],
	maxLogoBytes = GROUP_SITE_LOGO_MAX_BYTES
} = {}) {
	const normalizedSlug = normalizeMicrositeSlug(slug);
	if (!normalizedSlug) {
		return {
			ok: false,
			reason: 'invalid_slug',
			error: 'Website slug is required and can only use letters/numbers.'
		};
	}
	if (isReservedMicrositeSlug(normalizedSlug)) {
		return {
			ok: false,
			reason: 'reserved_slug',
			error: 'That website slug is reserved. Pick another one.'
		};
	}
	for (const file of files) {
		if (file && typeof file === 'object' && 'size' in file && Number(file.size) > maxLogoBytes) {
			return {
				ok: false,
				reason: 'file_too_large',
				error: `${file.name || 'Sponsor logo'} exceeds the 5 MB limit.`
			};
		}
	}
	return { ok: true, slug: normalizedSlug };
}

export function toLocalDateTimeValue(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function toIsoDateTimeValue(value) {
	if (!value) return '';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function sortSiteEditorValue(value) {
	if (Array.isArray(value)) return value.map(sortSiteEditorValue);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortSiteEditorValue(value[key])])
	);
}

export function siteEditorConfigFingerprint(value) {
	return JSON.stringify(sortSiteEditorValue(value || {}));
}

function stripEditorEnvelopeKeys(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const clone = structuredClone(value);
	for (const key of EDITOR_ENVELOPE_KEYS) {
		delete clone[key];
	}
	return clone;
}

export function mergeGroupSiteEditorConfig(
	defaultConfig = {},
	savedConfig = {},
	draftConfig = null
) {
	const defaults = stripEditorEnvelopeKeys(defaultConfig);
	const saved = stripEditorEnvelopeKeys(savedConfig);
	const draft = draftConfig ? stripEditorEnvelopeKeys(draftConfig) : null;
	const rawAnnouncementExpiresAt =
		draft && 'announcement_expires_at' in draft && draft.announcement_expires_at !== undefined
			? draft.announcement_expires_at
			: 'announcement_expires_at' in saved && saved.announcement_expires_at !== undefined
				? saved.announcement_expires_at
				: defaults.announcement_expires_at;
	return {
		...defaults,
		...saved,
		...(draft || {}),
		theme_colors: {
			...(defaults.theme_colors || {}),
			...(saved.theme_colors || {}),
			...(draft?.theme_colors || {})
		},
		sections: {
			...(defaults.sections || {}),
			...(saved.sections || {}),
			...(draft?.sections || {})
		},
		ride_widget_config: {
			...(defaults.ride_widget_config || {}),
			...(saved.ride_widget_config || {}),
			...(draft?.ride_widget_config || {})
		},
		announcement_expires_at: toLocalDateTimeValue(rawAnnouncementExpiresAt)
	};
}

export function extractGroupSiteEditorFormValues(formData, { group = null } = {}) {
	const config = parseGroupSiteFormData(formData, { group });
	const pendingSponsorLogoFiles = [];
	for (const [key, entry] of formData.entries()) {
		if (
			key.startsWith('sponsor_logo_file_') &&
			entry &&
			typeof entry === 'object' &&
			'size' in entry &&
			Number(entry.size) > 0
		) {
			pendingSponsorLogoFiles.push(String(entry.name || 'Sponsor logo'));
		}
	}

	let sponsorItems = config.sponsor_items;
	const rawSponsors = formData.get('sponsor_items_json');
	if (rawSponsors) {
		try {
			const parsedSponsors = JSON.parse(String(rawSponsors));
			if (Array.isArray(parsedSponsors)) {
				const normalizedByIndex = parsedSponsors.slice(0, 12).map((item, index) => {
					const file = formData.get(`sponsor_logo_file_${index}`);
					const hasPendingFile =
						Boolean(file) && typeof file === 'object' && 'size' in file && Number(file.size) > 0;
					const name = String(item?.name || '')
						.trim()
						.slice(0, 120);
					const text = String(item?.text || '')
						.trim()
						.slice(0, 220);
					const logo = String(item?.logo || '').trim();
					const url = String(item?.url || '').trim();
					if (!name && !text && !logo && !url && !hasPendingFile) return null;
					return { name, text, logo, url };
				});
				if (normalizedByIndex.some(Boolean)) {
					const configQueue = [...(config.sponsor_items || [])];
					sponsorItems = normalizedByIndex
						.map((item) => {
							if (!item) return null;
							if (!item.name && !item.text && !item.logo && !item.url) return item;
							return configQueue.shift() || item;
						})
						.filter(Boolean);
				}
			}
		} catch {
			// Keep normalized sponsor_items from parseGroupSiteFormData on malformed JSON.
		}
	}

	const rawFilterMode = String(formData.get('ride_widget_filter_mode') ?? '').trim();
	const rideWidgetFilterMode = ['none', 'location', 'radius'].includes(rawFilterMode)
		? rawFilterMode
		: config.ride_widget_config?.near || config.ride_widget_config?.radiusMiles
			? 'radius'
			: config.ride_widget_config?.location
				? 'location'
				: 'none';

	return {
		...config,
		sponsor_items: sponsorItems,
		microsite_slug: String(formData.get('microsite_slug') ?? '').trim(),
		return_view: normalizeGroupSiteEditorView(formData.get('return_view'), 'builder'),
		ride_widget_filter_mode: rideWidgetFilterMode,
		pending_sponsor_logo_files: pendingSponsorLogoFiles
	};
}

export function buildGroupSiteEditorState({
	defaultSiteConfig = {},
	siteConfig = {},
	micrositeSlug = '',
	group = null,
	values = null,
	startSponsorIndex = 0
} = {}) {
	const mergedConfig = mergeGroupSiteEditorConfig(defaultSiteConfig, siteConfig, values);
	const pageBlocks = structuredClone(mergedConfig.page_blocks || []);
	const sitePages = structuredClone(mergedConfig.site_pages || []);
	const selectedPageId = sitePages[0]?.id || 'home';
	let sponsorSequence = startSponsorIndex;
	const sponsorItems = (
		Array.isArray(mergedConfig.sponsor_items) ? mergedConfig.sponsor_items : []
	).map((item) => ({
		_editorId: `sponsor-${sponsorSequence++}`,
		name: String(item?.name || ''),
		text: String(item?.text || ''),
		logo: String(item?.logo || ''),
		url: String(item?.url || '')
	}));
	const faqItems = [
		{ question: mergedConfig.faq_1_q || '', answer: mergedConfig.faq_1_a || '' },
		{ question: mergedConfig.faq_2_q || '', answer: mergedConfig.faq_2_a || '' }
	].filter((item) => item.question || item.answer);
	const slugInput =
		values && typeof values === 'object' && 'microsite_slug' in values
			? String(values.microsite_slug ?? '')
			: String(micrositeSlug || '');
	const activeView =
		values && typeof values === 'object' && 'return_view' in values
			? normalizeGroupSiteEditorView(values.return_view, 'builder')
			: 'builder';
	const widget = mergedConfig.ride_widget_config || {};
	const rideFilterMode =
		values &&
		typeof values === 'object' &&
		['none', 'location', 'radius'].includes(values.ride_widget_filter_mode)
			? values.ride_widget_filter_mode
			: widget.near || widget.radiusMiles
				? 'radius'
				: widget.location
					? 'location'
					: 'none';
	const rideLocation = widget.location || '';
	const rideNear = widget.near || [group?.city, group?.state_region].filter(Boolean).join(', ');
	const rideRadius = widget.radiusMiles || '50';
	const rideDefaultTab = widget.defaultTab || 'list';
	const rideTheme = widget.theme || 'auto';
	const rideDensity = widget.density || 'comfortable';
	const rideShowFilters = widget.showUserFilters ?? true;
	const rideShowAdd = widget.showAddButton ?? true;
	const ridePrefixCity = widget.prefixCity ?? false;
	const rideDifficultyColors = widget.difficultyColors ?? true;
	const selectedRideGroupIds = Array.isArray(mergedConfig.ride_widget_group_ids)
		? [...mergedConfig.ride_widget_group_ids]
		: [];

	return {
		siteConfig: mergedConfig,
		pageBlocks,
		sitePages,
		selectedPageId,
		sponsorItems,
		nextSponsorSequence: sponsorSequence,
		faqItems,
		slugInput,
		activeView,
		rideFilterMode,
		rideLocation,
		rideNear,
		rideRadius,
		rideDefaultTab,
		rideTheme,
		rideDensity,
		rideShowFilters,
		rideShowAdd,
		ridePrefixCity,
		rideDifficultyColors,
		selectedRideGroupIds
	};
}

export function createGroupSiteEditorSnapshot(state = {}) {
	return JSON.stringify({
		siteConfig: state.siteConfig,
		sitePages: state.sitePages,
		pageBlocks: state.pageBlocks,
		sponsorItems: (Array.isArray(state.sponsorItems) ? state.sponsorItems : []).map(
			({ name = '', text = '', logo = '', url = '' }) => ({ name, text, logo, url })
		),
		faqItems: state.faqItems,
		slugInput: state.slugInput,
		rideFilterMode: state.rideFilterMode,
		rideLocation: state.rideLocation,
		rideNear: state.rideNear,
		rideRadius: state.rideRadius,
		rideDefaultTab: state.rideDefaultTab,
		rideTheme: state.rideTheme,
		rideDensity: state.rideDensity,
		rideShowFilters: state.rideShowFilters,
		rideShowAdd: state.rideShowAdd,
		ridePrefixCity: state.ridePrefixCity,
		rideDifficultyColors: state.rideDifficultyColors,
		selectedRideGroupIds: state.selectedRideGroupIds,
		sponsorFileRevision: state.sponsorFileRevision ?? 0
	});
}
