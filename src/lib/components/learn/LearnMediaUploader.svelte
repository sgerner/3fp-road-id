<script>
	let { articleId = '', uploaded = [], heading = 'Media Library', description = '' } = $props();

	let files = $state([]);
	let loading = $state(false);
	let error = $state('');
	let results = $derived(uploaded);

	function buildSnippet(item) {
		if (!item?.url) return '';
		if ((item.mimeType || '').startsWith('image/')) {
			return `![${item.fileName}](${item.url})`;
		}
		return `[${item.fileName}](${item.url})`;
	}

	function normalizeAsset(item) {
		return {
			id: item?.id,
			articleId: item?.articleId ?? item?.article_id ?? '',
			url: item?.url ?? item?.public_url ?? '',
			fileName: item?.fileName ?? item?.file_name ?? 'Asset',
			mimeType: item?.mimeType ?? item?.mime_type ?? '',
			sizeBytes: item?.sizeBytes ?? item?.size_bytes ?? null,
			createdAt: item?.createdAt ?? item?.created_at ?? '',
			sourceType: item?.sourceType ?? item?.source_type ?? 'upload',
			sourcePath: item?.sourcePath ?? item?.source_path ?? '',
			usageKind: item?.usageKind ?? item?.usage_kind ?? 'attachment'
		};
	}

	let displayItems = $derived(results.map(normalizeAsset));

	function formatSize(sizeBytes) {
		if (!sizeBytes || Number.isNaN(sizeBytes)) return '';
		if (sizeBytes < 1024) return `${sizeBytes} B`;
		if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
		return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
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
		} catch (uploadError) {
			error = uploadError.message || 'Upload failed.';
		} finally {
			loading = false;
		}
	}
</script>

<section class="space-y-3 rounded-[1.75rem] border border-surface-500/20 bg-surface-900/55 p-5 shadow-lg">
	<div class="space-y-1">
		<p class="label">{heading}</p>
		<p class="text-sm opacity-70">
			{description || 'Upload files to Supabase Storage, browse existing assets, and paste the generated markdown into the article.'}
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
		<button class="btn preset-filled-secondary-500" type="button" disabled={loading} onclick={uploadFiles}>
			{loading ? 'Uploading…' : 'Upload files'}
		</button>
		{#if files.length}
			<p class="text-sm opacity-70">{files.length} file(s) ready.</p>
		{/if}
	</div>

	{#if error}
		<p class="text-error-500 text-sm">{error}</p>
	{/if}

	{#if displayItems.length}
		<div class="space-y-3">
			{#each displayItems as item}
				<div class="rounded-2xl border border-surface-500/20 bg-surface-950/55 p-3">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<a class="font-medium hover:underline" href={item.url} target="_blank" rel="noreferrer">
							{item.fileName}
						</a>
						<div class="flex flex-wrap items-center gap-2 text-xs uppercase opacity-60">
							<span>{item.mimeType || 'file'}</span>
							{#if item.usageKind}
								<span class="chip preset-tonal-surface text-[10px]">{item.usageKind}</span>
							{/if}
							{#if item.sourceType === 'import'}
								<span class="chip preset-tonal-tertiary text-[10px]">imported</span>
							{/if}
						</div>
					</div>
					<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-65">
						{#if item.sourcePath}
							<span>{item.sourcePath}</span>
						{/if}
						{#if item.sizeBytes}
							<span>{formatSize(item.sizeBytes)}</span>
						{/if}
					</div>
					<textarea class="textarea mt-3 min-h-20 text-xs" readonly value={buildSnippet(item)}></textarea>
				</div>
			{/each}
		</div>
	{/if}
</section>
