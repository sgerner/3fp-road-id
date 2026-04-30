<script>
import { enhance } from '$app/forms';
import { formatDistanceToNow } from 'date-fns';
import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
import IconSparkles from '@lucide/svelte/icons/sparkles';
import IconSend from '@lucide/svelte/icons/send';
import IconCheckCircle2 from '@lucide/svelte/icons/circle-check';
import IconXCircle from '@lucide/svelte/icons/x-circle';
import IconMail from '@lucide/svelte/icons/mail';
import IconHistory from '@lucide/svelte/icons/history';
import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
import IconCopy from '@lucide/svelte/icons/copy';

let { data, form } = $props();

const group = $derived(data.group);
const outreachHistory = $derived(data.outreachHistory || []);

let generating = $state(false);
let generatedMessage = $state('');
let selectedMethod = $state(data.group.public_contact_email ? 'email' : 'social');
let copied = $state(false);

$effect(() => {
if (form?.success && form?.generatedMessage) {
generatedMessage = form.generatedMessage;
generating = false;
}
});

function getCompletenessColor(score) {
if (score >= 80) return 'success';
if (score >= 50) return 'warning';
return 'error';
}

async function copyToClipboard() {
await navigator.clipboard.writeText(generatedMessage);
copied = true;
setTimeout(() => copied = false, 2000);
}
</script>

<svelte:head>
<title>Outreach: {group.name} | Admin</title>
<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:py-8">
<!-- Back Link -->
<a href="/admin/outreach/unclaimed" class="flex items-center gap-2 text-sm font-medium text-surface-500 hover:text-primary-500 transition-colors">
<IconArrowLeft class="h-4 w-4" />
Back to Dashboard
</a>

<div class="grid gap-6 lg:grid-cols-[320px_1fr]">
<!-- Left Column -->
<div class="space-y-4">
<!-- Group Info -->
<div class="card preset-outlined-surface p-5 space-y-4">
<div class="flex items-start justify-between gap-3">
<div class="min-w-0 flex-1">
<h1 class="h4">{group.name}</h1>
<p class="text-surface-500 text-sm">{group.city}, {group.state_region}</p>
</div>
<span class="badge preset-filled-{getCompletenessColor(group.completeness)}-500 text-lg">
{group.completeness}%
</span>
</div>

