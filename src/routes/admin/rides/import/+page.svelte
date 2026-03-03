<script>
	import { enhance } from '$app/forms';
	import IconLoader from '@lucide/svelte/icons/loader-2';

	let { data, form } = $props();

	const values = $derived(form?.values ?? data.initialValues);
	const result = $derived(form?.result ?? null);
	let isSubmitting = $state(false);

	function handleEnhance() {
		isSubmitting = true;
		return async ({ update }) => {
			await update();
			isSubmitting = false;
		};
	}
</script>

<svelte:head>
	<title>Import Rides</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
	<div class="space-y-2">
		<h1 class="text-3xl font-semibold">Ride Import</h1>
		<p class="text-surface-700-300 max-w-3xl text-sm">
			Paste the monthly source JSON here to import rides. Legacy prefixed titles like
			<code>GIL (weekly):</code> are skipped automatically, and existing
			<code>source_event_id</code> values are not re-imported.
		</p>
	</div>

	<form method="POST" use:enhance={handleEnhance} class="space-y-6">
		<div class="grid gap-4 md:grid-cols-2">
			<label class="space-y-2">
				<span class="text-sm font-medium">Created By User ID</span>
				<input
					class="input preset-tonal-surface"
					type="text"
					name="createdByUserId"
					value={values.createdByUserId}
					placeholder="UUID"
				/>
			</label>

			<label class="space-y-2">
				<span class="text-sm font-medium">Slug Prefix</span>
				<input
					class="input preset-tonal-surface"
					type="text"
					name="slugPrefix"
					value={values.slugPrefix}
					placeholder="optional-prefix-"
				/>
			</label>
		</div>

		<div class="flex flex-wrap gap-6">
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" name="publish" checked={values.publish} />
				<span>Publish imported rides</span>
			</label>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" name="dryRun" checked={values.dryRun} />
				<span>Dry run only</span>
			</label>
		</div>

		<label class="space-y-2">
			<span class="text-sm font-medium">Ride JSON</span>
			<textarea
				class="textarea preset-tonal-surface min-h-[28rem] w-full font-mono text-sm"
				name="json"
				placeholder={'{"events":[...]}'}>{values.json}</textarea
			>
		</label>

		{#if form?.error}
			<div class="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
				{form.error}
			</div>
		{/if}

		<div class="flex items-center gap-4">
			<button
				class={`btn preset-filled-primary-500 min-w-40 transition ${isSubmitting ? 'scale-[1.02] animate-pulse' : ''}`}
				type="submit"
				disabled={isSubmitting}
			>
				{#if isSubmitting}
					<IconLoader class="h-4 w-4 animate-spin" />
					<span>Importing...</span>
				{:else}
					<span>Import Rides</span>
				{/if}
			</button>
			{#if isSubmitting}
				<div class="text-surface-700-300 flex items-center gap-2 text-sm">
					<span class="inline-flex gap-1">
						<span class="bg-primary-500/70 h-2 w-2 animate-bounce rounded-full [animation-delay:-0.2s]"></span>
						<span class="bg-primary-500/70 h-2 w-2 animate-bounce rounded-full [animation-delay:-0.1s]"></span>
						<span class="bg-primary-500/70 h-2 w-2 animate-bounce rounded-full"></span>
					</span>
					<span>Parsing JSON, geocoding locations, and uploading ride media.</span>
				</div>
			{/if}
		</div>
	</form>

	{#if isSubmitting}
		<section class="border-surface-200-800 space-y-4 rounded-2xl border p-4">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="text-xl font-semibold">Working</h2>
					<p class="text-surface-700-300 text-sm">
						The import request is in flight. Larger monthly batches can take a bit.
					</p>
				</div>
				<IconLoader class="text-primary-500 h-6 w-6 animate-spin" />
			</div>
			<div class="bg-surface-100-900 h-2 overflow-hidden rounded-full">
				<div class="from-primary-500 via-primary-400 to-primary-500 h-full w-1/3 animate-[import-progress_1.4s_ease-in-out_infinite] bg-gradient-to-r"></div>
			</div>
			<div class="grid gap-3 md:grid-cols-3">
				<div class="bg-surface-100-900 animate-pulse rounded-xl px-4 py-3">
					<div class="mb-2 h-3 w-20 rounded bg-surface-500/20"></div>
					<div class="h-7 w-12 rounded bg-surface-500/20"></div>
				</div>
				<div class="bg-surface-100-900 animate-pulse rounded-xl px-4 py-3">
					<div class="mb-2 h-3 w-24 rounded bg-surface-500/20"></div>
					<div class="h-7 w-12 rounded bg-surface-500/20"></div>
				</div>
				<div class="bg-surface-100-900 animate-pulse rounded-xl px-4 py-3">
					<div class="mb-2 h-3 w-28 rounded bg-surface-500/20"></div>
					<div class="h-7 w-12 rounded bg-surface-500/20"></div>
				</div>
			</div>
		</section>
	{/if}

	{#if result}
		<section class="border-surface-200-800 space-y-4 rounded-2xl border p-4">
			<h2 class="text-xl font-semibold">Import Result</h2>
			<div class="grid gap-3 md:grid-cols-4">
				<div class="bg-surface-100-900 rounded-xl px-4 py-3">
					<div class="text-xs tracking-wide uppercase opacity-70">Inserted</div>
					<div class="text-2xl font-semibold">{result.inserted?.length ?? 0}</div>
				</div>
				<div class="bg-surface-100-900 rounded-xl px-4 py-3">
					<div class="text-xs tracking-wide uppercase opacity-70">Skipped Legacy</div>
					<div class="text-2xl font-semibold">{result.skipped ?? 0}</div>
				</div>
				<div class="bg-surface-100-900 rounded-xl px-4 py-3">
					<div class="text-xs tracking-wide uppercase opacity-70">Skipped Existing</div>
					<div class="text-2xl font-semibold">{result.skippedExisting?.length ?? 0}</div>
				</div>
				<div class="bg-surface-100-900 rounded-xl px-4 py-3">
					<div class="text-xs tracking-wide uppercase opacity-70">Skipped Invalid</div>
					<div class="text-2xl font-semibold">{result.skippedInvalid?.length ?? 0}</div>
				</div>
			</div>

			{#if result.reason}
				<p class="text-sm opacity-80">{result.reason}</p>
			{/if}

			{#if result.inserted?.length}
				<div class="space-y-2">
					<h3 class="text-sm font-semibold tracking-wide uppercase opacity-70">Inserted Items</h3>
					<div class="overflow-x-auto">
						<table class="table w-full text-sm">
							<thead>
								<tr>
									<th>Title</th>
									<th>Slug</th>
									<th>Source Event ID</th>
									<th>Images</th>
									<th>Occurrences</th>
								</tr>
							</thead>
							<tbody>
								{#each result.inserted as item}
									<tr>
										<td>{item.title}</td>
										<td>{item.slug}</td>
										<td><code>{item.sourceEventId}</code></td>
										<td>{item.imageCount}</td>
										<td>{item.occurrenceCount}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			{#if result.skippedExisting?.length}
				<div class="space-y-2">
					<h3 class="text-sm font-semibold tracking-wide uppercase opacity-70">Skipped Existing</h3>
					<ul class="space-y-1 text-sm">
						{#each result.skippedExisting as item}
							<li>
								<code>{item.sourceEventId}</code> -> <code>{item.slug}</code>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if result.skippedInvalid?.length}
				<div class="space-y-2">
					<h3 class="text-sm font-semibold tracking-wide uppercase opacity-70">Skipped Invalid</h3>
					<ul class="space-y-1 text-sm">
						{#each result.skippedInvalid as item}
							<li>
								<code>{item.sourceEventId}</code> -> {item.title}
								{#if item.detail}
									<span class="opacity-70">({item.detail})</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	@keyframes import-progress {
		0% {
			transform: translateX(-120%);
		}
		50% {
			transform: translateX(120%);
		}
		100% {
			transform: translateX(260%);
		}
	}
</style>
