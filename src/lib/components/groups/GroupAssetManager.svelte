<script>
	import IconImage from '@lucide/svelte/icons/image';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconFile from '@lucide/svelte/icons/file';
	import IconFileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import IconFileCode from '@lucide/svelte/icons/file-code';
	import IconFileArchive from '@lucide/svelte/icons/file-archive';
	import IconPresentation from '@lucide/svelte/icons/presentation';
	import IconLink from '@lucide/svelte/icons/link';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconX from '@lucide/svelte/icons/x';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconLoaderCircle from '@lucide/svelte/icons/loader-circle';
	import IconCheckCircle from '@lucide/svelte/icons/check-circle';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { fade, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';

	function getFileIcon(filename) {
		const ext = filename?.split('.').pop()?.toLowerCase();
		switch (ext) {
			case 'pdf':
				return { component: IconFileText, color: 'text-error-400', bg: 'bg-error-500/15' };
			case 'doc':
			case 'docx':
				return { component: IconFile, color: 'text-primary-400', bg: 'bg-primary-500/15' };
			case 'xls':
			case 'xlsx':
			case 'csv':
				return {
					component: IconFileSpreadsheet,
					color: 'text-success-400',
					bg: 'bg-success-500/15'
				};
			case 'ppt':
			case 'pptx':
				return { component: IconPresentation, color: 'text-warning-400', bg: 'bg-warning-500/15' };
			case 'txt':
			case 'md':
				return { component: IconFileText, color: 'text-surface-300', bg: 'bg-surface-500/15' };
			case 'json':
			case 'js':
			case 'ts':
			case 'css':
			case 'html':
				return { component: IconFileCode, color: 'text-tertiary-400', bg: 'bg-tertiary-500/15' };
			case 'zip':
			case 'rar':
			case '7z':
			case 'tar':
			case 'gz':
				return {
					component: IconFileArchive,
					color: 'text-secondary-400',
					bg: 'bg-secondary-500/15'
				};
			default:
				return { component: IconFile, color: 'text-surface-400', bg: 'bg-surface-500/15' };
		}
	}

	let { slug = '', buckets = [], form = null } = $props();

	let successNotice = $state('');

	// Active tab state
	let activeTab = $state('photos');

	// Form states
	let linkTitle = $state('');
	let linkUrl = $state('');
	let linkDescription = $state('');
	let showLinkForm = $state(false);
	let pendingUploadBucket = $state('');
	let pendingDeleteAssetId = $state('');
	let pendingAddLink = $state(false);
	let pendingLinkUpdateAssetId = $state('');
	let dragOverBucket = $state('');
	let lightboxOpen = $state(false);
	let lightboxItems = $state([]);
	let lightboxIndex = $state(0);

	$effect(() => {
		if (form?.success) {
			successNotice = form.success;
		}
	});

	function getBucket(slug) {
		return buckets.find((b) => b.slug === slug) || { assets: [], asset_count: 0 };
	}

	function getActiveBucket() {
		return getBucket(activeTab);
	}

	function iconForBucket(bucketSlug) {
		if (bucketSlug === 'photos') return IconImage;
		if (bucketSlug === 'links') return IconLink;
		return IconFileText;
	}

	function formatCount(bucket) {
		const count = bucket?.asset_count || 0;
		if (bucket?.slug === 'photos') return `${count} photo${count !== 1 ? 's' : ''}`;
		if (bucket?.slug === 'files') return `${count} file${count !== 1 ? 's' : ''}`;
		return `${count} link${count !== 1 ? 's' : ''}`;
	}

	function handleFileSelect(event, bucketSlug) {
		const files = Array.from(event.target.files || []);
		if (files.length) {
			activeTab = bucketSlug;
			// Auto-submit the form
			event.target.closest('form')?.requestSubmit();
		}
	}

	function handleDragOver(event, bucketSlug) {
		event.preventDefault();
		event.stopPropagation();
		dragOverBucket = bucketSlug;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragLeave(event, bucketSlug) {
		event.preventDefault();
		event.stopPropagation();
		if (dragOverBucket === bucketSlug) {
			dragOverBucket = '';
		}
	}

	function handleDrop(event, bucketSlug) {
		event.preventDefault();
		event.stopPropagation();
		dragOverBucket = '';
		activeTab = bucketSlug;

		const files = Array.from(event.dataTransfer?.files || []).filter(
			(file) => file instanceof File
		);
		if (!files.length) return;

		const uploadZone = event.currentTarget;
		const form = uploadZone?.closest('form');
		const input = form?.querySelector('input[type="file"][name="files"]');
		if (!form || !input) return;

		const transfer = new DataTransfer();
		for (const file of files) {
			transfer.items.add(file);
		}
		input.files = transfer.files;
		form.requestSubmit();
	}

	function resetLinkForm() {
		linkTitle = '';
		linkUrl = '';
		linkDescription = '';
		showLinkForm = false;
	}

	function enhanceUpload(bucketSlug) {
		return () => {
			activeTab = bucketSlug;
			successNotice = '';
			pendingUploadBucket = bucketSlug;

			return async ({ result, update }) => {
				pendingUploadBucket = '';
				await update({ reset: false, invalidateAll: false });

				if (result.type === 'success') {
					successNotice = result.data?.success || 'Saved.';
					await invalidateAll();
				}
			};
		};
	}

	function enhanceAddLink() {
		return () => {
			activeTab = 'links';
			successNotice = '';
			pendingAddLink = true;

			return async ({ result, update }) => {
				pendingAddLink = false;
				await update({ reset: false, invalidateAll: false });

				if (result.type === 'success') {
					successNotice = result.data?.success || 'Saved.';
					resetLinkForm();
					await invalidateAll();
				}
			};
		};
	}

	function enhanceDelete(assetId, bucketSlug, { closeOnSuccess = false } = {}) {
		return () => {
			activeTab = bucketSlug;
			successNotice = '';
			pendingDeleteAssetId = assetId;

			return async ({ result, update }) => {
				pendingDeleteAssetId = '';
				await update({ reset: false, invalidateAll: false });

				if (result.type === 'success') {
					successNotice = result.data?.success || 'Saved.';
					if (closeOnSuccess) {
						closeLightbox();
					}
					await invalidateAll();
				}
			};
		};
	}

	function enhanceUpdateLink(assetId) {
		return () => {
			activeTab = 'links';
			successNotice = '';
			pendingLinkUpdateAssetId = assetId;

			return async ({ result, update }) => {
				pendingLinkUpdateAssetId = '';
				await update({ reset: false, invalidateAll: false });

				if (result.type === 'success') {
					successNotice = result.data?.success || 'Saved.';
					await invalidateAll();
				}
			};
		};
	}

	function openLightbox(bucketAssets, imageAssetId) {
		const images = (bucketAssets || []).filter((asset) => asset.isImage && asset.href);
		if (!images.length) return;
		const index = images.findIndex((asset) => asset.id === imageAssetId);
		lightboxItems = images;
		lightboxIndex = index >= 0 ? index : 0;
		lightboxOpen = true;
	}

	function closeLightbox() {
		lightboxOpen = false;
		lightboxItems = [];
		lightboxIndex = 0;
	}

	function previousLightboxImage() {
		if (!lightboxItems.length) return;
		lightboxIndex = lightboxIndex <= 0 ? lightboxItems.length - 1 : lightboxIndex - 1;
	}

	function nextLightboxImage() {
		if (!lightboxItems.length) return;
		lightboxIndex = lightboxIndex >= lightboxItems.length - 1 ? 0 : lightboxIndex + 1;
	}
</script>

<div class="assets-manager space-y-6">
	<!-- Notifications -->
	{#if successNotice}
		<section
			class="border-success-500/30 bg-success-500/10 rounded-2xl border p-4 text-sm"
			in:slide={{ duration: 250 }}
		>
			<div class="flex items-center gap-2">
				<IconCheckCircle class="text-success-500 h-4 w-4" />
				{successNotice}
			</div>
		</section>
	{/if}

	{#if form?.error}
		<section
			class="border-error-500/30 bg-error-500/10 rounded-2xl border p-4 text-sm"
			in:slide={{ duration: 250 }}
		>
			<div class="flex items-center gap-2">
				<IconAlertCircle class="text-error-500 h-4 w-4" />
				{form.error}
			</div>
		</section>
	{/if}

	<!-- Tabs -->
	<section class="tabs-wrapper" in:fade={{ duration: 300, delay: 100 }}>
		<div class="bg-surface-200-800/50 flex gap-1 overflow-x-auto rounded-xl p-1">
			{#each buckets as bucket}
				{@const Icon = iconForBucket(bucket.slug)}
				{@const isActive = activeTab === bucket.slug}
				<button
					type="button"
					class="tab-button flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all
						{isActive ? 'bg-surface-50-950 shadow-sm' : 'hover:bg-surface-300-700/30 text-surface-600-400'}"
					onclick={() => (activeTab = bucket.slug)}
				>
					<Icon class="h-4 w-4" />
					<span class="hidden sm:inline">{bucket.label}</span>
					<span class="tab-count bg-surface-400-600/30 rounded-full px-2 py-0.5 text-xs">
						{bucket.asset_count || 0}
					</span>
				</button>
			{/each}
		</div>
	</section>

	<!-- Active Bucket Content -->
	{#key activeTab}
		{@const bucket = getActiveBucket()}
		{@const Icon = iconForBucket(activeTab)}
		{@const iconBgClass =
			activeTab === 'photos'
				? 'bg-secondary-500/15 text-secondary-400'
				: activeTab === 'links'
					? 'bg-tertiary-500/15 text-tertiary-400'
					: 'bg-primary-500/15 text-primary-400'}
		{@const emptyIconClass =
			activeTab === 'photos'
				? 'bg-secondary-500/10 text-secondary-400/50'
				: activeTab === 'links'
					? 'bg-tertiary-500/10 text-tertiary-400/50'
					: 'bg-primary-500/10 text-primary-400/50'}
		<section class="bucket-content space-y-4" in:fade={{ duration: 200 }}>
			<!-- Upload/Add Section -->
			<div class="card preset-tonal-surface p-5">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-xl {iconBgClass}">
						<Icon class="h-5 w-5" />
					</div>
					<div class="flex-1">
						<h3 class="font-semibold">{bucket.label}</h3>
						<p class="text-xs opacity-60">{bucket.description}</p>
					</div>
					{#if bucket.asset_count > 0}
						<a
							href={`/groups/${slug}/assets?bucket=${bucket.slug}`}
							target="_blank"
							class="btn btn-sm preset-outlined-surface-500"
						>
							<IconExternalLink class="h-3.5 w-3.5" />
							View Public
						</a>
					{/if}
				</div>

				<!-- Upload/Add Form -->
				<div class="mt-4">
					{#if activeTab === 'links'}
						<form
							method="POST"
							action="?/addLink"
							class="flex flex-col gap-3"
							use:enhance={enhanceAddLink()}
						>
							<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
								<div class="flex flex-1 flex-col gap-2 sm:flex-row">
									<input
										type="text"
										name="title"
										bind:value={linkTitle}
										placeholder="Title (e.g., Volunteer Waiver)"
										class="input preset-tonal-surface flex-1 text-sm"
										required
									/>
									<input
										type="url"
										name="external_url"
										bind:value={linkUrl}
										placeholder="https://..."
										class="input preset-tonal-surface flex-1 font-mono text-sm"
										required
									/>
								</div>
								<button
									type="submit"
									class="btn btn-sm preset-filled-tertiary-500 shrink-0"
									disabled={pendingAddLink}
								>
									{#if pendingAddLink}
										<IconLoaderCircle class="h-4 w-4 animate-spin" />
										Adding...
									{:else}
										<IconPlus class="h-4 w-4" />
										Add
									{/if}
								</button>
							</div>
							<input
								type="text"
								name="description"
								bind:value={linkDescription}
								placeholder="Optional description for visitors"
								class="input preset-tonal-surface w-full text-sm"
							/>
						</form>
					{:else}
						<form
							method="POST"
							action={activeTab === 'photos' ? '?/uploadPhotos' : '?/uploadFiles'}
							enctype="multipart/form-data"
							class="flex flex-col gap-3 sm:flex-row sm:items-end"
							use:enhance={enhanceUpload(activeTab)}
						>
							<div class="flex-1">
								<label
									class="upload-zone border-surface-400-600/40 hover:border-secondary-500/60 hover:bg-surface-200-800/30 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 transition-colors {pendingUploadBucket ===
									activeTab
										? 'is-uploading'
										: ''} {dragOverBucket === activeTab ? 'is-dragging' : ''}"
									ondragover={(event) => handleDragOver(event, activeTab)}
									ondragenter={(event) => handleDragOver(event, activeTab)}
									ondragleave={(event) => handleDragLeave(event, activeTab)}
									ondrop={(event) => handleDrop(event, activeTab)}
								>
									<input
										type="file"
										name="files"
										multiple
										accept={activeTab === 'photos'
											? 'image/*'
											: 'application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip'}
										class="hidden"
										disabled={pendingUploadBucket === activeTab}
										onchange={(e) => handleFileSelect(e, activeTab)}
									/>
									{#if pendingUploadBucket === activeTab}
										<IconLoaderCircle class="h-5 w-5 animate-spin opacity-70" />
									{:else}
										<IconUpload class="h-5 w-5 opacity-50" />
									{/if}
									<span class="text-center text-sm opacity-70">
										{#if pendingUploadBucket === activeTab}
											Uploading...
										{:else}
											{activeTab === 'photos'
												? 'Drop photos here or click to upload'
												: 'Drop files here or click to upload'}
										{/if}
									</span>
									<span class="text-xs opacity-50">
										{activeTab === 'photos'
											? 'JPG, PNG, WEBP up to 25MB'
											: 'PDF, DOC, XLS, PPT, TXT up to 25MB'}
									</span>
								</label>
							</div>
						</form>
					{/if}
				</div>
			</div>

			<!-- Assets List -->
			{#if bucket.assets.length > 0}
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-semibold opacity-70">
							{formatCount(bucket)}
						</h3>
					</div>

					{#if activeTab === 'links'}
						<div class="flex flex-col gap-3">
							{#each bucket.assets as asset (asset.id)}
								<div
									class="card preset-tonal-surface p-3.5 transition-all duration-200 hover:-translate-y-px hover:shadow-lg"
									animate:flip={{ duration: 200 }}
								>
									<div class="flex items-start gap-3">
										<!-- Icon -->
										<div
											class="bg-tertiary-500/15 text-tertiary-400 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
										>
											<IconLink class="h-4 w-4" />
										</div>

										<!-- Inputs row -->
										<div class="flex min-w-0 flex-1 items-center gap-2">
											<form
												method="POST"
												action="?/updateLink"
												class="contents"
												use:enhance={enhanceUpdateLink(asset.id)}
											>
												<input type="hidden" name="asset_id" value={asset.id} />
												<input
													type="text"
													name="title"
													value={asset.title || ''}
													class="input preset-tonal-surface max-w-[14rem] text-sm font-medium"
													disabled={pendingDeleteAssetId === asset.id}
													onchange={(event) => event.currentTarget.form?.requestSubmit()}
													placeholder="Title"
													required
												/>
											</form>
											<form
												method="POST"
												action="?/updateLink"
												class="contents"
												use:enhance={enhanceUpdateLink(asset.id)}
											>
												<input type="hidden" name="asset_id" value={asset.id} />
												<input
													type="url"
													name="external_url"
													value={asset.href || ''}
													class="input preset-tonal-surface text-tertiary-400 flex-1 font-mono text-xs"
													disabled={pendingDeleteAssetId === asset.id}
													onchange={(event) => event.currentTarget.form?.requestSubmit()}
													placeholder="https://..."
													required
												/>
											</form>

											<!-- Saving indicator -->
											{#if pendingLinkUpdateAssetId === asset.id}
												<span class="text-tertiary-400 text-xs whitespace-nowrap">Saving...</span>
											{/if}
										</div>

										<!-- Delete button at the end -->
										<form
											method="POST"
											action="?/deleteAsset"
											class="shrink-0"
											use:enhance={enhanceDelete(asset.id, activeTab)}
										>
											<input type="hidden" name="asset_id" value={asset.id} />
											<button
												type="submit"
												class="btn btn-icon btn-sm preset-filled-error-500"
												disabled={pendingDeleteAssetId === asset.id}
												onclick={(e) => !confirm('Remove this asset?') && e.preventDefault()}
												aria-label="Remove asset"
											>
												{#if pendingDeleteAssetId === asset.id}
													<IconLoaderCircle class="h-3.5 w-3.5 animate-spin" />
												{:else}
													<IconTrash2 class="h-3.5 w-3.5" />
												{/if}
											</button>
										</form>
									</div>

									<!-- Description row -->
									<div class="mt-2 pl-11">
										<form
											method="POST"
											action="?/updateLink"
											class="contents"
											use:enhance={enhanceUpdateLink(asset.id)}
										>
											<input type="hidden" name="asset_id" value={asset.id} />
											<input
												type="text"
												name="description"
												value={asset.description || ''}
												class="input preset-tonal-surface w-full text-xs"
												disabled={pendingDeleteAssetId === asset.id}
												onchange={(event) => event.currentTarget.form?.requestSubmit()}
												placeholder="Optional description"
											/>
										</form>
									</div>
								</div>
							{/each}
						</div>
					{:else if activeTab === 'photos'}
						<!-- Photos Grid Layout -->
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each bucket.assets as asset (asset.id)}
								<div
									class="asset-card card preset-tonal-surface group relative overflow-hidden"
									animate:flip={{ duration: 200 }}
								>
									<!-- Asset Preview -->
									<div class="bg-surface-200-800/50 aspect-video overflow-hidden">
										{#if asset.isImage && asset.href}
											<button
												type="button"
												class="h-full w-full cursor-zoom-in"
												aria-label={`Preview ${asset.title}`}
												onclick={() => openLightbox(bucket.assets, asset.id)}
											>
												<img
													src={asset.href}
													alt={asset.title}
													class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
												/>
											</button>
										{:else}
											<div class="flex h-full w-full items-center justify-center">
												<Icon class="h-10 w-10 opacity-30" />
											</div>
										{/if}
									</div>

									<!-- Asset Info -->
									<div class="p-3">
										<div class="flex items-start gap-2">
											<a
												href={asset.href}
												target="_blank"
												rel="noopener noreferrer"
												class="block min-w-0 flex-1 truncate font-medium hover:underline"
											>
												{asset.title}
											</a>
											<form
												method="POST"
												action="?/deleteAsset"
												use:enhance={enhanceDelete(asset.id, activeTab)}
											>
												<input type="hidden" name="asset_id" value={asset.id} />
												<button
													type="submit"
													class="btn btn-icon btn-sm preset-filled-error-500 shrink-0"
													disabled={pendingDeleteAssetId === asset.id}
													onclick={(e) => !confirm('Remove this asset?') && e.preventDefault()}
													aria-label="Remove asset"
												>
													{#if pendingDeleteAssetId === asset.id}
														<IconLoaderCircle class="h-3.5 w-3.5 animate-spin" />
													{:else}
														<IconTrash2 class="h-3.5 w-3.5" />
													{/if}
												</button>
											</form>
										</div>
										{#if asset.description}
											<p class="mt-0.5 line-clamp-1 text-xs opacity-60">{asset.description}</p>
										{/if}
										{#if asset.sizeLabel}
											<div class="flex items-center gap-2 text-[10px] opacity-50">
												<span>{asset.sizeLabel}</span>
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<!-- Files Horizontal Layout -->
						<div class="flex flex-col gap-3">
							{#each bucket.assets as asset (asset.id)}
								{@const fileIcon = getFileIcon(asset.title)}
								{@const FileIconComponent = fileIcon.component}
								<div
									class="card preset-tonal-surface p-3 transition-all duration-200 hover:-translate-y-px hover:shadow-lg"
									animate:flip={{ duration: 200 }}
								>
									<div class="flex items-center gap-3">
										<!-- File Preview/Icon -->
										{#if asset.thumbnailHref}
											<a
												href={asset.href}
												target="_blank"
												rel="noopener noreferrer"
												class="bg-surface-200-800/50 h-12 w-12 shrink-0 overflow-hidden rounded-lg"
											>
												<img
													src={asset.thumbnailHref}
													alt={asset.title}
													class="h-full w-full object-cover"
												/>
											</a>
										{:else}
											<div
												class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg {fileIcon.bg}"
											>
												<FileIconComponent class="h-6 w-6 {fileIcon.color}" />
											</div>
										{/if}

										<!-- File Info -->
										<div class="flex min-w-0 flex-1 flex-col gap-0.5">
											<a
												href={asset.href}
												target="_blank"
												rel="noopener noreferrer"
												class="truncate text-sm font-medium hover:underline"
											>
												{asset.title}
											</a>
											{#if asset.description}
												<p class="truncate text-xs opacity-60">{asset.description}</p>
											{/if}
											{#if asset.sizeLabel}
												<span class="text-[10px] opacity-50">{asset.sizeLabel}</span>
											{/if}
										</div>

										<!-- Delete Button -->
										<form
											method="POST"
											action="?/deleteAsset"
											class="shrink-0"
											use:enhance={enhanceDelete(asset.id, activeTab)}
										>
											<input type="hidden" name="asset_id" value={asset.id} />
											<button
												type="submit"
												class="btn btn-icon btn-sm preset-filled-error-500"
												disabled={pendingDeleteAssetId === asset.id}
												onclick={(e) => !confirm('Remove this asset?') && e.preventDefault()}
												aria-label="Remove asset"
											>
												{#if pendingDeleteAssetId === asset.id}
													<IconLoaderCircle class="h-3.5 w-3.5 animate-spin" />
												{:else}
													<IconTrash2 class="h-3.5 w-3.5" />
												{/if}
											</button>
										</form>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<div
					class="card preset-tonal-surface flex flex-col items-center justify-center p-8 text-center"
				>
					<div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl {emptyIconClass}">
						<Icon class="h-6 w-6" />
					</div>
					<p class="font-medium opacity-70">{bucket.emptyLabel}</p>
					<p class="mt-1 text-xs opacity-50">
						{activeTab === 'links'
							? 'Click "Add New Link" above to get started'
							: 'Upload files using the dropzone above'}
					</p>
				</div>
			{/if}
		</section>
	{/key}
</div>

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
			if (event.key === 'ArrowLeft') previousLightboxImage();
			if (event.key === 'ArrowRight') nextLightboxImage();
		}}
	>
		<div class="lightbox-panel" role="document" tabindex="-1">
			<div class="lightbox-toolbar">
				<div class="text-sm opacity-70">{lightboxIndex + 1} / {lightboxItems.length}</div>
				<div class="flex items-center gap-2">
					<form
						method="POST"
						action="?/deleteAsset"
						use:enhance={enhanceDelete(lightboxItems[lightboxIndex]?.id, activeTab, {
							closeOnSuccess: true
						})}
					>
						<input type="hidden" name="asset_id" value={lightboxItems[lightboxIndex]?.id} />
						<button
							type="submit"
							class="btn btn-icon btn-sm preset-filled-error-500"
							disabled={pendingDeleteAssetId === lightboxItems[lightboxIndex]?.id}
							onclick={(event) => !confirm('Remove this asset?') && event.preventDefault()}
							aria-label="Remove asset"
						>
							{#if pendingDeleteAssetId === lightboxItems[lightboxIndex]?.id}
								<IconLoaderCircle class="h-4 w-4 animate-spin" />
							{:else}
								<IconTrash2 class="h-4 w-4" />
							{/if}
						</button>
					</form>
					<button type="button" class="lightbox-close" onclick={closeLightbox}>
						<IconX class="h-5 w-5" />
					</button>
				</div>
			</div>
			<div class="lightbox-stage">
				<img
					src={lightboxItems[lightboxIndex]?.href}
					alt={lightboxItems[lightboxIndex]?.title}
					class="max-h-[70vh] max-w-full rounded-3xl object-contain"
				/>
				{#if lightboxItems.length > 1}
					<button
						type="button"
						class="lightbox-nav lightbox-nav-left"
						onclick={previousLightboxImage}
					>
						<IconChevronLeft class="h-5 w-5" />
					</button>
					<button type="button" class="lightbox-nav lightbox-nav-right" onclick={nextLightboxImage}>
						<IconChevronRight class="h-5 w-5" />
					</button>
				{/if}
			</div>
			<div class="pt-4 text-center">
				<div class="font-semibold">{lightboxItems[lightboxIndex]?.title}</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.assets-manager {
		--manager-primary: var(--color-secondary-500);
	}

	.tab-button {
		white-space: nowrap;
	}

	.tab-count {
		font-variant-numeric: tabular-nums;
	}

	.upload-zone {
		min-height: 100px;
	}

	.upload-zone.is-uploading {
		border-color: color-mix(in oklab, var(--color-secondary-500) 70%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 10%, var(--color-surface-900));
		animation: uploading-pulse 900ms ease-in-out infinite;
	}

	.upload-zone.is-dragging {
		border-color: color-mix(in oklab, var(--color-secondary-500) 90%, transparent);
		background: color-mix(in oklab, var(--color-secondary-500) 16%, var(--color-surface-900));
	}

	.asset-card {
		transition:
			transform 200ms ease,
			box-shadow 200ms ease;
	}

	.asset-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px -8px color-mix(in oklab, var(--color-surface-500) 30%, transparent);
	}

	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(5, 10, 18, 0.88);
		backdrop-filter: blur(12px);
	}

	.lightbox-panel {
		width: min(100%, 72rem);
		border-radius: 2rem;
		padding: 1.25rem;
		background: color-mix(in oklab, var(--color-surface-950) 95%, black 5%);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 20%, transparent);
	}

	.lightbox-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.lightbox-close,
	.lightbox-nav {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		color: white;
	}

	.lightbox-close {
		width: 2.5rem;
		height: 2.5rem;
	}

	.lightbox-stage {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-top: 1rem;
	}

	.lightbox-nav {
		position: absolute;
		top: 50%;
		width: 2.75rem;
		height: 2.75rem;
		transform: translateY(-50%);
	}

	.lightbox-nav-left {
		left: 0;
	}

	.lightbox-nav-right {
		right: 0;
	}

	/* Line clamp utility */
	.line-clamp-1 {
		display: -webkit-box;
		line-clamp: 1;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@keyframes uploading-pulse {
		0% {
			box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		}
		70% {
			box-shadow: 0 0 0 8px color-mix(in oklab, var(--color-secondary-500) 0%, transparent);
		}
		100% {
			box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-secondary-500) 0%, transparent);
		}
	}
</style>
