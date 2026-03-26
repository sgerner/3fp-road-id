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
	import { fade, scale } from 'svelte/transition';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const config = $derived(site.siteConfig);
	const taxonomy = $derived(site.taxonomy || { audiences: [], disciplines: [], skills: [] });
	const spotlight = $derived(site.weekSpotlight || {});
	const trust = $derived(site.trust || { isClaimed: false, ownerCount: 0, lastUpdatedAt: null });
	const basePath = $derived(site.basePath || '');
	const groupPageHref = $derived(`/groups/${group.slug}`);
	const updatesHref = $derived(basePath ? `${basePath}/updates` : '/updates');
	const showNotice = $derived(Boolean(site.announcementIsActive && config.microsite_notice));
	const location = $derived(
		[group?.city, group?.state_region].filter(Boolean).join(', ') || null
	);
	const mapsHref = $derived.by(() => {
		const lat = Number(group?.latitude);
		const lng = Number(group?.longitude);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
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

<div class="microsite-page pb-16">
	<!-- ═══════════════════════════════════
     HERO — cinematic cover with integrated CTAs
     ═══════════════════════════════════ -->
	<section class="relative mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
		<div class="hero-card card relative overflow-hidden border-0">
			{#if group.cover_photo_url}
				<img
					src={group.cover_photo_url}
					alt={`${group.name}`}
					class="hero-image absolute inset-0 h-full w-full object-cover"
				/>
			{:else}
				<div
					class="from-primary-500/30 via-secondary-500/20 to-tertiary-500/30 absolute inset-0 bg-gradient-to-br"
				></div>
			{/if}

			<!-- Multi-layer gradient scrim for depth -->
			<div
				class="from-surface-950 via-surface-950/60 absolute inset-0 bg-gradient-to-t to-transparent"
			></div>
			<div
				class="from-surface-950/40 to-surface-950/20 absolute inset-0 bg-gradient-to-br via-transparent"
			></div>

			<!-- Content container -->
			<div class="relative z-10 flex h-full flex-col justify-end p-5 md:p-8">
				<div class="flex flex-col gap-6">
					<!-- Top row: Logo and title -->
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

					<!-- Bottom row: Tagline and CTAs -->
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
	</section>

	{#if showNotice}
		<section class="mx-auto max-w-7xl px-4 pt-4 md:px-6 md:pt-5">
			<div class="glass-card border-primary-500/25 rounded-2xl border p-4">
				<p class="text-primary-700-300 text-xs font-semibold tracking-[0.22em] uppercase">
					Community notice
				</p>
				<div class="mt-1 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
					<AutoLinkText
						text={config.microsite_notice}
						className="block text-surface-950-50 text-sm leading-relaxed"
						linkClass="text-primary-700-300 underline underline-offset-2"
					/>
					{#if config.microsite_notice_href}
						<a
							href={config.microsite_notice_href}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-xs preset-tonal-primary gap-1"
						>
							Details
							<IconArrowRight class="h-3.5 w-3.5" />
						</a>
					{/if}
				</div>
			</div>
		</section>
	{/if}

	<section class="mx-auto max-w-7xl px-4 pt-4 md:px-6 md:pt-5">
		<div class="glass-card border-surface-500/15 rounded-2xl border p-4 md:p-5">
			<div class="grid gap-4 md:grid-cols-4">
				<div class="space-y-1">
					<p class="text-primary-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
						When
					</p>
					<p class="text-surface-950-50 text-sm leading-relaxed">
						{group?.activity_frequency || 'Details coming soon'}
					</p>
				</div>
					<div class="space-y-1">
						<p class="text-primary-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
							Where
						</p>
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
					<p class="text-primary-700-300 text-xs font-semibold tracking-[0.2em] uppercase">
						Who
					</p>
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

	{#if shouldShowDonateForm}
		<section class="mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8" id="donate">
			<div class="glass-card border-primary-500/20 rounded-2xl border p-5 md:p-6">
				<div class="flex items-center gap-3">
					<div
						class="from-primary-500 to-secondary-500 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br shadow-md"
					>
						<IconHeartHandshake class="h-4 w-4 text-white" />
					</div>
					<div>
						<p class="text-secondary-700-300 text-[10px] font-semibold tracking-[0.2em] uppercase">
							Support us
						</p>
						<h2 class="text-surface-950-50 text-lg font-bold tracking-tight">Make a donation</h2>
					</div>
				</div>

				<form method="GET" action="/donate" class="mt-4">
					<input type="hidden" name="group" value={group.slug} />

					<div class="space-y-4">
						<div class="grid grid-cols-4 gap-2">
							{#each donateAmountPresets as preset}
								<button
									type="button"
									class="btn {donateAmount === preset
										? 'preset-filled-primary-500 shadow-primary-500/25 shadow-md'
										: 'preset-tonal-surface hover:preset-filled-primary-500/80'} h-11 text-sm font-bold transition-all duration-150"
									onclick={() => (donateAmount = preset)}
								>
									${preset}
								</button>
							{/each}
						</div>

						<div class="relative">
							<span
								class="text-surface-950-50 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg font-bold"
								>$</span
							>
							<input
								type="number"
								min="1"
								max="25000"
								step="1"
								name="amount"
								bind:value={donateAmount}
								class="input preset-filled-surface-50-950 border-surface-500/20 focus:border-primary-500 h-11 w-full rounded-lg border pr-3 pl-8 text-base font-semibold transition-colors"
								placeholder="Other amount"
							/>
						</div>

						<div class="grid gap-3 md:grid-cols-2">
							<label class="space-y-1">
								<span
									class="text-surface-700-300 text-[10px] font-semibold tracking-wider uppercase"
								>
									Name <span class="font-normal opacity-60">(optional)</span>
								</span>
								<input
									type="text"
									name="name"
									maxlength="120"
									bind:value={donorName}
									class="input preset-filled-surface-50-950 border-surface-500/20 focus:border-primary-500 h-10 w-full rounded-lg border text-sm transition-colors"
									placeholder="Your name"
								/>
							</label>
							<label class="space-y-1">
								<span
									class="text-surface-700-300 text-[10px] font-semibold tracking-wider uppercase"
								>
									Email <span class="font-normal opacity-60">(optional)</span>
								</span>
								<input
									type="email"
									name="email"
									maxlength="254"
									bind:value={donorEmail}
									class="input preset-filled-surface-50-950 border-surface-500/20 focus:border-primary-500 h-10 w-full rounded-lg border text-sm transition-colors"
									placeholder="you@example.com"
								/>
							</label>
						</div>

						<button
							type="submit"
							class="btn preset-filled-primary-500 shadow-primary-500/25 hover:shadow-primary-500/35 h-12 w-full gap-2 text-sm font-bold shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
						>
							Continue
							<IconArrowRight class="h-4 w-4" />
						</button>

						<p class="text-surface-600-400 text-center text-[10px]">
							Secure checkout · Powered by 3FP
						</p>
					</div>
				</form>
			</div>
		</section>
	{/if}

	<!-- ═══════════════════════════════════
		ABOUT THE GROUP — Compact profile card
		═══════════════════════════════════ -->
	{#if config.sections.story && site.storyParagraphs.length}
		<section class="mx-auto max-w-7xl px-4 pt-12 md:px-6 md:pt-16" id="about">
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

		<section class="mx-auto max-w-7xl px-4 pt-10 md:px-6 md:pt-12">
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
	<div class="mx-auto grid max-w-7xl gap-5 px-4 pt-10 md:grid-cols-[1.2fr,0.6fr] md:px-6 md:pt-16">
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

	{#if config.safety_note || config.faq_1_q || config.faq_2_q || (config.sponsor_links || []).length}
		<section class="mx-auto max-w-7xl px-4 pt-10 md:px-6 md:pt-14">
			<div class="grid gap-4 lg:grid-cols-3">
				{#if config.safety_note}
					<div class="glass-card border-surface-500/15 rounded-2xl border p-5">
						<p class="text-primary-700-300 text-xs font-semibold tracking-[0.22em] uppercase">
							Safety note
						</p>
						<AutoLinkText
							text={config.safety_note}
							className="block text-surface-950-50 mt-2 text-sm leading-relaxed"
							linkClass="text-primary-700-300 underline underline-offset-2"
						/>
					</div>
				{/if}

				{#if config.faq_1_q || config.faq_2_q}
					<div class="glass-card border-surface-500/15 rounded-2xl border p-5 lg:col-span-2">
						<p class="text-secondary-700-300 text-xs font-semibold tracking-[0.22em] uppercase">
							FAQ
						</p>
						<div class="mt-3 space-y-3">
							{#if config.faq_1_q}
								<div>
									<p class="text-surface-950-50 font-semibold">{config.faq_1_q}</p>
									{#if config.faq_1_a}
										<AutoLinkText
											text={config.faq_1_a}
											className="block text-surface-800-200 mt-1 text-sm leading-relaxed"
											linkClass="text-primary-700-300 underline underline-offset-2"
										/>
									{/if}
								</div>
							{/if}
							{#if config.faq_2_q}
								<div>
									<p class="text-surface-950-50 font-semibold">{config.faq_2_q}</p>
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
			</div>

			{#if (config.sponsor_links || []).length}
				<div class="glass-card border-surface-500/15 mt-4 rounded-2xl border p-5">
					<p class="text-tertiary-700-300 text-xs font-semibold tracking-[0.22em] uppercase">
						Community partners
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each config.sponsor_links || [] as sponsor}
							<a
								href={sponsor}
								target="_blank"
								rel="noopener noreferrer"
								class="btn btn-sm preset-tonal-surface"
							>
								{sponsor}
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	{/if}
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

	/* Hero card cinematic sizing */
	.hero-card {
		aspect-ratio: 21 / 9;
		min-height: 320px;
	}

	@media (max-width: 767px) {
		.hero-card {
			aspect-ratio: 16 / 10;
			min-height: 280px;
		}
	}

	/* Ken Burns effect on hero image */
	.hero-image {
		animation: ken-burns 25s ease-in-out infinite alternate;
	}

	@keyframes ken-burns {
		0% {
			transform: scale(1) translate(0, 0);
		}
		100% {
			transform: scale(1.08) translate(-1%, -1%);
		}
	}

	/* Glassmorphism cards */
	.glass-card {
		background: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	:global([data-color-mode='dark']) .glass-card {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
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
	.card-interactive {
		background: color-mix(in oklab, var(--color-surface-50) 50%, transparent);
		backdrop-filter: blur(10px);
	}

	:global([data-color-mode='dark']) .card-interactive {
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
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
	.microsite-page > section,
	.microsite-page > div {
		animation: fade-in-up 0.6s ease-out forwards;
		opacity: 0;
		transform: translateY(20px);
	}

	.microsite-page > section:nth-child(1) {
		animation-delay: 0.1s;
	}
	.microsite-page > section:nth-child(2) {
		animation-delay: 0.2s;
	}
	.microsite-page > section:nth-child(3) {
		animation-delay: 0.3s;
	}
	.microsite-page > div {
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
