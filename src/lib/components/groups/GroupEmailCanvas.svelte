<script>
	import { onDestroy, untrack } from 'svelte';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconGripVertical from '@lucide/svelte/icons/grip-vertical';
	import IconMonitor from '@lucide/svelte/icons/monitor';
	import IconRedo from '@lucide/svelte/icons/redo-2';
	import IconSmartphone from '@lucide/svelte/icons/smartphone';
	import IconTrash from '@lucide/svelte/icons/trash-2';
	import IconUndo from '@lucide/svelte/icons/undo-2';
	import IconLayoutGrid from '@lucide/svelte/icons/layout-grid';
	import IconX from '@lucide/svelte/icons/x';
	import {
		EMAIL_BLOCK_OPTIONS,
		MAX_EMAIL_BLOCKS,
		cloneEmailBlocks,
		duplicateEmailBlock,
		moveEmailBlock,
		newEmailBlock
	} from '$lib/groups/emailEditor';

	let {
		blocks: initialBlocks = [],
		brand = {},
		groupName = 'Your group',
		defaultActionUrl = '',
		onchange = () => {}
	} = $props();

	let blocks = $state(untrack(() => cloneEmailBlocks(initialBlocks)));
	let selectedId = $state('');
	let previewDevice = $state('desktop');
	let showOutline = $state(false);
	let mobilePaletteOpen = $state(false);
	let dragged = null;
	let history = $state(untrack(() => [cloneEmailBlocks(blocks)]));
	let historyIndex = $state(0);
	let pendingHistoryTimer;

	const selectedIndex = $derived(blocks.findIndex((block) => block.id === selectedId));
	const selectedBlock = $derived(blocks[selectedIndex]);
	const canUndo = $derived(historyIndex > 0);
	const canRedo = $derived(historyIndex < history.length - 1);
	const previewWidth = $derived(previewDevice === 'mobile' ? '390px' : '640px');
	const safeColor = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value) ? value : fallback);
	const accent = $derived(safeColor(brand?.primaryColor, '#84CC16'));
	const background = $derived(safeColor(brand?.backgroundColor, '#F4F4F5'));
	const ink = $derived(safeColor(brand?.inkColor, '#18181B'));
	const safePreviewUrl = (value) => {
		try {
			const parsed = new URL(String(value ?? '').trim());
			return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname
				? parsed.toString()
				: '';
		} catch {
			return '';
		}
	};
	const blockLabel = (type) =>
		EMAIL_BLOCK_OPTIONS.find((option) => option.type === type)?.label || 'Content';

	function emit(next, { coalesce = false } = {}) {
		blocks = cloneEmailBlocks(next);
		onchange(cloneEmailBlocks(blocks));
		clearTimeout(pendingHistoryTimer);
		if (!coalesce) {
			history = [...history.slice(0, historyIndex + 1), cloneEmailBlocks(blocks)].slice(-60);
			historyIndex = history.length - 1;
			return;
		}
		pendingHistoryTimer = setTimeout(() => {
			history = [...history.slice(0, historyIndex + 1), cloneEmailBlocks(blocks)].slice(-60);
			historyIndex = history.length - 1;
		}, 400);
	}

	function restoreHistory(index) {
		clearTimeout(pendingHistoryTimer);
		if (index < 0 || index >= history.length) return;
		historyIndex = index;
		blocks = cloneEmailBlocks(history[index]);
		if (selectedId && !blocks.some((block) => block.id === selectedId)) selectedId = '';
		onchange(cloneEmailBlocks(blocks));
	}

	function addBlock(type, index = blocks.length) {
		if (blocks.length >= MAX_EMAIL_BLOCKS) return;
		const block = newEmailBlock(type, defaultActionUrl);
		const next = cloneEmailBlocks(blocks);
		next.splice(Math.max(0, Math.min(index, next.length)), 0, block);
		selectedId = block.id;
		mobilePaletteOpen = false;
		emit(next);
	}

	function updateSelected(patch) {
		if (!selectedBlock) return;
		emit(
			blocks.map((block) => (block.id === selectedId ? { ...block, ...patch } : block)),
			{ coalesce: true }
		);
	}

	function moveSelected(direction) {
		if (selectedIndex < 0) return;
		emit(moveEmailBlock(blocks, selectedIndex, selectedIndex + direction));
	}

	function duplicateSelected() {
		if (!selectedBlock || blocks.length >= MAX_EMAIL_BLOCKS) return;
		const next = duplicateEmailBlock(blocks, selectedId);
		selectedId = next[selectedIndex + 1]?.id ?? selectedId;
		emit(next);
	}

	function removeSelected() {
		if (!selectedBlock) return;
		const next = blocks.filter((block) => block.id !== selectedId);
		selectedId = next[selectedIndex]?.id ?? next[selectedIndex - 1]?.id ?? '';
		emit(next);
	}

	function startDrag(event, value) {
		dragged = value;
		event.dataTransfer.effectAllowed = value.kind === 'new' ? 'copy' : 'move';
	}

	function dropAt(index, event) {
		event.preventDefault();
		if (!dragged) return;
		if (dragged.kind === 'new') {
			addBlock(dragged.type, index);
		} else {
			const from = blocks.findIndex((block) => block.id === dragged.id);
			const destination = from < index ? index - 1 : index;
			emit(moveEmailBlock(blocks, from, destination));
		}
		dragged = null;
	}

	onDestroy(() => clearTimeout(pendingHistoryTimer));