<div class="space-y-3 text-sm">
<div class="flex items-center justify-between">
<span class="text-surface-500">Website</span>
{#if group.website_url}
<a href={group.website_url} target="_blank" class="text-primary-500 hover:underline truncate max-w-[200px]">
{new URL(group.website_url).hostname}
</a>
{:else}
<span class="flex items-center gap-1 text-error-500">
<IconXCircle class="h-3 w-3" />
Missing
</span>
{/if}
</div>
<div class="flex items-center justify-between">
<span class="text-surface-500">Email</span>
{#if group.public_contact_email}
<span class="truncate max-w-[200px]">{group.public_contact_email}</span>
{:else}
<span class="flex items-center gap-1 text-error-500">
<IconXCircle class="h-3 w-3" />
Missing
</span>
{/if}
</div>
<div class="border-t border-surface-500/10 pt-3">
<span class="text-surface-400 text-xs font-bold uppercase">Social Media</span>
<div class="mt-2 flex flex-wrap gap-1">
{#each Object.entries(group.social_links || {}) as [platform, url]}
{#if url}
<a href={url} target="_blank" class="badge preset-tonal-surface hover:preset-filled-primary text-xs">
{platform}
</a>
{/if}
{/each}
</div>
</div>
</div>

<form method="POST" action="?/enrich" use:enhance={() => {
generating = true;
return ({ result }) => { generating = false; };
}}>
<button type="submit" disabled={generating} class="btn preset-tonal-secondary-500 w-full flex items-center justify-center gap-2">
<IconRefreshCw class="h-4 w-4 {generating ? 'animate-spin' : ''}" />
{generating ? 'Enriching...' : 'Deep Enrich Profile'}
</button>
</form>
</div>

<!-- History -->
<div class="card preset-outlined-surface p-5">
<h2 class="h5 flex items-center gap-2">
<IconHistory class="h-4 w-4 text-surface-400" />
Outreach History
</h2>
<div class="mt-4 space-y-3">
{#each outreachHistory as entry}
<div class="border-l-2 border-primary-500 pl-3 py-1">
<p class="text-surface-500 text-xs font-bold uppercase">
{formatDistanceToNow(new Date(entry.contacted_at), { addSuffix: true })} via {entry.contact_method}
</p>
<p class="text-surface-600 text-sm italic mt-1 line-clamp-2">
"{entry.message_content}"
</p>
</div>
{:else}
<p class="text-surface-400 text-sm italic">No contact history yet.</p>
{/each}
</div>
</div>
</div>

<!-- Right Column: AI Generator -->
<div class="card preset-outlined-surface overflow-hidden">
<div class="preset-filled-primary-500 p-5 text-white">
<h2 class="h4 flex items-center gap-2">
<IconSparkles class="h-5 w-5" />
Smart Outreach Generator
</h2>
<p class="text-sm opacity-90 mt-1">
AI-powered personalized messages for group owners.
</p>
</div>

<div class="p-5 space-y-5">
<!-- Method Toggle -->
<div class="flex items-center gap-3">
<span class="text-sm font-medium">Method:</span>
<div class="bg-surface-200-800 flex rounded-token p-1">
<button
class="px-3 py-1.5 text-xs font-bold rounded-token transition-all {selectedMethod === 'email' ? 'bg-white text-primary-500 shadow-sm' : 'text-surface-500 hover:text-surface-700'}"
onclick={() => selectedMethod = 'email'}
>
Email
</button>
<button
class="px-3 py-1.5 text-xs font-bold rounded-token transition-all {selectedMethod === 'social' ? 'bg-white text-primary-500 shadow-sm' : 'text-surface-500 hover:text-surface-700'}"
onclick={() => selectedMethod = 'social'}
>
Social DM
</button>
</div>
</div>

<!-- Empty State -->
{#if !generatedMessage && !generating}
<div class="card preset-dashed-surface p-8 text-center">
<div class="preset-filled-primary-500 flex h-12 w-12 items-center justify-center rounded-token mx-auto">
<IconSparkles class="h-6 w-6" />
</div>
<h3 class="h5 mt-4">Ready to generate?</h3>
<p class="text-surface-500 text-sm mt-1 max-w-sm mx-auto">
Our AI will analyze the group's profile to craft a personalized message.
</p>
<form method="POST" action="?/generate" use:enhance={() => {
generating = true;
return ({ result }) => { generating = false; };
}}>
<input type="hidden" name="method" value={selectedMethod} />
<button type="submit" class="btn preset-filled-primary-500 mt-5 inline-flex items-center gap-2">
<IconSparkles class="h-4 w-4" />
Generate Message
</button>
</form>
</div>
{/if}

<!-- Loading -->
{#if generating}
<div class="card preset-filled-surface p-8 text-center">
<div class="relative inline-block">
<div class="spinner spinner-primary"></div>
</div>
<p class="font-medium mt-4">Analyzing vibes & crafting message...</p>
<p class="text-surface-500 text-sm">Customizing for {group.name}</p>
</div>
{/if}

<!-- Generated Message -->
{#if generatedMessage && !generating}
<div class="space-y-3">
<div class="flex items-center justify-between">
<span class="text-surface-400 text-xs font-bold uppercase">Generated Message</span>
<button onclick={() => generatedMessage = ''} class="text-primary-500 text-xs font-bold hover:underline">
Regenerate
</button>
</div>
<textarea
class="textarea w-full min-h-[280px] leading-relaxed"
bind:value={generatedMessage}
></textarea>

<div class="flex flex-col sm:flex-row gap-2">
<form method="POST" action="?/log" class="flex-1" use:enhance>
<input type="hidden" name="method" value={selectedMethod} />
<input type="hidden" name="content" value={generatedMessage} />
<button type="submit" class="btn preset-filled-success-500 w-full flex items-center justify-center gap-2">
<IconSend class="h-4 w-4" />
Log as Sent
</button>
</form>
<button
onclick={copyToClipboard}
class="btn {copied ? 'preset-filled-success' : 'preset-tonal-surface'} flex items-center justify-center gap-2"
>
<IconCopy class="h-4 w-4" />
{copied ? 'Copied!' : 'Copy'}
</button>
</div>
</div>
{/if}
</div>
</div>
</div>
</div>
