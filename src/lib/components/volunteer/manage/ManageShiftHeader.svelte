<script lang="ts">
	import type { Snippet } from 'svelte';

	export type ShiftHeaderBadge = {
		label: string;
		tone?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';
	};

	type Props = {
		title: string;
		subtitle?: string;
		eyebrow?: string;
		headingLevel?: 'h3' | 'h4' | 'div';
		badges?: ShiftHeaderBadge[];
		progressPercent?: number | null;
		showUncappedBar?: boolean;
		class?: string;
		actions?: Snippet;
	};

	const {
		title,
		subtitle = '',
		eyebrow = '',
		headingLevel = 'h3',
		badges = [],
		progressPercent = undefined,
		showUncappedBar = false,
		class: className = '',
		actions = undefined
	}: Props = $props();

	function badgeClasses(tone: ShiftHeaderBadge['tone']): string {
		switch (tone) {
			case 'primary':
				return 'bg-primary-500 text-surface-950 border-primary-500';
			case 'secondary':
				return 'bg-secondary-500 text-surface-50 border-secondary-500';
			case 'tertiary':
				return 'bg-tertiary-500 text-surface-950 border-tertiary-500';
			case 'success':
				return 'bg-success-500 text-surface-950 border-success-500';
			case 'warning':
				return 'bg-warning-500 text-surface-950 border-warning-500';
			case 'error':
				return 'bg-error-500 text-surface-950 border-error-500';
			case 'surface':
			default:
				return 'bg-surface-800 text-surface-50 border-surface-500';
		}
	}

	function fillBarColor(percent: number | null | undefined): string {
		if (percent === null || percent === undefined) return 'bg-primary-500';
		if (percent >= 100) return 'bg-error-500';
		if (percent >= 75) return 'bg-warning-500';
		return 'bg-success-500';
	}
</script>

<div
	class={`border-surface-800 bg-surface-950 text-surface-50 flex w-full min-w-0 flex-col gap-2.5 border-b-2 px-4 py-3 ${className}`}
>
	<div class="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			{#if eyebrow}
				<span class="text-primary-500 text-xs font-bold tracking-[0.18em] break-words uppercase">
					{eyebrow}
				</span>
			{/if}
			{#if headingLevel === 'h3'}
				<h3
					class="text-surface-50! m-0 text-left! text-sm leading-snug font-black break-words uppercase sm:text-base"
				>
					{title}
				</h3>
			{:else if headingLevel === 'h4'}
				<h4
					class="text-surface-50! m-0 text-left! text-sm leading-snug font-black break-words uppercase"
				>
					{title}
				</h4>
			{:else}
				<div class="text-surface-50 text-sm leading-snug font-black break-words uppercase">
					{title}
				</div>
			{/if}
			{#if subtitle}
				<span class="text-surface-300 text-xs leading-snug font-bold break-words sm:text-sm">
					{subtitle}
				</span>
			{/if}
		</div>

		{#if actions}
			<div class="no-print flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
				{@render actions()}
			</div>
		{/if}
	</div>

	{#if badges.length > 0}
		<div class="flex w-full min-w-0 flex-wrap items-center gap-2">
			{#each badges as badge, index (`${badge.label}-${index}`)}
				<span
					class={`inline-flex items-center rounded-none border px-2.5 py-1 text-xs font-black tracking-wide uppercase tabular-nums ${badgeClasses(badge.tone)}`}
				>
					{badge.label}
				</span>
			{/each}
		</div>
	{/if}

	{#if progressPercent !== undefined && (progressPercent !== null || showUncappedBar)}
		<div class="bg-surface-800 h-2 w-full overflow-hidden rounded-none">
			<div
				class={`h-full rounded-none motion-safe:transition-all ${fillBarColor(progressPercent)}`}
				style={`width: ${progressPercent !== null ? progressPercent : 60}%`}
			></div>
		</div>
	{/if}
</div>
