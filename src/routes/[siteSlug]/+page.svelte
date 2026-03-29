<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconImage from '@lucide/svelte/icons/image';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';
	import { CONTACT_ICON_MAP } from '$lib/groups/contactLinks';
	import { fade, scale } from 'svelte/transition';
	let { data } = $props();
	const site = $derived(data.site);
	const group = $derived(site.group);
	const config = $derived(site.siteConfig);
	const heroStyle = $derived(config?.hero_style || 'immersive');
	const panelStyle = $derived(config?.panel_style || 'glass');
	const panelTone = $derived(config?.panel_tone || 'surface');
	const pageStyleClass = $derived(`hero-mode-${heroStyle} panel-${panelStyle} tone-${panelTone}`);
	const taxonomy = $derived(site.taxonomy || { audiences: [], disciplines: [], skills: [] });
	const basePath = $derived(site.basePath || '');
	const groupPageHref = $derived(`/groups/${group.slug}`);
	const galleryHref = $derived(basePath ? `${basePath}/gallery` : '/gallery');
	const showNotice = $derived(Boolean(site.announcementIsActive && config.microsite_notice));
	const hasNewRiderNote = $derived(Boolean((config?.new_rider_note || '').trim()));
	const location = $derived([group?.city, group?.state_region].filter(Boolean).join(', ') || null);
	const mapsHref = $derived.by(() => {
		const lat = Number(group?.latitude);
		const lng = Number(group?.longitude);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
	});
	const donateAmountPresets = [10, 25, 50, 100];
	let donateAmount = $state(25);
	// Lightbox state
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	let lightboxItems = $state([]);
	// Gallery images (first 4 only)
	const galleryImages = $derived(site.photoBucket?.image_assets?.slice(0, 4) || []);
	// Combined events (rides + volunteer + news)
	const upcomingEvents = $derived.by(() => {
		const events = [];
		if (site.rides?.length) {
			events.push(...site.rides.slice(0, 3).map((r) => ({ ...r, type: 'ride' })));
		}
		if (site.volunteerEvents?.length) {
			events.push(...site.volunteerEvents.slice(0, 2).map((v) => ({ ...v, type: 'volunteer' })));
		}
		if (site.newsPosts?.length) {
			events.push(...site.newsPosts.slice(0, 2).map((n) => ({ ...n, type: 'news' })));
		}
		return events.slice(0, 5);
	});
	const hasEvents = $derived(upcomingEvents.length > 0);
	const hasRides = $derived(site.rides?.length > 0);
	const hasVolunteer = $derived(site.volunteerEvents?.length > 0);
	const hasNews = $derived(site.newsPosts?.length > 0);
	function formatDate(value) {
		if (!value) return 'Soon';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Soon';
		return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
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
			(ride?.imageUrls || ride?.rideDetails?.image_urls)?.[0] ||
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
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:head>
	<title>{config.site_title}</title>
</svelte:head>
<div class="microsite-page {pageStyleClass}">
	<!-- ═══════════════════════════════════════════════════════════
	     HERO SECTION — Clean, focused, single-purpose
     ═══════════════════════════════════════════════════════════ -->
	{#if showNotice}
		<section class="notice-banner">
			<div class="notice-content">
				<AutoLinkText
					text={config.microsite_notice}
					className="notice-text"
					linkClass="notice-link"
				/>
				{#if config.microsite_notice_href}
					<a
						href={config.microsite_notice_href}
						target="_blank"
						rel="noopener noreferrer"
						class="notice-btn"
					>
						Details
						<IconArrowRight class="h-4 w-4" />
					</a>
				{/if}
			</div>
		</section>
	{/if}
	<section class="hero-section">
		{#if heroStyle === 'bold'}
			<!-- BOLD HERO: Magazine-style diagonal split -->
			<div class="hero-bold">
				<div class="hero-bold-bg"></div>
				<div class="hero-bold-image-wrap">
					{#if group.cover_photo_url}
						<img src={group.cover_photo_url} alt={group.name} class="hero-image" />
					{:else}
						<div class="hero-gradient-fallback"></div>
					{/if}
				</div>
				<div class="hero-content">
					<div class="hero-card">
						{#if location}
							<div class="location-badge">
								<IconMapPin class="h-3.5 w-3.5" />
								<span>{location}</span>
							</div>
						{/if}
						<div class="title-row">
							{#if group.logo_url}
								<img src={group.logo_url} alt="{group.name} logo" class="hero-logo" />
							{/if}
							<h1 class="hero-title">{config.site_title}</h1>
						</div>
						{#if config.site_tagline}
							<AutoLinkText
								text={config.site_tagline}
								className="hero-tagline"
								linkClass="hero-tagline-link"
							/>
						{/if}
						{#if site.actions.length}
							<div class="hero-ctas">
								{#each site.actions as action, i}
									<a
										href={action.href}
										target={action.external ? '_blank' : undefined}
										rel={action.external ? 'noopener noreferrer' : undefined}
										class="hero-cta {i === 0 ? 'cta-primary' : 'cta-secondary'}"
									>
										<span>{action.label}</span>
										<IconArrowRight class="h-4 w-4" />
									</a>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else if heroStyle === 'orbit'}
			<!-- ORBIT HERO: Centered floating card -->
			<div class="hero-orbit">
				{#if group.cover_photo_url}
					<img src={group.cover_photo_url} alt={group.name} class="hero-image-full" />
				{:else}
					<div class="hero-gradient-fallback-full"></div>
				{/if}
				<div class="hero-orbit-vignette"></div>
				<div class="hero-orbit-content">
					<div class="hero-orbit-card">
						{#if group.logo_url}
							<img src={group.logo_url} alt="{group.name} logo" class="hero-logo-center" />
						{/if}
						{#if location}
							<p class="hero-location"><IconMapPin class="h-3 w-3" />{location}</p>
						{/if}
						<h1 class="hero-title-center">{config.site_title}</h1>
						{#if config.site_tagline}
							<AutoLinkText
								text={config.site_tagline}
								className="hero-tagline-center"
								linkClass="hero-tagline-link"
							/>
						{/if}
						{#if site.actions.length}
							<div class="hero-ctas-center">
								{#each site.actions as action, i}
									<a
										href={action.href}
										target={action.external ? '_blank' : undefined}
										rel={action.external ? 'noopener noreferrer' : undefined}
										class="hero-cta {i === 0 ? 'cta-primary' : 'cta-secondary'}"
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
		{:else}
			<!-- IMMERSIVE HERO: Classic gradient overlay (default) -->
			<div class="hero-immersive">
				{#if group.cover_photo_url}
					<img src={group.cover_photo_url} alt={group.name} class="hero-image-full" />
				{:else}
					<div class="hero-gradient-fallback-full"></div>
				{/if}
				<div class="hero-immersive-gradient"></div>
				<div class="hero-immersive-content">
					<div class="hero-immersive-header">
						<div class="title-block">
							{#if group.logo_url}
								<img src={group.logo_url} alt="{group.name} logo" class="hero-logo-immersive" />
							{:else}
								<div class="hero-logo-fallback"><IconUsers class="h-7 w-7" /></div>
							{/if}
							<div class="title-text">
								{#if location}
									<p class="hero-location-immersive"><IconMapPin class="h-3 w-3" />{location}</p>
								{/if}
								<h1 class="hero-title-immersive">{config.site_title}</h1>
							</div>
						</div>
					</div>
					<div class="hero-immersive-footer">
						{#if config.site_tagline}
							<AutoLinkText
								text={config.site_tagline}
								className="hero-tagline-immersive"
								linkClass="hero-tagline-link"
							/>
						{/if}
						{#if site.actions.length}
							<div class="hero-ctas-immersive">
								{#each site.actions as action, i}
									<a
										href={action.href}
										target={action.external ? '_blank' : undefined}
										rel={action.external ? 'noopener noreferrer' : undefined}
										class="hero-cta {i === 0 ? 'cta-primary' : 'cta-secondary'}"
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
		{/if}
	</section>
	<!-- ═══════════════════════════════════════════════════════════
	     QUICK INFO BAR — Essential details at a glance
     ═══════════════════════════════════════════════════════════ -->
	<section class="quick-info">
		<div class="quick-info-grid">
			<div class="quick-info-item">
				<p class="quick-info-label">When we ride</p>
				<p class="quick-info-value">{group?.activity_frequency || 'Details coming soon'}</p>
			</div>
			<div class="quick-info-item">
				<p class="quick-info-label">Where we meet</p>
				{#if mapsHref && (group?.specific_meeting_point_address || location)}
					<a href={mapsHref} target="_blank" rel="noopener noreferrer" class="quick-info-link">
						{group?.specific_meeting_point_address || location}
						<IconArrowRight class="h-3.5 w-3.5" />
					</a>
				{:else}
					<p class="quick-info-value">{location || 'Shared in ride details'}</p>
				{/if}
			</div>
			<div class="quick-info-item">
				<p class="quick-info-label">Who can join</p>
				<p class="quick-info-value">
					{taxonomy?.audiences?.[0] || group?.audience_focus || 'Anyone on two wheels'}
				</p>
			</div>
			<div class="quick-info-item">
				<p class="quick-info-label">How to join</p>
				<p class="quick-info-value">
					{group?.how_to_join_instructions || group?.membership_info || 'Follow for updates'}
				</p>
			</div>
		</div>
	</section>
	<!-- ═══════════════════════════════════════════════════════════
	     NEW RIDER NOTE — Helpful for newcomers (optional)
     ═══════════════════════════════════════════════════════════ -->
	{#if hasNewRiderNote}
		<section class="new-rider-note">
			<div class="note-content">
				<p class="note-label">New rider starter note</p>
				<AutoLinkText text={config.new_rider_note} className="note-text" linkClass="note-link" />
			</div>
		</section>
	{/if}
	<!-- ═══════════════════════════════════════════════════════════
	     DONATE — Quick donation widget (optional)
     ═══════════════════════════════════════════════════════════ -->
	{#if site.donationEnabled}
		<section class="donate-section">
			<div class="donate-card">
				<form method="GET" action="/donate">
					<input type="hidden" name="group" value={group.slug} />
					<div class="donate-header">
						<h2 class="donate-title">Support our work</h2>
						<div class="donate-presets">
							{#each donateAmountPresets as preset}
								<button
									type="button"
									class="donate-preset {donateAmount === preset ? 'active' : ''}"
									onclick={() => (donateAmount = preset)}
								>
									${preset}
								</button>
							{/each}
						</div>
					</div>
					<div class="donate-input-row">
						<div class="donate-input-wrap">
							<span class="donate-currency">$</span>
							<input
								type="number"
								min="1"
								max="25000"
								step="1"
								name="amount"
								bind:value={donateAmount}
								class="donate-input"
								placeholder="Other"
							/>
						</div>
						<button type="submit" class="donate-btn">
							Donate
							<IconArrowRight class="h-3.5 w-3.5" />
						</button>
					</div>
				</form>
			</div>
		</section>
	{/if}
	<!-- ═══════════════════════════════════════════════════════════
	     ABOUT — Clean, focused group description
     ═══════════════════════════════════════════════════════════ -->
	{#if config.sections.story && site.storyParagraphs.length}
		<section class="about-section" id="about">
			<div class="about-card">
				<div class="about-header">
					<div class="about-icon"><IconUsers class="h-5 w-5" /></div>
					<div>
						<p class="about-label">About us</p>
						<h2 class="about-title">Who we are</h2>
					</div>
				</div>
				<div class="about-content">
					{#each site.storyParagraphs.slice(0, 2) as paragraph}
						<AutoLinkText text={paragraph} className="about-paragraph" linkClass="about-link" />
					{/each}
				</div>
				{#if group.group_type || group.audience_focus || taxonomy.audiences?.length}
					<div class="about-tags">
						{#if group.group_type}
							<span class="tag tag-primary">{group.group_type}</span>
						{/if}
						{#if group.audience_focus}
							<span class="tag tag-secondary">{group.audience_focus}</span>
						{/if}
						{#each taxonomy.audiences.slice(0, 3) as item}
							<span class="tag tag-tonal">{item}</span>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	{/if}
	<!-- ═══════════════════════════════════════════════════════════
	     UPCOMING EVENTS — Unified section for rides/volunteer/news
     ═══════════════════════════════════════════════════════════ -->
	{#if hasEvents}
		<section class="events-section" id="events">
			<div class="events-card">
				<div class="events-header">
					<div class="events-icon"><IconNewspaper class="h-5 w-5" /></div>
					<div>
						<p class="events-label">Coming up</p>
						<h2 class="events-title">What's happening</h2>
					</div>
				</div>
				<div class="events-grid">
					{#each upcomingEvents as event}
						{@const eventDate =
							event.nextOccurrenceStart ||
							event.event_start ||
							event.published_at ||
							event.created_at}
						{@const eventHref =
							event.type === 'ride'
								? `/ride/${event.slug}`
								: event.type === 'volunteer'
									? `/volunteer/${event.slug}`
									: `/groups/${group.slug}/news?open=${event.slug}`}
						{@const eventColor =
							event.type === 'ride'
								? 'primary'
								: event.type === 'volunteer'
									? 'tertiary'
									: 'secondary'}
						{@const eventLabel =
							event.type === 'ride' ? 'Ride' : event.type === 'volunteer' ? 'Volunteer' : 'Update'}
						<a href={eventHref} class="event-card event-{event.type}">
							<div class="event-date">
								<span class="event-month"
									>{eventDate
										? new Date(eventDate).toLocaleDateString('en-US', { month: 'short' })
										: 'TBD'}</span
								>
								<span class="event-day">{eventDate ? new Date(eventDate).getDate() : '--'}</span>
							</div>
							<div class="event-content">
								<span class="event-type-badge badge-{eventColor}">{eventLabel}</span>
								<h3 class="event-title">{event.title}</h3>
								{#if event.summary || event.preview_text}
									<p class="event-summary">{event.summary || event.preview_text}</p>
								{/if}
							</div>
						</a>
					{/each}
				</div>
				{#if hasRides || hasVolunteer || hasNews}
					<div class="events-footer">
						{#if hasRides}
							<a href={groupPageHref} class="events-link">View all rides →</a>
						{/if}
						{#if hasVolunteer}
							<a href="/volunteer/groups/{group.slug}" class="events-link"
								>Volunteer opportunities →</a
							>
						{/if}
						{#if hasNews}
							<a href="/groups/{group.slug}/news" class="events-link">All updates →</a>
						{/if}
					</div>
				{/if}
			</div>
		</section>
	{/if}
	<!-- ═══════════════════════════════════════════════════════════
	     GALLERY PREVIEW — Link to full gallery page
     ═══════════════════════════════════════════════════════════ -->
	{#if config.sections.gallery && galleryImages.length}
		<section class="gallery-section" id="gallery">
			<div class="gallery-card">
				<div class="gallery-header">
					<div class="gallery-icon"><IconImage class="h-5 w-5" /></div>
					<div>
						<p class="gallery-label">Gallery</p>
						<h2 class="gallery-title">Scenes from our rides</h2>
					</div>
				</div>
				<div class="gallery-grid">
					{#each galleryImages as image, i}
						<button
							type="button"
							onclick={() => openLightbox(i)}
							class="gallery-item {i === 0 ? 'gallery-featured' : ''}"
						>
							<img src={image.href} alt={image.title} loading="lazy" />
							<div class="gallery-overlay">
								<span class="gallery-view">View</span>
							</div>
						</button>
					{/each}
				</div>
				{#if site.photoBucket?.image_assets?.length > 4}
					<div class="gallery-footer">
						<a href={galleryHref} class="gallery-link">
							View full gallery
							<IconArrowRight class="h-4 w-4" />
						</a>
					</div>
				{/if}
			</div>
		</section>
	{/if}
	<!-- ═══════════════════════════════════════════════════════════
	     CONTACT — Streamlined contact links
     ═══════════════════════════════════════════════════════════ -->
	{#if config.sections.contact && site.contactLinks.length}
		<section class="contact-section" id="contact">
			<div class="contact-card">
				<div class="contact-header">
					<div class="contact-icon"><IconHeartHandshake class="h-5 w-5" /></div>
					<div>
						<p class="contact-label-section">Get in touch</p>
						<h2 class="contact-title">Connect with us</h2>
					</div>
				</div>
				<div class="contact-links">
					{#each site.contactLinks as link}
						{@const ContactIcon = CONTACT_ICON_MAP[link.key] || IconMapPin}
						<a
							href={link.href}
							target={/^https?:\/\//i.test(link.href) ? '_blank' : undefined}
							rel={/^https?:\/\//i.test(link.href) ? 'noopener noreferrer' : undefined}
							class="contact-link"
						>
							<div class="contact-link-icon"><ContactIcon class="h-4 w-4" /></div>
							<div class="contact-link-text">
								<span class="contact-link-label">{contactLabel(link)}</span>
								<span class="contact-link-value"
									>{link.href.replace(/^mailto:/, '').replace(/^tel:/, '')}</span
								>
							</div>
							<IconArrowRight class="contact-link-arrow" />
						</a>
					{/each}
				</div>
			</div>
		</section>
	{/if}
	<!-- ═══════════════════════════════════════════════════════════
	     FOOTER — Simple, clean
     ═══════════════════════════════════════════════════════════ -->
	<footer class="site-footer">
		{#if config.footer_blurb}
			<AutoLinkText text={config.footer_blurb} className="footer-blurb" linkClass="footer-link" />
		{/if}
		<p class="footer-powered">
			Powered by <a
				href="https://3fp.org"
				target="_blank"
				rel="noopener noreferrer"
				class="footer-brand">3fp.org</a
			>
		</p>
	</footer>
</div>
<!-- ═══════════════════════════════════════════════════════════
     LIGHTBOX — For gallery images
     ═══════════════════════════════════════════════════════════ -->
{#if lightboxOpen && lightboxItems.length}
	<div
		class="lightbox-backdrop"
		role="dialog"
		tabindex="0"
		aria-modal="true"
		aria-label={lightboxItems[lightboxIndex]?.title}
		onclick={(e) => {
			if (e.target === e.currentTarget) closeLightbox();
		}}
		onkeydown={handleKeydown}
		transition:fade={{ duration: 140 }}
	>
		<div class="lightbox-panel" transition:scale={{ start: 0.98, duration: 160 }}>
			<div class="lightbox-toolbar">
				<div class="lightbox-counter">
					{lightboxIndex + 1} <span>/</span>
					{lightboxItems.length}
				</div>
				<button
					type="button"
					class="lightbox-close"
					onclick={closeLightbox}
					aria-label="Close lightbox"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/></svg
					>
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
						class="lightbox-nav lightbox-prev"
						onclick={previousImage}
						aria-label="Previous image"><IconChevronLeft class="h-5 w-5" /></button
					>
					<button
						type="button"
						class="lightbox-nav lightbox-next"
						onclick={nextImage}
						aria-label="Next image"><IconChevronRight class="h-5 w-5" /></button
					>
				{/if}
			</div>
			{#if lightboxItems.length > 1}
				<div class="lightbox-thumbnails">
					{#each lightboxItems as asset, index}
						<button
							type="button"
							class="thumbnail {index === lightboxIndex ? 'active' : ''}"
							onclick={() => (lightboxIndex = index)}
							aria-label="View image {index + 1}"
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
	/* ═══════════════════════════════════════════════════════════
   BASE STYLES & CSS VARIABLES
   ═══════════════════════════════════════════════════════════ */
	.microsite-page {
		--ms-max-width: 900px;
		--ms-gap: 1.25rem;
		--ms-padding-x: 1rem;
		--panel-bg: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		--panel-bg-dark: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		--panel-border: color-mix(in oklab, var(--color-surface-500) 16%, transparent);
		--panel-blur: 20px;

		max-width: var(--ms-max-width);
		margin: 0 auto;
		padding: var(--ms-gap) var(--ms-padding-x) 3rem;
		display: flex;
		flex-direction: column;
		gap: var(--ms-gap);
	}
	@media (min-width: 768px) {
		.microsite-page {
			--ms-padding-x: 1.5rem;
			--ms-gap: 1.5rem;
		}
	}
	/* Dark mode adjustments */
	:global([data-color-mode='dark']) .microsite-page {
		/* Variables are automatically swapped via CSS custom properties */
	}
	/* ═══════════════════════════════════════════════════════════
   NOTICE BANNER
   ═══════════════════════════════════════════════════════════ */
	.notice-banner {
		background: color-mix(in oklab, var(--color-warning-500) 15%, var(--color-surface-50));
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 30%, transparent);
		border-radius: 0.75rem;
		padding: 1rem;
	}
	.notice-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	@media (min-width: 640px) {
		.notice-content {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
	}
	.notice-text {
		font-size: 0.875rem;
		color: var(--color-surface-900);
		line-height: 1.5;
	}
	.notice-link {
		color: var(--color-warning-700);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.notice-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: var(--color-warning-500);
		color: var(--color-warning-contrast-500);
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		transition: opacity 0.15s ease;
		flex-shrink: 0;
	}
	.notice-btn:hover {
		opacity: 0.9;
	}
	/* ═══════════════════════════════════════════════════════════
   HERO SECTION — All variants
   ═══════════════════════════════════════════════════════════ */
	.hero-section {
		border-radius: 1.25rem;
		overflow: hidden;
	}
	.hero-image,
	.hero-image-full {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.hero-gradient-fallback {
		width: 100%;
		height: 100%;
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--color-primary-500) 30%, transparent),
			color-mix(in oklab, var(--color-secondary-500) 25%, transparent)
		);
	}
	.hero-gradient-fallback-full {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--color-primary-500) 30%, transparent),
			color-mix(in oklab, var(--color-secondary-500) 25%, transparent)
		);
	}
	/* ─────────────────────────────────────────────────────────
   HERO: BOLD (Diagonal split)
   ───────────────────────────────────────────────────────── */
	.hero-bold {
		position: relative;
		aspect-ratio: 21/9;
		min-height: 320px;
		background: var(--color-surface-950);
	}
	@media (max-width: 768px) {
		.hero-bold {
			aspect-ratio: 16/10;
			min-height: 400px;
		}
	}
	.hero-bold-bg {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			105deg,
			color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-950)) 0%,
			color-mix(in oklab, var(--color-surface-950) 95%, transparent) 55%
		);
		clip-path: polygon(0 0, 60% 0, 45% 100%, 0 100%);
	}
	@media (max-width: 768px) {
		.hero-bold-bg {
			clip-path: polygon(0 0, 70% 0, 55% 100%, 0 100%);
		}
	}
	.hero-bold-image-wrap {
		position: absolute;
		inset: 0;
		clip-path: polygon(55% 0, 100% 0, 100% 100%, 40% 100%);
	}
	@media (max-width: 768px) {
		.hero-bold-image-wrap {
			clip-path: polygon(65% 0, 100% 0, 100% 100%, 50% 100%);
		}
	}
	.hero-content {
		position: relative;
		z-index: 10;
		height: 100%;
		display: flex;
		align-items: flex-end;
		padding: 1.5rem;
	}
	@media (min-width: 768px) {
		.hero-content {
			padding: 2rem;
		}
	}
	.hero-card {
		background: color-mix(in oklab, var(--color-surface-950) 85%, transparent);
		backdrop-filter: blur(12px);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 8%, transparent);
		border-radius: 1rem;
		padding: 1.25rem;
		max-width: 500px;
	}
	@media (min-width: 768px) {
		.hero-card {
			padding: 1.5rem;
		}
	}
	.location-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: var(--color-primary-200);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0.5rem 0.75rem;
		border-radius: 9999px;
		margin-bottom: 0.75rem;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.hero-logo {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.75rem;
		object-fit: cover;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		border: 2px solid color-mix(in oklab, var(--color-surface-50) 20%, transparent);
		flex-shrink: 0;
	}
	@media (min-width: 768px) {
		.hero-logo {
			width: 4.5rem;
			height: 4.5rem;
		}
	}
	.hero-title {
		font-size: 1.75rem;
		font-weight: 900;
		line-height: 1.1;
		color: var(--color-primary-50);
		text-shadow: 0 2px 20px rgba(0, 0, 0, 0.4);
	}
	@media (min-width: 768px) {
		.hero-title {
			font-size: 2.25rem;
		}
	}
	.hero-tagline {
		font-size: 0.9375rem;
		color: var(--color-surface-100);
		margin-top: 0.75rem;
		line-height: 1.5;
		display: block;
	}
	.hero-tagline-link {
		color: var(--color-surface-50);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.hero-ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.hero-cta {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 700;
		padding: 0.625rem 1.25rem;
		border-radius: 9999px;
		transition: all 0.15s ease;
	}
	.cta-primary {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		box-shadow: 0 4px 14px color-mix(in oklab, var(--color-primary-500) 40%, transparent);
	}
	.cta-primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 20px color-mix(in oklab, var(--color-primary-500) 50%, transparent);
	}
	.cta-secondary {
		background: color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		color: var(--color-surface-100);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 15%, transparent);
	}
	.cta-secondary:hover {
		background: color-mix(in oklab, var(--color-surface-50) 18%, transparent);
	}
	/* ─────────────────────────────────────────────────────────
   HERO: ORBIT (Centered floating card)
   ───────────────────────────────────────────────────────── */
	.hero-orbit {
		position: relative;
		aspect-ratio: 21/9;
		min-height: 320px;
		background: var(--color-surface-950);
		overflow: hidden;
	}
	@media (max-width: 768px) {
		.hero-orbit {
			aspect-ratio: 16/11;
		}
	}
	.hero-orbit-vignette {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to bottom,
			color-mix(in oklab, var(--color-surface-950) 80%, transparent),
			color-mix(in oklab, var(--color-surface-950) 50%, transparent),
			color-mix(in oklab, var(--color-surface-950) 70%, transparent)
		);
	}
	.hero-orbit-content {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.25rem;
	}
	.hero-orbit-card {
		position: relative;
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		backdrop-filter: blur(20px);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 10%, transparent);
		border-radius: 1.25rem;
		padding: 1.5rem;
		text-align: center;
		max-width: 400px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
	}
	.hero-orbit-card::before {
		content: '';
		position: absolute;
		inset: -2px;
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--color-primary-500) 40%, transparent),
			color-mix(in oklab, var(--color-secondary-500) 30%, transparent)
		);
		border-radius: 1.35rem;
		z-index: -1;
		opacity: 0.6;
		filter: blur(16px);
	}
	.hero-logo-center {
		width: 4rem;
		height: 4rem;
		border-radius: 1rem;
		object-fit: cover;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		border: 2px solid color-mix(in oklab, var(--color-surface-50) 30%, transparent);
		margin: 0 auto;
	}
	@media (min-width: 768px) {
		.hero-logo-center {
			width: 5rem;
			height: 5rem;
		}
	}
	.hero-location {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-surface-400);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		margin-top: 1rem;
	}
	.hero-title-center {
		font-size: 1.75rem;
		font-weight: 900;
		color: var(--color-surface-50);
		margin-top: 0.5rem;
		text-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
	}
	@media (min-width: 768px) {
		.hero-title-center {
			font-size: 2.5rem;
		}
	}
	.hero-tagline-center {
		font-size: 0.9375rem;
		color: var(--color-surface-300);
		margin-top: 0.5rem;
		line-height: 1.5;
		display: block;
	}
	.hero-ctas-center {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}
	/* ─────────────────────────────────────────────────────────
   HERO: IMMERSIVE (Classic gradient overlay)
   ───────────────────────────────────────────────────────── */
	.hero-immersive {
		position: relative;
		aspect-ratio: 21/9;
		min-height: 320px;
		overflow: hidden;
		border-radius: 1.25rem;
	}
	@media (max-width: 768px) {
		.hero-immersive {
			aspect-ratio: 16/10;
		}
	}
	.hero-immersive-gradient {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			var(--color-surface-950) 0%,
			color-mix(in oklab, var(--color-surface-950) 60%, transparent) 50%,
			color-mix(in oklab, var(--color-surface-950) 40%, transparent) 100%
		);
	}
	.hero-immersive-content {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 1.25rem;
	}
	@media (min-width: 768px) {
		.hero-immersive-content {
			padding: 1.5rem;
		}
	}
	.hero-immersive-header {
		display: flex;
		align-items: flex-start;
	}
	.title-block {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
	}
	.hero-logo-immersive {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.75rem;
		object-fit: cover;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		border: 2px solid color-mix(in oklab, var(--color-surface-50) 20%, transparent);
		flex-shrink: 0;
	}
	@media (min-width: 768px) {
		.hero-logo-immersive {
			width: 4.5rem;
			height: 4.5rem;
		}
	}
	.hero-logo-fallback {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.75rem;
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		flex-shrink: 0;
	}
	@media (min-width: 768px) {
		.hero-logo-fallback {
			width: 4.5rem;
			height: 4.5rem;
		}
	}
	.title-text {
		padding-bottom: 0.25rem;
	}
	.hero-location-immersive {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-surface-400);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		margin-bottom: 0.25rem;
	}
	.hero-title-immersive {
		font-size: 1.5rem;
		font-weight: 900;
		color: var(--color-surface-50);
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
	}
	@media (min-width: 768px) {
		.hero-title-immersive {
			font-size: 2rem;
		}
	}
	.hero-immersive-footer {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	@media (min-width: 640px) {
		.hero-immersive-footer {
			flex-direction: row;
			align-items: flex-end;
			justify-content: space-between;
		}
	}
	.hero-tagline-immersive {
		font-size: 1rem;
		color: var(--color-surface-200);
		line-height: 1.5;
		max-width: 28rem;
	}
	.hero-ctas-immersive {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	/* ═══════════════════════════════════════════════════════════
   QUICK INFO BAR
   ═══════════════════════════════════════════════════════════ */
	.quick-info {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.25rem;
	}
	:global([data-color-mode='dark']) .quick-info {
		background: var(--panel-bg-dark);
	}
	.quick-info-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}
	@media (min-width: 768px) {
		.quick-info-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.quick-info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.quick-info-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-primary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .quick-info-label {
		color: var(--color-primary-400);
	}
	.quick-info-value {
		font-size: 0.875rem;
		color: var(--color-surface-900);
		line-height: 1.4;
	}
	:global([data-color-mode='dark']) .quick-info-value {
		color: var(--color-surface-100);
	}
	.quick-info-link {
		font-size: 0.875rem;
		color: var(--color-surface-900);
		line-height: 1.4;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.15s ease;
	}
	.quick-info-link:hover {
		color: var(--color-primary-500);
	}
	:global([data-color-mode='dark']) .quick-info-link {
		color: var(--color-surface-100);
	}
	:global([data-color-mode='dark']) .quick-info-link:hover {
		color: var(--color-primary-400);
	}
	/* ═══════════════════════════════════════════════════════════
   NEW RIDER NOTE
   ═══════════════════════════════════════════════════════════ */
	.new-rider-note {
		background: color-mix(in oklab, var(--color-tertiary-500) 10%, var(--panel-bg));
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid color-mix(in oklab, var(--color-tertiary-500) 25%, var(--panel-border));
		border-radius: 1rem;
		padding: 1.25rem;
	}
	:global([data-color-mode='dark']) .new-rider-note {
		background: color-mix(in oklab, var(--color-tertiary-500) 12%, var(--panel-bg-dark));
	}
	.note-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-tertiary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		margin-bottom: 0.5rem;
	}
	:global([data-color-mode='dark']) .note-label {
		color: var(--color-tertiary-400);
	}
	.note-text {
		font-size: 0.9375rem;
		color: var(--color-surface-800);
		line-height: 1.6;
	}
	:global([data-color-mode='dark']) .note-text {
		color: var(--color-surface-200);
	}
	.note-link {
		color: var(--color-primary-600);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global([data-color-mode='dark']) .note-link {
		color: var(--color-primary-400);
	}
	/* ═══════════════════════════════════════════════════════════
   DONATE SECTION
   ═══════════════════════════════════════════════════════════ */
	.donate-section {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.25rem;
	}
	:global([data-color-mode='dark']) .donate-section {
		background: var(--panel-bg-dark);
	}
	.donate-header {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--panel-border);
	}
	@media (min-width: 640px) {
		.donate-header {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
	}
	.donate-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-surface-900);
	}
	:global([data-color-mode='dark']) .donate-title {
		color: var(--color-surface-100);
	}
	.donate-presets {
		display: flex;
		gap: 0.5rem;
	}
	.donate-preset {
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.5rem 0.875rem;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		color: var(--color-surface-700);
		transition: all 0.15s ease;
	}
	.donate-preset:hover {
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}
	.donate-preset.active {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	.donate-input-row {
		display: flex;
		gap: 0.75rem;
	}
	.donate-input-wrap {
		position: relative;
		flex: 1;
	}
	.donate-currency {
		position: absolute;
		left: 1rem;
		top: 50%;
		transform: translateY(-50%);
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-surface-500);
		pointer-events: none;
	}
	.donate-input {
		width: 100%;
		height: 2.75rem;
		padding-left: 2rem;
		padding-right: 1rem;
		font-size: 1rem;
		font-weight: 600;
		background: color-mix(in oklab, var(--color-surface-500) 8%, transparent);
		border: 1px solid transparent;
		border-radius: 0.75rem;
		color: var(--color-surface-900);
		transition: border-color 0.15s ease;
	}
	.donate-input:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}
	:global([data-color-mode='dark']) .donate-input {
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		color: var(--color-surface-100);
	}
	.donate-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
		font-size: 0.875rem;
		font-weight: 700;
		padding: 0 1.25rem;
		border-radius: 0.75rem;
		transition: opacity 0.15s ease;
		flex-shrink: 0;
	}
	.donate-btn:hover {
		opacity: 0.9;
	}
	/* ═══════════════════════════════════════════════════════════
   ABOUT SECTION
   ═══════════════════════════════════════════════════════════ */
	.about-section {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.5rem;
	}
	:global([data-color-mode='dark']) .about-section {
		background: var(--panel-bg-dark);
	}
	.about-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin-bottom: 1.25rem;
	}
	.about-icon {
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.about-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-secondary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .about-label {
		color: var(--color-secondary-400);
	}
	.about-title {
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--color-surface-900);
		line-height: 1.2;
	}
	:global([data-color-mode='dark']) .about-title {
		color: var(--color-surface-100);
	}
	.about-content {
		margin-bottom: 1.25rem;
	}
	.about-paragraph {
		font-size: 0.9375rem;
		color: var(--color-surface-700);
		line-height: 1.7;
		display: block;
	}
	.about-paragraph + .about-paragraph {
		margin-top: 0.75rem;
	}
	:global([data-color-mode='dark']) .about-paragraph {
		color: var(--color-surface-300);
	}
	.about-link {
		color: var(--color-primary-600);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global([data-color-mode='dark']) .about-link {
		color: var(--color-primary-400);
	}
	.about-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--panel-border);
	}
	.tag {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.375rem 0.75rem;
		border-radius: 9999px;
	}
	.tag-primary {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	.tag-secondary {
		background: var(--color-secondary-500);
		color: var(--color-secondary-contrast-500);
	}
	.tag-tonal {
		background: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		color: var(--color-surface-700);
	}
	:global([data-color-mode='dark']) .tag-tonal {
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		color: var(--color-surface-300);
	}
	/* ═══════════════════════════════════════════════════════════
   EVENTS SECTION (Unified rides/volunteer/news)
   ═══════════════════════════════════════════════════════════ */
	.events-section {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.5rem;
	}
	:global([data-color-mode='dark']) .events-section {
		background: var(--panel-bg-dark);
	}
	.events-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin-bottom: 1.25rem;
	}
	.events-icon {
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, var(--color-secondary-500), var(--color-tertiary-500));
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.events-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-secondary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .events-label {
		color: var(--color-secondary-400);
	}
	.events-title {
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--color-surface-900);
		line-height: 1.2;
	}
	:global([data-color-mode='dark']) .events-title {
		color: var(--color-surface-100);
	}
	.events-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.event-card {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: color-mix(in oklab, var(--color-surface-500) 5%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		border-radius: 0.75rem;
		transition: all 0.15s ease;
	}
	.event-card:hover {
		transform: translateY(-2px);
		background: color-mix(in oklab, var(--color-surface-500) 8%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}
	.event-date {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 3.5rem;
		background: var(--panel-bg);
		border: 1px solid var(--panel-border);
		border-radius: 0.5rem;
		padding: 0.5rem;
	}
	:global([data-color-mode='dark']) .event-date {
		background: var(--panel-bg-dark);
	}
	.event-month {
		font-size: 0.625rem;
		font-weight: 700;
		color: var(--color-surface-500);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	:global([data-color-mode='dark']) .event-month {
		color: var(--color-surface-400);
	}
	.event-day {
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--color-surface-900);
	}
	:global([data-color-mode='dark']) .event-day {
		color: var(--color-surface-100);
	}
	.event-content {
		flex: 1;
		min-width: 0;
	}
	.event-type-badge {
		display: inline-block;
		font-size: 0.625rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		margin-bottom: 0.375rem;
	}
	.badge-primary {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	.badge-secondary {
		background: var(--color-secondary-500);
		color: var(--color-secondary-contrast-500);
	}
	.badge-tertiary {
		background: var(--color-tertiary-500);
		color: var(--color-tertiary-contrast-500);
	}
	.event-title {
		font-size: 0.9375rem;
		font-weight: 700;
		color: var(--color-surface-900);
		line-height: 1.3;
		margin-bottom: 0.25rem;
	}
	:global([data-color-mode='dark']) .event-title {
		color: var(--color-surface-100);
	}
	.event-card:hover .event-title {
		color: var(--color-primary-500);
	}
	:global([data-color-mode='dark']) .event-card:hover .event-title {
		color: var(--color-primary-400);
	}
	.event-summary {
		font-size: 0.8125rem;
		color: var(--color-surface-600);
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	:global([data-color-mode='dark']) .event-summary {
		color: var(--color-surface-400);
	}
	.events-footer {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--panel-border);
	}
	.events-link {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-600);
		transition: color 0.15s ease;
	}
	.events-link:hover {
		color: var(--color-primary-500);
	}
	:global([data-color-mode='dark']) .events-link {
		color: var(--color-surface-400);
	}
	:global([data-color-mode='dark']) .events-link:hover {
		color: var(--color-primary-400);
	}
	/* ═══════════════════════════════════════════════════════════
   GALLERY SECTION
   ═══════════════════════════════════════════════════════════ */
	.gallery-section {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.5rem;
	}
	:global([data-color-mode='dark']) .gallery-section {
		background: var(--panel-bg-dark);
	}
	.gallery-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin-bottom: 1.25rem;
	}
	.gallery-icon {
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, var(--color-tertiary-500), var(--color-primary-500));
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.gallery-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-tertiary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .gallery-label {
		color: var(--color-tertiary-400);
	}
	.gallery-title {
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--color-surface-900);
		line-height: 1.2;
	}
	:global([data-color-mode='dark']) .gallery-title {
		color: var(--color-surface-100);
	}
	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}
	@media (min-width: 640px) {
		.gallery-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	@media (min-width: 768px) {
		.gallery-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.gallery-item {
		position: relative;
		aspect-ratio: 1;
		border-radius: 0.5rem;
		overflow: hidden;
		cursor: pointer;
	}
	.gallery-item.gallery-featured {
		grid-column: span 2;
		grid-row: span 2;
		aspect-ratio: auto;
	}
	@media (max-width: 639px) {
		.gallery-item.gallery-featured {
			grid-column: span 2;
			grid-row: span 1;
			aspect-ratio: 2/1;
		}
	}
	.gallery-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.4s ease;
	}
	.gallery-item:hover img {
		transform: scale(1.05);
	}
	.gallery-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0.75rem;
		opacity: 0;
		transition: opacity 0.2s ease;
	}
	.gallery-item:hover .gallery-overlay {
		opacity: 1;
	}
	.gallery-view {
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
		background: rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(4px);
		padding: 0.375rem 1rem;
		border-radius: 9999px;
	}
	.gallery-footer {
		margin-top: 1rem;
		text-align: center;
	}
	.gallery-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-600);
		transition: color 0.15s ease;
	}
	.gallery-link:hover {
		color: var(--color-primary-500);
	}
	:global([data-color-mode='dark']) .gallery-link {
		color: var(--color-surface-400);
	}
	:global([data-color-mode='dark']) .gallery-link:hover {
		color: var(--color-primary-400);
	}
	/* ═══════════════════════════════════════════════════════════
   CONTACT SECTION
   ═══════════════════════════════════════════════════════════ */
	.contact-section {
		background: var(--panel-bg);
		backdrop-filter: blur(var(--panel-blur));
		border: 1px solid var(--panel-border);
		border-radius: 1rem;
		padding: 1.5rem;
	}
	:global([data-color-mode='dark']) .contact-section {
		background: var(--panel-bg-dark);
	}
	.contact-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		margin-bottom: 1.25rem;
	}
	.contact-icon {
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-tertiary-500));
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.contact-label-section {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-primary-600);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	:global([data-color-mode='dark']) .contact-label-section {
		color: var(--color-primary-400);
	}
	.contact-title {
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--color-surface-900);
		line-height: 1.2;
	}
	:global([data-color-mode='dark']) .contact-title {
		color: var(--color-surface-100);
	}
	.contact-links {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.contact-link {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem;
		border-radius: 0.625rem;
		transition: all 0.15s ease;
	}
	.contact-link:hover {
		background: color-mix(in oklab, var(--color-surface-500) 8%, transparent);
	}
	.contact-link-icon {
		width: 2.5rem;
		height: 2.5rem;
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
		border-radius: 9999px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-primary-700);
		flex-shrink: 0;
		transition: all 0.15s ease;
	}
	.contact-link:hover .contact-link-icon {
		background: var(--color-primary-500);
		color: var(--color-primary-contrast-500);
	}
	:global([data-color-mode='dark']) .contact-link-icon {
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: var(--color-primary-300);
	}
	.contact-link-text {
		flex: 1;
		min-width: 0;
	}
	.contact-link-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-900);
		display: block;
	}
	:global([data-color-mode='dark']) .contact-link-label {
		color: var(--color-surface-100);
	}
	.contact-link-value {
		font-size: 0.75rem;
		color: var(--color-surface-500);
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global([data-color-mode='dark']) .contact-link-value {
		color: var(--color-surface-400);
	}
	.contact-link-arrow {
		width: 1rem;
		height: 1rem;
		color: var(--color-surface-400);
		flex-shrink: 0;
		transition: all 0.15s ease;
	}
	.contact-link:hover .contact-link-arrow {
		color: var(--color-primary-500);
		transform: translateX(2px);
	}
	:global([data-color-mode='dark']) .contact-link:hover .contact-link-arrow {
		color: var(--color-primary-400);
	}
	/* ═══════════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════════ */
	.site-footer {
		text-align: center;
		padding-top: 2rem;
		border-top: 1px solid var(--panel-border);
		margin-top: 1rem;
	}
	.footer-blurb {
		font-size: 0.875rem;
		color: var(--color-surface-600);
		max-width: 36rem;
		margin: 0 auto 0.75rem;
		line-height: 1.6;
	}
	:global([data-color-mode='dark']) .footer-blurb {
		color: var(--color-surface-400);
	}
	.footer-link {
		color: var(--color-primary-600);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global([data-color-mode='dark']) .footer-link {
		color: var(--color-primary-400);
	}
	.footer-powered {
		font-size: 0.75rem;
		color: var(--color-surface-500);
		font-weight: 600;
	}
	:global([data-color-mode='dark']) .footer-powered {
		color: var(--color-surface-500);
	}
	.footer-brand {
		color: var(--color-primary-600);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global([data-color-mode='dark']) .footer-brand {
		color: var(--color-primary-400);
	}
	/* ═══════════════════════════════════════════════════════════
   LIGHTBOX
   ═══════════════════════════════════════════════════════════ */
	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20000;
		background: color-mix(in oklab, var(--color-surface-950) 95%, transparent);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
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
		color: var(--color-surface-100);
	}
	.lightbox-counter span {
		color: var(--color-surface-500);
	}
	.lightbox-close {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: 0.5rem;
		color: var(--color-surface-100);
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
		max-height: 60vh;
		object-fit: contain;
		border-radius: 0.5rem;
	}
	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-950) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-50) 15%, transparent);
		color: var(--color-surface-100);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		opacity: 0.7;
	}
	.lightbox-nav:hover {
		opacity: 1;
		background: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
	}
	.lightbox-prev {
		left: 1rem;
	}
	.lightbox-next {
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
	.thumbnail {
		flex-shrink: 0;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.375rem;
		overflow: hidden;
		border: 2px solid transparent;
		transition: all 0.15s ease;
		opacity: 0.6;
	}
	.thumbnail:hover,
	.thumbnail.active {
		opacity: 1;
		border-color: var(--color-primary-500);
	}
	.thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* ═══════════════════════════════════════════════════════════
   PANEL STYLE VARIANTS
   ═══════════════════════════════════════════════════════════ */
	.microsite-page.panel-filled .quick-info,
	.microsite-page.panel-filled .new-rider-note,
	.microsite-page.panel-filled .donate-section,
	.microsite-page.panel-filled .about-section,
	.microsite-page.panel-filled .events-section,
	.microsite-page.panel-filled .gallery-section,
	.microsite-page.panel-filled .contact-section {
		backdrop-filter: none;
	}
	.microsite-page.panel-outlined .quick-info,
	.microsite-page.panel-outlined .new-rider-note,
	.microsite-page.panel-outlined .donate-section,
	.microsite-page.panel-outlined .about-section,
	.microsite-page.panel-outlined .events-section,
	.microsite-page.panel-outlined .gallery-section,
	.microsite-page.panel-outlined .contact-section {
		--panel-blur: 8px;
	}
	/* ═══════════════════════════════════════════════════════════
   ANIMATIONS
   ═══════════════════════════════════════════════════════════ */
	@keyframes fade-in-up {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.microsite-page > section {
		animation: fade-in-up 0.5s ease-out forwards;
		opacity: 0;
	}
	.microsite-page > section:nth-child(1) {
		animation-delay: 0.05s;
	}
	.microsite-page > section:nth-child(2) {
		animation-delay: 0.1s;
	}
	.microsite-page > section:nth-child(3) {
		animation-delay: 0.15s;
	}
	.microsite-page > section:nth-child(4) {
		animation-delay: 0.2s;
	}
	.microsite-page > section:nth-child(5) {
		animation-delay: 0.25s;
	}
	.microsite-page > section:nth-child(6) {
		animation-delay: 0.3s;
	}
	.microsite-page > section:nth-child(7) {
		animation-delay: 0.35s;
	}
	.microsite-page > section:nth-child(8) {
		animation-delay: 0.4s;
	}
	.site-footer {
		animation: fade-in-up 0.5s ease-out 0.45s forwards;
		opacity: 0;
	}
</style>
