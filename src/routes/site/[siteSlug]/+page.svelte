<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import IconImage from '@lucide/svelte/icons/image';
	import IconInfo from '@lucide/svelte/icons/info';
	import IconLink from '@lucide/svelte/icons/link';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconX from '@lucide/svelte/icons/x';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';
	import { CONTACT_ICON_MAP } from '$lib/groups/contactLinks';
	import { buildRideWidgetSearchParams } from '$lib/rides/widgetConfig';
	import { fade, scale } from 'svelte/transition';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const config = $derived(site.siteConfig);
	const heroStyle = $derived(config?.hero_style || 'immersive');
	const panelStyle = $derived(config?.panel_style || 'glass');
	const panelTone = $derived(config?.panel_tone || 'surface');
	const panelDensity = $derived(config?.panel_density || 'comfortable');
	const pageStyleClass = $derived(
		`hero-mode-${heroStyle} panel-${panelStyle} tone-${panelTone} density-${panelDensity}`
	);
	const taxonomy = $derived(site.taxonomy || { audiences: [], disciplines: [], skills: [] });
	const spotlight = $derived(site.weekSpotlight || {});
	const trust = $derived(site.trust || { isClaimed: false, ownerCount: 0, lastUpdatedAt: null });
	const basePath = $derived(site.basePath || '');
	const groupPageHref = $derived(`/groups/${group.slug}`);
	const updatesHref = $derived(basePath ? `${basePath}/updates` : '/updates');
	const showNotice = $derived(Boolean(site.announcementIsActive && config.microsite_notice));
	const hasNewRiderNote = $derived(Boolean((config?.new_rider_note || '').trim()));
	const location = $derived([group?.city, group?.state_region].filter(Boolean).join(', ') || null);
	const sponsorItems = $derived.by(() => {
		if (Array.isArray(config?.sponsor_items) && config.sponsor_items.length) {
			return config.sponsor_items
				.map((item) => ({
					name: String(item?.name || '').trim(),
					text: String(item?.text || '').trim(),
					logo: String(item?.logo || '').trim(),
					url: String(item?.url || '').trim()
				}))
				.filter((item) => item.name || item.text || item.logo || item.url);
		}
		if (Array.isArray(config?.sponsor_links) && config.sponsor_links.length) {
			return config.sponsor_links
				.map((url) => String(url || '').trim())
				.filter(Boolean)
				.map((url) => ({ name: '', text: '', logo: '', url }));
		}
		return [];
	});
	const mapsHref = $derived.by(() => {
		const lat = Number(group?.latitude);
		const lng = Number(group?.longitude);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
	});
	const rideWidgetEnabled = $derived(Boolean(config?.ride_widget_enabled && (site?.widgetRides?.length || 0) > 0));
	const rideWidgetTitle = $derived((config?.ride_widget_title || 'Ride calendar').trim() || 'Ride calendar');
	const rideWidgetFramePath = $derived.by(() => {
		const baseConfig = {
			...(config?.ride_widget_config || {})
		};
		if ((config?.ride_widget_host_scope || 'group_only') === 'group_only') {
			baseConfig.organizationSlug = group?.slug || '';
		}
		const params = buildRideWidgetSearchParams(baseConfig);
		params.set('host_scope', config?.ride_widget_host_scope || 'group_only');
		if (
			(config?.ride_widget_host_scope || 'group_only') === 'selected_groups' &&
			Array.isArray(config?.ride_widget_group_ids) &&
			config.ride_widget_group_ids.length
		) {
			params.set('group_ids', config.ride_widget_group_ids.join(','));
		}
		const query = params.toString();
		return query ? `/ride/widget/frame?${query}` : '/ride/widget/frame';
	});
	function normalizeSnippet(value) {
		return String(value || '')
			.toLowerCase()
			.replace(/https?:\/\/(www\.)?/g, '')
			.replace(/[^a-z0-9\s]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}
	const normalizedDetailSnippets = $derived.by(() => {
		const values = [
			location,
			group?.service_area_description,
			group?.activity_frequency,
			group?.typical_activity_day_time,
			group?.how_to_join_instructions,
			group?.membership_info
		];
		return new Set(values.map((value) => normalizeSnippet(value)).filter(Boolean));
	});
	const aboutParagraphs = $derived.by(() => {
		const seen = new Set();
		const rows = [];
		const detailSnippets = Array.from(normalizedDetailSnippets);
		for (const paragraph of site.storyParagraphs || []) {
			const normalized = normalizeSnippet(paragraph);
			if (!normalized) continue;
			const overlapsProfileField = detailSnippets.some((detail) => {
				if (!detail) return false;
				if (normalized === detail) return true;
				// Catch minor punctuation/spacing variants and short supersets/subsets.
				if (normalized.includes(detail) || detail.includes(normalized)) {
					return Math.abs(normalized.length - detail.length) <= 24;
				}
				return false;
			});
			if (overlapsProfileField) continue;
			if (seen.has(normalized)) continue;
			seen.add(normalized);
			rows.push(paragraph);
		}
		return rows;
	});

	// Lightbox state
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	let lightboxItems = $state([]);

	// Accordion state for assets
	let expandedBuckets = $state({});
	let donateAmount = $state(25);
	let donorName = $state('');
	let donorEmail = $state('');
	let sponsorLogoFrameMode = $state({});

	// Gallery images
	const galleryImages = $derived(site.photoBucket?.image_assets?.slice(0, 6) || []);
	const donateAmountPresets = [10, 25, 50, 100];
	const shouldShowDonateForm = $derived(Boolean(site.donationEnabled));

	function formatDate(value) {
		if (!value) return 'Soon';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Soon';
		return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
	}

	function formatDateLong(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}

	function formatTime(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
	}

	function contactLabel(link) {
		if (!link?.key) return 'Link';
		if (link.key === 'website') return 'Website';
		if (link.key === 'email') return link.label || 'Email';
		if (link.key === 'phone') return link.label || 'Phone';
		return link.key.charAt(0).toUpperCase() + link.key.slice(1);
	}

	function rideLeadImage(ride) {
		return (
			ride?.imageUrls?.[0] ||
			ride?.rideDetails?.image_urls?.[0] ||
			group?.cover_photo_url ||
			site?.photoBucket?.image_assets?.[0]?.href ||
			''
		);
	}

	function openLightbox(index) {
		lightboxItems = galleryImages;
		lightboxIndex = index;
		lightboxOpen = true;
	}

	function closeLightbox() {
		lightboxOpen = false;
		lightboxItems = [];
		lightboxIndex = 0;
	}

	function previousImage() {
		if (!lightboxItems.length) return;
		lightboxIndex = lightboxIndex <= 0 ? lightboxItems.length - 1 : lightboxIndex - 1;
	}

	function nextImage() {
		if (!lightboxItems.length) return;
		lightboxIndex = lightboxIndex >= lightboxItems.length - 1 ? 0 : lightboxIndex + 1;
	}

	function handleKeydown(event) {
		if (!lightboxOpen) return;
		if (event.key === 'Escape') closeLightbox();
		if (event.key === 'ArrowLeft') previousImage();
		if (event.key === 'ArrowRight') nextImage();
	}

	// Icon for asset buckets
	function iconForBucket(bucket) {
		if (bucket.slug === 'photos') return IconImage;
		if (bucket.slug === 'links') return IconLink;
		return IconFileText;
	}

	function resourcesForBucket(bucket) {
		const links = Array.isArray(bucket?.link_assets) ? bucket.link_assets : [];
		const files = Array.isArray(bucket?.file_assets) ? bucket.file_assets : [];
		return [...links, ...files].slice(0, 6);
	}

	function isBucketExpanded(bucket) {
		const next = expandedBuckets?.[bucket.slug];
		if (typeof next === 'boolean') return next;
		return (bucket.asset_count || 0) <= 3;
	}

	function toggleBucket(bucket) {
		const open = isBucketExpanded(bucket);
		expandedBuckets = { ...expandedBuckets, [bucket.slug]: !open };
	}

	function detectSponsorLogoTone(event, index) {
		const image = event.currentTarget;
		if (!image || typeof index !== 'number') return;
		try {
			const canvas = document.createElement('canvas');
			const size = 24;
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) return;
			ctx.clearRect(0, 0, size, size);
			ctx.drawImage(image, 0, 0, size, size);
			const { data } = ctx.getImageData(0, 0, size, size);

			let luminanceTotal = 0;
			let alphaWeightTotal = 0;
			for (let i = 0; i < data.length; i += 4) {
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];
				const a = data[i + 3] / 255;
				if (a < 0.08) continue;
				const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
				luminanceTotal += luminance * a;
				alphaWeightTotal += a;
			}

			if (alphaWeightTotal <= 0) return;
			const averageLuminance = luminanceTotal / alphaWeightTotal;
			sponsorLogoFrameMode = {
				...sponsorLogoFrameMode,
				[index]: averageLuminance > 150 ? 'dark' : 'light'
			};
		} catch {
			sponsorLogoFrameMode = {
				...sponsorLogoFrameMode,
				[index]: 'auto'
			};
		}
	}

	// Filter buckets with actual assets
	const assetBucketsWithContent = $derived(
		site.assetBuckets?.filter((bucket) => {
			const count = bucket.asset_count || 0;
			return count > 0 && bucket.slug !== 'photos';
		}) || []
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{config.site_title}</title>
</svelte:head>

<div class="microsite-page {pageStyleClass} pb-16">
	<div class="microsite-content mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pt-4 md:gap-10 md:px-6 md:pt-6">
	{#if showNotice}
		<!-- ═══════════════════════════════════
       COMMUNITY NOTICE — attention banner above hero
       ═══════════════════════════════════ -->
		<section>
			<div
				class="border-warning-400-600/40 bg-warning-100-900/80 flex flex-col gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-md md:flex-row md:items-center md:justify-between md:gap-4"
			>
				<div class="flex items-start gap-3">
					<div
						class="bg-warning-500/15 text-warning-600-400 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
					>
						<IconInfo class="h-5 w-5" />
					</div>
					<div class="flex-1 pt-0.5">
						<AutoLinkText
							text={config.microsite_notice}
							className="block text-sm leading-relaxed font-medium text-surface-950-50"
							linkClass="font-semibold text-warning-700-300 underline underline-offset-2"
						/>
					</div>
				</div>
				{#if config.microsite_notice_href}
					<a
						href={config.microsite_notice_href}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-sm preset-filled-warning-500 shrink-0 gap-1.5"
					>
						<span>Details</span>
						<IconArrowRight class="h-4 w-4" />
					</a>
				{/if}
			</div>
		</section>
	{/if}

	<!-- ═══════════════════════════════════
       HERO — cinematic cover with integrated CTAs
       ═══════════════════════════════════ -->
	<section class="relative">
		{#if heroStyle === 'bold'}
			<!-- ════════════════════════════════════════════════════════
				HERO BOLD — Magazine-style diagonal split with oversized typography
				════════════════════════════════════════════════════════ -->
			<div
				class="bg-surface-950 relative aspect-[21/9] overflow-hidden rounded-3xl max-md:aspect-[16/10]"
			>
				<!-- Left diagonal panel with solid theme color -->
				<div
					class="absolute inset-0 [background:linear-gradient(105deg,color-mix(in_oklab,var(--color-primary-500)_8%,var(--color-surface-950))_0%,color-mix(in_oklab,var(--color-surface-950)_95%,transparent)_55%)] [clip-path:polygon(0_0,60%_0,45%_100%,0_100%)] max-md:[clip-path:polygon(0_0,70%_0,55%_100%,0_100%)]"
				></div>
				<div
					class="absolute inset-0 [background:linear-gradient(105deg,color-mix(in_oklab,var(--color-secondary-500)_15%,transparent)_0%,transparent_50%)] [clip-path:polygon(0_0,62%_0,47%_100%,0_100%)] max-md:[clip-path:polygon(0_0,72%_0,57%_100%,0_100%)]"
				></div>

				<!-- Image on right side -->
				<div
					class="absolute inset-0 [clip-path:polygon(55%_0,100%_0,100%_100%,40%_100%)] max-md:[clip-path:polygon(65%_0,100%_0,100%_100%,50%_100%)]"
				>
					{#if group.cover_photo_url}
						<img
							src={group.cover_photo_url}
							alt={`${group.name}`}
							class="h-full w-full object-cover"
						/>
					{:else}
						<div
							class="from-secondary-500/30 via-tertiary-500/25 to-primary-500/30 h-full w-full bg-gradient-to-br"
						></div>
					{/if}
				</div>

				<!-- Content overlay -->
				<div
					class="relative z-10 flex h-full items-end p-6 pb-[clamp(1.5rem,5vw,3rem)] pl-[clamp(1.5rem,5vw,3rem)] md:p-10 md:pb-[clamp(1.5rem,5vw,3rem)] md:pl-[clamp(1.5rem,5vw,3rem)]"
				>
					<div
						class="max-w-[600px] rounded-2xl border [border-color:color-mix(in_oklab,var(--color-surface-50)_8%,transparent)] p-[clamp(1.25rem,3vw,2rem)] [backdrop-filter:blur(12px)] [background:color-mix(in_oklab,var(--color-surface-950)_85%,transparent)] [webkit-backdrop-filter:blur(12px)] max-md:max-w-full"
					>
						<!-- Location badge -->
						{#if location}
							<div
								class="text-primary-200 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold tracking-[0.1em] uppercase [background:color-mix(in_oklab,var(--color-primary-500)_20%,transparent)]"
							>
								<IconMapPin class="h-3.5 w-3.5" />
								<span>{location}</span>
							</div>
						{:else}
							<div class="skeleton mb-3 h-4 w-32 rounded-full"></div>
						{/if}

						<!-- Logo + Title row -->
						<div class="mt-4 flex items-start gap-4 md:gap-6">
							{#if group.logo_url}
								<img
									src={group.logo_url}
									alt={`${group.name} logo`}
									class="h-14 w-14 rounded-xl object-cover shadow-xl ring-2 ring-[color-mix(in_oklab,var(--color-surface-50)_20%,transparent)] md:h-20 md:w-20"
								/>
							{:else}
								<div class="skeleton h-14 w-14 rounded-xl md:h-20 md:w-20"></div>
							{/if}
							<div class="min-w-0 flex-1">
								{#if config.site_title}
									<h1
										class="microsite-site-title text-4xl font-black tracking-tight [text-shadow:0_2px_20px_color-mix(in_oklab,black_40%,transparent)] max-md:text-[2rem] md:text-6xl lg:text-7xl"
									>
										{config.site_title}
									</h1>
								{:else}
									<div class="skeleton mb-2 h-10 w-full rounded md:h-14"></div>
									<div class="skeleton h-10 w-2/3 rounded md:h-14"></div>
								{/if}
							</div>
						</div>

						<!-- Tagline -->
						{#if config.site_tagline}
							<AutoLinkText
								text={config.site_tagline}
								className="!text-white block mt-4 max-w-xl text-base [text-shadow:0_1px_12px_color-mix(in_oklab,black_30%,transparent)] md:text-lg"
								linkClass="!text-white underline underline-offset-2"
							/>
						{:else}
							<div class="skeleton mt-4 h-4 w-full max-w-xl rounded"></div>
						{/if}

						<!-- CTAs -->
						{#if site.actions.length}
							<div class="mt-6 flex flex-wrap items-center gap-3">
								{#each site.actions as action, i}
									<a
										href={action.href}
										target={action.external ? '_blank' : undefined}
										rel={action.external ? 'noopener noreferrer' : undefined}
										class="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold transition-all duration-150 {i ===
										0
											? 'bg-primary-500 text-primary-contrast-500 shadow-lg [box-shadow:0_4px_20px_-4px_color-mix(in_oklab,var(--color-primary-500)_50%,transparent)] hover:-translate-y-0.5 hover:[box-shadow:0_8px_28px_-4px_color-mix(in_oklab,var(--color-primary-500)_60%,transparent)]'
											: 'text-surface-100 border [border-color:color-mix(in_oklab,var(--color-surface-50)_15%,transparent)] [background:color-mix(in_oklab,var(--color-surface-50)_10%,transparent)] hover:[background:color-mix(in_oklab,var(--color-surface-50)_18%,transparent)]'}"
									>
										<span>{action.label}</span>
										<IconArrowRight class="h-4 w-4" />
									</a>
								{/each}
							</div>
						{:else}
							<div class="mt-6 flex gap-3">
								<div class="skeleton h-12 w-32 rounded-full"></div>
								<div class="skeleton h-12 w-32 rounded-full"></div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else if heroStyle === 'orbit'}
			<!-- ════════════════════════════════════════════════════════
				HERO ORBIT — Modern floating glass card with ambient glow
				════════════════════════════════════════════════════════ -->
			<div
				class="bg-surface-950 relative aspect-[21/9] overflow-hidden rounded-3xl max-md:aspect-[16/11]"
			>
				{#if group.cover_photo_url}
					<img
						src={group.cover_photo_url}
						alt={`${group.name}`}
						class="absolute inset-0 h-full w-full object-cover"
					/>
				{:else}
					<div
						class="from-primary-500/25 via-surface-500/10 to-secondary-500/25 absolute inset-0 bg-gradient-to-br"
					></div>
				{/if}
				<!-- Vignette overlay -->
				<div
					class="from-surface-950/80 via-surface-950/50 to-surface-950/70 absolute inset-0 bg-gradient-to-b"
				></div>
				<!-- Subtle dot pattern -->
				<div
					class="absolute inset-0 opacity-30"
					style="background-image: radial-gradient(circle at center, color-mix(in oklab, var(--color-surface-50) 6%, transparent) 0%, transparent 1px); background-size: 32px 32px;"
				></div>

				<!-- Content -->
				<div class="relative z-10 flex h-full items-center justify-center p-5 md:p-8">
					<div class="relative w-full max-w-xl">
						<!-- Ambient glow behind card -->
						<div
							class="from-primary-500/40 via-secondary-500/30 to-tertiary-500/40 absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br opacity-60 blur-xl"
						></div>

						<!-- Glass card -->
						<div
							class="border-surface-50/10 bg-surface-950/70 relative rounded-3xl border px-6 py-8 shadow-2xl shadow-black/50 backdrop-blur-xl max-md:px-4 max-md:py-6"
						>
							<div class="flex flex-col items-center text-center">
								{#if group.logo_url}
									<img
										src={group.logo_url}
										alt={`${group.name} logo`}
										class="ring-surface-50/30 h-16 w-16 rounded-2xl object-cover shadow-2xl ring-2 md:h-20 md:w-20"
									/>
								{:else}
									<div class="skeleton h-16 w-16 rounded-2xl md:h-20 md:w-20"></div>
								{/if}

								{#if location}
									<p
										class="text-surface-50/60 mt-4 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.3em] uppercase"
									>
										<IconMapPin class="h-3 w-3" />{location}
									</p>
								{:else}
									<div class="skeleton mt-4 h-3 w-24 rounded"></div>
								{/if}

								{#if config.site_title}
									<h1
										class="microsite-site-title text-surface-50 mt-3 text-3xl font-black tracking-tight [text-shadow:0_4px_20px_color-mix(in_oklab,black_40%,transparent)] md:text-5xl"
									>
										{config.site_title}
									</h1>
								{:else}
									<div class="skeleton mt-3 h-10 w-48 rounded"></div>
								{/if}

								{#if config.site_tagline}
									<AutoLinkText
										text={config.site_tagline}
										className="mt-3 block max-w-md text-base leading-relaxed text-surface-50/80"
										linkClass="text-surface-50 underline underline-offset-2"
									/>
								{:else}
									<div class="skeleton mt-3 h-4 w-64 rounded"></div>
								{/if}
							</div>

							{#if site.actions.length}
								<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
									{#each site.actions as action, i}
										<a
											href={action.href}
											target={action.external ? '_blank' : undefined}
											rel={action.external ? 'noopener noreferrer' : undefined}
											class="btn {i === 0
												? 'preset-filled-primary-500 shadow-primary-500/25 shadow-lg'
												: 'preset-tonal-surface border-surface-50/20 border'} gap-2 px-5 py-2.5 text-sm font-bold"
										>
											{action.label}
											<IconArrowRight class="h-4 w-4" />
										</a>
									{/each}
								</div>
							{:else}
								<div class="mt-8 flex justify-center gap-3">
									<div class="skeleton h-10 w-24 rounded-full"></div>
									<div class="skeleton h-10 w-24 rounded-full"></div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="card relative aspect-[21/9] overflow-hidden rounded-3xl border-0 max-md:aspect-[16/10]">
				{#if group.cover_photo_url}
					<img
						src={group.cover_photo_url}
						alt={`${group.name}`}
						class="absolute inset-0 h-full w-full object-cover motion-safe:[animation:ken-burns_25s_ease-in-out_infinite_alternate]"
					/>
				{:else}
					<div
						class="from-primary-500/30 via-secondary-500/20 to-tertiary-500/30 absolute inset-0 bg-gradient-to-br"
					></div>
				{/if}
				<div
					class="from-surface-950 via-surface-950/60 absolute inset-0 bg-gradient-to-t to-transparent opacity-90"
				></div>
				<div
					class="from-surface-950/40 to-surface-950/20 absolute inset-0 bg-gradient-to-br via-transparent opacity-55"
				></div>
				<div class="relative z-10 flex h-full flex-col justify-end p-5 md:p-8">
					<div class="flex flex-col gap-6">
						<div class="flex items-end gap-4">
							{#if group.logo_url}
								<img
									src={group.logo_url}
									alt={`${group.name} logo`}
									class="ring-surface-50/20 h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-2xl ring-2 md:h-20 md:w-20"
								/>
							{:else}
								<div
									class="from-primary-500 to-secondary-500 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-2xl md:h-20 md:w-20"
								>
									<IconUsers class="h-7 w-7 text-white/80" />
								</div>
							{/if}
							<div class="min-w-0 pb-0.5">
								{#if location}
									<p
										class="text-surface-50/70 mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-[0.3em] uppercase"
									>
										<IconMapPin class="h-3 w-3" />{location}
									</p>
								{/if}
								<h1
									class="microsite-site-title text-3xl font-black tracking-tight md:text-4xl lg:text-5xl"
								>
									{config.site_title}
								</h1>
							</div>
						</div>
						<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
							{#if config.site_tagline}
								<AutoLinkText
									text={config.site_tagline}
									className="block text-surface-50/90 max-w-xl text-lg leading-relaxed font-medium md:text-xl"
									linkClass="text-surface-50 underline underline-offset-2"
								/>
							{/if}
							{#if site.actions.length}
								<div class="flex flex-wrap items-center gap-2 md:gap-3">
									{#each site.actions as action, i}
										<a
											href={action.href}
											target={action.external ? '_blank' : undefined}
											rel={action.external ? 'noopener noreferrer' : undefined}
											class="btn btn-sm md:btn-base {i === 0
												? 'preset-filled-primary-500'
												: 'preset-tonal-tertiary'} gap-2"
										>
											{action.label}
											<IconArrowRight class="h-4 w-4" />
										</a>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}
	</section>

	<section>
		<div class="glass-card border-surface-500/15 rounded-2xl border p-4 md:p-5">
			<div class="grid gap-4 md:grid-cols-4">
				<div class="space-y-1">
					<p class="text-primary-700-300 text-xs font-semibold tracking-[0.2em] uppercase">When</p>
					<p class="text-surface-950-50 text-sm leading-relaxed">
						{group?.activity_frequency || 'Details coming soon'}
					</p>
				</div>
				<div class="space-y-1">
					<p class="text-primary-700-300 text-xs font-semibold tracking-[0.2em] uppercase">Where</p>
					{#if mapsHref && (group?.specific_meeting_point_address || location)}
						<a
							href={mapsHref}
							target="_blank"
							rel="noopener noreferrer"
							class="text-surface-950-50 hover:text-primary-500 inline-flex items-center gap-1 text-sm leading-relaxed underline underline-offset-2 transition-colors"
						>
							{group?.specific_meeting_point_address
								? `${group.specific_meeting_point_address}${location ? `, ${location}` : ''}`
								: location}
							<IconArrowRight class="h-3.5 w-3.5 flex-shrink-0" />
						</a>
					{:else}
						<p class="text-surface-950-50 text-sm leading-relaxed">
							{group?.specific_meeting_point_address
								? `${group.specific_meeting_point_address}${location ? `, ${location}` : ''}`
								: location || 'Shared in event details'}
						</p>
					{/if}
				</div>
				<div class="space-y-1">
					<p class="text-primary-700-300 text-xs font-semibold tracking-[0.2em] uppercase">Who</p>
					<p class="text-surface-950-50 text-sm leading-relaxed">
						{taxonomy?.audiences?.[0] || group?.audience_focus || 'Anyone on two wheels'}
					</p>
				</div>
				<div class="space-y-1">
					<p class="text-primary-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
						How to join
					</p>
					<p class="text-surface-950-50 text-sm leading-relaxed">
						{group?.how_to_join_instructions || group?.membership_info || 'Follow for updates'}
					</p>
				</div>
			</div>
		</div>
	</section>

	{#if hasNewRiderNote}
		<section id="starter-note">
			<div class="glass-card border-surface-500/15 rounded-2xl border p-4 md:p-5">
				<p class="text-tertiary-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
					New rider starter note
				</p>
				<AutoLinkText
					text={config.new_rider_note}
					className="block text-surface-950-50 mt-2 text-sm leading-relaxed"
					linkClass="text-primary-700-300 underline underline-offset-2"
				/>
			</div>
		</section>
	{/if}

	{#if shouldShowDonateForm}
		<section id="donate">
			<div class="glass-card border-surface-500/15 card-interactive rounded-xl border p-5">
				<form method="GET" action="/donate">
					<input type="hidden" name="group" value={group.slug} />

					<div class="flex items-center justify-between gap-4">
						<h2 class="text-surface-950-50 text-base font-bold tracking-tight">Make a donation</h2>
						<div class="flex items-center gap-2">
							{#each donateAmountPresets as preset}
								<button
									type="button"
									class="btn {donateAmount === preset
										? 'preset-filled-primary-500'
										: 'preset-tonal-surface'} h-8 px-2.5 text-xs font-bold"
									onclick={() => (donateAmount = preset)}
								>
									${preset}
								</button>
							{/each}
						</div>
					</div>

					<div class="border-surface-500/10 mt-4 flex items-center gap-3 border-t pt-4">
						<div class="relative flex-1">
							<span
								class="text-surface-600-400 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base font-bold"
								>$</span
							>
							<input
								type="number"
								min="1"
								max="25000"
								step="1"
								name="amount"
								bind:value={donateAmount}
								class="input preset-filled-surface-50-950 h-10 w-full rounded-lg pl-7 text-base font-semibold"
								placeholder="Other"
							/>
						</div>
						<button
							type="submit"
							class="btn preset-filled-primary-500 h-10 gap-1.5 px-4 text-sm font-bold"
						>
							Donate
							<IconArrowRight class="h-3.5 w-3.5" />
						</button>
					</div>
				</form>
			</div>
		</section>
	{/if}

	<!-- ═══════════════════════════════════
		ABOUT THE GROUP — Compact profile card
		═══════════════════════════════════ -->
	{#if config.sections.story && site.storyParagraphs.length}
		<section id="about">
			<div class="glass-card border-surface-500/15 rounded-2xl border p-5 md:p-6">
				<!-- Header -->
				<div class="flex items-center gap-3">
					<div
						class="from-primary-500 to-secondary-500 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-md"
					>
						<IconInfo class="h-4 w-4 text-white" />
					</div>
					<div>
						<p class="text-secondary-700-300 text-[10px] font-semibold tracking-[0.2em] uppercase">
							About us
						</p>
						<h2 class="text-surface-950-50 text-lg font-bold tracking-tight">Who we are</h2>
					</div>
				</div>

				<!-- Quick facts grid -->
				{#if location || group.service_area_description || group.activity_frequency || group.typical_activity_day_time || group.specific_meeting_point_address || config.meeting_instructions || group.zip_code}
					{@const quickFacts = [
						{ label: 'Location', value: location },
						{ label: 'Service area', value: group.service_area_description },
						{ label: 'Rides', value: group.activity_frequency },
						{ label: 'Schedule', value: group.typical_activity_day_time },
						{
							label: 'Meet at',
							value: group.specific_meeting_point_address || config.meeting_instructions,
							href: mapsHref && group?.specific_meeting_point_address ? mapsHref : ''
						},
						{ label: 'ZIP', value: group.zip_code }
					].filter((f) => f.value)}

					{#if quickFacts.length > 0}
						<div
							class="border-surface-500/10 mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 md:grid-cols-3"
						>
							{#each quickFacts as fact}
								<div>
									<p
										class="text-primary-700-300 text-[10px] font-semibold tracking-wider uppercase"
									>
										{fact.label}
									</p>
									{#if fact.href}
										<a
											href={fact.href}
											target="_blank"
											rel="noopener noreferrer"
											class="text-surface-950-50 hover:text-primary-500 mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-sm underline underline-offset-2 transition-colors"
										>
											{fact.value}
											<IconArrowRight class="h-3.5 w-3.5 flex-shrink-0" />
										</a>
									{:else}
										<p class="text-surface-950-50 mt-0.5 truncate text-sm">
											{fact.value}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				{/if}

				<!-- Tags -->
				{#if group.group_type || group.audience_focus || group.primary_discipline || group.typical_skill_level || taxonomy.audiences?.length || taxonomy.disciplines?.length || taxonomy.skills?.length}
					<div class="border-surface-500/10 mt-4 flex flex-wrap gap-1.5 border-t pt-4">
						{#if group.group_type}
							<span class="chip preset-filled-primary-500 text-[10px] font-semibold"
								>{group.group_type}</span
							>
						{/if}
						{#if group.audience_focus}
							<span class="chip preset-filled-secondary-500 text-[10px] font-semibold"
								>{group.audience_focus}</span
							>
						{/if}
						{#if group.primary_discipline}
							<span class="chip preset-filled-tertiary-500 text-[10px] font-semibold"
								>{group.primary_discipline}</span
							>
						{/if}
						{#if group.typical_skill_level}
							<span class="chip preset-tonal-surface text-[10px] font-semibold"
								>{group.typical_skill_level}</span
							>
						{/if}
						{#each taxonomy.audiences || [] as item}
							<span class="chip preset-tonal-secondary text-[10px]">{item}</span>
						{/each}
						{#each taxonomy.disciplines || [] as item}
							<span class="chip preset-tonal-tertiary text-[10px]">{item}</span>
						{/each}
						{#each taxonomy.skills || [] as item}
							<span class="chip preset-tonal-primary text-[10px]">{item}</span>
						{/each}
					</div>
				{/if}

				<!-- Description -->
				{#if aboutParagraphs.length > 0}
					<div class="border-surface-500/10 mt-4 border-t pt-4">
						<div class="space-y-2">
							{#each aboutParagraphs.slice(0, 3) as paragraph}
								<AutoLinkText
									text={paragraph}
									className="block text-surface-950-50 text-sm leading-relaxed"
									linkClass="text-primary-700-300 underline underline-offset-2"
								/>
							{/each}
						</div>
					</div>
				{/if}

				<!-- How to Join & Contact -->
				{#if group.how_to_join_instructions || group.membership_info || group.preferred_contact_method_instructions}
					<div class="border-surface-500/10 mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
						{#if group.how_to_join_instructions}
							<div>
								<p class="text-primary-700-300 text-[10px] font-semibold tracking-wider uppercase">
									How to join
								</p>
								<AutoLinkText
									text={group.how_to_join_instructions}
									className="block text-surface-950-50 mt-0.5 text-sm"
									linkClass="text-primary-700-300 underline underline-offset-2"
								/>
							</div>
						{/if}
						{#if group.membership_info}
							<div>
								<p class="text-primary-700-300 text-[10px] font-semibold tracking-wider uppercase">
									Membership
								</p>
								<AutoLinkText
									text={group.membership_info}
									className="block text-surface-950-50 mt-0.5 text-sm"
									linkClass="text-primary-700-300 underline underline-offset-2"
								/>
							</div>
						{/if}
						{#if group.preferred_contact_method_instructions}
							<div class="md:col-span-2">
								<p class="text-primary-700-300 text-[10px] font-semibold tracking-wider uppercase">
									Contact
								</p>
								<AutoLinkText
									text={group.preferred_contact_method_instructions}
									className="block text-surface-950-50 mt-0.5 text-sm"
									linkClass="text-primary-700-300 underline underline-offset-2"
								/>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</section>
	{/if}

	{#if rideWidgetEnabled}
		<section id="rides-widget">
			<iframe
				title={`${rideWidgetTitle} widget`}
				src={rideWidgetFramePath}
				loading="lazy"
				class="h-[980px] w-full rounded-xl"
			></iframe>
		</section>
	{/if}

	<!-- ═══════════════════════════════════
		THIS WEEK — Calendar cards
		═══════════════════════════════════ -->
	{#if spotlight?.ride || spotlight?.volunteer || spotlight?.news}
		{@const thisWeekEvents = [
			spotlight?.ride ? { type: 'Ride', item: spotlight.ride, color: 'primary' } : null,
			spotlight?.volunteer
				? { type: 'Volunteer', item: spotlight.volunteer, color: 'tertiary' }
				: null,
			spotlight?.news ? { type: 'Update', item: spotlight.news, color: 'secondary' } : null
		].filter(Boolean)}

		<section>
			<div class="glass-card border-surface-500/15 rounded-2xl border p-5">
				<div class="flex items-center gap-3">
					<div
						class="from-secondary-500 to-tertiary-500 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br shadow-md"
					>
						<IconNewspaper class="h-4 w-4 text-white" />
					</div>
					<div>
						<p class="text-secondary-700-300 text-[10px] font-semibold tracking-[0.2em] uppercase">
							This week
						</p>
						<h2 class="text-surface-950-50 text-lg font-bold tracking-tight">Coming up</h2>
					</div>
				</div>

				<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each thisWeekEvents as event}
						{@const date =
							event.item.nextOccurrenceStart ||
							event.item.event_start ||
							event.item.published_at ||
							event.item.created_at}
						{@const href =
							event.type === 'Ride'
								? `/ride/${event.item.slug}`
								: event.type === 'Volunteer'
									? `/volunteer/${event.item.slug}`
									: `${updatesHref}?open=${event.item.slug}`}

						<a
							{href}
							class="card-interactive group border-surface-500/10 flex items-start gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg"
						>
							<div class="flex-shrink-0 text-center">
								<p class="text-surface-600-400 text-[10px] font-semibold uppercase">
									{date ? new Date(date).toLocaleDateString('en-US', { month: 'short' }) : 'Soon'}
								</p>
								<p class="text-surface-950-50 text-xl font-bold">
									{date ? new Date(date).getDate() : '--'}
								</p>
							</div>
							<div class="min-w-0 flex-1">
								<span class="chip preset-filled-{event.color}-500 text-[10px] font-semibold">
									{event.type}
								</span>
								<p
									class="text-surface-950-50 group-hover:text-{event.color}-500 mt-1 truncate text-sm font-semibold transition-colors"
								>
									{event.item.title}
								</p>
							</div>
						</a>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- ═══════════════════════════════════
     MAIN CONTENT GRID
     ═══════════════════════════════════ -->
	<div class="grid gap-5 md:grid-cols-[1.2fr,0.6fr]">
		<!-- LEFT COLUMN: rides · volunteer · news -->
		<div class="space-y-5">
			<!-- Upcoming Rides -->
			{#if config.sections.rides && site.rides?.length > 0}
				<section class="glass-card border-surface-500/15 rounded-2xl border p-6" id="rides">
					<div class="mb-5 flex items-start justify-between gap-4">
						<div>
							<p class="text-primary-700-300 text-xs font-semibold tracking-[0.25em] uppercase">
								Upcoming rides
							</p>
							<h2 class="text-surface-950-50 mt-2 text-2xl font-black tracking-tight">
								Ride together
							</h2>
						</div>
						<a
							href={groupPageHref}
							class="text-surface-700-300 hover:text-surface-950-50 text-sm font-semibold transition-colors"
							>Our 3FP profile →</a
						>
					</div>
					<div class="grid gap-4 md:grid-cols-2">
						{#each site.rides as ride}
							<a
								href={`/ride/${ride.slug}`}
								class="card-interactive group border-surface-500/10 block overflow-hidden rounded-xl border transition-all hover:-translate-y-1 hover:shadow-lg"
							>
								{#if rideLeadImage(ride)}
									<div class="relative aspect-[16/9] overflow-hidden">
										<img
											src={rideLeadImage(ride)}
											alt={ride.title}
											class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
											loading="lazy"
										/>
										<div
											class="from-surface-950/70 absolute inset-0 bg-gradient-to-t via-transparent to-transparent"
										></div>
										<div class="absolute right-3 bottom-3 left-3 flex flex-wrap gap-2">
											<span class="chip preset-tonal-primary text-xs font-semibold">
												{formatDate(ride.nextOccurrenceStart)}
											</span>
											{#if ride.recurrenceEnabled}
												<span class="chip preset-tonal-tertiary text-xs font-semibold">Series</span>
											{/if}
										</div>
									</div>
								{/if}
								<div class="space-y-2 p-4">
									<div class="flex items-start gap-3">
										<h3
											class="text-surface-950-50 group-hover:text-primary-500 min-w-0 flex-1 text-lg leading-snug font-bold transition-colors"
										>
											{ride.title}
										</h3>
										<IconArrowRight
											class="text-surface-600-400 group-hover:text-primary-500 mt-1 h-4 w-4 flex-shrink-0 transition-all group-hover:translate-x-1"
										/>
									</div>
									{#if ride.summary}
										<AutoLinkText
											text={ride.summary}
											className="block text-surface-700-300 line-clamp-2 text-sm leading-relaxed"
											linkClass="text-primary-700-300 underline underline-offset-2"
										/>
									{/if}
									{#if ride.startLocationName || ride.startLocationAddress}
										<div class="flex items-center gap-2 text-sm">
											<IconMapPin class="text-surface-700-300 h-3.5 w-3.5 flex-shrink-0" />
											<AutoLinkText
												text={ride.startLocationName || ride.startLocationAddress}
												className="block text-surface-700-300 truncate"
												linkClass="text-primary-700-300 underline underline-offset-2"
											/>
										</div>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Volunteer Events -->
			{#if config.sections.volunteer && site.volunteerEvents.length}
				<section class="glass-card border-surface-500/15 rounded-2xl border p-6" id="volunteer">
					<div class="mb-5 flex items-start justify-between gap-4">
						<div>
							<p class="text-tertiary-700-300 text-xs font-semibold tracking-[0.25em] uppercase">
								Volunteer
							</p>
							<h2 class="text-surface-950-50 mt-2 text-2xl font-black tracking-tight">
								Help make it happen
							</h2>
						</div>
						<a
							href={`/volunteer/groups/${group.slug}`}
							class="text-surface-700-300 hover:text-surface-950-50 text-sm font-semibold transition-colors"
							>All →</a
						>
					</div>
					<div class="space-y-3">
						{#each site.volunteerEvents as event}
							<a
								href={`/volunteer/${event.slug}`}
								class="card-interactive group border-surface-500/10 block rounded-xl border p-4 transition-all hover:-translate-y-1 hover:shadow-lg"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p
											class="text-surface-700-300 text-xs font-semibold tracking-[0.2em] uppercase"
										>
											{formatDate(event.event_start)}{formatTime(event.event_start)
												? ` · ${formatTime(event.event_start)}`
												: ''}
										</p>
										<h3
											class="text-surface-950-50 group-hover:text-tertiary-500 mt-1 font-bold transition-colors"
										>
											{event.title}
										</h3>
										{#if event.summary}
											<AutoLinkText
												text={event.summary}
												className="block text-surface-700-300 mt-1 text-sm leading-relaxed"
												linkClass="text-tertiary-700-300 underline underline-offset-2"
											/>
										{/if}
										{#if event.location_name || event.location_address}
											<AutoLinkText
												text={event.location_name || event.location_address}
												className="block text-surface-700-300 mt-1 text-xs leading-relaxed"
												linkClass="text-tertiary-700-300 underline underline-offset-2"
											/>
										{/if}
									</div>
									<IconHeartHandshake
										class="text-surface-600-400 group-hover:text-tertiary-500 mt-0.5 h-4 w-4 flex-shrink-0 transition-colors"
									/>
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<!-- News/Updates -->
			{#if config.sections.news && site.newsPosts.length}
				<section class="glass-card border-surface-500/15 rounded-2xl border p-6" id="updates">
					<div class="mb-5 flex items-start justify-between gap-4">
						<div>
							<p class="text-secondary-700-300 text-xs font-semibold tracking-[0.25em] uppercase">
								Updates
							</p>
							<h2 class="text-surface-950-50 mt-2 text-2xl font-black tracking-tight">
								Latest news
							</h2>
						</div>
						{#if site.newsPosts.length > 1}
							<a
								href={updatesHref}
								class="text-surface-700-300 hover:text-surface-950-50 text-sm font-semibold transition-colors"
								>Archive →</a
							>
						{/if}
					</div>
					<div class="space-y-3">
						{#each site.newsPosts as post}
							<a
								href={`${updatesHref}?open=${post.slug}`}
								class="card-interactive group border-surface-500/10 block rounded-xl border p-4 transition-all hover:-translate-y-1 hover:shadow-lg"
							>
								<div
									class="text-surface-700-300 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase"
								>
									<IconNewspaper class="h-3 w-3" />
									{formatDate(post.published_at || post.created_at)}
								</div>
								<h3
									class="text-surface-950-50 group-hover:text-secondary-500 mt-2 text-lg font-bold tracking-tight transition-colors"
								>
									{post.title}
								</h3>
								{#if post.preview_text}
									<AutoLinkText
										text={post.preview_text}
										className="block text-surface-700-300 mt-1 line-clamp-2 text-sm leading-relaxed"
										linkClass="text-secondary-700-300 underline underline-offset-2"
									/>
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>

		<!-- RIGHT COLUMN: gallery · assets · contact -->
		<div class="space-y-5">
			<!-- Gallery with Lightbox -->
			{#if config.sections.gallery && galleryImages.length}
				<section class="glass-card border-surface-500/15 rounded-2xl border p-6" id="gallery">
					<div class="mb-4">
						<p class="text-tertiary-700-300 text-xs font-semibold tracking-[0.25em] uppercase">
							Gallery
						</p>
						<h2 class="text-surface-950-50 mt-2 text-2xl font-black tracking-tight">
							Scenes from our rides
						</h2>
					</div>
					<div class="grid grid-cols-2 gap-2">
						{#each galleryImages as image, i}
							<button
								type="button"
								onclick={() => openLightbox(i)}
								class="gallery-item group relative overflow-hidden rounded-xl {i === 0
									? 'col-span-2 aspect-video'
									: 'aspect-square'}"
							>
								<img
									src={image.href}
									alt={image.title}
									class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
									loading="lazy"
								/>
								<div
									class="from-surface-950/60 absolute inset-0 bg-gradient-to-t via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
								></div>
								<div
									class="absolute right-0 bottom-0 left-0 translate-y-full p-3 transition-transform duration-300 group-hover:translate-y-0"
								>
									<p class="text-surface-50 truncate text-sm font-semibold">{image.title}</p>
								</div>
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Assets Section with Accordion -->
			{#if assetBucketsWithContent.length > 0}
				<section class="glass-card border-surface-500/15 rounded-2xl border p-6" id="assets">
					<div class="mb-4">
						<p class="text-primary-700-300 text-xs font-semibold tracking-[0.25em] uppercase">
							Resources
						</p>
						<h2 class="text-surface-950-50 mt-2 text-2xl font-black tracking-tight">
							Shared files
						</h2>
					</div>
					<div class="space-y-2">
						{#each assetBucketsWithContent as bucket}
							{@const BucketIcon = iconForBucket(bucket)}
							<div class="border-surface-500/15 rounded-xl border">
								<button
									type="button"
									onclick={() => toggleBucket(bucket)}
									class="hover:bg-surface-500/5 flex w-full items-center gap-3 p-3 transition-colors"
								>
									<div
										class="resource-icon-badge flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
									>
										<BucketIcon class="h-4 w-4" />
									</div>
									<div class="min-w-0 flex-1 text-left">
										<p class="text-surface-900-100 font-semibold">{bucket.name}</p>
										<p class="text-surface-700-300 text-xs">
											{bucket.asset_count}
											{bucket.asset_count === 1 ? 'item' : 'items'}
										</p>
									</div>
									<div
										class="text-surface-600-400 transition-transform duration-200"
										style="transform: rotate({isBucketExpanded(bucket) ? 180 : 0}deg)"
									>
										<IconChevronDown class="h-4 w-4" />
									</div>
								</button>
								{#if isBucketExpanded(bucket)}
									<div class="border-surface-500/10 border-t p-3">
										<div class="space-y-2">
											{#each resourcesForBucket(bucket) as asset}
												<a
													href={asset.href}
													target="_blank"
													rel="noopener noreferrer"
													class="hover:bg-surface-500/5 flex items-center gap-3 rounded-lg p-2 transition-colors"
												>
													<div
														class="resource-item-icon flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
													>
														{#if asset.isLink}
															<IconLink class="h-4 w-4" />
														{:else}
															<IconFileText class="h-4 w-4" />
														{/if}
													</div>
													<div class="min-w-0 flex-1">
														<p class="text-surface-950-50 truncate text-sm font-medium">
															{asset.title}
														</p>
														{#if asset.description}
															<AutoLinkText
																text={asset.description}
																className="block text-surface-700-300 truncate text-xs"
																linkClass="text-primary-700-300 underline underline-offset-2"
															/>
														{:else if asset.sizeLabel || asset.createdLabel}
															<p class="text-surface-700-300 truncate text-xs">
																{asset.sizeLabel}{asset.sizeLabel && asset.createdLabel
																	? ' · '
																	: ''}{asset.createdLabel}
															</p>
														{/if}
													</div>
												</a>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Contact Links -->
			{#if config.sections.contact && site.contactLinks.length}
				<section class="glass-card border-surface-500/15 rounded-2xl border p-6" id="contact">
					<div class="mb-4">
						<p class="text-secondary-700-300 text-xs font-semibold tracking-[0.25em] uppercase">
							Contact
						</p>
						<h2 class="text-surface-950-50 mt-2 text-2xl font-black tracking-tight">
							Find the right link fast
						</h2>
					</div>
					<div class="space-y-2">
						{#each site.contactLinks as link}
							{@const ContactIcon = CONTACT_ICON_MAP[link.key] || IconMapPin}
							<a
								href={link.href}
								target={/^https?:\/\//i.test(link.href) ? '_blank' : undefined}
								rel={/^https?:\/\//i.test(link.href) ? 'noopener noreferrer' : undefined}
								class="contact-link group hover:bg-surface-500/10 flex items-center gap-3 rounded-xl p-3 transition-all"
							>
								<div
									class="contact-icon-badge flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-all group-hover:scale-110"
								>
									<ContactIcon class="h-4 w-4" />
								</div>
								<div class="min-w-0">
									<p class="text-surface-900-100 font-semibold">{contactLabel(link)}</p>
									<p class="text-surface-700-300 truncate text-xs">
										{link.href.replace(/^mailto:/, '').replace(/^tel:/, '')}
									</p>
								</div>
								<IconArrowRight
									class="text-surface-600-400 group-hover:text-primary-500 ml-auto h-4 w-4 flex-shrink-0 transition-all group-hover:translate-x-1"
								/>
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</div>

	{#if config.faq_1_q || config.faq_1_a || config.faq_2_q || config.faq_2_a || sponsorItems.length}
		<section>
			<div class="space-y-4">
				{#if config.faq_1_q || config.faq_1_a || config.faq_2_q || config.faq_2_a}
					<div class="glass-card border-surface-500/15 rounded-2xl border p-5">
						<p class="text-secondary-700-300 text-xs font-semibold tracking-[0.22em] uppercase">
							FAQ
						</p>
						<div class="mt-3 space-y-3">
							{#if config.faq_1_q || config.faq_1_a}
								<div>
									{#if config.faq_1_q}
										<p class="text-surface-950-50 font-semibold">{config.faq_1_q}</p>
									{:else}
										<p class="text-surface-950-50 font-semibold">FAQ 1</p>
									{/if}
									{#if config.faq_1_a}
										<AutoLinkText
											text={config.faq_1_a}
											className="block text-surface-800-200 mt-1 text-sm leading-relaxed"
											linkClass="text-primary-700-300 underline underline-offset-2"
										/>
									{/if}
								</div>
							{/if}
							{#if config.faq_2_q || config.faq_2_a}
								<div>
									{#if config.faq_2_q}
										<p class="text-surface-950-50 font-semibold">{config.faq_2_q}</p>
									{:else}
										<p class="text-surface-950-50 font-semibold">FAQ 2</p>
									{/if}
									{#if config.faq_2_a}
										<AutoLinkText
											text={config.faq_2_a}
											className="block text-surface-800-200 mt-1 text-sm leading-relaxed"
											linkClass="text-primary-700-300 underline underline-offset-2"
										/>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/if}
				{#if sponsorItems.length}
					<div class="sponsor-showcase rounded-2xl border p-5">
						<p class="text-tertiary-700-300 text-xs font-semibold tracking-[0.22em] uppercase">
							Community partners
						</p>
						<h3 class="text-surface-950-50 mt-2 text-lg font-black tracking-tight">
							Thanks to our partners
						</h3>
						<div class="mt-4 sponsor-list">
							{#each sponsorItems as sponsor, sponsorIndex}
								{#if sponsor.url}
									<a
										href={sponsor.url}
										target="_blank"
										rel="noopener noreferrer"
										class="sponsor-card group block rounded-xl border p-3 transition-colors"
									>
										<div class="flex items-start gap-3">
											{#if sponsor.logo}
												<div
													class={`sponsor-logo-frame ${sponsorLogoFrameMode[sponsorIndex] === 'dark'
														? 'logo-bg-dark'
														: sponsorLogoFrameMode[sponsorIndex] === 'light'
															? 'logo-bg-light'
															: 'logo-bg-auto'}`}
												>
													<img
														src={sponsor.logo}
														alt={(sponsor.name || 'Sponsor') + ' logo'}
														class="sponsor-logo-image"
														crossorigin="anonymous"
														onload={(event) => detectSponsorLogoTone(event, sponsorIndex)}
													/>
												</div>
											{/if}
											<div class="min-w-0">
												<p class="text-surface-950-50 truncate text-base font-bold">
													{sponsor.name || sponsor.url || 'Sponsor'}
												</p>
												{#if sponsor.text}
													<p
														class="text-surface-700-300 mt-0.5 line-clamp-2 text-sm leading-relaxed"
													>
														{sponsor.text}
													</p>
												{/if}
											</div>
											<IconArrowRight
												class="text-surface-600-400 group-hover:text-primary-500 mt-1 ml-auto h-4 w-4 flex-shrink-0 transition-all group-hover:translate-x-1"
											/>
										</div>
									</a>
								{:else}
									<div class="sponsor-card rounded-xl border p-3">
										<div class="flex items-start gap-3">
											{#if sponsor.logo}
												<div
													class={`sponsor-logo-frame ${sponsorLogoFrameMode[sponsorIndex] === 'dark'
														? 'logo-bg-dark'
														: sponsorLogoFrameMode[sponsorIndex] === 'light'
															? 'logo-bg-light'
															: 'logo-bg-auto'}`}
												>
													<img
														src={sponsor.logo}
														alt={(sponsor.name || 'Sponsor') + ' logo'}
														class="sponsor-logo-image"
														crossorigin="anonymous"
														onload={(event) => detectSponsorLogoTone(event, sponsorIndex)}
													/>
												</div>
											{/if}
											<div class="min-w-0">
												<p class="text-surface-950-50 truncate text-base font-bold">
													{sponsor.name || 'Sponsor'}
												</p>
												{#if sponsor.text}
													<p
														class="text-surface-700-300 mt-0.5 line-clamp-2 text-sm leading-relaxed"
													>
														{sponsor.text}
													</p>
												{/if}
											</div>
										</div>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<footer class="border-surface-500/15 mt-2 border-t pt-4 text-center">
		{#if config.footer_blurb}
			<AutoLinkText
				text={config.footer_blurb}
				className="text-surface-700-300 mx-auto block max-w-3xl text-sm leading-relaxed"
				linkClass="text-primary-700-300 underline underline-offset-2"
			/>
		{/if}
		<p class="text-surface-600-400 mt-2 text-xs font-semibold">
			Powered by
			<a
				href="https://3fp.org"
				target="_blank"
				rel="noopener noreferrer"
				class="text-primary-700-300 hover:text-primary-500 underline underline-offset-2 transition-colors"
			>
				3fp.org
			</a>
		</p>
	</footer>
</div>
</div>

<!-- Lightbox Modal -->
{#if lightboxOpen && lightboxItems.length}
	<div
		class="lightbox-backdrop"
		role="dialog"
		tabindex="0"
		aria-modal="true"
		aria-label={lightboxItems[lightboxIndex]?.title}
		onclick={(event) => {
			if (event.target === event.currentTarget) closeLightbox();
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') closeLightbox();
			if (event.key === 'ArrowLeft') previousImage();
			if (event.key === 'ArrowRight') nextImage();
		}}
		transition:fade={{ duration: 140 }}
	>
		<div class="lightbox-panel" transition:scale={{ start: 0.98, duration: 160 }}>
			<div class="lightbox-toolbar">
				<div class="lightbox-counter">
					{lightboxIndex + 1} <span class="text-surface-50/40">/</span>
					{lightboxItems.length}
				</div>
				<button
					type="button"
					class="lightbox-close"
					onclick={closeLightbox}
					aria-label="Close lightbox"
				>
					<IconX class="h-5 w-5" />
				</button>
			</div>

			<div class="lightbox-stage">
				<img
					src={lightboxItems[lightboxIndex]?.href}
					alt={lightboxItems[lightboxIndex]?.title}
					class="lightbox-image"
				/>
				{#if lightboxItems.length > 1}
					<button
						type="button"
						class="lightbox-nav lightbox-nav-left"
						onclick={previousImage}
						aria-label="Previous image"
					>
						<IconChevronLeft class="h-5 w-5" />
					</button>
					<button
						type="button"
						class="lightbox-nav lightbox-nav-right"
						onclick={nextImage}
						aria-label="Next image"
					>
						<IconChevronRight class="h-5 w-5" />
					</button>
				{/if}
			</div>

			{#if lightboxItems.length > 1}
				<div class="lightbox-thumbnails">
					{#each lightboxItems as asset, index}
						<button
							type="button"
							class="thumbnail {index === lightboxIndex ? 'active' : ''}"
							onclick={() => (lightboxIndex = index)}
							aria-label={`View image ${index + 1}`}
						>
							<img src={asset.href} alt={asset.title} />
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.microsite-site-title {
		color: var(--color-primary-50) !important;
	}

	@keyframes orbit-glow {
		0% {
			opacity: 0.3;
			transform: scale(0.98);
		}
		100% {
			opacity: 0.5;
			transform: scale(1.02);
		}
	}

	@keyframes ken-burns {
		0% {
			transform: scale(1) translate(0, 0);
		}
		100% {
			transform: scale(1.08) translate(-1%, -1%);
		}
	}

	.microsite-page {
		--panel-tint: var(--color-surface-500);
		--panel-blur: 20px;
		--panel-bg: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		--panel-bg-dark: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		--panel-border: color-mix(in oklab, var(--color-surface-500) 16%, transparent);
		--panel-interactive-bg: color-mix(in oklab, var(--color-surface-50) 54%, transparent);
		--panel-interactive-bg-dark: color-mix(in oklab, var(--color-surface-950) 54%, transparent);
	}

	.microsite-page.tone-primary {
		--panel-tint: var(--color-primary-500);
	}

	.microsite-page.tone-secondary {
		--panel-tint: var(--color-secondary-500);
	}

	.microsite-page.tone-tertiary {
		--panel-tint: var(--color-tertiary-500);
	}

	.microsite-page.panel-glass {
		--panel-bg: color-mix(
			in oklab,
			var(--panel-tint) 9%,
			color-mix(in oklab, var(--color-surface-50) 68%, transparent)
		);
		--panel-bg-dark: color-mix(
			in oklab,
			var(--panel-tint) 11%,
			color-mix(in oklab, var(--color-surface-950) 68%, transparent)
		);
		--panel-interactive-bg: color-mix(
			in oklab,
			var(--panel-tint) 10%,
			color-mix(in oklab, var(--color-surface-50) 50%, transparent)
		);
		--panel-interactive-bg-dark: color-mix(
			in oklab,
			var(--panel-tint) 12%,
			color-mix(in oklab, var(--color-surface-950) 50%, transparent)
		);
		--panel-border: color-mix(in oklab, var(--panel-tint) 26%, transparent);
	}

	.microsite-page.panel-filled {
		--panel-bg: color-mix(in oklab, var(--panel-tint) 18%, var(--color-surface-50));
		--panel-bg-dark: color-mix(in oklab, var(--panel-tint) 22%, var(--color-surface-900));
		--panel-interactive-bg: color-mix(in oklab, var(--panel-tint) 24%, var(--color-surface-50));
		--panel-interactive-bg-dark: color-mix(
			in oklab,
			var(--panel-tint) 28%,
			var(--color-surface-900)
		);
		--panel-border: color-mix(in oklab, var(--panel-tint) 34%, transparent);
		--panel-blur: 0px;
	}

	.microsite-page.panel-outlined {
		--panel-bg: color-mix(in oklab, var(--color-surface-50) 38%, transparent);
		--panel-bg-dark: color-mix(in oklab, var(--color-surface-950) 36%, transparent);
		--panel-interactive-bg: color-mix(in oklab, var(--color-surface-50) 30%, transparent);
		--panel-interactive-bg-dark: color-mix(in oklab, var(--color-surface-950) 30%, transparent);
		--panel-border: color-mix(in oklab, var(--panel-tint) 42%, transparent);
		--panel-blur: 8px;
	}

	.microsite-page .glass-card {
		background: var(--panel-bg);
		border-color: var(--panel-border) !important;
		backdrop-filter: blur(var(--panel-blur));
		-webkit-backdrop-filter: blur(var(--panel-blur));
	}

	:global([data-color-mode='dark']) .microsite-page .glass-card {
		background: var(--panel-bg-dark);
	}

	/* Accent cards with subtle tint */
	.glass-card-accent {
		background: color-mix(in oklab, var(--color-surface-50) 80%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	:global([data-color-mode='dark']) .glass-card-accent {
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
	}

	.glass-card-accent-primary {
		border-color: color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		background: color-mix(
			in oklab,
			var(--color-primary-500) 8%,
			color-mix(in oklab, var(--color-surface-50) 72%, transparent)
		);
	}

	:global([data-color-mode='dark']) .glass-card-accent-primary {
		background: color-mix(
			in oklab,
			var(--color-primary-500) 12%,
			color-mix(in oklab, var(--color-surface-950) 68%, transparent)
		);
	}

	/* Interactive card hover effects */
	.microsite-page .card-interactive {
		background: var(--panel-interactive-bg);
		backdrop-filter: blur(10px);
		border-color: color-mix(in oklab, var(--panel-border) 90%, transparent);
	}

	:global([data-color-mode='dark']) .microsite-page .card-interactive {
		background: var(--panel-interactive-bg-dark);
	}

	.sponsor-showcase {
		border-color: color-mix(in oklab, var(--color-tertiary-500) 34%, transparent);
		background:
			linear-gradient(
				135deg,
				color-mix(in oklab, var(--color-tertiary-500) 11%, transparent) 0%,
				color-mix(in oklab, var(--color-primary-500) 8%, transparent) 40%,
				color-mix(in oklab, var(--color-secondary-500) 7%, transparent) 100%
			),
			var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		-webkit-backdrop-filter: blur(var(--panel-blur));
	}

	:global([data-color-mode='dark']) .sponsor-showcase {
		background:
			linear-gradient(
				135deg,
				color-mix(in oklab, var(--color-tertiary-500) 14%, transparent) 0%,
				color-mix(in oklab, var(--color-primary-500) 10%, transparent) 40%,
				color-mix(in oklab, var(--color-secondary-500) 10%, transparent) 100%
			),
			var(--panel-bg-dark);
	}

	.sponsor-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.sponsor-card {
		flex: 1 1 16rem;
		max-width: 25rem;
		min-width: 14rem;
		background: var(--panel-interactive-bg);
		border-color: color-mix(in oklab, var(--panel-border) 88%, transparent);
	}

	:global([data-color-mode='dark']) .sponsor-card {
		background: var(--panel-interactive-bg-dark);
	}

	.sponsor-logo-frame {
		display: flex;
		height: 2.8rem;
		width: 2.8rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 0.65rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 42%, transparent);
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--color-surface-50) 55%, transparent),
			0 1px 3px rgb(0 0 0 / 0.12);
	}

	.sponsor-logo-frame.logo-bg-light {
		background: color-mix(in oklab, var(--color-surface-50) 88%, var(--color-primary-500) 12%);
	}

	.sponsor-logo-frame.logo-bg-dark {
		background: color-mix(in oklab, var(--color-surface-950) 85%, var(--color-surface-50) 15%);
	}

	.sponsor-logo-frame.logo-bg-auto {
		background: color-mix(in oklab, var(--color-surface-500) 28%, transparent);
	}

	:global([data-color-mode='dark']) .sponsor-logo-frame {
		border-color: color-mix(in oklab, var(--color-surface-50) 24%, transparent);
		box-shadow:
			inset 0 0 0 1px color-mix(in oklab, var(--color-surface-50) 12%, transparent),
			0 1px 4px rgb(0 0 0 / 0.35);
	}

	:global([data-color-mode='dark']) .sponsor-logo-frame.logo-bg-light {
		background: color-mix(in oklab, var(--color-surface-50) 90%, var(--color-surface-950) 10%);
	}

	:global([data-color-mode='dark']) .sponsor-logo-frame.logo-bg-dark {
		background: color-mix(in oklab, var(--color-surface-950) 88%, var(--color-surface-50) 12%);
	}

	.sponsor-logo-image {
		max-height: 2.1rem;
		max-width: 2.1rem;
		object-fit: contain;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.18));
	}

	.microsite-page.density-compact .glass-card {
		padding: 1rem !important;
	}

	.microsite-page.density-airy .glass-card {
		padding: 1.75rem !important;
	}

	/* Contact link hover */
	.contact-link:hover {
		background: color-mix(in oklab, var(--color-surface-500) 8%, transparent);
	}

	.resource-icon-badge {
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: var(--color-primary-700);
	}

	:global([data-color-mode='dark']) .resource-icon-badge {
		background: color-mix(in oklab, var(--color-primary-500) 24%, transparent);
		color: var(--color-primary-200);
	}

	.resource-item-icon {
		background: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		color: var(--color-surface-800);
	}

	:global([data-color-mode='dark']) .resource-item-icon {
		background: color-mix(in oklab, var(--color-surface-500) 18%, transparent);
		color: var(--color-surface-200);
	}

	.contact-icon-badge {
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: var(--color-primary-700);
	}

	:global([data-color-mode='dark']) .contact-icon-badge {
		background: color-mix(in oklab, var(--color-primary-500) 24%, transparent);
		color: var(--color-primary-200);
	}

	.contact-link:hover .contact-icon-badge {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}

	/* Gallery item effects */
	.gallery-item {
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
	}

	/* Section fade-in animation */
	.microsite-content > section,
	.microsite-content > div {
		animation: fade-in-up 0.6s ease-out forwards;
		opacity: 0;
		transform: translateY(20px);
	}

	.microsite-content > section:nth-child(1) {
		animation-delay: 0.1s;
	}
	.microsite-content > section:nth-child(2) {
		animation-delay: 0.2s;
	}
	.microsite-content > section:nth-child(3) {
		animation-delay: 0.3s;
	}
	.microsite-content > div {
		animation-delay: 0.4s;
	}

	@keyframes fade-in-up {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Lightbox styles */
	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20000;
		background: color-mix(in oklab, var(--color-surface-950) 95%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		padding: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.lightbox-panel {
		position: relative;
		max-width: 90vw;
		max-height: 90vh;
		width: 100%;
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		border-radius: 1rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.lightbox-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
	}

	.lightbox-counter {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-50);
	}

	.lightbox-close {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: 0.5rem;
		color: var(--color-surface-50);
		transition: background-color 0.15s ease;
	}

	.lightbox-close:hover {
		background: color-mix(in oklab, var(--color-surface-50) 10%, transparent);
	}

	.lightbox-stage {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		padding: 1rem;
	}

	.lightbox-image {
		max-width: 100%;
		max-height: 70vh;
		object-fit: contain;
		border-radius: 0.5rem;
	}

	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
		color: var(--color-surface-50);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 15%, transparent);
		transition: all 0.15s ease;
		opacity: 0.7;
	}

	.lightbox-nav:hover {
		opacity: 1;
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
	}

	.lightbox-nav-left {
		left: 1rem;
	}

	.lightbox-nav-right {
		right: 1rem;
	}

	.lightbox-thumbnails {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		overflow-x: auto;
		border-top: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
	}

	.lightbox-thumbnails::-webkit-scrollbar {
		height: 4px;
	}

	.lightbox-thumbnails::-webkit-scrollbar-track {
		background: transparent;
	}

	.lightbox-thumbnails::-webkit-scrollbar-thumb {
		background: color-mix(in oklab, var(--color-surface-50) 30%, transparent);
		border-radius: 2px;
	}

	.lightbox-thumbnails .thumbnail {
		flex-shrink: 0;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.375rem;
		overflow: hidden;
		border: 2px solid transparent;
		transition: all 0.15s ease;
		opacity: 0.6;
	}

	.lightbox-thumbnails .thumbnail:hover,
	.lightbox-thumbnails .thumbnail.active {
		opacity: 1;
		border-color: var(--color-primary-500);
	}

	.lightbox-thumbnails .thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* About card with gradient background */
	.about-card {
		position: relative;
		background: color-mix(in oklab, var(--color-surface-50) 75%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	:global([data-color-mode='dark']) .about-card {
		background: color-mix(in oklab, var(--color-surface-950) 75%, transparent);
	}

	.about-gradient {
		background:
			radial-gradient(
				50% 50% at 10% 20%,
				color-mix(in oklab, var(--color-primary-500) 15%, transparent),
				transparent 70%
			),
			radial-gradient(
				40% 40% at 90% 80%,
				color-mix(in oklab, var(--color-secondary-500) 12%, transparent),
				transparent 70%
			);
	}

	/* Gallery item styling */
	.gallery-item {
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		cursor: pointer;
	}
</style>
