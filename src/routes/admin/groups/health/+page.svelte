<script>
import { page } from '$app/state';
import { formatDistanceToNow } from 'date-fns';
import IconCircleCheck from '@lucide/svelte/icons/circle-check';
import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
import IconTriangleAlert from '@lucide/svelte/icons/triangle-alert';
import IconMoon from '@lucide/svelte/icons/moon';
import IconExternalLink from '@lucide/svelte/icons/external-link';
import IconActivity from '@lucide/svelte/icons/activity';
import IconUsers from '@lucide/svelte/icons/users';
import IconShare2 from '@lucide/svelte/icons/share-2';
import IconDollarSign from '@lucide/svelte/icons/dollar-sign';

let { data } = $props();

const healthData = $derived(data.healthData);
const groups = $derived(healthData.groups || []);
const totals = $derived(healthData.totals || {});

const STATUS_CONFIG = {
healthy: { icon: IconCircleCheck, color: 'success', label: 'Healthy' },
watch: { icon: IconCircleAlert, color: 'warning', label: 'Watch' },
critical: { icon: IconTriangleAlert, color: 'error', label: 'Critical' },
inactive: { icon: IconMoon, color: 'surface', label: 'Inactive' }
};

function getStatusConfig(status) {
return STATUS_CONFIG[status] || STATUS_CONFIG.inactive;
}

function formatDate(iso) {
if (!iso) return 'Never';
try {
return formatDistanceToNow(new Date(iso), { addSuffix: true });
} catch (e) {
return 'Invalid date';
}
}
</script>

<svelte:head>
<title>Group Health Dashboard | Admin</title>
<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:py-8">
<!-- Header -->
<header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
<div class="space-y-1">
<h1 class="h2">Group Health Dashboard</h1>
<p class="text-surface-600-400 flex items-center gap-2 text-sm">
<IconActivity class="h-4 w-4" />
Monitoring {totals.claimed_groups} claimed groups over {data.windowDays} days
</p>
</div>

<form method="GET" class="flex flex-wrap items-center gap-2">
<div class="flex items-center gap-2">
<span class="text-sm font-medium">Window:</span>
<select name="window_days" class="select" value={data.windowDays}>
<option value="7">7 Days</option>
<option value="30">30 Days</option>
<option value="90">90 Days</option>
<option value="180">180 Days</option>
<option value="365">1 Year</option>
</select>
</div>
<div class="flex items-center gap-2">
<span class="text-sm font-medium">Limit:</span>
<select name="limit" class="select" value={data.limit}>
<option value="25">25</option>
<option value="50">50</option>
<option value="100">100</option>
<option value="500">500</option>
<option value="1000">All</option>
</select>
</div>
<button type="submit" class="btn preset-filled-primary-500">Refresh</button>
</form>
</header>

<!-- Stats -->
<section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
{#each [
{ key: 'healthy', label: 'Healthy', icon: IconCircleCheck },
{ key: 'watch', label: 'Watch', icon: IconCircleAlert },
{ key: 'critical', label: 'Critical', icon: IconTriangleAlert },
{ key: 'inactive', label: 'Inactive', icon: IconMoon }
] as stat}
{@const count = totals[stat.key] || 0}
{@const percent = totals.claimed_groups ? Math.round((count / totals.claimed_groups) * 100) : 0}
<div class="card preset-outlined-surface p-4">
<div class="flex items-center justify-between">
<span class="text-surface-600-400 text-xs font-bold tracking-wider uppercase">{stat.label}</span>
<stat.icon class="h-4 w-4 text-{stat.key === 'healthy' ? 'success' : stat.key === 'watch' ? 'warning' : stat.key === 'critical' ? 'error' : 'surface'}-500" />
</div>
<div class="mt-2 flex items-baseline gap-2">
<span class="text-2xl font-bold">{count}</span>
<span class="text-surface-500 text-xs">({percent}%)</span>
</div>
</div>
{/each}
</section>

