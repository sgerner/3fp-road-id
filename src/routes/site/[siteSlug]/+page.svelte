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
	const membershipCtaLabel = $derived((site?.membershipProgram?.cta_label || '').trim() || 'Follow');
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
		<div class="hero-cover relative overflow-hidden rounded-[2rem] md:rounded-[2.5rem]">
			{#if group.cover_photo_url}
				<img
					src={group.cover_photo_url}
					alt={`${group.name}`}
					class="hero-cover__img absolute inset-0 h-full w-full object-cover"
				/>
			{:else}
				<div class="hero-cover__fallback absolute inset-0"></div>
			{/if}
			<!-- gradient scrim -->
			<div class="hero-scrim absolute inset-0"></div>

			<!-- logo + name badge — bottom left -->
			<div class="relative z-10 flex h-full flex-col justify-end p-5 md:p-8">
				<div class="flex items-end gap-4">
					{#if group.logo_url}
						<img
							src={group.logo_url}
							alt={`${group.name} logo`}
							class="h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-2xl ring-1 ring-white/15 md:h-20 md:w-20"
						/>
					{:else}
						<div class="hero-logo-fallback flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl md:h-20 md:w-20">
							<IconUsers class="h-7 w-7 text-white/80" />
						</div>
					{/if}
					<div class="min-w-0 pb-0.5">
						{#if location}
							<p class="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase text-white/55">
								<IconMapPin class="h-3 w-3" />{location}
							</p>
						{/if}
						<h1 class="hero-name text-2xl font-black tracking-tight text-white md:text-3xl">
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
				<p class="text-xl font-medium leading-8 text-white/78 md:text-2xl md:leading-9">
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
							class={i === 0 ? 'btn-primary' : 'btn-ghost'}
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
			<div class="stats-strip overflow-x-auto">
				<div class="stats-row">
					{#each site.stats as stat, i}
						{#if i > 0}
							<div class="stats-divider" aria-hidden="true"></div>
						{/if}
						<div class="stat-item">
							<p class="stat-label">{stat.label}</p>
							<p class="stat-value">{stat.value}</p>
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
				<p class="eyebrow">About the group</p>
				<h2 class="text-3xl font-black tracking-tight text-white md:text-4xl">
					{config.featured_quote || 'Built for local people, not just followers.'}
				</h2>
				<div class="mt-6 space-y-4">
					{#each site.storyParagraphs as paragraph}
						<p class="text-base leading-8 text-white/72">{paragraph}</p>
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

			{#if config.sections.rides}
				<section class="card" id="rides">
					<div class="card-header">
						<div>
							<p class="eyebrow">Upcoming rides</p>
							<h2 class="card-title">Ride together</h2>
						</div>
						<a href={groupPageHref} class="card-link">View group →</a>
					</div>
					{#if site.rides.length}
						<div class="divide-y divide-white/[0.06]">
							{#each site.rides as ride}
								<a href={`/ride/${ride.slug}`} class="event-row">
									<div class="event-date">
										<IconCalendarDays class="h-3.5 w-3.5" />
										<span>{formatDate(ride.nextOccurrenceStart)}</span>
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate font-bold text-white">{ride.title}</p>
										{#if ride.startLocationName || ride.startLocationAddress}
											<p class="truncate text-sm text-white/55">
												{ride.startLocationName || ride.startLocationAddress}
											</p>
										{/if}
									</div>
									<IconArrowRight class="h-4 w-4 flex-shrink-0 text-white/35" />
								</a>
							{/each}
						</div>
					{:else}
						<p class="empty-state">No rides on the calendar yet — check back soon.</p>
					{/if}
				</section>
			{/if}

			{#if config.sections.volunteer && site.volunteerEvents.length}
				<section class="card" id="volunteer">
					<div class="card-header">
						<div>
							<p class="eyebrow">Volunteer</p>
							<h2 class="card-title">Help make it happen</h2>
						</div>
						<a href={`/volunteer/groups/${group.slug}`} class="card-link">All →</a>
					</div>
					<div class="space-y-3">
						{#each site.volunteerEvents as event}
							<a href={`/volunteer/${event.slug}`} class="vol-card">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="eyebrow">{formatDate(event.event_start)}</p>
										<h3 class="mt-1.5 font-bold text-white">{event.title}</h3>
										{#if event.summary}
											<p class="mt-1 text-sm leading-6 text-white/62">{event.summary}</p>
										{/if}
									</div>
									<IconHeartHandshake class="mt-0.5 h-4 w-4 flex-shrink-0 text-white/40" />
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if config.sections.news && site.newsPosts.length}
				<section class="card" id="updates">
					<div class="card-header">
						<div>
							<p class="eyebrow">Updates</p>
							<h2 class="card-title">Latest news</h2>
						</div>
						{#if site.newsPosts.length > 1}
							<a href={updatesHref} class="card-link">Archive →</a>
						{/if}
					</div>
					<div class="space-y-3">
						{#each site.newsPosts as post}
							<a href={`${updatesHref}?open=${post.slug}`} class="news-card">
								<div class="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-white/42">
									<IconNewspaper class="h-3 w-3" />
									{formatDate(post.published_at || post.created_at)}
								</div>
								<h3 class="mt-2.5 text-lg font-black tracking-tight text-white">{post.title}</h3>
								{#if post.preview_text}
									<p class="mt-1.5 text-sm leading-6 text-white/62 line-clamp-2">{post.preview_text}</p>
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
				<section class="card card--accent" id="join">
					<p class="eyebrow">Get involved</p>
					<h2 class="card-title mt-2">Start with one good reason to show up.</h2>
					{#if group.how_to_join_instructions || group.membership_info}
						<p class="mt-3 text-sm leading-7 text-white/72">
							{group.how_to_join_instructions || group.membership_info}
						</p>
					{/if}
					<div class="mt-5 flex flex-wrap gap-3">
						<a href={joinHref} class="btn-primary btn-sm">
							{membershipCtaLabel}
							<IconArrowRight class="h-4 w-4" />
						</a>
						{#if site.primaryCta?.href}
							<a
								href={site.primaryCta.href}
								target={/^https?:\/\//i.test(site.primaryCta.href) ? '_blank' : undefined}
								rel={/^https?:\/\//i.test(site.primaryCta.href) ? 'noopener noreferrer' : undefined}
								class="btn-ghost btn-sm"
							>
								{site.primaryCta.label || 'Connect'}
							</a>
						{/if}
					</div>
				</section>
			{/if}

			{#if config.sections.gallery && site.photoBucket?.image_assets?.length}
				<section class="card" id="gallery">
					<div class="card-header mb-4">
						<div>
							<p class="eyebrow">Gallery</p>
							<h2 class="card-title">Scenes from the group</h2>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-2.5">
						{#each site.photoBucket.image_assets.slice(0, 6) as image}
							<a
								href={image.href}
								target="_blank"
								rel="noopener noreferrer"
								class="gallery-tile overflow-hidden rounded-xl"
							>
								<img src={image.href} alt={image.title} class="h-36 w-full object-cover" loading="lazy" />
							</a>
						{/each}
					</div>
				</section>
			{/if}

			{#if config.sections.contact && site.contactLinks.length}
				<section class="card" id="contact">
					<div class="mb-4">
						<p class="eyebrow">Contact</p>
						<h2 class="card-title mt-1">Find the right link fast</h2>
					</div>
					<div class="space-y-2">
						{#each site.contactLinks as link}
							{@const ContactIcon = CONTACT_ICON_MAP[link.key] || IconMapPin}
							<a
								href={link.href}
								target={/^https?:\/\//i.test(link.href) ? '_blank' : undefined}
								rel={/^https?:\/\//i.test(link.href) ? 'noopener noreferrer' : undefined}
								class="contact-row"
							>
								<div class="contact-icon">
									<ContactIcon class="h-4 w-4" />
								</div>
								<div class="min-w-0">
									<p class="text-sm font-semibold text-white">{contactLabel(link)}</p>
									<p class="truncate text-xs text-white/48">
										{link.href.replace(/^mailto:/, '').replace(/^tel:/, '')}
									</p>
								</div>
								<IconArrowRight class="ml-auto h-4 w-4 flex-shrink-0 text-white/28" />
							</a>
						{/each}
					</div>
				</section>
			{/if}

		</div>
	</div>
</div>

<style>
	/* ── Hero ─────────────────────────────────────── */
	.hero-cover {
		aspect-ratio: 16/9;
		min-height: 300px;
		background: color-mix(in oklab, var(--color-surface-900) 95%, transparent);
	}

	@media (max-width: 767px) {
		.hero-cover {
			aspect-ratio: 4/3;
			min-height: 260px;
		}
	}

	.hero-cover__img,
	.hero-cover__fallback {
		transition: transform 8s ease;
	}

	.hero-cover__fallback {
		background: radial-gradient(
				ellipse 80% 60% at 30% 20%,
				color-mix(in oklab, var(--color-primary-500) 48%, transparent),
				transparent 65%
			),
			radial-gradient(
				ellipse 60% 50% at 80% 80%,
				color-mix(in oklab, var(--color-secondary-500) 42%, transparent),
				transparent 65%
			),
			color-mix(in oklab, var(--color-surface-950) 88%, transparent);
	}

	.hero-scrim {
		background: linear-gradient(
			to top,
			rgb(6 8 16 / 0.88) 0%,
			rgb(6 8 16 / 0.35) 45%,
			rgb(6 8 16 / 0.08) 100%
		);
	}

	.hero-name {
		font-family: var(--heading-font-family, inherit);
	}

	.hero-logo-fallback {
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
	}

	/* ── Buttons ──────────────────────────────────── */
	.btn-primary,
	.btn-ghost {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.85rem 1.3rem;
		border-radius: 999px;
		font-weight: 700;
		font-size: 0.9rem;
		text-decoration: none;
		transition: transform 160ms ease, filter 160ms ease, background-color 160ms ease;
	}

	.btn-primary {
		color: var(--color-primary-contrast-500);
		background: var(--color-primary-500);
	}

	.btn-primary:hover {
		transform: translateY(-1px);
		filter: brightness(1.06);
	}

	.btn-ghost {
		color: white;
		background: color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 14%, transparent);
	}

	.btn-ghost:hover {
		background: color-mix(in oklab, var(--color-surface-50) 14%, transparent);
		transform: translateY(-1px);
	}

	.btn-sm {
		padding: 0.65rem 1rem;
		font-size: 0.85rem;
	}

	/* ── Stats strip ──────────────────────────────── */
	.stats-strip {
		scrollbar-width: none;
	}

	.stats-strip::-webkit-scrollbar {
		display: none;
	}

	.stats-row {
		display: flex;
		align-items: stretch;
		gap: 0;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 9%, transparent);
		border-radius: 1.25rem;
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		backdrop-filter: blur(16px);
		overflow: hidden;
		min-width: max-content;
		width: 100%;
	}

	.stat-item {
		flex: 1;
		padding: 1rem 1.25rem;
		min-width: 120px;
	}

	.stats-divider {
		width: 1px;
		background: color-mix(in oklab, var(--color-surface-50) 9%, transparent);
		flex-shrink: 0;
		align-self: stretch;
	}

	.stat-label {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgb(255 255 255 / 0.42);
	}

	.stat-value {
		margin-top: 0.35rem;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--ms-stat, white);
	}

	/* ── Eyebrow ──────────────────────────────────── */
	.eyebrow {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: rgb(255 255 255 / 0.44);
	}

	/* ── Cards ────────────────────────────────────── */
	.card {
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 9%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 74%, transparent);
		backdrop-filter: blur(16px);
		border-radius: 1.75rem;
		padding: 1.5rem;
	}

	@media (min-width: 768px) {
		.card {
			padding: 2rem;
		}
	}

	.card--accent {
		background:
			radial-gradient(
				20rem 14rem at 100% 0%,
				color-mix(in oklab, var(--color-primary-500) 26%, transparent),
				transparent 65%
			),
			color-mix(in oklab, var(--color-surface-950) 74%, transparent);
	}

	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.card-title {
		font-size: 1.25rem;
		font-weight: 800;
		tracking: -0.02em;
		color: var(--ms-title, white);
		margin-top: 0.3rem;
	}

	.card-link {
		font-size: 0.8rem;
		font-weight: 700;
		color: rgb(255 255 255 / 0.52);
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
		padding-top: 0.1rem;
		transition: color 150ms ease;
	}

	.card-link:hover {
		color: white;
	}

	.empty-state {
		font-size: 0.875rem;
		line-height: 1.75;
		color: rgb(255 255 255 / 0.5);
	}

	/* ── Event rows ───────────────────────────────── */
	.event-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.875rem 0;
		text-decoration: none;
		transition: opacity 150ms ease;
	}

	.event-row:hover {
		opacity: 0.8;
	}

	.event-date {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 5.5rem;
		font-size: 0.78rem;
		font-weight: 700;
		color: rgb(255 255 255 / 0.48);
	}

	/* ── Volunteer cards ─────────────────────────── */
	.vol-card {
		display: block;
		padding: 1rem 1.1rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 8%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 55%, transparent);
		text-decoration: none;
		transition: border-color 150ms ease, transform 150ms ease;
	}

	.vol-card:hover {
		border-color: color-mix(in oklab, var(--color-primary-500) 30%, transparent);
		transform: translateY(-1px);
	}

	/* ── News cards ──────────────────────────────── */
	.news-card {
		display: block;
		padding: 1.1rem 1.2rem;
		border-radius: 1rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 8%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 55%, transparent);
		text-decoration: none;
		transition: border-color 150ms ease, transform 150ms ease;
	}

	.news-card:hover {
		border-color: color-mix(in oklab, var(--color-primary-500) 28%, transparent);
		transform: translateY(-1px);
	}

	/* ── Gallery ─────────────────────────────────── */
	.gallery-tile {
		display: block;
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 8%, transparent);
		transition: transform 150ms ease, opacity 150ms ease;
	}

	.gallery-tile:hover {
		transform: translateY(-2px);
		opacity: 0.9;
	}

	/* ── Contact rows ────────────────────────────── */
	.contact-row {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.8rem 0.9rem;
		border-radius: 0.875rem;
		text-decoration: none;
		transition: background-color 150ms ease;
	}

	.contact-row:hover {
		background: color-mix(in oklab, var(--color-surface-50) 6%, transparent);
	}

	.contact-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		background: color-mix(in oklab, var(--color-primary-500) 14%, transparent);
		color: white;
		flex-shrink: 0;
	}

	:global(.microsite-shell[data-color-mode='light']) .hero-cover {
		background: color-mix(in oklab, white 86%, var(--color-primary-100) 14%);
	}

	:global(.microsite-shell[data-color-mode='light']) .hero-cover__fallback {
		background: radial-gradient(
				ellipse 80% 60% at 30% 20%,
				color-mix(in oklab, var(--color-primary-300) 36%, transparent),
				transparent 66%
			),
			radial-gradient(
				ellipse 60% 50% at 80% 80%,
				color-mix(in oklab, var(--color-secondary-300) 34%, transparent),
				transparent 66%
			),
			color-mix(in oklab, white 82%, var(--color-surface-100) 18%);
	}

	:global(.microsite-shell[data-color-mode='light']) .hero-scrim {
		background: linear-gradient(
			to top,
			color-mix(in oklab, var(--color-surface-950) 58%, transparent) 0%,
			color-mix(in oklab, var(--color-surface-900) 34%, transparent) 44%,
			rgb(255 255 255 / 0.08) 100%
		);
	}

	:global(.microsite-shell[data-color-mode='light']) .hero-logo-fallback {
		color: rgb(15 23 42 / 0.9);
	}

	:global(.microsite-shell[data-color-mode='light']) .stats-row,
	:global(.microsite-shell[data-color-mode='light']) .card,
	:global(.microsite-shell[data-color-mode='light']) .vol-card,
	:global(.microsite-shell[data-color-mode='light']) .news-card,
	:global(.microsite-shell[data-color-mode='light']) .gallery-tile {
		border-color: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		background: color-mix(in oklab, white 80%, var(--color-primary-100) 20%);
		box-shadow: 0 16px 34px -28px color-mix(in oklab, var(--color-primary-500) 42%, transparent);
	}

	:global(.microsite-shell[data-color-mode='light']) .card--accent {
		background:
			radial-gradient(
				20rem 14rem at 100% 0%,
				color-mix(in oklab, var(--color-primary-300) 28%, transparent),
				transparent 65%
			),
			color-mix(in oklab, white 80%, var(--color-primary-100) 20%);
	}

	:global(.microsite-shell[data-color-mode='light']) .stats-divider {
		background: color-mix(in oklab, var(--color-primary-500) 16%, transparent);
	}

	:global(.microsite-shell[data-color-mode='light']) .stat-label,
	:global(.microsite-shell[data-color-mode='light']) .eyebrow,
	:global(.microsite-shell[data-color-mode='light']) .card-link,
	:global(.microsite-shell[data-color-mode='light']) .event-date,
	:global(.microsite-shell[data-color-mode='light']) .empty-state {
		color: rgb(30 41 59 / 0.66);
	}

	:global(.microsite-shell[data-color-mode='light']) .btn-ghost {
		color: rgb(15 23 42 / 0.88);
		background: color-mix(in oklab, white 74%, var(--color-primary-100) 26%);
		border-color: color-mix(in oklab, var(--color-primary-500) 26%, transparent);
	}

	:global(.microsite-shell[data-color-mode='light']) .contact-row:hover {
		background: color-mix(in oklab, var(--color-primary-100) 42%, transparent);
	}

	:global(.microsite-shell[data-color-mode='light']) .contact-icon {
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: rgb(15 23 42 / 0.88);
	}

	:global(.microsite-shell[data-color-mode='light']) .microsite-page :global(.text-white) {
		color: rgb(15 23 42 / 0.92) !important;
	}

	:global(.microsite-shell[data-color-mode='light']) .microsite-page :global([class*='text-white/']) {
		color: rgb(51 65 85 / 0.78) !important;
	}

	:global(.microsite-shell[data-color-mode='light']) .hero-cover :global(.text-white) {
		color: rgb(255 255 255 / 0.97) !important;
	}

	:global(.microsite-shell[data-color-mode='light']) .hero-cover :global([class*='text-white/']) {
		color: rgb(255 255 255 / 0.78) !important;
	}

	/* ── Responsive grid fix ─────────────────────── */
	@media (max-width: 767px) {
		.stats-row {
			width: max-content;
		}
	}
</style>
