<script>
	export let items = [];
	export let query = '';
	export let placeholder = 'Search';
	export let emptyMessage = 'No matches.';
	export let maxItems = 12;
	export let disabled = false;
	export let onQueryChange = undefined;
	export let onSelect = undefined;
	export let itemLabel = (item) => item?.label || '';
	export let itemMeta = () => '';

	let open = false;
	let closeTimer = null;

	function handleQueryChange(value) {
		query = value;
		if (typeof onQueryChange === 'function') onQueryChange(value);
	}

	function handleFocus() {
		if (!disabled) open = true;
	}

	function handleBlur() {
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			open = false;
		}, 80);
	}

	function choose(item) {
		if (disabled) return;
		const label = itemLabel(item);
		handleQueryChange(label);
		open = false;
		if (typeof onSelect === 'function') onSelect(item);
	}

	$: visibleItems = Array.isArray(items) ? items.slice(0, maxItems) : [];
</script>

<div class="relative">
	<input
		class="input preset-tonal-surface py-1.5 text-sm"
		type="search"
		autocomplete="off"
		aria-autocomplete="list"
		{placeholder}
		bind:value={query}
		{disabled}
		onfocus={handleFocus}
		onblur={handleBlur}
		oninput={(event) => handleQueryChange(event.currentTarget.value)}
	/>

	{#if open}
		<div
			class="bg-surface-950/95 border-surface-500/10 absolute z-10 mt-2 max-h-56 w-full overflow-auto rounded-xl border p-1 shadow-xl backdrop-blur"
		>
			{#each visibleItems as item}
				<button
					class="hover:bg-surface-500/10 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm"
					type="button"
					onmousedown={(event) => {
						event.preventDefault();
						choose(item);
					}}
				>
					<span class="min-w-0 truncate font-medium">{itemLabel(item)}</span>
					<span class="text-surface-500 shrink-0 text-[10px] font-semibold uppercase">
						{itemMeta(item)}
					</span>
				</button>
			{:else}
				<div class="text-surface-500 px-3 py-2 text-sm">{emptyMessage}</div>
			{/each}
		</div>
	{/if}
</div>
