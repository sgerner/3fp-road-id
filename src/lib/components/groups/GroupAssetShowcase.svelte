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
	import { page } from '$app/state';
	import { fade, scale } from 'svelte/transition';

	let { slug = '', buckets = [] } = $props();

	const PANEL_KEYS = new Set(['links', 'files', 'all']);
	const DEFAULT_PREVIEW_COUNT = 3;
	const PHOTO_PREVIEW_COUNT = 12;

	let quickSearch = $state('');
	let hasInitializedSearch = $state(false);
	let photoLightboxOpen = $state(false);
	let photoLightboxAssets = $state([]);
	let photoLightboxIndex = $state(0);
	let photoLightboxMode = $state('single');

	const panel = $derived(
		(() => {
			const value = (page.url.searchParams.get('panel') || '').trim().toLowerCase();
			return PANEL_KEYS.has(value) ? value : '';
		})()
	);
	const panelQuery = $derived((page.url.searchParams.get('q') || '').trim());
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
		const url = new URL(page.url);
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
		const url = new URL(page.url);
		url.searchParams.delete('panel');
		url.searchParams.delete('q');
		await goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	async function openSearchPanel(event) {
		event.preventDefault();
		const url = new URL(page.url);
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

	function shouldShowBucket(bucket) {
		return !quickSearch.trim() || previewAssets(bucket).length > 0;
	}
</script>

{#if buckets.length}
	<section class="flex flex-col gap-6">
		<!-- Search Bar -->
		<div class="border-surface-50 flex border-[3px]">
			<div class="relative flex-1">
				<IconSearch
					class="text-surface-400 pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
				/>
				<input
					id="resource-search"
					type="search"
					class="bg-surface-950 text-surface-50 placeholder:text-surface-400 w-full border-0 py-3 pr-4 pl-11 text-sm font-medium focus:outline-none"
					placeholder="Search photos, links, and files..."
					bind:value={quickSearch}
				/>
			</div>
			<a
				href={panelHref('all')}
				class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex shrink-0 items-center gap-2 px-5 py-3 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline"
				onclick={openSearchPanel}
			>
				<span>Search</span>
				<IconArrowRight class="h-4 w-4" />
			</a>
		</div>

		<!-- Asset Buckets -->
		<div class="flex flex-col gap-6">
			{#each buckets as bucket (bucket.slug)}
				{#if shouldShowBucket(bucket)}
					{@const Icon = iconForBucket(bucket.slug)}
					{@const items = previewAssets(bucket)}
					<div class="border-surface-800 border-t-2 pt-5" in:fade={{ duration: 170 }}>
						<!-- Bucket Header -->
						<div class="mb-4 flex items-center justify-between gap-3">
							<div class="flex items-center gap-3">
								<span
									class="bg-primary-500 text-surface-950 flex h-8 w-8 shrink-0 items-center justify-center"
								>
									<Icon class="h-4 w-4" />
								</span>
								<span class="text-surface-50 text-base font-black uppercase">{bucket.label}</span>
							</div>
							{#if bucket.slug === 'photos'}
								<button
									type="button"
									class="text-primary-500 hover:text-surface-50 inline-flex cursor-pointer items-center gap-1.5 text-xs font-black tracking-[0.16em] uppercase"
									onclick={() => openPhotoLightbox(bucket, { mode: 'grid' })}
								>
									<span>View all</span>
									<IconArrowRight class="h-3.5 w-3.5" />
								</button>
							{:else}
								<a
									href={panelHref(bucket.slug)}
									class="text-primary-500 hover:text-surface-50 inline-flex items-center gap-1.5 text-xs font-black tracking-[0.16em] uppercase hover:no-underline"
								>
									<span>View all</span>
									<IconArrowRight class="h-3.5 w-3.5" />
								</a>
							{/if}
						</div>

						<!-- Bucket Content -->
						<div>
							{#if items.length}
								{#if bucket.slug === 'photos'}
									<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
										{#each items as asset, index (asset.href ?? index)}
											<button
												type="button"
												class="group border-surface-800 hover:border-primary-500 relative aspect-square cursor-pointer overflow-hidden border-2 transition"
												onclick={() => openPhotoLightbox(bucket, { index, mode: 'single' })}
												in:fade={{ duration: 160 }}
											>
												<img
													src={asset.href}
													alt={asset.title}
													class="h-full w-full object-cover"
												/>
												<div
													class="bg-surface-950/75 text-primary-500 absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100"
												>
													<IconImage class="h-5 w-5" />
												</div>
											</button>
										{/each}
									</div>
								{:else}
									<ul class="border-surface-800 m-0 list-none border-t p-0">
										{#each items as asset, idx (asset.href ?? idx)}
											<li class="border-surface-800 border-b" in:fade={{ duration: 160 }}>
												<a
													href={asset.href}
													target="_blank"
													rel="noopener noreferrer"
													class="text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex items-center justify-between gap-3 px-3 py-3 text-sm font-bold transition hover:no-underline"
												>
													<span class="flex min-w-0 items-center gap-3">
														<Icon class="h-4 w-4 shrink-0" />
														<span class="truncate">{asset.title}</span>
													</span>
													<IconExternalLink class="h-4 w-4 shrink-0" />
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							{:else}
								<div class="border-surface-800 border p-4 text-sm opacity-75">
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

<!-- Resources Modal -->
{#if panel}
	<div
		class="fixed inset-0 z-[9999] grid place-items-center bg-black/90 p-4"
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
			class="bg-surface-950 text-surface-50 border-primary-500 grid max-h-[calc(100vh-2rem)] w-[min(92vw,48rem)] grid-rows-[auto_minmax(0,1fr)] border-[3px]"
			role="document"
			in:scale={{ start: 0.98, duration: 180 }}
			out:scale={{ start: 0.98, duration: 140 }}
		>
			<!-- Modal Header -->
			<div class="border-surface-800 flex items-center justify-between gap-4 border-b-2 p-5">
				<div class="flex items-center gap-3">
					{#if openBucket}
						{@const Icon = iconForBucket(openBucket.slug)}
						<div
							class="bg-primary-500 text-surface-950 flex h-10 w-10 shrink-0 items-center justify-center"
						>
							<Icon class="h-5 w-5" />
						</div>
					{/if}
					<div>
						<h3 class="text-surface-50! m-0 text-xl font-black uppercase">
							{panel === 'all' ? 'Search Results' : openBucket?.label || 'Resources'}
						</h3>
						{#if panelQuery || quickSearch}
							<p class="text-surface-300 m-0 text-xs">
								{filteredAssets(openBucket || buckets[0], panelQuery || quickSearch).length} results for
								"{panelQuery || quickSearch}"
							</p>
						{/if}
					</div>
				</div>
				<div class="flex items-center gap-2">
					{#if panel !== 'all' && openBucket}
						<a
							href={canonicalHref(openBucket.slug)}
							class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex items-center gap-1.5 border-2 px-3 py-2 text-xs font-black uppercase transition hover:no-underline"
						>
							<IconExternalLink class="h-4 w-4" />
							<span>Open page</span>
						</a>
					{/if}
					<button
						type="button"
						class="bg-tertiary-500 text-surface-950 hover:bg-primary-500 flex h-10 w-10 cursor-pointer items-center justify-center transition"
						onclick={closePanel}
						aria-label="Close modal"
					>
						<IconX class="h-5 w-5" />
					</button>
				</div>
			</div>

			<!-- Modal Body -->
			<div class="overflow-auto p-5">
				{#if panel === 'all'}
					{#if hasAnyMatches(panelQuery || quickSearch)}
						<div class="flex flex-col gap-6">
							{#each buckets as bucket (bucket.slug)}
								{@const matches = filteredAssets(bucket, panelQuery || quickSearch)}
								{@const Icon = iconForBucket(bucket.slug)}
								{#if matches.length}
									<div class="flex flex-col gap-3" in:fade={{ duration: 170 }}>
										<div class="border-surface-800 flex items-center justify-between border-b pb-2">
											<div class="flex items-center gap-2">
												<Icon class="text-primary-500 h-4 w-4" />
												<span class="text-sm font-black uppercase">{bucket.label}</span>
											</div>
											<span class="text-tertiary-500 text-xs font-black tabular-nums">
												{matches.length}
											</span>
										</div>
										<div class="flex flex-col gap-2">
											{#each matches as asset, idx (asset.href ?? idx)}
												{@const FileIcon = getFileIcon(asset)}
												<a
													href={asset.href}
													target="_blank"
													rel="noopener noreferrer"
													class="border-surface-800 text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex items-center gap-3 border p-3 transition hover:no-underline"
													in:fade={{ duration: 170 }}
												>
													<div
														class="bg-secondary-500 text-surface-50 flex h-10 w-10 shrink-0 items-center justify-center"
													>
														<FileIcon class="h-5 w-5" />
													</div>
													<div class="min-w-0 flex-1">
														<div class="truncate text-sm font-black">{asset.title}</div>
														{#if asset.file_name}
															<div class="text-xs opacity-75">
																{formatFileName(asset.file_name)}
															</div>
														{/if}
														{#if asset.description}
															<div class="mt-1 line-clamp-2 text-xs opacity-80">
																{asset.description}
															</div>
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
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<IconSearch class="text-primary-500 mb-3 h-10 w-10" />
							<p class="m-0 text-sm font-black uppercase">No results found</p>
							<p class="text-surface-300 m-0 mt-1 text-xs">Try a different search term</p>
						</div>
					{/if}
				{:else if openBucket}
					{@const matches = filteredAssets(openBucket, panelQuery || quickSearch)}
					{#if openBucket.slug === 'photos'}
						<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
							{#each matches as asset, idx (asset.href ?? idx)}
								<button
									type="button"
									class="group border-surface-800 hover:border-primary-500 relative aspect-square cursor-pointer overflow-hidden border-2"
									onclick={() => {
										photoLightboxAssets = matches;
										photoLightboxIndex = matches.indexOf(asset);
										photoLightboxMode = 'single';
										photoLightboxOpen = true;
									}}
								>
									<img src={asset.href} alt={asset.title} class="h-full w-full object-cover" />
									<div
										class="bg-surface-950/75 text-primary-500 absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100"
									>
										<IconImage class="h-6 w-6" />
									</div>
								</button>
							{/each}
						</div>
					{:else}
						<div class="flex flex-col gap-2">
							{#each matches as asset, idx (asset.href ?? idx)}
								{@const FileIcon = getFileIcon(asset)}
								<a
									href={asset.href}
									target="_blank"
									rel="noopener noreferrer"
									class="border-surface-800 text-surface-50 hover:bg-primary-500 hover:text-surface-950 flex items-center gap-4 border p-4 transition hover:no-underline"
								>
									<div
										class="bg-secondary-500 text-surface-50 flex h-12 w-12 shrink-0 items-center justify-center"
									>
										<FileIcon class="h-6 w-6" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="text-base font-black">{asset.title}</div>
										{#if asset.file_name}
											<div class="text-xs opacity-75">{formatFileName(asset.file_name)}</div>
										{/if}
										{#if asset.description}
											<div class="mt-1 line-clamp-2 text-xs opacity-80">{asset.description}</div>
										{/if}
									</div>
									<IconExternalLink class="h-4 w-4 shrink-0" />
								</a>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Photo Lightbox -->
{#if photoLightboxOpen && photoLightboxAssets.length}
	<div
		class="fixed inset-0 z-[10000] grid place-items-center bg-black/95 p-3"
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
			class="bg-surface-950 border-primary-500 grid max-h-[calc(100dvh-1.5rem)] w-[min(98vw,92rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 border-[3px] p-4"
			role="document"
			tabindex="-1"
			in:scale={{ start: 0.98, duration: 170 }}
			out:scale={{ start: 0.98, duration: 130 }}
		>
			<div class="border-surface-800 flex items-center justify-between gap-4 border-b pb-3">
				<div class="text-primary-500 text-sm font-black tabular-nums">
					{photoLightboxIndex + 1} / {photoLightboxAssets.length}
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex cursor-pointer items-center gap-1.5 border-2 px-3 py-1.5 text-xs font-black uppercase transition"
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
					<button
						type="button"
						class="bg-tertiary-500 text-surface-950 hover:bg-primary-500 flex h-9 w-9 cursor-pointer items-center justify-center"
						onclick={closePhotoLightbox}
						aria-label="Close lightbox"
					>
						<IconX class="h-5 w-5" />
					</button>
				</div>
			</div>

			{#if photoLightboxMode === 'grid'}
				<div
					class="grid grid-cols-2 gap-3 overflow-auto p-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
				>
					{#each photoLightboxAssets as asset, index (asset.href ?? index)}
						<button
							type="button"
							class="aspect-square cursor-pointer overflow-hidden border-2 {photoLightboxIndex ===
							index
								? 'border-primary-500'
								: 'border-surface-800'}"
							onclick={() => {
								photoLightboxIndex = index;
								photoLightboxMode = 'single';
							}}
						>
							<img src={asset.href} alt={asset.title} class="h-full w-full object-cover" />
						</button>
					{/each}
				</div>
			{:else}
				<div class="relative flex min-h-0 items-center justify-center">
					<img
						src={photoLightboxAssets[photoLightboxIndex]?.href}
						alt={photoLightboxAssets[photoLightboxIndex]?.title}
						class="h-full w-full object-contain"
					/>
					{#if photoLightboxAssets.length > 1}
						<button
							type="button"
							class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 absolute top-1/2 left-2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center"
							onclick={previousPhoto}
							aria-label="Previous image"
						>
							<IconChevronLeft class="h-5 w-5" />
						</button>
						<button
							type="button"
							class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 absolute top-1/2 right-2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center"
							onclick={nextPhoto}
							aria-label="Next image"
						>
							<IconChevronRight class="h-5 w-5" />
						</button>
					{/if}
				</div>
			{/if}

			<div class="flex gap-2 overflow-x-auto pt-1">
				{#each photoLightboxAssets as asset, index (asset.href ?? index)}
					<button
						type="button"
						class="h-14 w-14 shrink-0 cursor-pointer overflow-hidden border-2 {photoLightboxIndex ===
						index
							? 'border-primary-500 opacity-100'
							: 'border-surface-800 opacity-60 hover:opacity-100'}"
						onclick={() => (photoLightboxIndex = index)}
						aria-label={`Show image ${index + 1}`}
					>
						<img src={asset.href} alt={asset.title} class="h-full w-full object-cover" />
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
