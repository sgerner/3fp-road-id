<script>
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconImage from '@lucide/svelte/icons/image';
	import IconLink from '@lucide/svelte/icons/link';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconX from '@lucide/svelte/icons/x';
	import AutoLinkText from '$lib/components/ui/AutoLinkText.svelte';
	import { fade, scale } from 'svelte/transition';

	let { data } = $props();

	const site = $derived(data.site);
	const group = $derived(site.group);
	const basePath = $derived(site.basePath || '');
	const activeBucketSlug = $derived(data.activeBucket || '');

	const activeBucket = $derived(
		site.assetBuckets?.find((bucket) => bucket.slug === activeBucketSlug) ||
			site.assetBuckets?.find((bucket) => (bucket.asset_count || 0) > 0) ||
			site.assetBuckets?.[0]
	);

	let searchQuery = $state('');
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	let lightboxItems = $state([]);

	function iconForBucket(bucketSlug) {
		if (bucketSlug === 'photos') return IconImage;
		if (bucketSlug === 'links') return IconLink;
		return IconFileText;
	}

	function filteredAssets(bucket, query) {
		const assets =
			bucket?.slug === 'photos'
				? bucket?.image_assets || []
				: [...(bucket?.link_assets || []), ...(bucket?.file_assets || [])];
		if (!query.trim()) return assets;
		const q = query.toLowerCase().trim();
		return assets.filter((asset) => {
			const text = [asset.title, asset.description, asset.file_name]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return text.includes(q);
		});
	}

	function openLightbox(index) {
		lightboxItems = filteredAssets(activeBucket, searchQuery);
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

	function setBucket(slug) {
		const url = new URL(window.location.href);
		if (slug) {
			url.searchParams.set('bucket', slug);
		} else {
			url.searchParams.delete('bucket');
		}
		window.history.replaceState({}, '', url);
		// Force reactivity
		searchQuery = '';
	}

	const activeAssets = $derived(filteredAssets(activeBucket, searchQuery));
	const totalCount = $derived(
		site.assetBuckets?.reduce((sum, bucket) => sum + (bucket.asset_count || 0), 0) || 0
	);
	const isPhotoBucket = $derived(activeBucket?.slug === 'photos');
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="microsite-page pb-16">
	<!-- Hero Section -->
	<section
		class="asset-hero relative mx-4 mt-6 overflow-hidden rounded-2xl md:mx-6"
		in:fade={{ duration: 300 }}
	>
		<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-6"
		>
			<div class="flex items-start gap-4">
				{#if group?.logo_url}
					<img
						src={group.logo_url}
						alt="{group.name} logo"
						class="ring-surface-50/10 h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-lg ring-2 lg:h-20 lg:w-20"
					/>
				{:else}
					<div
						class="hero-logo-placeholder flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl shadow-lg lg:h-20 lg:w-20"
					>
						<IconFolderOpen class="text-surface-50/60 h-8 w-8" />
					</div>
				{/if}

				<div class="min-w-0 space-y-1">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class="chip preset-filled-secondary-500 text-[0.65rem] font-semibold tracking-[0.2em] uppercase"
							>Resources</span
						>
						<span class="text-surface-700-300 text-xs">{totalCount} items</span>
					</div>
					<h1 class="text-surface-950-50 text-2xl font-extrabold tracking-tight lg:text-3xl">
						{site.siteConfig.site_title}
					</h1>
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-3 lg:flex-col lg:items-end">
				<a
					href={basePath || site.previewPath || `/${site.micrositeSlug || group.slug}`}
					class="btn preset-tonal-surface flex items-center gap-2"
				>
					<IconArrowLeft class="h-4 w-4" />
					Back
				</a>
			</div>
		</div>

		<!-- Tab Navigation -->
		<div class="hero-tabs-wrapper border-surface-50/10 border-t px-6">
			<nav class="manage-tabs flex gap-4 overflow-x-auto py-4">
				{#each site.assetBuckets || [] as bucket}
					{@const Icon = iconForBucket(bucket.slug)}
					{@const isActive = activeBucket?.slug === bucket.slug}
					<button
						type="button"
						onclick={() => setBucket(bucket.slug)}
						class="tab-button flex items-center gap-2 px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all {isActive
							? 'is-active'
							: ''}"
					>
						<Icon class="h-4 w-4" />
						<span>{bucket.name}</span>
						<span class="text-xs opacity-60">({bucket.asset_count || 0})</span>
					</button>
				{/each}
			</nav>
		</div>
	</section>

	<!-- Search Bar -->
	<section class="mx-auto max-w-6xl px-4 py-6 md:px-6">
		<div class="glass-card border-surface-500/15 rounded-2xl border p-4">
			<div class="relative">
				<IconSearch class="text-surface-700-300 absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />
				<input
					type="text"
					placeholder="Search {activeBucket?.name || 'assets'}..."
					bind:value={searchQuery}
					class="border-surface-500/15 bg-surface-50/50 placeholder:text-surface-700-300 focus:border-primary-500 focus:ring-primary-500/20 dark:bg-surface-950/50 w-full rounded-xl border py-3 pr-4 pl-10 text-sm focus:ring-2 focus:outline-none"
				/>
			</div>
		</div>
	</section>

	<!-- Assets Grid -->
	<section class="mx-auto max-w-6xl px-4 pb-8 md:px-6">
		{#if activeAssets.length > 0}
			<div
				class="grid gap-4 {isPhotoBucket
					? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
					: 'grid-cols-1 md:grid-cols-2'}"
			>
				{#each activeAssets as asset, index}
					{#if isPhotoBucket}
						<button
							type="button"
							onclick={() => openLightbox(index)}
							class="glass-card group border-surface-500/10 relative aspect-square overflow-hidden rounded-xl border transition-all hover:-translate-y-1 hover:shadow-lg"
						>
							<img
								src={asset.href}
								alt={asset.title}
								class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
								loading="lazy"
							/>
							<div
								class="from-surface-950/70 absolute inset-0 bg-gradient-to-t via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
							></div>
							<div
								class="absolute right-0 bottom-0 left-0 translate-y-full p-3 transition-transform duration-300 group-hover:translate-y-0"
							>
								<p class="text-surface-50 truncate text-sm font-semibold">{asset.title}</p>
							</div>
						</button>
					{:else}
						<a
							href={asset.href}
							target="_blank"
							rel="noopener noreferrer"
							class="glass-card group border-surface-500/10 flex items-start gap-4 rounded-xl border p-4 transition-all hover:-translate-y-1 hover:shadow-lg"
						>
							<div
								class="resource-icon-badge flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg"
							>
								{#if asset.isLink}
									<IconLink class="h-5 w-5" />
								{:else}
									<IconFileText class="h-5 w-5" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<h3
									class="text-surface-950-50 group-hover:text-primary-500 font-semibold transition-colors"
								>
									{asset.title}
								</h3>
								{#if asset.description}
									<AutoLinkText
										text={asset.description}
										className="block text-surface-700-300 mt-1 line-clamp-2 text-sm"
										linkClass="text-primary-700-300 underline underline-offset-2"
									/>
								{:else if asset.sizeLabel || asset.createdLabel}
									<p class="text-surface-700-300 mt-1 line-clamp-2 text-sm">
										{asset.sizeLabel}{asset.sizeLabel && asset.createdLabel ? ' · ' : ''}{asset.createdLabel}
									</p>
								{/if}
							</div>
							<IconExternalLink
									class="text-surface-600-400 group-hover:text-primary-500 h-4 w-4 flex-shrink-0 transition-colors"
							/>
						</a>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="glass-card border-surface-500/15 rounded-2xl border p-12 text-center">
				<div
					class="bg-surface-500/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full"
				>
						<IconFolderOpen class="text-surface-600-400 h-7 w-7" />
				</div>
				<h2 class="text-surface-950-50 mt-4 text-xl font-bold">
					{searchQuery ? 'No results found' : 'No assets yet'}
				</h2>
				<p class="text-surface-700-300 mt-2 text-sm">
					{searchQuery ? 'Try a different search term' : 'Check back later for shared resources'}
				</p>
			</div>
		{/if}
	</section>
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
	/* Hero Section */
	.asset-hero {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		animation: hero-in 500ms ease both;
	}

	:global([data-color-mode='light']) .asset-hero {
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-50) 92%);
	}

	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(60px);
		pointer-events: none;
		animation: orb-float 8s ease-in-out infinite;
	}

	.hero-orb-1 {
		width: 280px;
		height: 280px;
		background: color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		top: -80px;
		right: -40px;
		animation-delay: 0s;
	}

	.hero-orb-2 {
		width: 200px;
		height: 200px;
		background: color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
		bottom: -60px;
		left: 10%;
		animation-delay: -3s;
	}

	.hero-orb-3 {
		width: 140px;
		height: 140px;
		background: color-mix(in oklab, var(--color-tertiary-500) 15%, transparent);
		top: 30%;
		left: 35%;
		animation-delay: -5s;
	}

	.hero-logo-placeholder {
		background: linear-gradient(
			135deg,
			var(--color-primary-500) 0%,
			var(--color-secondary-500) 100%
		);
	}

	.hero-tabs-wrapper {
		background: rgba(0, 0, 0, 0.2);
	}

	:global([data-color-mode='light']) .hero-tabs-wrapper {
		background: rgba(255, 255, 255, 0.3);
	}

	.manage-tabs {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.manage-tabs::-webkit-scrollbar {
		display: none;
	}

	.tab-button {
		border-radius: 999px;
		color: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		background: transparent;
	}

	:global([data-color-mode='light']) .tab-button {
		color: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
	}

	.tab-button:hover {
		color: var(--color-surface-50);
		background: rgba(255, 255, 255, 0.1);
	}

	:global([data-color-mode='light']) .tab-button:hover {
		color: var(--color-surface-950);
		background: rgba(0, 0, 0, 0.05);
	}

	.tab-button.is-active {
		color: var(--color-surface-50);
		background: rgba(255, 255, 255, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	:global([data-color-mode='light']) .tab-button.is-active {
		color: var(--color-surface-950);
		background: rgba(0, 0, 0, 0.08);
		border: 1px solid rgba(0, 0, 0, 0.15);
	}

	/* Glass card */
	.glass-card {
		background: color-mix(in oklab, var(--color-surface-50) 70%, transparent);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
	}

	:global([data-color-mode='dark']) .glass-card {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
	}

	.resource-icon-badge {
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: var(--color-primary-700);
	}

	:global([data-color-mode='dark']) .resource-icon-badge {
		background: color-mix(in oklab, var(--color-primary-500) 24%, transparent);
		color: var(--color-primary-200);
	}

	/* Lightbox */
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
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.lightbox-thumbnails::-webkit-scrollbar {
		display: none;
	}

	.lightbox-thumbnails .thumbnail {
		flex: 0 0 3.5rem;
		height: 3.5rem;
		border-radius: 0.375rem;
		overflow: hidden;
		border: 2px solid transparent;
		transition: all 0.15s ease;
		cursor: pointer;
		opacity: 0.6;
	}

	.lightbox-thumbnails .thumbnail:hover {
		opacity: 0.9;
	}

	.lightbox-thumbnails .thumbnail.active {
		border-color: var(--color-primary-500);
		opacity: 1;
	}

	.lightbox-thumbnails .thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Animations */
	@keyframes hero-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes orb-float {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		25% {
			transform: translate(10px, -15px) scale(1.05);
		}
		50% {
			transform: translate(-5px, 10px) scale(0.95);
		}
		75% {
			transform: translate(15px, 5px) scale(1.02);
		}
	}

	/* Mobile */
	@media (max-width: 640px) {
		.lightbox-nav {
			width: 2.25rem;
			height: 2.25rem;
			opacity: 1;
		}

		.lightbox-nav-left {
			left: 0.5rem;
		}

		.lightbox-nav-right {
			right: 0.5rem;
		}
	}
</style>
