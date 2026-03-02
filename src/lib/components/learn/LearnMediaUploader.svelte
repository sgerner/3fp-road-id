<script>
	let { articleId = '', uploaded = [] } = $props();

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
		<p class="label">Media Library</p>
		<p class="text-sm opacity-70">
			Upload images or PDFs to Supabase Storage and paste the generated markdown into the article.
		</p>
	</div>

	<input
		type="file"
		multiple
		accept="image/*,application/pdf"
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

	{#if results.length}
		<div class="space-y-3">
			{#each results as item}
				<div class="rounded-2xl border border-surface-500/20 bg-surface-950/55 p-3">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<a class="font-medium hover:underline" href={item.url} target="_blank" rel="noreferrer">
							{item.fileName}
						</a>
						<span class="text-xs uppercase opacity-60">{item.mimeType || 'file'}</span>
					</div>
					<textarea class="textarea mt-3 min-h-20 text-xs" readonly value={buildSnippet(item)}></textarea>
				</div>
			{/each}
		</div>
	{/if}
</section>
