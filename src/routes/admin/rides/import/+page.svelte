<script>
import { enhance } from '$app/forms';
import IconLoader from '@lucide/svelte/icons/loader-2';
import IconUpload from '@lucide/svelte/icons/upload';
import IconCheckCircle from '@lucide/svelte/icons/circle-check';
import IconAlertCircle from '@lucide/svelte/icons/circle-alert';

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

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:py-8">
<header class="space-y-1">
<h1 class="h2 flex items-center gap-2">
<IconUpload class="h-6 w-6" />
Ride Import
</h1>
<p class="text-surface-600-400 text-sm max-w-2xl">
Paste monthly source JSON to import rides. Legacy titles like <code class="bg-surface-100-900 px-1 rounded">GIL (weekly):</code> are skipped, and existing <code class="bg-surface-100-900 px-1 rounded">source_event_id</code> values are not re-imported.
</p>
</header>

<form method="POST" use:enhance={handleEnhance} class="space-y-4">
<!-- Settings -->
<div class="card preset-outlined-surface p-4 space-y-4">
<div class="grid gap-4 sm:grid-cols-2">
<label class="space-y-1">
<span class="text-sm font-medium">Created By User ID</span>
<input class="input" type="text" name="createdByUserId" value={values.createdByUserId} placeholder="UUID" />
</label>
<label class="space-y-1">
<span class="text-sm font-medium">Slug Prefix</span>
<input class="input" type="text" name="slugPrefix" value={values.slugPrefix} placeholder="optional-prefix-" />
</label>
</div>
<div class="flex flex-wrap gap-4">
<label class="flex items-center gap-2 text-sm">
<input type="checkbox" name="publish" checked={values.publish} class="checkbox" />
<span>Publish imported rides</span>
</label>
<label class="flex items-center gap-2 text-sm">
<input type="checkbox" name="dryRun" checked={values.dryRun} class="checkbox" />
<span>Dry run only</span>
</label>
</div>
</div>

<!-- JSON Input -->
<div class="space-y-1">
<label class="text-sm font-medium">Ride JSON</label>
<textarea
class="textarea w-full font-mono text-sm min-h-[20rem]"
name="json"
placeholder="Enter JSON here..."
>{values.json}</textarea>
</div>

<!-- Error -->
{#if form?.error}
<div class="card preset-filled-error p-4 text-sm flex items-start gap-2">
<IconAlertCircle class="h-4 w-4 shrink-0 mt-0.5" />
<span>{form.error}</span>
</div>
{/if}

<!-- Submit -->
<button
class="btn preset-filled-primary-500 w-full sm:w-auto"
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
</form>

<!-- Loading State -->
{#if isSubmitting}
<div class="card preset-outlined-surface p-6 space-y-4">
<div class="flex items-center justify-between">
<div>
<h2 class="h4">Processing</h2>
<p class="text-surface-600-400 text-sm">Importing rides, geocoding, and uploading media...</p>
</div>
<IconLoader class="text-primary-500 h-6 w-6 animate-spin" />
</div>
<div class="space-y-3">
<div class="placeholder animate-pulse h-2 w-full rounded-token"></div>
<div class="grid gap-3 sm:grid-cols-3">
<div class="placeholder h-16 rounded-token"></div>
<div class="placeholder h-16 rounded-token"></div>
<div class="placeholder h-16 rounded-token"></div>
</div>
</div>
</div>
{/if}

<!-- Results -->
{#if result}
<div class="card preset-outlined-surface p-6 space-y-4">
<h2 class="h4 flex items-center gap-2">
<IconCheckCircle class="text-success-500 h-5 w-5" />
Import Complete
</h2>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
<div class="card preset-tonal-success p-3 text-center">
<div class="text-xs uppercase opacity-70">Inserted</div>
<div class="text-2xl font-bold">{result.inserted?.length ?? 0}</div>
</div>
<div class="card preset-tonal-surface p-3 text-center">
<div class="text-xs uppercase opacity-70">Skipped Legacy</div>
<div class="text-2xl font-bold">{result.skipped ?? 0}</div>
</div>
<div class="card preset-tonal-warning p-3 text-center">
<div class="text-xs uppercase opacity-70">Skipped Existing</div>
<div class="text-2xl font-bold">{result.skippedExisting?.length ?? 0}</div>
</div>
<div class="card preset-tonal-error p-3 text-center">
<div class="text-xs uppercase opacity-70">Skipped Invalid</div>
<div class="text-2xl font-bold">{result.skippedInvalid?.length ?? 0}</div>
</div>
</div>

{#if result.reason}
<p class="text-sm text-surface-600-400">{result.reason}</p>
{/if}

<!-- Inserted Items -->
{#if result.inserted?.length}
<div class="space-y-2">
<h3 class="text-sm font-bold uppercase opacity-70">Inserted Items</h3>
<div class="overflow-x-auto -mx-2 px-2">
<table class="table text-sm w-full">
<thead class="bg-surface-100-900">
<tr>
<th class="px-3 py-2 text-left text-xs font-bold">Title</th>
<th class="px-3 py-2 text-left text-xs font-bold">Slug</th>
<th class="px-3 py-2 text-left text-xs font-bold">Source ID</th>
<th class="px-3 py-2 text-left text-xs font-bold">Images</th>
<th class="px-3 py-2 text-left text-xs font-bold">Occurs</th>
</tr>
</thead>
<tbody class="divide-surface-200-800 divide-y">
{#each result.inserted as item}
<tr>
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

<!-- Skipped Existing -->
{#if result.skippedExisting?.length}
<div class="space-y-2">
<h3 class="text-sm font-bold uppercase opacity-70">Skipped Existing</h3>
<ul class="space-y-1 text-sm">
{#each result.skippedExisting as item}
<li class="flex items-center gap-2 flex-wrap">
<code class="bg-surface-100-900 px-1 rounded text-xs">{item.sourceEventId}</code>
<span>→</span>
<code class="bg-surface-100-900 px-1 rounded text-xs">{item.slug}</code>
</li>
{/each}
</ul>
</div>
{/if}

<!-- Skipped Invalid -->
{#if result.skippedInvalid?.length}
<div class="space-y-2">
<h3 class="text-sm font-bold uppercase opacity-70">Skipped Invalid</h3>
<ul class="space-y-1 text-sm">
{#each result.skippedInvalid as item}
<li class="flex items-center gap-2 flex-wrap">
<code class="bg-surface-100-900 px-1 rounded text-xs">{item.sourceEventId}</code>
<span>→</span>
<span>{item.title}</span>
{#if item.detail}
<span class="text-surface-500 text-xs">({item.detail})</span>
{/if}
</li>
{/each}
</ul>
</div>
{/if}
</div>
{/if}
</div>
