<script>
	import IconImage from '@lucide/svelte/icons/image';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash from '@lucide/svelte/icons/trash-2';

	let {
		sponsors = [],
		fileNames = {},
		onadd = () => {},
		onremove = () => {},
		onupdate = () => {}
	} = $props();
</script>

<div class="card preset-tonal-surface grid gap-4 p-4 sm:p-5">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="h4">Partners and sponsors</h2>
			<p class="text-sm opacity-65">Add only the partners visitors need to recognize.</p>
		</div>
		<button
			class="btn btn-sm preset-tonal-primary"
			type="button"
			onclick={onadd}
			disabled={sponsors.length >= 12}><IconPlus class="h-4 w-4" /> Add partner</button
		>
	</div>
	{#each sponsors as sponsor, index (sponsor._editorId)}
		<article class="card preset-tonal-surface grid gap-3 p-3">
			<div class="flex items-center justify-between">
				<p class="text-sm font-semibold">Partner {index + 1}</p>
				<button
					class="btn btn-icon btn-sm preset-tonal-error"
					type="button"
					onclick={() => onremove(index)}
					aria-label={`Remove partner ${index + 1}`}><IconTrash class="h-4 w-4" /></button
				>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="label"
					><span>Name</span><input
						class="input"
						value={sponsor.name}
						maxlength="120"
						oninput={(event) => onupdate(index, { name: event.currentTarget.value })}
					/></label
				>
				<label class="label"
					><span>Website</span><input
						class="input"
						type="url"
						value={sponsor.url}
						placeholder="https://…"
						oninput={(event) => onupdate(index, { url: event.currentTarget.value })}
					/></label
				><label class="label sm:col-span-2"
					><span>Short description</span><input
						class="input"
						value={sponsor.text}
						maxlength="220"
						oninput={(event) => onupdate(index, { text: event.currentTarget.value })}
					/></label
				><label class="label"
					><span>Logo URL</span><input
						class="input"
						type="url"
						value={sponsor.logo}
						placeholder="https://…"
						oninput={(event) => onupdate(index, { logo: event.currentTarget.value })}
					/></label
				>
				<div class="label">
					<span>Or upload a logo</span>
					<label
						class="btn preset-tonal-surface w-fit cursor-pointer"
						for={`sponsor-file-${sponsor._editorId}`}>Choose file</label
					>
					<span class="truncate text-xs opacity-60"
						>{fileNames[sponsor._editorId] || 'No file selected'}</span
					>
				</div>
			</div>
		</article>
	{/each}
	{#if sponsors.length === 0}
		<div
			class="preset-tonal-surface grid min-h-32 place-items-center p-5 text-center text-sm opacity-65"
		>
			<span
				><IconImage class="mx-auto mb-2 h-6 w-6" />No partners added. That is perfectly fine.</span
			>
		</div>
	{/if}
</div>
