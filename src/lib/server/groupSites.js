import sharp from 'sharp';
import { supabase } from '$lib/supabaseClient';
import { listGroupAssetBuckets, getGroupAssetsReadClient } from '$lib/server/groupAssets';
import {
	buildGroupNewsView,
	getGroupNewsProfilesMap,
	listPublishedGroupNewsPosts
} from '$lib/server/groupNews';
import { normalizeVolunteerEvents } from '$lib/volunteer/event-utils';
import { buildContactLinks, selectPrimaryCta } from '$lib/groups/contactLinks';
import {
	buildDefaultGroupSiteConfig,
	mergeGroupSiteConfig,
	normalizeGroupSiteConfig,
	serializeGroupSiteConfig
} from '$lib/microsites/config';
import { buildMicrositeUrl, normalizeMicrositeSlug } from '$lib/microsites/host';
import { buildMicrositeThemeStyle, normalizePalette } from '$lib/microsites/theme';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { filterRidesForWidget } from '$lib/rides/widgetConfig';

const IMAGE_FETCH_TIMEOUT_MS = 8000;
const PALETTE_CACHE = new Map();

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function splitTextIntoParagraphs(value) {
	return cleanText(value)
		.split(/\n{2,}/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function serializeContactLink(link) {
	const key = cleanText(link?.key);
	const href = cleanText(link?.href);
	if (!key || !href) return null;

	const serialized = {
		key,
		href
	};

	const label = cleanText(link?.label);
	if (label) serialized.label = label;
	if (Boolean(link?.showText)) serialized.showText = true;

	return serialized;
}

function serializePrimaryCta(primaryCta) {
	if (!primaryCta || typeof primaryCta !== 'object') return null;
	const key = cleanText(primaryCta.key);
	const href = cleanText(primaryCta.href);
	const label = cleanText(primaryCta.label);
	if (!href) return null;

	return {
		...(key ? { key } : {}),
		href,
		...(label ? { label } : {})
	};
}

function pickGroupSiteClient() {
	return createServiceSupabaseClient() ?? supabase;
}

function toAbsoluteHref(group, href) {
	const raw = cleanText(href);
	if (!raw) return '';
	try {
		if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw) || /^tel:/i.test(raw)) {
			return raw;
		}
		if (raw.startsWith('/')) return raw;
		return `https://${raw}`;
	} catch {
		return group?.website_url || '';
	}
}

function buildGroupStoryParagraphs(group, siteConfig) {
	const primary = cleanText(siteConfig.home_intro) || cleanText(group?.description);
	const details = [
		cleanText(group?.service_area_description),
		cleanText(group?.activity_frequency),
		cleanText(group?.typical_activity_day_time),
		cleanText(group?.membership_info),
		cleanText(group?.how_to_join_instructions)
	].filter(Boolean);

	return [
		...splitTextIntoParagraphs(primary),
		...details.map((value) => value.replace(/\s+/g, ' ').trim())
	].slice(0, 5);
}

function getImageCandidateUrls(group) {
	return [cleanText(group?.logo_url), cleanText(group?.cover_photo_url)].filter(Boolean);
}

function rgbToHsl({ r, g, b }) {
	const red = r / 255;
	const green = g / 255;
	const blue = b / 255;
	const max = Math.max(red, green, blue);
	const min = Math.min(red, green, blue);
	const lightness = (max + min) / 2;
	const delta = max - min;

	if (!delta) {
		return { h: 0, s: 0, l: lightness };
	}

	const saturation =
		lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
	let hue = 0;
	if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
	else if (max === green) hue = (blue - red) / delta + 2;
	else hue = (red - green) / delta + 4;

	return { h: hue / 6, s: saturation, l: lightness };
}

function rgbToHex({ r, g, b }) {
	return `#${[r, g, b]
		.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase()}`;
}

