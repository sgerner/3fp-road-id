<script lang="ts">
	import * as env from '$app/env/public';
	import { onDestroy, onMount } from 'svelte';
	import IconCrosshair from '@lucide/svelte/icons/crosshair';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconX from '@lucide/svelte/icons/x';
	import AccessibleMapShell from '#lib/components/map/AccessibleMapShell.svelte';
	import { geocodeAddress } from '#lib/groups/geocoding';
	import {
		clampCoordinate,
		formatCoordinate,
		isValidLatLng,
		loadGoogleMapsPlaces,
		parseCoordinate
	} from '#lib/map/leaflet';
	import type {
		GoogleMapsApi,
		GoogleMapsGeocoder,
		LeafletMapInstance,
		LeafletMarkerInstance,
		LeafletModule,
		LeafletPointerEvent
	} from '#lib/map/types';

	export type CoordinateChangePayload = {
		latitude: number | null;
		longitude: number | null;
		latitudeText: string;
		longitudeText: string;
		source: 'map-click' | 'reticle' | 'nudge' | 'input' | 'places' | 'geocode' | 'clear';
	};

	export type SelectedPlacePayload = {
		lat: number;
		lng: number;
		formattedAddress: string;
		name: string;
	};

	type RegionLabelProps =
		{ regionLabel: string; labelledBy?: string } | { regionLabel?: string; labelledBy: string };

	type Props = RegionLabelProps & {
		latitude?: string | number | null;
		longitude?: string | number | null;
		searchLabel?: string;
		searchPlaceholder?: string;
		searchValue?: string;
		externalGeocodeQuery?: string;
		countryCode?: string;
		geocodeRevision?: number;
		latitudeInputId?: string;
		longitudeInputId?: string;
		latitudeName?: string;
		longitudeName?: string;
		defaultCenter?: [number, number];
		defaultZoom?: number;
		pinnedZoom?: number;
		canvasClass?: string;
		allowClear?: boolean;
		onCoordinatesChange?: (payload: CoordinateChangePayload) => void;
		onPlaceSelect?: (payload: SelectedPlacePayload) => void;
	};

	let {
		regionLabel,
		labelledBy,
		latitude = null,
		longitude = null,
		searchLabel = 'Search address or place',
		searchPlaceholder = 'Start typing a street address, park, or city…',
		searchValue = '',
		externalGeocodeQuery = '',
		countryCode = '',
		geocodeRevision = 0,
		latitudeInputId,
		longitudeInputId,
		latitudeName,
		longitudeName,
		defaultCenter = [37.8, -96],
		defaultZoom = 4,
		pinnedZoom = 13,
		canvasClass = 'h-64 w-full',
		allowClear = true,
		onCoordinatesChange,
		onPlaceSelect
	}: Props = $props();

	const uid = $props.id();
	const searchInputId = `${uid}-place-search`;
	const resolvedLatId = $derived(latitudeInputId || `${uid}-latitude`);
	const resolvedLngId = $derived(longitudeInputId || `${uid}-longitude`);
	const instructionsId = `${uid}-picker-instructions`;

	const FINE_STEP_DEGREES = 0.0001;

	let searchQuery = $state('');
	let lastSyncedSearchProp = '';
	let lastSyncedCoordsPropKey = '__init__';
	let latText = $state('');
	let lngText = $state('');
	let validationMessage = $state('');
	let statusMessage = $state('');
	let placesLoading = $state(false);
	let placesHint = $state('');

	let searchInputEl = $state<HTMLInputElement | null>(null);
	let latInputEl = $state<HTMLInputElement | null>(null);
	let lngInputEl = $state<HTMLInputElement | null>(null);

	let mapInstance = $state<LeafletMapInstance | null>(null);
	let leafletRef = $state<LeafletModule | null>(null);
	let pinMarker: LeafletMarkerInstance | null = null;
	let mapCenter = $state<{ lat: number; lng: number } | null>(null);

	let geocoder: GoogleMapsGeocoder | null = null;
	let geocodeTimer: ReturnType<typeof setTimeout> | undefined;
	let lastExternalGeocodeKey = '';
	let lastHandledRevision = 0;

	const hasValidPin = $derived(isValidLatLng(latText, lngText));

	const initialCoords = $derived.by((): [number, number] => {
		if (isValidLatLng(latitude, longitude)) {
			return [
				parseCoordinate(latitude) ?? defaultCenter[0],
				parseCoordinate(longitude) ?? defaultCenter[1]
			];
		}
		return defaultCenter;
	});

	const activeCenter = $derived(mapCenter ?? { lat: initialCoords[0], lng: initialCoords[1] });

	const initialZoom = $derived(isValidLatLng(latitude, longitude) ? pinnedZoom : defaultZoom);

	$effect(() => {
		const nextSearch = String(searchValue ?? '').trim();
		if (nextSearch && nextSearch !== lastSyncedSearchProp) {
			lastSyncedSearchProp = nextSearch;
			if (typeof document === 'undefined' || document.activeElement !== searchInputEl) {
				searchQuery = nextSearch;
			}
		}
	});

	// Sync external latitude/longitude props into local input strings when external props change
	$effect(() => {
		const extLat = latitude;
		const extLng = longitude;
		const nextKey = `${extLat ?? ''}|${extLng ?? ''}`;
		if (nextKey === lastSyncedCoordsPropKey) return;
		lastSyncedCoordsPropKey = nextKey;

		const latFocused = typeof document !== 'undefined' && document.activeElement === latInputEl;
		const lngFocused = typeof document !== 'undefined' && document.activeElement === lngInputEl;

		if (!latFocused) {
			const nextLatText =
				extLat === null || extLat === undefined || String(extLat).trim() === ''
					? ''
					: isValidLatLng(extLat, 0)
						? formatCoordinate(extLat)
						: String(extLat);
			if (nextLatText !== latText) {
				latText = nextLatText;
			}
		}

		if (!lngFocused) {
			const nextLngText =
				extLng === null || extLng === undefined || String(extLng).trim() === ''
					? ''
					: isValidLatLng(0, extLng)
						? formatCoordinate(extLng)
						: String(extLng);
			if (nextLngText !== lngText) {
				lngText = nextLngText;
			}
		}

		if (!latFocused && !lngFocused && mapInstance && leafletRef) {
			syncMarkerOnMap(parseCoordinate(extLat), parseCoordinate(extLng), false);
		}
	});

	function applyDecorativePinSemantics(marker: LeafletMarkerInstance | null) {
		const el = marker?.getElement?.();
		if (!el) return;
		if (el.tagName === 'IMG') {
			el.setAttribute('alt', '');
		}
		el.removeAttribute('title');
		el.removeAttribute('tabindex');
		el.removeAttribute('role');
	}

	function syncMarkerOnMap(lat: number | null, lng: number | null, fly: boolean) {
		if (!mapInstance || !leafletRef) return;
		if (lat === null || lng === null || !isValidLatLng(lat, lng)) {
			if (pinMarker) {
				pinMarker.remove();
				pinMarker = null;
			}
			return;
		}

		if (!pinMarker) {
			pinMarker = leafletRef
				.marker([lat, lng], {
					interactive: false,
					keyboard: false,
					alt: '',
					title: ''
				})
				.addTo(mapInstance);
		} else {
			pinMarker.setLatLng([lat, lng]);
		}
		applyDecorativePinSemantics(pinMarker);

		if (fly) {
			mapInstance.setView([lat, lng], Math.max(mapInstance.getZoom(), pinnedZoom));
		}
	}

	function commitCoordinates(
		lat: number,
		lng: number,
		source: CoordinateChangePayload['source'],
		{ fly = true }: { fly?: boolean } = {}
	) {
		const clampedLat = clampCoordinate(lat, -90, 90);
		const clampedLng = clampCoordinate(lng, -180, 180);
		const nextLatText = clampedLat.toFixed(6);
		const nextLngText = clampedLng.toFixed(6);

		validationMessage = '';
		latText = nextLatText;
		lngText = nextLngText;
		syncMarkerOnMap(clampedLat, clampedLng, fly);
		statusMessage = `Pinned at ${nextLatText}, ${nextLngText}.`;

		onCoordinatesChange?.({
			latitude: clampedLat,
			longitude: clampedLng,
			latitudeText: nextLatText,
			longitudeText: nextLngText,
			source
		});
	}

	function clearCoordinates() {
		validationMessage = '';
		latText = '';
		lngText = '';
		syncMarkerOnMap(null, null, false);
		statusMessage = 'Map pin cleared.';
		onCoordinatesChange?.({
			latitude: null,
			longitude: null,
			latitudeText: '',
			longitudeText: '',
			source: 'clear'
		});
	}

	function handleSetPinAtCenter() {
		if (!mapInstance) {
			commitCoordinates(activeCenter.lat, activeCenter.lng, 'reticle', { fly: false });
			return;
		}
		const c = mapInstance.getCenter();
		commitCoordinates(c.lat, c.lng, 'reticle', { fly: false });
	}

	function nudgeCoordinates(deltaLat: number, deltaLng: number) {
		const baseLat = isValidLatLng(latText, lngText)
			? (parseCoordinate(latText) ?? activeCenter.lat)
			: (mapInstance?.getCenter?.()?.lat ?? activeCenter.lat);
		const baseLng = isValidLatLng(latText, lngText)
			? (parseCoordinate(lngText) ?? activeCenter.lng)
			: (mapInstance?.getCenter?.()?.lng ?? activeCenter.lng);

		const nextLat = clampCoordinate(baseLat + deltaLat, -90, 90);
		const nextLng = clampCoordinate(baseLng + deltaLng, -180, 180);

		commitCoordinates(nextLat, nextLng, 'nudge', { fly: false });
		if (mapInstance) {
			mapInstance.panTo([nextLat, nextLng], { animate: false });
		}
	}

	function handleMapKeydown(event: KeyboardEvent) {
		if (!event.shiftKey) return;
		switch (event.key) {
			case 'ArrowUp':
				event.preventDefault();
				event.stopPropagation();
				nudgeCoordinates(FINE_STEP_DEGREES, 0);
				break;
			case 'ArrowDown':
				event.preventDefault();
				event.stopPropagation();
				nudgeCoordinates(-FINE_STEP_DEGREES, 0);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				event.stopPropagation();
				nudgeCoordinates(0, -FINE_STEP_DEGREES);
				break;
			case 'ArrowRight':
				event.preventDefault();
				event.stopPropagation();
				nudgeCoordinates(0, FINE_STEP_DEGREES);
				break;
		}
	}

	function handleCoordInput() {
		const latBad = latInputEl?.validity?.badInput ?? false;
		const lngBad = lngInputEl?.validity?.badInput ?? false;
		if (latBad || lngBad) return;

		const rawLat = String(latText ?? '').trim();
		const rawLng = String(lngText ?? '').trim();

		if (!rawLat && !rawLng) {
			validationMessage = '';
			syncMarkerOnMap(null, null, false);
			onCoordinatesChange?.({
				latitude: null,
				longitude: null,
				latitudeText: '',
				longitudeText: '',
				source: 'input'
			});
			return;
		}

		const parsedLat = parseCoordinate(rawLat);
		const parsedLng = parseCoordinate(rawLng);
		if (parsedLat === null || parsedLng === null) {
			return;
		}

		if (parsedLat < -90 || parsedLat > 90) {
			validationMessage = 'Latitude must be between -90 and 90.';
			return;
		}
		if (parsedLng < -180 || parsedLng > 180) {
			validationMessage = 'Longitude must be between -180 and 180.';
			return;
		}

		validationMessage = '';
		syncMarkerOnMap(parsedLat, parsedLng, false);
		mapInstance?.panTo?.([parsedLat, parsedLng], { animate: false });

		onCoordinatesChange?.({
			latitude: parsedLat,
			longitude: parsedLng,
			latitudeText: rawLat,
			longitudeText: rawLng,
			source: 'input'
		});
	}

	function handleMapReady({ map, L }: { map: LeafletMapInstance; L: LeafletModule }) {
		leafletRef = L;
		mapInstance = map;

		const updateCenter = () => {
			const c = map.getCenter();
			mapCenter = { lat: c.lat, lng: c.lng };
		};
		updateCenter();

		map.on('move', updateCenter);
		map.on('moveend', updateCenter);
		map.on('click', (ev: LeafletPointerEvent) => {
			if (!ev?.latlng) return;
			commitCoordinates(ev.latlng.lat, ev.latlng.lng, 'map-click', { fly: false });
		});

		const containerEl = map.getContainer?.();
		containerEl?.addEventListener('keydown', handleMapKeydown, true);

		if (isValidLatLng(latText, lngText)) {
			syncMarkerOnMap(parseCoordinate(latText), parseCoordinate(lngText), false);
		}

		return () => {
			containerEl?.removeEventListener('keydown', handleMapKeydown, true);
			pinMarker = null;
			mapInstance = null;
		};
	}

	async function runGeocodeQuery(
		query: string,
		country: string,
		source: 'places' | 'geocode',
		fly: boolean
	) {
		const trimmed = String(query ?? '').trim();
		if (!trimmed || !geocoder) return;
		try {
			const normalizedCountry =
				country && country.toUpperCase() !== 'OTHER' ? country.toUpperCase() : '';
			const winGoogle =
				typeof window !== 'undefined'
					? (window as unknown as { google?: { maps?: GoogleMapsApi } }).google
					: undefined;
			const okStatus = winGoogle?.maps?.GeocoderStatus?.OK || 'OK';
			const coords = await geocodeAddress(geocoder, trimmed, normalizedCountry, okStatus);
			if (!coords) return;
			commitCoordinates(coords.lat, coords.lng, source, { fly });
		} catch (err) {
			console.warn('Address geocoding failed', err);
		}
	}

	async function handleManualSearch() {
		const q = searchQuery.trim();
		if (!q) return;
		if (!geocoder) {
			placesHint =
				'Place search requires Google Maps configuration. Pan the map or enter Latitude and Longitude below.';
			return;
		}
		await runGeocodeQuery(q, countryCode, 'places', true);
	}

	onMount(() => {
		const key = (env as Record<string, string | undefined>).PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
		if (!key) {
			return;
		}
		placesLoading = true;
		loadGoogleMapsPlaces(key)
			.then((gmapsRaw: unknown) => {
				const gmaps = gmapsRaw as GoogleMapsApi | null;
				placesLoading = false;
				if (!gmaps) return;
				if (gmaps.Geocoder) {
					geocoder = new gmaps.Geocoder();
				}
				if (searchInputEl && gmaps.places?.Autocomplete) {
					const ac = new gmaps.places.Autocomplete(searchInputEl, {
						fields: ['geometry', 'name', 'formatted_address']
					});
					ac.addListener('place_changed', () => {
						const place = ac.getPlace?.();
						const loc = place?.geometry?.location;
						if (!loc) return;
						const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
						const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
						if (typeof lat === 'number' && typeof lng === 'number') {
							const formattedAddress = place.formatted_address || '';
							const name = place.name || '';
							if (formattedAddress || name) {
								searchQuery = formattedAddress || name;
							}
							commitCoordinates(lat, lng, 'places', { fly: true });
							onPlaceSelect?.({ lat, lng, formattedAddress, name });
						}
					});
				}
				// Run pending external geocode if coordinates are not yet set
				const extTrimmed = externalGeocodeQuery.trim();
				if (extTrimmed && !isValidLatLng(latText, lngText)) {
					lastExternalGeocodeKey = `${extTrimmed}|${countryCode}`;
					void runGeocodeQuery(extTrimmed, countryCode, 'geocode', false);
				}
			})
			.catch((err: unknown) => {
				placesLoading = false;
				console.warn('Google Places unavailable', err);
			});
	});

	// Watch external address / blur geocode triggers from parent forms
	$effect(() => {
		const query = externalGeocodeQuery.trim();
		const country = countryCode.trim();
		const rev = geocodeRevision;
		if (!query || !geocoder) return;

		const key = `${query}|${country}`;
		const forced = rev !== lastHandledRevision;
		if (!forced && key === lastExternalGeocodeKey) return;

		clearTimeout(geocodeTimer);
		if (forced) {
			lastHandledRevision = rev;
			lastExternalGeocodeKey = key;
			void runGeocodeQuery(query, country, 'geocode', true);
		} else if (!isValidLatLng(latText, lngText)) {
			geocodeTimer = setTimeout(() => {
				lastExternalGeocodeKey = key;
				void runGeocodeQuery(query, country, 'geocode', false);
			}, 500);
		}
	});

	onDestroy(() => {
		clearTimeout(geocodeTimer);
	});
