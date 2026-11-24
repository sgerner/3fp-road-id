<script>
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';

	/** @type {Record<string, any>} */
	let {
		itemLabel = 'Item',
		index = 0,
		count = 1,
		positionLabel = 'Position',
		groups = [],
		groupValue = '',
		groupLabel = 'Section',
		disabled = false,
		focusKey = '',
		announceLocally = false,
		onPositionChange = undefined,
		onMove = undefined,
		onGroupChange = undefined,
		onAnnounce = undefined
	} = $props();

	const uid = $props.id();
	let localAnnouncement = $state('');

	const safeCount = $derived(Math.max(1, Number(count) || 1));
	const safeIndex = $derived(Math.min(safeCount - 1, Math.max(0, Number(index) || 0)));
	const positionNumbers = $derived(Array.from({ length: safeCount }, (_, i) => i + 1));
	const hasGroups = $derived(Array.isArray(groups) && groups.length > 0);

	function announce(message) {
		if (!message) return;
		if (announceLocally) {
			localAnnouncement = message;
		}
		if (typeof onAnnounce === 'function') {
			onAnnounce(message);
		}
	}

	function handlePositionSelect(event) {
		if (disabled) return;
		const chosenPos = Number.parseInt(event.currentTarget.value, 10);
		if (!Number.isFinite(chosenPos)) return;
		const targetIndex = Math.min(safeCount - 1, Math.max(0, chosenPos - 1));
		if (targetIndex === safeIndex) return;
		announce(`Moved ${itemLabel} to position ${targetIndex + 1} of ${safeCount}.`);
		if (typeof onPositionChange === 'function') {
			onPositionChange(targetIndex, `${focusKey ? `${focusKey}-pos` : ''}`);
		}
	}

	function handleStep(delta) {
		if (disabled) return;
		const targetIndex = safeIndex + delta;
		if (targetIndex < 0 || targetIndex >= safeCount) return;
		const controlSuffix = delta < 0 ? 'up' : 'down';
		announce(`Moved ${itemLabel} to position ${targetIndex + 1} of ${safeCount}.`);
		if (typeof onMove === 'function') {
			onMove(delta, `${focusKey ? `${focusKey}-${controlSuffix}` : ''}`);
		} else if (typeof onPositionChange === 'function') {
			onPositionChange(targetIndex, `${focusKey ? `${focusKey}-${controlSuffix}` : ''}`);
		}
	}

	function handleGroupSelect(event) {
		if (disabled) return;
		const nextValue = event.currentTarget.value;
		const matched = groups.find((option) => String(option.value) === String(nextValue));
		const nextLabel = matched?.label || nextValue || 'General';
		announce(`Moved ${itemLabel} to ${nextLabel}.`);
		if (typeof onGroupChange === 'function') {
			onGroupChange(nextValue, `${focusKey ? `${focusKey}-group` : ''}`);
		}
	}
</script>

<div
	class="bg-surface-900 text-surface-50 flex flex-wrap items-end gap-2.5"
	role="group"
	aria-label={`Reorder ${itemLabel}`}
>
	<div class="flex flex-col gap-1">
		<label
			for={`${uid}-position`}
			class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
		>
			{positionLabel}
		</label>
		<select
			id={`${uid}-position`}
			data-focus-key={focusKey ? `${focusKey}-pos` : undefined}
			aria-label={`${positionLabel} for ${itemLabel}`}
			class="border-surface-500 bg-surface-950 text-surface-50 focus:border-primary-500 focus-visible:outline-primary-500 h-9 min-h-9 min-w-20 border-2 py-1 pr-8 pl-2.5 text-xs font-black tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
			value={safeIndex + 1}
			disabled={disabled || safeCount <= 1}
			onchange={handlePositionSelect}
		>
			{#each positionNumbers as pos (pos)}
				<option value={pos}>{pos} of {safeCount}</option>
			{/each}
		</select>
	</div>

	{#if hasGroups}
		<div class="flex min-w-36 flex-1 flex-col gap-1">
			<label
				for={`${uid}-group`}
				class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
			>
				{groupLabel}
			</label>
			<select
				id={`${uid}-group`}
				data-focus-key={focusKey ? `${focusKey}-group` : undefined}
				aria-label={`${groupLabel} for ${itemLabel}`}
				class="border-surface-500 bg-surface-950 text-surface-50 focus:border-primary-500 focus-visible:outline-primary-500 h-9 min-h-9 w-full min-w-9 border-2 py-1 pr-8 pl-2.5 text-xs font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
				value={groupValue}
				{disabled}
				onchange={handleGroupSelect}
			>
				{#each groups as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	{/if}

	<div class="flex items-center gap-1.5">
		<button
			type="button"
			data-focus-key={focusKey ? `${focusKey}-up` : undefined}
			aria-label={`Move ${itemLabel} up`}
			class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 min-w-9 items-center justify-center gap-1 border-2 px-2.5 text-xs font-black tracking-wide uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
			disabled={disabled || safeIndex <= 0}
			onclick={() => handleStep(-1)}
		>
			<IconChevronUp class="h-4 w-4 shrink-0" aria-hidden="true" />
			<span>Move up</span>
		</button>
		<button
			type="button"
			data-focus-key={focusKey ? `${focusKey}-down` : undefined}
			aria-label={`Move ${itemLabel} down`}
			class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex h-9 min-h-9 min-w-9 items-center justify-center gap-1 border-2 px-2.5 text-xs font-black tracking-wide uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
			disabled={disabled || safeIndex >= safeCount - 1}
			onclick={() => handleStep(1)}
		>
			<IconChevronDown class="h-4 w-4 shrink-0" aria-hidden="true" />
			<span>Move down</span>
		</button>
	</div>

	{#if announceLocally}
		<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
			{localAnnouncement}
		</p>
	{/if}
</div>