function distanceBetweenColors(left, right) {
	return Math.sqrt(
		(left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2
	);
}

function quantizeColor({ r, g, b }) {
	const step = 32;
	return {
		r: Math.max(0, Math.min(255, Math.round(r / step) * step)),
		g: Math.max(0, Math.min(255, Math.round(g / step) * step)),
		b: Math.max(0, Math.min(255, Math.round(b / step) * step))
	};
}

function selectDistinctColors(colors, count = 3) {
	const picked = [];
	for (const candidate of colors) {
		if (!picked.length) {
			picked.push(candidate);
			if (picked.length >= count) break;
			continue;
		}
		const distinct = picked.every((entry) => distanceBetweenColors(entry, candidate) >= 82);
		if (!distinct) continue;
		picked.push(candidate);
		if (picked.length >= count) break;
	}
	return picked;
}

async function extractPaletteFromImageUrl(imageUrl) {
	const url = cleanText(imageUrl);
	if (!url) return null;
	if (PALETTE_CACHE.has(url)) return PALETTE_CACHE.get(url);

	const promise = (async () => {
		const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
		if (!response.ok) throw new Error(`Image request failed (${response.status})`);
		const contentType = cleanText(response.headers.get('content-type')).toLowerCase();
		if (!contentType.startsWith('image/')) throw new Error('Not an image');
		const buffer = Buffer.from(await response.arrayBuffer());
		const { data, info } = await sharp(buffer)
			.resize(64, 64, { fit: 'inside' })
			.removeAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		const histogram = new Map();
		for (let index = 0; index < data.length; index += info.channels) {
			const rgb = quantizeColor({
				r: data[index],
				g: data[index + 1],
				b: data[index + 2]
			});
			const hsl = rgbToHsl(rgb);
			if (hsl.l < 0.2 || hsl.l > 0.9) continue;
			if (hsl.s < 0.18) continue;
			const key = `${rgb.r},${rgb.g},${rgb.b}`;
			histogram.set(key, (histogram.get(key) || 0) + 1);
		}

		const ranked = Array.from(histogram.entries())
			.map(([key, count]) => {
				const [r, g, b] = key.split(',').map((part) => Number.parseInt(part, 10) || 0);
				const hsl = rgbToHsl({ r, g, b });
				const lightnessCenter = 1 - Math.min(1, Math.abs(hsl.l - 0.56) / 0.56);
				const score = count * (0.6 + hsl.s * 0.9 + lightnessCenter * 0.45);
				return { r, g, b, count, score };
			})
			.sort((left, right) => right.score - left.score);

		const picked = selectDistinctColors(ranked, 3);
		if (!picked.length) return null;

		const primary = picked[0];
		const secondary = picked[1] || picked[0];
		const accent = picked[2] || picked[1] || picked[0];

		return {
			primary: rgbToHex(primary),
			secondary: rgbToHex(secondary),
			accent: rgbToHex(accent),
			surface: '#10161F'
		};
	})()
		.catch(() => null)
		.finally(() => {
			if (PALETTE_CACHE.size > 128) {
				const firstKey = PALETTE_CACHE.keys().next().value;
				if (firstKey) PALETTE_CACHE.delete(firstKey);
			}
		});

	const cached = promise.then((palette) => {
		if (!palette) {
			PALETTE_CACHE.delete(url);
		}
		return palette;
	});

	PALETTE_CACHE.set(url, cached);
	return cached;
}

export async function deriveGroupSitePalette(group, siteConfig = null) {
	const config = normalizeGroupSiteConfig(siteConfig || {}, { group });
	if (config.theme_mode === 'custom') {
		return normalizePalette(config.theme_colors, group?.slug || group?.name);
	}

	for (const imageUrl of getImageCandidateUrls(group)) {
		const palette = await extractPaletteFromImageUrl(imageUrl);
		if (palette) {
			return normalizePalette(
				{
					primary: palette.primary,
					surface: palette.surface
				},
				group?.slug || group?.name
			);
		}
	}

	return normalizePalette(config.theme_colors, group?.slug || group?.name);
}

export async function getGroupSiteConfig(groupId, { group = null } = {}) {
	if (!groupId) return normalizeGroupSiteConfig({}, { group });
	const db = pickGroupSiteClient();
	const { data } = await db.from('group_site_configs').select('*').eq('group_id', groupId).maybeSingle();
	return normalizeGroupSiteConfig(data || {}, { group });
}

export async function upsertGroupSiteConfig(groupId, config) {
	const db = pickGroupSiteClient();
	const payload = serializeGroupSiteConfig(config);
	const { data, error } = await db
		.from('group_site_configs')
		.upsert(
			{
				group_id: groupId,
				...payload,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'group_id' }
		)
		.select('*')
		.single();
	if (error) throw error;
	return data;
}

async function loadGroupByMicrositeSlug(siteSlug) {
	const db = pickGroupSiteClient();
	const { data, error } = await db.from('groups').select('*').eq('microsite_slug', siteSlug).maybeSingle();
	if (error) throw error;
	return data;
}

async function loadDonationEnabled(groupId) {
	const db = pickGroupSiteClient();
	const { data } = await db
		.from('donation_accounts')
		.select('stripe_account_id,charges_enabled')
		.eq('group_id', groupId)
		.maybeSingle();
	return Boolean(data?.stripe_account_id && data?.charges_enabled);
}

async function loadMembershipSummary(fetchImpl, groupSlug) {
	try {
		const response = await fetchImpl(
			`/api/groups/${encodeURIComponent(groupSlug)}/membership/program?include_inactive=false`
		);
		const payload = await response.json().catch(() => ({}));
		if (!response.ok || !payload?.data) {
			return { program: null, tiers: [], formFields: [] };
		}
		return {
			program: payload.data.program ?? null,
			tiers: Array.isArray(payload.data.tiers) ? payload.data.tiers : [],
			formFields: Array.isArray(payload.data.form_fields) ? payload.data.form_fields : []
		};
	} catch {
		return { program: null, tiers: [], formFields: [] };
	}
}

async function loadVolunteerEvents(fetchImpl, groupId, limit = 4) {
	try {
		const now = new Date();
		const horizon = new Date(now);
		horizon.setDate(horizon.getDate() - 7);
		const horizonIso = horizon.toISOString();
		const response = await fetchImpl(
			`/api/v1/volunteer-events?status=eq.published&host_group_id=eq.${groupId}&event_start=gte.${horizonIso}&order=event_start.asc&limit=${limit}&select=id,slug,title,summary,description,event_start,event_end,timezone,location_name,location_address,latitude,longitude,host_group_id,event_type_slug,status,max_volunteers`
		);
		if (!response.ok) return [];
		const payload = await response.json().catch(() => ({}));
		return normalizeVolunteerEvents(Array.isArray(payload?.data) ? payload.data : []);
	} catch {
		return [];
	}
}

async function loadRides(fetchImpl, groupId, limit = 4) {
	try {
		const response = await fetchImpl(
			`/api/rides?${new URLSearchParams({ host_group_id: groupId }).toString()}`
		);
		if (!response.ok) return [];
		const payload = await response.json().catch(() => ({}));
		return Array.isArray(payload?.data) ? payload.data.slice(0, limit) : [];
	} catch {
		return [];
	}
}

async function loadAllPublishedRides(fetchImpl, limit = 200) {
	try {
		const response = await fetchImpl('/api/rides');
		if (!response.ok) return [];
		const payload = await response.json().catch(() => ({}));
		const rows = Array.isArray(payload?.data) ? payload.data : [];
		return rows.slice(0, limit);
	} catch {
		return [];
	}
}

function buildMicrositeRideWidgetRides({ allRides, group, siteConfig }) {
	if (!siteConfig?.ride_widget_enabled) return [];
	const hostScope = cleanText(siteConfig.ride_widget_host_scope) || 'group_only';
	const selectedGroupIds = Array.isArray(siteConfig.ride_widget_group_ids)
		? siteConfig.ride_widget_group_ids.map((value) => cleanText(value).toLowerCase()).filter(Boolean)
		: [];
	const widgetConfig = siteConfig?.ride_widget_config || {};

	if (hostScope === 'group_only') {
		return filterRidesForWidget(allRides, {
			...widgetConfig,
			organizationSlug: cleanText(group?.slug).toLowerCase()
		}).slice(0, 24);
	}
	if (hostScope === 'selected_groups' && selectedGroupIds.length) {
		const selected = new Set(selectedGroupIds);
		return filterRidesForWidget(allRides, widgetConfig)
			.filter((ride) => selected.has(cleanText(ride?.group?.id).toLowerCase()))
			.slice(0, 24);
	}
	return filterRidesForWidget(allRides, widgetConfig).slice(0, 24);
}

async function fetchApiList(fetchImpl, resource, params = {}) {
	try {
		const qs = new URLSearchParams();
		for (const [key, value] of Object.entries(params || {})) {
			if (value === null || value === undefined || value === '') continue;
			qs.set(key, String(value));
		}
		const response = await fetchImpl(`/api/v1/${resource}${qs.toString() ? `?${qs}` : ''}`);
		if (!response.ok) return [];
		const payload = await response.json().catch(() => ({}));
		const rows = payload?.data ?? payload;
		return Array.isArray(rows) ? rows : [];
	} catch {
		return [];
	}
}

async function loadGroupTaxonomy(fetchImpl, groupId) {
	const [audiences, disciplines, skills, selectedAudienceRows, selectedDisciplineRows, selectedSkillRows] =
		await Promise.all([
			fetchApiList(fetchImpl, 'audience-focuses', {
				select: 'id,name',
				order: 'name.asc'
			}),
			fetchApiList(fetchImpl, 'riding-disciplines', {
				select: 'id,name',
				order: 'name.asc'
			}),
			fetchApiList(fetchImpl, 'skill-levels', {
				select: 'id,name',
				order: 'name.asc'
			}),
			fetchApiList(fetchImpl, 'group-x-audience-focuses', {
				select: 'audience_focus_id',
				group_id: `eq.${groupId}`
			}),
			fetchApiList(fetchImpl, 'group-x-riding-disciplines', {
				select: 'riding_discipline_id',
				group_id: `eq.${groupId}`
			}),
			fetchApiList(fetchImpl, 'group-x-skill-levels', {
				select: 'skill_level_id',
				group_id: `eq.${groupId}`
			})
		]);

	const audienceMap = new Map(audiences.map((row) => [row.id, row.name]));
	const disciplineMap = new Map(disciplines.map((row) => [row.id, row.name]));
	const skillMap = new Map(skills.map((row) => [row.id, row.name]));

	return {
		audiences: selectedAudienceRows
			.map((row) => audienceMap.get(row?.audience_focus_id))
			.filter(Boolean)
			.slice(0, 6),
		disciplines: selectedDisciplineRows
			.map((row) => disciplineMap.get(row?.riding_discipline_id))
			.filter(Boolean)
			.slice(0, 6),
		skills: selectedSkillRows
			.map((row) => skillMap.get(row?.skill_level_id))
			.filter(Boolean)
			.slice(0, 6)
	};
}

async function loadOwnerCount(groupId) {
	const db = pickGroupSiteClient();
	const { count } = await db
		.from('group_members')
		.select('user_id', { count: 'exact', head: true })
		.eq('group_id', groupId)
		.eq('role', 'owner');
	return Number(count || 0);
}

function summarizeStats({ group, rides, volunteerEvents }) {
	const location = [cleanText(group?.city), cleanText(group?.state_region)]
		.filter(Boolean)
		.join(', ');
	return [
		{ label: 'Based', value: location || 'Local community' },
		{
			label: 'Rhythm',
			value:
				cleanText(group?.activity_frequency) ||
				(rides.length ? `${rides.length} upcoming rides` : 'Active community')
		},
		{
			label: 'Volunteer',
			value: volunteerEvents.length ? `${volunteerEvents.length} upcoming opportunities` : 'Watch this space'
		}
	];
}

function buildActionButtons(group, primaryCta, { siteUrl, membershipProgram }) {
	const actions = [];
	if (primaryCta?.href) {
		actions.push({
			label: primaryCta.label || 'Connect',
			href: toAbsoluteHref(group, primaryCta.href),
			external: /^https?:\/\//i.test(primaryCta.href)
		});
	}
	if (membershipProgram?.enabled === true) {
		actions.push({
			label: cleanText(membershipProgram?.cta_label) || 'Follow',
			href: `${siteUrl}/join`,
			external: false
		});
	}
	if (!actions.length && group?.website_url) {
		actions.push({
			label: 'Website',
			href: toAbsoluteHref(group, group.website_url),
			external: true
		});
	}
	return actions.slice(0, 3);
}

export async function loadMicrositeNewsViews(groupId) {
	const db = pickGroupSiteClient();
	const posts = await listPublishedGroupNewsPosts(db, groupId);
	const profileIds = Array.from(
		new Set(posts.flatMap((post) => [post.created_by_user_id, post.updated_by_user_id]).filter(Boolean))
	);
	const profiles = await getGroupNewsProfilesMap(db, profileIds);
	return Promise.all(posts.map((post) => buildGroupNewsView(post, { profiles })));
}

export async function loadGroupMicrosite({ siteSlug, fetch: fetchImpl, url }) {
	const normalizedSiteSlug = normalizeMicrositeSlug(siteSlug);
	if (!normalizedSiteSlug) return null;

	const group = await loadGroupByMicrositeSlug(normalizedSiteSlug);
	if (!group) return null;

	const storedConfig = await getGroupSiteConfig(group.id, { group });
	const siteConfig = mergeGroupSiteConfig(buildDefaultGroupSiteConfig(group), storedConfig);
	const palette =
		siteConfig.theme_mode === 'repo'
			? null
			: await deriveGroupSitePalette(group, siteConfig).catch(() => null);

	const themeStyle =
		siteConfig.theme_mode === 'repo'
			? ''
			: buildMicrositeThemeStyle({
					palette: palette || undefined,
					fontPairing: siteConfig.font_pairing
				});

	const [assetBuckets, newsPosts, rides, allRides, volunteerEvents, membership, donationEnabled, taxonomy, ownerCount] =
		await Promise.all([
			listGroupAssetBuckets(getGroupAssetsReadClient(), group.id).catch(() => []),
			listPublishedGroupNewsPosts(pickGroupSiteClient(), group.id, { limit: 3 }).catch(() => []),
			loadRides(fetchImpl, group.id, 4),
			loadAllPublishedRides(fetchImpl, 240),
			loadVolunteerEvents(fetchImpl, group.id, 4),
			loadMembershipSummary(fetchImpl, group.slug),
			loadDonationEnabled(group.id).catch(() => false),
			loadGroupTaxonomy(fetchImpl, group.id),
			loadOwnerCount(group.id).catch(() => 0)
		]);

	const widgetRides = buildMicrositeRideWidgetRides({ allRides, group, siteConfig });

	const photoBucket = assetBuckets.find((bucket) => bucket.slug === 'photos') || null;
	const rawContactLinks = buildContactLinks(group);
	const rawPrimaryCta = selectPrimaryCta(group, rawContactLinks);
	const contactLinks = rawContactLinks.map(serializeContactLink).filter(Boolean);
	const primaryCta = serializePrimaryCta(rawPrimaryCta);
	const micrositeSlug = normalizeMicrositeSlug(group.microsite_slug || group.slug);
	const siteUrl = buildMicrositeUrl(micrositeSlug, url);
	const previewPath = `/site/${encodeURIComponent(micrositeSlug)}`;
	const basePath = cleanText(url?.pathname).startsWith('/site/') ? previewPath : '';
	const actions = buildActionButtons(group, primaryCta, {
		siteUrl: basePath || siteUrl,
		membershipProgram: membership.program
	});
	const stats = summarizeStats({
		group,
		rides,
		volunteerEvents
	});
	const now = Date.now();
	const weekSpotlight = {
		ride: rides?.[0] || null,
		volunteer: volunteerEvents?.[0] || null,
		news: newsPosts?.[0] || null
	};
	const announcementExpiry = cleanText(siteConfig.announcement_expires_at);
	const announcementIsActive =
		!announcementExpiry || Number.isNaN(new Date(announcementExpiry).getTime())
			? Boolean(cleanText(siteConfig.microsite_notice))
			: new Date(announcementExpiry).getTime() >= now && Boolean(cleanText(siteConfig.microsite_notice));
	const trust = {
		isClaimed: ownerCount > 0,
		ownerCount,
		lastUpdatedAt: group?.updated_at || null
	};

	return {
		group,
		micrositeSlug,
		siteConfig,
		theme: {
			dataTheme: siteConfig.theme_mode === 'repo' ? siteConfig.theme_name || '3fp' : '3fp',
			style: themeStyle,
			palette
		},
		siteUrl,
		previewPath,
		basePath,
		contactLinks,
		primaryCta,
		actions,
		stats,
		taxonomy,
		weekSpotlight,
		trust,
		announcementIsActive,
		storyParagraphs: buildGroupStoryParagraphs(group, siteConfig),
		assetBuckets,
		photoBucket,
		newsPosts,
		rides,
		widgetRides,
		volunteerEvents,
		membershipProgram: membership.program,
		membershipTiers: membership.tiers,
		membershipFormFields: membership.formFields,
		donationEnabled,
		donationUrl: donationEnabled ? `/donate?group=${encodeURIComponent(group.slug)}` : ''
	};
}