</script>

<div class="bg-surface-950 border-surface-700 flex flex-col gap-3 border-2 p-4">
	<!-- Labeled Google Places / Address Search -->
	<div class="flex flex-col gap-1.5">
		<label
			for={searchInputId}
			class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
		>
			{searchLabel}
		</label>
		<div class="flex w-full">
			<input
				bind:this={searchInputEl}
				id={searchInputId}
				type="search"
				class="bg-surface-900 text-surface-50 border-surface-500 placeholder:text-surface-400 focus:border-primary-500 min-h-10 min-w-0 flex-1 border-2 px-3.5 py-2 text-sm focus:outline-none"
				placeholder={searchPlaceholder}
				bind:value={searchQuery}
				aria-describedby={instructionsId}
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void handleManualSearch();
					}
				}}
			/>
			<button
				type="button"
				class="bg-primary-500 text-surface-950 hover:bg-surface-50 border-surface-500 inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 border-2 border-l-0 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase transition"
				onclick={() => void handleManualSearch()}
			>
				<IconSearch class="h-4 w-4" aria-hidden="true" />
				<span>Find</span>
			</button>
		</div>
		{#if placesLoading}
			<p class="text-surface-300 m-0 text-xs">Loading place suggestions…</p>
		{/if}
		{#if placesHint}
			<p class="text-surface-300 m-0 text-xs">{placesHint}</p>
		{/if}
	</div>

	<p id={instructionsId} class="text-surface-300 m-0 text-xs leading-relaxed">
		Pan the map with arrow keys to align the center reticle, then activate
		<strong class="text-surface-50">Set pin at map center</strong>. Hold
		<strong class="text-surface-50">Shift + Arrow keys</strong> on the map for fine pin adjustments, or
		enter coordinates below.
	</p>

	<!-- Accessible Map Shell + Center Reticle Overlay -->
	{#if labelledBy}
		<AccessibleMapShell
			{labelledBy}
			{regionLabel}
			center={initialCoords}
			zoom={initialZoom}
			shellClass="border-surface-500 border-2"
			{canvasClass}
			onReady={handleMapReady}
		>
			{#snippet overlay()}
				<div
					aria-hidden="true"
					class="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center"
				>
					<div
						class="border-surface-950 bg-primary-500 text-surface-950 flex h-8 w-8 items-center justify-center border-2 opacity-90"
					>
						<IconCrosshair class="h-5 w-5" />
					</div>
				</div>
			{/snippet}
		</AccessibleMapShell>
	{:else}
		<AccessibleMapShell
			regionLabel={regionLabel || 'Coordinate pin picker map'}
			center={initialCoords}
			zoom={initialZoom}
			shellClass="border-surface-500 border-2"
			{canvasClass}
			onReady={handleMapReady}
		>
			{#snippet overlay()}
				<div
					aria-hidden="true"
					class="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center"
				>
					<div
						class="border-surface-950 bg-primary-500 text-surface-950 flex h-8 w-8 items-center justify-center border-2 opacity-90"
					>
						<IconCrosshair class="h-5 w-5" />
					</div>
				</div>
			{/snippet}
		</AccessibleMapShell>
	{/if}

	<!-- Reticle Action Toolbar -->
	<div
		class="bg-surface-900 border-surface-700 flex flex-wrap items-center justify-between gap-3 border px-3.5 py-2.5"
	>
		<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Pin placement actions">
			<button
				type="button"
				class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-9 cursor-pointer items-center gap-2 px-4 py-2 text-xs font-black tracking-[0.14em] uppercase transition"
				onclick={handleSetPinAtCenter}
				onkeydown={handleMapKeydown}
			>
				<IconCrosshair class="h-4 w-4" aria-hidden="true" />
				<span>Set pin at map center</span>
			</button>

			{#if allowClear && hasValidPin}
				<button
					type="button"
					class="border-surface-500 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex min-h-9 cursor-pointer items-center gap-1.5 border-2 px-3 py-2 text-xs font-black tracking-[0.14em] uppercase transition"
					onclick={clearCoordinates}
				>
					<IconX class="h-3.5 w-3.5" aria-hidden="true" />
					<span>Clear pin</span>
				</button>
			{/if}
		</div>

		<p class="text-surface-300 m-0 text-xs font-medium tabular-nums" aria-live="polite">
			{#if validationMessage}
				<span class="text-tertiary-400 font-bold">{validationMessage}</span>
			{:else if hasValidPin}
				Pinned at {Number(latText).toFixed(6)}, {Number(lngText).toFixed(6)}
			{:else if statusMessage}
				{statusMessage}
			{:else}
				Reticle center: {activeCenter.lat.toFixed(5)}, {activeCenter.lng.toFixed(5)}
			{/if}
		</p>
	</div>

	<!-- Labeled Numeric Coordinate Inputs (WCAG H44 / G202) -->
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div class="flex flex-col gap-1">
			<label
				for={resolvedLatId}
				class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
			>
				Latitude
			</label>
			<input
				bind:this={latInputEl}
				id={resolvedLatId}
				name={latitudeName || undefined}
				type="number"
				step="any"
				min="-90"
				max="90"
				placeholder="e.g. 33.425500"
				class="bg-surface-900 text-surface-50 border-surface-500 placeholder:text-surface-400 focus:border-primary-500 min-h-10 w-full border-2 px-3.5 py-2 text-sm tabular-nums focus:outline-none"
				value={latText}
				oninput={(event) => {
					latText = event.currentTarget.value;
					handleCoordInput();
				}}
			/>
		</div>
		<div class="flex flex-col gap-1">
			<label
				for={resolvedLngId}
				class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
			>
				Longitude
			</label>
			<input
				bind:this={lngInputEl}
				id={resolvedLngId}
				name={longitudeName || undefined}
				type="number"
				step="any"
				min="-180"
				max="180"
				placeholder="e.g. -111.940000"
				class="bg-surface-900 text-surface-50 border-surface-500 placeholder:text-surface-400 focus:border-primary-500 min-h-10 w-full border-2 px-3.5 py-2 text-sm tabular-nums focus:outline-none"
				value={lngText}
				oninput={(event) => {
					lngText = event.currentTarget.value;
					handleCoordInput();
				}}
			/>
		</div>
	</div>
</div>
