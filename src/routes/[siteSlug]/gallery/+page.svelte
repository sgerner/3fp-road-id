<script>
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconImage from '@lucide/svelte/icons/image';
	import IconX from '@lucide/svelte/icons/x';
	import { fade, scale } from 'svelte/transition';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const basePath = $derived(site.basePath || '');
	const homeHref = $derived(basePath || '/');
	const galleryImages = $derived(site.photoBucket?.image_assets || []);

	// Lightbox state
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
			group?.name}. See moments from our rides and events."
	/>
</svelte:head>

<div class="gallery-page">
	<!-- Back button -->
	<a href={homeHref} class="back-link">
		<IconArrowLeft class="h-4 w-4" />
		<span>Back to {site.siteConfig?.site_title || group?.name}</span>
	</a>

	<!-- Header -->
	<div class="gallery-header">
		<div class="gallery-icon">
			<IconImage class="h-5 w-5" />
		</div>
		<div>
			<p class="gallery-label">Gallery</p>
			<h1 class="gallery-title">
				{#if galleryImages.length === 0}
					No photos yet
				{:else if galleryImages.length === 1}
					1 photo
				{:else}
					{galleryImages.length} photos
				{/if}
			</h1>
		</div>
	</div>

	<!-- Gallery Grid -->
	{#if galleryImages.length === 0}
		<div class="empty-state">
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
						<span class="gallery-view">View</span>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Lightbox -->
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
	.gallery-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	@media (min-width: 768px) {
		.gallery-page {
			padding: 2rem;
			gap: 2rem;
		}
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-600);
		transition: color 0.15s ease;
		width: fit-content;
	}

	.back-link:hover {
		color: var(--color-primary-500);
	}

	:global([data-color-mode='dark']) .back-link {
		color: var(--color-surface-400);
	}

	:global([data-color-mode='dark']) .back-link:hover {
		color: var(--color-primary-400);
	}

	.gallery-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}

	.gallery-icon {
		width: 2.5rem;
		height: 2.5rem;
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
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--color-surface-900);
		line-height: 1.2;
	}

	@media (min-width: 768px) {
		.gallery-title {
			font-size: 1.75rem;
		}
	}

	:global([data-color-mode='dark']) .gallery-title {
		color: var(--color-surface-100);
	}

	.empty-state {
		text-align: center;
		padding: 4rem 1rem;
		color: var(--color-surface-500);
	}

	.empty-state :global(svg) {
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.empty-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-surface-700);
		margin-bottom: 0.5rem;
	}

	:global([data-color-mode='dark']) .empty-title {
		color: var(--color-surface-300);
	}

	.empty-text {
		font-size: 0.875rem;
		color: var(--color-surface-500);
	}

	:global([data-color-mode='dark']) .empty-text {
		color: var(--color-surface-500);
	}

	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	@media (min-width: 640px) {
		.gallery-grid {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.75rem;
		}
	}

	@media (min-width: 1024px) {
		.gallery-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.gallery-item {
		position: relative;
		aspect-ratio: 1;
		border-radius: 0.75rem;
		overflow: hidden;
		cursor: pointer;
		animation: fade-in-up 0.5s ease-out forwards;
		opacity: 0;
		animation-delay: calc(var(--stagger, 0) * 0.05s);
	}

	.gallery-item:nth-child(1) {
		grid-column: span 2;
		grid-row: span 2;
		aspect-ratio: auto;
	}
	.gallery-item:nth-child(6) {
		grid-column: span 2;
	}
	.gallery-item:nth-child(7) {
		grid-column: span 2;
	}

	@media (min-width: 640px) {
		.gallery-item:nth-child(6),
		.gallery-item:nth-child(7) {
			grid-column: span 1;
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
		background: linear-gradient(to top, rgba(0, 0, 0, 0.5), transparent);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 1rem;
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
		padding: 0.5rem 1.25rem;
		border-radius: 9999px;
	}

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

	/* Lightbox Styles */
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
</style>
