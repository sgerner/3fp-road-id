<script>
	import { beforeNavigate, replaceState } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import IconBadgeCheck from '@lucide/svelte/icons/badge-check';
	import IconBrush from '@lucide/svelte/icons/brush';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconEye from '@lucide/svelte/icons/eye';
	import IconGlobe from '@lucide/svelte/icons/globe-2';
	import IconLayout from '@lucide/svelte/icons/layout-grid';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconRefresh from '@lucide/svelte/icons/refresh-ccw';
	import IconSave from '@lucide/svelte/icons/save';
	import IconSettings from '@lucide/svelte/icons/settings-2';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconTrash from '@lucide/svelte/icons/trash-2';
	import IconType from '@lucide/svelte/icons/type';
	import GroupSiteAiAssistant from '$lib/components/groups/GroupSiteAiAssistant.svelte';
	import GroupSiteBlockEditor from '$lib/components/groups/GroupSiteBlockEditor.svelte';
	import GroupSiteDomainManager from '$lib/components/groups/GroupSiteDomainManager.svelte';
	import GroupSitePartnerEditor from '$lib/components/groups/GroupSitePartnerEditor.svelte';
	import GroupSitePreview from '$lib/components/groups/GroupSitePreview.svelte';
	import { mergeGroupSiteEditorConfig, toIsoDateTimeValue } from '$lib/groups/siteEditor';
	import { deriveLegacySiteVisibility } from '$lib/microsites/blocks';
	import {
		GROUP_SITE_BACKGROUND_STYLES,
		GROUP_SITE_FONT_PAIRING_OPTIONS,
		GROUP_SITE_HERO_STYLES,
		GROUP_SITE_PANEL_DENSITIES,
		GROUP_SITE_PANEL_STYLES,
		GROUP_SITE_PANEL_TONES,
		GROUP_SITE_RIDE_WIDGET_HOST_SCOPES,
		GROUP_SITE_SECTION_KEYS
	} from '$lib/microsites/config';

	let { data, form } = $props();
	const clone = (value) => JSON.parse(JSON.stringify(value));
	const baseConfig = untrack(() =>
		mergeGroupSiteEditorConfig(data.defaultSiteConfig, data.siteConfig)
	);
	let siteConfig = $state(baseConfig);
	let pageBlocks = $state(untrack(() => clone(baseConfig.page_blocks || [])));
	let sponsorSequence = 0;
	let sponsorItems = $state(
		untrack(() => {
			const items = Array.isArray(baseConfig.sponsor_items) ? baseConfig.sponsor_items : [];
			return items.map((item) => ({
				_editorId: `sponsor-${sponsorSequence++}`,
				name: String(item?.name || ''),
				text: String(item?.text || ''),
				logo: String(item?.logo || ''),
				url: String(item?.url || '')
			}));
		})
	);
	let faqItems = $state(
		untrack(() =>
			[
				{ question: baseConfig.faq_1_q || '', answer: baseConfig.faq_1_a || '' },
				{ question: baseConfig.faq_2_q || '', answer: baseConfig.faq_2_a || '' }
			].filter((item) => item.question || item.answer)
		)
	);
	let slugInput = $state(untrack(() => data.micrositeSlug || ''));
	let activeView = $state('builder');
	let showPreview = $state(false);
	let previewVersion = $state(0);
	let localNotice = $state('');
	let localError = $state('');
	let groupSearch = $state('');
	let submitting = $state(false);
	let refreshingPalette = $state(false);
	let sponsorFileRevision = $state(0);
	let sponsorFileNames = $state({});

	const initialWidget = untrack(() => baseConfig.ride_widget_config || {});
	let rideFilterMode = $state(
		untrack(() =>
			initialWidget.near || initialWidget.radiusMiles
				? 'radius'
				: initialWidget.location
					? 'location'
					: 'none'
		)
	);
	let rideLocation = $state(untrack(() => initialWidget.location || ''));
	let rideNear = $state(
		untrack(
			() =>
				initialWidget.near ||
				[data.group?.city, data.group?.state_region].filter(Boolean).join(', ')
		)
	);
	let rideRadius = $state(untrack(() => initialWidget.radiusMiles || '50'));
	let rideDefaultTab = $state(untrack(() => initialWidget.defaultTab || 'list'));
	let rideTheme = $state(untrack(() => initialWidget.theme || 'auto'));
	let rideDensity = $state(untrack(() => initialWidget.density || 'comfortable'));
	let rideShowFilters = $state(untrack(() => initialWidget.showUserFilters ?? true));
	let rideShowAdd = $state(untrack(() => initialWidget.showAddButton ?? true));
	let ridePrefixCity = $state(untrack(() => initialWidget.prefixCity ?? false));
	let rideDifficultyColors = $state(untrack(() => initialWidget.difficultyColors ?? true));
	let selectedRideGroupIds = $state(
		untrack(() =>
			Array.isArray(baseConfig.ride_widget_group_ids) ? [...baseConfig.ride_widget_group_ids] : []
		)
	);
	const announcementExpiresIso = $derived(toIsoDateTimeValue(siteConfig.announcement_expires_at));
	const aiCurrentConfig = $derived({
		...siteConfig,
		page_blocks: pageBlocks,
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

	const views = [
		{
			id: 'builder',
			label: 'Build page',
			hint: 'Add, edit, and arrange sections',
			icon: IconLayout
		},
		{
			id: 'quick',
			label: 'Details',
			hint: 'Announcements and helpful information',
			icon: IconType
		},
		{ id: 'appearance', label: 'Design', hint: 'Website colors and style', icon: IconBrush },
		{ id: 'rides', label: 'Rides', hint: 'Calendar and ride filters', icon: IconCalendar },
		{
			id: 'address',
			label: 'Web address',
			hint: 'Included address and custom domains',
			icon: IconGlobe
		},
		{ id: 'more', label: 'Settings', hint: 'Search, safety, and publishing', icon: IconSettings }
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
	const filteredGroups = $derived(
		(data.availableGroups || []).filter((candidate) =>
			`${candidate.name} ${candidate.city || ''} ${candidate.state_region || ''}`
				.toLowerCase()
				.includes(groupSearch.toLowerCase())
		)
	);
	const previewPath = $derived(`${data.previewPath || '/'}?editor=${previewVersion}`);

	function snapshot() {
		return JSON.stringify({
			siteConfig,
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
			sponsorFileRevision
		});
	}
	let savedSnapshot = $state(untrack(() => snapshot()));
	const dirty = $derived(snapshot() !== savedSnapshot);
	function syncViewFromUrl() {
		const requested = new URL(window.location.href).searchParams.get('view');
		const normalizedView = requested === 'buillder' ? 'builder' : requested;
		if (views.some((view) => view.id === normalizedView)) activeView = normalizedView;
	}

	function selectView(view) {
		activeView = view;
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('view', view);
		replaceState(url, {});
	}

	function handleViewKeydown(event, index) {
		if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const nextIndex =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? views.length - 1
					: (index + (event.key === 'ArrowRight' ? 1 : -1) + views.length) % views.length;
		selectView(views[nextIndex].id);
		document.getElementById(`site-view-${views[nextIndex].id}`)?.focus();
	}

	function addFaq() {
		if (faqItems.length < 2) faqItems = [...faqItems, { question: '', answer: '' }];
	}
	function removeFaq(index) {
		faqItems = faqItems.filter((_, candidate) => candidate !== index);
	}
	function addSponsor() {
		if (sponsorItems.length < 12)
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
					body: JSON.stringify({ config: clone(siteConfig) })
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
		siteConfig = mergeGroupSiteEditorConfig(siteConfig, nextConfig);
		pageBlocks = clone(siteConfig.page_blocks || pageBlocks);
		const visibility = deriveLegacySiteVisibility(pageBlocks, siteConfig.sections);
		siteConfig = {
			...siteConfig,
			sections: visibility.sections,
			ride_widget_enabled: visibility.ride_widget_enabled
		};
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
				? 'AI proposal applied. Review it, then publish when ready.'
				: 'Generated proposal applied. Review it, then publish when ready.';
		return true;
	}

	function updatePageBlocks(nextBlocks) {
		pageBlocks = clone(nextBlocks);
		const legacy = deriveLegacySiteVisibility(pageBlocks, siteConfig.sections);
		siteConfig = {
			...siteConfig,
			page_blocks: pageBlocks,
			sections: legacy.sections,
			ride_widget_enabled: legacy.ride_widget_enabled
		};
	}

	function updateSiteConfig(patch) {
		siteConfig = { ...siteConfig, ...patch, page_blocks: pageBlocks };
	}

	beforeNavigate(({ cancel }) => {
		if (dirty && !submitting && !confirm('Leave without publishing your website changes?'))
			cancel();
	});

	onMount(() => {
		syncViewFromUrl();
		const warn = (event) => {
			if (!dirty || submitting) return;
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', warn);
		window.addEventListener('popstate', syncViewFromUrl);
		return () => {
			window.removeEventListener('beforeunload', warn);
			window.removeEventListener('popstate', syncViewFromUrl);
		};
	});
</script>

<svelte:head><title>Website Studio | {data.group.name}</title></svelte:head>

<form
	id="site-settings-form"
	method="POST"
	action="?/save"
	enctype="multipart/form-data"
	onsubmit={() => (submitting = true)}
>
	<input type="hidden" name="microsite_slug" value={slugInput} />
	<input type="hidden" name="return_view" value={activeView} />
	<input type="hidden" name="page_blocks_json" value={JSON.stringify(pageBlocks)} />
	<input type="hidden" name="site_title" value={siteConfig.site_title || ''} />
	<input type="hidden" name="site_tagline" value={siteConfig.site_tagline || ''} />
	<input type="hidden" name="home_intro" value={siteConfig.home_intro || ''} />
	<input type="hidden" name="featured_quote" value={siteConfig.featured_quote || ''} />
	<input type="hidden" name="footer_blurb" value={siteConfig.footer_blurb || ''} />
	<input type="hidden" name="seo_description" value={siteConfig.seo_description || ''} />
	<input type="hidden" name="hero_style" value={siteConfig.hero_style || 'immersive'} />
	<input type="hidden" name="background_style" value={siteConfig.background_style || 'cinematic'} />
	<input type="hidden" name="panel_style" value={siteConfig.panel_style || 'glass'} />
	<input type="hidden" name="panel_tone" value={siteConfig.panel_tone || 'surface'} />
	<input type="hidden" name="panel_density" value={siteConfig.panel_density || 'comfortable'} />
	<input type="hidden" name="font_pairing" value={siteConfig.font_pairing || 'poster'} />
	<input type="hidden" name="theme_mode" value={siteConfig.theme_mode || 'derived'} />
	<input type="hidden" name="theme_name" value={siteConfig.theme_name || ''} />
	<input type="hidden" name="theme_primary" value={siteConfig.theme_colors?.primary || ''} />
	<input type="hidden" name="theme_secondary" value={siteConfig.theme_colors?.secondary || ''} />
	<input type="hidden" name="theme_accent" value={siteConfig.theme_colors?.accent || ''} />
	<input type="hidden" name="theme_surface" value={siteConfig.theme_colors?.surface || ''} />
	{#if siteConfig.simple_mode}<input type="hidden" name="simple_mode" value="on" />{/if}
	<input type="hidden" name="microsite_notice" value={siteConfig.microsite_notice || ''} />
	<input
		type="hidden"
		name="microsite_notice_href"
		value={siteConfig.microsite_notice_href || ''}
	/>
	<input type="hidden" name="new_rider_note" value={siteConfig.new_rider_note || ''} />
	<input type="hidden" name="meeting_instructions" value={siteConfig.meeting_instructions || ''} />
	<input type="hidden" name="faq_1_q" value={faqItems[0]?.question || ''} />
	<input type="hidden" name="faq_1_a" value={faqItems[0]?.answer || ''} />
	<input type="hidden" name="faq_2_q" value={faqItems[1]?.question || ''} />
	<input type="hidden" name="faq_2_a" value={faqItems[1]?.answer || ''} />
	<input type="hidden" name="safety_note" value={siteConfig.safety_note || ''} />
	<input type="hidden" name="sponsor_items_json" value={JSON.stringify(sponsorItems)} />
	{#each sponsorItems as sponsor, index (sponsor._editorId)}
		<input
			class="sr-only"
			id={`sponsor-file-${sponsor._editorId}`}
			type="file"
			name={`sponsor_logo_file_${index}`}
			accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
			onchange={(event) => {
				sponsorFileNames = {
					...sponsorFileNames,
					[sponsor._editorId]: event.currentTarget.files?.[0]?.name || ''
				};
				sponsorFileRevision += 1;
			}}
		/>
	{/each}
	{#if siteConfig.ride_widget_enabled}<input
			type="hidden"
			name="ride_widget_enabled"
			value="on"
		/>{/if}
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
	{#if rideDifficultyColors}<input
			type="hidden"
			name="ride_widget_difficulty_colors"
			value="on"
		/>{/if}
	<input type="hidden" name="announcement_expires_at" value={announcementExpiresIso} />
	<input type="hidden" name="ai_prompt" value={siteConfig.ai_prompt || ''} />
	<input type="hidden" name="published" value={siteConfig.published === false ? 'off' : 'on'} />
	{#each GROUP_SITE_SECTION_KEYS as section}{#if siteConfig.sections?.[section]}<input
				type="hidden"
				name={`section_${section}`}
				value="on"
			/>{/if}{/each}
</form>

<div class="mx-auto grid max-w-[1800px] gap-4 pb-28 sm:pb-10">
	<header
		class="card preset-tonal-surface grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center"
	>
		<div class="flex min-w-0 items-start gap-3">
			<span class="card preset-tonal-primary shrink-0 p-2.5"><IconGlobe class="h-6 w-6" /></span>
			<div class="min-w-0">
				<p class="text-xs font-semibold tracking-[0.16em] uppercase opacity-55">
					Public presence · Website
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<h1 class="h2">Website Studio</h1>
					{#if dirty}<span class="badge preset-tonal-warning">Unpublished changes</span>{:else}<span
							class="badge preset-tonal-success"><IconBadgeCheck class="h-3 w-3" /> Up to date</span
						>{/if}
				</div>
				<p class="mt-1 max-w-2xl text-sm opacity-70">
					Build the page with simple sections, choose a look, and publish when it feels right.
				</p>
				<a
					class="mt-1 block truncate text-sm font-medium opacity-70 hover:underline"
					href={data.liveUrl}
					target="_blank"
					rel="noreferrer">{data.liveUrl}</a
				>
			</div>
		</div>
		<div class="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
			{#if activeView !== 'builder' && activeView !== 'address'}<button
					class="btn preset-tonal-surface"
					type="button"
					onclick={() => (showPreview = !showPreview)}
					><IconEye class="h-4 w-4" /> {showPreview ? 'Hide preview' : 'Show preview'}</button
				>{/if}<a
				class="btn preset-tonal-surface col-span-2 sm:col-span-1"
				href={data.liveUrl}
				target="_blank"
				rel="noreferrer"><IconExternalLink class="h-4 w-4" /> View published site</a
			>
		</div>
	</header>

	{#if data.saved}<div class="card preset-tonal-success flex items-center gap-2 p-3" role="status">
			<IconCheck class="h-4 w-4" />
			{data.saved === 'palette'
				? 'Colors updated from your group branding.'
				: 'Website changes published.'}
		</div>{/if}
	{#if data.reset}<div class="card preset-tonal-success flex items-center gap-2 p-3" role="status">
			<IconRefresh class="h-4 w-4" /> Website reset to its generated defaults.
		</div>{/if}
	{#if localNotice}<div class="card preset-tonal-success flex items-center gap-2 p-3" role="status">
			<IconSparkles class="h-4 w-4" />
			{localNotice}
		</div>{/if}
	{#if localError}<div class="card preset-tonal-error flex items-center gap-2 p-3" role="alert">
			<IconCircleAlert class="h-4 w-4" />
			{localError}
		</div>{/if}
	{#if form?.error}<div class="card preset-tonal-error flex items-center gap-2 p-3" role="alert">
			<IconCircleAlert class="h-4 w-4" />
			{form.error}
		</div>{/if}

	<nav
		class="card preset-outlined-surface-200-800 sticky top-2 z-30 p-1.5 shadow-lg"
		aria-label="Website workspace"
	>
		<div class="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6" role="tablist">
			{#each views as view, index}{@const ViewIcon = view.icon}<button
					class="btn btn-sm min-h-12 justify-center {activeView === view.id
						? 'preset-filled-primary-500'
						: 'preset-tonal-surface'}"
					type="button"
					role="tab"
					id={`site-view-${view.id}`}
					aria-controls={`site-panel-${view.id}`}
					aria-selected={activeView === view.id}
					tabindex={activeView === view.id ? 0 : -1}
					title={view.hint}
					onkeydown={(event) => handleViewKeydown(event, index)}
					onclick={() => selectView(view.id)}><ViewIcon class="h-4 w-4" /> {view.label}</button
				>{/each}
		</div>
	</nav>

	<div
		class="grid items-start gap-4 {showPreview &&
		activeView !== 'address' &&
		activeView !== 'builder'
			? '2xl:grid-cols-[minmax(0,1fr)_minmax(34rem,0.9fr)]'
			: ''}"
	>
		<div
			class="grid min-w-0 gap-4"
			id={`site-panel-${activeView}`}
			role="tabpanel"
			aria-labelledby={`site-view-${activeView}`}
		>
			{#if activeView === 'builder'}
				<div class="card preset-tonal-primary flex flex-wrap items-center gap-3 p-4">
					<div class="mr-auto">
						<p class="font-semibold">Drag sections to arrange your homepage</p>
						<p class="text-sm opacity-65">
							Click any section to edit it. On a phone, use the Up and Down buttons.
						</p>
					</div>
					<span class="badge preset-tonal-surface">Draft preview</span>
				</div>
				<GroupSiteBlockEditor
					blocks={pageBlocks}
					config={siteConfig}
					group={data.group}
					onchange={updatePageBlocks}
					onconfigchange={updateSiteConfig}
				/>
			{:else if activeView === 'quick'}
				<details class="card preset-tonal-secondary">
					<summary class="flex cursor-pointer items-center gap-3 p-4 sm:p-5"
						><span class="card preset-tonal-secondary p-2.5"><IconSparkles class="h-5 w-5" /></span
						><span class="grow"
							><span class="block font-semibold">Improve my website with AI</span><span
								class="block text-sm opacity-65"
								>Describe the feeling and let the assistant propose the first draft.</span
							></span
						></summary
					>
					<div class="preset-divider-top p-4 sm:p-5">
						<GroupSiteAiAssistant
							groupSlug={data.group.slug}
							currentConfig={aiCurrentConfig}
							onapplied={applyAiConfig}
						/>
					</div>
				</details>
				<div class="grid gap-4 xl:grid-cols-2">
					<div class="card preset-tonal-primary grid content-start gap-3 p-4">
						<div>
							<h2 class="h4">Announcement bar</h2>
							<p class="text-sm opacity-65">Use this only for something timely.</p>
						</div>
						<label class="label"
							><span>Announcement</span><input
								class="input"
								bind:value={siteConfig.microsite_notice}
								maxlength="180"
								placeholder="Registration is open for our fall ride."
							/></label
						><label class="label"
							><span>Link <span class="opacity-50">optional</span></span><input
								class="input"
								type="url"
								bind:value={siteConfig.microsite_notice_href}
								placeholder="https://…"
							/></label
						><label class="label"
							><span>Hide after <span class="opacity-50">optional</span></span><input
								class="input"
								type="datetime-local"
								bind:value={siteConfig.announcement_expires_at}
							/></label
						>
					</div>
					<div class="card preset-tonal-surface grid content-start gap-3 p-4">
						<div>
							<h2 class="h4">New rider help</h2>
							<p class="text-sm opacity-65">Answer the questions people are often afraid to ask.</p>
						</div>
						<label class="label"
							><span>What should a new rider know?</span><textarea
								class="textarea"
								rows="3"
								bind:value={siteConfig.new_rider_note}
								maxlength="600"
							></textarea></label
						><label class="label"
							><span>Where and how do you meet?</span><textarea
								class="textarea"
								rows="3"
								bind:value={siteConfig.meeting_instructions}
								maxlength="600"
							></textarea></label
						>
					</div>
				</div>
				<div class="card preset-tonal-surface grid gap-4 p-4 sm:p-5">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2 class="h4">Frequently asked questions</h2>
							<p class="text-sm opacity-65">Two good answers are better than a giant help page.</p>
						</div>
						<button
							class="btn btn-sm preset-tonal-primary"
							type="button"
							onclick={addFaq}
							disabled={faqItems.length >= 2}><IconPlus class="h-4 w-4" /> Add question</button
						>
					</div>
					{#each faqItems as item, index}<div class="card preset-tonal-surface grid gap-3 p-3">
							<div class="flex items-center justify-between">
								<p class="text-sm font-semibold">Question {index + 1}</p>
								<button
									class="btn btn-icon btn-sm preset-tonal-error"
									type="button"
									onclick={() => removeFaq(index)}
									aria-label={`Remove question ${index + 1}`}><IconTrash class="h-4 w-4" /></button
								>
							</div>
							<input
								class="input"
								bind:value={item.question}
								maxlength="120"
								placeholder="Do I need to be an experienced rider?"
							/><textarea
								class="textarea"
								rows="3"
								bind:value={item.answer}
								maxlength="320"
								placeholder="No—new riders are welcome…"
							></textarea>
						</div>{/each}
				</div>
				<GroupSitePartnerEditor
					sponsors={sponsorItems}
					fileNames={sponsorFileNames}
					onadd={addSponsor}
					onremove={removeSponsor}
					onupdate={updateSponsor}
				/>
			{:else if activeView === 'appearance'}
				<div class="card preset-tonal-surface grid gap-5 p-4 sm:p-5">
					<div>
						<h2 class="h4">Choose your website colors</h2>
						<p class="text-sm opacity-65">
							These colors affect the public website only—not this admin dashboard.
						</p>
					</div>
					<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
						{#each sitePalettes as palette}<button
								class="card grid min-h-32 cursor-pointer content-between gap-3 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg {palette.colors
									? siteConfig.theme_mode === 'custom' &&
										Object.entries(palette.colors).every(
											([key, value]) => siteConfig.theme_colors?.[key] === value
										)
										? 'preset-outlined-primary-500'
										: 'preset-tonal-surface'
									: siteConfig.theme_mode === 'derived'
										? 'preset-outlined-primary-500'
										: 'preset-tonal-surface'}"
								type="button"
								onclick={() => applySitePalette(palette)}
							>
								<span
									><span class="font-semibold">{palette.label}</span><span
										class="mt-1 block text-xs opacity-60">{palette.description}</span
									></span
								>
								<span class="flex gap-1" aria-hidden="true">
									{#each palette.colors ? Object.values(palette.colors) : ['#D7F205', '#5665E8', '#D946EF', '#F8FAFC'] as color}<span
											class="h-6 grow"
											style:background-color={color}
										></span>{/each}
								</span>
							</button>{/each}
					</div>
					<button
						class="btn preset-tonal-secondary w-fit"
						type="button"
						onclick={refreshBrandPalette}
						disabled={refreshingPalette}
						><IconSparkles class="h-4 w-4" />
						{refreshingPalette ? 'Refreshing colors…' : 'Refresh colors from branding'}</button
					>
				</div>
				<div class="card preset-tonal-surface grid gap-4 p-4 sm:p-5">
					<div>
						<h2 class="h4">Homepage first impression</h2>
						<p class="text-sm opacity-65">
							Pick the layout that best matches the group’s personality.
						</p>
					</div>
					<div class="grid gap-2 md:grid-cols-3">
						{#each GROUP_SITE_HERO_STYLES as style}<button
								class="card min-h-28 cursor-pointer p-4 text-left {siteConfig.hero_style === style
									? 'preset-filled-primary-500'
									: 'preset-tonal-surface hover:preset-tonal-primary'}"
								type="button"
								aria-pressed={siteConfig.hero_style === style}
								onclick={() => (siteConfig.hero_style = style)}
								><span class="font-semibold">{heroLabels[style]?.[0] || style}</span><span
									class="mt-1 block text-sm opacity-65">{heroLabels[style]?.[1]}</span
								></button
							>{/each}
					</div>
				</div>
				<details class="card preset-tonal-surface">
					<summary class="cursor-pointer p-4 font-semibold">Fine-tune the design</summary>
					<div class="preset-divider-top grid gap-4 p-4 sm:grid-cols-2">
						<p class="card preset-tonal-warning p-3 text-sm sm:col-span-2 lg:hidden">
							Color presets work well on a phone. Fine typography, spacing, and panel adjustments
							are easier to compare on a larger screen.
						</p>
						<label class="label"
							><span>Background mood</span><select
								class="select"
								bind:value={siteConfig.background_style}
								>{#each GROUP_SITE_BACKGROUND_STYLES as option}<option value={option}
										>{backgroundLabels[option] || option}</option
									>{/each}</select
							></label
						><label class="label"
							><span>Content panels</span><select class="select" bind:value={siteConfig.panel_style}
								>{#each GROUP_SITE_PANEL_STYLES as option}<option value={option}
										>{panelStyleLabels[option] || option}</option
									>{/each}</select
							></label
						><label class="label"
							><span>Typography</span><select class="select" bind:value={siteConfig.font_pairing}
								>{#each GROUP_SITE_FONT_PAIRING_OPTIONS as option}<option value={option.value}
										>{option.label}</option
									>{/each}</select
							></label
						><label class="label"
							><span>Spacing</span><select class="select" bind:value={siteConfig.panel_density}
								>{#each GROUP_SITE_PANEL_DENSITIES as option}<option value={option}
										>{densityLabels[option] || option}</option
									>{/each}</select
							></label
						><label class="label"
							><span>Panel color family</span><select
								class="select"
								bind:value={siteConfig.panel_tone}
								>{#each GROUP_SITE_PANEL_TONES as option}<option value={option}
										>{toneLabels[option] || option}</option
									>{/each}</select
							></label
						>
						<div class="grid grid-cols-4 gap-2 sm:col-span-2">
							{#each ['primary', 'secondary', 'accent', 'surface'] as color}<label class="label"
									><span class="capitalize">{color}</span><input
										class="input h-12"
										type="color"
										bind:value={siteConfig.theme_colors[color]}
									/></label
								>{/each}
						</div>
					</div>
				</details>
			{:else if activeView === 'rides'}
				<div class="card preset-tonal-surface grid gap-5 p-4 sm:p-5">
					{#if pageBlocks.some((block) => block.type === 'ride_calendar')}
						<div class="card preset-tonal-primary flex items-start gap-3 p-4">
							<IconCalendar class="mt-0.5 h-5 w-5" />
							<span
								><span class="font-semibold">Ride calendar is on the page</span><span
									class="mt-1 block text-sm opacity-65"
									>These settings control which published rides visitors can browse.</span
								></span
							>
						</div>
						<div class="grid gap-4">
							<label class="label"
								><span>Section title</span><input
									class="input"
									bind:value={siteConfig.ride_widget_title}
									maxlength="120"
								/></label
							>
							<div>
								<p class="mb-2 text-sm font-semibold">Which rides should appear?</p>
								<div class="grid gap-2 sm:grid-cols-3">
									{#each GROUP_SITE_RIDE_WIDGET_HOST_SCOPES as scope}<button
											class="card cursor-pointer p-3 text-left {siteConfig.ride_widget_host_scope ===
											scope
												? 'preset-filled-primary-500'
												: 'preset-tonal-surface'}"
											type="button"
											aria-pressed={siteConfig.ride_widget_host_scope === scope}
											onclick={() => (siteConfig.ride_widget_host_scope = scope)}
											><span class="font-semibold"
												>{scope === 'group_only'
													? 'Only our rides'
													: scope === 'selected_groups'
														? 'Selected groups'
														: 'All published rides'}</span
											></button
										>{/each}
								</div>
							</div>
							{#if siteConfig.ride_widget_host_scope === 'selected_groups'}<div
									class="card preset-tonal-surface grid gap-3 p-3"
								>
									<input
										class="input"
										type="search"
										bind:value={groupSearch}
										placeholder="Search groups"
									/>
									<div class="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
										{#each filteredGroups as candidate}<label
												class="flex cursor-pointer items-start gap-2 p-2 text-sm"
												><input
													class="checkbox mt-0.5"
													type="checkbox"
													checked={selectedRideGroupIds.includes(candidate.id)}
													onchange={(event) =>
														toggleRideGroup(candidate.id, event.currentTarget.checked)}
												/><span
													><span class="font-medium">{candidate.name}</span><span
														class="block text-xs opacity-55"
														>{[candidate.city, candidate.state_region]
															.filter(Boolean)
															.join(', ')}</span
													></span
												></label
											>{/each}
									</div>
								</div>{/if}
							<div>
								<p class="mb-2 text-sm font-semibold">Location filter</p>
								<div class="flex flex-wrap gap-2">
									{#each ['none', 'location', 'radius'] as mode}<button
											class="btn btn-sm {rideFilterMode === mode
												? 'preset-filled-primary-500'
												: 'preset-tonal-surface'}"
											type="button"
											aria-pressed={rideFilterMode === mode}
											onclick={() => (rideFilterMode = mode)}
											>{mode === 'none'
												? 'No extra filter'
												: mode === 'location'
													? 'Match a place'
													: 'Within a radius'}</button
										>{/each}
								</div>
							</div>
							{#if rideFilterMode === 'location'}<label class="label"
									><span>Place</span><input
										class="input"
										bind:value={rideLocation}
										placeholder="Phoenix"
									/></label
								>{:else if rideFilterMode === 'radius'}<div
									class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]"
								>
									<label class="label"
										><span>Center point</span><input
											class="input"
											bind:value={rideNear}
											placeholder="Phoenix, AZ"
										/></label
									><label class="label"
										><span>Miles</span><input
											class="input"
											type="number"
											min="1"
											max="250"
											bind:value={rideRadius}
										/></label
									>
								</div>{/if}
							<details class="card preset-tonal-surface">
								<summary class="cursor-pointer p-3 font-semibold">Display options</summary>
								<div class="preset-divider-top grid gap-3 p-3 sm:grid-cols-3">
									<p class="card preset-tonal-warning p-3 text-sm sm:col-span-3 lg:hidden">
										Basic ride settings work on mobile. Comparing map, calendar, filters, and
										density is easier on a larger screen.
									</p>
									<label class="label"
										><span>Default view</span><select class="select" bind:value={rideDefaultTab}
											><option value="list">List</option><option value="calendar">Calendar</option
											><option value="map">Map</option></select
										></label
									><label class="label"
										><span>Theme</span><select class="select" bind:value={rideTheme}
											><option value="auto">Match site</option><option value="light">Light</option
											><option value="dark">Dark</option></select
										></label
									><label class="label"
										><span>Spacing</span><select class="select" bind:value={rideDensity}
											><option value="compact">Compact</option><option value="comfortable"
												>Comfortable</option
											></select
										></label
									><label class="flex items-center gap-2 text-sm"
										><input class="checkbox" type="checkbox" bind:checked={rideShowFilters} /> Visitor
										filters</label
									><label class="flex items-center gap-2 text-sm"
										><input class="checkbox" type="checkbox" bind:checked={rideShowAdd} /> Add ride button</label
									><label class="flex items-center gap-2 text-sm"
										><input class="checkbox" type="checkbox" bind:checked={rideDifficultyColors} /> Difficulty
										colors</label
									>
								</div>
							</details>
						</div>
					{:else}
						<div class="card preset-tonal-warning flex flex-wrap items-center gap-3 p-4">
							<div class="mr-auto">
								<p class="font-semibold">Ride calendar is not on the page</p>
								<p class="text-sm opacity-65">Add it from Build before choosing its filters.</p>
							</div>
							<button
								class="btn preset-tonal-surface"
								type="button"
								onclick={() => selectView('builder')}>Open Build</button
							>
						</div>
					{/if}
				</div>
			{:else if activeView === 'address'}
				<GroupSiteDomainManager
					group={data.group}
					bind:slug={slugInput}
					currentSlug={data.micrositeSlug}
					liveUrl={data.liveUrl}
				/>
			{:else}
				<div class="grid gap-4 xl:grid-cols-2">
					<div class="card preset-tonal-surface grid content-start gap-4 p-4 sm:p-5">
						<div>
							<h2 class="h4">Search and sharing</h2>
							<p class="text-sm opacity-65">
								Help search engines and social previews describe the site accurately.
							</p>
						</div>
						<label class="label"
							><span>Search description</span><textarea
								class="textarea"
								rows="4"
								bind:value={siteConfig.seo_description}
								maxlength="180"
							></textarea><span class="text-xs opacity-55"
								>Aim for one clear sentence, under 180 characters.</span
							></label
						><label class="label"
							><span>Footer note</span><textarea
								class="textarea"
								rows="3"
								bind:value={siteConfig.footer_blurb}
								maxlength="180"
							></textarea></label
						><label class="label"
							><span>Featured quote</span><textarea
								class="textarea"
								rows="3"
								bind:value={siteConfig.featured_quote}
								maxlength="260"
							></textarea></label
						>
					</div>
					<div class="card preset-tonal-surface grid content-start gap-4 p-4 sm:p-5">
						<div>
							<h2 class="h4">Safety and publishing</h2>
							<p class="text-sm opacity-65">Keep the page current and honest.</p>
						</div>
						<label class="label"
							><span>Safety note</span><textarea
								class="textarea"
								rows="4"
								bind:value={siteConfig.safety_note}
								maxlength="360"
							></textarea></label
						><label class="card preset-tonal-surface flex cursor-pointer items-start gap-3 p-3"
							><input
								class="checkbox mt-1"
								type="checkbox"
								bind:checked={siteConfig.simple_mode}
							/><span
								><span class="font-semibold">Keep the public site simple</span><span
									class="mt-1 block text-sm opacity-60"
									>Use a focused layout with fewer visual distractions.</span
								></span
							></label
						><label class="card preset-tonal-surface flex cursor-pointer items-start gap-3 p-3"
							><input
								class="checkbox mt-1"
								type="checkbox"
								bind:checked={siteConfig.published}
							/><span
								><span class="font-semibold">Website is public</span><span
									class="mt-1 block text-sm opacity-60"
									>Turn this off only when the site should be hidden.</span
								></span
							></label
						>
					</div>
				</div>
				<div class="card preset-tonal-error flex flex-wrap items-center justify-between gap-3 p-4">
					<div>
						<p class="font-semibold">Reset the website</p>
						<p class="text-sm opacity-65">
							Remove custom website settings and regenerate the defaults.
						</p>
					</div>
					<button
						class="btn preset-filled-error-500"
						type="submit"
						form="site-settings-form"
						formaction="?/reset"
						onclick={(event) => {
							if (!confirm('Reset every website customization? This cannot be undone.'))
								event.preventDefault();
						}}><IconRefresh class="h-4 w-4" /> Reset to defaults</button
					>
				</div>
			{/if}
			{#if activeView !== 'address'}<div
					class="card preset-tonal-surface fixed inset-x-3 bottom-3 z-30 flex flex-wrap items-center gap-2 p-3 shadow-xl sm:sticky sm:inset-x-auto"
				>
					<div class="mr-auto">
						<p class="text-sm font-semibold">
							{dirty ? 'Ready to publish' : 'Everything is published'}
						</p>
						<p class="text-xs opacity-60">Changes become public when you publish.</p>
					</div>
					<button
						class="btn preset-filled-primary-500"
						type="submit"
						form="site-settings-form"
						disabled={submitting}
						><IconSave class="h-4 w-4" /> {submitting ? 'Publishing…' : 'Publish website'}</button
					>
				</div>{/if}
		</div>
		{#if showPreview && activeView !== 'address' && activeView !== 'builder'}<aside
				class="min-w-0 2xl:sticky 2xl:top-3"
			>
				<GroupSitePreview
					src={previewPath}
					liveUrl={data.liveUrl}
					title={`${data.group.name} website preview`}
				/>
			</aside>{/if}
	</div>
</div>
