<script>
	import { enhance } from '$app/forms';
	import { beforeNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { FileUpload } from '@skeletonlabs/skeleton-svelte';
	import { onMount, untrack } from 'svelte';
	import '#lib/map/leaflet.css';
	import * as env from '$app/env/public';
	import IconAlertTriangle from '@lucide/svelte/icons/triangle-alert';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconBadgeCheck from '@lucide/svelte/icons/badge-check';
	import IconBrush from '@lucide/svelte/icons/brush';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
	import IconDropzone from '@lucide/svelte/icons/image-plus';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconEye from '@lucide/svelte/icons/eye';
	import IconGlobe from '@lucide/svelte/icons/earth';
	import IconLayout from '@lucide/svelte/icons/layout-grid';
	import IconLink from '@lucide/svelte/icons/link';
	import IconList from '@lucide/svelte/icons/layout-list';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconMenu from '@lucide/svelte/icons/menu';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconRefresh from '@lucide/svelte/icons/refresh-ccw';
	import IconRemove from '@lucide/svelte/icons/circle-x';
	import IconSave from '@lucide/svelte/icons/save';
	import IconSettings from '@lucide/svelte/icons/settings-2';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconTrash from '@lucide/svelte/icons/trash';
	import IconType from '@lucide/svelte/icons/type';
	import ImageGeneratorPanel from '#lib/components/ai/ImageGeneratorPanel.svelte';
	import GroupSiteAiAssistant from '#lib/components/groups/GroupSiteAiAssistant.svelte';
	import GroupSiteBlockEditor from '#lib/components/groups/GroupSiteBlockEditor.svelte';
	import GroupSiteDomainManager from '#lib/components/groups/GroupSiteDomainManager.svelte';
	import GroupSitePartnerEditor from '#lib/components/groups/GroupSitePartnerEditor.svelte';
	import GroupSitePreview from '#lib/components/groups/GroupSitePreview.svelte';
	import { geocodeAddress } from '#lib/groups/geocoding';
	import {
		isWebsiteLayerView,
		mergeAiProposalIntoPresenceDraft,
		normalizePresenceStudioView,
		syncSiteConfigWithCoreGroup
	} from '#lib/groups/presenceStudio';
	import {
		buildGroupSiteEditorState,
		GROUP_SITE_LOGO_MAX_BYTES,
		mergeGroupSiteEditorConfig,
		toIsoDateTimeValue,
		validateGroupSiteDraftSubmission
	} from '#lib/groups/siteEditor';
	import { collectGroupSocialLinkInputs } from '#lib/groups/socialLinks';
	import BrandDiscord from '#lib/icons/BrandDiscord.svelte';
	import BrandFacebook from '#lib/icons/BrandFacebook.svelte';
	import BrandInstagram from '#lib/icons/BrandInstagram.svelte';
	import BrandMastodon from '#lib/icons/BrandMastodon.svelte';
	import BrandStrava from '#lib/icons/BrandStrava.svelte';
	import BrandTikTok from '#lib/icons/BrandTikTok.svelte';
	import BrandX from '#lib/icons/BrandX.svelte';
	import { deriveLegacySiteVisibility } from '#lib/microsites/blocks';
	import {
		GROUP_SITE_BACKGROUND_STYLES,
		GROUP_SITE_FONT_PAIRING_OPTIONS,
		GROUP_SITE_HERO_STYLES,
		GROUP_SITE_PANEL_DENSITIES,
		GROUP_SITE_PANEL_STYLES,
		GROUP_SITE_PANEL_TONES,
		GROUP_SITE_RIDE_WIDGET_HOST_SCOPES,
		GROUP_SITE_SECTION_KEYS
	} from '#lib/microsites/config';
	import {
		createGroupSitePage,
		GROUP_SITE_NAV_PLACEMENTS,
		GROUP_SITE_PAGE_LIMIT,
		GROUP_SITE_PRIMARY_NAV_LIMIT,
		GROUP_SITE_SPECIAL_NAV_ITEMS,
		normalizeGroupSiteNavigation,
		normalizeGroupSitePages,
		normalizeGroupSitePageSlug,
		pageBlock
	} from '#lib/microsites/pages';
	import { buildGroupSiteTemplate, GROUP_SITE_TEMPLATES } from '#lib/microsites/templates';
	import TurnstileVerification from '#lib/components/security/TurnstileVerification.svelte';

	let { data, form } = $props();

	const clone = (value) => JSON.parse(JSON.stringify(value));
	const MAX_BYTES = 10 * 1024 * 1024;
	const ZOOM_MIN = 0.1;
	const ZOOM_MAX = 6;

	const SOCIAL_FIELDS = [
		{
			key: 'instagram',
			id: 'social_instagram',
			label: 'Instagram',
			placeholder: 'username or full URL'
		},
		{
			key: 'facebook',
			id: 'social_facebook',
			label: 'Facebook',
			placeholder: 'page/username or full URL'
		},
		{ key: 'x', id: 'social_x', label: 'X (Twitter)', placeholder: 'handle or full URL' },
		{ key: 'threads', id: 'social_threads', label: 'Threads', placeholder: '@handle or full URL' },
		{ key: 'youtube', id: 'social_youtube', label: 'YouTube', placeholder: '@channel or full URL' },
		{
			key: 'mastodon',
			id: 'social_mastodon',
			label: 'Mastodon',
			placeholder: '@user@instance or full URL'
		},
		{ key: 'tiktok', id: 'social_tiktok', label: 'TikTok', placeholder: '@handle or full URL' },
		{
			key: 'strava',
			id: 'social_strava',
			label: 'Strava',
			placeholder: 'club name/ID or full URL'
		},
		{ key: 'bluesky', id: 'social_bluesky', label: 'Bluesky', placeholder: 'handle or full URL' },
		{
			key: 'discord',
			id: 'social_discord',
			label: 'Discord',
			placeholder: 'invite code or full URL'
		},
		{
			key: 'linkedin',
			id: 'social_linkedin',
			label: 'LinkedIn',
			placeholder: 'company/school or full URL'
		}
	];

	function buildInitialProfileDraft(sourceData) {
		const g = sourceData?.group || {};
		const socials = g.social_links && typeof g.social_links === 'object' ? g.social_links : {};
		const socialInputs = {};
		for (const field of SOCIAL_FIELDS) {
			socialInputs[field.key] = String(socials[field.key] || '');
		}
		return {
			name: String(g.name || ''),
			tagline: String(g.tagline || ''),
			description: String(g.description || ''),
			city: String(g.city || ''),
			state_region: String(g.state_region || ''),
			country: String(g.country || 'US').toUpperCase(),
			zip_code: String(g.zip_code || ''),
			specific_meeting_point_address: String(g.specific_meeting_point_address || ''),
			service_area_description: String(g.service_area_description || ''),
			latitude:
				g.latitude !== null && g.latitude !== undefined && Number.isFinite(Number(g.latitude))
					? Number(g.latitude).toFixed(6)
					: '',
			longitude:
				g.longitude !== null && g.longitude !== undefined && Number.isFinite(Number(g.longitude))
					? Number(g.longitude).toFixed(6)
					: '',
			website_url: String(g.website_url || ''),
			public_contact_email: String(g.public_contact_email || ''),
			public_phone_number: String(g.public_phone_number || ''),
			preferred_contact_method_instructions: String(g.preferred_contact_method_instructions || ''),
			how_to_join_instructions: String(g.how_to_join_instructions || ''),
			membership_info: String(g.membership_info || ''),
			activity_frequency: String(g.activity_frequency || ''),
			typical_activity_day_time: String(g.typical_activity_day_time || ''),
			preferred_cta_kind: String(g.preferred_cta_kind || 'auto'),
			preferred_cta_label: String(g.preferred_cta_label || ''),
			preferred_cta_url: String(g.preferred_cta_url || ''),
			socialInputs,
			instagramPostsText: Array.isArray(socials.instagram_posts)
				? socials.instagram_posts.join('\n')
				: '',
			group_type_ids: [...(sourceData?.selected?.group_type_ids || [])].sort((a, b) => a - b),
			audience_focus_ids: [...(sourceData?.selected?.audience_focus_ids || [])].sort(
				(a, b) => a - b
			),
			riding_discipline_ids: [...(sourceData?.selected?.riding_discipline_ids || [])].sort(
				(a, b) => a - b
			),
			skill_level_ids: [...(sourceData?.selected?.skill_level_ids || [])].sort((a, b) => a - b),
			logoUrl: String(g.logo_url || ''),
			coverUrl: String(g.cover_photo_url || ''),
			logoCropped: '',
			coverCropped: '',
			clearLogo: false,
			clearCover: false
		};
	}

	function applyProfileDraftValues(baseDraft, incomingProfile = null) {
		if (!incomingProfile || typeof incomingProfile !== 'object') return baseDraft;
		return {
			...baseDraft,
			...incomingProfile,
			socialInputs: {
				...(baseDraft.socialInputs || {}),
				...(incomingProfile.socialInputs || {})
			},
			group_type_ids: Array.isArray(incomingProfile.group_type_ids)
				? [...incomingProfile.group_type_ids].sort((a, b) => a - b)
				: baseDraft.group_type_ids,
			audience_focus_ids: Array.isArray(incomingProfile.audience_focus_ids)
				? [...incomingProfile.audience_focus_ids].sort((a, b) => a - b)
				: baseDraft.audience_focus_ids,
			riding_discipline_ids: Array.isArray(incomingProfile.riding_discipline_ids)
				? [...incomingProfile.riding_discipline_ids].sort((a, b) => a - b)
				: baseDraft.riding_discipline_ids,
			skill_level_ids: Array.isArray(incomingProfile.skill_level_ids)
				? [...incomingProfile.skill_level_ids].sort((a, b) => a - b)
				: baseDraft.skill_level_ids
		};
	}

	const initialSavedProfileDraft = untrack(() => buildInitialProfileDraft(data));
	const initialSavedSiteState = untrack(() =>
		buildGroupSiteEditorState({
			defaultSiteConfig: data.defaultSiteConfig,
			siteConfig: data.siteConfig,
			micrositeSlug: data.micrositeSlug,
			group: data.group
		})
	);
	const initialEditorProfileDraft = untrack(() =>
		form?.values?.profile
			? applyProfileDraftValues(initialSavedProfileDraft, form.values.profile)
			: buildInitialProfileDraft(data)
	);
	const initialEditorSiteState = untrack(() =>
		form?.values?.site
			? buildGroupSiteEditorState({
					defaultSiteConfig: data.defaultSiteConfig,
					siteConfig: data.siteConfig,
					micrositeSlug: data.micrositeSlug,
					group: data.group,
					values: form.values.site
				})
			: buildGroupSiteEditorState({
					defaultSiteConfig: data.defaultSiteConfig,
					siteConfig: data.siteConfig,
					micrositeSlug: data.micrositeSlug,
					group: data.group
				})
	);

	let profileDraft = $state(initialEditorProfileDraft);
	let seoDescription = $state(
		untrack(() =>
			form?.values && 'seo_description' in form.values
				? String(form.values.seo_description || '')
				: String(initialSavedSiteState.siteConfig.seo_description || '')
		)
	);
	let siteConfig = $state(initialEditorSiteState.siteConfig);
	let pageBlocks = $state(initialEditorSiteState.pageBlocks);
	let sitePages = $state(initialEditorSiteState.sitePages);
	let selectedPageId = $state(initialEditorSiteState.selectedPageId);

	let sponsorSequence = initialEditorSiteState.nextSponsorSequence;
	let sponsorItems = $state(initialEditorSiteState.sponsorItems);
	let faqItems = $state(initialEditorSiteState.faqItems);
	let slugInput = $state(initialEditorSiteState.slugInput);
	let activeView = $state(
		untrack(() =>
			normalizePresenceStudioView(form?.values?.return_view || data.initialView, 'profile')
		)
	);
	let previewMode = $state(
		untrack(() =>
			isWebsiteLayerView(form?.values?.return_view || data.initialView) ? 'website' : 'directory'
		)
	);
	let showPreview = $state(false);
	let previewVersion = $state(0);
	let localNotice = $state('');
	let localError = $state('');
	let groupSearch = $state('');
	let submitting = $state(false);
	let refreshingPalette = $state(false);
	let sponsorFileRevision = $state(0);
	let sponsorFileNames = $state({});
	const recommendedTemplateId = untrack(() => data.recommendedSiteTemplateId || 'community');

	// Logo & cover uploads + cropper state
	let logoRawFile = $state(null);
	let coverRawFile = $state(null);
	let logoFileRevision = $state(0);
	let coverFileRevision = $state(0);
	let logoPreview = $state(
		untrack(() =>
			initialEditorProfileDraft.clearLogo
				? ''
				: initialEditorProfileDraft.logoCropped ||
					initialEditorProfileDraft.logoUrl ||
					data.group?.logo_url ||
					''
		)
	);
	let coverPreview = $state(
		untrack(() =>
			initialEditorProfileDraft.clearCover
				? ''
				: initialEditorProfileDraft.coverCropped ||
					initialEditorProfileDraft.coverUrl ||
					data.group?.cover_photo_url ||
					''
		)
	);
	let logoTooLarge = $state(false);
	let coverTooLarge = $state(false);
	let logoUploadKey = $state(0);
	let coverUploadKey = $state(0);
	let logoFileInputEl = $state(null);
	let coverFileInputEl = $state(null);

	let cropping = $state(false);
	let cropTarget = $state('');
	let cropSrc = $state('');
	let cropScale = $state(1);
	let cropOffset = $state({ x: 0, y: 0 });
	let cropDragging = false;
	let cropStart = { x: 0, y: 0 };
	let cropImgNatural = { w: 0, h: 0 };
	let cropReady = $state(false);
	let cropContainerEl = $state(null);
	let activePointers = new Map();
	let isPinching = false;
	let pinchStartDistance = 0;
	let pinchStartScale = 1;
	let pinchStartOffset = { x: 0, y: 0 };
	let pinchCenter = { x: 0, y: 0 };

	// Admin Deep Enrich
	const isAdminUser = $derived(Boolean(data.current_profile?.admin));
	let deepEnrichLoading = $state(false);
	let deepEnrichError = $state('');
	let deepEnrichSuccess = $state('');

	// Stripe Connect
	let stripeAccount = $state(untrack(() => data.donation_account || null));
	let stripeBusy = $state(false);
	let stripeError = $state('');
	let stripeMessage = $state(
		untrack(() =>
			data.stripe_status === 'connected'
				? 'Stripe account connected.'
				: data.stripe_status === 'error'
					? `Stripe connection failed${data.stripe_reason ? `: ${data.stripe_reason}` : ''}`
					: ''
		)
	);
	const stripeConnected = $derived(Boolean(stripeAccount?.stripe_account_id));
	const stripeReady = $derived(Boolean(stripeAccount?.charges_enabled));

	// Co-owners
	let owners = $state(untrack(() => (data.owners || []).slice()));
	let ownerEmail = $state('');
	let ownerLoading = $state(false);
	let ownerError = $state('');
	let ownerSuccess = $state('');
	const ownerValid = $derived(/^\S+@\S+\.[^\s@]+$/.test(ownerEmail));
	let ownerHoneypot = $state('');
	let ownerTurnstile = $state(null);

	// Ride widget state
	let rideFilterMode = $state(initialEditorSiteState.rideFilterMode);
	let rideLocation = $state(initialEditorSiteState.rideLocation);
	let rideNear = $state(initialEditorSiteState.rideNear);
	let rideRadius = $state(initialEditorSiteState.rideRadius);
	let rideDefaultTab = $state(initialEditorSiteState.rideDefaultTab);
	let rideTheme = $state(initialEditorSiteState.rideTheme);
	let rideDensity = $state(initialEditorSiteState.rideDensity);
	let rideShowFilters = $state(initialEditorSiteState.rideShowFilters);
	let rideShowAdd = $state(initialEditorSiteState.rideShowAdd);
	let ridePrefixCity = $state(initialEditorSiteState.ridePrefixCity);
	let rideDifficultyColors = $state(initialEditorSiteState.rideDifficultyColors);
	let selectedRideGroupIds = $state(initialEditorSiteState.selectedRideGroupIds);

	// Sync raw uncropped File objects onto hidden file inputs in the form
	$effect(() => {
		if (!logoFileInputEl || typeof DataTransfer === 'undefined') return;
		const dt = new DataTransfer();
		if (logoRawFile && !profileDraft.logoCropped) {
			dt.items.add(logoRawFile);
		}
		logoFileInputEl.files = dt.files;
	});

	$effect(() => {
		if (!coverFileInputEl || typeof DataTransfer === 'undefined') return;
		const dt = new DataTransfer();
		if (coverRawFile && !profileDraft.coverCropped) {
			dt.items.add(coverRawFile);
		}
		coverFileInputEl.files = dt.files;
	});

	// Live synchronized group draft for preview & child editors
	const liveGroupDraft = $derived({
		...data.group,
		name: profileDraft.name || data.group?.name || '',
		tagline: profileDraft.tagline,
		description: profileDraft.description,
		city: profileDraft.city,
		state_region: profileDraft.state_region,
		country: profileDraft.country,
		zip_code: profileDraft.zip_code,
		specific_meeting_point_address: profileDraft.specific_meeting_point_address,
		service_area_description: profileDraft.service_area_description,
		website_url: profileDraft.website_url,
		public_contact_email: profileDraft.public_contact_email,
		public_phone_number: profileDraft.public_phone_number,
		logo_url: profileDraft.clearLogo ? '' : logoPreview || profileDraft.logoUrl,
		cover_photo_url: profileDraft.clearCover ? '' : coverPreview || profileDraft.coverUrl
	});

	const syncedSiteConfig = $derived(
		syncSiteConfigWithCoreGroup(siteConfig, liveGroupDraft, { seoDescription })
	);

	const selectedSitePage = $derived(
		sitePages.find((page) => page.id === selectedPageId) || sitePages[0]
	);
	const navigationItems = $derived(sitePages[0]?.navigation?.items || []);
	const primaryNavigationCount = $derived(
		navigationItems.filter((item) => item.placement === 'primary').length
	);
	const announcementExpiresIso = $derived(toIsoDateTimeValue(siteConfig.announcement_expires_at));
	const aiCurrentConfig = $derived({
		...syncedSiteConfig,
		page_blocks: sitePages[0]?.blocks || pageBlocks,
		site_pages: sitePages,
		announcement_expires_at: announcementExpiresIso,
		sponsor_items: sponsorItems.map(({ name, text, logo, url }) => ({ name, text, logo, url })),
		faq_1_q: faqItems[0]?.question || '',
		faq_1_a: faqItems[0]?.answer || '',
		faq_2_q: faqItems[1]?.question || '',
		faq_2_a: faqItems[1]?.answer || '',
		ride_widget_group_ids: selectedRideGroupIds,
		ride_widget_config: {
			...(siteConfig.ride_widget_config || {}),
			location: rideFilterMode === 'location' ? rideLocation : '',
			near: rideFilterMode === 'radius' ? rideNear : '',
			radiusMiles: rideFilterMode === 'radius' ? rideRadius : null,
			defaultTab: rideDefaultTab,
			theme: rideTheme,
			density: rideDensity,
			showUserFilters: rideShowFilters,
			showAddButton: rideShowAdd,
			prefixCity: ridePrefixCity,
			difficultyColors: rideDifficultyColors
		}
	});

	const websiteViews = [
		{
			id: 'builder',
			label: 'Sections & Pages',
			hint: 'Add, edit, and arrange website sections and pages',
			icon: IconLayout
		},
		{
			id: 'quick',
			label: 'AI & Extras',
			hint: 'AI assistant, announcements, FAQs, and partners',
			icon: IconType
		},
		{
			id: 'navigation',
			label: 'Menu',
			hint: 'Choose what appears in the header and More menu',
			icon: IconMenu
		},
		{
			id: 'appearance',
			label: 'Theme & Style',
			hint: 'Website colors, hero style, and typography',
			icon: IconBrush
		},
		{
			id: 'rides',
			label: 'Ride Calendar',
			hint: 'Embedded ride calendar filters and display',
			icon: IconCalendar
		},
		{
			id: 'address',
			label: 'Web Address',
			hint: 'Short address and custom domains',
			icon: IconGlobe
		},
		{
			id: 'more',
			label: 'Publishing',
			hint: 'Public visibility, footer note, and reset',
			icon: IconSettings
		}
	];

	const allStudioViews = [
		{
			id: 'profile',
			label: 'Core Profile',
			hint: 'Identity, photos, location, contact, socials, and donations',
			icon: IconSquarePen
		},
		...websiteViews
	];

	const heroLabels = {
		immersive: ['Immersive', 'Big, cinematic welcome'],
		bold: ['Editorial', 'Strong type and clear hierarchy'],
		orbit: ['Community cards', 'Friendly, layered highlights']
	};
	const backgroundLabels = {
		cinematic: 'Cinematic photo',
		aurora: 'Soft color glow',
		prism: 'Bright geometric',
		void: 'Minimal dark'
	};
	const panelStyleLabels = {
		glass: 'Soft translucent',
		filled: 'Solid cards',
		outlined: 'Light outlines'
	};
	const densityLabels = { compact: 'Compact', comfortable: 'Comfortable', airy: 'Spacious' };
	const toneLabels = {
		surface: 'Neutral',
		primary: 'Brand color',
		secondary: 'Supporting color',
		tertiary: 'Accent color'
	};
	const navigationPlacementLabels = {
		primary: 'Primary header',
		more: 'More menu',
		hidden: 'Hidden'
	};
	const sitePalettes = [
		{
			id: 'brand',
			label: 'From group brand',
			description: 'Uses your logo and existing group colors.',
			colors: null
		},
		{
			id: 'trail',
			label: 'Trailhead',
			description: 'Fresh green with warm, grounded accents.',
			colors: { primary: '#65A30D', secondary: '#0F766E', accent: '#D97706', surface: '#FAFAF9' }
		},
		{
			id: 'sunset',
			label: 'Golden hour',
			description: 'Warm orange, berry, and soft cream.',
			colors: { primary: '#EA580C', secondary: '#BE185D', accent: '#EAB308', surface: '#FFF7ED' }
		},
		{
			id: 'open-road',
			label: 'Open road',
			description: 'Confident blue with a bright sky accent.',
			colors: { primary: '#2563EB', secondary: '#0F766E', accent: '#06B6D4', surface: '#F8FAFC' }
		}
	];

	const ctaChoices = [
		{ key: 'auto', label: 'Auto', icon: IconLink },
		{ key: 'website', label: 'Website', icon: IconGlobe },
		{ key: 'email', label: 'Email', icon: IconMail },
		{ key: 'phone', label: 'Phone', icon: IconPhone },
		{ key: 'facebook', label: 'Facebook', icon: BrandFacebook },
		{ key: 'instagram', label: 'Instagram', icon: BrandInstagram },
		{ key: 'strava', label: 'Strava', icon: BrandStrava },
		{ key: 'x', label: 'X', icon: BrandX },
		{ key: 'tiktok', label: 'TikTok', icon: BrandTikTok },
		{ key: 'custom', label: 'Custom', icon: null }
	];

	const customUrlValid = $derived(
		!profileDraft.preferred_cta_url || /^https?:\/\/.+/i.test(profileDraft.preferred_cta_url)
	);

	const cleanedSocialsPreview = $derived(
		collectGroupSocialLinkInputs((field) =>
			field === 'instagram_posts'
				? profileDraft.instagramPostsText
				: profileDraft.socialInputs[field] || ''
		)
	);

	function pickCtaPreview() {
		const kind = profileDraft.preferred_cta_kind || 'auto';
		const website = profileDraft.website_url.trim()
			? { key: 'website', href: profileDraft.website_url.trim(), label: 'Website' }
			: null;
		const email = profileDraft.public_contact_email.trim()
			? { key: 'email', href: `mailto:${profileDraft.public_contact_email.trim()}`, label: 'Email' }
			: null;
		const phone = profileDraft.public_phone_number.trim()
			? { key: 'phone', href: `tel:${profileDraft.public_phone_number.trim()}`, label: 'Call' }
			: null;
		const socials = cleanedSocialsPreview || {};
		const mapSocial = (k, label) => (socials[k] ? { key: k, href: socials[k], label } : null);
		const fb = mapSocial('facebook', 'Facebook');
		const ig = mapSocial('instagram', 'Instagram');
		const st = mapSocial('strava', 'Strava');
		const xx = mapSocial('x', 'X');
		const tt = mapSocial('tiktok', 'TikTok');
		const md = mapSocial('mastodon', 'Mastodon');
		const dc = mapSocial('discord', 'Discord');

		if (kind === 'custom') {
			if (
				profileDraft.preferred_cta_label &&
				/^https?:\/\/.+/i.test(profileDraft.preferred_cta_url)
			) {
				return {
					key: 'custom',
					href: profileDraft.preferred_cta_url,
					label: profileDraft.preferred_cta_label
				};
			}
		}
		if (kind === 'website' && website) return website;
		if (kind === 'email' && email) return email;
		if (kind === 'phone' && phone) return phone;
		if (kind === 'facebook' && fb) return fb;
		if (kind === 'instagram' && ig) return ig;
		if (kind === 'strava') return st || { key: 'strava', href: '#', label: 'Strava' };
		if (kind === 'x') return xx || { key: 'x', href: '#', label: 'X' };
		if (kind === 'tiktok') return tt || { key: 'tiktok', href: '#', label: 'TikTok' };
		return website || email || phone || fb || ig || st || xx || tt || md || dc || null;
	}

	const filteredGroups = $derived(
		(data.availableGroups || []).filter((candidate) =>
			`${candidate.name} ${candidate.city || ''} ${candidate.state_region || ''}`
				.toLowerCase()
				.includes(groupSearch.toLowerCase())
		)
	);

	const websitePreviewSrc = $derived(`${data.previewPath || '/'}?editor=${previewVersion}`);
	const directoryPreviewSrc = $derived(
		`${data.directoryPreviewPath || `/groups/${data.group.slug}`}?editor=${previewVersion}`
	);

	function createPresenceStudioSnapshot(state) {
		return JSON.stringify({
			profileDraft: state.profileDraft,
			seoDescription: state.seoDescription,
			siteConfig: {
				...state.siteConfig,
				site_title: undefined,
				site_tagline: undefined,
				home_intro: undefined,
				seo_description: undefined
			},
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
			sponsorFileRevision: state.sponsorFileRevision ?? 0,
			logoFileRevision: state.logoFileRevision ?? 0,
			coverFileRevision: state.coverFileRevision ?? 0
		});
	}

	function snapshot() {
		return createPresenceStudioSnapshot({
			profileDraft,
			seoDescription,
			siteConfig,
			sitePages,
			pageBlocks,
			sponsorItems,
			faqItems,
			slugInput,
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
			selectedRideGroupIds,
			sponsorFileRevision,
			logoFileRevision,
			coverFileRevision
		});
	}

	let savedSnapshot = $state(
		untrack(() =>
			createPresenceStudioSnapshot({
				profileDraft: initialSavedProfileDraft,
				seoDescription: String(initialSavedSiteState.siteConfig.seo_description || ''),
				...initialSavedSiteState,
				sponsorFileRevision: 0,
				logoFileRevision: 0,
				coverFileRevision: 0
			})
		)
	);
	const dirty = $derived(snapshot() !== savedSnapshot);

	const pendingFileWarning = $derived.by(() => {
		const pendingSponsorFiles = Array.isArray(form?.values?.pending_sponsor_logo_files)
			? form.values.pending_sponsor_logo_files.filter(Boolean)
			: [];
		const pendingProfileFiles = Array.isArray(form?.values?.pending_profile_files)
			? form.values.pending_profile_files.filter(Boolean)
			: [];
		const clearedSponsorFiles = Object.values(sponsorFileNames).some(Boolean)
			? []
			: pendingSponsorFiles;
		const clearedProfileFiles =
			logoRawFile || coverRawFile || profileDraft.logoCropped || profileDraft.coverCropped
				? []
				: pendingProfileFiles;
		const cleared = [...clearedProfileFiles, ...clearedSponsorFiles];
		if (!cleared.length) return '';
		return `Your draft text was kept, but the page reload cleared your selected image file (${cleared.join(', ')}). Please choose the file again before publishing.`;
	});

	function syncStudioStateFromData(formElement = null) {
		profileDraft = buildInitialProfileDraft(data);
		const refreshedSite = buildGroupSiteEditorState({
			defaultSiteConfig: data.defaultSiteConfig,
			siteConfig: data.siteConfig,
			micrositeSlug: data.micrositeSlug,
			group: data.group,
			startSponsorIndex: sponsorSequence
		});
		sponsorSequence = refreshedSite.nextSponsorSequence;
		seoDescription = String(refreshedSite.siteConfig.seo_description || '');
		siteConfig = refreshedSite.siteConfig;
		pageBlocks = refreshedSite.pageBlocks;
		sitePages = refreshedSite.sitePages;
		selectedPageId = refreshedSite.selectedPageId;
		sponsorItems = refreshedSite.sponsorItems;
		faqItems = refreshedSite.faqItems;
		slugInput = refreshedSite.slugInput;
		rideFilterMode = refreshedSite.rideFilterMode;
		rideLocation = refreshedSite.rideLocation;
		rideNear = refreshedSite.rideNear;
		rideRadius = refreshedSite.rideRadius;
		rideDefaultTab = refreshedSite.rideDefaultTab;
		rideTheme = refreshedSite.rideTheme;
		rideDensity = refreshedSite.rideDensity;
		rideShowFilters = refreshedSite.rideShowFilters;
		rideShowAdd = refreshedSite.rideShowAdd;
		ridePrefixCity = refreshedSite.ridePrefixCity;
		rideDifficultyColors = refreshedSite.rideDifficultyColors;
		selectedRideGroupIds = refreshedSite.selectedRideGroupIds;
		logoRawFile = null;
		coverRawFile = null;
		logoFileRevision = 0;
		coverFileRevision = 0;
		sponsorFileRevision = 0;
		sponsorFileNames = {};
		for (const input of formElement?.querySelectorAll('input[type="file"]') || []) {
			input.value = '';
		}
		logoPreview = data.group?.logo_url || '';
		coverPreview = data.group?.cover_photo_url || '';
		logoUploadKey += 1;
		coverUploadKey += 1;
		localNotice = '';
		localError = '';
		previewVersion += 1;
		savedSnapshot = snapshot();
		syncViewFromUrl('profile');
	}

	function discardPendingChanges() {
		if (!dirty || !window.confirm('Discard all unpublished changes in this session?')) return;
		syncStudioStateFromData();
		localNotice = 'Reverted to last published state.';
		localError = '';
	}

	function enhancePresenceStudioForm({ action, formData, cancel }) {
		const isReset = action.searchParams.has('/reset');
		if (!isReset) {
			if (!profileDraft.state_region.trim() || !profileDraft.country.trim()) {
				localNotice = '';
				localError = 'State/Region and Country are required in Core Profile.';
				selectView('profile');
				cancel();
				return;
			}
			if (profileDraft.preferred_cta_kind === 'custom') {
				if (!profileDraft.preferred_cta_label.trim()) {
					localNotice = '';
					localError = 'Custom CTA label is required and must be 10 characters or fewer.';
					selectView('profile');
					cancel();
					return;
				}
				if (!profileDraft.preferred_cta_url.trim() || !customUrlValid) {
					localNotice = '';
					localError = 'Custom CTA URL is required and must start with http:// or https://.';
					selectView('profile');
					cancel();
					return;
				}
			}
			const sponsorFiles = [];
			for (const [key, entry] of formData.entries()) {
				if (key.startsWith('sponsor_logo_file_')) {
					sponsorFiles.push(entry);
				}
			}
			const siteValidation = validateGroupSiteDraftSubmission({
				slug: slugInput,
				files: sponsorFiles,
				maxLogoBytes: GROUP_SITE_LOGO_MAX_BYTES
			});
			if (!siteValidation.ok) {
				localNotice = '';
				localError = siteValidation.error;
				if (siteValidation.reason === 'invalid_slug' || siteValidation.reason === 'reserved_slug') {
					selectView('address');
				}
				cancel();
				return;
			}
		}

		localNotice = '';
		localError = '';
		submitting = true;

		return async ({ result, update, formElement }) => {
			try {
				if (result.type === 'failure') {
					await update({ reset: false, invalidateAll: false, navigate: false });
					return;
				}
				if (result.type === 'error') {
					localError = result.error?.message || 'Unable to publish presence changes.';
					return;
				}
				await update({ reset: false });
				syncStudioStateFromData(formElement);
			} finally {
				submitting = false;
			}
		};
	}

	function syncViewFromUrl(fallbackView = null) {
		if (typeof window === 'undefined') return;
		const params = new URL(window.location.href).searchParams;
		const hasDomainReturn = params.has('domain_checkout') || params.has('domain_payment');
		if (params.has('view') || hasDomainReturn) {
			activeView = normalizePresenceStudioView(
				params.get('view'),
				hasDomainReturn ? 'address' : activeView
			);
		} else if (fallbackView) {
			activeView = normalizePresenceStudioView(fallbackView, activeView);
		}
	}

	function selectView(view) {
		const resolved = normalizePresenceStudioView(view, 'profile');
		activeView = resolved;
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('view', resolved);
		replaceState(url, {});
	}

	function openPreviewSurface(surface) {
		previewMode = surface;
		showPreview = true;
	}

	function handleViewKeydown(event, index) {
		if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const nextIndex =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? allStudioViews.length - 1
					: (index + (event.key === 'ArrowRight' ? 1 : -1) + allStudioViews.length) %
						allStudioViews.length;
		selectView(allStudioViews[nextIndex].id);
		document.getElementById(`presence-view-${allStudioViews[nextIndex].id}`)?.focus();
	}

	function toggleTaxonomyId(listKey, id, checked) {
		const current = profileDraft[listKey] || [];
		const next = checked
			? [...new Set([...current, id])].sort((a, b) => a - b)
			: current.filter((item) => item !== id);
		profileDraft[listKey] = next;
	}

	// Leaflet & Google Places integration (safe across tab switches)
	let leafletModule = null;
	let activeMapInstance = null;
	let activeMapMarker = null;
	let locationGeocodeTimeout;
	let locationPendingGeocode;
	let locationLastKey = '';
	let locationGeocoder;
	let placesLoading = $state(false);

	function placeMarker(lat, lng) {
		const latNum = Number(lat);
		const lngNum = Number(lng);
		if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;
		profileDraft.latitude = latNum.toFixed(6);
		profileDraft.longitude = lngNum.toFixed(6);
		if (!activeMapInstance || !leafletModule) return;
		if (!activeMapMarker) {
			activeMapMarker = leafletModule.marker([latNum, lngNum]).addTo(activeMapInstance);
		} else {
			activeMapMarker.setLatLng([latNum, lngNum]);
		}
		activeMapInstance.setView([latNum, lngNum], Math.max(activeMapInstance.getZoom(), 12));
	}

	function ensurePlacesHelpers() {
		if (typeof window === 'undefined') return false;
		const maps = window.google?.maps;
		if (!maps?.places) return false;
		if (!locationGeocoder) locationGeocoder = new maps.Geocoder();
		return Boolean(locationGeocoder);
	}

	function buildLocationConfig() {
		const countryTrim = (profileDraft.country || '').trim().toUpperCase();
		const meetingTrim = (profileDraft.specific_meeting_point_address || '').trim();
		if (meetingTrim) {
			const meetingCountry = countryTrim && countryTrim !== 'OTHER' ? countryTrim : '';
			return {
				query: meetingTrim,
				country: meetingCountry,
				key: `${meetingTrim}|${meetingCountry}`
			};
		}
		const parts = [
			(profileDraft.city || '').trim(),
			(profileDraft.state_region || '').trim(),
			(profileDraft.zip_code || '').trim()
		].filter(Boolean);
		if (!parts.length) return null;
		if (countryTrim && countryTrim !== 'OTHER') parts.push(countryTrim);
		const query = parts.join(', ');
		const countryCode = countryTrim && countryTrim !== 'OTHER' ? countryTrim : '';
		return { query, country: countryCode, key: `${query}|${countryCode}` };
	}

	async function runLocationGeocode(config) {
		if (!config) return;
		const active = locationPendingGeocode;
		try {
			const coords = await geocodeAddress(
				locationGeocoder,
				config.query,
				config.country,
				window.google?.maps?.GeocoderStatus?.OK
			);
			if (!coords) return;
			if (active && active.key !== config.key) return;
			locationLastKey = config.key;
			placeMarker(coords.lat, coords.lng);
		} catch (error) {
			console.error('Failed to geocode location', error);
		}
	}

	function scheduleLocationGeocode(options = {}) {
		const config = buildLocationConfig();
		if (!config) return;
		if (!options.force && config.key === locationLastKey) return;
		locationPendingGeocode = config;
		if (!ensurePlacesHelpers()) return;
		const run = () => runLocationGeocode(config);
		clearTimeout(locationGeocodeTimeout);
		if (options.immediate) run();
		else locationGeocodeTimeout = setTimeout(run, 600);
	}

	function formatDefaultSearch() {
		const meetingTrim = (profileDraft.specific_meeting_point_address || '').trim();
		if (meetingTrim) return meetingTrim;
		return [profileDraft.city, profileDraft.state_region, profileDraft.country]
			.map((part) => (part || '').trim())
			.filter(Boolean)
			.join(', ');
	}

	function attachLeafletMap(node) {
		let cancelled = false;
		(async () => {
			try {
				if (!leafletModule) {
					const mod = await import('leaflet');
					leafletModule = mod.default || mod;
					const { ensureLeafletDefaultIcon } = await import('#lib/map/leaflet');
					await ensureLeafletDefaultIcon(leafletModule);
				}
				if (cancelled || !leafletModule) return;
				const latNum = Number(profileDraft.latitude);
				const lngNum = Number(profileDraft.longitude);
				const hasCoords =
					profileDraft.latitude !== '' &&
					profileDraft.longitude !== '' &&
					Number.isFinite(latNum) &&
					Number.isFinite(lngNum);
				const initLat = hasCoords ? latNum : 37.8;
				const initLng = hasCoords ? lngNum : -96;
				activeMapInstance = leafletModule.map(node).setView([initLat, initLng], hasCoords ? 12 : 4);
				leafletModule
					.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
						maxZoom: 19,
						attribution: '&copy; OpenStreetMap contributors'
					})
					.addTo(activeMapInstance);
				activeMapInstance.on('click', (event) => {
					placeMarker(event.latlng.lat, event.latlng.lng);
				});
				if (hasCoords) {
					activeMapMarker = leafletModule.marker([initLat, initLng]).addTo(activeMapInstance);
				}
			} catch (error) {
				console.error('Failed to initialize map', error);
			}
		})();

		return {
			destroy() {
				cancelled = true;
				if (activeMapInstance) {
					activeMapInstance.remove();
					activeMapInstance = null;
					activeMapMarker = null;
				}
			}
		};
	}

	function attachPlacesAutocomplete(container) {
		function mountWidget() {
			placesLoading = false;
			if (!container || !ensurePlacesHelpers() || !window.google?.maps?.places) return;
			if (locationPendingGeocode?.query) {
				scheduleLocationGeocode({ immediate: true, force: true });
			}
			const PAE = window.google.maps.places.PlaceAutocompleteElement;
			if (PAE) {
				const el = new PAE();
				const def = formatDefaultSearch();
				if (def) el.value = def;
				container.innerHTML = '';
				container.appendChild(el);
				el.addEventListener('gmp-select', async ({ placePrediction }) => {
					try {
						const place = placePrediction.toPlace();
						await place.fetchFields({ fields: ['location', 'viewport'] });
						const loc = place.location;
						if (!loc) return;
						const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
						const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
						placeMarker(lat, lng);
					} catch (error) {
						console.error('Place selection failed', error);
					}
				});
				return;
			}
			const input = document.createElement('input');
			input.className = 'input border-surface-700 bg-surface-950 border';
			input.placeholder = 'Start typing a city or address…';
			const def = formatDefaultSearch();
			if (def) input.value = def;
			container.innerHTML = '';
			container.appendChild(input);
			if (window.google.maps.places.Autocomplete) {
				const ac = new window.google.maps.places.Autocomplete(input, {
					fields: ['geometry'],
					types: ['(regions)']
				});
				ac.addListener('place_changed', () => {
					const place = ac.getPlace();
					const loc = place?.geometry?.location;
					if (!loc) return;
					placeMarker(loc.lat(), loc.lng());
				});
			}
		}

		window.initGooglePlaces = mountWidget;
		if (window.google?.maps?.places) {
			mountWidget();
		} else {
			const key = env.PUBLIC_GOOGLE_MAPS_API_KEY;
			if (key && !document.getElementById('gmaps-places')) {
				placesLoading = true;
				const script = document.createElement('script');
				script.id = 'gmaps-places';
				script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&v=beta&callback=initGooglePlaces`;
				script.async = true;
				script.defer = true;
				script.onerror = () => {
					placesLoading = false;
				};
				document.head.appendChild(script);
			}
		}

		return {
			destroy() {
				if (window.initGooglePlaces === mountWidget) {
					delete window.initGooglePlaces;
				}
			}
		};
	}

	// Cropper & media handlers
	function tooLarge(files) {
		return Array.from(files || []).some((file) => file && file.size > MAX_BYTES);
	}

	function openCropper(target, files) {
		const file = Array.from(files || [])[0];
		if (!file) return;
		if (cropSrc) URL.revokeObjectURL(cropSrc);
		cropSrc = URL.createObjectURL(file);
		cropTarget = target;
		cropScale = 1;
		cropOffset = { x: 0, y: 0 };
		cropReady = false;
		cropping = true;
	}

	function onCropImgLoad(event) {
		const img = event.target;
		cropImgNatural = { w: img.naturalWidth, h: img.naturalHeight };
		cropScale = 1;
		cropOffset = { x: 0, y: 0 };
		cropReady = true;
	}

	function onCropPointerDown(event) {
		activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		try {
			event.currentTarget?.setPointerCapture?.(event.pointerId);
		} catch {}
		if (activePointers.size === 2) {
			const pts = Array.from(activePointers.values());
			pinchStartDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
			pinchStartScale = cropScale;
			pinchStartOffset = { ...cropOffset };
			const rect = cropContainerEl?.getBoundingClientRect?.();
			pinchCenter = {
				x: (pts[0].x + pts[1].x) / 2 - (rect?.left || 0),
				y: (pts[0].y + pts[1].y) / 2 - (rect?.top || 0)
			};
			isPinching = true;
			cropDragging = false;
		} else if (activePointers.size === 1) {
			cropDragging = true;
			cropStart = { x: event.clientX - cropOffset.x, y: event.clientY - cropOffset.y };
		}
		event.preventDefault();
	}

	function onCropPointerMove(event) {
		if (activePointers.has(event.pointerId)) {
			activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		}
		if (isPinching && activePointers.size >= 2) {
			const pts = Array.from(activePointers.values());
			const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
			const factor = dist / (pinchStartDistance || 1);
			const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStartScale * factor));
			const imgX = (pinchCenter.x - pinchStartOffset.x) / pinchStartScale;
			const imgY = (pinchCenter.y - pinchStartOffset.y) / pinchStartScale;
			cropScale = newScale;
			cropOffset = { x: pinchCenter.x - imgX * cropScale, y: pinchCenter.y - imgY * cropScale };
		} else if (cropDragging) {
			cropOffset = { x: event.clientX - cropStart.x, y: event.clientY - cropStart.y };
		}
	}

	function onCropPointerUp(event) {
		try {
			event.currentTarget?.releasePointerCapture?.(event.pointerId);
		} catch {}
		cropDragging = false;
		isPinching = false;
		activePointers.clear();
	}

	function closeCropper() {
		if (cropSrc) URL.revokeObjectURL(cropSrc);
		cropSrc = '';
		cropping = false;
		cropTarget = '';
	}

	async function applyCrop() {
		const aspect = cropTarget === 'logo' ? 1 : 16 / 9;
		const outW = cropTarget === 'logo' ? 800 : 1600;
		const outH = Math.round(outW / aspect);
		const img = document.getElementById('presence-crop-img');
		if (!img) return;

		const imgRect = img.getBoundingClientRect();
		const contRect = cropContainerEl?.getBoundingClientRect?.() || {
			left: 0,
			top: 0,
			width: 800,
			height: 800
		};
		const left = imgRect.left - contRect.left;
		const top = imgRect.top - contRect.top;
		const scaleDom = imgRect.width / cropImgNatural.w || 1;
		const sx = Math.max(0, -left / scaleDom);
		const sy = Math.max(0, -top / scaleDom);
		const sWidth = Math.min(cropImgNatural.w - sx, contRect.width / scaleDom);
		const sHeight = Math.min(cropImgNatural.h - sy, contRect.height / scaleDom);

		const canvas = document.createElement('canvas');
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext('2d');
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, outW, outH);

		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
		if (!blob) return;
		const dataUrl = await new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result || ''));
			reader.readAsDataURL(blob);
		});

		if (cropTarget === 'logo') {
			if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
			logoPreview = URL.createObjectURL(blob);
			profileDraft.logoCropped = dataUrl;
			profileDraft.clearLogo = false;
			logoRawFile = null;
			logoFileRevision += 1;
			localNotice = 'Logo cropped and staged. Publish changes when ready.';
		} else if (cropTarget === 'cover') {
			if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview);
			coverPreview = URL.createObjectURL(blob);
			profileDraft.coverCropped = dataUrl;
			profileDraft.clearCover = false;
			coverRawFile = null;
			coverFileRevision += 1;
			localNotice = 'Cover photo cropped and staged. Publish changes when ready.';
		}
		closeCropper();
	}

	function onLogoChange(details) {
		const files = details?.acceptedFiles || [];
		logoTooLarge = tooLarge(files);
		if (!files.length || logoTooLarge) return;
		if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
		logoRawFile = files[0];
		logoPreview = URL.createObjectURL(files[0]);
		profileDraft.clearLogo = false;
		profileDraft.logoCropped = '';
		logoFileRevision += 1;
		openCropper('logo', files);
	}

	function onCoverChange(details) {
		const files = details?.acceptedFiles || [];
		coverTooLarge = tooLarge(files);
		if (!files.length || coverTooLarge) return;
		if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview);
		coverRawFile = files[0];
		coverPreview = URL.createObjectURL(files[0]);
		profileDraft.clearCover = false;
		profileDraft.coverCropped = '';
		coverFileRevision += 1;
		openCropper('cover', files);
	}

	function onFileReject() {
		localError = 'One or more files were rejected. Ensure they are images under 10MB.';
	}

	function removeImage(which) {
		if (which === 'logo') {
			if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
			logoPreview = '';
			logoRawFile = null;
			profileDraft.logoCropped = '';
			profileDraft.logoUrl = '';
			profileDraft.clearLogo = true;
			logoUploadKey += 1;
			logoFileRevision += 1;
		} else if (which === 'cover') {
			if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview);
			coverPreview = '';
			coverRawFile = null;
			profileDraft.coverCropped = '';
			profileDraft.coverUrl = '';
			profileDraft.clearCover = true;
			coverUploadKey += 1;
			coverFileRevision += 1;
		}
	}

	function buildGroupImageContext() {
		const selectedAudience = (profileDraft.audience_focus_ids || [])
			.map((id) => data.audience_focuses.find((item) => item.id === id)?.name || '')
			.filter(Boolean);
		const selectedDisciplines = (profileDraft.riding_discipline_ids || [])
			.map((id) => data.riding_disciplines.find((item) => item.id === id)?.name || '')
			.filter(Boolean);
		return {
			name: profileDraft.name || data.group?.name || '',
			tagline: profileDraft.tagline,
			description: profileDraft.description,
			state_region: profileDraft.state_region,
			location: [
				profileDraft.specific_meeting_point_address,
				profileDraft.city,
				profileDraft.state_region,
				profileDraft.country
			]
				.map((value) => (value || '').trim())
				.filter(Boolean)
				.join(', '),
			serviceArea: profileDraft.service_area_description,
			activityFrequency: profileDraft.activity_frequency,
			typicalTime: profileDraft.typical_activity_day_time,
			ridingDisciplines: selectedDisciplines,
			audienceFocuses: selectedAudience,
			howToJoin: profileDraft.how_to_join_instructions
		};
	}

	function applyGeneratedGroupCover(result) {
		const url = result?.url || '';
		if (!url) return;
		coverPreview = url;
		coverRawFile = null;
		profileDraft.coverCropped = '';
		profileDraft.coverUrl = url;
		profileDraft.clearCover = false;
		coverFileRevision += 1;
		localNotice = 'Generated cover art staged. Publish changes when ready.';
	}

	async function runDeepEnrichFromExistingProfile() {
		if (!isAdminUser || deepEnrichLoading) return;
		deepEnrichError = '';
		deepEnrichSuccess = '';
		deepEnrichLoading = true;
		try {
			const existingProfile = {
				fields: {
					name: profileDraft.name,
					tagline: profileDraft.tagline,
					description: profileDraft.description,
					city: profileDraft.city,
					state_region: profileDraft.state_region,
					country: profileDraft.country,
					website_url: profileDraft.website_url,
					public_contact_email: profileDraft.public_contact_email,
					public_phone_number: profileDraft.public_phone_number,
					preferred_contact_method_instructions: profileDraft.preferred_contact_method_instructions,
					how_to_join_instructions: profileDraft.how_to_join_instructions,
					membership_info: profileDraft.membership_info,
					specific_meeting_point_address: profileDraft.specific_meeting_point_address,
					latitude: profileDraft.latitude ? Number(profileDraft.latitude) : null,
					longitude: profileDraft.longitude ? Number(profileDraft.longitude) : null,
					service_area_description: profileDraft.service_area_description,
					activity_frequency: profileDraft.activity_frequency,
					typical_activity_day_time: profileDraft.typical_activity_day_time,
					logo_url: profileDraft.logoUrl,
					cover_photo_url: profileDraft.coverUrl,
					social_links: cleanedSocialsPreview
				},
				categories: {
					group_types: profileDraft.group_type_ids
						.map((id) => data.group_types.find((row) => row.id === id)?.name)
						.filter(Boolean),
					audience_focuses: profileDraft.audience_focus_ids
						.map((id) => data.audience_focuses.find((row) => row.id === id)?.name)
						.filter(Boolean),
					riding_disciplines: profileDraft.riding_discipline_ids
						.map((id) => data.riding_disciplines.find((row) => row.id === id)?.name)
						.filter(Boolean),
					skill_levels: profileDraft.skill_level_ids
						.map((id) => data.skill_levels.find((row) => row.id === id)?.name)
						.filter(Boolean)
				},
				extras: {
					zip_code: profileDraft.zip_code,
					preferred_cta_kind: profileDraft.preferred_cta_kind,
					preferred_cta_label: profileDraft.preferred_cta_label,
					preferred_cta_url: profileDraft.preferred_cta_url
				}
			};
			const response = await fetch('/api/ai/enrich-group', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					instagram: cleanedSocialsPreview?.instagram || '',
					facebook: cleanedSocialsPreview?.facebook || '',
					website: profileDraft.website_url || '',
					name: profileDraft.name || '',
					existing_profile: existingProfile
				})
			});
			if (!response.ok) {
				throw new Error((await response.text()) || 'Deep enrichment request failed.');
			}
			const payload = await response.json();
			const fields = payload?.fields || {};
			for (const key of [
				'name',
				'tagline',
				'description',
				'city',
				'state_region',
				'country',
				'website_url',
				'public_contact_email',
				'public_phone_number',
				'preferred_contact_method_instructions',
				'how_to_join_instructions',
				'membership_info',
				'specific_meeting_point_address',
				'service_area_description',
				'activity_frequency',
				'typical_activity_day_time'
			]) {
				if (typeof fields[key] === 'string' && fields[key].trim()) {
					profileDraft[key] =
						key === 'country' ? fields[key].trim().toUpperCase() : fields[key].trim();
				}
			}
			if (typeof fields.logo_url === 'string' && fields.logo_url.trim()) {
				profileDraft.logoUrl = fields.logo_url.trim();
				logoPreview = fields.logo_url.trim();
				profileDraft.clearLogo = false;
			}
			if (typeof fields.cover_photo_url === 'string' && fields.cover_photo_url.trim()) {
				profileDraft.coverUrl = fields.cover_photo_url.trim();
				coverPreview = fields.cover_photo_url.trim();
				profileDraft.clearCover = false;
			}
			if (Number.isFinite(fields.latitude) && Number.isFinite(fields.longitude)) {
				placeMarker(fields.latitude, fields.longitude);
			}
			if (fields.social_links && typeof fields.social_links === 'object') {
				for (const item of SOCIAL_FIELDS) {
					const val = fields.social_links[item.key];
					if (typeof val === 'string' && val.trim()) {
						profileDraft.socialInputs[item.key] = val.trim();
					}
				}
			}
			deepEnrichSuccess = 'AI profile enrichment staged. Review and publish changes when ready.';
		} catch (error) {
			deepEnrichError = error?.message || 'Failed to run deep AI enrichment.';
		} finally {
			deepEnrichLoading = false;
		}
	}

	// Stripe & Co-owner handlers
	function connectStripeForGroup() {
		const slug = data.group?.slug || '';
		if (!slug) return;
		window.location.href = `/api/donations/connect/start?recipient=group&group=${encodeURIComponent(slug)}`;
	}

	async function disconnectStripeForGroup() {
		if (!window.confirm('Disconnect this group Stripe account?')) return;
		stripeError = '';
		stripeMessage = '';
		stripeBusy = true;
		try {
			const response = await fetch('/api/donations/connect/disconnect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipient: 'group', group: data.group?.slug || '' })
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to disconnect Stripe account.');
			}
			stripeAccount = {
				...(stripeAccount || {}),
				stripe_account_id: null,
				stripe_account_email: null,
				charges_enabled: false,
				payouts_enabled: false,
				connected_at: null
			};
			stripeMessage = 'Stripe account disconnected.';
		} catch (error) {
			stripeError = error?.message || 'Failed to disconnect Stripe account.';
		} finally {
			stripeBusy = false;
		}
	}

	async function inviteOwner(event) {
		event?.preventDefault?.();
		if (ownerLoading || !ownerTurnstile) return;
		ownerError = '';
		ownerSuccess = '';
		await ownerTurnstile.submit({
			validate: () => {
				if (!ownerValid) {
					ownerError = 'Enter a valid email address.';
					return false;
				}
				if (ownerHoneypot.trim()) {
					ownerError = 'Invalid submission.';
					return false;
				}
				return true;
			},
			onSubmit: async (turnstileToken) => {
				try {
					const rtUrl = new URL(window.location.href);
					rtUrl.searchParams.set('auto_add_owner', data.group?.slug || '');
					const response = await fetch('/api/v1/auth/login', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							email: ownerEmail,
							createProfile: true,
							returnTo: rtUrl.pathname + rtUrl.search + rtUrl.hash,
							honeypot: ownerHoneypot,
							turnstileToken
						})
					});
					if (!response.ok) {
						const payload = await response.json().catch(() => ({}));
						throw new Error(payload.error || 'Failed to send invite');
					}
					ownerSuccess = `Invite sent to ${ownerEmail}. They will be added when they sign in.`;
					ownerEmail = '';
					ownerHoneypot = '';
				} catch (error) {
					ownerError = error?.message || 'Failed to send invite.';
				}
			}
		});
	}

	async function removeOwner(uid, email) {
		const label = email || uid;
		if (!window.confirm(`Remove owner ${label}?`)) return;
		try {
			const response = await fetch(`/api/groups/${data.group?.slug}/owners/remove`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: uid })
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => ({}));
				throw new Error(payload.error || 'Failed to remove owner');
			}
			owners = owners.filter((entry) => entry.user_id !== uid);
			ownerSuccess = `Owner ${label} removed.`;
			ownerError = '';
		} catch (error) {
			ownerError = error?.message || 'Failed to remove owner.';
			ownerSuccess = '';
		}
	}

	// Custom Website layer handlers
	function addFaq() {
		if (faqItems.length < 2) faqItems = [...faqItems, { question: '', answer: '' }];
	}
	function removeFaq(index) {
		faqItems = faqItems.filter((_, candidate) => candidate !== index);
	}
	function addSponsor() {
		if (sponsorItems.length < 12) {
			sponsorItems = [
				...sponsorItems,
				{
					_editorId: `sponsor-${sponsorSequence++}`,
					name: '',
					text: '',
					logo: '',
					url: ''
				}
			];
		}
	}
	function removeSponsor(index) {
		const removedId = sponsorItems[index]?._editorId;
		sponsorItems = sponsorItems.filter((_, candidate) => candidate !== index);
		if (removedId) {
			const nextNames = { ...sponsorFileNames };
			delete nextNames[removedId];
			sponsorFileNames = nextNames;
		}
	}
	function updateSponsor(index, patch) {
		sponsorItems = sponsorItems.map((sponsor, candidate) =>
			candidate === index ? { ...sponsor, ...patch } : sponsor
		);
	}
	function toggleRideGroup(id, checked) {
		selectedRideGroupIds = checked
			? [...new Set([...selectedRideGroupIds, id])]
			: selectedRideGroupIds.filter((candidate) => candidate !== id);
	}
	function applySitePalette(palette) {
		if (!palette.colors) {
			siteConfig.theme_mode = 'derived';
			siteConfig.theme_name = '';
			return;
		}
		siteConfig.theme_mode = 'custom';
		siteConfig.theme_name = '';
		siteConfig.theme_colors = { ...palette.colors };
	}
	async function refreshBrandPalette() {
		localNotice = '';
		localError = '';
		try {
			refreshingPalette = true;
			const response = await fetch(
				`/api/groups/${encodeURIComponent(data.group.slug)}/site/derive-palette`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ config: clone(syncedSiteConfig) })
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error || 'Unable to refresh brand colors.');
			siteConfig = {
				...siteConfig,
				theme_mode: 'custom',
				theme_colors: { ...siteConfig.theme_colors, ...payload.data.palette }
			};
			localNotice = 'Brand colors refreshed. Review them, then publish when ready.';
		} catch (error) {
			localError = error?.message || 'Unable to refresh brand colors.';
		} finally {
			refreshingPalette = false;
		}
	}

	function applyAiConfig(nextConfig, source) {
		const mergedResult = mergeAiProposalIntoPresenceDraft({
			currentConfig: clone(aiCurrentConfig),
			proposalConfig: clone(nextConfig),
			groupDraft: liveGroupDraft
		});
		if (mergedResult.groupPatch.tagline !== undefined) {
			profileDraft.tagline = mergedResult.groupPatch.tagline;
		}
		if (mergedResult.groupPatch.description !== undefined) {
			profileDraft.description = mergedResult.groupPatch.description;
		}
		if (mergedResult.seoDescription !== undefined) {
			seoDescription = mergedResult.seoDescription;
		}
		siteConfig = mergedResult.siteConfig;
		sitePages = clone(siteConfig.site_pages || sitePages);
		selectedPageId = sitePages[0]?.id || 'home';
		pageBlocks = clone(sitePages[0]?.blocks || siteConfig.page_blocks || pageBlocks);

		const previousSponsors = sponsorItems;
		sponsorItems = (siteConfig.sponsor_items || []).map((item, index) => ({
			_editorId: previousSponsors[index]?._editorId || `sponsor-${sponsorSequence++}`,
			name: String(item?.name || ''),
			text: String(item?.text || ''),
			logo: String(item?.logo || ''),
			url: String(item?.url || '')
		}));
		faqItems = [
			{ question: siteConfig.faq_1_q || '', answer: siteConfig.faq_1_a || '' },
			{ question: siteConfig.faq_2_q || '', answer: siteConfig.faq_2_a || '' }
		].filter((item) => item.question || item.answer);
		const widget = siteConfig.ride_widget_config || {};
		rideFilterMode =
			widget.near || widget.radiusMiles ? 'radius' : widget.location ? 'location' : 'none';
		rideLocation = widget.location || '';
		rideNear = widget.near || '';
		rideRadius = widget.radiusMiles || '50';
		rideDefaultTab = widget.defaultTab || 'list';
		rideTheme = widget.theme || 'auto';
		rideDensity = widget.density || 'comfortable';
		rideShowFilters = widget.showUserFilters ?? true;
		rideShowAdd = widget.showAddButton ?? true;
		ridePrefixCity = widget.prefixCity ?? false;
		rideDifficultyColors = widget.difficultyColors ?? true;
		selectedRideGroupIds = Array.isArray(siteConfig.ride_widget_group_ids)
			? [...siteConfig.ride_widget_group_ids]
			: [];
		previewVersion += 1;
		localNotice =
			source === 'ai'
				? 'AI draft staged in studio. Review and publish changes when ready.'
				: source === 'template'
					? 'Template applied as a draft. Review and publish changes when ready.'
					: 'Proposal staged in studio. Review and publish changes when ready.';
		return true;
	}

	function applySiteTemplate(template) {
		const confirmed = window.confirm(
			`Apply the ${template.label} template? This updates website sections, colors, and page style in your draft while keeping your core identity, web address, partners, and connected features intact.`
		);
		if (!confirmed) return;
		const templateConfig = buildGroupSiteTemplate(template.id, { group: liveGroupDraft });
		// Keep Core Profile identity intact when applying a visual layout template
		delete templateConfig.site_title;
		delete templateConfig.site_tagline;
		delete templateConfig.home_intro;
		applyAiConfig(templateConfig, 'template');
		localNotice = `${template.label} template staged. Personalize the sections, then publish when ready.`;
	}

	function updatePageBlocks(nextBlocks) {
		pageBlocks = clone(nextBlocks);
		sitePages = sitePages.map((page) =>
			page.id === selectedPageId ? { ...page, blocks: clone(pageBlocks) } : page
		);
		const homeBlocks = sitePages[0]?.blocks || pageBlocks;
		const legacy = deriveLegacySiteVisibility(homeBlocks, siteConfig.sections);
		siteConfig = {
			...siteConfig,
			page_blocks: homeBlocks,
			site_pages: sitePages,
			sections: legacy.sections,
			ride_widget_enabled: legacy.ride_widget_enabled
		};
	}

	function updateSiteConfig(patch) {
		siteConfig = {
			...siteConfig,
			...patch,
			page_blocks: sitePages[0]?.blocks || pageBlocks,
			site_pages: sitePages
		};
	}

	function selectSitePage(pageId) {
		const page = sitePages.find((candidate) => candidate.id === pageId);
		if (!page) return;
		selectedPageId = page.id;
		pageBlocks = clone(page.blocks || []);
	}

	function addSitePage() {
		if (sitePages.length >= GROUP_SITE_PAGE_LIMIT) return;
		const number = sitePages.length + 1;
		const page = createGroupSitePage({
			id: `page-${Date.now()}`,
			title: `New page ${number}`,
			slug: `new-page-${number}`,
			description: 'Add a short introduction for this page.',
			blocks: [
				pageBlock('hero'),
				pageBlock('text', {
					eyebrow: 'Start here',
					title: 'Tell visitors what this page is for',
					body: 'Add the most useful information first, then drag in another section when you need it.'
				})
			]
		});
		sitePages = normalizeGroupSitePages([...sitePages, page], {
			homeBlocks: sitePages[0]?.blocks || pageBlocks
		});
		selectSitePage(page.id);
		localNotice = 'New page added as a draft.';
	}

	function updateSelectedPage(patch) {
		sitePages = normalizeGroupSitePages(
			sitePages.map((page) => {
				if (page.id !== selectedPageId) return page;
				const next = { ...page, ...patch };
				if ('slug' in patch && !page.is_home) next.slug = normalizeGroupSitePageSlug(patch.slug);
				if ('description' in patch && !page.is_home) {
					next.seo_description = String(patch.description || '').slice(0, 180);
				}
				return next;
			}),
			{ homeBlocks: sitePages[0]?.blocks || pageBlocks }
		);
		siteConfig = {
			...siteConfig,
			site_pages: sitePages,
			page_blocks: sitePages[0]?.blocks || pageBlocks
		};
	}

	function moveSelectedPage(offset) {
		const index = sitePages.findIndex((page) => page.id === selectedPageId);
		const target = index + offset;
		if (index <= 0 || target <= 0 || target >= sitePages.length) return;
		const next = [...sitePages];
		[next[index], next[target]] = [next[target], next[index]];
		sitePages = next;
		siteConfig = { ...siteConfig, site_pages: sitePages, page_blocks: sitePages[0]?.blocks || [] };
	}

	function removeSelectedPage() {
		const page = sitePages.find((candidate) => candidate.id === selectedPageId);
		if (!page || page.is_home || !window.confirm(`Remove the ${page.title} page from this draft?`))
			return;
		sitePages = normalizeGroupSitePages(
			sitePages.filter((candidate) => candidate.id !== page.id),
			{ homeBlocks: sitePages[0]?.blocks || pageBlocks }
		);
		selectSitePage(sitePages[0]?.id || 'home');
		localNotice = `${page.title} removed from the draft.`;
	}

	function navigationItemMeta(item) {
		if (item.id.startsWith('page:')) {
			const pageId = item.id.slice(5);
			const page = sitePages.find((candidate) => candidate.id === pageId);
			return {
				kind: page?.is_home ? 'Homepage' : 'Website page',
				detail: page?.is_home ? '/' : `/${page?.slug || ''}`,
				locked: Boolean(page?.is_home)
			};
		}
		const special = GROUP_SITE_SPECIAL_NAV_ITEMS.find((candidate) => candidate.id === item.id);
		return {
			kind: 'Connected feature',
			detail: special?.label || 'Automatic destination',
			locked: false
		};
	}

	function setNavigationItems(nextItems) {
		const pagesWithVisibility = sitePages.map((page) => {
			if (page.is_home) return page;
			const navItem = nextItems.find((item) => item.id === `page:${page.id}`);
			return navItem ? { ...page, show_in_nav: navItem.placement !== 'hidden' } : page;
		});
		const navigation = normalizeGroupSiteNavigation(
			{ items: nextItems },
			{ pages: pagesWithVisibility }
		);
		sitePages = pagesWithVisibility.map((page) => (page.is_home ? { ...page, navigation } : page));
		siteConfig = {
			...siteConfig,
			site_pages: sitePages,
			page_blocks: sitePages[0]?.blocks || pageBlocks
		};
	}

	function updateNavigationItem(itemId, patch) {
		setNavigationItems(
			navigationItems.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
		);
	}

	function setSelectedPageNavigationVisible(visible) {
		const itemId = `page:${selectedPageId}`;
		setNavigationItems(
			navigationItems.map((item) =>
				item.id === itemId
					? {
							...item,
							placement: visible
								? item.placement === 'hidden'
									? 'more'
									: item.placement
								: 'hidden'
						}
					: item
			)
		);
	}

	function moveNavigationItem(itemId, offset) {
		const index = navigationItems.findIndex((item) => item.id === itemId);
		const target = index + offset;
		if (index < 0 || target < 0 || target >= navigationItems.length) return;
		const next = [...navigationItems];
		[next[index], next[target]] = [next[target], next[index]];
		setNavigationItems(next);
	}

	function confirmDeleteGroup(event) {
		if (!window.confirm('Hide this group from all public directory listings and websites?')) {
			event.preventDefault();
			return;
		}
		submitting = true;
	}

	beforeNavigate(({ cancel }) => {
		if (
			dirty &&
			!submitting &&
			!window.confirm('Leave Public Presence Studio without publishing your changes?')
		) {
			cancel();
		}
	});

	onMount(() => {
		syncViewFromUrl();
		const warn = (event) => {
			if (!dirty || submitting) return;
			event.preventDefault();
			event.returnValue = '';
		};
		const handlePopState = () => syncViewFromUrl();
		window.addEventListener('beforeunload', warn);
		window.addEventListener('popstate', handlePopState);
		return () => {
			window.removeEventListener('beforeunload', warn);
			window.removeEventListener('popstate', handlePopState);
			if (locationGeocodeTimeout) clearTimeout(locationGeocodeTimeout);
		};
	});
</script>

<svelte:head>
	<title>Public Presence Studio | {liveGroupDraft.name || data.group.name}</title>
</svelte:head>

<form
	id="presence-studio-form"
	method="POST"
	action="?/publish"
	enctype="multipart/form-data"
	use:enhance={enhancePresenceStudioForm}
>
	<!-- Core Profile fields -->
	<input type="hidden" name="name" value={profileDraft.name} />
	<input type="hidden" name="tagline" value={profileDraft.tagline} />
	<input type="hidden" name="description" value={profileDraft.description} />
	<input type="hidden" name="city" value={profileDraft.city} />
	<input type="hidden" name="state_region" value={profileDraft.state_region} />
	<input type="hidden" name="country" value={profileDraft.country} />
	<input type="hidden" name="zip_code" value={profileDraft.zip_code} />
	<input
		type="hidden"
		name="specific_meeting_point_address"
		value={profileDraft.specific_meeting_point_address}
	/>
	<input
		type="hidden"
		name="service_area_description"
		value={profileDraft.service_area_description}
	/>
	<input type="hidden" name="latitude" value={profileDraft.latitude} />
	<input type="hidden" name="longitude" value={profileDraft.longitude} />
	<input type="hidden" name="website_url" value={profileDraft.website_url} />
	<input type="hidden" name="public_contact_email" value={profileDraft.public_contact_email} />
	<input type="hidden" name="public_phone_number" value={profileDraft.public_phone_number} />
	<input
		type="hidden"
		name="preferred_contact_method_instructions"
		value={profileDraft.preferred_contact_method_instructions}
	/>
	<input
		type="hidden"
		name="how_to_join_instructions"
		value={profileDraft.how_to_join_instructions}
	/>
	<input type="hidden" name="membership_info" value={profileDraft.membership_info} />
	<input type="hidden" name="activity_frequency" value={profileDraft.activity_frequency} />
	<input
		type="hidden"
		name="typical_activity_day_time"
		value={profileDraft.typical_activity_day_time}
	/>
	<input type="hidden" name="preferred_cta_kind" value={profileDraft.preferred_cta_kind} />
	<input type="hidden" name="preferred_cta_label" value={profileDraft.preferred_cta_label} />
	<input type="hidden" name="preferred_cta_url" value={profileDraft.preferred_cta_url} />

	{#each SOCIAL_FIELDS as social}
		<input type="hidden" name={social.id} value={profileDraft.socialInputs[social.key] || ''} />
	{/each}
	<input type="hidden" name="social_instagram_posts" value={profileDraft.instagramPostsText} />

	{#each profileDraft.group_type_ids as id}
		<input type="hidden" name="group_type_ids" value={id} />
	{/each}
	{#each profileDraft.audience_focus_ids as id}
		<input type="hidden" name="audience_focus_ids" value={id} />
	{/each}
	{#each profileDraft.riding_discipline_ids as id}
		<input type="hidden" name="riding_discipline_ids" value={id} />
	{/each}
	{#each profileDraft.skill_level_ids as id}
		<input type="hidden" name="skill_level_ids" value={id} />
	{/each}

	<input type="hidden" name="logo_url" value={profileDraft.logoUrl} />
	<input type="hidden" name="cover_photo_url" value={profileDraft.coverUrl} />
	<input type="hidden" name="logo_file_cropped" value={profileDraft.logoCropped} />
	<input type="hidden" name="cover_file_cropped" value={profileDraft.coverCropped} />
	<input type="hidden" name="clear_logo" value={profileDraft.clearLogo ? '1' : ''} />
	<input type="hidden" name="clear_cover" value={profileDraft.clearCover ? '1' : ''} />
	<input
		bind:this={logoFileInputEl}
		class="sr-only"
		type="file"
		name="logo_file"
		accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
		tabindex="-1"
		aria-hidden="true"
	/>
	<input
		bind:this={coverFileInputEl}
		class="sr-only"
		type="file"
		name="cover_file"
		accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
		tabindex="-1"
		aria-hidden="true"
	/>

	<!-- Single Search Description & Synchronized Website fields -->
	<input type="hidden" name="seo_description" value={seoDescription} />
	<input type="hidden" name="microsite_slug" value={slugInput} />
	<input type="hidden" name="return_view" value={activeView} />
	<input
		type="hidden"
		name="page_blocks_json"
		value={JSON.stringify(sitePages[0]?.blocks || pageBlocks)}
	/>
	<input
		type="hidden"
		name="site_pages_json"
		value={JSON.stringify(syncedSiteConfig.site_pages || sitePages)}
	/>
	<input type="hidden" name="site_title" value={syncedSiteConfig.site_title || ''} />
	<input type="hidden" name="site_tagline" value={syncedSiteConfig.site_tagline || ''} />
	<input type="hidden" name="home_intro" value={syncedSiteConfig.home_intro || ''} />
	<input type="hidden" name="footer_blurb" value={siteConfig.footer_blurb || ''} />
	<input type="hidden" name="hero_style" value={siteConfig.hero_style || 'immersive'} />
	<input type="hidden" name="background_style" value={siteConfig.background_style || 'cinematic'} />
	<input type="hidden" name="panel_style" value={siteConfig.panel_style || 'glass'} />
	<input type="hidden" name="panel_tone" value={siteConfig.panel_tone || 'surface'} />
	<input type="hidden" name="panel_density" value={siteConfig.panel_density || 'comfortable'} />
	<input type="hidden" name="font_pairing" value={siteConfig.font_pairing || 'poster'} />
	<input type="hidden" name="site_variant" value={siteConfig.site_variant || 'standard'} />
	<input type="hidden" name="theme_mode" value={siteConfig.theme_mode || 'derived'} />
	<input type="hidden" name="theme_name" value={siteConfig.theme_name || ''} />
	<input type="hidden" name="theme_primary" value={siteConfig.theme_colors?.primary || ''} />
	<input type="hidden" name="theme_secondary" value={siteConfig.theme_colors?.secondary || ''} />
	<input type="hidden" name="theme_accent" value={siteConfig.theme_colors?.accent || ''} />
	<input type="hidden" name="theme_surface" value={siteConfig.theme_colors?.surface || ''} />
	<input type="hidden" name="microsite_notice" value={siteConfig.microsite_notice || ''} />
	<input
		type="hidden"
		name="microsite_notice_href"
		value={siteConfig.microsite_notice_href || ''}
	/>
	<input type="hidden" name="new_rider_note" value={siteConfig.new_rider_note || ''} />
	<input type="hidden" name="faq_1_q" value={faqItems[0]?.question || ''} />
	<input type="hidden" name="faq_1_a" value={faqItems[0]?.answer || ''} />
	<input type="hidden" name="faq_2_q" value={faqItems[1]?.question || ''} />
	<input type="hidden" name="faq_2_a" value={faqItems[1]?.answer || ''} />
	<input type="hidden" name="sponsor_items_json" value={JSON.stringify(sponsorItems)} />
	{#each sponsorItems as sponsor, index (sponsor._editorId)}
		<input
			class="sr-only"
			id={`sponsor-file-${sponsor._editorId}`}
			type="file"
			name={`sponsor_logo_file_${index}`}
			accept="image/png,image/jpeg,image/webp,image/gif"
			onchange={(event) => {
				sponsorFileNames = {
					...sponsorFileNames,
					[sponsor._editorId]: event.currentTarget.files?.[0]?.name || ''
				};
				sponsorFileRevision += 1;
			}}
		/>
	{/each}
	{#if siteConfig.ride_widget_enabled}
		<input type="hidden" name="ride_widget_enabled" value="on" />
	{/if}
	<input
		type="hidden"
		name="ride_widget_title"
		value={siteConfig.ride_widget_title || 'Ride calendar'}
	/>
	<input
		type="hidden"
		name="ride_widget_host_scope"
		value={siteConfig.ride_widget_host_scope || 'group_only'}
	/>
	<input type="hidden" name="ride_widget_group_ids" value={selectedRideGroupIds.join(',')} />
	<input type="hidden" name="ride_widget_filter_mode" value={rideFilterMode} />
	<input type="hidden" name="ride_widget_location" value={rideLocation} />
	<input type="hidden" name="ride_widget_near" value={rideNear} />
	<input type="hidden" name="ride_widget_radius_miles" value={rideRadius} />
	<input type="hidden" name="ride_widget_default_tab" value={rideDefaultTab} />
	<input type="hidden" name="ride_widget_theme" value={rideTheme} />
	<input type="hidden" name="ride_widget_density" value={rideDensity} />
	{#if rideShowFilters}<input type="hidden" name="ride_widget_show_user_filters" value="on" />{/if}
	{#if rideShowAdd}<input type="hidden" name="ride_widget_show_add_button" value="on" />{/if}
	{#if ridePrefixCity}<input type="hidden" name="ride_widget_prefix_city" value="on" />{/if}
	{#if rideDifficultyColors}
		<input type="hidden" name="ride_widget_difficulty_colors" value="on" />
	{/if}
	<input type="hidden" name="announcement_expires_at" value={announcementExpiresIso} />
	<input type="hidden" name="ai_prompt" value={siteConfig.ai_prompt || ''} />
	<input type="hidden" name="published" value={siteConfig.published === false ? 'off' : 'on'} />
	{#each GROUP_SITE_SECTION_KEYS as section}
		{#if siteConfig.sections?.[section]}
			<input type="hidden" name={`section_${section}`} value="on" />
		{/if}
	{/each}
</form>

<div class="mx-auto grid max-w-[1800px] gap-4 pb-28 sm:pb-12">
	<!-- Studio Header & Unified Preview Switcher -->
	<header
		class="border-surface-700 bg-surface-900 border-t-primary-500 grid gap-4 border border-t-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center"
	>
		<div class="flex min-w-0 items-start gap-3">
			<span
				class="preset-filled-primary-500 text-surface-950 flex h-11 w-11 shrink-0 items-center justify-center"
			>
				<IconGlobe class="h-6 w-6" />
			</span>
			<div class="min-w-0 space-y-1">
				<p class="text-primary-400 text-xs font-bold tracking-[0.16em] uppercase">
					Unified Public Presence
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="text-surface-50 text-xl font-black tracking-tight sm:text-2xl">
						Presence Studio
					</h2>
					{#if dirty}
						<span class="badge preset-filled-warning-500 text-surface-950 font-bold">
							Unpublished changes
						</span>
					{:else}
						<span
							class="badge preset-filled-success-500 text-surface-950 flex items-center gap-1 font-bold"
						>
							<IconBadgeCheck class="h-3.5 w-3.5" /> Published
						</span>
					{/if}
				</div>
				<p class="text-surface-300 max-w-3xl text-sm">
					Update your group profile once to power both your 3 Feet Please directory listing and your
					standalone custom website.
				</p>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs">
					<a
						class="text-surface-200 hover:text-primary-400 inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline"
						href={data.directoryUrl}
						target="_blank"
						rel="noreferrer"
					>
						<IconList class="h-3.5 w-3.5" /> Directory: /groups/{data.group.slug}
						<IconExternalLink class="h-3 w-3 opacity-70" />
					</a>
					<a
						class="text-surface-200 hover:text-primary-400 inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline"
						href={data.liveUrl}
						target="_blank"
						rel="noreferrer"
					>
						<IconGlobe class="h-3.5 w-3.5" /> Website: {data.liveUrl}
						<IconExternalLink class="h-3 w-3 opacity-70" />
					</a>
				</div>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2 xl:justify-end">
			<div
				class="border-surface-700 bg-surface-950 flex items-center border p-1"
				role="group"
				aria-label="Preview mode"
			>
				<button
					type="button"
					class="btn btn-sm {showPreview && previewMode === 'directory'
						? 'preset-filled-primary-500 text-surface-950 font-bold'
						: 'text-surface-200 hover:bg-surface-800'}"
					aria-pressed={showPreview && previewMode === 'directory'}
					onclick={() => openPreviewSurface('directory')}
				>
					<IconList class="h-4 w-4" />
					<span>Directory Preview</span>
				</button>
				<button
					type="button"
					class="btn btn-sm {showPreview && previewMode === 'website'
						? 'preset-filled-primary-500 text-surface-950 font-bold'
						: 'text-surface-200 hover:bg-surface-800'}"
					aria-pressed={showPreview && previewMode === 'website'}
					onclick={() => openPreviewSurface('website')}
				>
					<IconGlobe class="h-4 w-4" />
					<span>Website Preview</span>
				</button>
			</div>

			<button
				class="btn btn-sm border-surface-700 bg-surface-950 text-surface-100 hover:bg-surface-800 border"
				type="button"
				aria-pressed={showPreview}
				onclick={() => (showPreview = !showPreview)}
			>
				<IconEye class="h-4 w-4" />
				{showPreview ? 'Hide Preview' : 'Show Preview'}
			</button>
		</div>
	</header>

	<!-- Status & Error Banners -->
	{#if data.saved}
		<div
			class="border-success-500 bg-surface-900 text-surface-50 flex items-center gap-2 border-l-4 p-3 text-sm"
			role="status"
		>
			<IconCheck class="text-success-400 h-4 w-4 shrink-0" />
			<span>Public presence changes published to your directory listing and website.</span>
		</div>
	{/if}
	{#if data.reset}
		<div
			class="border-success-500 bg-surface-900 text-surface-50 flex items-center gap-2 border-l-4 p-3 text-sm"
			role="status"
		>
			<IconRefresh class="text-success-400 h-4 w-4 shrink-0" />
			<span>Custom website sections and theme reset to generated defaults.</span>
		</div>
	{/if}
	{#if localNotice}
		<div
			class="border-primary-500 bg-surface-900 text-surface-50 flex items-center gap-2 border-l-4 p-3 text-sm"
			role="status"
		>
			<IconSparkles class="text-primary-400 h-4 w-4 shrink-0" />
			<span>{localNotice}</span>
		</div>
	{/if}
	{#if localError}
		<div
			class="border-error-500 bg-surface-900 text-surface-50 flex items-center gap-2 border-l-4 p-3 text-sm"
			role="alert"
		>
			<IconCircleAlert class="text-error-400 h-4 w-4 shrink-0" />
			<span>{localError}</span>
		</div>
	{:else if form?.error}
		<div
			class="border-error-500 bg-surface-900 text-surface-50 flex items-center gap-2 border-l-4 p-3 text-sm"
			role="alert"
		>
			<IconCircleAlert class="text-error-400 h-4 w-4 shrink-0" />
			<span>{form.error}</span>
		</div>
	{/if}
	{#if pendingFileWarning}
		<div
			class="border-warning-500 bg-surface-900 text-surface-50 flex items-center gap-2 border-l-4 p-3 text-sm"
			role="status"
		>
			<IconCircleAlert class="text-warning-400 h-4 w-4 shrink-0" />
			<span>{pendingFileWarning}</span>
		</div>
	{/if}

	<!-- Unified Studio Navigation: Core Profile + Optional Custom Website Layer -->
	<nav
		class="border-surface-700 bg-surface-900 z-30 grid gap-2 border p-2 shadow-xl lg:sticky lg:top-2 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center"
		aria-label="Public presence workspace"
	>
		<div class="flex items-center gap-2" role="tablist" aria-label="Core profile">
			<button
				type="button"
				role="tab"
				id="presence-view-profile"
				aria-controls="presence-panel-profile"
				aria-selected={activeView === 'profile'}
				tabindex={activeView === 'profile' ? 0 : -1}
				onkeydown={(event) => handleViewKeydown(event, 0)}
				onclick={() => selectView('profile')}
				class="btn min-h-12 w-full justify-start px-4 text-left xl:w-auto {activeView === 'profile'
					? 'preset-filled-primary-500 text-surface-950 font-black'
					: 'border-surface-700 bg-surface-950 text-surface-100 hover:bg-surface-800 border font-bold'}"
			>
				<IconSquarePen class="h-4 w-4 shrink-0" />
				<span>
					<span class="block text-sm leading-tight">Core Profile</span>
					<span class="block text-[0.68rem] font-normal opacity-80">Directory & Website</span>
				</span>
			</button>
		</div>

		<div
			class="border-surface-800 grid gap-1.5 border-t pt-2 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-3"
		>
			<div class="flex items-center justify-between px-1">
				<span class="text-surface-300 text-[0.68rem] font-bold tracking-[0.16em] uppercase">
					Optional Custom Website Layer
				</span>
				<span class="text-surface-400 hidden text-[0.68rem] sm:inline">
					Sections, multi-page menu, theme & custom domain
				</span>
			</div>
			<div
				class="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7"
				role="tablist"
				aria-label="Custom website studio"
			>
				{#each websiteViews as view, wIndex}
					{@const ViewIcon = view.icon}
					<button
						class="btn btn-sm min-h-10 justify-center {activeView === view.id
							? 'preset-filled-primary-500 text-surface-950 font-bold'
							: 'border-surface-800 bg-surface-950 text-surface-200 hover:bg-surface-800 border'}"
						type="button"
						role="tab"
						id={`presence-view-${view.id}`}
						aria-controls={`presence-panel-${view.id}`}
						aria-selected={activeView === view.id}
						tabindex={activeView === view.id ? 0 : -1}
						title={view.hint}
						onkeydown={(event) => handleViewKeydown(event, wIndex + 1)}
						onclick={() => selectView(view.id)}
					>
						<ViewIcon class="h-4 w-4 shrink-0" />
						<span class="truncate">{view.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</nav>

	<!-- Main Studio Split Area -->
	<div
		class="grid items-start gap-4 {showPreview
			? '2xl:grid-cols-[minmax(0,1fr)_minmax(34rem,0.9fr)]'
			: ''}"
	>
		{#if showPreview}
			<aside class="order-first min-w-0 2xl:sticky 2xl:top-24 2xl:order-last">
				<GroupSitePreview
					bind:mode={previewMode}
					directorySrc={directoryPreviewSrc}
					directoryLiveUrl={data.directoryUrl}
					websiteSrc={websitePreviewSrc}
					websiteLiveUrl={data.liveUrl}
					title={liveGroupDraft.name || data.group.name}
					{dirty}
				/>
			</aside>
		{/if}

		<div
			class="grid min-w-0 gap-5"
			id={`presence-panel-${activeView}`}
			role="tabpanel"
			aria-labelledby={`presence-view-${activeView}`}
		>
			{#if activeView === 'profile'}
				<!-- CORE PROFILE WORKSPACE -->
				{#if isAdminUser}
					<div
						class="border-surface-700 bg-surface-900 flex flex-wrap items-center justify-between gap-3 border p-4"
					>
						<div>
							<p class="text-surface-100 text-sm font-bold">Admin Enrichment</p>
							<p class="text-surface-300 text-xs">
								Expand group profile details from connected website and social accounts into your
								draft.
							</p>
						</div>
						<button
							type="button"
							class="btn btn-sm preset-filled-secondary-500"
							disabled={deepEnrichLoading}
							onclick={runDeepEnrichFromExistingProfile}
						>
							<IconSparkles class="h-4 w-4" />
							{deepEnrichLoading ? 'AI Enriching…' : 'Deep Enrich Profile (Admin)'}
						</button>
						{#if deepEnrichError}
							<p class="text-error-400 w-full text-xs">{deepEnrichError}</p>
						{/if}
						{#if deepEnrichSuccess}
							<p class="text-success-400 w-full text-xs">{deepEnrichSuccess}</p>
						{/if}
					</div>
				{/if}

				<!-- 1. Identity & Search -->
				<section
					class="border-surface-700 bg-surface-900 border-t-primary-500 grid gap-4 border border-t-4 p-5"
				>
					<div>
						<p class="text-primary-400 text-xs font-bold tracking-[0.14em] uppercase">
							Identity & Search
						</p>
						<h3 class="text-surface-50 mt-1 text-lg font-bold">
							Shared across Directory & Website
						</h3>
						<p class="text-surface-300 text-sm">
							Your group name, tagline, description, and search summary feed both your directory
							page and your website homepage.
						</p>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-name">
								Group Name
							</label>
							<input
								id="profile-name"
								class="input border-surface-700 bg-surface-950 border"
								bind:value={profileDraft.name}
								maxlength="120"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-tagline">
								Tagline
							</label>
							<input
								id="profile-tagline"
								class="input border-surface-700 bg-surface-950 border"
								bind:value={profileDraft.tagline}
								maxlength="180"
								placeholder="A short, welcoming one-line summary"
							/>
						</div>
						<div class="flex flex-col gap-1 md:col-span-2">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-description">
								About & Welcome Story
							</label>
							<textarea
								id="profile-description"
								class="textarea border-surface-700 bg-surface-950 border"
								rows="4"
								bind:value={profileDraft.description}
								placeholder="Tell riders who you are, what rides feel like, and why people love joining."
							></textarea>
						</div>
						<div class="flex flex-col gap-1 md:col-span-2">
							<div class="flex items-center justify-between gap-2">
								<label
									class="label text-surface-100 text-sm font-semibold"
									for="presence-seo-description"
								>
									Search Description
								</label>
								<span class="text-surface-400 text-xs">{seoDescription.length}/180</span>
							</div>
							<textarea
								id="presence-seo-description"
								class="textarea border-surface-700 bg-surface-950 border"
								rows="2"
								maxlength="180"
								bind:value={seoDescription}
								placeholder="One clear sentence shown in Google search results and social link previews."
							></textarea>
							<p class="text-surface-400 text-xs">
								Used as the homepage meta description on your published custom website.
							</p>
						</div>
					</div>
				</section>

				<!-- 2. Brand Media (Logo & Cover) -->
				<section
					class="border-surface-700 bg-surface-900 border-t-primary-500 grid gap-4 border border-t-4 p-5"
				>
					<div>
						<p class="text-primary-400 text-xs font-bold tracking-[0.14em] uppercase">
							Photos & Branding
						</p>
						<h3 class="text-surface-50 mt-1 text-lg font-bold">Logo & Cover Photo</h3>
						<p class="text-surface-300 text-sm">
							Upload and crop your 1:1 logo and 16:9 cover image, or generate cover art with AI.
						</p>
					</div>

					<ImageGeneratorPanel
						target="group"
						heading="Generate group cover art"
						description="Create a banner illustration from your group details and stage it for publishing."
						helperText="Generated cover art is staged in your draft until you click Publish."
						currentImageUrl={coverPreview}
						buildContext={buildGroupImageContext}
						onApply={applyGeneratedGroupCover}
					/>

					<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
						<div class="flex flex-col gap-2">
							<span class="text-surface-100 text-sm font-semibold">
								Logo <span class="text-surface-400 text-xs font-normal">(1:1 square)</span>
							</span>
							{#key logoUploadKey}
								<FileUpload
									name="studio_logo_picker"
									accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
									maxFiles={1}
									maxFileSize={MAX_BYTES}
									classes="w-full"
									onFileChange={onLogoChange}
									{onFileReject}
								>
									<FileUpload.HiddenInput />
									<FileUpload.Dropzone
										class="border-surface-700 bg-surface-950 hover:border-primary-500 hover:bg-surface-800 w-full border-2 border-dashed p-6 text-center transition-colors"
										aria-label="Select logo file or drag here"
									>
										<IconDropzone class="mx-auto mb-2 h-8 w-8 opacity-60" />
										<p class="text-sm">Select or drag a logo image</p>
										<small class="text-surface-400 text-xs">PNG · JPG · WEBP · Max 10MB</small>
									</FileUpload.Dropzone>
								</FileUpload>
							{/key}
							{#if logoTooLarge}
								<p class="text-error-400 text-xs">Logo file exceeds 10MB limit.</p>
							{/if}
							{#if logoPreview && !profileDraft.clearLogo}
								<div
									class="border-surface-700 relative mt-1 aspect-square w-24 overflow-hidden border"
								>
									<img src={logoPreview} alt="Logo preview" class="h-full w-full object-cover" />
									<button
										type="button"
										class="bg-surface-950/80 hover:bg-error-500 absolute top-1 right-1 p-0.5 text-white"
										aria-label="Remove logo"
										onclick={() => removeImage('logo')}
									>
										<IconRemove class="h-4 w-4" />
									</button>
								</div>
							{/if}
						</div>

						<div class="flex flex-col gap-2">
							<span class="text-surface-100 text-sm font-semibold">
								Cover Photo <span class="text-surface-400 text-xs font-normal"
									>(16:9 widescreen)</span
								>
							</span>
							{#key coverUploadKey}
								<FileUpload
									name="studio_cover_picker"
									accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
									maxFiles={1}
									maxFileSize={MAX_BYTES}
									classes="w-full"
									onFileChange={onCoverChange}
									{onFileReject}
								>
									<FileUpload.HiddenInput />
									<FileUpload.Dropzone
										class="border-surface-700 bg-surface-950 hover:border-primary-500 hover:bg-surface-800 w-full border-2 border-dashed p-6 text-center transition-colors"
										aria-label="Select cover image or drag here"
									>
										<IconDropzone class="mx-auto mb-2 h-8 w-8 opacity-60" />
										<p class="text-sm">Select or drag a cover image</p>
										<small class="text-surface-400 text-xs">PNG · JPG · WEBP · Max 10MB</small>
									</FileUpload.Dropzone>
								</FileUpload>
							{/key}
							{#if coverTooLarge}
								<p class="text-error-400 text-xs">Cover file exceeds 10MB limit.</p>
							{/if}
							{#if coverPreview && !profileDraft.clearCover}
								<div class="border-surface-700 relative mt-1 aspect-[16/9] overflow-hidden border">
									<img
										src={coverPreview}
										alt="Cover preview"
										class="absolute inset-0 h-full w-full object-cover"
									/>
									<button
										type="button"
										class="bg-surface-950/80 hover:bg-error-500 absolute top-1 right-1 p-0.5 text-white"
										aria-label="Remove cover photo"
										onclick={() => removeImage('cover')}
									>
										<IconRemove class="h-4 w-4" />
									</button>
								</div>
							{/if}
						</div>
					</div>
				</section>

				<!-- 3. Location & Map -->
				<section
					class="border-surface-700 bg-surface-900 border-t-secondary-500 grid gap-4 border border-t-4 p-5"
				>
					<div>
						<p class="text-secondary-400 text-xs font-bold tracking-[0.14em] uppercase">Location</p>
						<h3 class="text-surface-50 mt-1 text-lg font-bold">Where Riders Find You</h3>
					</div>

					<div class="grid gap-4">
						<div class="flex flex-col gap-1">
							<label
								class="label text-surface-100 text-sm font-semibold"
								for="profile-meeting-address"
							>
								Meeting Point Address
							</label>
							<input
								id="profile-meeting-address"
								class="input border-surface-700 bg-surface-950 border"
								bind:value={profileDraft.specific_meeting_point_address}
								oninput={() => scheduleLocationGeocode({ force: true })}
								onblur={() => scheduleLocationGeocode({ immediate: true, force: true })}
								placeholder="Park, trailhead, or street address"
							/>
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
							<div class="flex flex-col gap-1">
								<label class="label text-surface-100 text-sm font-semibold" for="profile-city">
									City
								</label>
								<input
									id="profile-city"
									class="input border-surface-700 bg-surface-950 border"
									bind:value={profileDraft.city}
									onblur={() => scheduleLocationGeocode({ immediate: true, force: true })}
								/>
							</div>
							<div class="flex flex-col gap-1">
								<label class="label text-surface-100 text-sm font-semibold" for="profile-state">
									State / Region <span class="text-error-400">*</span>
								</label>
								<input
									id="profile-state"
									class="input border-surface-700 bg-surface-950 border"
									required
									bind:value={profileDraft.state_region}
									onblur={() => scheduleLocationGeocode({ immediate: true, force: true })}
								/>
							</div>
							<div class="flex flex-col gap-1">
								<label class="label text-surface-100 text-sm font-semibold" for="profile-country">
									Country <span class="text-error-400">*</span>
								</label>
								<select
									id="profile-country"
									class="select border-surface-700 bg-surface-950 border"
									bind:value={profileDraft.country}
									onchange={() => scheduleLocationGeocode({ immediate: true, force: true })}
								>
									<option value="US">United States</option>
									<option value="CA">Canada</option>
									<option value="MX">Mexico</option>
									<option value="GB">United Kingdom</option>
									<option value="AU">Australia</option>
									<option value="NZ">New Zealand</option>
									<option value="OTHER">Other</option>
								</select>
							</div>
						</div>

						<div class="border-surface-700 bg-surface-950 border p-3">
							<p class="text-surface-100 mb-2 text-sm font-semibold">Interactive Map Pin</p>
							<div use:attachPlacesAutocomplete></div>
							<p class="text-surface-400 my-1.5 text-xs">
								Search for a city or address, or click directly on the map to pin your meeting spot.
							</p>
							{#if placesLoading}
								<p class="text-surface-400 text-xs">Loading places…</p>
							{/if}
							<div class="border-surface-800 mt-2 h-[300px] w-full overflow-hidden border">
								<div use:attachLeafletMap class="h-full w-full"></div>
							</div>
							{#if profileDraft.latitude && profileDraft.longitude}
								<p class="text-surface-300 mt-2 font-mono text-xs">
									Pinned coordinates: {profileDraft.latitude}, {profileDraft.longitude}
								</p>
							{/if}
						</div>

						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div class="flex flex-col gap-1">
								<label
									class="label text-surface-100 text-sm font-semibold"
									for="profile-service-area"
								>
									Service Area
								</label>
								<input
									id="profile-service-area"
									class="input border-surface-700 bg-surface-950 border"
									bind:value={profileDraft.service_area_description}
									placeholder="e.g. Central Phoenix & Tempe"
								/>
							</div>
							<div class="flex flex-col gap-1">
								<label class="label text-surface-100 text-sm font-semibold" for="profile-zip">
									ZIP / Postal Code
								</label>
								<input
									id="profile-zip"
									class="input border-surface-700 bg-surface-950 border"
									bind:value={profileDraft.zip_code}
									onblur={() => scheduleLocationGeocode({ immediate: true, force: true })}
								/>
							</div>
						</div>
					</div>
				</section>

				<!-- 4. Contact, Social Links & Primary CTA -->
				<section
					class="border-surface-700 bg-surface-900 border-t-tertiary-500 grid gap-5 border border-t-4 p-5"
				>
					<div>
						<p class="text-tertiary-400 text-xs font-bold tracking-[0.14em] uppercase">
							Contact & Socials
						</p>
						<h3 class="text-surface-50 mt-1 text-lg font-bold">How Riders Connect With You</h3>
					</div>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-website">
								External Website URL
							</label>
							<input
								id="profile-website"
								class="input border-surface-700 bg-surface-950 border"
								bind:value={profileDraft.website_url}
								placeholder="https://"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-email">
								Public Contact Email
							</label>
							<input
								id="profile-email"
								type="email"
								class="input border-surface-700 bg-surface-950 border"
								bind:value={profileDraft.public_contact_email}
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-phone">
								Public Phone
							</label>
							<input
								id="profile-phone"
								class="input border-surface-700 bg-surface-950 border"
								bind:value={profileDraft.public_phone_number}
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label
								class="label text-surface-100 text-sm font-semibold"
								for="profile-preferred-contact"
							>
								Preferred Contact Notes
							</label>
							<input
								id="profile-preferred-contact"
								class="input border-surface-700 bg-surface-950 border"
								bind:value={profileDraft.preferred_contact_method_instructions}
								placeholder="e.g. DM on Instagram or email before your first ride"
							/>
						</div>
					</div>

					<div class="border-surface-800 border-t pt-4">
						<p class="text-surface-100 text-sm font-semibold">Social Accounts</p>
						<p class="text-surface-400 mt-0.5 mb-3 text-xs">
							Enter a username or full URL — links format automatically on both public surfaces.
						</p>
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
							{#each SOCIAL_FIELDS as social}
								<div class="flex flex-col gap-1">
									<label
										class="label text-surface-200 text-xs font-semibold"
										for={`studio-${social.id}`}
									>
										{social.label}
									</label>
									<input
										id={`studio-${social.id}`}
										class="input border-surface-700 bg-surface-950 border text-sm"
										bind:value={profileDraft.socialInputs[social.key]}
										placeholder={social.placeholder}
									/>
								</div>
							{/each}
						</div>
						<div class="mt-4 flex flex-col gap-1">
							<label
								class="label text-surface-200 text-xs font-semibold"
								for="studio-instagram-posts"
							>
								Instagram Post Embeds (optional)
							</label>
							<textarea
								id="studio-instagram-posts"
								class="textarea border-surface-700 bg-surface-950 border text-sm"
								rows="3"
								bind:value={profileDraft.instagramPostsText}
								placeholder="Up to 3 Instagram post URLs, one per line (https://www.instagram.com/p/...)"
							></textarea>
						</div>
					</div>

					<div class="border-surface-800 border-t pt-4">
						<p class="text-surface-100 mb-2 text-sm font-semibold">Primary Call-to-Action Button</p>
						<div class="flex flex-wrap gap-2" role="group" aria-label="Primary call-to-action">
							{#each ctaChoices as opt}
								<button
									type="button"
									aria-pressed={profileDraft.preferred_cta_kind === opt.key}
									class="btn btn-sm {profileDraft.preferred_cta_kind === opt.key
										? 'preset-filled-primary-500 text-surface-950 font-bold'
										: 'border-surface-700 bg-surface-950 text-surface-200 hover:bg-surface-800 border'}"
									onclick={() => {
										profileDraft.preferred_cta_kind = opt.key;
									}}
								>
									{#if opt.icon}<opt.icon class="h-4 w-4" />{/if}
									<span>{opt.label}</span>
								</button>
							{/each}
						</div>
						{#if profileDraft.preferred_cta_kind === 'custom'}
							<div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
								<div class="flex flex-col gap-1">
									<label
										class="label text-surface-200 text-xs font-semibold"
										for="studio-cta-label"
									>
										Button Label (10 characters max)
									</label>
									<input
										id="studio-cta-label"
										class="input border-surface-700 bg-surface-950 border"
										maxlength="10"
										bind:value={profileDraft.preferred_cta_label}
									/>
								</div>
								<div class="flex flex-col gap-1">
									<label class="label text-surface-200 text-xs font-semibold" for="studio-cta-url">
										Button Destination URL
									</label>
									<input
										id="studio-cta-url"
										class="input border-surface-700 bg-surface-950 border {profileDraft.preferred_cta_url &&
										!customUrlValid
											? 'border-error-500'
											: ''}"
										bind:value={profileDraft.preferred_cta_url}
										placeholder="https://example.org/join"
									/>
									{#if profileDraft.preferred_cta_url && !customUrlValid}
										<small class="text-error-400 text-xs">Must start with http:// or https://</small
										>
									{/if}
								</div>
							</div>
						{/if}
						{#if pickCtaPreview()}
							{@const ctaPreview = pickCtaPreview()}
							<div class="mt-3 flex items-center gap-2 text-xs">
								<span class="text-surface-400">Active button preview:</span>
								<span class="badge preset-filled-primary-500 text-surface-950 font-bold">
									{ctaPreview.label}
								</span>
							</div>
						{/if}
					</div>
				</section>

				<!-- 5. Activity Details & Categories -->
				<section
					class="border-surface-700 bg-surface-900 border-t-secondary-500 grid gap-5 border border-t-4 p-5"
				>
					<div>
						<p class="text-secondary-400 text-xs font-bold tracking-[0.14em] uppercase">
							Rides & Categories
						</p>
						<h3 class="text-surface-50 mt-1 text-lg font-bold">Activity Rhythm & Rider Tags</h3>
					</div>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-frequency">
								Activity Frequency
							</label>
							<input
								id="profile-frequency"
								class="input border-surface-700 bg-surface-950 border"
								bind:value={profileDraft.activity_frequency}
								placeholder="e.g. Weekly, First Fridays"
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-day-time">
								Typical Day / Time
							</label>
							<input
								id="profile-day-time"
								class="input border-surface-700 bg-surface-950 border"
								bind:value={profileDraft.typical_activity_day_time}
								placeholder="e.g. Saturdays at 7:30 AM"
							/>
						</div>
						<div class="flex flex-col gap-1 md:col-span-2">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-how-to-join">
								How to Join
							</label>
							<textarea
								id="profile-how-to-join"
								class="textarea border-surface-700 bg-surface-950 border"
								rows="3"
								bind:value={profileDraft.how_to_join_instructions}></textarea>
						</div>
						<div class="flex flex-col gap-1 md:col-span-2">
							<label class="label text-surface-100 text-sm font-semibold" for="profile-membership">
								Membership Info
							</label>
							<textarea
								id="profile-membership"
								class="textarea border-surface-700 bg-surface-950 border"
								rows="3"
								bind:value={profileDraft.membership_info}></textarea>
						</div>
					</div>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
						<div class="border-surface-700 bg-surface-950 border p-3">
							<p class="text-surface-100 mb-2 text-sm font-semibold">Group Types</p>
							<div class="flex flex-col gap-2">
								{#each data.group_types as gt}
									<label class="flex cursor-pointer items-center gap-2 text-sm">
										<input
											type="checkbox"
											class="checkbox"
											checked={profileDraft.group_type_ids.includes(gt.id)}
											onchange={(event) =>
												toggleTaxonomyId('group_type_ids', gt.id, event.currentTarget.checked)}
										/>
										<span>{gt.name}</span>
									</label>
								{/each}
							</div>
						</div>

						<div class="border-surface-700 bg-surface-950 border p-3">
							<p class="text-surface-100 mb-2 text-sm font-semibold">Audience Focus</p>
							<div class="flex flex-col gap-2">
								{#each data.audience_focuses as af}
									<label class="flex cursor-pointer items-center gap-2 text-sm">
										<input
											type="checkbox"
											class="checkbox"
											checked={profileDraft.audience_focus_ids.includes(af.id)}
											onchange={(event) =>
												toggleTaxonomyId('audience_focus_ids', af.id, event.currentTarget.checked)}
										/>
										<span>{af.name}</span>
									</label>
								{/each}
							</div>
						</div>

						<div class="border-surface-700 bg-surface-950 border p-3">
							<p class="text-surface-100 mb-2 text-sm font-semibold">Riding Disciplines</p>
							<div class="flex flex-col gap-2">
								{#each data.riding_disciplines as rd}
									<label class="flex cursor-pointer items-center gap-2 text-sm">
										<input
											type="checkbox"
											class="checkbox"
											checked={profileDraft.riding_discipline_ids.includes(rd.id)}
											onchange={(event) =>
												toggleTaxonomyId(
													'riding_discipline_ids',
													rd.id,
													event.currentTarget.checked
												)}
										/>
										<span>{rd.name}</span>
									</label>
								{/each}
							</div>
						</div>

						<div class="border-surface-700 bg-surface-950 border p-3">
							<p class="text-surface-100 mb-2 text-sm font-semibold">Skill Levels</p>
							<div class="flex flex-col gap-2">
								{#each data.skill_levels as sl}
									<label class="flex cursor-pointer items-center gap-2 text-sm">
										<input
											type="checkbox"
											class="checkbox"
											checked={profileDraft.skill_level_ids.includes(sl.id)}
											onchange={(event) =>
												toggleTaxonomyId('skill_level_ids', sl.id, event.currentTarget.checked)}
										/>
										<span>{sl.name}</span>
									</label>
								{/each}
							</div>
						</div>
					</div>
				</section>

				<!-- 6. Donations, Co-Owners & Group Visibility -->
				<div class="grid gap-5 xl:grid-cols-2">
					<section
						class="border-surface-700 bg-surface-900 border-t-tertiary-500 grid content-start gap-4 border border-t-4 p-5"
					>
						<div>
							<p class="text-tertiary-400 text-xs font-bold tracking-[0.14em] uppercase">
								Donations
							</p>
							<h3 class="text-surface-50 mt-1 text-lg font-bold">Fundraising & Stripe</h3>
							<p class="text-surface-300 text-sm">
								Connect Stripe once to accept donations on both your directory page and custom
								website.
							</p>
						</div>

						<div class="border-surface-700 bg-surface-950 border p-4">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div class="text-sm">
									<p class="text-surface-50 font-semibold">
										{stripeConnected ? 'Stripe account connected' : 'Stripe not connected'}
									</p>
									{#if stripeConnected}
										<p class="text-surface-300 mt-0.5 text-xs">
											{stripeAccount?.stripe_account_email || stripeAccount?.stripe_account_id}
										</p>
										<p class="text-surface-400 mt-0.5 text-xs">
											{stripeReady
												? 'Ready to accept donations.'
												: 'Connected, pending charge verification.'}
										</p>
									{/if}
								</div>
								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										class="btn btn-sm preset-filled-primary-500 text-surface-950 font-bold"
										disabled={stripeBusy}
										onclick={connectStripeForGroup}
									>
										{stripeConnected ? 'Reconnect Stripe' : 'Connect Stripe'}
									</button>
									{#if stripeConnected}
										<button
											type="button"
											class="btn btn-sm preset-outlined-error-500"
											disabled={stripeBusy}
											onclick={disconnectStripeForGroup}
										>
											{stripeBusy ? 'Disconnecting…' : 'Disconnect'}
										</button>
									{/if}
								</div>
							</div>
							{#if stripeError}
								<p class="text-error-400 mt-3 text-xs">{stripeError}</p>
							{/if}
							{#if stripeMessage}
								<p class="text-success-400 mt-3 text-xs">{stripeMessage}</p>
							{/if}
						</div>
					</section>

					<section
						class="border-surface-700 bg-surface-900 border-t-secondary-500 grid content-start gap-4 border border-t-4 p-5"
					>
						<div>
							<p class="text-secondary-400 text-xs font-bold tracking-[0.14em] uppercase">
								Co-Owners
							</p>
							<h3 class="text-surface-50 mt-1 text-lg font-bold">Group Managers</h3>
							<p class="text-surface-300 text-sm">
								Invite trusted organizers by email so they can help manage this presence.
							</p>
						</div>

						<div class="flex flex-col gap-2 sm:flex-row">
							<label class="sr-only" for="owner-invite-email">Co-owner email</label>
							<input
								id="owner-invite-email"
								type="email"
								placeholder="owner@example.com"
								bind:value={ownerEmail}
								class="input border-surface-700 bg-surface-950 flex-1 border"
								onkeydown={(event) => {
									if (event.key === 'Enter') inviteOwner(event);
								}}
							/>
							<input
								type="text"
								name="website_hp"
								bind:value={ownerHoneypot}
								autocomplete="off"
								tabindex="-1"
								aria-hidden="true"
								style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
							/>
							<button
								type="button"
								class="btn preset-filled-primary-500 text-surface-950 font-bold {ownerLoading
									? 'motion-safe:animate-pulse'
									: ''}"
								disabled={!ownerValid || ownerLoading}
								onclick={inviteOwner}
							>
								Send Invite
							</button>
						</div>
						<TurnstileVerification
							bind:this={ownerTurnstile}
							bind:busy={ownerLoading}
							variant="editor"
							enabled={(data?.turnstileEnabled ?? page.data?.turnstileEnabled) !== false}
						/>
						{#if ownerError}<p class="text-error-400 text-xs">{ownerError}</p>{/if}
						{#if ownerSuccess}<p class="text-success-400 text-xs">{ownerSuccess}</p>{/if}

						{#if owners.length}
							<ul class="divide-surface-800 border-surface-700 bg-surface-950 divide-y border">
								{#each owners as owner (owner.user_id)}
									<li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
										<span class="truncate">
											{owner.user_id === data.current_user_id
												? `${owner.email || 'You'} (You)`
												: owner.email || owner.user_id}
										</span>
										{#if owner.user_id !== data.current_user_id}
											<button
												type="button"
												class="btn btn-sm preset-outlined-error-500"
												onclick={() => removeOwner(owner.user_id, owner.email)}
											>
												Remove
											</button>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				</div>

				<!-- Danger Zone: Unpublish Group -->
				<section
					class="border-surface-700 bg-surface-900 border-t-error-500 flex flex-wrap items-center justify-between gap-4 border border-t-4 p-5"
				>
					<div class="flex items-start gap-3">
						<span
							class="bg-error-500 text-surface-950 flex h-10 w-10 shrink-0 items-center justify-center"
						>
							<IconAlertTriangle class="h-5 w-5" />
						</span>
						<div>
							<h3 class="text-surface-50 text-base font-bold">Hide group from public display</h3>
							<p class="text-surface-300 text-sm">
								Unpublishes this group from directory listings and custom website routes.
							</p>
						</div>
					</div>
					<form method="POST" action="?/delete" onsubmit={confirmDeleteGroup}>
						<button type="submit" class="btn preset-filled-error-500 flex items-center gap-2">
							<IconTrash class="h-4 w-4" />
							<span>Delete from display</span>
						</button>
					</form>
				</section>
			{:else if activeView === 'builder'}
				<!-- CUSTOM WEBSITE: SECTIONS & PAGES -->
				<section
					class="border-surface-700 bg-surface-900 border-t-primary-500 grid gap-4 border border-t-4 p-4 sm:p-5"
				>
					<div class="flex flex-wrap items-center gap-3">
						<div class="mr-auto">
							<p class="text-primary-400 text-xs font-bold tracking-[0.14em] uppercase">
								Website Pages
							</p>
							<h3 class="text-surface-50 mt-1 text-lg font-bold">Arrange Pages & Sections</h3>
							<p class="text-surface-300 mt-0.5 text-sm">
								Choose a page below, then drag or customize its sections.
							</p>
						</div>
						<button
							class="btn btn-sm preset-filled-primary-500 text-surface-950 font-bold"
							type="button"
							onclick={addSitePage}
							disabled={sitePages.length >= GROUP_SITE_PAGE_LIMIT}
						>
							<IconPlus class="h-4 w-4" /> Add page
						</button>
					</div>

					<div class="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Website pages">
						{#each sitePages as page}
							<button
								class="btn btn-sm shrink-0 {selectedPageId === page.id
									? 'preset-filled-primary-500 text-surface-950 font-bold'
									: 'border-surface-700 bg-surface-950 text-surface-200 hover:bg-surface-800 border'}"
								type="button"
								role="tab"
								aria-selected={selectedPageId === page.id}
								onclick={() => selectSitePage(page.id)}
							>
								{page.nav_label || page.title}{page.is_home ? ' · Home' : ''}
							</button>
						{/each}
					</div>

					{#if selectedSitePage}
						{#if selectedSitePage.is_home}
							<div
								class="border-surface-800 bg-surface-950 flex flex-wrap items-center justify-between gap-3 border p-3 text-xs"
							>
								<p class="text-surface-300">
									<strong class="text-surface-100">Homepage identity is synced:</strong> Title, tagline,
									welcome story, and search description come from Core Profile so your directory page
									and website never drift.
								</p>
								<button
									type="button"
									class="btn btn-sm preset-outlined-primary-500"
									onclick={() => selectView('profile')}
								>
									Edit Core Profile
								</button>
							</div>
						{:else}
							<div
								class="border-surface-800 grid gap-3 border-t pt-4 md:grid-cols-2 xl:grid-cols-4"
							>
								<label class="label text-sm">
									<span class="text-surface-200 font-semibold">Page title</span>
									<input
										class="input border-surface-700 bg-surface-950 border"
										value={selectedSitePage.title}
										oninput={(event) => updateSelectedPage({ title: event.currentTarget.value })}
										maxlength="120"
									/>
								</label>
								<label class="label text-sm">
									<span class="text-surface-200 font-semibold">Menu label</span>
									<input
										class="input border-surface-700 bg-surface-950 border"
										value={selectedSitePage.nav_label}
										oninput={(event) =>
											updateSelectedPage({ nav_label: event.currentTarget.value })}
										maxlength="40"
									/>
								</label>
								<label class="label text-sm">
									<span class="text-surface-200 font-semibold">Page address</span>
									<div
										class="input border-surface-700 bg-surface-950 flex items-center gap-1 border"
									>
										<span class="opacity-50">/</span>
										<input
											class="min-w-0 grow bg-transparent outline-none"
											value={selectedSitePage.slug}
											oninput={(event) => updateSelectedPage({ slug: event.currentTarget.value })}
											placeholder="about"
										/>
									</div>
								</label>
								<label class="label text-sm">
									<span class="text-surface-200 font-semibold">Page introduction</span>
									<input
										class="input border-surface-700 bg-surface-950 border"
										value={selectedSitePage.description}
										oninput={(event) =>
											updateSelectedPage({ description: event.currentTarget.value })}
										maxlength="360"
									/>
								</label>
								<label class="flex items-center gap-2 text-sm md:col-span-2">
									<input
										class="checkbox"
										type="checkbox"
										checked={selectedSitePage.show_in_nav}
										onchange={(event) =>
											setSelectedPageNavigationVisible(event.currentTarget.checked)}
									/>
									<span>Show in website menu</span>
								</label>
								<div class="flex flex-wrap gap-2 md:col-span-2">
									<button
										class="btn btn-sm border-surface-700 bg-surface-950 border"
										type="button"
										onclick={() => moveSelectedPage(-1)}
										disabled={sitePages.findIndex((page) => page.id === selectedPageId) <= 1}
									>
										<IconArrowLeft class="h-4 w-4" /> Earlier
									</button>
									<button
										class="btn btn-sm border-surface-700 bg-surface-950 border"
										type="button"
										onclick={() => moveSelectedPage(1)}
										disabled={sitePages.findIndex((page) => page.id === selectedPageId) >=
											sitePages.length - 1}
									>
										Later <IconArrowRight class="h-4 w-4" />
									</button>
									<button
										class="btn btn-sm preset-outlined-error-500 md:ml-auto"
										type="button"
										onclick={removeSelectedPage}
									>
										<IconTrash class="h-4 w-4" /> Remove page
									</button>
								</div>
							</div>
						{/if}
					{/if}
				</section>

				<section
					class="border-surface-700 bg-surface-900 border-t-secondary-500 grid gap-4 border border-t-4 p-4 sm:p-5"
				>
					<div class="flex flex-wrap items-start gap-3">
						<div class="mr-auto max-w-3xl">
							<p class="text-secondary-400 text-xs font-bold tracking-[0.14em] uppercase">
								Starter Layouts
							</p>
							<h3 class="text-surface-50 mt-1 text-lg font-bold">
								Choose a layout direction for your group
							</h3>
							<p class="text-surface-300 mt-0.5 text-sm">
								Templates arrange sections and colors in your draft without overwriting your Core
								Profile identity or web address.
							</p>
						</div>
					</div>
					<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
						{#each GROUP_SITE_TEMPLATES as template}
							<article
								class="border-surface-700 bg-surface-950 grid content-between gap-4 border p-4"
							>
								<div class="grid gap-3">
									<div class="flex items-center justify-between gap-2">
										<div class="flex gap-1" aria-label={`${template.label} color palette`}>
											{#each Object.values(template.design.colors) as color}
												<span class="h-5 w-5" style:background-color={color}></span>
											{/each}
										</div>
										{#if template.id === recommendedTemplateId}
											<span class="badge preset-filled-primary-500 text-surface-950 font-bold">
												Recommended
											</span>
										{/if}
									</div>
									<div>
										<h4 class="text-surface-50 font-bold">{template.label}</h4>
										<p class="text-surface-300 mt-1 text-sm">{template.description}</p>
									</div>
									<p class="text-surface-400 text-xs">
										<span class="font-semibold">Best for:</span>
										{template.bestFor}
									</p>
								</div>
								<button
									class="btn btn-sm preset-outlined-primary-500 hover:preset-filled-primary-500 w-full"
									type="button"
									onclick={() => applySiteTemplate(template)}
								>
									Use this template
								</button>
							</article>
						{/each}
					</div>
				</section>

				<GroupSiteBlockEditor
					blocks={pageBlocks}
					config={syncedSiteConfig}
					group={liveGroupDraft}
					page={selectedSitePage}
					onchange={updatePageBlocks}
					onconfigchange={updateSiteConfig}
					onpagechange={updateSelectedPage}
					oneditcore={() => selectView('profile')}
				/>
			{:else if activeView === 'quick'}
				<!-- CUSTOM WEBSITE: AI ASSISTANT, ANNOUNCEMENT, NEW RIDER NOTE, FAQ & PARTNERS -->
				<section
					class="border-surface-700 bg-surface-900 border-t-secondary-500 grid gap-4 border border-t-4 p-4 sm:p-5"
				>
					<div>
						<p class="text-secondary-400 text-xs font-bold tracking-[0.14em] uppercase">
							AI Website Designer
						</p>
						<h3 class="text-surface-50 mt-1 text-lg font-bold">Draft copy & layout with AI</h3>
						<p class="text-surface-300 text-sm">
							Ask for a tone, layout, or rider focus. Applying a draft stages changes here so you
							can publish them with the bar below.
						</p>
					</div>
					<GroupSiteAiAssistant
						groupSlug={data.group.slug}
						currentConfig={aiCurrentConfig}
						onapplied={applyAiConfig}
					/>
				</section>

				<div class="grid gap-4 xl:grid-cols-2">
					<section
						class="border-surface-700 bg-surface-900 border-t-primary-500 grid content-start gap-3 border border-t-4 p-4 sm:p-5"
					>
						<div>
							<h3 class="text-surface-50 text-base font-bold">Announcement Bar</h3>
							<p class="text-surface-300 text-sm">
								Highlight a timely event or registration link at the top of your website.
							</p>
						</div>
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">Announcement</span>
							<input
								class="input border-surface-700 bg-surface-950 border"
								bind:value={siteConfig.microsite_notice}
								maxlength="180"
								placeholder="Registration is open for our fall ride."
							/>
						</label>
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">
								Link <span class="text-surface-400 font-normal">optional</span>
							</span>
							<input
								class="input border-surface-700 bg-surface-950 border"
								type="url"
								bind:value={siteConfig.microsite_notice_href}
								placeholder="https://…"
							/>
						</label>
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">
								Hide after <span class="text-surface-400 font-normal">optional</span>
							</span>
							<input
								class="input border-surface-700 bg-surface-950 border"
								type="datetime-local"
								bind:value={siteConfig.announcement_expires_at}
							/>
						</label>
					</section>

					<section
						class="border-surface-700 bg-surface-900 border-t-tertiary-500 grid content-start gap-3 border border-t-4 p-4 sm:p-5"
					>
						<div>
							<h3 class="text-surface-50 text-base font-bold">New Rider Welcome Note</h3>
							<p class="text-surface-300 text-sm">
								Reassure first-time visitors about pace, no-drop policy, or what to bring.
							</p>
						</div>
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">What should a new rider know?</span>
							<textarea
								class="textarea border-surface-700 bg-surface-950 border"
								rows="5"
								bind:value={siteConfig.new_rider_note}
								maxlength="600"
								placeholder="Helmets required, lights for evening rides, and nobody gets left behind."
							></textarea>
						</label>
					</section>
				</div>

				<section class="border-surface-700 bg-surface-900 grid gap-4 border p-4 sm:p-5">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h3 class="text-surface-50 text-base font-bold">Frequently Asked Questions</h3>
							<p class="text-surface-300 text-sm">
								Up to two quick answers displayed in your website story section.
							</p>
						</div>
						<button
							class="btn btn-sm preset-outlined-primary-500"
							type="button"
							onclick={addFaq}
							disabled={faqItems.length >= 2}
						>
							<IconPlus class="h-4 w-4" /> Add question
						</button>
					</div>
					{#each faqItems as item, index}
						<div class="border-surface-700 bg-surface-950 grid gap-3 border p-3">
							<div class="flex items-center justify-between">
								<p class="text-surface-100 text-sm font-semibold">Question {index + 1}</p>
								<button
									class="btn btn-icon btn-sm preset-outlined-error-500"
									type="button"
									onclick={() => removeFaq(index)}
									aria-label={`Remove question ${index + 1}`}
								>
									<IconTrash class="h-4 w-4" />
								</button>
							</div>
							<input
								class="input border-surface-700 bg-surface-900 border"
								bind:value={item.question}
								maxlength="120"
								placeholder="Do I need to be an experienced rider?"
							/>
							<textarea
								class="textarea border-surface-700 bg-surface-900 border"
								rows="3"
								bind:value={item.answer}
								maxlength="320"
								placeholder="No — new riders are welcome on every social ride."></textarea>
						</div>
					{/each}
				</section>

				<GroupSitePartnerEditor
					sponsors={sponsorItems}
					fileNames={sponsorFileNames}
					onadd={addSponsor}
					onremove={removeSponsor}
					onupdate={updateSponsor}
				/>
			{:else if activeView === 'navigation'}
				<!-- CUSTOM WEBSITE: NAVIGATION -->
				<section
					class="border-surface-700 bg-surface-900 border-t-primary-500 grid gap-5 border border-t-4 p-4 sm:p-5"
				>
					<div class="flex flex-wrap items-start gap-3">
						<div class="mr-auto max-w-3xl">
							<p class="text-primary-400 text-xs font-bold tracking-[0.14em] uppercase">
								Navigation Menu
							</p>
							<h3 class="text-surface-50 mt-1 text-lg font-bold">
								Keep your website header clear and focused
							</h3>
							<p class="text-surface-300 mt-0.5 text-sm">
								Choose up to {GROUP_SITE_PRIMARY_NAV_LIMIT} primary header links. Place secondary links
								in More or hide them.
							</p>
						</div>
						<span
							class="badge {primaryNavigationCount >= GROUP_SITE_PRIMARY_NAV_LIMIT
								? 'preset-filled-warning-500 text-surface-950'
								: 'preset-filled-success-500 text-surface-950'} font-bold"
						>
							{primaryNavigationCount} of {GROUP_SITE_PRIMARY_NAV_LIMIT} primary links
						</span>
					</div>

					<div class="grid gap-2">
						{#each navigationItems as item, index}
							{@const meta = navigationItemMeta(item)}
							<div
								class="border-surface-700 bg-surface-950 grid gap-3 border p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(10rem,0.55fr)] sm:items-center"
							>
								<div class="flex gap-1">
									<button
										class="btn btn-sm border-surface-700 bg-surface-900 border"
										type="button"
										aria-label={`Move ${item.label} earlier`}
										onclick={() => moveNavigationItem(item.id, -1)}
										disabled={meta.locked || index <= 1}
									>
										<IconArrowLeft class="h-4 w-4" />
									</button>
									<button
										class="btn btn-sm border-surface-700 bg-surface-900 border"
										type="button"
										aria-label={`Move ${item.label} later`}
										onclick={() => moveNavigationItem(item.id, 1)}
										disabled={meta.locked || index >= navigationItems.length - 1}
									>
										<IconArrowRight class="h-4 w-4" />
									</button>
								</div>
								<label class="label min-w-0 text-sm">
									<span class="text-surface-300 text-xs">
										{meta.kind} · <span class="text-surface-400">{meta.detail}</span>
									</span>
									<input
										class="input border-surface-700 bg-surface-900 border"
										value={item.label}
										maxlength="40"
										oninput={(event) =>
											updateNavigationItem(item.id, { label: event.currentTarget.value })}
									/>
								</label>
								<label class="label text-sm">
									<span class="text-surface-300 text-xs">Placement</span>
									<select
										class="select border-surface-700 bg-surface-900 border"
										value={item.placement}
										disabled={meta.locked}
										onchange={(event) =>
											updateNavigationItem(item.id, { placement: event.currentTarget.value })}
									>
										{#each GROUP_SITE_NAV_PLACEMENTS as placement}
											<option
												value={placement}
												disabled={placement === 'primary' &&
													item.placement !== 'primary' &&
													primaryNavigationCount >= GROUP_SITE_PRIMARY_NAV_LIMIT}
											>
												{navigationPlacementLabels[placement]}
											</option>
										{/each}
									</select>
								</label>
							</div>
						{/each}
					</div>
				</section>
			{:else if activeView === 'appearance'}
				<!-- CUSTOM WEBSITE: THEME & STYLE -->
				<section
					class="border-surface-700 bg-surface-900 border-t-primary-500 grid gap-5 border border-t-4 p-4 sm:p-5"
				>
					<div>
						<h3 class="text-surface-50 text-lg font-bold">Website Color Palette</h3>
						<p class="text-surface-300 text-sm">
							Customize the colors of your standalone website without affecting your directory
							listing.
						</p>
					</div>
					<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
						{#each sitePalettes as palette}
							<button
								class="border-surface-700 bg-surface-950 grid min-h-32 cursor-pointer content-between gap-3 border p-4 text-left {palette.colors
									? siteConfig.theme_mode === 'custom' &&
										Object.entries(palette.colors).every(
											([key, value]) => siteConfig.theme_colors?.[key] === value
										)
										? 'border-primary-500 ring-primary-500 ring-1'
										: ''
									: siteConfig.theme_mode === 'derived'
										? 'border-primary-500 ring-primary-500 ring-1'
										: ''}"
								type="button"
								onclick={() => applySitePalette(palette)}
							>
								<span>
									<span class="text-surface-50 font-bold">{palette.label}</span>
									<span class="text-surface-300 mt-1 block text-xs">{palette.description}</span>
								</span>
								<span class="flex gap-1" aria-hidden="true">
									{#each palette.colors ? Object.values(palette.colors) : ['#D7F205', '#5665E8', '#D946EF', '#F8FAFC'] as color}
										<span class="h-6 grow" style:background-color={color}></span>
									{/each}
								</span>
							</button>
						{/each}
					</div>
					<button
						class="btn preset-filled-secondary-500 w-fit"
						type="button"
						onclick={refreshBrandPalette}
						disabled={refreshingPalette}
					>
						<IconSparkles class="h-4 w-4" />
						{refreshingPalette ? 'Refreshing colors…' : 'Refresh colors from logo'}
					</button>
				</section>

				<section class="border-surface-700 bg-surface-900 grid gap-4 border p-4 sm:p-5">
					<div>
						<h3 class="text-surface-50 text-lg font-bold">Hero Layout</h3>
						<p class="text-surface-300 text-sm">
							Choose how the top of your custom website introduces your group.
						</p>
					</div>
					<div class="grid gap-2 md:grid-cols-3">
						{#each GROUP_SITE_HERO_STYLES as style}
							<button
								class="min-h-24 cursor-pointer border p-4 text-left {siteConfig.hero_style === style
									? 'preset-filled-primary-500 text-surface-950 border-primary-500 font-bold'
									: 'border-surface-700 bg-surface-950 text-surface-100 hover:bg-surface-800'}"
								type="button"
								aria-pressed={siteConfig.hero_style === style}
								onclick={() => (siteConfig.hero_style = style)}
							>
								<span class="block font-bold">{heroLabels[style]?.[0] || style}</span>
								<span class="mt-1 block text-sm opacity-80">{heroLabels[style]?.[1]}</span>
							</button>
						{/each}
					</div>
				</section>

				<details class="border-surface-700 bg-surface-900 border">
					<summary class="text-surface-50 cursor-pointer p-4 font-bold">
						Fine-tune typography, panels, and custom hex colors
					</summary>
					<div class="border-surface-800 grid gap-4 border-t p-4 sm:grid-cols-2">
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">Background mood</span>
							<select
								class="select border-surface-700 bg-surface-950 border"
								bind:value={siteConfig.background_style}
							>
								{#each GROUP_SITE_BACKGROUND_STYLES as option}
									<option value={option}>{backgroundLabels[option] || option}</option>
								{/each}
							</select>
						</label>
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">Content panels</span>
							<select
								class="select border-surface-700 bg-surface-950 border"
								bind:value={siteConfig.panel_style}
							>
								{#each GROUP_SITE_PANEL_STYLES as option}
									<option value={option}>{panelStyleLabels[option] || option}</option>
								{/each}
							</select>
						</label>
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">Typography</span>
							<select
								class="select border-surface-700 bg-surface-950 border"
								bind:value={siteConfig.font_pairing}
							>
								{#each GROUP_SITE_FONT_PAIRING_OPTIONS as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">Spacing</span>
							<select
								class="select border-surface-700 bg-surface-950 border"
								bind:value={siteConfig.panel_density}
							>
								{#each GROUP_SITE_PANEL_DENSITIES as option}
									<option value={option}>{densityLabels[option] || option}</option>
								{/each}
							</select>
						</label>
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">Panel color family</span>
							<select
								class="select border-surface-700 bg-surface-950 border"
								bind:value={siteConfig.panel_tone}
							>
								{#each GROUP_SITE_PANEL_TONES as option}
									<option value={option}>{toneLabels[option] || option}</option>
								{/each}
							</select>
						</label>
						<div class="grid grid-cols-4 gap-2 sm:col-span-2">
							{#each ['primary', 'secondary', 'accent', 'surface'] as color}
								<label class="label text-sm">
									<span class="text-surface-200 capitalize">{color}</span>
									<input
										class="input border-surface-700 bg-surface-950 h-12 border"
										type="color"
										bind:value={siteConfig.theme_colors[color]}
									/>
								</label>
							{/each}
						</div>
					</div>
				</details>
			{:else if activeView === 'rides'}
				<!-- CUSTOM WEBSITE: RIDE CALENDAR -->
				<section
					class="border-surface-700 bg-surface-900 border-t-primary-500 grid gap-5 border border-t-4 p-4 sm:p-5"
				>
					{#if (sitePages[0]?.blocks || pageBlocks).some((block) => block.type === 'ride_calendar')}
						<div class="border-surface-700 bg-surface-950 flex items-start gap-3 border p-4">
							<IconCalendar class="text-primary-400 mt-0.5 h-5 w-5 shrink-0" />
							<div>
								<p class="text-surface-50 font-bold">Ride calendar is active on your website</p>
								<p class="text-surface-300 mt-0.5 text-sm">
									Configure which published rides appear in your embedded calendar widget.
								</p>
							</div>
						</div>

						<div class="grid gap-4">
							<label class="label text-sm">
								<span class="text-surface-200 font-semibold">Section title</span>
								<input
									class="input border-surface-700 bg-surface-950 border"
									bind:value={siteConfig.ride_widget_title}
									maxlength="120"
								/>
							</label>

							<div>
								<p class="text-surface-100 mb-2 text-sm font-semibold">
									Which rides should appear?
								</p>
								<div class="grid gap-2 sm:grid-cols-3">
									{#each GROUP_SITE_RIDE_WIDGET_HOST_SCOPES as scope}
										<button
											class="cursor-pointer border p-3 text-left {siteConfig.ride_widget_host_scope ===
											scope
												? 'preset-filled-primary-500 text-surface-950 border-primary-500 font-bold'
												: 'border-surface-700 bg-surface-950 text-surface-100 hover:bg-surface-800'}"
											type="button"
											aria-pressed={siteConfig.ride_widget_host_scope === scope}
											onclick={() => (siteConfig.ride_widget_host_scope = scope)}
										>
											{scope === 'group_only'
												? 'Only our rides'
												: scope === 'selected_groups'
													? 'Selected groups'
													: 'All published rides'}
										</button>
									{/each}
								</div>
							</div>

							{#if siteConfig.ride_widget_host_scope === 'selected_groups'}
								<div class="border-surface-700 bg-surface-950 grid gap-3 border p-3">
									<input
										class="input border-surface-700 bg-surface-900 border"
										type="search"
										bind:value={groupSearch}
										placeholder="Search groups"
									/>
									<div class="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
										{#each filteredGroups as candidate}
											<label class="flex cursor-pointer items-start gap-2 p-2 text-sm">
												<input
													class="checkbox mt-0.5"
													type="checkbox"
													checked={selectedRideGroupIds.includes(candidate.id)}
													onchange={(event) =>
														toggleRideGroup(candidate.id, event.currentTarget.checked)}
												/>
												<span>
													<span class="font-medium">{candidate.name}</span>
													<span class="text-surface-400 block text-xs">
														{[candidate.city, candidate.state_region].filter(Boolean).join(', ')}
													</span>
												</span>
											</label>
										{/each}
									</div>
								</div>
							{/if}

							<div>
								<p class="text-surface-100 mb-2 text-sm font-semibold">Location filter</p>
								<div class="flex flex-wrap gap-2">
									{#each ['none', 'location', 'radius'] as mode}
										<button
											class="btn btn-sm {rideFilterMode === mode
												? 'preset-filled-primary-500 text-surface-950 font-bold'
												: 'border-surface-700 bg-surface-950 text-surface-200 border'}"
											type="button"
											aria-pressed={rideFilterMode === mode}
											onclick={() => (rideFilterMode = mode)}
										>
											{mode === 'none'
												? 'No extra filter'
												: mode === 'location'
													? 'Match a place'
													: 'Within a radius'}
										</button>
									{/each}
								</div>
							</div>

							{#if rideFilterMode === 'location'}
								<label class="label text-sm">
									<span class="text-surface-200 font-semibold">Place</span>
									<input
										class="input border-surface-700 bg-surface-950 border"
										bind:value={rideLocation}
										placeholder="Phoenix"
									/>
								</label>
							{:else if rideFilterMode === 'radius'}
								<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
									<label class="label text-sm">
										<span class="text-surface-200 font-semibold">Center point</span>
										<input
											class="input border-surface-700 bg-surface-950 border"
											bind:value={rideNear}
											placeholder="Phoenix, AZ"
										/>
									</label>
									<label class="label text-sm">
										<span class="text-surface-200 font-semibold">Miles</span>
										<input
											class="input border-surface-700 bg-surface-950 border"
											type="number"
											min="1"
											max="250"
											bind:value={rideRadius}
										/>
									</label>
								</div>
							{/if}

							<div class="border-surface-700 bg-surface-950 grid gap-3 border p-4 sm:grid-cols-3">
								<label class="label text-sm">
									<span class="text-surface-200 font-semibold">Default view</span>
									<select
										class="select border-surface-700 bg-surface-900 border"
										bind:value={rideDefaultTab}
									>
										<option value="list">List</option>
										<option value="calendar">Calendar</option>
										<option value="map">Map</option>
									</select>
								</label>
								<label class="label text-sm">
									<span class="text-surface-200 font-semibold">Theme</span>
									<select
										class="select border-surface-700 bg-surface-900 border"
										bind:value={rideTheme}
									>
										<option value="auto">Match site</option>
										<option value="light">Light</option>
										<option value="dark">Dark</option>
									</select>
								</label>
								<label class="label text-sm">
									<span class="text-surface-200 font-semibold">Spacing</span>
									<select
										class="select border-surface-700 bg-surface-900 border"
										bind:value={rideDensity}
									>
										<option value="compact">Compact</option>
										<option value="comfortable">Comfortable</option>
									</select>
								</label>
								<label class="flex items-center gap-2 text-sm">
									<input class="checkbox" type="checkbox" bind:checked={rideShowFilters} />
									<span>Visitor filters</span>
								</label>
								<label class="flex items-center gap-2 text-sm">
									<input class="checkbox" type="checkbox" bind:checked={rideShowAdd} />
									<span>Add ride button</span>
								</label>
								<label class="flex items-center gap-2 text-sm">
									<input class="checkbox" type="checkbox" bind:checked={rideDifficultyColors} />
									<span>Difficulty colors</span>
								</label>
							</div>
						</div>
					{:else}
						<div
							class="border-warning-500 bg-surface-950 flex flex-wrap items-center justify-between gap-3 border-l-4 p-4"
						>
							<div>
								<p class="text-surface-50 font-bold">
									Ride calendar section is not on the homepage
								</p>
								<p class="text-surface-300 text-sm">
									Add the Ride Calendar section in Sections & Pages to configure its filters.
								</p>
							</div>
							<button
								class="btn btn-sm preset-outlined-primary-500"
								type="button"
								onclick={() => selectView('builder')}
							>
								Open Sections & Pages
							</button>
						</div>
					{/if}
				</section>
			{:else if activeView === 'address'}
				<!-- CUSTOM WEBSITE: WEB ADDRESS & CUSTOM DOMAINS -->
				<GroupSiteDomainManager
					group={liveGroupDraft}
					bind:slug={slugInput}
					currentSlug={data.micrositeSlug}
					liveUrl={data.liveUrl}
				/>
			{:else}
				<!-- CUSTOM WEBSITE: PUBLISHING & FOOTER -->
				<div class="grid gap-4 xl:grid-cols-2">
					<section
						class="border-surface-700 bg-surface-900 border-t-primary-500 grid content-start gap-4 border border-t-4 p-4 sm:p-5"
					>
						<div>
							<h3 class="text-surface-50 text-lg font-bold">Website Visibility</h3>
							<p class="text-surface-300 text-sm">
								Control whether search engines index your custom website.
							</p>
						</div>
						<label
							class="border-surface-700 bg-surface-950 flex cursor-pointer items-start gap-3 border p-4"
						>
							<input class="checkbox mt-1" type="checkbox" bind:checked={siteConfig.published} />
							<span>
								<span class="text-surface-50 block font-bold">Website is public</span>
								<span class="text-surface-300 mt-1 block text-sm">
									Included in sitemaps and open to search engines. Turn off to mark the custom
									website as noindex while drafting.
								</span>
							</span>
						</label>
					</section>

					<section
						class="border-surface-700 bg-surface-900 border-t-secondary-500 grid content-start gap-4 border border-t-4 p-4 sm:p-5"
					>
						<div>
							<h3 class="text-surface-50 text-lg font-bold">Website Footer</h3>
							<p class="text-surface-300 text-sm">
								Optional closing line displayed in the footer of every website page.
							</p>
						</div>
						<label class="label text-sm">
							<span class="text-surface-200 font-semibold">Footer note</span>
							<textarea
								class="textarea border-surface-700 bg-surface-950 border"
								rows="3"
								bind:value={siteConfig.footer_blurb}
								maxlength="180"
								placeholder="Built by local volunteers for safer, friendlier streets."></textarea>
						</label>
					</section>
				</div>

				<section
					class="border-surface-700 bg-surface-900 border-t-error-500 flex flex-wrap items-center justify-between gap-3 border border-t-4 p-4 sm:p-5"
				>
					<div>
						<h3 class="text-surface-50 text-base font-bold">Reset website customizations</h3>
						<p class="text-surface-300 text-sm">
							Restores default website sections and theme while keeping your Core Profile intact.
						</p>
					</div>
					<button
						class="btn preset-filled-error-500"
						type="submit"
						form="presence-studio-form"
						formaction="?/reset"
						onclick={(event) => {
							if (
								!window.confirm(
									'Reset every website customization? Your Core Profile stays intact.'
								)
							) {
								event.preventDefault();
							}
						}}
					>
						<IconRefresh class="h-4 w-4" /> Reset to defaults
					</button>
				</section>
			{/if}

			<!-- SINGLE PERSISTENT PUBLISH BAR (VISIBLE ACROSS ALL STUDIO VIEWS) -->
			<div
				data-testid="presence-publish-bar"
				class="border-surface-700 bg-surface-950 border-t-4 {dirty
					? 'border-t-warning-500'
					: 'border-t-primary-500'} fixed inset-x-3 bottom-3 z-30 flex flex-wrap items-center gap-3 border p-3 shadow-2xl sm:sticky sm:inset-x-auto sm:bottom-3"
			>
				<div class="mr-auto min-w-0">
					<p class="text-surface-50 text-sm font-bold">
						{dirty
							? 'Unpublished changes ready'
							: 'Directory listing & custom website are up to date'}
					</p>
					<p class="text-surface-300 text-xs">
						Saves profile details, website sections, AI drafts, and web address together.
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					{#if dirty}
						<button
							type="button"
							class="btn btn-sm border-surface-700 bg-surface-900 text-surface-200 hover:bg-surface-800 border"
							disabled={submitting}
							onclick={discardPendingChanges}
						>
							Discard changes
						</button>
					{/if}
					<button
						class="btn preset-filled-primary-500 text-surface-950 font-black"
						type="submit"
						form="presence-studio-form"
						disabled={submitting}
					>
						<IconSave class="h-4 w-4" />
						{submitting ? 'Publishing…' : 'Publish changes'}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Image Crop Modal -->
{#if cropping}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
		role="dialog"
		aria-modal="true"
		aria-label={`Crop ${cropTarget === 'logo' ? 'Logo' : 'Cover Photo'}`}
		tabindex="-1"
		onpointermove={onCropPointerMove}
		onpointerup={onCropPointerUp}
		onpointercancel={onCropPointerUp}
	>
		<div class="border-surface-700 bg-surface-900 w-full max-w-4xl border p-5">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-surface-50 text-xl font-bold">
					Crop {cropTarget === 'logo' ? 'Logo (1:1)' : 'Cover Photo (16:9)'}
				</h3>
				<button
					type="button"
					class="btn btn-sm border-surface-700 bg-surface-950 border"
					onclick={closeCropper}
				>
					Cancel
				</button>
			</div>
			<div
				bind:this={cropContainerEl}
				class="border-surface-700 bg-surface-950 relative mx-auto w-full overflow-hidden border"
				style={`max-width: 800px; aspect-ratio: ${cropTarget === 'logo' ? '1 / 1' : '16 / 9'}`}
			>
				<img
					id="presence-crop-img"
					src={cropSrc}
					alt="Crop source"
					onload={onCropImgLoad}
					onpointerdown={onCropPointerDown}
					style={`position:absolute; left:50%; top:50%; transform: translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale}); transform-origin: center center;`}
					class={cropReady ? '' : 'opacity-0'}
				/>
				{#if !cropReady}
					<div class="text-surface-300 absolute inset-0 grid place-items-center">Loading…</div>
				{/if}
				<div class="pointer-events-none absolute inset-0">
					<div class="bg-surface-50/30 absolute top-0 bottom-0 left-[33.333%] w-px"></div>
					<div class="bg-surface-50/30 absolute top-0 bottom-0 left-[66.666%] w-px"></div>
					<div class="bg-surface-50/30 absolute top-[33.333%] right-0 left-0 h-px"></div>
					<div class="bg-surface-50/30 absolute top-[66.666%] right-0 left-0 h-px"></div>
				</div>
			</div>
			<div class="mt-4 flex flex-wrap items-center gap-3">
				<label class="sr-only" for="presence-crop-zoom">Zoom</label>
				<input
					id="presence-crop-zoom"
					type="range"
					min={ZOOM_MIN}
					max={ZOOM_MAX}
					step="0.01"
					bind:value={cropScale}
					class="range flex-1"
				/>
				<button
					type="button"
					class="btn border-surface-700 bg-surface-950 border"
					onclick={() => {
						cropScale = 1;
						cropOffset = { x: 0, y: 0 };
					}}
				>
					Reset
				</button>
				<button
					type="button"
					class="btn preset-filled-primary-500 text-surface-950 font-bold"
					onclick={applyCrop}
				>
					Apply Crop
				</button>
			</div>
		</div>
	</div>
{/if}
