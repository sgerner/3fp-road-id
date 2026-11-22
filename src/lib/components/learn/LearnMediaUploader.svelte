<script>
	import IconCheck from '@lucide/svelte/icons/check';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconEye from '@lucide/svelte/icons/eye';
	import IconFile from '@lucide/svelte/icons/file';
	import IconFileImage from '@lucide/svelte/icons/file-image';
	import IconFileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import IconFileText from '@lucide/svelte/icons/file-text';
	import IconImage from '@lucide/svelte/icons/image';
	import IconLoader from '@lucide/svelte/icons/loader-circle';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconX from '@lucide/svelte/icons/x';
	import {
		LEARN_ALT_TEXT_MAX_LENGTH,
		buildLearnImageMarkdownSnippet,
		sanitizeAltText
	} from '#lib/learn/altText';

	let {
		articleId = '',
		uploaded = [],
		heading = 'Media Library',
		description = '',
		onInsertSnippet = null,
		getContext = null
	} = $props();

	const FILTERS = [
		{ value: 'all', label: 'All files' },
		{ value: 'images', label: 'Images' },
		{ value: 'documents', label: 'Documents' }
	];

	let files = $state([]);
	let loading = $state(false);
	let error = $state('');
	let statusNotice = $state('');
	let search = $state('');
	let activeFilter = $state('all');
	let currentPage = $state(1);
	let copiedAssetId = $state('');
	let insertedAssetId = $state('');
	let copiedNotice = $state('');
	let previewAssetId = $state('');
	let previewDialog = $state(null);
	let localUploads = $state([]);
	let assetOverrides = $state({});
	let results = $derived.by(() => {
		const seen = new Set();
		const merged = [];
		for (const item of [...localUploads, ...(Array.isArray(uploaded) ? uploaded : [])]) {
			if (!item) continue;
			const key = item.id || item.url || item.public_url;
			if (key && seen.has(key)) continue;
			if (key) seen.add(key);
			merged.push(item);
		}
		return merged;
	});
	const PAGE_SIZE = 12;

	function updateAssetOverride(assetKey, patch) {
		if (!assetKey) return;
		assetOverrides = {
			...assetOverrides,
			[assetKey]: {
				...(assetOverrides[assetKey] || {}),
				...patch
			}
		};
	}

	function buildSnippet(item) {
		if (!item?.url) return '';
		if (item.isImage || (item.mimeType || '').startsWith('image/')) {
			return buildLearnImageMarkdownSnippet({
				url: item.url,
				altText: item.altText,
				isDecorative: item.isDecorative
			});
		}
		return `[${item.fileName}](${item.url})`;
	}

	function normalizeAsset(item) {
		const mimeType = item?.mimeType ?? item?.mime_type ?? '';
		const fileName = item?.fileName ?? item?.file_name ?? 'Asset';
		const normalizedArticleId = item?.articleId ?? item?.article_id ?? '';
		const url = item?.url ?? item?.public_url ?? '';
		const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
		const assetKey = item?.id || url || fileName;
		const override = assetOverrides[assetKey] || null;
		const initialAlt = sanitizeAltText(item?.altText ?? item?.alt_text ?? '', {
			fileName,
			imageUrl: url
		});
		const initialDecorative = Boolean(item?.isDecorative ?? metadata.is_decorative);
		const initialAltGenerated = Boolean(item?.altGenerated ?? metadata.alt_generated);
		return {
			id: item?.id,
			assetKey,
			articleId: normalizedArticleId,
			url,
			fileName,
			mimeType,
			sizeBytes: item?.sizeBytes ?? item?.size_bytes ?? null,
			createdAt: item?.createdAt ?? item?.created_at ?? '',
			sourceType: item?.sourceType ?? item?.source_type ?? 'upload',
			sourcePath: item?.sourcePath ?? item?.source_path ?? '',
			usageKind: item?.usageKind ?? item?.usage_kind ?? 'attachment',
			altText: override?.altText !== undefined ? override.altText : initialAlt,
			isDecorative:
				override?.isDecorative !== undefined ? Boolean(override.isDecorative) : initialDecorative,
			altGenerated:
				override?.altGenerated !== undefined ? Boolean(override.altGenerated) : initialAltGenerated,
			savingAlt: Boolean(override?.savingAlt),
			draftingAlt: Boolean(override?.draftingAlt),
			isImage: mimeType.startsWith('image/'),
			isPdf: mimeType === 'application/pdf',
			isCsv: mimeType === 'text/csv' || fileName.toLowerCase().endsWith('.csv'),
			isAttachedToArticle: Boolean(
				articleId && normalizedArticleId && normalizedArticleId === articleId
			)
		};
	}

	let displayItems = $derived(results.map(normalizeAsset));
	let previewAsset = $derived(
		displayItems.find((item) => item.assetKey === previewAssetId || item.id === previewAssetId) ??
			null
	);
	$effect(() => {
		if (previewAsset && previewDialog && !previewDialog.open) previewDialog.showModal();
	});

	let visibleFilters = $derived(
		articleId ? [...FILTERS, { value: 'article', label: 'This article' }] : FILTERS
	);
	let filteredItems = $derived.by(() => {
		const term = search.trim().toLowerCase();
		return displayItems.filter((item) => {
			if (activeFilter === 'images' && !item.isImage) return false;
			if (activeFilter === 'documents' && item.isImage) return false;
			if (activeFilter === 'article' && !item.isAttachedToArticle) return false;
			if (!term) return true;

			return [item.fileName, item.mimeType, item.sourcePath, item.usageKind, item.altText]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(term));
		});
	});
	let totalPages = $derived(Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE)));
	let pagedItems = $derived.by(() => {
		const start = (currentPage - 1) * PAGE_SIZE;
		return filteredItems.slice(start, start + PAGE_SIZE);
	});

	$effect(() => {
		if (currentPage > totalPages) currentPage = totalPages;
		if (currentPage < 1) currentPage = 1;
	});

	function formatSize(sizeBytes) {
		if (!sizeBytes || Number.isNaN(sizeBytes)) return '';
		if (sizeBytes < 1024) return `${sizeBytes} B`;
		if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
		return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}

	function getPreviewIcon(item) {
		if (item?.isImage) return IconImage;
		if (item?.isPdf) return IconFileText;
		if (item?.isCsv) return IconFileSpreadsheet;
		return IconFile;
	}

	function focusAltInput(item) {
		if (typeof document === 'undefined' || !item?.assetKey) return;
		const dialogOpen = previewDialog?.open && previewAsset?.assetKey === item.assetKey;
		const targetId = dialogOpen
			? `dialog-alt-input-${item.assetKey}`
			: `card-alt-input-${item.assetKey}`;
		document.getElementById(targetId)?.focus();
	}

	async function persistAssetAlt(item, overrides = {}) {
		if (!item?.id || !item?.isImage) return;
		const nextDecorative =
			overrides.isDecorative !== undefined ? Boolean(overrides.isDecorative) : item.isDecorative;
		const rawAlt = overrides.altText !== undefined ? overrides.altText : item.altText;
		const sanitized = nextDecorative
			? ''
			: sanitizeAltText(rawAlt, {
					fileName: item.fileName,
					imageUrl: item.url
				});

		if (!nextDecorative && String(rawAlt || '').trim() && !sanitized) {
			error = `Alt text for ${item.fileName} must describe the image rather than repeating its filename.`;
			statusNotice = error;
			return;
		}

		if (!nextDecorative && sanitized && sanitized !== rawAlt) {
			updateAssetOverride(item.assetKey, { altText: sanitized });
		}

		updateAssetOverride(item.assetKey, { savingAlt: true });
		try {
			await fetch('/api/learn/assets', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: item.id,
					altText: sanitized,
					isDecorative: nextDecorative
				})
			});
		} catch {
			// Non-blocking persistence; local state still drives markdown snippet insertion.
		} finally {
			updateAssetOverride(item.assetKey, { savingAlt: false });
		}
	}

	async function draftAssetAlt(item) {
		if (!item?.isImage || item.draftingAlt) return;
		error = '';
		updateAssetOverride(item.assetKey, { draftingAlt: true });
		statusNotice = `Drafting AI alt text for ${item.fileName}…`;

		try {
			const ctx = getContext?.() ?? {};
			const response = await fetch('/api/learn/ai', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'draft_asset_alt',
					...(item.id ? { assetId: item.id } : {}),
					imageUrl: item.url,
					mimeType: item.mimeType,
					title: ctx.title || '',
					content: ctx.bodyMarkdown || ''
				})
			});
			const result = await response.json().catch(() => ({}));
			const drafted = sanitizeAltText(result?.altText ?? result?.alt_text ?? '', {
				fileName: item.fileName,
				imageUrl: item.url
			});
			if (!response.ok || !drafted) {
				statusNotice = `AI alt-text drafting is unavailable right now for ${item.fileName}. Enter alt text manually below.`;
				focusAltInput(item);
				return;
			}

			updateAssetOverride(item.assetKey, {
				altText: drafted,
				isDecorative: Boolean(result?.isDecorative),
				altGenerated: true
			});
			statusNotice = `AI drafted alt text for ${item.fileName}. Review or edit before inserting.`;
		} catch {
			statusNotice = `AI alt-text drafting timed out for ${item.fileName}. Enter alt text manually below.`;
			focusAltInput(item);
		} finally {
			updateAssetOverride(item.assetKey, { draftingAlt: false });
		}
	}

	function requireReadySnippet(item) {
		const snippet = buildSnippet(item);
		if (snippet) return snippet;
		if (item?.isImage) {
			error = `Add descriptive alt text for ${item.fileName} (not a filename) or mark it decorative before inserting.`;
			statusNotice = error;
			focusAltInput(item);
		}
		return '';
	}

	async function copySnippet(item) {
		const snippet = requireReadySnippet(item);
		if (!snippet) return;
		error = '';
		void persistAssetAlt(item);

		try {
			await navigator.clipboard.writeText(snippet);
			copiedAssetId = item.assetKey;
			insertedAssetId = '';
			copiedNotice = `${item.fileName} copied. Paste it into the article body.`;
			statusNotice = copiedNotice;
		} catch (copyError) {
			error = copyError?.message || 'Unable to copy the asset link.';
		}
	}

	async function insertSnippet(item) {
		const snippet = requireReadySnippet(item);
		if (!snippet) return;
		error = '';
		void persistAssetAlt(item);

		const inserted = onInsertSnippet?.(snippet);
		if (inserted) {
			insertedAssetId = item.assetKey;
			copiedAssetId = '';
			copiedNotice = `${item.fileName} inserted into the article.`;
			statusNotice = copiedNotice;
			return;
		}

		await copySnippet(item);
	}

	async function uploadFiles() {
		if (!files.length) return;
		if (files.length > 8) {
			error = 'You can upload up to 8 files at a time.';
			return;
		}
		if (files.reduce((total, file) => total + file.size, 0) > 64 * 1024 * 1024) {
			error = 'Choose files totaling no more than 64 MB per upload.';
			return;
		}
		error = '';
		statusNotice = 'Uploading files and drafting image alt text…';
		loading = true;

		try {
			const ctx = getContext?.() ?? {};
			const payload = new FormData();
			for (const file of files) payload.append('files', file);
			if (articleId) payload.append('articleId', articleId);
			if (ctx.title) payload.append('articleTitle', ctx.title);
			if (ctx.bodyMarkdown) payload.append('bodyMarkdown', ctx.bodyMarkdown);

			const response = await fetch('/api/learn/assets', {
				method: 'POST',
				body: payload
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(body?.error || 'Upload failed.');
			}

			const uploadedBatch = Array.isArray(body?.files) ? body.files : [];
			localUploads = [...uploadedBatch, ...localUploads];
			files = [];
			currentPage = 1;

			const uploadedImages = uploadedBatch.filter((item) =>
				String(item?.mimeType ?? '').startsWith('image/')
			);
			const summary = body?.aiAltSummary ?? {};
			if (uploadedImages.length) {
				if ((summary.unavailable ?? 0) > 0 && (summary.generated ?? 0) === 0) {
					statusNotice = `Uploaded ${uploadedImages.length} image(s). AI alt-text suggestions are unavailable right now—enter alt text manually below before inserting.`;
				} else if ((summary.unavailable ?? 0) > 0) {
					statusNotice = `Uploaded ${uploadedImages.length} image(s). AI drafted ${summary.generated} description(s); enter alt text manually for ${summary.unavailable} image(s).`;
				} else {
					statusNotice = `Uploaded ${uploadedImages.length} image(s) with AI-drafted alt text. Review or edit each description before inserting.`;
				}
			} else {
				statusNotice = `Uploaded ${uploadedBatch.length} file(s).`;
			}
		} catch (uploadError) {
			error = uploadError.message || 'Upload failed.';
			statusNotice = '';
		} finally {
			loading = false;
		}
	}
</script>

<section class="border-surface-500/30 bg-surface-900 space-y-4 border-t p-5">
	<div class="space-y-1">
		<p class="label">{heading}</p>
		<p class="text-sm opacity-70">
			{description ||
				'Upload files, review AI-drafted image alt text, preview assets, and insert or copy markdown snippets for the article.'}
		</p>
	</div>

	<input
		type="file"
		multiple
		accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/csv"
		onchange={(event) => {
			files = Array.from(event.currentTarget.files ?? []);
		}}
	/>

	<div class="flex flex-wrap items-center gap-3">
		<button
			class="btn preset-filled-secondary-500 gap-2"
			type="button"
			disabled={loading}
			onclick={uploadFiles}
		>
			{#if loading}
				<IconLoader class="h-4 w-4 motion-safe:animate-spin" />
				Uploading…
			{:else}
				<IconUpload class="h-4 w-4" />
				Upload files
			{/if}
		</button>
		{#if files.length}
			<p class="text-sm opacity-70">{files.length} file(s) ready.</p>
		{/if}
	</div>

	<div aria-live="polite" role="status">
		{#if statusNotice && !copiedNotice}
			<p class="border-surface-500/30 bg-surface-950 border-l-2 px-3 py-2 text-xs opacity-85">
				{statusNotice}
			</p>
		{/if}
	</div>

	{#if copiedNotice}
		<div
			class="border-success-500/25 bg-success-500/10 flex items-start gap-3 border p-3 text-sm"
			role="status"
			aria-live="polite"
		>
			<IconCheck class="text-success-500 mt-0.5 h-4 w-4" />
			<p>{copiedNotice}</p>
		</div>
	{/if}

	{#if error}
		<p class="text-error-500 text-sm" role="alert">{error}</p>
	{/if}

	{#if displayItems.length}
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<label class="relative block md:max-w-md md:flex-1">
				<IconSearch
					class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-50"
				/>
				<input
					class="input pl-10"
					type="search"
					placeholder="Search files, alt text, types, or paths"
					bind:value={search}
					oninput={() => {
						currentPage = 1;
					}}
				/>
			</label>

			<div class="flex flex-wrap gap-2">
				{#each visibleFilters as filter}
					<button
						type="button"
						class="btn btn-sm {activeFilter === filter.value
							? 'preset-filled-primary-500'
							: 'preset-tonal-surface'}"
						onclick={() => {
							activeFilter = filter.value;
							currentPage = 1;
						}}
					>
						{filter.label}
					</button>
				{/each}
			</div>
		</div>

		{#if filteredItems.length}
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each pagedItems as item (item.assetKey)}
					<div class="border-surface-500/20 bg-surface-950 overflow-hidden border">
						<button
							type="button"
							aria-label={`Open preview for ${item.fileName}`}
							class="asset-preview bg-surface-900 flex h-48 w-full items-center justify-center overflow-hidden"
							onclick={() => {
								previewAssetId = item.assetKey;
							}}
						>
							{#if item.isImage}
								<img
									class="h-full w-full object-cover"
									src={item.url}
									alt=""
									aria-hidden="true"
									loading="lazy"
								/>
							{:else}
								{@const PreviewIcon = getPreviewIcon(item)}
								<div class="flex flex-col items-center gap-3 px-6 text-center" aria-hidden="true">
									<PreviewIcon class="h-12 w-12 opacity-70" />
									<div class="space-y-1">
										<p class="text-sm font-semibold">{item.mimeType || 'Document'}</p>
										<p class="text-xs opacity-60">Click to preview details and actions</p>
									</div>
								</div>
							{/if}
						</button>

						<div class="space-y-3 p-4">
							<div class="space-y-2">
								<div class="flex items-start justify-between gap-3">
									<p class="line-clamp-2 text-sm font-semibold">{item.fileName}</p>
									<div class="flex flex-wrap justify-end gap-1 text-[10px] uppercase opacity-70">
										{#if item.usageKind}
											<span class="chip preset-tonal-surface text-[10px]">{item.usageKind}</span>
										{/if}
										{#if item.altGenerated && !item.isDecorative}
											<span class="chip preset-tonal-secondary text-[10px]">AI alt</span>
										{/if}
										{#if item.isAttachedToArticle}
											<span class="chip preset-tonal-primary text-[10px]">attached here</span>
										{/if}
										{#if item.sourceType === 'import'}
											<span class="chip preset-tonal-tertiary text-[10px]">imported</span>
										{/if}
									</div>
								</div>

								<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-65">
									<span>{item.mimeType || 'file'}</span>
									{#if item.sizeBytes}
										<span>{formatSize(item.sizeBytes)}</span>
									{/if}
									{#if item.createdAt}
										<span>{formatDate(item.createdAt)}</span>
									{/if}
								</div>

								{#if item.sourcePath}
									<p class="line-clamp-2 text-xs opacity-55">{item.sourcePath}</p>
								{/if}
							</div>

							{#if item.isImage}
								<div class="border-surface-500/20 bg-surface-900 space-y-2 border p-3">
									<div class="flex items-center justify-between gap-2">
										<label
											class="text-xs font-semibold tracking-wide uppercase"
											for={`card-alt-input-${item.assetKey}`}
										>
											Alt text
										</label>
										<span class="text-[11px] tabular-nums opacity-65">
											{item.isDecorative ? 0 : item.altText.length}/{LEARN_ALT_TEXT_MAX_LENGTH}
										</span>
									</div>
									<input
										id={`card-alt-input-${item.assetKey}`}
										class="input text-xs"
										type="text"
										maxlength={LEARN_ALT_TEXT_MAX_LENGTH}
										disabled={item.isDecorative}
										value={item.isDecorative ? '' : item.altText}
										placeholder={item.isDecorative
											? 'Decorative image — empty alt="" will be inserted'
											: 'Describe key visual details or poster text…'}
										oninput={(event) => {
											updateAssetOverride(item.assetKey, {
												altText: event.currentTarget.value,
												altGenerated: false
											});
										}}
										onblur={() => {
											void persistAssetAlt(item);
										}}
									/>
									<div class="flex flex-wrap items-center justify-between gap-2 pt-0.5">
										<label class="flex items-center gap-2 text-xs">
											<input
												type="checkbox"
												class="checkbox accent-secondary-500"
												checked={item.isDecorative}
												onchange={(event) => {
													const checked = event.currentTarget.checked;
													updateAssetOverride(item.assetKey, { isDecorative: checked });
													void persistAssetAlt(item, { isDecorative: checked });
												}}
											/>
											<span>Decorative image (<code>alt=""</code>)</span>
										</label>
										<button
											type="button"
											class="btn btn-sm preset-tonal-surface gap-1.5 text-xs"
											disabled={item.draftingAlt || item.isDecorative}
											aria-label={`Draft alt text with AI for ${item.fileName}`}
											onclick={() => draftAssetAlt(item)}
										>
											{#if item.draftingAlt}
												<IconLoader class="h-3.5 w-3.5 motion-safe:animate-spin" />
												Drafting…
											{:else}
												<IconSparkles class="h-3.5 w-3.5" />
												Draft with AI
											{/if}
										</button>
									</div>
								</div>
							{/if}

							<div class="flex flex-wrap gap-2">
								<button
									class="btn btn-sm preset-filled-primary-500 gap-2"
									type="button"
									aria-label={`Insert ${item.fileName} into article`}
									onclick={() => insertSnippet(item)}
								>
									{#if insertedAssetId === item.assetKey}
										<IconCheck class="h-4 w-4" />
										Inserted
									{:else}
										<IconFileImage class="h-4 w-4" />
										Insert
									{/if}
								</button>
								<button
									class="btn btn-sm preset-tonal-surface gap-2"
									type="button"
									aria-label={`Copy markdown for ${item.fileName}`}
									onclick={() => copySnippet(item)}
								>
									{#if copiedAssetId === item.assetKey}
										<IconCheck class="h-4 w-4" />
										Copied
									{:else}
										<IconCopy class="h-4 w-4" />
										Copy
									{/if}
								</button>
								<button
									class="btn btn-sm preset-tonal-surface gap-2"
									type="button"
									aria-label={`Preview ${item.fileName}`}
									onclick={() => {
										previewAssetId = item.assetKey;
									}}
								>
									<IconEye class="h-4 w-4" />
									Preview
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>

			{#if totalPages > 1}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-xs opacity-65">
						Showing {(currentPage - 1) * PAGE_SIZE + 1}-
						{Math.min(currentPage * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
					</p>
					<div class="flex items-center gap-2">
						<button
							class="btn btn-sm preset-tonal-surface"
							type="button"
							disabled={currentPage <= 1}
							onclick={() => {
								if (currentPage > 1) currentPage -= 1;
							}}
						>
							Previous
						</button>
						<p class="text-xs opacity-70">Page {currentPage} / {totalPages}</p>
						<button
							class="btn btn-sm preset-tonal-surface"
							type="button"
							disabled={currentPage >= totalPages}
							onclick={() => {
								if (currentPage < totalPages) currentPage += 1;
							}}
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		{:else}
			<div class="border-surface-500/30 bg-surface-950 border border-dashed p-6 text-sm opacity-70">
				No assets match that search yet.
			</div>
		{/if}
	{/if}
</section>

{#if previewAsset}
	<dialog
		bind:this={previewDialog}
		class="border-surface-500/20 bg-surface-950 text-surface-50 backdrop:bg-surface-50-950/80 fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-4xl overflow-hidden border p-0"
		aria-label={`Preview ${previewAsset.fileName}`}
		onclose={() => (previewAssetId = '')}
	>
		<div class="flex max-h-[90dvh] flex-col">
			<div class="border-surface-500/15 flex items-start justify-between gap-4 border-b p-5">
				<div class="space-y-1">
					<p class="text-lg font-semibold">{previewAsset.fileName}</p>
					<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-65">
						<span>{previewAsset.mimeType || 'file'}</span>
						{#if previewAsset.sizeBytes}
							<span>{formatSize(previewAsset.sizeBytes)}</span>
						{/if}
						{#if previewAsset.createdAt}
							<span>{formatDate(previewAsset.createdAt)}</span>
						{/if}
					</div>
				</div>
				<button
					class="btn btn-sm preset-tonal-surface"
					type="button"
					aria-label="Close media preview"
					onclick={() => previewDialog.close()}
				>
					<IconX class="h-4 w-4" />
				</button>
			</div>

			<div class="flex-1 overflow-auto p-5">
				{#if previewAsset.isImage}
					<img
						class="mx-auto max-h-[52vh] object-contain"
						src={previewAsset.url}
						alt={previewAsset.isDecorative
							? ''
							: previewAsset.altText || `Preview of ${previewAsset.fileName}`}
					/>
				{:else if previewAsset.isPdf}
					<iframe
						class="border-surface-500/20 bg-surface-900 h-[60vh] w-full border"
						src={previewAsset.url}
						title={previewAsset.fileName}
					></iframe>
				{:else}
					{@const PreviewIcon = getPreviewIcon(previewAsset)}
					<div
						class="border-surface-500/25 bg-surface-900 flex h-[32vh] flex-col items-center justify-center border border-dashed px-6 text-center"
					>
						<PreviewIcon class="h-14 w-14 opacity-65" />
						<p class="mt-4 text-base font-semibold">Preview not embedded for this file type</p>
						<p class="mt-2 max-w-xl text-sm opacity-70">
							Use the actions below to open the file directly or copy a markdown link into the
							article.
						</p>
					</div>
				{/if}

				{#if previewAsset.sourcePath}
					<p class="mt-4 text-xs opacity-55">{previewAsset.sourcePath}</p>
				{/if}

				{#if previewAsset.isImage}
					<div class="border-surface-500/20 bg-surface-900 mt-4 space-y-2 border p-4">
						<div class="flex items-center justify-between gap-2">
							<label
								class="text-xs font-semibold tracking-wide uppercase"
								for={`dialog-alt-input-${previewAsset.assetKey}`}
							>
								Image alt text
							</label>
							<span class="text-xs tabular-nums opacity-65">
								{previewAsset.isDecorative
									? 0
									: previewAsset.altText.length}/{LEARN_ALT_TEXT_MAX_LENGTH}
							</span>
						</div>
						<input
							id={`dialog-alt-input-${previewAsset.assetKey}`}
							class="input text-sm"
							type="text"
							maxlength={LEARN_ALT_TEXT_MAX_LENGTH}
							disabled={previewAsset.isDecorative}
							value={previewAsset.isDecorative ? '' : previewAsset.altText}
							placeholder={previewAsset.isDecorative
								? 'Decorative image — empty alt="" will be inserted'
								: 'Describe key visual details or poster text…'}
							oninput={(event) => {
								updateAssetOverride(previewAsset.assetKey, {
									altText: event.currentTarget.value,
									altGenerated: false
								});
							}}
							onblur={() => {
								void persistAssetAlt(previewAsset);
							}}
						/>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<label class="flex items-center gap-2 text-xs">
								<input
									type="checkbox"
									class="checkbox accent-secondary-500"
									checked={previewAsset.isDecorative}
									onchange={(event) => {
										const checked = event.currentTarget.checked;
										updateAssetOverride(previewAsset.assetKey, { isDecorative: checked });
										void persistAssetAlt(previewAsset, { isDecorative: checked });
									}}
								/>
								<span>Decorative image (empty <code>alt=""</code>)</span>
							</label>
							<button
								type="button"
								class="btn btn-sm preset-tonal-surface gap-1.5 text-xs"
								disabled={previewAsset.draftingAlt || previewAsset.isDecorative}
								aria-label={`Draft alt text with AI for ${previewAsset.fileName}`}
								onclick={() => draftAssetAlt(previewAsset)}
							>
								{#if previewAsset.draftingAlt}
									<IconLoader class="h-3.5 w-3.5 motion-safe:animate-spin" />
									Drafting…
								{:else}
									<IconSparkles class="h-3.5 w-3.5" />
									Draft with AI
								{/if}
							</button>
						</div>
					</div>
				{/if}

				<textarea
					class="textarea mt-4 min-h-24 text-xs"
					aria-label="Markdown snippet"
					readonly
					value={buildSnippet(previewAsset) ||
						(previewAsset.isImage
							? 'Add descriptive alt text above or mark as decorative to generate markdown.'
							: '')}></textarea>
			</div>

			<div class="border-surface-500/15 flex flex-wrap gap-2 border-t p-5">
				<button
					class="btn preset-filled-primary-500 gap-2"
					type="button"
					onclick={() => insertSnippet(previewAsset)}
				>
					<IconFileImage class="h-4 w-4" />
					Insert into article
				</button>
				<button
					class="btn preset-tonal-surface gap-2"
					type="button"
					onclick={() => copySnippet(previewAsset)}
				>
					<IconCopy class="h-4 w-4" />
					Copy markdown
				</button>
				<a
					class="btn preset-tonal-surface gap-2"
					href={previewAsset.url}
					target="_blank"
					rel="noreferrer"
				>
					<IconExternalLink class="h-4 w-4" />
					Open file
				</a>
			</div>
		</div>
	</dialog>
{/if}

<style>
	.asset-preview {
		cursor: pointer;
	}

	.asset-preview img {
		display: block;
	}
</style>
