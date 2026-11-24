<script lang="ts">
	import { browser } from '$app/env';
	import { onMount, type Snippet } from 'svelte';
	import { isValidLatLng, loadLeaflet, parseCoordinate } from '#lib/map/leaflet';
	import type { LeafletMapInstance, LeafletMarkerInstance, LeafletModule } from '#lib/map/types';

	type RegionLabelProps =
		{ regionLabel: string; labelledBy?: string } | { regionLabel?: string; labelledBy: string };

	type StaticMarkerCoords = {
		lat: number | string;
		lng: number | string;
	};

	type Props = RegionLabelProps & {
		canvasLabel?: string;
		center?: [number, number];
		zoom?: number;
		maxZoom?: number;
		scrollWheelZoom?: boolean;
		lazy?: boolean;
		lazyRootMargin?: string;
		cluster?: boolean;
		staticMarker?: StaticMarkerCoords | null;
		skipLabel?: string;
		skipTargetId?: string;
		shellClass?: string;
		canvasClass?: string;
		onReady?: (ctx: { map: LeafletMapInstance; L: LeafletModule }) => void | (() => void);
		overlay?: Snippet;
		afterCanvas?: Snippet;
	};

	let {
		regionLabel,
		labelledBy,
		canvasLabel,
		center = [37.8, -96],
		zoom = 13,
		maxZoom = 19,
		scrollWheelZoom = true,
		lazy = false,
		lazyRootMargin = '250px',
		cluster = false,
		staticMarker = null,
		skipLabel = 'Skip map controls',
		skipTargetId,
		shellClass = '',
		canvasClass = 'h-72 w-full',
		onReady,
		overlay,
		afterCanvas
	}: Props = $props();

	const uid = $props.id();
	const fallbackSkipTargetId = `${uid}-after-map`;
	const resolvedSkipTargetId = $derived(skipTargetId || fallbackSkipTargetId);

	const trimmedRegionLabel = $derived(typeof regionLabel === 'string' ? regionLabel.trim() : '');
	const trimmedLabelledBy = $derived(typeof labelledBy === 'string' ? labelledBy.trim() : '');
	const resolvedCanvasLabel = $derived.by(() => {
		if (typeof canvasLabel === 'string' && canvasLabel.trim()) return canvasLabel.trim();
		if (trimmedRegionLabel) {
			return `${trimmedRegionLabel} — interactive map canvas, use arrow keys to pan and plus or minus keys to zoom`;
		}
		return '';
	});

	let shellEl = $state<HTMLDivElement | null>(null);
	let mapEl = $state<HTMLDivElement | null>(null);
	let shouldMountMap = $state(false);
	let mapInstance = $state<LeafletMapInstance | null>(null);
	let leafletRef = $state<LeafletModule | null>(null);
	let decorativeMarker: LeafletMarkerInstance | null = null;
	let readyCleanup: void | (() => void);

	$effect(() => {
		if (!trimmedRegionLabel && !trimmedLabelledBy) {
			console.warn(
				'AccessibleMapShell requires a non-empty `regionLabel` or `labelledBy` prop for WCAG 4.1.2.'
			);
		}
	});

	function applyDecorativeMarkerSemantics(marker: LeafletMarkerInstance | null) {
		const el = marker?.getElement?.();
		if (!el) return;
		if (el.tagName === 'IMG') {
			el.setAttribute('alt', '');
		}
		el.removeAttribute('title');
		el.removeAttribute('tabindex');
		el.removeAttribute('role');
	}

	function syncStaticMarker(
		L: LeafletModule | null,
		map: LeafletMapInstance | null,
		coords: StaticMarkerCoords | null
	) {
		if (!L || !map) return;
		if (!coords || !isValidLatLng(coords.lat, coords.lng)) {
			if (decorativeMarker) {
				decorativeMarker.remove();
				decorativeMarker = null;
			}
			return;
		}
		const lat = parseCoordinate(coords.lat);
		const lng = parseCoordinate(coords.lng);
		if (lat === null || lng === null) return;

		if (!decorativeMarker) {
			decorativeMarker = L.marker([lat, lng], {
				interactive: false,
				keyboard: false,
				alt: '',
				title: ''
			}).addTo(map);
		} else {
			decorativeMarker.setLatLng([lat, lng]);
		}
		applyDecorativeMarkerSemantics(decorativeMarker);
	}

	function handleSkipClick(event: MouseEvent) {
		if (typeof document === 'undefined') return;
		const target = document.getElementById(resolvedSkipTargetId);
		if (!target) return;
		event.preventDefault();
		target.focus();
	}

	function triggerLazyMount() {
		if (!shouldMountMap) {
			shouldMountMap = true;
		}
	}

	onMount(() => {
		if (!browser) return;
		if (!lazy || typeof IntersectionObserver === 'undefined' || !shellEl) {
			shouldMountMap = true;
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					shouldMountMap = true;
				}
			},
			{ rootMargin: lazyRootMargin }
		);
		observer.observe(shellEl);

		return () => {
			observer.disconnect();
		};
	});

	$effect(() => {
		if (!browser || !shouldMountMap || !mapEl || mapInstance) return;

		let cancelled = false;
		void (async () => {
			try {
				const L = (await loadLeaflet({ cluster })) as LeafletModule;
				if (cancelled || !mapEl || mapInstance) return;

				const initialLat =
					staticMarker && isValidLatLng(staticMarker.lat, staticMarker.lng)
						? (parseCoordinate(staticMarker.lat) ?? center[0])
						: center[0];
				const initialLng =
					staticMarker && isValidLatLng(staticMarker.lat, staticMarker.lng)
						? (parseCoordinate(staticMarker.lng) ?? center[1])
						: center[1];

				const createdMap = L.map(mapEl, {
					scrollWheelZoom
				}).setView([initialLat, initialLng], zoom);

				L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					maxZoom,
					attribution: '&copy; OpenStreetMap contributors'
				}).addTo(createdMap);

				leafletRef = L;
				mapInstance = createdMap;

				syncStaticMarker(L, createdMap, staticMarker);
				readyCleanup = onReady?.({ map: createdMap, L });

				let resizeObserver: ResizeObserver | null = null;
				if (typeof ResizeObserver !== 'undefined' && mapEl) {
					resizeObserver = new ResizeObserver(() => {
						if (!cancelled) {
							createdMap.invalidateSize();
						}
					});
					resizeObserver.observe(mapEl);
				}

				const prevCleanup = readyCleanup;
				readyCleanup = () => {
					resizeObserver?.disconnect();
					if (typeof prevCleanup === 'function') {
						prevCleanup();
					}
				};

				window.setTimeout(() => {
					if (!cancelled) {
						createdMap.invalidateSize();
					}
				}, 100);
			} catch (error) {
				console.warn('Unable to initialize accessible Leaflet map', error);
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const coords = staticMarker;
		if (!mapInstance || !leafletRef) return;
		syncStaticMarker(leafletRef, mapInstance, coords);
		if (coords && isValidLatLng(coords.lat, coords.lng)) {
			const lat = parseCoordinate(coords.lat);
			const lng = parseCoordinate(coords.lng);
			if (lat !== null && lng !== null) {
				mapInstance.setView([lat, lng], zoom);
			}
		}
	});

	onMount(() => {
		return () => {
			try {
				if (typeof readyCleanup === 'function') {
					readyCleanup();
				}
				decorativeMarker = null;
				mapInstance?.remove?.();
				mapInstance = null;
			} catch {}
		};
	});
</script>

<div
	bind:this={shellEl}
	role="region"
	aria-labelledby={trimmedLabelledBy || undefined}
	aria-label={!trimmedLabelledBy && trimmedRegionLabel ? trimmedRegionLabel : undefined}
	class={`accessible-map-shell relative ${shellClass}`}
	onfocusin={triggerLazyMount}
>
	<a
		href={`#${resolvedSkipTargetId}`}
		class="skip-map-controls focus:bg-primary-500 focus:text-surface-950 focus:border-surface-950 sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[1100] focus:inline-flex focus:min-h-8 focus:items-center focus:border-2 focus:px-3 focus:py-1.5 focus:text-xs focus:font-black focus:tracking-wider focus:uppercase focus:no-underline focus:outline-none"
		onclick={handleSkipClick}
	>
		{skipLabel}
	</a>

	<div class="relative w-full">
		<div
			bind:this={mapEl}
			role="group"
			aria-label={resolvedCanvasLabel || undefined}
			aria-labelledby={!resolvedCanvasLabel && trimmedLabelledBy ? trimmedLabelledBy : undefined}
			class={canvasClass}
		></div>
		{#if overlay}
			{@render overlay()}
		{/if}
	</div>

	{#if !skipTargetId}
		<div id={fallbackSkipTargetId} tabindex="-1" class="sr-only">
			End of {trimmedRegionLabel || 'map'} controls
		</div>
	{/if}

	{#if afterCanvas}
		{@render afterCanvas()}
	{/if}
</div>
