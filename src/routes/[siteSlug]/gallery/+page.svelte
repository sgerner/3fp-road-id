<script>
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconImage from '@lucide/svelte/icons/image';
	import IconX from '@lucide/svelte/icons/x';
	import { fade, scale } from 'svelte/transition';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const pageStyleClass = $derived(
		`hero-mode-${site.siteConfig?.hero_style || 'immersive'} panel-${site.siteConfig?.panel_style || 'glass'} tone-${site.siteConfig?.panel_tone || 'surface'}`
	);
	const galleryImages = $derived(site.photoBucket?.image_assets || []);
	const photoCountLabel = $derived(
		galleryImages.length === 1 ? '1 photo' : `${galleryImages.length} photos`
	);

	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	function openLightbox(index) {
		lightboxIndex = index;
		lightboxOpen = true;
	}

	function closeLightbox() {
		lightboxOpen = false;
	}

	function previousImage() {
		if (!galleryImages.length) return;
		lightboxIndex = lightboxIndex <= 0 ? galleryImages.length - 1 : lightboxIndex - 1;
	}

	function nextImage() {
		if (!galleryImages.length) return;
		lightboxIndex = lightboxIndex >= galleryImages.length - 1 ? 0 : lightboxIndex + 1;
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
	<title>Gallery — {site.siteConfig?.site_title || group?.name || 'Gallery'}</title>
	<meta
		name="description"
		content="Photo gallery for {site.siteConfig?.site_title ||
			group?.name}. See moments from rides and events."
	/>
</svelte:head>

