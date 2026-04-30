<script>
import { formatDistanceToNow } from 'date-fns';
import IconUsers from '@lucide/svelte/icons/users';
import IconMail from '@lucide/svelte/icons/mail';
import IconExternalLink from '@lucide/svelte/icons/external-link';
import IconFilter from '@lucide/svelte/icons/filter';
import IconArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
import IconChevronRight from '@lucide/svelte/icons/chevron-right';
import IconSparkles from '@lucide/svelte/icons/sparkles';

let { data } = $props();

const groups = $derived(data.groups || []);
const total = $derived(data.total || 0);

function getCompletenessColor(score) {
if (score >= 80) return 'success';
if (score >= 50) return 'warning';
return 'error';
}

function getStatusLabel(status) {
const labels = {
pending: 'Uncontacted',
contacted: 'Contacted',
claimed: 'Claimed',
ignored: 'Ignored'
};
return labels[status] || status;
}

function getStatusPreset(status) {
const presets = {
pending: 'preset-filled-warning',
contacted: 'preset-filled-primary',
claimed: 'preset-filled-success',
ignored: 'preset-filled-surface'
};
return presets[status] || 'preset-filled-surface';
}
</script>

<svelte:head>
<title>Unclaimed Groups | Admin</title>
<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:py-8">
<!-- Header -->
<header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
<div class="space-y-1">
<h1 class="h2 flex items-center gap-2">
<IconSparkles class="h-6 w-6" />
Unclaimed Groups
</h1>
<p class="text-surface-600-400 flex items-center gap-2 text-sm">
<IconUsers class="h-4 w-4" />
{total} groups waiting for outreach
</p>
</div>

<form method="GET" class="flex flex-wrap items-center gap-2">
<div class="relative">
<IconFilter class="text-surface-400 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
<select name="status" class="select pl-9" value={data.status || 'pending'}>
<option value="all">All Statuses</option>
<option value="pending">Uncontacted</option>
<option value="contacted">Contacted</option>
<option value="claimed">Claimed</option>
<option value="ignored">Ignored</option>
</select>
</div>
<div class="relative">
<IconArrowUpDown class="text-surface-400 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
<select name="sort" class="select pl-9" value={data.sort || 'completeness'}>
<option value="completeness">Most Complete</option>
<option value="newest">Newest First</option>
</select>
</div>
<button type="submit" class="btn preset-filled-primary-500">Apply</button>
</form>
</header>

<!-- Stats -->
<section class="grid gap-3 sm:grid-cols-3">
<div class="card preset-outlined-warning p-4">
<span class="text-surface-600-400 text-xs font-bold uppercase">Pending</span>
<div class="text-2xl font-black text-warning-500">{data.stats.pending}</div>
</div>
<div class="card preset-outlined-primary p-4">
<span class="text-surface-600-400 text-xs font-bold uppercase">Contacted (30d)</span>
<div class="text-2xl font-black text-primary-500">{data.stats.contacted}</div>
</div>
<div class="card preset-outlined-success p-4">
<span class="text-surface-600-400 text-xs font-bold uppercase">Avg Completeness</span>
<div class="text-2xl font-black text-success-500">{data.stats.avgCompleteness}%</div>
</div>
</section>

