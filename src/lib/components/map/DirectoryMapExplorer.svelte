<script lang="ts">
	import { tick } from 'svelte';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconMinimize2 from '@lucide/svelte/icons/minimize-2';
	import IconX from '@lucide/svelte/icons/x';
	import AccessibleMapShell from '#lib/components/map/AccessibleMapShell.svelte';
	import {
		buildUniqueMarkerLabels,
		formatClusterAriaLabel,
		isValidLatLng,
		parseCoordinate
	} from '#lib/map/leaflet';
	import type {
		ClusterNode,
		LeafletLayerInstance,
		LeafletMapInstance,
		LeafletMarkerInstance,
		LeafletModule
	} from '#lib/map/types';

	type SurfaceContext = {
		map: LeafletMapInstance;
		L: LeafletModule;
		layer: LeafletLayerInstance;
		markers: Map<string, LeafletMarkerInstance>;
	};

	export type DirectoryMapItem = {
		id: string | number;
		lat: number | string;
		lng: number | string;
		title: string;
		subtitle?: string;
		meta?: string;
		badge?: string;
		href: string;
		ctaLabel?: string;
		external?: boolean;
		accentColor?: string;
		markerLabel?: string;
	};

	type RegionLabelProps =
		{ regionLabel: string; labelledBy?: string } | { regionLabel?: string; labelledBy: string };

	type Props = RegionLabelProps & {
		items?: DirectoryMapItem[];
		itemNounSingular?: string;
		itemNounPlural?: string;
		cluster?: boolean;
		scrollWheelZoom?: boolean;
		defaultCenter?: [number, number];
		defaultZoom?: number;
		shellClass?: string;
		canvasClass?: string;
		variant?: 'default' | 'widget';
		idlePrompt?: string;
		emptyMessage?: string;
		footerHint?: string;
		expandable?: boolean;
		expanded?: boolean;
		expandedTitle?: string;
	};

	let {
		regionLabel,
		labelledBy,
		items = [],
		itemNounSingular = 'listing',
		itemNounPlural = 'listings',
		cluster = true,
		scrollWheelZoom = true,
		defaultCenter = [37.8, -96],
		defaultZoom = 4,
		shellClass = '',
		canvasClass = 'h-[480px] w-full',
		variant = 'default',
		idlePrompt = '',
		emptyMessage = '',
		footerHint = '',
		expandable = false,
		expanded = $bindable(false),
		expandedTitle = 'Expanded map view'
	}: Props = $props();

	const uid = $props.id();
	const inlineInspectorId = `${uid}-inspector`;
	const modalInspectorId = `${uid}-modal-inspector`;
	const modalTitleId = `${uid}-modal-title`;

	let selectedId = $state<string | null>(null);

	let inlineCtx = $state<SurfaceContext | null>(null);
	let modalCtx = $state<SurfaceContext | null>(null);

	let dialogEl = $state<HTMLDivElement | null>(null);
	let modalCloseBtn = $state<HTMLButtonElement | null>(null);
	let previousFocusEl: HTMLElement | null = null;

	const validItems = $derived(
		(items ?? []).filter((item) => item && isValidLatLng(item.lat, item.lng))
	);

	const uniqueLabels = $derived(buildUniqueMarkerLabels(validItems, itemNounSingular));

	const selectedItem = $derived(
		selectedId === null ? null : (validItems.find((item) => String(item.id) === selectedId) ?? null)
	);

	$effect(() => {
		if (selectedId !== null && !validItems.some((item) => String(item.id) === selectedId)) {
			selectedId = null;
		}
	});

	const resolvedIdlePrompt = $derived(
		idlePrompt ||
			`Select a ${itemNounSingular} marker on the map to read details and open the listing.`
	);

	const resolvedEmptyMessage = $derived(
		emptyMessage || `No ${itemNounPlural} with mapped coordinates match the current filters.`
	);

	function createPinSvgMarkup() {
		return `<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><rect x="9" y="7" width="6" height="6"/></svg>`;
	}

	function createInteractivePinIcon(
		L: LeafletModule,
		opts: {
			itemId: string;
			ariaLabel: string;
			controlsId: string;
			accentColor?: string;
		}
	) {
		const PinIcon = L.Icon.extend({
			options: {
				className: 'map-pin-btn',
				iconSize: variant === 'widget' ? [32, 32] : [36, 36],
				iconAnchor: variant === 'widget' ? [16, 16] : [18, 18]
			},
			createIcon(this: { _setIconStyles: (el: HTMLElement, name: string) => void }) {
				const btn = document.createElement('button');
				btn.type = 'button';
				const isSelected = selectedId === opts.itemId;
				this._setIconStyles(btn, 'icon');
				btn.classList.add('map-pin-btn');
				if (opts.accentColor) {
					btn.classList.add('has-custom-accent');
					btn.style.setProperty('--pin-accent', opts.accentColor);
				}
				if (isSelected) {
					btn.classList.add('is-selected');
				}
				btn.setAttribute('aria-label', opts.ariaLabel);
				btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
				btn.setAttribute('aria-controls', opts.controlsId);
				btn.dataset.mapItemId = opts.itemId;
				btn.innerHTML = createPinSvgMarkup();
				return btn;
			},
			createShadow() {
				return null;
			}
		});
		return new PinIcon();
	}

	function createClusterButtonIcon(L: LeafletModule, count: number) {
		const label = formatClusterAriaLabel(count, itemNounSingular, itemNounPlural);
		const ClusterIcon = L.Icon.extend({
			options: {
				className: 'map-cluster-btn',
				iconSize: [40, 40],
				iconAnchor: [20, 20]
			},
			createIcon(this: { _setIconStyles: (el: HTMLElement, name: string) => void }) {
				const btn = document.createElement('button');
				btn.type = 'button';
				this._setIconStyles(btn, 'icon');
				btn.classList.add('map-cluster-btn');
				btn.setAttribute('aria-label', label);
				// Prevent duplicate activation on Enter when native button dispatches click
				btn.addEventListener('keypress', (event) => {
					event.stopPropagation();
				});
				const span = document.createElement('span');
				span.setAttribute('aria-hidden', 'true');
				span.textContent = String(count);
				btn.appendChild(span);
				return btn;
			},
			createShadow() {
				return null;
			}
		});
		return new ClusterIcon();
	}

	function buildLayerForMap(L: LeafletModule, map: LeafletMapInstance): LeafletLayerInstance {
		if (cluster && typeof L.markerClusterGroup === 'function') {
			const group = L.markerClusterGroup({
				removeOutsideVisibleBounds: true,
				showCoverageOnHover: false,
				iconCreateFunction: (clusterNode: ClusterNode) =>
					createClusterButtonIcon(L, clusterNode.getChildCount())
			});
			map.addLayer(group);
			return group;
		}
		return L.layerGroup().addTo(map);
	}

	function populateSurfaceMarkers(surface: SurfaceContext | null, controlsId: string) {
		if (!surface) return;
		const { map, L, layer, markers } = surface;
		layer.clearLayers();
		markers.clear();

		const boundsPoints: [number, number][] = [];
		const batch: LeafletMarkerInstance[] = [];

		for (const item of validItems) {
			const lat = parseCoordinate(item.lat);
			const lng = parseCoordinate(item.lng);
			if (lat === null || lng === null) continue;

			const itemId = String(item.id);
			const ariaLabel = uniqueLabels.get(itemId) || item.title;
			const icon = createInteractivePinIcon(L, {
				itemId,
				ariaLabel,
				controlsId,
				accentColor: item.accentColor
			});

			const marker = L.marker([lat, lng], {
				icon,
				keyboard: false,
				riseOnHover: true
			});

			marker.on('click', () => {
				selectedId = selectedId === itemId ? null : itemId;
			});

			batch.push(marker);
			markers.set(itemId, marker);
			boundsPoints.push([lat, lng]);
		}

		map.invalidateSize?.();
		if (boundsPoints.length > 0) {
			const bounds = L.latLngBounds(boundsPoints);
			map.fitBounds(bounds.pad(0.1), { maxZoom: 14, animate: false });
		} else {
			map.setView(defaultCenter, defaultZoom, { animate: false });
		}

		const clusterCapable = layer as LeafletLayerInstance & {
			addLayers?: (items: LeafletMarkerInstance[]) => void;
		};
		if (typeof clusterCapable.addLayers === 'function') {
			clusterCapable.addLayers(batch);
		} else {
			for (const marker of batch) {
				layer.addLayer(marker);
			}
		}
	}

	function syncPressedStates(
		surface: Pick<SurfaceContext, 'markers'> | null,
		activeId: string | null
	) {
		if (!surface) return;
		for (const [id, marker] of surface.markers.entries()) {
			const el = marker?.getElement?.();
			if (!el) continue;
			const isSelected = activeId !== null && id === activeId;
			el.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
			el.classList.toggle('is-selected', isSelected);
		}
	}

	function handleInlineReady({ map, L }: { map: LeafletMapInstance; L: LeafletModule }) {
		const layer = buildLayerForMap(L, map);
		inlineCtx = { map, L, layer, markers: new Map() };
		return () => {
			inlineCtx = null;
		};
	}

	function handleModalReady({ map, L }: { map: LeafletMapInstance; L: LeafletModule }) {
		const layer = buildLayerForMap(L, map);
		modalCtx = { map, L, layer, markers: new Map() };
		return () => {
			modalCtx = null;
		};
	}

	$effect(() => {
		void validItems;
		void uniqueLabels;
		if (inlineCtx) {
			populateSurfaceMarkers(inlineCtx, inlineInspectorId);
		}
		if (modalCtx) {
			populateSurfaceMarkers(modalCtx, modalInspectorId);
		}
	});

	$effect(() => {
		const active = selectedId;
		syncPressedStates(inlineCtx, active);
		syncPressedStates(modalCtx, active);
	});

	function closeExpandedModal() {
		expanded = false;
	}

	function getFocusableElements(root: HTMLElement): HTMLElement[] {
		const selector = [
			'a[href]',
			'button:not([disabled])',
			'input:not([disabled]):not([type="hidden"])',
			'select:not([disabled])',
			'textarea:not([disabled])',
			'[tabindex]:not([tabindex="-1"])'
		].join(',');
		return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
			const style = window.getComputedStyle(el);
			return style.display !== 'none' && style.visibility !== 'hidden';
		});
	}

	function handleDialogKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeExpandedModal();
			return;
		}
		if (event.key !== 'Tab' || !dialogEl) return;

		const focusables = getFocusableElements(dialogEl);
		if (focusables.length === 0) return;

		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement as HTMLElement | null;

		if (event.shiftKey) {
			if (!active || active === first || !dialogEl.contains(active)) {
				event.preventDefault();
				last.focus();
			}
		} else if (!active || active === last || !dialogEl.contains(active)) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!expandable || typeof document === 'undefined') return;
		if (expanded) {
			if (document.activeElement instanceof HTMLElement) {
				previousFocusEl = document.activeElement;
			}
			const previousOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			void tick().then(() => {
				modalCloseBtn?.focus();
				window.setTimeout(() => {
					modalCtx?.map?.invalidateSize?.();
				}, 80);
			});
			return () => {
				document.body.style.overflow = previousOverflow;
			};
		} else if (previousFocusEl) {
			const toRestore = previousFocusEl;
			previousFocusEl = null;
			void tick().then(() => toRestore.focus());
		}
	});
