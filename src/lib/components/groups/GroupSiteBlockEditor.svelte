<script>
	import { onMount } from 'svelte';
	import IconArrowDown from '@lucide/svelte/icons/arrow-down';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUp from '@lucide/svelte/icons/arrow-up';
	import IconCalendar from '@lucide/svelte/icons/calendar-days';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconGrip from '@lucide/svelte/icons/grip-vertical';
	import IconImage from '@lucide/svelte/icons/image';
	import IconLayout from '@lucide/svelte/icons/layout-template';
	import IconLink from '@lucide/svelte/icons/link';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconMonitor from '@lucide/svelte/icons/monitor';
	import IconPhone from '@lucide/svelte/icons/smartphone';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconPanelsTopLeft from '@lucide/svelte/icons/panels-top-left';
	import IconX from '@lucide/svelte/icons/x';
	import IconRedo from '@lucide/svelte/icons/redo-2';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconTrash from '@lucide/svelte/icons/trash';
	import IconUndo from '@lucide/svelte/icons/undo-2';
	import IconUsers from '@lucide/svelte/icons/users';
	import { buildContactLinks, selectPrimaryCta } from '#lib/groups/contactLinks';
	import { safeNavigationUrl } from '#lib/security/urls.js';
	import {
		createGroupSiteBlock,
		GROUP_SITE_BLOCK_LIMIT,
		GROUP_SITE_BLOCK_TYPES,
		getGroupSiteBlockTone
	} from '#lib/microsites/blocks';

	/** @type {Record<string, any>} */
	let {
		blocks = [],
		config = {},
		group = {},
		page = null,
		onchange = () => {},
		onconfigchange = () => {},
		onpagechange = () => {},
		oneditcore = null
	} = $props();

	const clone = (value) => JSON.parse(JSON.stringify(value));
	let selectedId = $state('site-hero');
	/** @type {any} */
	let undoStack = $state([]);
	/** @type {any} */
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

	function previewToneClass(block, index) {
		const tone = getGroupSiteBlockTone(block.type, index);
		return tone === 'surface'
			? 'preset-tonal-surface'
			: `preset-tonal-surface preset-outlined-${tone}-500`;
	}

	const selectedBlock = $derived(
		blocks.find((block) => block.id === selectedId) || blocks[0] || null
	);
	const selectedIndex = $derived(
		selectedBlock ? blocks.findIndex((block) => block.id === selectedBlock.id) : -1
	);
	const viewportClass = $derived(
		device === 'phone' ? 'max-w-[24rem]' : device === 'tablet' ? 'max-w-[48rem]' : 'max-w-[72rem]'
	);
	const isPhonePreview = $derived(device === 'phone');
	const isHomePage = $derived(page?.is_home !== false);
	const previewHeroStyle = $derived(config.hero_style || 'immersive');
	const isTbagPreview = $derived(config.site_variant === 'tbag');
	const previewLocation = $derived([group?.city, group?.state_region].filter(Boolean).join(', '));
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
	const isThreeFeetPlease = $derived(group?.slug === '3-feet-please');
	function heroPreviewActions(heroBlock) {
		const configuredHeroLabel = String(heroBlock?.button_label || '').trim();
		if (configuredHeroLabel) {
			const actions = [configuredHeroLabel];
			if (isThreeFeetPlease && isHomePage) actions.push('Find your community');
			return actions;
		}
		if (!isHomePage) return [];
		if (isThreeFeetPlease) return ['Explore safety resources', 'Find your community'];
		const actions = [];
		const primaryCta = selectPrimaryCta(group, buildContactLinks(group));
		if (primaryCta?.label) {
			actions.push(primaryCta.label);
		} else if (safeNavigationUrl(group?.website_url)) {
			actions.push('Website');
		}
		for (const candidate of blocks) {
			if (!actionBlockTypes.includes(candidate?.type)) continue;
			const label = String(candidate?.button_label || '').trim();
			if (label && !actions.includes(label)) actions.push(label);
			if (actions.length >= 2) break;
		}
		if (!actions.length) actions.push('Explore the group');
		return actions.slice(0, 2);
	}
	const previewFacts = $derived.by(() => {
		if (isTbagPreview) {
			return [
				{ label: 'Focus', value: 'Safer streets and better bicycling' },
				{ label: 'Based in', value: previewLocation || 'Tempe, Arizona' },
				{ label: 'Organization', value: 'Tempe-based 501(c)(3)' },
				{ label: 'Get involved', value: 'Find your next step' }
			];
		}
		const facts = [];
		const addFact = (label, value) => {
			const text = String(value || '').trim();
			if (text) facts.push({ label, value: text });
		};
		addFact('When we ride', group?.activity_frequency);
		addFact('Where we meet', group?.specific_meeting_point_address || previewLocation);
		addFact('Who can join', group?.audience_focus);
		addFact('How to join', group?.how_to_join_instructions || group?.membership_info);
		addFact('Typical schedule', group?.typical_activity_day_time);
		addFact('Primary discipline', group?.primary_discipline);
		addFact('Typical skill level', group?.typical_skill_level);
		addFact('ZIP code', group?.zip_code);
		const websiteHref = safeNavigationUrl(group?.website_url);
		if (websiteHref) addFact('Website', websiteHref.replace(/^https?:\/\//, ''));
		addFact('Email', group?.public_contact_email);
		addFact('Phone', group?.public_phone_number);
		addFact('Best way to reach us', group?.preferred_contact_method_instructions);
		if (facts.length) return facts;
		return [
			{ label: 'When we ride', value: 'Weekly rides' },
			{ label: 'Where we meet', value: previewLocation || 'Shared in ride details' },
			{ label: 'Who can join', value: 'Anyone on two wheels' }
		];
	});
	const paletteGroups = $derived([
		{
			label: 'Grow your community',
			types: ['email_signup', 'membership', 'volunteer', 'donation']
		},
		{ label: 'Keep people informed', types: ['events', 'ride_calendar', 'updates'] },
		{
			label: 'Tell your story',
			types: ['story', 'gallery', 'text', ...(isThreeFeetPlease ? ['law_directory'] : [])]
		},
		{ label: 'Useful next steps', types: ['contact', 'sponsors', 'resources', 'call_to_action'] }
	]);
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
		if (block.type === 'hero') return group.name || config.site_title || 'Your group';
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
		class="card preset-tonal-surface order-2 hidden content-start gap-3 p-3 lg:sticky lg:top-3 lg:order-1 lg:grid lg:max-h-[calc(100dvh-1.5rem)] lg:overflow-y-auto"
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
								{@const previewHeroTitle =
									block.title ||
									(isHomePage ? blockHeading(block) : page?.title || blockHeading(block))}
								{@const previewHeroTagline = isHomePage
									? group.tagline || config.site_tagline || 'A welcoming cycling community.'
									: page?.description ||
										group.tagline ||
										config.site_tagline ||
										'Add a short introduction for this page.'}
								{@const previewActions = heroPreviewActions(block)}
								{#if previewHeroStyle === 'bold'}
									<div
										class="bg-surface-950 relative grid overflow-hidden text-white {isPhonePreview
											? 'min-h-72 p-5'
											: 'min-h-80 p-6 sm:aspect-[21/9] sm:p-10'}"
										data-preview-hero-style="bold"
									>
										<div
											class="absolute inset-0 [background:linear-gradient(105deg,color-mix(in_oklab,var(--color-primary-500)_10%,var(--color-surface-950))_0%,color-mix(in_oklab,var(--color-surface-950)_95%,transparent)_55%)] {isPhonePreview
												? '[clip-path:polygon(0_0,70%_0,55%_100%,0_100%)]'
												: '[clip-path:polygon(0_0,60%_0,45%_100%,0_100%)]'}"
										></div>
										<div
											class="absolute inset-0 {isPhonePreview
												? '[clip-path:polygon(65%_0,100%_0,100%_100%,50%_100%)]'
												: '[clip-path:polygon(55%_0,100%_0,100%_100%,40%_100%)]'}"
										>
											{#if group.cover_photo_url}<img
													class="h-full w-full object-cover"
													src={group.cover_photo_url}
													alt=""
												/>{:else}<div
													class="from-secondary-500/30 via-tertiary-500/25 to-primary-500/30 h-full w-full bg-gradient-to-br"
												></div>{/if}
										</div>
										<div class="relative z-10 flex h-full min-w-0 items-end">
											<div
												class="min-w-0 border [border-color:color-mix(in_oklab,var(--color-surface-50)_12%,transparent)] [background:color-mix(in_oklab,var(--color-surface-950)_86%,transparent)] {isPhonePreview
													? 'w-full p-5'
													: 'max-w-[37.5rem] p-6'}"
											>
												<span class="badge preset-tonal-surface inline-flex items-center gap-1.5"
													>{#if previewLocation && isHomePage}<IconMapPin
															class="h-3 w-3 shrink-0"
														/>{/if}{isHomePage
														? previewLocation || `${group.city || 'Local'} community`
														: 'Website page'}</span
												>
												<div class="mt-4 flex min-w-0 items-start gap-4">
													{#if group.logo_url}<img
															class="shrink-0 object-cover shadow-xl {isPhonePreview
																? 'h-14 w-14'
																: 'h-14 w-14 sm:h-20 sm:w-20'}"
															src={group.logo_url}
															alt=""
														/>{/if}
													<h2
														class="min-w-0 font-black tracking-tight break-words {isPhonePreview
															? 'text-[2rem] leading-[0.95]'
															: 'text-4xl leading-[0.92] sm:text-5xl'}"
													>
														{previewHeroTitle}
													</h2>
												</div>
												<p
													class="mt-4 max-w-xl break-words opacity-90 {isPhonePreview
														? 'text-base'
														: 'text-base sm:text-lg'}"
												>
													{previewHeroTagline}
												</p>
												{#if previewActions.length}
													<div class="mt-6 flex min-w-0 flex-wrap items-center gap-2">
														{#each previewActions as actionLabel, actionIndex}
															<span
																class="btn max-w-full gap-2 {isPhonePreview
																	? 'btn-sm whitespace-normal'
																	: 'whitespace-nowrap'} {actionIndex === 0
																	? 'preset-filled-primary-500'
																	: 'preset-tonal-surface'}"
															>
																<span class="min-w-0 [overflow-wrap:anywhere] break-words"
																	>{actionLabel}</span
																>
																<IconArrowRight class="h-4 w-4 shrink-0" />
															</span>
														{/each}
													</div>
												{/if}
											</div>
										</div>
									</div>
								{:else if previewHeroStyle === 'orbit'}
									<div
										class="bg-surface-950 relative grid overflow-hidden text-white {isPhonePreview
											? 'min-h-72 p-5'
											: 'min-h-80 p-5 sm:aspect-[21/9] sm:p-8'}"
										data-preview-hero-style="orbit"
									>
										{#if group.cover_photo_url}<img
												class="absolute inset-0 h-full w-full object-cover opacity-55"
												src={group.cover_photo_url}
												alt=""
											/>{:else}<div
												class="from-primary-500/25 via-surface-500/10 to-secondary-500/25 absolute inset-0 bg-gradient-to-br"
											></div>{/if}
										<div
											class="from-surface-950/80 via-surface-950/50 to-surface-950/70 absolute inset-0 bg-gradient-to-b"
										></div>
										<div class="relative z-10 flex h-full min-w-0 items-center justify-center">
											<div
												class="border-surface-50/15 bg-surface-950/75 w-full max-w-xl min-w-0 border text-center {isPhonePreview
													? 'px-4 py-6'
													: 'px-6 py-8'}"
											>
												<div class="flex min-w-0 flex-col items-center">
													{#if group.logo_url}<img
															class="object-cover shadow-2xl {isPhonePreview
																? 'h-16 w-16'
																: 'h-16 w-16 sm:h-20 sm:w-20'}"
															src={group.logo_url}
															alt=""
														/>{/if}
													<p
														class="mt-3 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.3em] uppercase opacity-70"
													>
														{#if previewLocation && isHomePage}<IconMapPin
																class="h-3 w-3 shrink-0"
															/>{/if}{isHomePage
															? previewLocation || `${group.city || 'Local'} community`
															: 'Website page'}
													</p>
													<h2
														class="mt-3 max-w-full font-black tracking-tight break-words {isPhonePreview
															? 'text-3xl leading-[0.95]'
															: 'text-3xl leading-[0.95] sm:text-5xl'}"
													>
														{previewHeroTitle}
													</h2>
													<p class="mt-3 max-w-md text-base leading-relaxed break-words opacity-85">
														{previewHeroTagline}
													</p>
												</div>
												{#if previewActions.length}
													<div
														class="mt-6 flex min-w-0 flex-wrap items-center justify-center gap-2"
													>
														{#each previewActions as actionLabel, actionIndex}
															<span
																class="btn max-w-full gap-2 {isPhonePreview
																	? 'btn-sm whitespace-normal'
																	: 'whitespace-nowrap'} {actionIndex === 0
																	? 'preset-filled-primary-500'
																	: 'preset-tonal-secondary'}"
															>
																<span class="min-w-0 [overflow-wrap:anywhere] break-words"
																	>{actionLabel}</span
																>
																<IconArrowRight class="h-4 w-4 shrink-0" />
															</span>
														{/each}
													</div>
												{/if}
											</div>
										</div>
									</div>
								{:else}
									<div
										class="bg-surface-950 relative grid overflow-hidden text-white {isPhonePreview
											? 'min-h-72 p-5'
											: 'min-h-80 p-5 sm:aspect-[21/9] sm:p-8'}"
										data-preview-hero-style="immersive"
									>
										{#if group.cover_photo_url}<img
												class="absolute inset-0 h-full w-full object-cover opacity-65 transition-transform duration-700 group-hover:scale-105"
												src={group.cover_photo_url}
												alt=""
											/>{:else}<div
												class="from-primary-500/30 via-secondary-500/20 to-tertiary-500/30 absolute inset-0 bg-gradient-to-br"
											></div>{/if}
										<div
											class="from-surface-950 via-surface-950/65 to-surface-950/10 absolute inset-0 bg-gradient-to-t"
										></div>
										<div class="relative z-10 flex h-full min-w-0 flex-col justify-end gap-5">
											<div class="flex min-w-0 items-start gap-4">
												{#if group.logo_url}<img
														class="shrink-0 object-cover shadow-xl {isPhonePreview
															? 'h-16 w-16'
															: 'h-16 w-16 sm:h-20 sm:w-20'}"
														src={group.logo_url}
														alt=""
													/>{:else}<div
														class="from-primary-500 to-secondary-500 flex shrink-0 items-center justify-center bg-gradient-to-br shadow-2xl {isPhonePreview
															? 'h-16 w-16'
															: 'h-16 w-16 sm:h-20 sm:w-20'}"
													>
														<IconUsers class="h-7 w-7 text-white/80" />
													</div>{/if}
												<div class="min-w-0 pb-0.5">
													<p
														class="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-[0.25em] uppercase opacity-75"
													>
														{#if previewLocation && isHomePage}<IconMapPin
																class="h-3 w-3 shrink-0"
															/>{/if}{isHomePage
															? previewLocation || `${group.city || 'Local'} community`
															: 'Website page'}
													</p>
													<h2
														class="leading-tight font-black tracking-tight break-words {isPhonePreview
															? 'text-3xl'
															: 'text-3xl sm:text-5xl'}"
													>
														{previewHeroTitle}
													</h2>
												</div>
											</div>
											<div
												class="flex min-w-0 flex-col gap-4 {isPhonePreview
													? ''
													: 'sm:flex-row sm:items-end sm:justify-between'}"
											>
												<p
													class="max-w-xl leading-relaxed break-words opacity-90 {isPhonePreview
														? 'text-base'
														: 'text-lg sm:text-xl'}"
												>
													{previewHeroTagline}
												</p>
												{#if previewActions.length}
													<div
														class="flex max-w-full min-w-0 flex-wrap items-center gap-2 {isPhonePreview
															? ''
															: 'sm:flex-nowrap sm:gap-3'}"
													>
														{#each previewActions as actionLabel, actionIndex}
															<span
																class="btn max-w-full gap-2 {isPhonePreview
																	? 'btn-sm whitespace-normal'
																	: 'btn-sm sm:btn-base whitespace-nowrap'} {actionIndex === 0
																	? 'preset-filled-primary-500'
																	: 'preset-tonal-tertiary'}"
															>
																<span class="min-w-0 [overflow-wrap:anywhere] break-words"
																	>{actionLabel}</span
																>
																<IconArrowRight class="h-4 w-4 shrink-0" />
															</span>
														{/each}
													</div>
												{/if}
											</div>
										</div>
									</div>
								{/if}
							{:else if block.type === 'story'}
								<div
									class="grid min-w-0 gap-4 {isPhonePreview
										? 'p-5'
										: 'p-5 sm:grid-cols-[auto_1fr] sm:p-7'}"
								>
									<span class="card preset-tonal-primary h-fit w-fit p-3"
										><IconUsers class="h-5 w-5" /></span
									>
									<div class="grid min-w-0 gap-2">
										<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
											{block.eyebrow}
										</p>
										<h2 class="text-2xl font-bold break-words">{blockHeading(block)}</h2>
										<p class="max-w-3xl [overflow-wrap:anywhere] break-words opacity-70">
											{group.description ||
												config.home_intro ||
												'Tell visitors what makes this group special.'}
										</p>
										<div
											class="mt-2 grid gap-2 {isPhonePreview
												? isTbagPreview
													? 'grid-cols-[repeat(2,minmax(0,1fr))]'
													: 'grid-cols-[minmax(0,1fr)]'
												: device === 'tablet'
													? 'grid-cols-[repeat(2,minmax(0,1fr))]'
													: 'grid-cols-[repeat(2,minmax(0,1fr))] md:grid-cols-[repeat(4,minmax(0,1fr))]'}"
											data-preview-facts-grid
										>
											{#each previewFacts as fact}
												<div class="card preset-tonal-surface min-w-0 p-3 text-sm">
													<p
														class="text-[0.6875rem] font-semibold tracking-[0.15em] uppercase opacity-70"
													>
														{fact.label}
													</p>
													<p class="mt-1 min-w-0 leading-snug [overflow-wrap:anywhere] break-words">
														{fact.value}
													</p>
												</div>
											{/each}
										</div>
									</div>
								</div>
							{:else if block.type === 'events'}
								<div class="grid gap-4 {isPhonePreview ? 'p-5' : 'p-5 sm:p-7'}">
									<div>
										<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
											{block.eyebrow}
										</p>
										<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
									</div>
									<div class="grid gap-2 {isPhonePreview ? 'grid-cols-1' : 'sm:grid-cols-3'}">
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
								<div class="grid gap-4 {isPhonePreview ? 'p-5' : 'p-5 sm:p-7'}">
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
								<div class="grid gap-4 {isPhonePreview ? 'p-5' : 'p-5 sm:p-7'}">
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
								<div class="grid gap-4 {isPhonePreview ? 'p-5' : 'p-5 sm:p-7'}">
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
								<div class="grid gap-4 {isPhonePreview ? 'p-5' : 'p-5 sm:p-7'}">
									<div>
										<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
											{block.eyebrow}
										</p>
										<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
									</div>
									{#if (config.sponsor_items || []).length}<div
											class="grid grid-cols-2 gap-2 {isPhonePreview ? '' : 'sm:grid-cols-4'}"
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
								<div
									class="preset-tonal-primary grid gap-3 {isPhonePreview ? 'p-5' : 'p-5 sm:p-7'}"
								>
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
							{:else if block.type === 'law_directory'}
								<div class="grid gap-4 {isPhonePreview ? 'p-5' : 'p-5 sm:p-7'}">
									<div class="flex items-start gap-3">
										<span class="card preset-tonal-primary p-3"><IconSearch class="h-5 w-5" /></span
										>
										<div>
											<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
												{block.eyebrow}
											</p>
											<h2 class="text-2xl font-bold">{blockHeading(block)}</h2>
											<p class="mt-1 text-sm opacity-65">{block.body}</p>
										</div>
									</div>
									<div class="input flex items-center gap-2 opacity-75">
										<IconSearch class="h-4 w-4" />
										<span>Search by state or statute</span>
									</div>
									<div class="grid gap-2 {isPhonePreview ? 'grid-cols-1' : 'sm:grid-cols-2'}">
										{#each ['Arizona · 3 feet', 'Massachusetts · 4 feet', 'Texas · no specific law'] as item}
											<div class="card preset-tonal-surface p-3 text-sm font-semibold">{item}</div>
										{/each}
									</div>
								</div>
							{:else}
								<div
									class="grid min-w-0 gap-3 {isPhonePreview
										? 'p-5'
										: 'p-5 sm:p-8'} {actionBlockTypes.includes(block.type)
										? `${previewToneClass(block, index)} text-center ${isPhonePreview ? 'justify-items-center' : 'sm:justify-items-center'}`
										: ''}"
								>
									<p class="text-xs font-semibold tracking-wider uppercase opacity-55">
										{block.eyebrow}
									</p>
									<h2
										class="font-bold break-words {isPhonePreview
											? 'text-2xl'
											: 'text-2xl sm:text-3xl'}"
									>
										{blockHeading(block)}
									</h2>
									{#if block.body}<p class="max-w-3xl break-words opacity-70">{block.body}</p>{/if}
									{#if block.button_label}<span
											class="btn preset-filled-primary-500 w-fit max-w-full {isPhonePreview
												? 'whitespace-normal'
												: ''}"
											><span class="min-w-0 [overflow-wrap:anywhere] break-words"
												>{block.button_label}</span
											></span
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
			class="bg-surface-950/45 fixed inset-0 z-[90] backdrop-blur-sm lg:hidden"
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
					{#if page?.is_home === false}
						<label class="label"
							><span>Page title</span><input
								class="input"
								value={page.title || ''}
								maxlength="120"
								oninput={(event) => onpagechange({ title: event.currentTarget.value })}
							/></label
						><label class="label"
							><span>Page introduction</span><textarea
								class="textarea"
								rows="3"
								maxlength={360}
								value={page.description || ''}
								oninput={(event) => onpagechange({ description: event.currentTarget.value })}
							></textarea></label
						>
					{:else}
						<div class="border-surface-700 bg-surface-950 grid gap-2 border p-3 text-xs">
							<p class="text-surface-100 font-semibold">Synced with Core Profile</p>
							<p class="text-surface-300 leading-relaxed">
								Your homepage hero automatically uses your group name, tagline, logo, cover photo,
								and primary call-to-action so the directory listing and custom website stay in sync.
							</p>
							{#if oneditcore}
								<button
									class="btn btn-sm preset-outlined-primary-500 mt-1 w-fit"
									type="button"
									onclick={() => oneditcore()}
								>
									Edit Core Profile
								</button>
							{/if}
						</div>
					{/if}
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
						<div class="border-surface-700 bg-surface-950 grid gap-2 border p-3 text-xs">
							<p class="text-surface-100 font-semibold">Story text comes from Core Profile</p>
							<p class="text-surface-300 leading-relaxed">
								This section displays your group description, schedule, meeting area, and join
								details from Core Profile.
							</p>
							{#if oneditcore}
								<button
									class="btn btn-sm preset-outlined-primary-500 mt-1 w-fit"
									type="button"
									onclick={() => oneditcore()}
								>
									Edit Core Profile
								</button>
							{/if}
						</div>
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
		class="bg-surface-950/45 fixed inset-0 z-[90] backdrop-blur-sm lg:hidden"
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
