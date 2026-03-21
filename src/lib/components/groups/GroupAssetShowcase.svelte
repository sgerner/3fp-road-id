<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconFile from '@lucide/svelte/icons/file';
	import IconFileImage from '@lucide/svelte/icons/file-image';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconFileVideo from '@lucide/svelte/icons/file-video';
	import IconImage from '@lucide/svelte/icons/image';
	import IconLayoutGrid from '@lucide/svelte/icons/layout-grid';
	import IconLink from '@lucide/svelte/icons/link';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconX from '@lucide/svelte/icons/x';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { fade, fly, scale } from 'svelte/transition';

	let { slug = '', buckets = [] } = $props();

	const PANEL_KEYS = new Set(['links', 'files', 'all']);
	const DEFAULT_PREVIEW_COUNT = 3;
	const PHOTO_PREVIEW_COUNT = 12; // Show up to 12, CSS will control how many fit per row

	let quickSearch = $state('');
	let hasInitializedSearch = $state(false);
	let photoLightboxOpen = $state(false);
	let photoLightboxAssets = $state([]);
	let photoLightboxIndex = $state(0);
	let photoLightboxMode = $state('single');

	const panel = $derived(
		(() => {
			const value = ($page.url.searchParams.get('panel') || '').trim().toLowerCase();
			return PANEL_KEYS.has(value) ? value : '';
		})()
	);
	const panelQuery = $derived(($page.url.searchParams.get('q') || '').trim());
	const openBucket = $derived(
		(() => {
			if (!panel || panel === 'all') return null;
			return buckets.find((bucket) => bucket.slug === panel) || null;
		})()
	);

	$effect(() => {
		if (hasInitializedSearch) return;
		hasInitializedSearch = true;
		quickSearch = panelQuery;
	});

	function iconForBucket(bucketSlug) {
		if (bucketSlug === 'photos') return IconImage;
		if (bucketSlug === 'links') return IconLink;
		return IconFileText;
	}

	function getFileIcon(asset) {
		const mime = (asset?.mime_type || '').toLowerCase();
		if (mime.startsWith('image/')) return IconFileImage;
		if (mime.startsWith('video/')) return IconFileVideo;
		if (mime === 'application/pdf') return IconFileText;
		return IconFile;
	}

	function formatFileName(fileName) {
		if (!fileName) return '';
		const name = fileName.split('/').pop() || fileName;
		if (name.length > 30) {
			return name.slice(0, 27) + '...';
		}
		return name;
	}

	function listBucketAssets(bucket) {
		if (bucket.slug === 'photos') return bucket.image_assets ?? [];
		if (bucket.slug === 'links') return bucket.link_assets ?? [];
		return bucket.assets ?? [];
	}

	function canonicalHref(bucketSlug) {
		return `/groups/${slug}/assets?bucket=${bucketSlug}`;
	}

	function panelHref(panelSlug) {
		const url = new URL($page.url);
		url.searchParams.set('panel', panelSlug);
		const trimmedQuery = quickSearch.trim();
		if (trimmedQuery) {
			url.searchParams.set('q', trimmedQuery);
		} else {
			url.searchParams.delete('q');
		}
		return `${url.pathname}${url.search}`;
	}

	function assetMatchesSearch(asset, query) {
		const q = (query || '').trim().toLowerCase();
		if (!q) return true;
		const haystack = [asset?.title, asset?.description, asset?.href, asset?.file_name]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();
		return haystack.includes(q);
	}

	function filteredAssets(bucket, query) {
		return listBucketAssets(bucket).filter((asset) => assetMatchesSearch(asset, query));
	}

	function previewAssets(bucket) {
		const count = bucket.slug === 'photos' ? PHOTO_PREVIEW_COUNT : DEFAULT_PREVIEW_COUNT;
		return filteredAssets(bucket, quickSearch).slice(0, count);
	}

	async function closePanel() {
		const url = new URL($page.url);
		url.searchParams.delete('panel');
		url.searchParams.delete('q');
		await goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	async function openSearchPanel(event) {
		event.preventDefault();
		const url = new URL($page.url);
		url.searchParams.set('panel', 'all');
		const query = quickSearch.trim();
		if (query) {
			url.searchParams.set('q', query);
		} else {
			url.searchParams.delete('q');
		}
		await goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	function hasAnyMatches(query) {
		return buckets.some((bucket) => filteredAssets(bucket, query).length > 0);
	}

	function portal(node) {
		const target = document.body;
		target.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}

	function openPhotoLightbox(bucket, { index = 0, mode = 'single' } = {}) {
		const images = filteredAssets(bucket, quickSearch);
		if (!images.length) return;
		photoLightboxAssets = images;
		photoLightboxIndex = Math.max(0, Math.min(index, images.length - 1));
		photoLightboxMode = mode;
		photoLightboxOpen = true;
	}

	function closePhotoLightbox() {
		photoLightboxOpen = false;
		photoLightboxAssets = [];
		photoLightboxIndex = 0;
		photoLightboxMode = 'single';
	}

	function previousPhoto() {
		if (!photoLightboxAssets.length) return;
		photoLightboxIndex =
			photoLightboxIndex <= 0 ? photoLightboxAssets.length - 1 : photoLightboxIndex - 1;
	}

	function nextPhoto() {
		if (!photoLightboxAssets.length) return;
		photoLightboxIndex =
			photoLightboxIndex >= photoLightboxAssets.length - 1 ? 0 : photoLightboxIndex + 1;
	}

	function getTotalCount(bucket) {
		return listBucketAssets(bucket).length;
	}

	function shouldShowBucket(bucket) {
		return !quickSearch.trim() || previewAssets(bucket).length > 0;
	}
</script>

{#if buckets.length}
	<section class="asset-showcase space-y-4">
		<!-- Search Bar -->
		<div class="search-container">
			<div class="relative flex-1">
				<IconSearch
					class="text-surface-500-400 pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
				/>
				<input
					id="resource-search"
					type="search"
					class="search-input"
					placeholder="Search photos, links, and files..."
					bind:value={quickSearch}
				/>
			</div>
			<a href={panelHref('all')} class="search-btn" onclick={openSearchPanel}>
				<span>Search</span>
				<IconArrowRight class="h-4 w-4" />
			</a>
		</div>

		<!-- Asset Cards - Single Column Layout -->
		<div class="space-y-4">
			{#each buckets as bucket}
				{#if shouldShowBucket(bucket)}
					{@const Icon = iconForBucket(bucket.slug)}
					{@const items = previewAssets(bucket)}
					<div class="asset-card" in:fade={{ duration: 170 }}>
						<!-- Card Header -->
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-3">
								<div
									class="asset-icon-sm flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
								>
									<Icon class="h-3.5 w-3.5" />
								</div>
								<span class="text-sm font-medium">{bucket.label}</span>
							</div>
							{#if bucket.slug === 'photos'}
								<button
									type="button"
									class="view-btn-header"
									onclick={() => openPhotoLightbox(bucket, { mode: 'grid' })}
								>
									<span>View all</span>
									<IconArrowRight class="h-3.5 w-3.5" />
								</button>
							{:else}
								<a href={panelHref(bucket.slug)} class="view-btn-header">
									<span>View all</span>
									<IconArrowRight class="h-3.5 w-3.5" />
								</a>
							{/if}
						</div>

						<!-- Card Content -->
						<div class="mt-4">
							{#if items.length}
								{#if bucket.slug === 'photos'}
									<div class="photo-grid">
										{#each items as asset, index}
											<button
												type="button"
												class="photo-item"
												onclick={() => openPhotoLightbox(bucket, { index, mode: 'single' })}
												in:fade={{ duration: 160 }}
											>
												<img src={asset.href} alt={asset.title} />
												<div class="photo-overlay">
													<IconImage class="h-5 w-5" />
												</div>
											</button>
										{/each}
									</div>
								{:else}
									<ul class="space-y-2">
										{#each items as asset}
											<li in:fade={{ duration: 160 }}>
												<a
													href={asset.href}
													target="_blank"
													rel="noopener noreferrer"
													class="link-item"
												>
													<Icon class="text-surface-500-400 h-4 w-4 shrink-0" />
													<span class="text-sm">{asset.title}</span>
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							{:else}
								<div class="empty-state">
									No matching {bucket.label.toLowerCase()}.
								</div>
							{/if}
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</section>
{/if}

<!-- Resources Modal - Centered -->
{#if panel}
	<div
		class="modal-backdrop"
		use:portal
		role="dialog"
		tabindex="0"
		aria-modal="true"
		aria-label="Group resources"
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 150 }}
		onclick={(event) => {
			if (event.target === event.currentTarget) closePanel();
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') closePanel();
		}}
	>
		<div
			class="modal-panel"
			role="document"
			in:scale={{ start: 0.96, duration: 200 }}
			out:scale={{ start: 0.96, duration: 150 }}
		>
			<!-- Modal Header -->
			<div class="modal-header">
				<div class="flex items-center gap-3">
					{#if openBucket}
						{@const Icon = iconForBucket(openBucket.slug)}
						<div class="modal-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
							<Icon class="h-5 w-5" />
						</div>
					{/if}
					<div>
						<h3 class="text-lg font-semibold">
							{panel === 'all' ? 'Search Results' : openBucket?.label || 'Resources'}
						</h3>
						{#if panelQuery || quickSearch}
							<p class="text-surface-500-400 text-xs">
								{filteredAssets(openBucket || buckets[0], panelQuery || quickSearch).length} results for
								"{panelQuery || quickSearch}"
							</p>
						{/if}
					</div>
				</div>
				<div class="flex items-center gap-2">
					{#if panel !== 'all' && openBucket}
						<a href={canonicalHref(openBucket.slug)} class="modal-action-btn">
							<IconExternalLink class="h-4 w-4" />
							<span>Open page</span>
						</a>
					{/if}
					<button type="button" class="modal-close-btn" onclick={closePanel}>
						<IconX class="h-5 w-5" />
					</button>
				</div>
			</div>

			<!-- Modal Body -->
			<div class="modal-body">
				{#if panel === 'all'}
					<!-- Search Results - Grouped by bucket -->
					{#if hasAnyMatches(panelQuery || quickSearch)}
						<div class="space-y-6">
							{#each buckets as bucket}
								{@const matches = filteredAssets(bucket, panelQuery || quickSearch)}
								{@const Icon = iconForBucket(bucket.slug)}
								{#if matches.length}
									<div class="bucket-section" in:fade={{ duration: 170 }}>
										<div class="bucket-header">
											<div class="flex items-center gap-2">
												<Icon class="text-surface-500-400 h-4 w-4" />
												<span class="text-sm font-medium">{bucket.label}</span>
											</div>
											<span class="text-surface-500-400 text-xs">{matches.length}</span>
										</div>
										<div class="bucket-items">
											{#each matches as asset}
												{@const FileIcon = getFileIcon(asset)}
												<a
													href={asset.href}
													target="_blank"
													rel="noopener noreferrer"
													class="resource-card"
													in:fade={{ duration: 170 }}
												>
													<div
														class="resource-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
													>
														<FileIcon class="h-5 w-5" />
													</div>
													<div class="resource-content min-w-0">
														<div class="resource-title">{asset.title}</div>
														{#if asset.file_name}
															<div class="resource-meta">{formatFileName(asset.file_name)}</div>
														{/if}
														{#if asset.description}
															<div class="resource-desc">{asset.description}</div>
														{/if}
													</div>
												</a>
											{/each}
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{:else}
						<div class="modal-empty">
							<IconSearch class="text-surface-600-400 mb-3 h-12 w-12" />
							<p class="text-surface-500-400 text-sm">No results found</p>
							<p class="text-surface-600-400 mt-1 text-xs">Try a different search term</p>
						</div>
					{/if}
				{:else if openBucket}
					{@const matches = filteredAssets(openBucket, panelQuery || quickSearch)}
					{@const Icon = iconForBucket(openBucket.slug)}
					<!-- Single Bucket View -->
					{#if openBucket.slug === 'photos'}
						<div class="photo-gallery">
							{#each matches as asset}
								<button
									type="button"
									class="photo-card"
									onclick={() => {
										photoLightboxAssets = matches;
										photoLightboxIndex = matches.indexOf(asset);
										photoLightboxMode = 'single';
										photoLightboxOpen = true;
									}}
								>
									<img src={asset.href} alt={asset.title} />
									<div class="photo-card-overlay">
										<IconImage class="h-6 w-6" />
									</div>
								</button>
							{/each}
						</div>
					{:else}
						<div class="resource-list">
							{#each matches as asset}
								{@const FileIcon = getFileIcon(asset)}
								<a
									href={asset.href}
									target="_blank"
									rel="noopener noreferrer"
									class="resource-card resource-card-large"
								>
									<div
										class="resource-icon-large flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
									>
										<FileIcon class="h-6 w-6" />
									</div>
									<div class="resource-content">
										<div class="resource-title-large">{asset.title}</div>
										{#if asset.file_name}
											<div class="resource-meta-large">{formatFileName(asset.file_name)}</div>
										{/if}
										{#if asset.description}
											<div class="resource-desc-large">{asset.description}</div>
										{/if}
									</div>
									<IconExternalLink class="text-surface-500-400 h-4 w-4 shrink-0" />
								</a>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Photo Lightbox - Fixed position -->
{#if photoLightboxOpen && photoLightboxAssets.length}
	<div
		class="lightbox-backdrop"
		use:portal
		role="dialog"
		tabindex="0"
		aria-modal="true"
		aria-label={photoLightboxAssets[photoLightboxIndex]?.title}
		in:fade={{ duration: 140 }}
		out:fade={{ duration: 120 }}
		onclick={(event) => {
			if (event.target === event.currentTarget) closePhotoLightbox();
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') closePhotoLightbox();
			if (event.key === 'ArrowLeft') previousPhoto();
			if (event.key === 'ArrowRight') nextPhoto();
		}}
	>
		<div
			class="lightbox-panel"
			role="document"
			tabindex="-1"
			in:scale={{ start: 0.98, duration: 170 }}
			out:scale={{ start: 0.98, duration: 130 }}
		>
			<div class="lightbox-toolbar">
				<div class="text-surface-300 text-sm">
					{photoLightboxIndex + 1} / {photoLightboxAssets.length}
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="mode-btn"
						onclick={() => (photoLightboxMode = photoLightboxMode === 'grid' ? 'single' : 'grid')}
					>
						{#if photoLightboxMode === 'grid'}
							<IconImage class="h-4 w-4" />
							<span>Large</span>
						{:else}
							<IconLayoutGrid class="h-4 w-4" />
							<span>Grid</span>
						{/if}
					</button>
					<button type="button" class="close-btn" onclick={closePhotoLightbox}>
						<IconX class="h-5 w-5" />
					</button>
				</div>
			</div>

			{#if photoLightboxMode === 'grid'}
				<div class="lightbox-grid">
					{#each photoLightboxAssets as asset, index}
						<button
							type="button"
							class="lightbox-grid-item {photoLightboxIndex === index ? 'active' : ''}"
							onclick={() => {
								photoLightboxIndex = index;
								photoLightboxMode = 'single';
							}}
						>
							<img src={asset.href} alt={asset.title} />
						</button>
					{/each}
				</div>
			{:else}
				<div class="lightbox-stage">
					<img
						src={photoLightboxAssets[photoLightboxIndex]?.href}
						alt={photoLightboxAssets[photoLightboxIndex]?.title}
						class="lightbox-image"
					/>
					{#if photoLightboxAssets.length > 1}
						<button type="button" class="nav-btn nav-left" onclick={previousPhoto}>
							<IconChevronLeft class="h-5 w-5" />
						</button>
						<button type="button" class="nav-btn nav-right" onclick={nextPhoto}>
							<IconChevronRight class="h-5 w-5" />
						</button>
					{/if}
				</div>
			{/if}

			<div class="lightbox-strip">
				{#each photoLightboxAssets as asset, index}
					<button
						type="button"
						class="lightbox-thumb {photoLightboxIndex === index ? 'active' : ''}"
						onclick={() => (photoLightboxIndex = index)}
						aria-label={`Show image ${index + 1}`}
					>
						<img src={asset.href} alt={asset.title} />
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Asset Showcase */
	.asset-showcase {
		animation: fade-in 260ms ease both;
	}

	/* Search Bar */
	.search-container {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.search-input {
		width: 100%;
		padding: 0.625rem 1rem 0.625rem 2.5rem;
		background: color-mix(in oklab, var(--color-surface-900) 80%, black 20%);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		border-radius: 0.75rem;
		font-size: 0.875rem;
		color: inherit;
		transition: all 150ms ease;
	}

	.search-input:focus {
		outline: none;
		border-color: color-mix(in oklab, var(--color-secondary-500) 50%, transparent);
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
	}

	.search-input::placeholder {
		color: color-mix(in oklab, var(--color-surface-500) 60%, transparent);
	}

	.search-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.625rem 1rem;
		background: var(--color-secondary-500);
		color: white;
		border-radius: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 150ms ease;
		flex-shrink: 0;
	}

	.search-btn:hover {
		background: color-mix(in oklab, var(--color-secondary-500) 85%, white 15%);
		transform: translateY(-1px);
	}

	/* Asset Cards */
	.asset-card {
		background: color-mix(in oklab, var(--color-surface-950) 90%, var(--color-secondary-500) 4%);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		border-radius: 1rem;
		padding: 1rem;
		transition: all 200ms ease;
	}

	.asset-card:hover {
		border-color: color-mix(in oklab, var(--color-secondary-500) 25%, transparent);
	}

	.asset-icon-sm {
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		color: var(--color-secondary-400);
	}

	/* View All Button in Header */
	.view-btn-header {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--color-secondary-400);
		font-size: 0.8125rem;
		font-weight: 500;
		transition: all 150ms ease;
	}

	.view-btn-header:hover {
		color: var(--color-secondary-300);
		gap: 0.5rem;
	}

	/* Photo Grid - Single row, fit as many as possible */
	.photo-grid {
		display: flex;
		gap: 0.5rem;
		overflow: hidden;
	}

	.photo-grid .photo-item {
		flex: 1 1 0;
		min-width: 80px;
		max-width: 160px;
	}

	@media (min-width: 640px) {
		.photo-grid {
			gap: 0.625rem;
		}
		.photo-grid .photo-item {
			min-width: 100px;
			max-width: 180px;
		}
	}

	@media (min-width: 1024px) {
		.photo-grid {
			gap: 0.75rem;
		}
		.photo-grid .photo-item {
			min-width: 120px;
			max-width: 200px;
		}
	}

	/* Photo Items */
	.photo-item {
		aspect-ratio: 1;
		position: relative;
		overflow: hidden;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-surface-900) 70%, transparent);
		cursor: pointer;
	}

	.photo-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 300ms ease;
	}

	.photo-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 200ms ease;
		color: white;
	}

	.photo-item:hover img {
		transform: scale(1.08);
	}

	.photo-item:hover .photo-overlay {
		opacity: 1;
	}

	/* Link Items */
	.link-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.625rem 0.875rem;
		background: color-mix(in oklab, var(--color-surface-900) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		border-radius: 0.625rem;
		transition: all 150ms ease;
	}

	.link-item:hover {
		background: color-mix(in oklab, var(--color-surface-900) 75%, transparent);
		border-color: color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
	}

	/* Empty State */
	.empty-state {
		padding: 1rem;
		text-align: center;
		font-size: 0.875rem;
		color: color-mix(in oklab, var(--color-surface-500) 80%, transparent);
		background: color-mix(in oklab, var(--color-surface-900) 50%, transparent);
		border-radius: 0.75rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
	}

	/* Modal - Centered */
	.modal-backdrop {
		position: fixed !important;
		top: 0 !important;
		left: 0 !important;
		right: 0 !important;
		bottom: 0 !important;
		z-index: 9999 !important;
		display: grid;
		place-items: center;
		background: rgba(6, 10, 18, 0.9);
		backdrop-filter: blur(20px);
		padding: 1rem;
	}

	.modal-panel {
		width: min(90vw, 48rem);
		max-height: calc(100vh - 2rem);
		border-radius: 1.25rem;
		background: color-mix(in oklab, var(--color-surface-950) 97%, black 3%);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
	}

	.modal-icon {
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		color: var(--color-secondary-400);
	}

	.modal-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		border-radius: 0.625rem;
		font-size: 0.75rem;
		transition: all 150ms ease;
	}

	.modal-action-btn:hover {
		border-color: color-mix(in oklab, var(--color-secondary-500) 35%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 10%, transparent);
	}

	.modal-close-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		transition: all 150ms ease;
	}

	.modal-close-btn:hover {
		background: color-mix(in oklab, var(--color-error-500) 25%, transparent);
		border-color: color-mix(in oklab, var(--color-error-500) 35%, transparent);
	}

	.modal-body {
		overflow: auto;
		padding: 1.25rem;
	}

	.modal-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		text-align: center;
	}

	/* Bucket Sections in Modal */
	.bucket-section {
		animation: fade-in 300ms ease;
	}

	.bucket-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		margin-bottom: 0.75rem;
	}

	.bucket-items {
		display: grid;
		gap: 0.5rem;
	}

	/* Resource Cards */
	.resource-card {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem;
		background: color-mix(in oklab, var(--color-surface-900) 70%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		border-radius: 0.75rem;
		transition: all 150ms ease;
	}

	.resource-card:hover {
		background: color-mix(in oklab, var(--color-surface-900) 85%, transparent);
		border-color: color-mix(in oklab, var(--color-secondary-500) 25%, transparent);
		transform: translateY(-1px);
	}

	.resource-icon {
		background: color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
		color: var(--color-secondary-400);
	}

	.resource-content {
		flex: 1;
		min-width: 0;
	}

	.resource-title {
		font-weight: 500;
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.resource-meta {
		font-size: 0.75rem;
		color: color-mix(in oklab, var(--color-surface-500) 90%, transparent);
		margin-top: 0.125rem;
	}

	.resource-desc {
		font-size: 0.75rem;
		color: color-mix(in oklab, var(--color-surface-600) 90%, transparent);
		margin-top: 0.25rem;
		line-height: 1.4;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Large Resource Cards */
	.resource-card-large {
		padding: 1rem;
		gap: 1rem;
	}

	.resource-icon-large {
		background: color-mix(in oklab, var(--color-secondary-500) 12%, transparent);
		color: var(--color-secondary-400);
	}

	.resource-title-large {
		font-weight: 600;
		font-size: 0.9375rem;
	}

	.resource-meta-large {
		font-size: 0.8125rem;
		color: color-mix(in oklab, var(--color-surface-500) 90%, transparent);
		margin-top: 0.25rem;
	}

	.resource-desc-large {
		font-size: 0.8125rem;
		color: color-mix(in oklab, var(--color-surface-600) 90%, transparent);
		margin-top: 0.375rem;
		line-height: 1.5;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Photo Gallery in Modal */
	.photo-gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.75rem;
	}

	.photo-card {
		aspect-ratio: 1;
		position: relative;
		overflow: hidden;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-900) 70%, transparent);
		cursor: pointer;
		transition: all 200ms ease;
	}

	.photo-card:hover {
		transform: scale(1.02);
		box-shadow: 0 8px 24px -8px color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
	}

	.photo-card img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 300ms ease;
	}

	.photo-card:hover img {
		transform: scale(1.1);
	}

	.photo-card-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 200ms ease;
		color: white;
	}

	.photo-card:hover .photo-card-overlay {
		opacity: 1;
	}

	/* Resource List */
	.resource-list {
		display: grid;
		gap: 0.75rem;
	}

	/* Lightbox */
	.lightbox-backdrop {
		position: fixed !important;
		top: 0 !important;
		left: 0 !important;
		right: 0 !important;
		bottom: 0 !important;
		z-index: 10000 !important;
		display: grid;
		place-items: center;
		padding: clamp(0.25rem, 1.2vw, 0.875rem);
		background: rgba(5, 10, 18, 0.95);
		backdrop-filter: blur(20px);
	}

	.lightbox-panel {
		width: min(99.5vw, 96rem);
		max-height: calc(100dvh - 0.5rem);
		border-radius: 1.25rem;
		padding: clamp(0.5rem, 1vw, 1rem);
		background: color-mix(in oklab, var(--color-surface-950) 96%, black 4%);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 15%, transparent);
		display: grid;
		gap: 0.75rem;
		grid-template-rows: auto minmax(0, 1fr) auto;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}

	.lightbox-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.5rem;
	}

	.mode-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: color-mix(in oklab, var(--color-surface-800) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		border-radius: 0.5rem;
		font-size: 0.75rem;
		color: white;
		transition: all 150ms ease;
	}

	.mode-btn:hover {
		background: color-mix(in oklab, var(--color-secondary-500) 30%, transparent);
	}

	.lightbox-stage {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		height: 100%;
	}

	.lightbox-image {
		width: 100%;
		height: 100%;
		max-height: none;
		max-width: none;
		border-radius: 0.75rem;
		object-fit: contain;
		box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.4);
	}

	.nav-btn {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-800) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		color: white;
		opacity: 0;
		transition: all 200ms ease;
	}

	.nav-left {
		left: 0.5rem;
	}

	.nav-right {
		right: 0.5rem;
	}

	.lightbox-stage:hover .nav-btn {
		opacity: 1;
	}

	.nav-btn:hover {
		opacity: 1 !important;
		background: color-mix(in oklab, var(--color-secondary-500) 40%, transparent);
	}

	.lightbox-grid {
		overflow: auto;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		padding: 0.25rem;
	}

	@media (min-width: 640px) {
		.lightbox-grid {
			gap: 1rem;
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (min-width: 768px) {
		.lightbox-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	@media (min-width: 1024px) {
		.lightbox-grid {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
	}

	.lightbox-grid-item {
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: 0.5rem;
		border: 2px solid transparent;
		transition: all 150ms ease;
		cursor: pointer;
	}

	.lightbox-grid-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.lightbox-grid-item.active {
		border-color: var(--color-secondary-400);
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
	}

	.lightbox-strip {
		overflow-x: auto;
		display: flex;
		gap: 0.375rem;
		padding: 0.25rem;
	}

	.lightbox-thumb {
		flex: 0 0 3.5rem;
		height: 3.5rem;
		border-radius: 0.5rem;
		overflow: hidden;
		border: 2px solid transparent;
		transition: all 150ms ease;
		cursor: pointer;
		opacity: 0.6;
	}

	.lightbox-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.lightbox-thumb:hover {
		opacity: 1;
	}

	.lightbox-thumb.active {
		border-color: var(--color-secondary-400);
		opacity: 1;
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