</script>

{#snippet selectionPanel(panelId: string)}
	<div
		id={panelId}
		aria-live="polite"
		aria-atomic="true"
		class={variant === 'widget'
			? 'widget-map-inspector'
			: 'bg-surface-900 text-surface-50 border-secondary-500 border-t-4 px-5 py-4 sm:px-6'}
	>
		{#if selectedItem}
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class={variant === 'widget'
								? 'widget-inspector-eyebrow'
								: 'text-primary-500 text-xs font-black tracking-[0.2em] uppercase'}
						>
							Selected {itemNounSingular}
						</span>
						{#if selectedItem.badge}
							<span
								class={variant === 'widget'
									? 'widget-inspector-badge'
									: 'bg-primary-500 text-surface-950 px-2 py-0.5 text-[11px] font-black tracking-[0.14em] uppercase'}
							>
								{selectedItem.badge}
							</span>
						{/if}
					</div>
					<h3
						class={variant === 'widget'
							? 'widget-inspector-title'
							: 'text-surface-50! m-0 mt-1 text-xl leading-tight font-black uppercase italic'}
					>
						{selectedItem.title}
					</h3>
					{#if selectedItem.subtitle}
						<p
							class={variant === 'widget'
								? 'widget-inspector-sub'
								: 'text-primary-500 m-0 mt-1 text-xs font-bold tracking-wide uppercase'}
						>
							{selectedItem.subtitle}
						</p>
					{/if}
					{#if selectedItem.meta}
						<p
							class={variant === 'widget'
								? 'widget-inspector-meta'
								: 'text-surface-300 m-0 mt-1 text-sm'}
						>
							{selectedItem.meta}
						</p>
					{/if}
				</div>

				<div class="flex shrink-0 flex-wrap items-center gap-2 pt-1 sm:pt-0">
					<a
						href={selectedItem.href}
						target={selectedItem.external ? '_blank' : undefined}
						rel={selectedItem.external ? 'noopener noreferrer' : undefined}
						class={variant === 'widget'
							? 'widget-inspector-cta'
							: 'bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-9 items-center gap-2 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase transition hover:no-underline pointer-coarse:min-h-11'}
					>
						<span>{selectedItem.ctaLabel || `View ${itemNounSingular}`}</span>
						{#if selectedItem.external}
							<IconArrowUpRight class="h-4 w-4 shrink-0" aria-hidden="true" />
						{:else}
							<IconArrowRight class="h-4 w-4 shrink-0" aria-hidden="true" />
						{/if}
					</a>
					<button
						type="button"
						class={variant === 'widget'
							? 'widget-inspector-clear'
							: 'border-surface-500 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex min-h-9 cursor-pointer items-center gap-1.5 border-2 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase transition pointer-coarse:min-h-11 pointer-coarse:min-w-11'}
						aria-label={`Clear selected ${itemNounSingular}: ${selectedItem.title}`}
						onclick={() => (selectedId = null)}
					>
						<IconX class="h-3.5 w-3.5" aria-hidden="true" />
						<span>Clear</span>
					</button>
				</div>
			</div>
		{:else}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p
					class={variant === 'widget'
						? 'widget-inspector-idle'
						: 'text-surface-300 m-0 flex items-center gap-2 text-sm font-medium'}
				>
					<IconMapPin
						class={variant === 'widget' ? 'h-4 w-4 shrink-0' : 'text-primary-500 h-4 w-4 shrink-0'}
						aria-hidden="true"
					/>
					<span>{validItems.length > 0 ? resolvedIdlePrompt : resolvedEmptyMessage}</span>
				</p>
				<span
					class={variant === 'widget'
						? 'widget-inspector-count'
						: 'text-surface-300 text-xs font-bold tracking-[0.16em] uppercase tabular-nums'}
				>
					{validItems.length} mapped {validItems.length === 1 ? itemNounSingular : itemNounPlural}
				</span>
			</div>
		{/if}
		{#if footerHint}
			<p
				class={variant === 'widget'
					? 'widget-inspector-hint'
					: 'text-surface-300 border-surface-800 m-0 mt-3 border-t pt-2.5 text-xs'}
			>
				{footerHint}
			</p>
		{/if}
	</div>
{/snippet}

{#if labelledBy}
	<AccessibleMapShell
		{labelledBy}
		{regionLabel}
		{cluster}
		{scrollWheelZoom}
		center={defaultCenter}
		zoom={defaultZoom}
		{shellClass}
		{canvasClass}
		onReady={handleInlineReady}
	>
		{#snippet afterCanvas()}
			{@render selectionPanel(inlineInspectorId)}
		{/snippet}
	</AccessibleMapShell>
{:else}
	<AccessibleMapShell
		regionLabel={regionLabel || 'Directory locations map'}
		{cluster}
		{scrollWheelZoom}
		center={defaultCenter}
		zoom={defaultZoom}
		{shellClass}
		{canvasClass}
		onReady={handleInlineReady}
	>
		{#snippet afterCanvas()}
			{@render selectionPanel(inlineInspectorId)}
		{/snippet}
	</AccessibleMapShell>
{/if}

{#if expandable && expanded}
	<div class="fixed inset-0 z-[1300] flex items-center justify-center p-2 sm:p-4">
		<div aria-hidden="true" class="fixed inset-0 bg-black/80" onclick={closeExpandedModal}></div>
		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-labelledby={modalTitleId}
			tabindex="-1"
			class="border-primary-500 bg-surface-950 text-surface-50 relative z-10 flex max-h-[94dvh] w-[min(96vw,84rem)] flex-col border-t-4 p-0"
			onkeydown={handleDialogKeydown}
		>
			<div
				class="bg-surface-900 border-surface-800 flex flex-wrap items-center justify-between gap-3 border-b-2 px-5 py-3.5"
			>
				<h2
					id={modalTitleId}
					class="text-surface-50! m-0 text-xl leading-none font-black uppercase italic"
				>
					{expandedTitle}
				</h2>
				<button
					bind:this={modalCloseBtn}
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex min-h-9 cursor-pointer items-center gap-2 px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition pointer-coarse:min-h-11"
					onclick={closeExpandedModal}
				>
					<IconMinimize2 class="h-4 w-4" aria-hidden="true" />
					<span>Close Expanded Map</span>
				</button>
			</div>

			<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
				<AccessibleMapShell
					regionLabel={expandedTitle}
					{cluster}
					{scrollWheelZoom}
					center={defaultCenter}
					zoom={defaultZoom}
					canvasClass="h-[62dvh] min-h-[320px] w-full"
					onReady={handleModalReady}
				>
					{#snippet afterCanvas()}
						{@render selectionPanel(modalInspectorId)}
					{/snippet}
				</AccessibleMapShell>
			</div>
		</div>
	</div>
{/if}

<style>
	.widget-map-inspector {
		background: var(--widget-surface, #ffffff);
		color: var(--widget-text, #0c1526);
		border-top: 3px solid var(--widget-accent, #0e7490);
		padding: 0.75rem 0.9rem;
	}

	.widget-inspector-eyebrow {
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--widget-accent, #0e7490);
	}

	.widget-inspector-badge {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border: 1px solid var(--widget-line, #dde3ef);
		background: var(--widget-surface-alt, #eef2f8);
		color: var(--widget-text, #0c1526);
	}

	.widget-inspector-title {
		margin: 0.2rem 0 0;
		font-size: 1rem;
		font-weight: 800;
		line-height: 1.25;
		color: var(--widget-text, #0c1526);
	}

	.widget-inspector-sub {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--widget-text-muted, #5a6a85);
	}

	.widget-inspector-meta {
		margin: 0.2rem 0 0;
		font-size: 0.78rem;
		color: var(--widget-text-muted, #5a6a85);
	}

	.widget-inspector-cta {
		display: inline-flex;
		min-height: 34px;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.75rem;
		background: var(--widget-accent, #0e7490);
		color: #ffffff;
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-decoration: none;
		border: 2px solid transparent;
	}

	:global(.theme-dark) .widget-inspector-cta {
		color: #07101e;
	}

	.widget-inspector-clear {
		display: inline-flex;
		min-height: 34px;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.65rem;
		background: transparent;
		color: var(--widget-text, #0c1526);
		border: 2px solid var(--widget-line, #dde3ef);
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		cursor: pointer;
	}

	.widget-inspector-idle {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--widget-text-muted, #5a6a85);
	}

	.widget-inspector-count {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--widget-text-muted, #5a6a85);
	}

	.widget-inspector-hint {
		margin: 0.5rem 0 0;
		padding-top: 0.45rem;
		border-top: 1px solid var(--widget-line, #dde3ef);
		font-size: 0.74rem;
		color: var(--widget-text-muted, #5a6a85);
	}
</style>
