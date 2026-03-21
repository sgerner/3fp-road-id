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
	import IconSearch from '@lucide/svelte/icons/search';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconX from '@lucide/svelte/icons/x';

	let {
		articleId = '',
		uploaded = [],
		heading = 'Media Library',
		description = '',
		onInsertSnippet = null
	} = $props();

	const FILTERS = [
		{ value: 'all', label: 'All files' },
		{ value: 'images', label: 'Images' },
		{ value: 'documents', label: 'Documents' }
	];

	let files = $state([]);
	let loading = $state(false);
	let error = $state('');
	let search = $state('');
	let activeFilter = $state('all');
	let currentPage = $state(1);
	let copiedAssetId = $state('');
	let insertedAssetId = $state('');
	let copiedNotice = $state('');
	let previewAssetId = $state('');
	let results = $derived(uploaded);
	const PAGE_SIZE = 12;

	function buildSnippet(item) {
		if (!item?.url) return '';
		if ((item.mimeType || '').startsWith('image/')) {
			return `![${item.fileName}](${item.url})`;
		}
		return `[${item.fileName}](${item.url})`;
	}

	function normalizeAsset(item) {
		const mimeType = item?.mimeType ?? item?.mime_type ?? '';
		const fileName = item?.fileName ?? item?.file_name ?? 'Asset';
		const normalizedArticleId = item?.articleId ?? item?.article_id ?? '';
		return {
			id: item?.id,
			articleId: normalizedArticleId,
			url: item?.url ?? item?.public_url ?? '',
			fileName,
			mimeType,
			sizeBytes: item?.sizeBytes ?? item?.size_bytes ?? null,
			createdAt: item?.createdAt ?? item?.created_at ?? '',
			sourceType: item?.sourceType ?? item?.source_type ?? 'upload',
			sourcePath: item?.sourcePath ?? item?.source_path ?? '',
			usageKind: item?.usageKind ?? item?.usage_kind ?? 'attachment',
			isImage: mimeType.startsWith('image/'),
			isPdf: mimeType === 'application/pdf',
			isCsv: mimeType === 'text/csv' || fileName.toLowerCase().endsWith('.csv'),
			isAttachedToArticle: Boolean(
				articleId && normalizedArticleId && normalizedArticleId === articleId
			)
		};
	}

	let displayItems = $derived(results.map(normalizeAsset));
	let previewAsset = $derived(displayItems.find((item) => item.id === previewAssetId) ?? null);
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

			return [item.fileName, item.mimeType, item.sourcePath, item.usageKind]
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

	async function copySnippet(item) {
		const snippet = buildSnippet(item);
		if (!snippet) return;
		error = '';

		try {
			await navigator.clipboard.writeText(snippet);
			copiedAssetId = item.id;
			insertedAssetId = '';
			copiedNotice = `${item.fileName} copied. Paste it into the article body.`;
		} catch (copyError) {
			error = copyError?.message || 'Unable to copy the asset link.';
		}
	}

	async function insertSnippet(item) {
		const snippet = buildSnippet(item);
		if (!snippet) return;
		error = '';

		const inserted = onInsertSnippet?.(snippet);
		if (inserted) {
			insertedAssetId = item.id;
			copiedAssetId = '';
			copiedNotice = `${item.fileName} inserted into the article.`;
			return;
		}

		await copySnippet(item);
	}

	async function uploadFiles() {
		if (!files.length) return;
		error = '';
		loading = true;

		try {
			const payload = new FormData();
			for (const file of files) payload.append('files', file);
			if (articleId) payload.append('articleId', articleId);

			const response = await fetch('/api/learn/assets', {
				method: 'POST',
				body: payload
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(body?.error || 'Upload failed.');
			}

			uploaded = [...(body?.files ?? []), ...uploaded];
			files = [];
			currentPage = 1;
		} catch (uploadError) {
			error = uploadError.message || 'Upload failed.';
		} finally {
			loading = false;
		}
	}
</script>

<section
	class="border-surface-500/20 bg-surface-900/55 space-y-4 rounded-[1.75rem] border p-5 shadow-lg"
>
	<div class="space-y-1">
		<p class="label">{heading}</p>
		<p class="text-sm opacity-70">
			{description ||
				'Upload files, search the library, preview assets, and insert or copy markdown snippets for the article.'}
		</p>
	</div>

	<input
		type="file"
		multiple
		accept="image/*,application/pdf,text/csv"
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
			<IconUpload class="h-4 w-4" />
			{loading ? 'Uploading…' : 'Upload files'}
		</button>
		{#if files.length}
			<p class="text-sm opacity-70">{files.length} file(s) ready.</p>
		{/if}
	</div>

	{#if copiedNotice}
		<div
			class="border-success-500/25 bg-success-500/10 flex items-start gap-3 rounded-2xl border p-3 text-sm"
		>
			<IconCheck class="text-success-500 mt-0.5 h-4 w-4" />
			<p>{copiedNotice}</p>
		</div>
	{/if}

	{#if error}
		<p class="text-error-500 text-sm">{error}</p>
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
					placeholder="Search files, types, or paths"
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
				{#each pagedItems as item}
					<div
						class="border-surface-500/20 bg-surface-950/55 overflow-hidden rounded-[1.5rem] border shadow-md"
					>
						<button
							type="button"
							class="asset-preview bg-surface-900/80 flex h-48 w-full items-center justify-center overflow-hidden"
							onclick={() => {
								previewAssetId = item.id;
							}}
						>
							{#if item.isImage}
								<img
									class="h-full w-full object-cover"
									src={item.url}
									alt={item.fileName}
									loading="lazy"
								/>
							{:else}
								{@const PreviewIcon = getPreviewIcon(item)}
								<div class="flex flex-col items-center gap-3 px-6 text-center">
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

							<div class="flex flex-wrap gap-2">
								<button
									class="btn btn-sm preset-filled-primary-500 gap-2"
									type="button"
									onclick={() => insertSnippet(item)}
								>
									{#if insertedAssetId === item.id}
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
									onclick={() => copySnippet(item)}
								>
									{#if copiedAssetId === item.id}
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
									onclick={() => {
										previewAssetId = item.id;
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
			<div
				class="border-surface-500/30 bg-surface-950/35 rounded-2xl border border-dashed p-6 text-sm opacity-70"
			>
				No assets match that search yet.
			</div>
		{/if}
	{/if}
</section>

{#if previewAsset}
	<div
		class="bg-surface-50-950/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
	>
		<div
			class="border-surface-500/20 bg-surface-950 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={`Preview ${previewAsset.fileName}`}
		>
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
					onclick={() => {
						previewAssetId = '';
					}}
				>
					<IconX class="h-4 w-4" />
				</button>
			</div>

			<div class="flex-1 overflow-auto p-5">
				{#if previewAsset.isImage}
					<img
						class="mx-auto max-h-[60vh] rounded-[1.5rem] object-contain"
						src={previewAsset.url}
						alt={previewAsset.fileName}
					/>
				{:else if previewAsset.isPdf}
					<iframe
						class="border-surface-500/20 bg-surface-900 h-[60vh] w-full rounded-[1.5rem] border"
						src={previewAsset.url}
						title={previewAsset.fileName}
					></iframe>
				{:else}
					{@const PreviewIcon = getPreviewIcon(previewAsset)}
					<div
						class="border-surface-500/25 bg-surface-900/45 flex h-[32vh] flex-col items-center justify-center rounded-[1.5rem] border border-dashed px-6 text-center"
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

				<textarea class="textarea mt-4 min-h-24 text-xs" readonly value={buildSnippet(previewAsset)}
				></textarea>
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
	</div>
{/if}

<style>
	.asset-preview {
		cursor: pointer;
	}

	.asset-preview img {
		display: block;
	}
</style>