<!-- Warnings -->
{#if healthData.warnings?.length}
<div class="card preset-filled-warning p-4 text-sm">
<p class="font-semibold">Data Warning:</p>
<ul class="mt-1 list-inside list-disc">
{#each healthData.warnings as warning}
<li>{warning}</li>
{/each}
</ul>
</div>
{/if}

<!-- Groups: Mobile Cards -->
<div class="flex flex-col gap-4 md:hidden">
{#each groups as g}
{@const status = getStatusConfig(g.health.status)}
<div class="card preset-outlined-surface p-4 space-y-4">
<div class="flex items-start justify-between gap-3">
<div class="min-w-0 flex-1">
<a href="/groups/{g.group.slug}" target="_blank" class="flex items-center gap-1 font-semibold hover:underline">
{g.group.name}
<IconExternalLink class="h-3 w-3 opacity-50" />
</a>
<p class="text-surface-500 text-xs">{g.group.city || 'Unknown City'}{g.group.state_region ? `, ${g.group.state_region}` : ''}</p>
{#if !g.group.is_published}
<span class="badge preset-tonal-surface text-xs mt-1">Unpublished</span>
{/if}
</div>
<div class="flex flex-col items-end gap-1">
<div class="preset-filled-{status.color}-500 flex h-8 w-8 items-center justify-center rounded-token">
<status.icon class="h-4 w-4" />
</div>
<span class="text-{status.color}-500 text-xs font-bold uppercase">{g.health.status}</span>
</div>
</div>

<div class="flex items-center gap-2">
<progress class="progress w-full" value={g.health.score} max="100"></progress>
<span class="text-xs font-medium w-10 text-right">{g.health.score}%</span>
</div>

{#if g.health.reasons?.length}
<div class="space-y-1">
{#each g.health.reasons as reason}
<p class="text-surface-500 text-xs flex items-start gap-1">
<span>•</span>
<span>{reason}</span>
</p>
{/each}
</div>
{/if}

<div class="grid grid-cols-2 gap-3 text-sm border-t border-surface-500/10 pt-3">
<div>
<span class="text-surface-400 text-xs">Rides</span>
<p class="font-medium">{g.activity.rides_upcoming} upcoming</p>
</div>
<div>
<span class="text-surface-400 text-xs">Volunteers</span>
<p class="font-medium">{g.activity.volunteer_events_upcoming} upcoming</p>
</div>
<div>
<span class="text-surface-400 text-xs">News</span>
<p class="font-medium">{g.activity.news_published_total} total</p>
</div>
<div>
<span class="text-surface-400 text-xs">Microsite</span>
<p class="{g.microsite.config_published ? 'text-success-500' : 'text-surface-400'} font-medium">
{g.microsite.config_published ? 'Published' : 'None'}
</p>
</div>
</div>

<div class="flex items-center gap-3 text-sm border-t border-surface-500/10 pt-3">
<div class="flex items-center gap-1">
<IconShare2 class="h-3.5 w-3.5 {g.social.accounts_active > 0 ? 'text-primary-500' : 'text-surface-400'}" />
<span class={g.social.accounts_active > 0 ? '' : 'text-surface-400'}>{g.social.accounts_active}/{g.social.accounts_connected}</span>
</div>
{#if g.social.posts_failed_in_window > 0}
<span class="text-error-500 text-xs font-bold">{g.social.posts_failed_in_window} failed</span>
{/if}
<div class="flex items-center gap-1">
<IconDollarSign class="h-3.5 w-3.5 {g.monetization.donations_connected ? 'text-success-500' : 'text-surface-400'}" />
<span class={g.monetization.donations_connected ? 'text-success-500' : 'text-surface-400'}>
{g.monetization.donations_connected ? 'Donations' : 'No Donations'}
</span>
</div>
</div>

<div class="flex items-center justify-between border-t border-surface-500/10 pt-3">
<div class="flex items-center gap-1">
<IconUsers class="h-3.5 w-3.5 text-primary-500" />
<span class="font-bold">{g.membership.program_enabled ? g.membership.active_members : '—'}</span>
</div>
<div class="text-right">
<span class="text-sm">{formatDate(g.signals.last_activity_at)}</span>
{#if g.signals.days_since_last_activity !== null}
<p class="text-surface-500 text-xs">{g.signals.days_since_last_activity} days ago</p>
{/if}
</div>
</div>
</div>
{:else}
<div class="card preset-outlined-surface p-8 text-center">
<IconActivity class="h-8 w-8 mx-auto opacity-20" />
<p class="text-surface-500 mt-2">No groups found</p>
</div>
{/each}
</div>

<!-- Groups: Desktop Table -->
<div class="hidden md:block card preset-outlined-surface overflow-hidden">
<div class="overflow-x-auto">
<table class="table w-full text-sm">
<thead class="bg-surface-100-900">
<tr>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Group</th>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Health</th>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Activity</th>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Social</th>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Members</th>
<th class="text-surface-600-400 px-4 py-3 text-left text-xs font-bold uppercase">Last Activity</th>
</tr>
</thead>
<tbody class="divide-surface-200-800 divide-y">
{#each groups as g}
{@const status = getStatusConfig(g.health.status)}
<tr class="hover:preset-tonal-surface transition-colors">
<td class="px-4 py-3">
<div class="flex flex-col">
<a href="/groups/{g.group.slug}" target="_blank" class="flex items-center gap-1 font-semibold hover:underline">
{g.group.name}
<IconExternalLink class="h-3 w-3 opacity-50" />
</a>
<span class="text-surface-500 text-xs">{g.group.city || 'Unknown'}{g.group.state_region ? `, ${g.group.state_region}` : ''}</span>
{#if !g.group.is_published}
<span class="badge preset-tonal-surface text-xs mt-1 w-fit">Unpublished</span>
{/if}
</div>
</td>
<td class="px-4 py-3">
<div class="flex items-center gap-3">
<div class="preset-filled-{status.color}-500 flex h-8 w-8 items-center justify-center rounded-token">
<status.icon class="h-4 w-4" />
</div>
<div>
<span class="text-{status.color}-500 text-xs font-bold uppercase">{g.health.status}</span>
<div class="flex items-center gap-2">
<progress class="progress w-16" value={g.health.score} max="100"></progress>
<span class="text-xs">{g.health.score}%</span>
</div>
</div>
</div>
{#if g.health.reasons?.length}
<div class="mt-2 space-y-0.5 max-w-xs">
{#each g.health.reasons as reason}
<p class="text-surface-500 text-xs flex items-start gap-1">
<span>•</span>
<span>{reason}</span>
</p>
{/each}
</div>
{/if}
</td>
<td class="px-4 py-3">
<div class="space-y-1 text-sm">
<div class="flex items-center gap-2">
<span class="text-surface-400 text-xs w-16">Rides:</span>
<span>{g.activity.rides_upcoming} upcoming</span>
</div>
<div class="flex items-center gap-2">
<span class="text-surface-400 text-xs w-16">Volunteers:</span>
<span>{g.activity.volunteer_events_upcoming} upcoming</span>
</div>
<div class="flex items-center gap-2">
<span class="text-surface-400 text-xs w-16">News:</span>
<span>{g.activity.news_published_total} total</span>
</div>
<div class="flex items-center gap-2">
<span class="text-surface-400 text-xs w-16">Microsite:</span>
<span class={g.microsite.config_published ? 'text-success-500' : 'text-surface-400'}>
{g.microsite.config_published ? 'Published' : 'None'}
</span>
</div>
</div>
</td>
<td class="px-4 py-3">
<div class="space-y-2 text-sm">
<div class="flex items-center gap-2">
<IconShare2 class="h-4 w-4 {g.social.accounts_active > 0 ? 'text-primary-500' : 'text-surface-400'}" />
<span>{g.social.accounts_active}/{g.social.accounts_connected} active</span>
</div>
{#if g.social.posts_failed_in_window > 0}
<span class="text-error-500 text-xs font-bold">{g.social.posts_failed_in_window} failed posts</span>
{/if}
<div class="flex items-center gap-2">
<IconDollarSign class="h-4 w-4 {g.monetization.donations_connected ? 'text-success-500' : 'text-surface-400'}" />
<span class={g.monetization.donations_connected ? 'text-success-500' : 'text-surface-400'}>
{g.monetization.donations_connected ? 'Connected' : 'Not Connected'}
</span>
</div>
</div>
</td>
<td class="px-4 py-3">
{#if g.membership.program_enabled}
<div class="flex flex-col gap-1">
<div class="flex items-center gap-2">
<IconUsers class="h-4 w-4 text-primary-500" />
<span class="font-bold">{g.membership.active_members}</span>
</div>
{#if g.membership.pending_applications > 0}
<span class="text-warning-500 text-xs">{g.membership.pending_applications} pending</span>
{/if}
{#if g.membership.past_due_members > 0}
<span class="text-error-500 text-xs">{g.membership.past_due_members} past due</span>
{/if}
</div>
{:else}
<span class="text-surface-400 text-sm">Not enabled</span>
{/if}
</td>
<td class="px-4 py-3">
<span class="text-sm">{formatDate(g.signals.last_activity_at)}</span>
{#if g.signals.days_since_last_activity !== null}
<p class="text-surface-500 text-xs">{g.signals.days_since_last_activity} days ago</p>
{/if}
</td>
</tr>
{:else}
<tr>
<td colspan="6" class="px-4 py-8 text-center">
<IconActivity class="h-8 w-8 mx-auto opacity-20" />
<p class="text-surface-500 mt-2">No groups found</p>
</td>
</tr>
{/each}
</tbody>
</table>
</div>
<div class="bg-surface-100-900 border-surface-200-800 border-t px-4 py-3">
<p class="text-surface-500 text-xs">Generated at {new Date(healthData.generated_at).toLocaleString()}</p>
</div>
</div>
</div>
