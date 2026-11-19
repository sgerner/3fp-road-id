<script>
	import IconImage from '@lucide/svelte/icons/image';
	import MicrositeGalleryLightbox from '#lib/components/microsites/MicrositeGalleryLightbox.svelte';
	import { LAZY_IMAGE_PLACEHOLDER, lazyImage } from '#lib/media/lazyImage';
	import { optimizedImageUrl } from '#lib/media/optimized';
	import { fade } from 'svelte/transition';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const pageStyleClass = $derived(
		`hero-mode-${site.siteConfig?.hero_style || 'immersive'} panel-${site.siteConfig?.panel_style || 'glass'} tone-${site.siteConfig?.panel_tone || 'surface'}`
	);
	const galleryImages = $derived(site.photoBucket?.image_assets || []);
	const galleryImageSizes =
		'(min-width: 1440px) 300px, (min-width: 1024px) 31vw, (min-width: 640px) 31vw, calc(50vw - 1.5rem)';
	const photoCountLabel = $derived(
		galleryImages.length === 1 ? '1 photo' : `${galleryImages.length} photos`
	);

	function galleryImageSrc(href) {
		return optimizedImageUrl(href, { width: 800, quality: 66 });
	}

	function galleryImageSrcSet(href) {
		return [480, 800, 1200]
			.map(
				(width) =>
					`${optimizedImageUrl(href, { width, quality: width === 1200 ? 68 : 66 })} ${width}w`
			)
			.join(', ');
	}

	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	function openLightbox(index) {
		lightboxIndex = index;
		lightboxOpen = true;
	}

	function closeLightbox() {
		lightboxOpen = false;
	}
</script>

<svelte:head>
	<title>Gallery — {site.siteConfig?.site_title || group?.name || 'Gallery'}</title>
	<meta
		name="description"
		content="Photo gallery for {site.siteConfig?.site_title ||
			group?.name}. See moments from rides and events."
	/>
	{#if galleryImages[0]?.href}
		<link
			rel="preload"
			as="image"
			href={galleryImageSrc(galleryImages[0].href)}
			imagesrcset={galleryImageSrcSet(galleryImages[0].href)}
			imagesizes={galleryImageSizes}
			fetchpriority="high"
		/>
	{/if}
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
						data-scroll-reveal="stagger"
						style="--stagger: {i}"
					>
						{#if i === 0}
							<img
								src={galleryImageSrc(image.href)}
								srcset={galleryImageSrcSet(image.href)}
								sizes={galleryImageSizes}
								alt={image.title}
								loading="eager"
								fetchpriority="high"
								decoding="async"
							/>
						{:else}
							<img
								src={LAZY_IMAGE_PLACEHOLDER}
								data-src={galleryImageSrc(image.href)}
								data-srcset={galleryImageSrcSet(image.href)}
								data-sizes={galleryImageSizes}
								data-root-margin="80px 0px"
								alt={image.title}
								loading="lazy"
								decoding="async"
								use:lazyImage
							/>
						{/if}
						<noscript>
							<img
								src={galleryImageSrc(image.href)}
								srcset={galleryImageSrcSet(image.href)}
								sizes={galleryImageSizes}
								alt={image.title}
							/>
						</noscript>
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
	<MicrositeGalleryLightbox
		images={galleryImages}
		startIndex={lightboxIndex}
		onClose={closeLightbox}
	/>
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
</style>
