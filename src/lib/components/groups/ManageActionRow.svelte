<script>
	let {
		align = 'start',
		gap = 'gap-2',
		class: className = '',
		lead = null,
		children = null
	} = $props();

	const justifyClass = $derived(
		lead
			? 'justify-between'
			: align === 'end'
				? 'justify-end'
				: align === 'between'
					? 'justify-between'
					: 'justify-start'
	);
</script>

<div
	class="manage-action-row flex max-w-full min-w-0 flex-wrap items-center {gap} {justifyClass} {className}"
>
	{#if lead}
		<div class="min-w-[min(100%,11rem)] flex-1">
			{@render lead()}
		</div>
	{/if}
	{#if children}
		{#if lead}
			<div class="flex max-w-full min-w-0 flex-wrap items-center {gap}">
				{@render children()}
			</div>
		{:else}
			{@render children()}
		{/if}
	{/if}
</div>

<style>
	:where(.manage-action-row) :global(:where(.btn)) {
		max-width: 100%;
		white-space: normal;
		text-align: center;
	}

	:where(.manage-action-row) :global(:where(.btn > svg)) {
		flex-shrink: 0;
	}
</style>
