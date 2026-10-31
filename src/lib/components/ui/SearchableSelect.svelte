<script context="module">
	let idSequence = 0;
</script>

<script>
	import { tick } from 'svelte';

	export let items = [];
	export let query = '';
	export let placeholder = 'Search';
	export let ariaLabel = '';
	export let id = '';
	export let emptyMessage = 'No matches.';
	export let maxItems = 12;
	export let disabled = false;
	export let onQueryChange = undefined;
	export let onSelect = undefined;
	export let itemLabel = (item) => item?.label || '';
	export let itemMeta = () => '';

	let open = false;
	let closeTimer = null;
	let listboxId = '';
	let activeIndex = -1;

	function ensureListboxId() {
		if (listboxId) return;
		idSequence += 1;
		listboxId = id || `searchable-select-${idSequence}`;
	}

	function handleQueryChange(value) {
		query = value;
		activeIndex = -1;
		if (typeof onQueryChange === 'function') onQueryChange(value);
	}

	function handleFocus() {
		if (!disabled) {
			ensureListboxId();
			open = true;
		}
	}

	function handleBlur() {
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			open = false;
		}, 80);
	}

	function choose(item) {
		if (disabled) return;
		clearTimeout(closeTimer);
		const label = itemLabel(item);
		handleQueryChange(label);
		open = false;
		if (typeof onSelect === 'function') onSelect(item);
	}

	$: visibleItems = Array.isArray(items) ? items.slice(0, maxItems) : [];
	$: if (activeIndex >= visibleItems.length) activeIndex = visibleItems.length - 1;

	async function scrollActiveOptionIntoView() {
		await tick();
		if (activeIndex < 0 || !listboxId) return;
		document
			.getElementById(`${listboxId}-option-${activeIndex}`)
			?.scrollIntoView?.({ block: 'nearest' });
	}

	function handleKeydown(event) {
		if (disabled) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			ensureListboxId();
			open = true;
			if (visibleItems.length) {
				activeIndex = Math.min(activeIndex + 1, visibleItems.length - 1);
				void scrollActiveOptionIntoView();
			}
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			ensureListboxId();
			open = true;
			if (visibleItems.length) {
				activeIndex = activeIndex < 0 ? visibleItems.length - 1 : Math.max(activeIndex - 1, 0);
				void scrollActiveOptionIntoView();
			}
			return;
		}

		if (event.key === 'Enter' && open && activeIndex >= 0) {
			event.preventDefault();
			choose(visibleItems[activeIndex]);
			return;
		}

		if (event.key === 'Escape' && open) {
			event.preventDefault();
			open = false;
			activeIndex = -1;
		}
	}
</script>

<div class="relative">
	<input
		class="input preset-tonal-surface py-1.5 text-sm"
		type="search"
		role="combobox"
		autocomplete="off"
		aria-autocomplete="list"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={open ? listboxId : undefined}
		aria-activedescendant={open && activeIndex >= 0
			? `${listboxId}-option-${activeIndex}`
			: undefined}
		aria-label={ariaLabel || placeholder}
		{placeholder}
		bind:value={query}
		{disabled}
		onfocus={handleFocus}
		onblur={handleBlur}
		oninput={(event) => handleQueryChange(event.currentTarget.value)}
		onkeydown={handleKeydown}
	/>

	{#if open}
		<div
			id={listboxId}
			role="listbox"
			aria-label={`${ariaLabel || placeholder} suggestions`}
			class="bg-surface-950/95 border-surface-500/10 absolute z-10 mt-2 max-h-56 w-full overflow-auto rounded-xl border p-1 shadow-xl backdrop-blur"
		>
			{#each visibleItems as item, index}
				<button
					id={`${listboxId}-option-${index}`}
					role="option"
					aria-selected={activeIndex === index}
					tabindex="-1"
					class="hover:bg-surface-500/10 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm {activeIndex ===
					index
						? 'bg-surface-500/10'
						: ''}"
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
				<div class="text-surface-500 px-3 py-2 text-sm" role="status">{emptyMessage}</div>
			{/each}
		</div>
	{/if}
</div>
