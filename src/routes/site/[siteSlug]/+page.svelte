<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconCalendarDays from '@lucide/svelte/icons/calendar-days';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconUsers from '@lucide/svelte/icons/users';
	import { CONTACT_ICON_MAP } from '$lib/groups/contactLinks';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const config = $derived(site.siteConfig);
	const basePath = $derived(site.basePath || '');
	const groupPageHref = $derived(`/groups/${group.slug}`);
	const updatesHref = $derived(basePath ? `${basePath}/updates` : '/updates');
	const joinHref = $derived(basePath ? `${basePath}/join` : '/join');
	const membershipCtaLabel = $derived(
		(site?.membershipProgram?.cta_label || '').trim() || 'Follow'
	);
	const location = $derived(
		[group?.city, group?.state_region, group?.country].filter(Boolean).join(', ') || null
	);

	function formatDate(value) {
		if (!value) return 'Soon';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Soon';
		return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
	}

	function contactLabel(link) {
		if (!link?.key) return 'Link';
		if (link.key === 'website') return 'Website';
		if (link.key === 'email') return link.label || 'Email';
		if (link.key === 'phone') return link.label || 'Phone';
		return link.key.charAt(0).toUpperCase() + link.key.slice(1);
	}
</script>

<svelte:head>
	<title>{config.site_title}</title>
</svelte:head>