<div class="microsite-page mx-auto max-w-7xl {pageStyleClass} pb-14">
	<section class="mx-auto w-full max-w-5xl px-4 pt-6 md:px-6" in:fade={{ duration: 220 }}>
		<div class="gallery-hero rounded-2xl p-5 sm:p-6">
			<div class="flex items-start gap-4">
				<div class="gallery-icon"><IconImage class="h-5 w-5" /></div>
				<div class="min-w-0">
					<div class="mb-1.5 flex flex-wrap items-center gap-2">
						<span
							class="chip preset-filled-secondary-500 text-[0.65rem] font-semibold tracking-[0.2em] uppercase"
							>Gallery</span
						>
						<span class="hero-meta">{photoCountLabel}</span>
					</div>
					<h1 class="hero-title">Photo gallery</h1>
					<p class="hero-copy">
						Moments from rides, events, and community days with {site.siteConfig?.site_title ||
							group?.name}.
					</p>
				</div>
			</div>
		</div>
	</section>

	<section class="mx-auto w-full max-w-5xl px-4 py-5 md:px-6">
		{#if galleryImages.length === 0}
			<div class="empty-state glass-card border-surface-500/20 rounded-2xl border">
				<IconImage class="h-12 w-12" />
				<p class="empty-title">No photos yet</p>
				<p class="empty-text">Photos from rides and events will appear here.</p>
			</div>
		{:else}
			<div class="gallery-grid">
				{#each galleryImages as image, i}
					<button
						type="button"
						onclick={() => openLightbox(i)}
						class="gallery-item"
						style="--stagger: {i}"
					>
						<img src={image.href} alt={image.title} loading="lazy" />
						<div class="gallery-overlay">
							<span class="gallery-view">View photo</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</section>
</div>

{#if lightboxOpen && galleryImages.length}
	<div
		class="lightbox-backdrop"
		role="dialog"
		tabindex="0"
		aria-modal="true"
		aria-label={galleryImages[lightboxIndex]?.title}
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
					{galleryImages.length}
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
					src={galleryImages[lightboxIndex]?.href}
					alt={galleryImages[lightboxIndex]?.title}
					class="lightbox-image"
				/>
				{#if galleryImages.length > 1}
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
			{#if galleryImages.length > 1}
				<div class="lightbox-thumbnails">
					{#each galleryImages as asset, index}
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
	.gallery-hero {
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-50) 92%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 24%, transparent);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
	}

	:global([data-color-mode='dark']) .gallery-hero {
		background: color-mix(in oklab, var(--color-primary-500) 14%, var(--color-surface-950) 86%);
		border-color: color-mix(in oklab, var(--color-primary-400) 26%, transparent);
	}

	.gallery-icon {
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 0.7rem;
		background: linear-gradient(135deg, var(--color-tertiary-500), var(--color-primary-500));
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--color-surface-50);
		flex-shrink: 0;
	}

	.hero-title {
		color: color-mix(in oklab, var(--color-surface-950) 92%, transparent);
		font-size: clamp(1.35rem, 2.2vw, 1.8rem);
		font-weight: 800;
		line-height: 1.2;
	}

	.hero-copy {
		margin-top: 0.35rem;
		color: color-mix(in oklab, var(--color-surface-950) 68%, transparent);
		font-size: 0.95rem;
	}

	.hero-meta {
		color: color-mix(in oklab, var(--color-surface-950) 64%, transparent);
		font-size: 0.77rem;
		font-weight: 600;
	}

	:global([data-color-mode='dark']) .hero-title {
		color: color-mix(in oklab, var(--color-surface-50) 95%, transparent);
	}

	:global([data-color-mode='dark']) .hero-copy,
	:global([data-color-mode='dark']) .hero-meta {
		color: color-mix(in oklab, var(--color-surface-50) 72%, transparent);
	}

	.glass-card {
		background: color-mix(in oklab, var(--color-surface-50) 80%, transparent);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
	}

	:global([data-color-mode='dark']) .glass-card {
		background: color-mix(in oklab, var(--color-surface-950) 84%, transparent);
	}

	.empty-state {
		text-align: center;
		padding: 4rem 1rem;
		color: var(--color-surface-600);
	}

	.empty-state :global(svg) {
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.empty-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: color-mix(in oklab, var(--color-surface-950) 90%, transparent);
		margin-bottom: 0.5rem;
	}

	.empty-text {
		font-size: 0.92rem;
		color: color-mix(in oklab, var(--color-surface-950) 62%, transparent);
	}

	:global([data-color-mode='dark']) .empty-title {
		color: color-mix(in oklab, var(--color-surface-50) 92%, transparent);
	}

	:global([data-color-mode='dark']) .empty-text,
	:global([data-color-mode='dark']) .empty-state {
		color: color-mix(in oklab, var(--color-surface-50) 68%, transparent);
	}

	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
	}

	@media (min-width: 640px) {
		.gallery-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.75rem;
		}
	}

	@media (min-width: 1024px) {
		.gallery-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.9rem;
		}
	}

	@media (min-width: 1440px) {
		.gallery-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	.gallery-item {
		position: relative;
		aspect-ratio: 4 / 5;
		border-radius: 0.75rem;
		overflow: hidden;
		cursor: pointer;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 16%, transparent);
		animation: fade-in-up 420ms ease-out forwards;
		opacity: 0;
		animation-delay: calc(var(--stagger, 0) * 0.03s);
	}

	.gallery-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.35s ease;
	}

	.gallery-item:hover img {
		transform: scale(1.04);
	}

	.gallery-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent 60%);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0.9rem;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.gallery-item:hover .gallery-overlay {
		opacity: 1;
	}

	.gallery-view {
		font-size: 0.8rem;
		font-weight: 600;
		color: white;
		background: rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(4px);
		padding: 0.42rem 0.95rem;
		border-radius: 9999px;
	}

	@keyframes fade-in-up {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20000;
		background: color-mix(in oklab, var(--color-surface-950) 95%, transparent);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem;
	}

	.lightbox-panel {
		position: relative;
		width: min(98vw, 1800px);
		height: min(98dvh, 1200px);
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
		padding: 0.55rem 0.85rem;
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
		padding: 0.6rem;
	}

	.lightbox-image {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
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
		gap: 0.45rem;
		padding: 0.5rem 0.75rem;
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
		width: 3rem;
		height: 3rem;
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
</style>
