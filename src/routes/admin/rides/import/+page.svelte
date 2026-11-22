<script>
	import { enhance } from '$app/forms';
	import IconLoader from '@lucide/svelte/icons/loader-circle';
	import IconCheckCircle from '@lucide/svelte/icons/circle-check';
	import AdminHero from '#lib/components/admin/AdminHero.svelte';
	import AdminNotice from '#lib/components/admin/AdminNotice.svelte';

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
	<title>Import Rides | Admin</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<AdminHero eyebrow="Rides" title="Ride Import">
	Paste monthly source JSON to import rides. Legacy titles like
	<code class="bg-surface-800 text-surface-50 px-1.5 font-mono text-sm">GIL (weekly):</code>
	are skipped, and existing
	<code class="bg-surface-800 text-surface-50 px-1.5 font-mono text-sm">source_event_id</code>
	values are not re-imported.
</AdminHero>

<div class="flex flex-col gap-10 px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
	<form method="POST" use:enhance={handleEnhance} class="flex max-w-4xl flex-col gap-10">
		<section class="flex flex-col gap-5" aria-labelledby="import-settings-heading">
			<div class="flex items-center gap-3">
				<span
					class="text-tertiary-500 text-2xl leading-none font-black italic tabular-nums"
					aria-hidden="true">01</span
				>
				<h2 id="import-settings-heading" class="m-0 text-xl">Settings</h2>
			</div>

			<div class="grid gap-5 sm:grid-cols-2">
				<label class="flex flex-col gap-2">
					<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
						Created By User ID
					</span>
					<input
						class="input"
						type="text"
						name="createdByUserId"
						value={values.createdByUserId}
						placeholder="UUID"
					/>
				</label>
				<label class="flex flex-col gap-2">
					<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
						Slug Prefix
					</span>
					<input
						class="input"
						type="text"
						name="slugPrefix"
						value={values.slugPrefix}
						placeholder="optional-prefix-"
					/>
				</label>
			</div>

			<div class="flex flex-wrap gap-x-8 gap-y-3">
				<label class="flex cursor-pointer items-center gap-3 text-sm font-bold">
					<input type="checkbox" name="publish" checked={values.publish} class="checkbox" />
					<span>Publish imported rides</span>
				</label>
				<label class="flex cursor-pointer items-center gap-3 text-sm font-bold">
					<input type="checkbox" name="dryRun" checked={values.dryRun} class="checkbox" />
					<span>Dry run only</span>
				</label>
			</div>
		</section>

		<section class="flex flex-col gap-5" aria-labelledby="import-json-heading">
			<div class="flex items-center gap-3">
				<span
					class="text-tertiary-500 text-2xl leading-none font-black italic tabular-nums"
					aria-hidden="true">02</span
				>
				<h2 id="import-json-heading" class="m-0 text-xl">Ride JSON</h2>
			</div>
			<textarea
				id="ride-json"
				aria-labelledby="import-json-heading"
				class="textarea min-h-[20rem] w-full font-mono text-sm"
				name="json"
				placeholder="Enter JSON here...">{values.json}</textarea
			>
		</section>

		{#if form?.error}
			<AdminNotice tone="error">{form.error}</AdminNotice>
		{/if}

		<button
			class="btn preset-filled-primary-500 w-full self-start px-7 py-4 sm:w-auto"
			type="submit"
			disabled={isSubmitting}
		>
			{#if isSubmitting}
				<IconLoader class="h-4 w-4 motion-safe:animate-spin" />
				<span>Importing...</span>
			{:else}
				<span>Import Rides</span>
			{/if}
		</button>
	</form>

	{#if isSubmitting}
		<section
			class="bg-surface-900 border-secondary-500 flex max-w-4xl flex-col gap-5 border-t-4 px-6 py-6 sm:px-8"
			aria-label="Import progress"
		>
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="m-0 text-xl">Processing</h2>
					<p class="text-surface-300 m-0 text-sm">
						Importing rides, geocoding, and uploading media...
					</p>
				</div>
				<IconLoader class="text-primary-500 h-6 w-6 motion-safe:animate-spin" aria-hidden="true" />
			</div>
			<div class="bg-surface-800 h-2 w-full motion-safe:animate-pulse"></div>
			<div class="grid gap-3 sm:grid-cols-3">
				<div class="bg-surface-800 h-16 motion-safe:animate-pulse"></div>
				<div class="bg-surface-800 h-16 motion-safe:animate-pulse"></div>
				<div class="bg-surface-800 h-16 motion-safe:animate-pulse"></div>
			</div>
		</section>
	{/if}

	{#if result}
		<section
			class="bg-surface-900 border-secondary-500 flex max-w-4xl flex-col gap-8 border-t-4 px-6 py-8 sm:px-8"
			aria-labelledby="import-result-heading"
		>
			<h2 id="import-result-heading" class="m-0 flex items-center gap-3 text-2xl">
				<IconCheckCircle class="text-success-500 h-6 w-6" aria-hidden="true" />
				Import Complete
			</h2>

			<dl class="m-0 grid grid-cols-2 gap-6 lg:grid-cols-4">
				{#each [{ label: 'Inserted', value: result.inserted?.length ?? 0, marker: 'bg-success-500', numeral: 'text-primary-500' }, { label: 'Skipped Legacy', value: result.skipped ?? 0, marker: 'bg-surface-400', numeral: '' }, { label: 'Skipped Existing', value: result.skippedExisting?.length ?? 0, marker: 'bg-warning-500', numeral: '' }, { label: 'Skipped Invalid', value: result.skippedInvalid?.length ?? 0, marker: 'bg-error-500', numeral: '' }] as stat (stat.label)}
					<div class="border-surface-700 flex flex-col-reverse gap-1 border-l-2 pl-3">
						<dt
							class="text-surface-300 flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase"
						>
							<span class="{stat.marker} h-2.5 w-2.5" aria-hidden="true"></span>
							{stat.label}
						</dt>
						<dd class="{stat.numeral} m-0 text-3xl leading-none font-black italic tabular-nums">
							{stat.value}
						</dd>
					</div>
				{/each}
			</dl>

			{#if result.reason}
				<p class="text-surface-300 m-0 text-sm">{result.reason}</p>
			{/if}

			{#if result.inserted?.length}
				<div class="border-surface-800 flex flex-col gap-3 border-t-2 pt-6">
					<h3 class="m-0 text-base">Inserted Items</h3>
					<div class="overflow-x-auto">
						<table class="table w-full text-sm">
							<thead class="text-surface-300 border-surface-700 border-b-2">
								<tr>
									{#each ['Title', 'Slug', 'Source ID', 'Images', 'Occurs'] as heading (heading)}
										<th class="px-3 py-2 text-left text-xs font-bold tracking-[0.18em] uppercase">
											{heading}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each result.inserted as item}
									<tr class="border-surface-800 border-b">
										<td class="px-3 py-2">{item.title}</td>
										<td class="px-3 py-2 font-mono text-xs">{item.slug}</td>
										<td class="px-3 py-2 font-mono text-xs">{item.sourceEventId}</td>
										<td class="px-3 py-2">{item.imageCount}</td>
										<td class="px-3 py-2">{item.occurrenceCount}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			{#if result.skippedExisting?.length}
				<div class="border-surface-800 flex flex-col gap-3 border-t-2 pt-6">
					<h3 class="m-0 text-base">Skipped Existing</h3>
					<ul class="m-0 flex list-none flex-col p-0 text-sm">
						{#each result.skippedExisting as item}
							<li class="border-surface-800 flex flex-wrap items-center gap-2 border-b py-2">
								<code class="bg-surface-800 px-1.5 font-mono text-xs">{item.sourceEventId}</code>
								<span>→</span>
								<code class="bg-surface-800 px-1.5 font-mono text-xs">{item.slug}</code>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if result.skippedInvalid?.length}
				<div class="border-surface-800 flex flex-col gap-3 border-t-2 pt-6">
					<h3 class="m-0 text-base">Skipped Invalid</h3>
					<ul class="m-0 flex list-none flex-col p-0 text-sm">
						{#each result.skippedInvalid as item}
							<li class="border-surface-800 flex flex-wrap items-center gap-2 border-b py-2">
								<code class="bg-surface-800 px-1.5 font-mono text-xs">{item.sourceEventId}</code>
								<span>→</span>
								<span>{item.title}</span>
								{#if item.detail}
									<span class="text-surface-300 text-xs">({item.detail})</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{/if}
</div>