<div class="microsite-page pb-16">
	<!-- ═══════════════════════════════════
     HERO — cinematic cover
     ═══════════════════════════════════ -->
	<section class="relative mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
		<div class="hero-card card relative overflow-hidden border-0">
			{#if group.cover_photo_url}
				<img
					src={group.cover_photo_url}
					alt={`${group.name}`}
					class="absolute inset-0 h-full w-full object-cover"
				/>
			{:else}
				<div
					class="from-primary-500/30 via-secondary-500/20 to-tertiary-500/30 absolute inset-0 bg-gradient-to-br"
				></div>
			{/if}
			<!-- gradient scrim -->
			<div
				class="from-surface-950/95 via-surface-950/50 absolute inset-0 bg-gradient-to-t to-transparent"
			></div>

			<!-- logo + name badge — bottom left -->
			<div class="relative z-10 flex h-full flex-col justify-end p-5 md:p-8">
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
								class="text-surface-50/60 mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase"
							>
								<IconMapPin class="h-3 w-3" />{location}
							</p>
						{/if}
						<h1 class="text-surface-50 text-2xl font-black tracking-tight md:text-3xl">
							{config.site_title}
						</h1>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════
     TAGLINE + CTA BUTTONS
     ═══════════════════════════════════ -->
	<section class="mx-auto max-w-7xl px-4 pt-8 md:px-6 md:pt-10">
		<div class="max-w-2xl space-y-6">
			{#if config.site_tagline}
				<p class="text-surface-950-50 text-xl leading-8 font-medium md:text-2xl md:leading-9">
					{config.site_tagline}
				</p>
			{/if}
			{#if site.actions.length}
				<div class="flex flex-wrap items-center gap-3">
					{#each site.actions as action, i}
						<a
							href={action.href}
							target={action.external ? '_blank' : undefined}
							rel={action.external ? 'noopener noreferrer' : undefined}
							class="btn {i === 0 ? 'preset-filled-primary-500' : 'preset-tonal-surface'} gap-2"
						>
							{action.label}
							<IconArrowRight class="h-4 w-4" />
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- ═══════════════════════════════════
     STATS STRIP
     ═══════════════════════════════════ -->
	{#if site.stats.length}
		<section class="mx-auto max-w-7xl px-4 pt-8 md:px-6">
			<div class="card preset-filled-secondary-50-950 border-secondary-500/25 overflow-hidden rounded-2xl p-0">
				<div class="divide-surface-500/20 grid grid-cols-3 divide-x">
					{#each site.stats as stat}
						<div class="p-4 text-center md:p-6">
							<p class="text-surface-500 text-xs font-bold tracking-widest uppercase">
								{stat.label}
							</p>
							<p class="text-surface-950-50 mt-1 text-base font-bold md:text-lg">{stat.value}</p>
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- ═══════════════════════════════════
     STORY / ABOUT
     ═══════════════════════════════════ -->
	{#if config.sections.story && site.storyParagraphs.length}
		<section class="mx-auto max-w-7xl px-4 pt-14 md:px-6 md:pt-16" id="about">
			<div class="max-w-3xl space-y-5">
				<p class="text-surface-500 text-xs font-bold tracking-widest uppercase">About the group</p>
				<h2 class="h2 !text-surface-950-50">
					{config.featured_quote || 'Built for local people, not just followers.'}
				</h2>
				<div class="mt-6 space-y-4">
					{#each site.storyParagraphs as paragraph}
						<p class="text-surface-800-200 text-base leading-8">{paragraph}</p>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- ═══════════════════════════════════
     MAIN CONTENT GRID
     ═══════════════════════════════════ -->
	<div class="mx-auto grid max-w-7xl gap-5 px-4 pt-10 md:grid-cols-[1.2fr,0.8fr] md:px-6 md:pt-12">
		<!-- LEFT COLUMN: rides · volunteer · news -->
		<div class="space-y-5">
			<!-- Only show rides section if enabled AND has rides -->
			{#if config.sections.rides && site.rides?.length > 0}
				<section class="card preset-filled-secondary-50-950 border-secondary-500/25 p-6" id="rides">
					<div class="mb-4 flex items-start justify-between gap-4">
						<div>
							<p class="text-surface-500 text-xs font-bold tracking-widest uppercase">
								Upcoming rides
							</p>
							<h2 class="h4 mt-1 !text-surface-950-50">Ride together</h2>
						</div>
						<a
							href={groupPageHref}
							class="text-surface-700-300 hover:text-surface-950-50 text-sm font-semibold">View group →</a
						>
					</div>
					<div class="divide-surface-500/10 divide-y">
						{#each site.rides as ride}
							<a
								href={`/ride/${ride.slug}`}
								class="border-surface-500/10 flex items-center gap-4 border-t py-4 transition-opacity first:border-0 hover:opacity-70"
							>
								<div
									class="text-surface-500 flex min-w-[5.5rem] items-center gap-2 text-sm font-semibold"
								>
									<IconCalendarDays class="h-3.5 w-3.5" />
									<span>{formatDate(ride.nextOccurrenceStart)}</span>
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-surface-950-50 truncate font-bold">{ride.title}</p>
									{#if ride.startLocationName || ride.startLocationAddress}
										<p class="text-surface-700-300 truncate text-sm">
											{ride.startLocationName || ride.startLocationAddress}
										</p>
									{/if}
								</div>
								<IconArrowRight class="h-4 w-4 flex-shrink-0 opacity-35" />
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if config.sections.volunteer && site.volunteerEvents.length}
				<section class="card preset-filled-tertiary-50-950 border-tertiary-500/25 p-6" id="volunteer">
					<div class="mb-4 flex items-start justify-between gap-4">
						<div>
							<p class="text-surface-500 text-xs font-bold tracking-widest uppercase">Volunteer</p>
							<h2 class="h4 mt-1 !text-surface-950-50">Help make it happen</h2>
						</div>
						<a
							href={`/volunteer/groups/${group.slug}`}
							class="text-surface-700-300 hover:text-surface-950-50 text-sm font-semibold">All →</a
						>
					</div>
					<div class="space-y-3">
						{#each site.volunteerEvents as event}
							<a
								href={`/volunteer/${event.slug}`}
								class="card card-hover preset-filled-surface-100-900 border-surface-500/10 p-4"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="text-surface-500 text-xs font-bold tracking-widest uppercase">
											{formatDate(event.event_start)}
										</p>
										<h3 class="text-surface-950-50 mt-1 font-bold">{event.title}</h3>
										{#if event.summary}
											<p class="text-surface-700-300 mt-1 text-sm leading-6">{event.summary}</p>
										{/if}
									</div>
									<IconHeartHandshake class="mt-0.5 h-4 w-4 flex-shrink-0 opacity-40" />
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if config.sections.news && site.newsPosts.length}
				<section class="card preset-filled-secondary-50-950 border-secondary-500/25 p-6" id="updates">
					<div class="mb-4 flex items-start justify-between gap-4">
						<div>
							<p class="text-surface-500 text-xs font-bold tracking-widest uppercase">Updates</p>
							<h2 class="h4 mt-1 !text-surface-950-50">Latest news</h2>
						</div>
						{#if site.newsPosts.length > 1}
							<a
								href={updatesHref}
								class="text-surface-700-300 hover:text-surface-950-50 text-sm font-semibold">Archive →</a
							>
						{/if}
					</div>
					<div class="space-y-3">
						{#each site.newsPosts as post}
							<a
								href={`${updatesHref}?open=${post.slug}`}
								class="card card-hover preset-filled-surface-100-900 border-surface-500/10 p-4"
							>
								<div
									class="text-surface-500 flex items-center gap-2 text-xs font-semibold tracking-widest uppercase"
								>
									<IconNewspaper class="h-3 w-3" />
									{formatDate(post.published_at || post.created_at)}
								</div>
								<h3 class="text-surface-950-50 mt-2 text-lg font-bold tracking-tight">{post.title}</h3>
								{#if post.preview_text}
									<p class="text-surface-700-300 mt-1 line-clamp-2 text-sm leading-6">
										{post.preview_text}
									</p>
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>

		<!-- RIGHT COLUMN: join · gallery · contact -->
		<div class="space-y-5">
			{#if config.sections.join}
				<section class="card preset-filled-primary-500/5 border-primary-500/20 p-6" id="join">
					<p class="text-surface-500 text-xs font-bold tracking-widest uppercase">Get involved</p>
					<h2 class="h4 mt-2 !text-surface-950-50">Start with one good reason to show up.</h2>
					{#if group.how_to_join_instructions || group.membership_info}
						<p class="text-surface-800-200 mt-3 text-sm leading-7">
							{group.how_to_join_instructions || group.membership_info}
						</p>
					{/if}
					<div class="mt-5 flex flex-wrap gap-3">
						<a href={joinHref} class="btn preset-filled-primary-500 gap-2">
							{membershipCtaLabel}
							<IconArrowRight class="h-4 w-4" />
						</a>
						{#if site.primaryCta?.href}
							<a
								href={site.primaryCta.href}
								target={/^https?:\/\//i.test(site.primaryCta.href) ? '_blank' : undefined}
								rel={/^https?:\/\//i.test(site.primaryCta.href) ? 'noopener noreferrer' : undefined}
								class="btn preset-tonal-surface"
							>
								{site.primaryCta.label || 'Connect'}
							</a>
						{/if}
					</div>
				</section>
			{/if}

			{#if config.sections.gallery && site.photoBucket?.image_assets?.length}
				<section class="card preset-filled-tertiary-50-950 border-tertiary-500/25 p-6" id="gallery">
					<div class="mb-4">
						<p class="text-surface-500 text-xs font-bold tracking-widest uppercase">Gallery</p>
						<h2 class="h4 mt-1 !text-surface-950-50">Scenes from the group</h2>
					</div>
					<div class="grid grid-cols-2 gap-2.5">
						{#each site.photoBucket.image_assets.slice(0, 6) as image}
							<a
								href={image.href}
								target="_blank"
								rel="noopener noreferrer"
								class="gallery-tile overflow-hidden rounded-xl"
							>
								<img
									src={image.href}
									alt={image.title}
									class="h-36 w-full object-cover"
									loading="lazy"
								/>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if config.sections.contact && site.contactLinks.length}
				<section class="card preset-filled-secondary-50-950 border-secondary-500/25 p-6" id="contact">
					<div class="mb-4">
						<p class="text-surface-500 text-xs font-bold tracking-widest uppercase">Contact</p>
						<h2 class="h4 mt-1 !text-surface-950-50">Find the right link fast</h2>
					</div>
					<div class="space-y-2">
						{#each site.contactLinks as link}
							{@const ContactIcon = CONTACT_ICON_MAP[link.key] || IconMapPin}
							<a
								href={link.href}
								target={/^https?:\/\//i.test(link.href) ? '_blank' : undefined}
								rel={/^https?:\/\//i.test(link.href) ? 'noopener noreferrer' : undefined}
								class="hover:bg-surface-500/10 flex items-center gap-3 rounded-xl p-3 transition-colors"
							>
								<div
									class="bg-primary-500/15 text-primary-500 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
								>
									<ContactIcon class="h-4 w-4" />
								</div>
								<div class="min-w-0">
									<p class="text-surface-950-50 text-sm font-semibold">{contactLabel(link)}</p>
									<p class="text-surface-700-300 truncate text-xs">
										{link.href.replace(/^mailto:/, '').replace(/^tel:/, '')}
									</p>
								</div>
								<IconArrowRight class="ml-auto h-4 w-4 flex-shrink-0 opacity-30" />
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Hero card cinematic sizing */
	.hero-card {
		aspect-ratio: 16 / 9;
		min-height: 280px;
	}

	@media (max-width: 767px) {
		.hero-card {
			aspect-ratio: 4 / 3;
			min-height: 240px;
		}
	}

	/* Gallery tile hover effect */
	.gallery-tile {
		display: block;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 8%, transparent);
		transition:
			transform 150ms ease,
			opacity 150ms ease;
	}

	.gallery-tile:hover {
		transform: translateY(-2px);
		opacity: 0.9;
	}
</style>