</script>

{#snippet blockPalette(compact = false)}
	<div class="grid grid-cols-2 gap-2 {compact ? 'sm:grid-cols-3' : ''}">
		{#each EMAIL_BLOCK_OPTIONS as option}
			<button
				class="card preset-tonal-surface hover:preset-tonal-primary group grid min-h-24 cursor-grab place-items-center gap-1 p-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
				type="button"
				draggable={blocks.length < MAX_EMAIL_BLOCKS}
				disabled={blocks.length >= MAX_EMAIL_BLOCKS}
				ondragstart={(event) => startDrag(event, { kind: 'new', type: option.type })}
				ondragend={() => (dragged = null)}
				onclick={() => addBlock(option.type)}
			>
				<span
					class="grid h-8 w-8 place-items-center text-lg font-black transition-transform duration-200 group-hover:scale-110"
					aria-hidden="true">{option.icon}</span
				>
				<span class="text-xs font-semibold">{option.label}</span>
				<span class="text-[0.65rem] opacity-55">{option.description}</span>
			</button>
		{/each}
	</div>
{/snippet}

<div
	class="grid min-h-[42rem] overflow-hidden xl:grid-cols-[16rem_minmax(0,1fr)] {selectedBlock
		? '2xl:grid-cols-[16rem_minmax(0,1fr)_19rem]'
		: '2xl:grid-cols-[16rem_minmax(0,1fr)]'}"
>
	<aside
		class="preset-tonal-surface preset-divider-right hidden p-3 xl:block xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto"
	>
		<div class="mb-3">
			<p class="font-semibold">Add content</p>
			<p class="text-xs opacity-65">
				Tap a block to add it. Drag on desktop. {blocks.length}/{MAX_EMAIL_BLOCKS}
			</p>
		</div>
		{@render blockPalette()}
		<button
			class="btn btn-sm preset-tonal-surface mt-3 w-full"
			type="button"
			onclick={() => (showOutline = !showOutline)}
			aria-pressed={showOutline}
		>
			<IconGripVertical class="h-4 w-4" />
			{showOutline ? 'Hide outline' : 'Reorder message'}
		</button>
		{#if showOutline}
			<div class="mt-2 grid gap-1" aria-label="Email structure">
				<button
					class="btn btn-sm preset-tonal-primary w-full"
					type="button"
					disabled={blocks.length >= MAX_EMAIL_BLOCKS}
					onclick={() => addBlock('heading', 0)}
					ondragover={(event) => event.preventDefault()}
					ondrop={(event) => dropAt(0, event)}>Add or drop at top</button
				>
				{#each blocks as block, index}
					<button
						class="btn btn-sm preset-tonal-surface w-full justify-start text-left capitalize"
						type="button"
						draggable="true"
						aria-pressed={selectedId === block.id}
						ondragstart={(event) => startDrag(event, { kind: 'existing', id: block.id })}
						onclick={() => (selectedId = block.id)}>{index + 1}. {blockLabel(block.type)}</button
					>
				{/each}
			</div>
		{/if}
	</aside>

	<section class="flex min-w-0 flex-col">
		<div
			class="preset-tonal-surface preset-divider-bottom flex flex-wrap items-center justify-between gap-2 p-3"
		>
			<div class="flex items-center gap-2">
				<span class="badge preset-filled-primary-500">Live canvas</span>
				<button
					class="btn btn-sm preset-tonal-surface"
					type="button"
					disabled={!canUndo}
					onclick={() => restoreHistory(historyIndex - 1)}
					aria-label="Undo last edit"
					><IconUndo class="h-4 w-4" /><span class="hidden sm:inline">Undo</span></button
				>
				<button
					class="btn btn-sm preset-tonal-surface"
					type="button"
					disabled={!canRedo}
					onclick={() => restoreHistory(historyIndex + 1)}
					aria-label="Redo last edit"
					><IconRedo class="h-4 w-4" /><span class="hidden sm:inline">Redo</span></button
				>
			</div>
			<div class="flex gap-1" aria-label="Preview width">
				<button
					class="btn btn-sm {previewDevice === 'desktop'
						? 'preset-filled-primary-500'
						: 'preset-tonal-surface'}"
					type="button"
					onclick={() => (previewDevice = 'desktop')}
					aria-pressed={previewDevice === 'desktop'}
					aria-label="Desktop preview"
					><IconMonitor class="h-4 w-4" /><span class="hidden sm:inline">Desktop</span></button
				>
				<button
					class="btn btn-sm {previewDevice === 'mobile'
						? 'preset-filled-primary-500'
						: 'preset-tonal-surface'}"
					type="button"
					onclick={() => (previewDevice = 'mobile')}
					aria-pressed={previewDevice === 'mobile'}
					aria-label="Mobile preview"
					><IconSmartphone class="h-4 w-4" /><span class="hidden sm:inline">Mobile</span></button
				>
			</div>
		</div>

		<div
			class="preset-tonal-tertiary min-h-[38rem] flex-1 overflow-auto p-3 sm:p-6"
			role="region"
			aria-label="Email design canvas"
			style:background
			ondragover={(event) => event.preventDefault()}
			ondrop={(event) => dropAt(blocks.length, event)}
		>
			<div
				class="card mx-auto overflow-hidden shadow-2xl transition-all duration-500 ease-out"
				style:width={`min(100%, ${previewWidth})`}
				style:max-width={previewWidth}
				style:color={ink}
				style:background="#ffffff"
			>
				<div class="px-6 pt-8 pb-4 sm:px-10 sm:pt-10">
					<p class="font-black">{groupName}</p>
				</div>
				{#each blocks as block, index (block.id)}
					<button
						class="block w-full cursor-grab px-6 py-3 text-left outline-none transition-all duration-200 active:cursor-grabbing sm:px-10 {selectedId ===
						block.id
							? 'bg-primary-50/30 ring-primary-500 ring-2 ring-inset'
							: 'hover:bg-primary-50/20 hover:ring-primary-500/40 hover:ring-2 hover:ring-inset'}"
						type="button"
						aria-pressed={selectedId === block.id}
						aria-label={`Edit ${blockLabel(block.type)} block ${index + 1}`}
						onclick={() => (selectedId = block.id)}
						draggable="true"
						ondragstart={(event) => startDrag(event, { kind: 'existing', id: block.id })}
						ondragover={(event) => event.preventDefault()}
						ondrop={(event) => dropAt(index, event)}
					>
						{#if block.type === 'heading'}
							<span class="block text-3xl leading-tight font-black sm:text-4xl"
								>{block.text || 'Your headline'}</span
							>
						{:else if block.type === 'eyebrow'}
							<span
								class="block text-xs font-black tracking-[0.14em] uppercase"
								style:color={accent}>{block.text || 'Worth knowing'}</span
							>
						{:else if block.type === 'text'}
							<span class="block text-base leading-relaxed whitespace-pre-line sm:text-lg"
								>{block.text || 'Write your message.'}</span
							>
						{:else if block.type === 'image'}
							{#if safePreviewUrl(block.url)}
								<img
									class="rounded-container-token block h-auto w-full"
									src={safePreviewUrl(block.url)}
									alt={block.alt ?? ''}
								/>
							{:else}
								<span
									class="preset-tonal-surface grid min-h-40 place-items-center p-5 text-center text-sm opacity-65"
									>Add an HTTPS image URL</span
								>
							{/if}
						{:else if block.type === 'button'}
							<span
								class="btn pointer-events-none w-fit"
								style:background={accent}
								style:color="#ffffff">{block.text || 'Learn more'}</span
							>
						{:else}
							<span class="preset-divider-top block"></span>
						{/if}
					</button>
				{:else}
					<button
						class="preset-tonal-primary mx-6 my-8 grid min-h-32 w-[calc(100%-3rem)] cursor-pointer place-items-center p-6 text-center sm:mx-10 sm:w-[calc(100%-5rem)]"
						type="button"
						onclick={() => addBlock('heading')}
					>
						<span
							><strong>Start with one good idea.</strong><br /><span class="text-sm opacity-65"
								>Add a headline to begin.</span
							></span
						>
					</button>
				{/each}
				<div class="preset-divider-top mx-6 mt-5 px-0 py-6 text-xs opacity-60 sm:mx-10">
					A short recipient reason is included at the bottom of every email.
				</div>
			</div>
		</div>
	</section>

	{#if selectedBlock}
		<aside
			class="preset-tonal-surface preset-divider-top grid content-start gap-4 p-4 xl:col-span-2 2xl:preset-divider-top-0 2xl:preset-divider-left 2xl:col-span-1 2xl:overflow-y-auto"
			aria-live="polite"
			aria-label={`Editing ${blockLabel(selectedBlock.type)} block ${selectedIndex + 1}`}
		>
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-xs font-semibold tracking-wide uppercase opacity-55">
						Editing block {selectedIndex + 1}
					</p>
					<h2 class="text-lg font-bold capitalize">{selectedBlock.type}</h2>
				</div>
				<button
					class="btn btn-sm preset-tonal-surface"
					type="button"
					onclick={() => (selectedId = '')}>Done</button
				>
			</div>

			{#if ['heading', 'eyebrow'].includes(selectedBlock.type)}
				<label class="label">
					<span>Text</span>
					<input
						class="input"
						value={selectedBlock.text ?? ''}
						maxlength="500"
						oninput={(event) => updateSelected({ text: event.currentTarget.value })}
					/>
				</label>
			{:else if selectedBlock.type === 'text'}
				<label class="label">
					<span>Message</span>
					<textarea
						class="textarea min-h-44"
						maxlength="12000"
						value={selectedBlock.text ?? ''}
						oninput={(event) => updateSelected({ text: event.currentTarget.value })}
					></textarea>
				</label>
			{:else if selectedBlock.type === 'image'}
				<label class="label">
					<span>Image URL</span>
					<input
						class="input"
						type="url"
						value={selectedBlock.url ?? ''}
						placeholder="https://…"
						oninput={(event) => updateSelected({ url: event.currentTarget.value })}
					/>
				</label>
				<label class="label">
					<span>Image description</span>
					<input
						class="input"
						value={selectedBlock.alt ?? ''}
						maxlength="500"
						placeholder="Describe the image for screen readers"
						oninput={(event) => updateSelected({ alt: event.currentTarget.value })}
					/>
				</label>
			{:else if selectedBlock.type === 'button'}
				<label class="label">
					<span>Button label</span>
					<input
						class="input"
						value={selectedBlock.text ?? ''}
						maxlength="240"
						oninput={(event) => updateSelected({ text: event.currentTarget.value })}
					/>
				</label>
				<label class="label">
					<span>Destination URL</span>
					<input
						class="input"
						type="url"
						value={selectedBlock.url ?? ''}
						placeholder="https://…"
						oninput={(event) => updateSelected({ url: event.currentTarget.value })}
					/>
				</label>
			{:else}
				<div class="preset-tonal-surface p-3 text-sm opacity-70">
					A divider has no content settings.
				</div>
			{/if}

			<div class="grid grid-cols-2 gap-2">
				<button
					class="btn btn-sm preset-tonal-surface"
					type="button"
					disabled={selectedIndex === 0}
					onclick={() => moveSelected(-1)}><IconChevronUp class="h-4 w-4" /> Move up</button
				>
				<button
					class="btn btn-sm preset-tonal-surface"
					type="button"
					disabled={selectedIndex === blocks.length - 1}
					onclick={() => moveSelected(1)}><IconChevronDown class="h-4 w-4" /> Move down</button
				>
				<button
					class="btn btn-sm preset-tonal-surface"
					type="button"
					disabled={blocks.length >= MAX_EMAIL_BLOCKS}
					onclick={duplicateSelected}><IconCopy class="h-4 w-4" /> Duplicate</button
				>
				<button class="btn btn-sm preset-tonal-error" type="button" onclick={removeSelected}
					><IconTrash class="h-4 w-4" /> Remove</button
				>
			</div>
		</aside>
	{/if}
</div>

<button
	class="btn preset-filled-primary-500 fixed right-4 bottom-4 z-40 shadow-2xl xl:hidden"
	type="button"
	onclick={() => (mobilePaletteOpen = true)}
	aria-expanded={mobilePaletteOpen}
>
	<IconLayoutGrid class="h-5 w-5" /> Add content
</button>

{#if mobilePaletteOpen}
	<button
		class="fixed inset-0 z-40 bg-surface-950/45 backdrop-blur-sm xl:hidden"
		type="button"
		aria-label="Close content library"
		onclick={() => (mobilePaletteOpen = false)}
	></button>
	<aside
		class="card preset-tonal-surface fixed inset-x-3 bottom-3 z-50 grid max-h-[78dvh] gap-3 overflow-y-auto p-4 shadow-2xl xl:hidden"
		aria-label="Add email content"
	>
		<div class="flex items-start gap-3">
			<div class="grow">
				<p class="font-semibold">Add content</p>
				<p class="text-xs opacity-60">Tap a block to add it to your message.</p>
			</div>
			<button
				class="btn btn-icon btn-sm preset-tonal-surface"
				type="button"
				aria-label="Close content library"
				onclick={() => (mobilePaletteOpen = false)}><IconX class="h-4 w-4" /></button
			>
		</div>
		{@render blockPalette(true)}
	</aside>
{/if}
