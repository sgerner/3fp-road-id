<script lang="ts">
	import IconSearch from '@lucide/svelte/icons/search';
	import type { Snippet } from 'svelte';

	export type ToolbarFilterOption = {
		value: string;
		label: string;
	};

	export type ToolbarSelectFilter = {
		id: string;
		label: string;
		value: string;
		options: ToolbarFilterOption[];
		onChange: (value: string) => void;
	};

	export type ToolbarPillOption = {
		value: string;
		label: string;
		tone?: 'primary' | 'success' | 'warning' | 'error' | 'surface';
	};

	type Props = {
		pills?: ToolbarPillOption[];
		selectedPill?: string;
		pillGroupLabel?: string;
		onPillChange?: (value: string) => void;
		filters?: ToolbarSelectFilter[];
		searchValue?: string;
		searchPlaceholder?: string;
		searchLabel?: string;
		onSearch?: ((value: string) => void) | undefined;
		sticky?: boolean;
		class?: string;
		summary?: Snippet;
		actions?: Snippet;
	};

	const {
		pills = [],
		selectedPill = 'all',
		pillGroupLabel = 'Filter by status',
		onPillChange = undefined,
		filters = [],
		searchValue = '',
		searchPlaceholder = 'Search…',
		searchLabel = 'Search',
		onSearch = undefined,
		sticky = false,
		class: className = '',
		summary = undefined,
		actions = undefined
	}: Props = $props();

	const baseId = $props.id();

	function pillClasses(pill: ToolbarPillOption, active: boolean): string {
		const tone = pill.tone ?? 'primary';
		if (active) {
			switch (tone) {
				case 'success':
					return 'border-success-500 bg-success-500 text-surface-950';
				case 'warning':
					return 'border-warning-500 bg-warning-500 text-surface-950';
				case 'error':
					return 'border-error-500 bg-error-500 text-surface-950';
				case 'surface':
					return 'border-surface-300 bg-surface-300 text-surface-950';
				case 'primary':
				default:
					return 'border-primary-500 bg-primary-500 text-surface-950';
			}
		}

		switch (tone) {
			case 'success':
				return 'border-surface-500 bg-surface-950 text-surface-50 hover:border-success-500 hover:text-success-300';
			case 'warning':
				return 'border-surface-500 bg-surface-950 text-surface-50 hover:border-warning-500 hover:text-warning-300';
			case 'error':
				return 'border-surface-500 bg-surface-950 text-surface-50 hover:border-error-400 hover:text-error-200';
			case 'surface':
				return 'border-surface-500 bg-surface-950 text-surface-50 hover:border-surface-300';
			case 'primary':
			default:
				return 'border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:text-primary-500';
		}
	}

	function markerClasses(pill: ToolbarPillOption): string {
		switch (pill.tone) {
			case 'success':
				return 'bg-success-500';
			case 'warning':
				return 'bg-warning-500';
			case 'error':
				return 'bg-error-500';
			case 'surface':
				return 'bg-surface-300';
			case 'primary':
			default:
				return 'bg-primary-500';
		}
	}
</script>

<div
	class={`border-surface-800 bg-surface-950 text-surface-50 flex w-full min-w-0 flex-col gap-3 border-b-2 px-4 py-3 ${
		sticky ? 'border-t-primary-500 sticky top-[var(--app-header-height)] z-20 border-t-2' : ''
	} ${className}`}
>
	{#if pills.length > 0 && onPillChange}
		<!-- Desktop status filter band -->
		<div
			role="group"
			aria-label={pillGroupLabel}
			class="hidden flex-wrap items-center gap-2 sm:flex"
		>
			{#each pills as pill (pill.value)}
				{@const active = selectedPill === pill.value}
				<button
					type="button"
					aria-pressed={active}
					onclick={() => onPillChange(pill.value)}
					class={`focus-visible:outline-primary-500 inline-flex min-h-11 items-center gap-2 rounded-none border-2 px-3 py-2 text-xs font-black tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${pillClasses(pill, active)}`}
				>
					{#if !active}
						<span class={`h-2 w-2 shrink-0 ${markerClasses(pill)}`} aria-hidden="true"></span>
					{/if}
					<span>{pill.label}</span>
				</button>
			{/each}
		</div>

		<!-- Mobile status select -->
		<div class="flex min-w-0 flex-col gap-1 sm:hidden">
			<label
				for={`${baseId}-pill-select`}
				class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
			>
				{pillGroupLabel}
			</label>
			<select
				id={`${baseId}-pill-select`}
				aria-label={pillGroupLabel}
				value={selectedPill}
				onchange={(e) => onPillChange(e.currentTarget.value)}
				class="border-surface-500 bg-surface-950 text-surface-50 focus:border-primary-500 min-h-11 w-full max-w-full min-w-0 truncate rounded-none border-2 px-3 py-2 text-sm font-semibold focus:outline-none"
			>
				{#each pills as pill (pill.value)}
					<option value={pill.value}>{pill.label}</option>
				{/each}
			</select>
		</div>
	{/if}

	<div class="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
		{#each filters as filter (filter.id)}
			<div class="flex min-w-0 flex-col gap-1 sm:max-w-[17rem] sm:min-w-[11rem] sm:flex-1">
				<label
					for={`${baseId}-${filter.id}`}
					class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
				>
					{filter.label}
				</label>
				<select
					id={`${baseId}-${filter.id}`}
					aria-label={filter.label}
					value={filter.value}
					onchange={(e) => filter.onChange(e.currentTarget.value)}
					class="border-surface-500 bg-surface-950 text-surface-50 focus:border-primary-500 min-h-11 w-full max-w-full min-w-0 truncate rounded-none border-2 px-3 py-2 text-sm font-semibold focus:outline-none"
				>
					{#each filter.options as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		{/each}

		{#if onSearch}
			<div class="flex min-w-0 flex-col gap-1 sm:min-w-[13rem] sm:flex-1">
				<label
					for={`${baseId}-search`}
					class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
				>
					{searchLabel}
				</label>
				<div class="relative flex min-w-0 items-center">
					<IconSearch
						class="text-primary-500 pointer-events-none absolute left-3 h-4 w-4 shrink-0"
						aria-hidden="true"
					/>
					<input
						id={`${baseId}-search`}
						type="search"
						aria-label={searchLabel}
						value={searchValue}
						placeholder={searchPlaceholder}
						oninput={(e) => onSearch(e.currentTarget.value)}
						class="border-surface-500 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-primary-500 min-h-11 w-full min-w-0 rounded-none border-2 py-2 pr-3 pl-9 text-sm font-medium focus:outline-none"
					/>
				</div>
			</div>
		{/if}

		{#if actions}
			<div class="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
				{@render actions()}
			</div>
		{/if}
	</div>

	{#if summary}
		<div class="border-surface-800 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
			{@render summary()}
		</div>
	{/if}
</div>
