<script>
	import { onMount } from 'svelte';
	import IconArrowDown from '@lucide/svelte/icons/arrow-down';
	import IconArrowUp from '@lucide/svelte/icons/arrow-up';
	import IconCalendar from '@lucide/svelte/icons/calendar-days';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconGrip from '@lucide/svelte/icons/grip-vertical';
	import IconImage from '@lucide/svelte/icons/image';
	import IconLayout from '@lucide/svelte/icons/layout-template';
	import IconLink from '@lucide/svelte/icons/link';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconMonitor from '@lucide/svelte/icons/monitor';
	import IconPhone from '@lucide/svelte/icons/smartphone';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconPanelsTopLeft from '@lucide/svelte/icons/panels-top-left';
	import IconX from '@lucide/svelte/icons/x';
	import IconRedo from '@lucide/svelte/icons/redo-2';
	import IconTrash from '@lucide/svelte/icons/trash-2';
	import IconUndo from '@lucide/svelte/icons/undo-2';
	import IconUsers from '@lucide/svelte/icons/users';
	import {
		createGroupSiteBlock,
		GROUP_SITE_BLOCK_LIMIT,
		GROUP_SITE_BLOCK_TYPES
	} from '$lib/microsites/blocks';

	let {
		blocks = [],
		config = {},
		group = {},
		onchange = () => {},
		onconfigchange = () => {}
	} = $props();

	const clone = (value) => JSON.parse(JSON.stringify(value));
	let selectedId = $state('site-hero');
	let undoStack = $state([]);
	let redoStack = $state([]);
	let device = $state('desktop');
	let draggedBlockId = $state('');
	let draggedPaletteType = $state('');
	let dropIndex = $state(-1);
	let announcement = $state('');
	let mobileInspectorOpen = $state(false);
	let mobilePaletteOpen = $state(false);
	let suppressPaletteClick = false;
	let editorRoot;
	let editorVisible = $state(false);
	let sequence = 0;

	const selectedBlock = $derived(
		blocks.find((block) => block.id === selectedId) || blocks[0] || null
	);
	const selectedIndex = $derived(
		selectedBlock ? blocks.findIndex((block) => block.id === selectedBlock.id) : -1
	);
	const viewportClass = $derived(
		device === 'phone' ? 'max-w-[24rem]' : device === 'tablet' ? 'max-w-[48rem]' : 'max-w-[72rem]'
	);
	const safeColor = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value) ? value : fallback);
	const sitePrimary = $derived(safeColor(config.theme_colors?.primary, '#D7F205'));
	const siteSecondary = $derived(safeColor(config.theme_colors?.secondary, '#5665E8'));
	const siteAccent = $derived(safeColor(config.theme_colors?.accent, '#D946EF'));
	const siteSurface = $derived(safeColor(config.theme_colors?.surface, '#FFFFFF'));
	const siteText = $derived.by(() => {
		const channels = siteSurface
			.slice(1)
			.match(/.{2}/g)
			.map((value) => Number.parseInt(value, 16));
		const luminance = (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
		return luminance > 150 ? '#171717' : '#FAFAFA';
	});
	const siteFont = $derived(
		config.font_pairing === 'editorial'
			? 'Georgia, ui-serif, serif'
			: config.font_pairing === 'clean'
				? 'Inter, ui-sans-serif, sans-serif'
				: 'Arial Black, Inter, ui-sans-serif, sans-serif'
	);
	const actionBlockTypes = [
		'call_to_action',
		'email_signup',
		'membership',
		'volunteer',
		'updates',
		'resources'
	];
	const paletteGroups = [
		{
			label: 'Grow your community',
			types: ['email_signup', 'membership', 'volunteer', 'donation']
		},
		{ label: 'Keep people informed', types: ['events', 'ride_calendar', 'updates'] },
		{ label: 'Tell your story', types: ['story', 'gallery', 'text'] },
		{ label: 'Useful next steps', types: ['contact', 'sponsors', 'resources', 'call_to_action'] }
	];
	const automaticDestination = {
		membership: 'your membership options',
		volunteer: 'your volunteer opportunities',
		updates: 'your published updates',
		resources: 'your shared resources'
	};
	const recommendedType = $derived(
		['email_signup', 'membership', 'updates'].find(
			(type) => !blocks.some((block) => block.type === type)
		) || ''
	);
	const setupNotes = $derived({
		gallery: 'Publishes after photos or Instagram posts are available.',
		sponsors: (config.sponsor_items || []).length
			? ''
			: 'Add at least one partner in Details before this publishes.',
		donation: 'Publishes only when fundraising is enabled for this group.',
		events: 'Uses your published rides, volunteer events, and updates.',
		ride_calendar: 'Uses published rides; the full interactive calendar appears on your live site.'
	});

	onMount(() => {
		if (window.matchMedia('(max-width: 639px)').matches) device = 'phone';
		const observer = new IntersectionObserver(
			(entries) => (editorVisible = entries.some((entry) => entry.isIntersecting)),
			{ threshold: 0.05 }
		);
		if (editorRoot) observer.observe(editorRoot);
		return () => observer.disconnect();
	});

	function announce(message) {
		announcement = '';
		requestAnimationFrame(() => (announcement = message));
	}

	function commit(nextBlocks, message, { record = true } = {}) {
		if (record) {
			undoStack = [...undoStack, clone(blocks)].slice(-40);
			redoStack = [];
		}
		onchange(clone(nextBlocks));
		if (message) announce(message);
	}

	function newCustomId(type) {
		sequence += 1;
		return `site-${type.replaceAll('_', '-')}-${Date.now().toString(36)}-${sequence}`;
	}

	function addBlock(type, atIndex = blocks.length) {
		const definition = GROUP_SITE_BLOCK_TYPES[type];
		if (!definition) return;
		const existing = definition.singleton && blocks.find((block) => block.type === type);
		if (existing) {
			selectedId = existing.id;
			mobilePaletteOpen = false;
			mobileInspectorOpen = true;
			announce(`${definition.label} is already on the page.`);
			return;
		}
		if (blocks.length >= GROUP_SITE_BLOCK_LIMIT) {
			announce('This page already has the maximum of 20 sections.');
			return;
		}
		const block = createGroupSiteBlock(type, {
			id: definition.singleton ? '' : newCustomId(type),
			overrides: type === 'ride_calendar' ? { title: config.ride_widget_title } : {}
		});
		if (!block) return;
		const target = Math.max(1, Math.min(atIndex, blocks.length));
		const next = [...blocks];
		next.splice(target, 0, block);
		selectedId = block.id;
		mobilePaletteOpen = false;
		mobileInspectorOpen = true;
		commit(next, `${definition.label} section added.`);
	}

	function removeSelected() {
		if (!selectedBlock || selectedBlock.type === 'hero') return;
		const label = GROUP_SITE_BLOCK_TYPES[selectedBlock.type]?.label || 'Section';
		const next = blocks.filter((block) => block.id !== selectedBlock.id);
		const nextSelection = next[Math.max(0, Math.min(selectedIndex - 1, next.length - 1))];
		selectedId = nextSelection?.id || next[0]?.id || 'site-hero';
		commit(next, `${label} section removed.`);
	}

	function moveBlock(id, insertionIndex) {
		const from = blocks.findIndex((block) => block.id === id);
		if (from <= 0) return;
		const next = [...blocks];
		const [block] = next.splice(from, 1);
		let target = Math.max(1, Math.min(insertionIndex, blocks.length));
		if (from < target) target -= 1;
		next.splice(target, 0, block);
		if (next.every((candidate, index) => candidate.id === blocks[index]?.id)) return;
		commit(next, `${GROUP_SITE_BLOCK_TYPES[block.type]?.label || 'Section'} moved.`);
	}

	function moveSelected(offset) {
		if (selectedIndex <= 0) return;
		const target = selectedIndex + offset;
		if (target < 1 || target >= blocks.length) return;
		const next = [...blocks];
		[next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
		commit(next, `${GROUP_SITE_BLOCK_TYPES[selectedBlock.type]?.label || 'Section'} moved.`);
	}

	function duplicateSelected() {
		if (
			!selectedBlock ||
			GROUP_SITE_BLOCK_TYPES[selectedBlock.type]?.singleton ||
			blocks.length >= GROUP_SITE_BLOCK_LIMIT
		)
			return;
		const duplicate = {
			...clone(selectedBlock),
			id: newCustomId(selectedBlock.type),
			title: selectedBlock.title ? `${selectedBlock.title} copy` : 'Copy'
		};
		const next = [...blocks];
		next.splice(selectedIndex + 1, 0, duplicate);
		selectedId = duplicate.id;
		commit(next, 'Section duplicated.');
	}

	function updateBlock(field, value) {
		if (!selectedBlock) return;
		const next = blocks.map((block) =>
			block.id === selectedBlock.id ? { ...block, [field]: value } : block
		);
		commit(next, '', { record: false });
	}

	function updateConfig(field, value) {
		onconfigchange({ [field]: value });
	}

	function undo() {
		const previous = undoStack.at(-1);
		if (!previous) return;
		redoStack = [...redoStack, clone(blocks)].slice(-40);
		undoStack = undoStack.slice(0, -1);
		onchange(clone(previous));
		if (!previous.some((block) => block.id === selectedId)) selectedId = previous[0]?.id || '';
		announce('Last section change undone.');
	}

	function redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		undoStack = [...undoStack, clone(blocks)].slice(-40);
		redoStack = redoStack.slice(0, -1);
		onchange(clone(next));
		if (!next.some((block) => block.id === selectedId)) selectedId = next[0]?.id || '';
		announce('Section change restored.');
	}

	function beginPaletteDrag(event, type) {
		suppressPaletteClick = true;
		draggedPaletteType = type;
		draggedBlockId = '';
		event.dataTransfer.effectAllowed = 'copy';
		event.dataTransfer.setData('text/plain', `new:${type}`);
	}

	function beginBlockDrag(event, block) {
		if (block.type === 'hero') {
			event.preventDefault();
			return;
		}
		draggedBlockId = block.id;
		draggedPaletteType = '';
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', `block:${block.id}`);
	}

	function handleDrop(event, index) {
		event.preventDefault();
		const payload = event.dataTransfer.getData('text/plain');
		if (payload.startsWith('new:')) addBlock(payload.slice(4), index);
		if (payload.startsWith('block:')) moveBlock(payload.slice(6), index);
		clearDrag();
	}

	function clearDrag() {
		draggedBlockId = '';
		draggedPaletteType = '';
		dropIndex = -1;
		setTimeout(() => (suppressPaletteClick = false), 0);
	}

	function choosePaletteBlock(type) {
		if (suppressPaletteClick) {
			suppressPaletteClick = false;
			return;
		}
		addBlock(type);
	}

	function handleEscape(event) {
		if (event.key !== 'Escape') return;
		mobilePaletteOpen = false;
		mobileInspectorOpen = false;
	}

	function blockHeading(block) {
		if (block.type === 'hero') return config.site_title || group.name || 'Your group';
		if (block.type === 'story') return block.title || 'Who we are';
		if (block.type === 'ride_calendar') return block.title || config.ride_widget_title;
		return block.title || GROUP_SITE_BLOCK_TYPES[block.type]?.label || 'Section';
	}

	function selectBlock(id) {
		selectedId = id;
		mobileInspectorOpen = true;
	}
</script>

<svelte:window onkeydown={handleEscape} />

{#snippet sectionPalette(compact = false)}
	<div class="grid gap-4">
		{#each paletteGroups as paletteGroup}
			<div class="grid gap-2">
				<p class="px-1 text-xs font-semibold tracking-wide uppercase opacity-55">
					{paletteGroup.label}
				</p>
				<div class="grid gap-2 {compact ? 'grid-cols-1 sm:grid-cols-3' : ''}">
					{#each paletteGroup.types as type}
						{@const definition = GROUP_SITE_BLOCK_TYPES[type]}
						{@const existing = definition.singleton && blocks.find((block) => block.type === type)}
						<button
							class="card group flex min-h-20 items-start gap-3 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] {existing
								? 'preset-tonal-primary cursor-pointer'
								: 'preset-tonal-surface cursor-grab active:cursor-grabbing'}"
							type="button"
							draggable={!existing}
							ondragstart={(event) => beginPaletteDrag(event, type)}
							ondragend={clearDrag}
							onclick={() => choosePaletteBlock(type)}
						>
							<span
								class="card preset-tonal-primary p-2 transition-transform duration-200 group-hover:scale-110"
								>{#if existing}<IconCheck class="h-4 w-4" />{:else}<IconPlus
										class="h-4 w-4"
									/>{/if}</span
							>
							<span class="min-w-0 grow">
								<span class="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold"
									>{definition.label}{#if existing}<span
											class="badge preset-tonal-surface text-[0.65rem]">On page</span
										>{/if}</span
								>
								<span class="mt-0.5 block text-xs opacity-55">{definition.description}</span>
								{#if setupNotes[type]}<span class="mt-1 block text-[0.68rem] font-medium opacity-70"
										>{setupNotes[type]}</span
									>{/if}
							</span>
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/snippet}

{#if recommendedType}
	<div class="card preset-tonal-primary mb-4 flex flex-wrap items-center gap-3 p-4">
		<div class="mr-auto max-w-2xl">
			<p class="text-xs font-semibold tracking-wide uppercase opacity-60">Recommended next step</p>
			<p class="font-semibold">{GROUP_SITE_BLOCK_TYPES[recommendedType].label}</p>
			<p class="text-sm opacity-70">{GROUP_SITE_BLOCK_TYPES[recommendedType].description}</p>
		</div>
		<button
			class="btn preset-filled-primary-500"
			type="button"
			onclick={() => addBlock(recommendedType)}
		>
			<IconPlus class="h-4 w-4" /> Add to page
		</button>
	</div>
{/if}

<div
	bind:this={editorRoot}
	class="grid min-w-0 gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] 2xl:grid-cols-[16rem_minmax(0,1fr)_20rem]"
>
	<aside
		class="card preset-tonal-surface order-2 hidden content-start gap-3 p-3 lg:order-1 lg:sticky lg:top-3 lg:grid lg:max-h-[calc(100dvh-1.5rem)] lg:overflow-y-auto"
		aria-label="Section library"
	>
		<div class="px-1">
			<p class="font-semibold">Add a section</p>
			<p class="text-xs opacity-60">Click to add. Drag to choose exactly where it goes.</p>
		</div>
		{@render sectionPalette()}
		{#if blocks.length >= GROUP_SITE_BLOCK_LIMIT}
			<p class="card preset-tonal-warning p-2 text-xs">
				This page has reached its 20-section limit.
			</p>
		{/if}
	</aside>

	<section class="order-1 min-w-0 lg:order-2" aria-label="Website canvas">
		<div class="card preset-tonal-surface overflow-hidden">
			<div class="flex flex-wrap items-center gap-2 p-3">
				<div class="mr-auto flex items-center gap-2">
					<span class="card preset-tonal-primary p-2"><IconLayout class="h-4 w-4" /></span>
					<div>
						<p class="text-sm font-semibold">Live page canvas</p>
						<p class="text-xs opacity-55">Select a section to edit it.</p>
					</div>
				</div>
				<div class="flex gap-1" aria-label="Preview width">
					<button
						class="btn btn-icon btn-sm {device === 'desktop'
							? 'preset-filled-primary-500'
							: 'preset-tonal-surface'}"
						type="button"
						onclick={() => (device = 'desktop')}
						aria-label="Desktop preview"
						aria-pressed={device === 'desktop'}
						><IconMonitor class="h-4 w-4" /><span class="hidden sm:inline">Desktop</span></button
					>
					<button
						class="btn btn-icon btn-sm {device === 'tablet'
							? 'preset-filled-primary-500'
							: 'preset-tonal-surface'}"
						type="button"
						onclick={() => (device = 'tablet')}
						aria-label="Tablet preview"
						aria-pressed={device === 'tablet'}
						><IconLayout class="h-4 w-4" /><span class="hidden sm:inline">Tablet</span></button
					>
					<button
						class="btn btn-icon btn-sm {device === 'phone'
							? 'preset-filled-primary-500'
							: 'preset-tonal-surface'}"
						type="button"
						onclick={() => (device = 'phone')}
						aria-label="Phone preview"
						aria-pressed={device === 'phone'}
						><IconPhone class="h-4 w-4" /><span class="hidden sm:inline">Phone</span></button
					>
				</div>
				<span class="preset-divider-vertical hidden h-7 sm:block"></span>
				<button
					class="btn btn-icon btn-sm preset-tonal-surface"
					type="button"
					onclick={undo}
					disabled={!undoStack.length}
					aria-label="Undo layout change"><IconUndo class="h-4 w-4" /></button
				><button
					class="btn btn-icon btn-sm preset-tonal-surface"
					type="button"
					onclick={redo}
					disabled={!redoStack.length}
					aria-label="Redo layout change"><IconRedo class="h-4 w-4" /></button
				>
			</div>

			<div class="preset-tonal-surface min-h-[42rem] overflow-auto p-2 sm:p-4">
				<div
					class="mx-auto grid overflow-hidden shadow-2xl transition-all duration-500 ease-out {viewportClass}"
					style:--color-primary-500={sitePrimary}
					style:--color-secondary-500={siteSecondary}
					style:--color-tertiary-500={siteAccent}
					style:--site-surface={siteSurface}
					style:--site-text={siteText}
					style:background-color={siteSurface}
					style:color={siteText}
					style:font-family={siteFont}
					class:site-preview-root={true}
					aria-label={`${device} page preview`}
				>
					{#each blocks as block, index (block.id)}
						{#if index > 0}
							<div
								class="grid h-1 place-items-center transition-all duration-200 {dropIndex === index
									? 'preset-filled-primary-500 h-10'
									: draggedBlockId || draggedPaletteType
										? 'preset-tonal-primary h-7'
										: ''}"
								ondragover={(event) => {
									event.preventDefault();
									dropIndex = index;
								}}
								ondragleave={() => (dropIndex = -1)}
								ondrop={(event) => handleDrop(event, index)}
								data-site-drop-index={index}
								role="none"
							>
								{#if draggedBlockId || draggedPaletteType}<span class="text-xs font-semibold"
										>Place section here</span
									>{/if}
							</div>
						{/if}
						<div
							class="site-preview-block group relative cursor-pointer overflow-hidden transition-all duration-300 {selectedBlock?.id ===
							block.id
								? 'ring-primary-500 ring-4 ring-inset'
								: 'hover:ring-primary-500/40 hover:ring-2 hover:ring-inset'} {draggedBlockId ===
							block.id
								? 'scale-[0.98] opacity-40'
								: ''}"
							draggable={block.type !== 'hero'}
							ondragstart={(event) => beginBlockDrag(event, block)}
							ondragend={clearDrag}
							onclick={() => selectBlock(block.id)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									selectBlock(block.id);
								}
							}}
							role="button"
							tabindex="0"
							data-editor-block-id={block.id}
							aria-label={`Edit ${GROUP_SITE_BLOCK_TYPES[block.type]?.label || 'section'}`}
						>
							<div class="absolute top-2 right-2 z-10 flex items-center gap-1">
								<span class="badge preset-tonal-surface text-[0.65rem]">{index + 1}</span>
								{#if block.type !== 'hero'}<span class="card preset-tonal-surface p-1.5"
										><IconGrip class="h-4 w-4" /></span
									>{/if}
							</div>

							{#if block.type === 'hero'}
								<div
									class="relative grid min-h-72 content-end overflow-hidden bg-surface-950 p-6 text-white sm:min-h-[26rem] sm:p-10"
								>
									{#if group.cover_photo_url}<img
											class="absolute inset-0 h-full w-full object-cover opacity-55 transition-transform duration-700 group-hover:scale-105"
											src={group.cover_photo_url}
											alt=""
										/>{/if}
									<div
										class="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/65 to-surface-950/10"
									></div>
									<div class="relative z-10 max-w-3xl">
										<span class="badge preset-tonal-surface mb-4 w-fit"
											>{group.city || 'Local'} community</span
										>
										<div class="flex items-center gap-4">
											{#if group.logo_url}<img
													class="h-14 w-14 object-cover shadow-xl sm:h-20 sm:w-20"
													src={group.logo_url}
													alt=""
												/>{/if}
											<h2 class="text-3xl font-black tracking-tight sm:text-6xl">
												{blockHeading(block)}
											</h2>
										</div>
										<p class="mt-4 max-w-2xl text-base opacity-85 sm:text-lg">
											{config.site_tagline || 'A welcoming cycling community.'}
										</p>
										<div class="mt-6 flex flex-wrap gap-2">
											<span class="btn preset-filled-primary-500">Explore the group</span><span
												class="btn preset-tonal-surface">Upcoming rides</span
											>
										</div>
									</div>
								</div>
							{:else if block.type === 'story'}
								<div class="grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:p-7">
									<span class="card preset-tonal-primary h-fit p-3"
										><IconUsers class="h-5 w-5" /></span
									>
									<div class="grid gap-2">
										<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
											{block.eyebrow}
										</p>
										<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
										<p class="max-w-3xl opacity-70">
											{config.home_intro || 'Tell visitors what makes this group special.'}
										</p>
										<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
											<span class="card preset-tonal-surface p-3 text-sm">When we ride</span><span
												class="card preset-tonal-surface p-3 text-sm">Where we meet</span
											><span class="card preset-tonal-surface p-3 text-sm">Who can join</span>
										</div>
									</div>
								</div>
							{:else if block.type === 'events'}
								<div class="grid gap-4 p-5 sm:p-7">
									<div>
										<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
											{block.eyebrow}
										</p>
										<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
									</div>
									<div class="grid gap-2 sm:grid-cols-3">
										{#each ['Saturday ride', 'Volunteer day', 'Latest update'] as item, itemIndex}<div
												class="card {itemIndex === 0
													? 'preset-tonal-primary'
													: itemIndex === 1
														? 'preset-tonal-tertiary'
														: 'preset-tonal-secondary'} p-3"
											>
												<p class="text-xs opacity-55">Coming up</p>
												<p class="font-semibold">{item}</p>
											</div>{/each}
									</div>
								</div>
							{:else if block.type === 'gallery'}
								<div class="grid gap-4 p-5 sm:p-7">
									<div>
										<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
											{block.eyebrow}
										</p>
										<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
									</div>
									<div class="card preset-tonal-surface flex items-center gap-3 p-4">
										<IconImage class="h-6 w-6 shrink-0 opacity-60" />
										<p class="text-sm">Photos and Instagram posts appear here when available.</p>
									</div>
								</div>
							{:else if block.type === 'ride_calendar'}
								<div class="grid gap-4 p-5 sm:p-7">
									<div class="flex items-center gap-3">
										<span class="card preset-tonal-primary p-3"
											><IconCalendar class="h-5 w-5" /></span
										>
										<div>
											<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
												{block.eyebrow}
											</p>
											<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
										</div>
									</div>
									<div class="card preset-tonal-surface grid gap-2 p-3">
										<div class="grid grid-cols-[5rem_1fr_auto] items-center gap-3 text-sm">
											<span class="badge preset-tonal-primary">SAT 18</span><span
												class="font-semibold">Community ride</span
											><span class="opacity-55">8:00 AM</span>
										</div>
										<div class="grid grid-cols-[5rem_1fr_auto] items-center gap-3 text-sm">
											<span class="badge preset-tonal-secondary">WED 22</span><span
												class="font-semibold">Evening social</span
											><span class="opacity-55">6:00 PM</span>
										</div>
									</div>
								</div>
							{:else if block.type === 'contact'}
								<div class="grid gap-4 p-5 sm:p-7">
									<div>
										<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
											{block.eyebrow}
										</p>
										<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
									</div>
									<div class="flex flex-wrap gap-2">
										<span class="btn preset-tonal-primary"><IconMail class="h-4 w-4" /> Email</span
										><span class="btn preset-tonal-secondary"
											><IconLink class="h-4 w-4" /> Website</span
										>
									</div>
								</div>
							{:else if block.type === 'sponsors'}
								<div class="grid gap-4 p-5 sm:p-7">
									<div>
										<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
											{block.eyebrow}
										</p>
										<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
									</div>
									{#if (config.sponsor_items || []).length}<div
											class="grid grid-cols-2 gap-2 sm:grid-cols-4"
										>
											{#each config.sponsor_items.slice(0, 4) as sponsor}<span
													class="card preset-tonal-surface grid min-h-16 place-items-center p-2 text-center text-xs font-semibold"
													>{sponsor.name || 'Partner'}</span
												>{/each}
										</div>{:else}<p class="card preset-tonal-warning p-4 text-sm">
											Add a partner in Details to publish this section.
										</p>{/if}
								</div>
							{:else if block.type === 'donation'}
								<div class="preset-tonal-primary grid gap-3 p-5 sm:p-7">
									<div class="mr-auto">
										<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
											{block.eyebrow}
										</p>
										<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
									</div>
									<p class="card preset-tonal-warning p-3 text-sm">
										This publishes after fundraising is enabled for the group.
									</p>
								</div>
							{:else}
								<div
									class="grid gap-3 p-5 sm:p-8 {actionBlockTypes.includes(block.type)
										? 'preset-tonal-primary text-center sm:justify-items-center'
										: ''}"
								>
									<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
										{block.eyebrow}
									</p>
									<h2 class="text-2xl font-bold sm:text-3xl">{blockHeading(block)}</h2>
									{#if block.body}<p class="max-w-3xl opacity-70">{block.body}</p>{/if}
									{#if block.button_label}<span class="btn preset-filled-primary-500 w-fit"
											>{block.button_label}</span
										>{/if}
								</div>
							{/if}
						</div>
					{/each}
					<div
						class="grid h-3 place-items-center rounded-full transition-all {dropIndex ===
						blocks.length
							? 'preset-filled-primary-500 h-10'
							: draggedBlockId || draggedPaletteType
								? 'preset-tonal-primary h-7'
								: ''}"
						ondragover={(event) => {
							event.preventDefault();
							dropIndex = blocks.length;
						}}
						ondragleave={() => (dropIndex = -1)}
						ondrop={(event) => handleDrop(event, blocks.length)}
						data-site-drop-index={blocks.length}
						role="none"
					>
						{#if draggedBlockId || draggedPaletteType}<span class="text-xs font-semibold"
								>Place section here</span
							>{/if}
					</div>
				</div>
			</div>
		</div>
	</section>

	{#if mobileInspectorOpen}<button
			class="fixed inset-0 z-[90] bg-surface-950/45 backdrop-blur-sm lg:hidden"
			type="button"
			aria-label="Close section settings"
			onclick={() => (mobileInspectorOpen = false)}
		></button>{/if}
	<div
		class="card preset-tonal-surface order-3 content-start gap-4 p-4 {mobileInspectorOpen
			? 'fixed inset-x-3 bottom-3 z-[100] grid max-h-[calc(100dvh-1.5rem)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl lg:inset-y-3 lg:right-3 lg:left-auto lg:w-[24rem]'
			: 'hidden'} 2xl:sticky 2xl:top-3 2xl:grid 2xl:max-h-none 2xl:overflow-visible"
		aria-label="Section settings"
		role="dialog"
		aria-modal={mobileInspectorOpen ? 'true' : undefined}
	>
		{#if selectedBlock}
			<div class="flex items-start gap-3">
				<span class="card preset-tonal-primary p-2"><IconGrip class="h-4 w-4" /></span>
				<div class="min-w-0 grow">
					<p class="font-semibold">{GROUP_SITE_BLOCK_TYPES[selectedBlock.type]?.label}</p>
					<p class="text-xs opacity-55">Section {selectedIndex + 1} of {blocks.length}</p>
				</div>
				<button
					class="btn btn-sm preset-tonal-surface 2xl:hidden"
					type="button"
					onclick={() => (mobileInspectorOpen = false)}>Done</button
				>
			</div>

			<div class="flex gap-1">
				<button
					class="btn btn-sm preset-tonal-surface grow"
					type="button"
					onclick={() => moveSelected(-1)}
					disabled={selectedIndex <= 1}><IconArrowUp class="h-4 w-4" /> Up</button
				><button
					class="btn btn-sm preset-tonal-surface grow"
					type="button"
					onclick={() => moveSelected(1)}
					disabled={selectedIndex <= 0 || selectedIndex >= blocks.length - 1}
					>Down <IconArrowDown class="h-4 w-4" /></button
				>
			</div>

			<div class="preset-divider-top grid gap-3 pt-4">
				{#if selectedBlock.type === 'hero'}
					<label class="label"
						><span>Website title</span><input
							class="input"
							value={config.site_title || ''}
							maxlength="120"
							oninput={(event) => updateConfig('site_title', event.currentTarget.value)}
						/></label
					><label class="label"
						><span>One-line promise</span><textarea
							class="textarea"
							rows="3"
							maxlength="180"
							value={config.site_tagline || ''}
							oninput={(event) => updateConfig('site_tagline', event.currentTarget.value)}
						></textarea></label
					>
					<p class="card preset-tonal-surface p-3 text-xs opacity-65">
						The hero stays first so every page has a clear introduction.
					</p>
				{:else}
					<label class="label"
						><span>Small label</span><input
							class="input"
							value={selectedBlock.eyebrow || ''}
							maxlength="80"
							oninput={(event) => updateBlock('eyebrow', event.currentTarget.value)}
						/></label
					><label class="label"
						><span>Heading</span><input
							class="input"
							value={selectedBlock.title || ''}
							maxlength="140"
							oninput={(event) => {
								updateBlock('title', event.currentTarget.value);
								if (selectedBlock.type === 'ride_calendar')
									updateConfig('ride_widget_title', event.currentTarget.value);
							}}
						/></label
					>
					{#if selectedBlock.type === 'story'}
						<label class="label"
							><span>Welcome message</span><textarea
								class="textarea min-h-32"
								maxlength="1400"
								value={config.home_intro || ''}
								oninput={(event) => updateConfig('home_intro', event.currentTarget.value)}
							></textarea></label
						>
					{:else if selectedBlock.type === 'text' || actionBlockTypes.includes(selectedBlock.type)}
						<label class="label"
							><span>Body</span><textarea
								class="textarea min-h-32"
								maxlength="1200"
								value={selectedBlock.body || ''}
								oninput={(event) => updateBlock('body', event.currentTarget.value)}
							></textarea></label
						>
						{#if actionBlockTypes.includes(selectedBlock.type)}
							<label class="label"
								><span>Button label</span><input
									class="input"
									maxlength="80"
									value={selectedBlock.button_label || ''}
									oninput={(event) => updateBlock('button_label', event.currentTarget.value)}
								/></label
							>
							{#if selectedBlock.type === 'call_to_action'}<label class="label"
									><span>Button destination</span><input
										class="input"
										value={selectedBlock.button_url || ''}
										placeholder="https://example.org or /rides"
										oninput={(event) => updateBlock('button_url', event.currentTarget.value)}
									/></label
								>{:else if selectedBlock.type === 'email_signup'}<p
									class="card preset-tonal-primary p-3 text-xs"
								>
									A consent checkbox and working email signup form are added automatically. You can
									include these subscribers from the desktop Email Studio.
								</p>{:else}<p class="card preset-tonal-primary p-3 text-xs">
									The button automatically opens {automaticDestination[selectedBlock.type] ||
										'the right page'}.
								</p>{/if}
						{/if}
					{/if}
				{/if}
			</div>

			{#if selectedBlock.type !== 'hero'}
				<div class="preset-divider-top flex gap-2 pt-4">
					{#if !GROUP_SITE_BLOCK_TYPES[selectedBlock.type]?.singleton}
						<button
							class="btn btn-sm preset-tonal-surface grow"
							type="button"
							disabled={blocks.length >= GROUP_SITE_BLOCK_LIMIT}
							onclick={duplicateSelected}><IconCopy class="h-4 w-4" /> Duplicate</button
						>
					{/if}
					<button class="btn btn-sm preset-tonal-error grow" type="button" onclick={removeSelected}
						><IconTrash class="h-4 w-4" /> Remove</button
					>
				</div>
			{/if}
		{/if}
	</div>
</div>

{#if editorVisible && !mobilePaletteOpen && !mobileInspectorOpen}<button
		class="btn preset-filled-primary-500 fixed bottom-28 left-4 z-40 shadow-2xl lg:hidden"
		type="button"
		onclick={() => (mobilePaletteOpen = true)}
		aria-expanded={mobilePaletteOpen}
	>
		<IconPanelsTopLeft class="h-5 w-5" /> Add section
	</button>{/if}

{#if mobilePaletteOpen}
	<button
		class="fixed inset-0 z-[90] bg-surface-950/45 backdrop-blur-sm lg:hidden"
		type="button"
		aria-label="Close section library"
		onclick={() => (mobilePaletteOpen = false)}
	></button>
	<div
		class="card preset-tonal-surface fixed inset-x-3 bottom-3 z-[100] grid max-h-[78dvh] gap-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl lg:hidden"
		aria-label="Add page sections"
		role="dialog"
		aria-modal="true"
	>
		<div class="flex items-start gap-3">
			<div class="grow">
				<p class="font-semibold">Add a section</p>
				<p class="text-xs opacity-60">
					Tap to add. On a phone, reorder with Up and Down; precise drag placement is desktop-only.
				</p>
			</div>
			<button
				class="btn btn-icon btn-sm preset-tonal-surface"
				type="button"
				aria-label="Close section library"
				onclick={() => (mobilePaletteOpen = false)}><IconX class="h-4 w-4" /></button
			>
		</div>
		{@render sectionPalette(true)}
	</div>
{/if}

<p class="sr-only" aria-live="polite">{announcement}</p>

<style>
	.site-preview-block {
		background: var(--site-surface);
		color: var(--site-text);
	}

	.site-preview-root :global(h2),
	.site-preview-root :global(p) {
		color: inherit;
	}

	.site-preview-root :global(.preset-tonal-surface) {
		background: color-mix(in srgb, var(--site-surface) 90%, var(--site-text));
		color: var(--site-text);
	}
</style>