<!-- Mobile Cards -->
<div class="flex flex-col gap-4 md:hidden">
{#each groups as g}
{@const completenessColor = getCompletenessColor(g.completeness)}
<div class="card preset-outlined-surface p-4 space-y-4">
<div class="flex items-start justify-between gap-3">
<div class="min-w-0 flex-1">
<div class="flex items-center gap-2">
<span class="font-bold">{g.name}</span>
<a href="/groups/{g.slug}" target="_blank" class="text-surface-400 hover:text-primary-500">
<IconExternalLink class="h-3 w-3" />
</a>
</div>
<p class="text-surface-500 text-xs">{g.city}, {g.state_region}</p>
</div>
<span class="badge {getStatusPreset(g.outreach_status)} text-xs">
{getStatusLabel(g.outreach_status)}
</span>
</div>

<div class="flex items-center gap-3">
<span class="text-{completenessColor}-500 font-bold">{g.completeness}%</span>
<progress class="progress flex-1" value={g.completeness} max="100"></progress>
</div>

<div class="flex flex-wrap gap-1">
{#if g.public_contact_email}
<div class="badge preset-filled-primary">
<IconMail class="h-3 w-3" />
<span>Email</span>
</div>
{/if}
{#each Object.entries(g.social_links || {}) as [platform, url]}
{#if url}
<div class="badge preset-tonal-surface text-xs">{platform}</div>
{/if}
{/each}
{#if !g.public_contact_email && !Object.values(g.social_links || {}).some(Boolean)}
<span class="text-surface-400 text-xs italic">No contacts</span>
{/if}
</div>

<div class="flex items-center justify-between border-t border-surface-500/10 pt-3">
<div class="text-sm text-surface-600">
{#if g.last_contact}
{formatDistanceToNow(new Date(g.last_contact.contacted_at), { addSuffix: true })}
<p class="text-surface-400 text-xs">{g.last_contact.contact_method}</p>
{:else}
<span class="text-surface-400">Never contacted</span>
{/if}
</div>
<a href="/admin/outreach/group/{g.id}" class="btn preset-tonal-primary-500 inline-flex items-center gap-1 text-sm">
Outreach
<IconChevronRight class="h-3 w-3" />
</a>
</div>
</div>
{:else}
<div class="card preset-outlined-surface p-8 text-center">
<IconUsers class="h-8 w-8 mx-auto opacity-20" />
<p class="text-surface-500 mt-2">All caught up!</p>
<p class="text-surface-400 text-sm">No unclaimed groups match your filters.</p>
</div>
{/each}
</div>

<!-- Desktop Table -->
<div class="hidden md:block card preset-outlined-surface overflow-hidden">
<div class="overflow-x-auto">
<table class="table w-full text-sm">
<thead class="bg-surface-100-900">
<tr>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Group</th>
<th class="text-surface-600-400 px-4 py-3 text-center text-xs font-bold uppercase">Profile</th>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Contacts</th>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Status</th>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Last Contact</th>
<th class="text-surface-600-400 px-4 py-3 text-right text-xs font-bold uppercase">Action</th>
</tr>
</thead>
<tbody class="divide-surface-200-800 divide-y">
{#each groups as g}
{@const completenessColor = getCompletenessColor(g.completeness)}
<tr class="hover:preset-tonal-surface transition-colors">
<td class="px-4 py-3">
<div class="flex flex-col">
<div class="flex items-center gap-2">
<span class="font-bold">{g.name}</span>
<a href="/groups/{g.slug}" target="_blank" class="text-surface-400 hover:text-primary-500">
<IconExternalLink class="h-3 w-3" />
</a>
</div>
<span class="text-surface-500 text-xs">{g.city}, {g.state_region}</span>
</div>
</td>
<td class="px-4 py-3">
<div class="flex flex-col items-center gap-1">
<span class="text-{completenessColor}-500 font-bold">{g.completeness}%</span>
<progress class="progress w-20" value={g.completeness} max="100"></progress>
</div>
</td>
<td class="px-4 py-3">
<div class="flex flex-wrap gap-1">
{#if g.public_contact_email}
<div class="badge preset-filled-primary text-xs">
<IconMail class="h-3 w-3" />
<span>Email</span>
</div>
{/if}
{#each Object.entries(g.social_links || {}) as [platform, url]}
{#if url}
<div class="badge preset-tonal-surface text-xs">{platform}</div>
{/if}
{/each}
{#if !g.public_contact_email && !Object.values(g.social_links || {}).some(Boolean)}
<span class="text-surface-400 text-xs italic">No contacts</span>
{/if}
</div>
</td>
<td class="px-4 py-3">
<span class="badge {getStatusPreset(g.outreach_status)}">
{getStatusLabel(g.outreach_status)}
</span>
</td>
<td class="px-4 py-3">
{#if g.last_contact}
<span class="text-sm">{formatDistanceToNow(new Date(g.last_contact.contacted_at), { addSuffix: true })}</span>
<p class="text-surface-400 text-xs">{g.last_contact.contact_method}</p>
{:else}
<span class="text-surface-400 text-sm">Never</span>
{/if}
</td>
<td class="px-4 py-3 text-right">
<a href="/admin/outreach/group/{g.id}" class="btn preset-tonal-primary-500 inline-flex items-center gap-1 group">
<span>Outreach</span>
<IconChevronRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
</a>
</td>
</tr>
{:else}
<tr>
<td colspan="6" class="px-4 py-8 text-center">
<IconUsers class="h-8 w-8 mx-auto opacity-20" />
<p class="text-surface-500 mt-2">All caught up!</p>
<p class="text-surface-400 text-sm">No unclaimed groups match your filters.</p>
</td>
</tr>
{/each}
</tbody>
</table>
</div>
</div>
</div>
