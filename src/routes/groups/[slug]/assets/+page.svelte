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
	import IconUsers from '@lucide/svelte/icons/users';
	import IconX from '@lucide/svelte/icons/x';
	import { page } from '$app/stores';
	import { fade, fly, scale } from 'svelte/transition';

	let { data } = $props();

	const activeSlug = $derived(
		($page.url.searchParams.get('bucket') || data.active_bucket || '').trim()
	);
	const activeBucket = $derived(
		data.buckets.find((bucket) => bucket.slug === activeSlug) ||
			data.buckets.find((bucket) => bucket.slug === data.active_bucket) ||
			data.buckets[0]
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
		if (!query.trim()) return bucket.assets || bucket.image_assets || bucket.link_assets || [];
		const q = query.toLowerCase().trim();
		const assets = bucket.assets || bucket.image_assets || bucket.link_assets || [];
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

	const activeAssets = $derived(filteredAssets(activeBucket, searchQuery));
	const totalCount = $derived(
		data.buckets.reduce((sum, bucket) => sum + (bucket.asset_count || 0), 0)
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-6xl space-y-6 px-3 py-4 md:px-4 lg:px-6 lg:py-6">
	<!-- Hero Section -->
	<section class="asset-hero relative overflow-hidden rounded-3xl" in:fade={{ duration: 300 }}>
		<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-6"
		>
			<div class="flex items-start gap-4">
				{#if data.group?.logo_url}
					<img
						src={data.group.logo_url}
						alt="{data.group.name} logo"
						class="h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-lg ring-2 ring-white/10 lg:h-20 lg:w-20"
					/>
				{:else}
					<div
						class="hero-logo-placeholder flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl shadow-lg lg:h-20 lg:w-20"
					>
						<IconUsers class="h-8 w-8 text-white/60" />
					</div>
				{/if}

				<div class="min-w-0 space-y-1">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class="chip preset-filled-secondary-500 text-[0.65rem] font-semibold tracking-[0.2em] uppercase"
						>
							Shared Assets
						</span>
						<span class="text-surface-400 text-xs">{totalCount} items</span>
					</div>
					<h1 class="text-2xl font-extrabold tracking-tight text-white lg:text-3xl">
						{data.group.name}
					</h1>
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-3 lg:flex-col lg:items-end">
				{#if data.can_edit}
					<a
						href="/groups/{data.group.slug}/manage/assets"
						class="btn preset-filled-surface-50-950 flex items-center gap-2"
					>
						<IconFolderOpen class="h-4 w-4" />
						Manage assets
					</a>
				{/if}
				<a
					href="/groups/{data.group.slug}"
					class="btn preset-tonal-surface flex items-center gap-2"
				>
					<IconArrowLeft class="h-4 w-4" />
					Back to group
				</a>
			</div>
		</div>

		<!-- Tab Navigation -->
		<div class="hero-tabs-wrapper border-t border-white/10 px-6">
			<nav
				class="manage-tabs flex items-stretch gap-1 overflow-x-auto py-1"
				aria-label="Asset categories"
			>
				{#each data.buckets as bucket}
					{@const Icon = iconForBucket(bucket.slug)}
					{@const isActive = activeBucket?.slug === bucket.slug}
					<a
						href="/groups/{data.group.slug}/assets?bucket={bucket.slug}"
						data-sveltekit-preload-data="hover"
						class="tab-link group flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition-all
							{isActive
							? 'bg-white/10 text-white shadow-sm'
							: 'text-white/60 hover:bg-white/5 hover:text-white/90'}"
						aria-current={isActive ? 'page' : undefined}
					>
						<Icon
							class="h-4 w-4 flex-shrink-0 {isActive
								? 'text-secondary-400'
								: 'text-white/50 group-hover:text-white/70'}"
						/>
						<span>{bucket.label}</span>
						<span
							class="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium {isActive
								? 'text-white'
								: 'text-white/50'}"
						>
							{bucket.asset_count}
						</span>
					</a>
				{/each}
			</nav>
		</div>
	</section>

	<!-- Search Bar -->
	{#if activeBucket}
		<section class="search-section" in:fly={{ y: -10, duration: 200 }}>
			<div class="search-container">
				<div class="relative flex-1">
					<IconSearch
						class="text-surface-500 pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
					/>
					<input
						type="search"
						class="search-input"
						placeholder="Search {activeBucket.label.toLowerCase()}..."
						bind:value={searchQuery}
					/>
				</div>
			</div>
		</section>
	{/if}

	<!-- Content Section -->
	{#if activeBucket}
		<section class="content-section" in:fade={{ duration: 200 }}>
			<!-- Photos Grid -->
			{#if activeBucket.slug === 'photos'}
				{#if activeAssets.length > 0}
					<div class="photo-grid">
						{#each activeAssets as asset, index (asset.id)}
							<button
								type="button"
								class="photo-card group"
								onclick={() => openLightbox(index)}
								in:fade={{ duration: 180, delay: index * 30 }}
							>
								<img src={asset.href} alt={asset.title} loading="lazy" />
								<div class="photo-overlay">
									<IconImage class="h-6 w-6 text-white" />
								</div>
							</button>
						{/each}
					</div>
				{:else}
					<div class="empty-state" in:fade={{ duration: 200 }}>
						<div class="empty-icon">
							<IconImage class="h-8 w-8" />
						</div>
						<h3 class="empty-title">No photos found</h3>
						<p class="empty-desc">
							{searchQuery ? 'Try a different search term' : 'Photos will appear here when added'}
						</p>
					</div>
				{/if}
			{:else}
				<!-- Files & Links List -->
				{#if activeAssets.length > 0}
					<div class="flex flex-col gap-3">
						{#each activeAssets as asset, index (asset.id)}
							<a
								href={asset.href}
								target="_blank"
								rel="noopener noreferrer"
								class="preset-tonal-surface group flex items-start gap-4 rounded-2xl p-4 transition-all duration-200 hover:translate-y-[-2px] hover:shadow-lg"
								in:fade={{ duration: 180, delay: index * 30 }}
							>
								<div
									class="bg-surface-500/10 text-secondary-500 group-hover:bg-secondary-500/15 group-hover:text-secondary-400 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors"
								>
									{#if activeBucket.slug === 'links'}
										<IconLink class="h-5 w-5" />
									{:else}
										<IconFileText class="h-5 w-5" />
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<h3 class="truncate text-base font-semibold">{asset.title}</h3>
									{#if asset.description}
										<p class="text-surface-400 mt-1 line-clamp-2 text-sm">{asset.description}</p>
									{/if}
									<div
										class="text-surface-500 mt-2 flex flex-wrap gap-3 text-xs tracking-wide uppercase"
									>
										{#if asset.file_name}
											<span>{asset.file_name}</span>
										{/if}
										{#if asset.sizeLabel}
											<span>{asset.sizeLabel}</span>
										{/if}
										{#if asset.createdLabel}
											<span>{asset.createdLabel}</span>
										{/if}
									</div>
								</div>
								<IconExternalLink
									class="text-secondary-400 mt-1 h-4 w-4 shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
								/>
							</a>
						{/each}
					</div>
				{:else}
					<div class="empty-state" in:fade={{ duration: 200 }}>
						<div class="empty-icon">
							{#if activeBucket.slug === 'links'}
								<IconLink class="h-8 w-8" />
							{:else}
								<IconFileText class="h-8 w-8" />
							{/if}
						</div>
						<h3 class="empty-title">No {activeBucket.label.toLowerCase()} found</h3>
						<p class="empty-desc">
							{searchQuery
								? 'Try a different search term'
								: `${activeBucket.label} will appear here when added`}
						</p>
					</div>
				{/if}
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
		in:fade={{ duration: 140 }}
		out:fade={{ duration: 120 }}
		onclick={(event) => {
			if (event.target === event.currentTarget) closeLightbox();
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') closeLightbox();
			if (event.key === 'ArrowLeft') previousImage();
			if (event.key === 'ArrowRight') nextImage();
		}}
	>
		<div
			class="lightbox-panel"
			role="document"
			tabindex="-1"
			in:scale={{ start: 0.98, duration: 160 }}
			out:scale={{ start: 0.98, duration: 120 }}
		>
			<div class="lightbox-toolbar">
				<div class="lightbox-counter">
					{lightboxIndex + 1} <span class="text-white/40">/</span>
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

	.manage-tabs {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.manage-tabs::-webkit-scrollbar {
		display: none;
	}

	.tab-link {
		white-space: nowrap;
	}

	/* Search Section */
	.search-section {
		animation: slide-in 300ms ease both;
		animation-delay: 100ms;
	}

	.search-container {
		display: flex;
		gap: 0.75rem;
	}

	.search-input {
		width: 100%;
		padding: 0.875rem 1rem 0.875rem 2.75rem;
		background: color-mix(in oklab, var(--color-surface-900) 90%, black 10%);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		border-radius: 1rem;
		font-size: 0.9375rem;
		color: inherit;
		transition: all 200ms ease;
	}

	.search-input:focus {
		outline: none;
		border-color: color-mix(in oklab, var(--color-secondary-500) 50%, transparent);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-secondary-500) 10%, transparent);
	}

	.search-input::placeholder {
		color: color-mix(in oklab, var(--color-surface-500) 70%, transparent);
	}

	/* Content Section */
	.content-section {
		animation: slide-in 400ms ease both;
		animation-delay: 150ms;
	}

	/* Photo Grid */
	.photo-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	@media (min-width: 640px) {
		.photo-grid {
			grid-template-columns: repeat(3, 1fr);
			gap: 1rem;
		}
	}

	@media (min-width: 1024px) {
		.photo-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.photo-card {
		aspect-ratio: 1;
		position: relative;
		overflow: hidden;
		border-radius: 1rem;
		background: color-mix(in oklab, var(--color-surface-900) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		cursor: pointer;
		transition: all 250ms ease;
	}

	.photo-card:hover {
		transform: scale(1.02);
		border-color: color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
		box-shadow: 0 8px 24px -8px color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
	}

	.photo-card img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 400ms ease;
	}

	.photo-card:hover img {
		transform: scale(1.08);
	}

	.photo-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 50%);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 250ms ease;
	}

	.photo-card:hover .photo-overlay {
		opacity: 1;
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
		background: color-mix(in oklab, var(--color-surface-900) 50%, transparent);
		border: 1px dashed color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		border-radius: 1.5rem;
	}

	.empty-icon {
		width: 4rem;
		height: 4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 1rem;
		background: color-mix(in oklab, var(--color-secondary-500) 10%, transparent);
		color: var(--color-secondary-400);
		margin-bottom: 1rem;
	}

	.empty-title {
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.empty-desc {
		font-size: 0.875rem;
		color: color-mix(in oklab, var(--color-surface-500) 90%, transparent);
	}

	/* Lightbox - Full viewport coverage */
	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		place-items: center;
		padding: 0.5rem;
		background: rgba(0, 0, 0, 0.98);
	}

	.lightbox-panel {
		width: 99vw;
		height: 99dvh;
		border-radius: 1rem;
		padding: 0.75rem;
		background: transparent;
		border: none;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.lightbox-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-shrink: 0;
		padding: 0 0.25rem;
	}

	.lightbox-counter {
		font-size: 0.875rem;
		font-weight: 500;
		color: white;
	}

	.lightbox-close {
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		transition: all 150ms ease;
	}

	.lightbox-close:hover {
		background: rgba(239, 68, 68, 0.3);
	}

	.lightbox-stage {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		overflow: hidden;
	}

	.lightbox-image {
		width: 100%;
		height: 100%;
		object-fit: scale-down;
	}

	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 3rem;
		height: 3rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.75rem;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		backdrop-filter: blur(10px);
		transition: all 200ms ease;
		opacity: 0;
	}

	.lightbox-stage:hover .lightbox-nav {
		opacity: 1;
	}

	.lightbox-nav:hover {
		background: color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
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
		overflow-x: auto;
		padding: 0.25rem;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.lightbox-thumbnails::-webkit-scrollbar {
		display: none;
	}

	.thumbnail {
		flex: 0 0 4rem;
		height: 4rem;
		border-radius: 0.5rem;
		overflow: hidden;
		border: 2px solid transparent;
		transition: all 150ms ease;
		cursor: pointer;
		opacity: 0.6;
	}

	.thumbnail:hover {
		opacity: 0.9;
	}

	.thumbnail.active {
		border-color: var(--color-secondary-400);
		opacity: 1;
	}

	.thumbnail img {
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

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(8px);
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

	/* Mobile optimizations */
	@media (max-width: 640px) {
		.lightbox-nav {
			opacity: 1;
			width: 2.5rem;
			height: 2.5rem;
		}
	}
</style>
