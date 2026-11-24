<script>
	import ManageActionRow from './ManageActionRow.svelte';

	let {
		as = 'h2',
		title = '',
		titleId = undefined,
		titleClass = 'text-base font-bold tracking-tight',
		eyebrow = '',
		subtitle = '',
		icon = null,
		tone = 'primary',
		iconVariant = 'plain',
		padded = false,
		divider = false,
		align = 'center',
		class: className = '',
		actionClass = '',
		iconSlot = null,
		badges = null,
		children = null,
		actions = null
	} = $props();

	const TONE_STYLES = {
		primary: {
			tile: 'bg-primary-500/15 text-primary-500',
			plain: 'text-primary-500'
		},
		secondary: {
			tile: 'bg-secondary-500/15 text-secondary-400',
			plain: 'text-secondary-500'
		},
		tertiary: {
			tile: 'bg-tertiary-500/15 text-tertiary-400',
			plain: 'text-tertiary-500'
		},
		warning: {
			tile: 'bg-warning-500/15 text-warning-400',
			plain: 'text-warning-500'
		},
		success: {
			tile: 'bg-success-500/15 text-success-400',
			plain: 'text-success-500'
		},
		muted: {
			tile: 'bg-surface-500/15 text-surface-400',
			plain: 'text-surface-400'
		}
	};

	const currentTone = $derived(TONE_STYLES[tone] ?? TONE_STYLES.primary);
	const Icon = $derived(icon);
	const hasBodyText = $derived(Boolean(eyebrow || subtitle || children));
</script>

<div
	class="manage-card-header flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2.5 {align ===
		'center' && !hasBodyText
		? 'sm:items-center'
		: ''} {padded ? 'px-4 py-3.5 sm:px-5 sm:py-4' : divider ? 'pb-3' : ''} {divider
		? 'border-surface-500/15 border-b'
		: ''} {className}"
>
	<div
		class="flex min-w-[min(100%,11rem)] flex-1 gap-3 {hasBodyText || align === 'start'
			? 'items-start'
			: 'items-center'}"
	>
		{#if iconSlot}
			{@render iconSlot()}
		{:else if Icon}
			{#if iconVariant === 'tile'}
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center {currentTone.tile}"
					aria-hidden="true"
				>
					<Icon class="h-5 w-5" />
				</span>
			{:else}
				<Icon class="{hasBodyText ? 'mt-0.5' : ''} h-5 w-5 shrink-0 {currentTone.plain}" />
			{/if}
		{/if}

		<div class="min-w-0 flex-1">
			{#if eyebrow}
				<p class="m-0 mb-0.5 text-xs font-semibold tracking-[0.16em] uppercase opacity-60">
					{eyebrow}
				</p>
			{/if}
			<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
				{#if title}
					<svelte:element
						this={as}
						id={titleId}
						class="m-0 min-w-0 [overflow-wrap:anywhere] {titleClass}"
					>
						{title}
					</svelte:element>
				{/if}
				{#if badges}
					{@render badges()}
				{/if}
			</div>
			{#if subtitle}
				<p class="m-0 mt-1 text-xs leading-relaxed opacity-70 sm:text-sm">
					{subtitle}
				</p>
			{/if}
			{#if children}
				<div class="min-w-0">
					{@render children()}
				</div>
			{/if}
		</div>
	</div>

	{#if actions}
		<ManageActionRow class={actionClass}>
			{@render actions()}
		</ManageActionRow>
	{/if}
</div>

<style>
	:where(.manage-card-header) :global(:where(.badge)) {
		max-width: 100%;
	}
</style>
