<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { ensureLeafletDefaultIcon } from '$lib/map/leaflet';

	export let eventDetails;
	export let timezoneOptions = [];
	export let onEventDetailsChange = () => {};

	let mapContainer;
	let placesContainer;
	let placesAutocomplete;
	let map;
	let marker;
	let L;
	let geocoder;
	let placesLoading = false;
	let placesError = '';
	let googleReady = false;
	let lastPlacesValue = '';
	let geocodeTimeout;
	let lastPlaced = { lat: null, lng: null };

	const MAP_DEFAULT = { lat: 37.8, lng: -96, zoom: 4 };

	function ensureMap(lat = MAP_DEFAULT.lat, lng = MAP_DEFAULT.lng, zoom = MAP_DEFAULT.zoom) {
		if (!L || !mapContainer) return;
		if (map) return;
		map = L.map(mapContainer).setView([lat, lng], zoom);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
		map.on('click', ({ latlng }) => {
			if (!latlng) return;
			const { lat, lng } = latlng;
			placeMarker(lat, lng, { fly: false, updateForm: true });
		});
	}

	function placeMarker(lat, lng, { fly = true, updateForm = false } = {}) {
		if (!map || typeof lat !== 'number' || typeof lng !== 'number') return;
		if (!marker) {
			marker = L.marker([lat, lng]).addTo(map);
		}
		marker.setLatLng([lat, lng]);
		if (fly) {
			map.setView([lat, lng], Math.max(map.getZoom(), 13));
		}
		lastPlaced = { lat, lng };
		if (updateForm) {
			onEventDetailsChange({ latitude: lat.toFixed(6), longitude: lng.toFixed(6) });
		}
	}

	function loadGooglePlaces() {
		if (typeof window === 'undefined') return;
		if (window.google?.maps?.places) {
			initPlaces();
			return;
		}
		const key = env.PUBLIC_GOOGLE_MAPS_API_KEY;
		if (!key) {
			placesError = 'Google Maps API key is not configured.';
			return;
		}
		if (document.getElementById('gmaps-places-volunteer')) return;
		placesLoading = true;
		const script = document.createElement('script');
		script.id = 'gmaps-places-volunteer';
		script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&v=beta&callback=initVolunteerEventPlaces`;
		script.async = true;
		script.defer = true;
		script.onerror = () => {
			placesLoading = false;
			placesError = 'Unable to load Google Maps Places.';
		};
		window.initVolunteerEventPlaces = initPlaces;
		document.head.appendChild(script);
	}

	function initPlaces() {
		placesLoading = false;
		placesError = '';
		googleReady = true;
		try {
			const gmaps = window.google?.maps;
			if (!gmaps?.places || !placesContainer) return;
			geocoder = new gmaps.Geocoder();

			const AutocompleteElement = gmaps.places.PlaceAutocompleteElement;
			if (AutocompleteElement) {
				placesAutocomplete = new AutocompleteElement();
				const initialValue = eventDetails.locationName || eventDetails.locationAddress || '';
				if (initialValue) placesAutocomplete.value = initialValue;
				placesContainer.innerHTML = '';
				placesContainer.appendChild(placesAutocomplete);
				placesAutocomplete.addEventListener('gmp-placeselect', handlePlaceChange);
				placesAutocomplete.addEventListener('gmp-placechange', handlePlaceChange);
				return;
			}

			const input = document.createElement('input');
			input.className = 'input bg-surface-900/60';

			input.placeholder = 'Start typing a meetup spot…';
			if (eventDetails.locationName) input.value = eventDetails.locationName;
			placesContainer.innerHTML = '';
			placesContainer.appendChild(input);
			placesAutocomplete = input;

			if (gmaps.places.Autocomplete) {
				const ac = new gmaps.places.Autocomplete(input, {
					fields: ['geometry', 'name', 'formatted_address']
				});
				ac.addListener('place_changed', () => {
					const place = ac.getPlace();
					if (!place) return;
					const loc = place.geometry?.location;
					if (loc) {
						const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
						const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
						placeMarker(lat, lng, { fly: true, updateForm: true });
					}
					const patch = {};
					if (place.name) patch.locationName = place.name;
					if (place.formatted_address) patch.locationAddress = place.formatted_address;
					if (Object.keys(patch).length) onEventDetailsChange(patch);
				});
			}
		} catch (error) {
			console.error('Failed to initialise Google Places', error);
			placesError = 'Google Places could not start.';
		}
	}

	async function handlePlaceChange(event) {
		try {
			const prediction = event?.place || event?.placePrediction;
			if (!prediction) return;
			let place = prediction;
			if (prediction.toPlace) {
				place = prediction.toPlace();
				await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
			}
			const nameCandidate =
				place.displayName?.text || place.displayName || place.name || prediction.text || '';
			const addressCandidate = place.formattedAddress || prediction.secondaryText || '';
			const loc = place.location;
			const patch = {};
			if (nameCandidate) patch.locationName = nameCandidate;
			if (addressCandidate) patch.locationAddress = addressCandidate;
			if (Object.keys(patch).length) onEventDetailsChange(patch);
			if (loc) {
				const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
				const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
				if (typeof lat === 'number' && typeof lng === 'number') {
					placeMarker(lat, lng, { fly: true, updateForm: true });
				}
			}
		} catch (error) {
			console.error('Place selection failed', error);
			placesError = 'Could not read the selected place.';
		}
	}

	function scheduleAddressGeocode(address) {
		if (!googleReady || !address) return;
		if (geocodeTimeout) clearTimeout(geocodeTimeout);
		geocodeTimeout = setTimeout(async () => {
			if (!geocoder) return;
			try {
				const { results } = await geocoder.geocode({ address });
				const result = results?.[0];
				const loc = result?.geometry?.location;
				if (!loc) return;
				const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
				const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
				if (typeof lat === 'number' && typeof lng === 'number') {
					placeMarker(lat, lng, { fly: false, updateForm: true });
				}
			} catch (error) {
				console.error('Geocoding failed', error);
			}
		}, 450);
	}

	onMount(async () => {
		if (typeof window === 'undefined') return;
		try {
			const mod = await import('leaflet');
			L = mod.default || mod;
			await ensureLeafletDefaultIcon(L);
		} catch (error) {
			console.error('Failed to load Leaflet', error);
		}
		await tick();
		ensureMap();
		const lat = Number(eventDetails.latitude);
		const lng = Number(eventDetails.longitude);
		if (Number.isFinite(lat) && Number.isFinite(lng)) {
			placeMarker(lat, lng, { fly: false });
		}
		if (placesContainer) {
			loadGooglePlaces();
		}
	});

	onDestroy(() => {
		if (map) {
			map.off();
			map.remove();
		}
		if (typeof window !== 'undefined' && window.initVolunteerEventPlaces === initPlaces) {
			delete window.initVolunteerEventPlaces;
		}
		if (geocodeTimeout) clearTimeout(geocodeTimeout);
	});

	$: if (placesAutocomplete && eventDetails.locationName) {
		const value = eventDetails.locationName;
		if (value && value !== lastPlacesValue) {
			lastPlacesValue = value;
			if ('value' in placesAutocomplete) {
				placesAutocomplete.value = value;
			}
		}
	}

	$: (function syncMarkerWithState() {
		if (!map) return;
		const lat = Number(eventDetails.latitude);
		const lng = Number(eventDetails.longitude);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
		if (lastPlaced.lat === lat && lastPlaced.lng === lng) return;
		placeMarker(lat, lng, { fly: false });
	})();

	$: if (
		googleReady &&
		eventDetails.locationAddress &&
		(!eventDetails.latitude || !eventDetails.longitude)
	) {
		scheduleAddressGeocode(eventDetails.locationAddress);
	}
</script>

<section class="grid gap-4 md:grid-cols-2">
	<div class="flex flex-col gap-2">
		<label class="label" for="event-start">Start *</label>
		<input
			id="event-start"
			type="datetime-local"
			class="input bg-surface-900/60"
			value={eventDetails.eventStart}
			oninput={(e) => onEventDetailsChange({ eventStart: e.currentTarget.value })}
		/>
	</div>
	<div class="flex flex-col gap-2">
		<label class="label" for="event-end">End</label>
		<input
			id="event-end"
			type="datetime-local"
			class="input bg-surface-900/60"
			value={eventDetails.eventEnd}
			oninput={(e) => onEventDetailsChange({ eventEnd: e.currentTarget.value })}
		/>
	</div>
	<div class="flex flex-col gap-2">
		<label class="label" for="event-timezone">Timezone</label>
		<select
			id="event-timezone"
			class="select bg-surface-900/60"
			value={eventDetails.timezone}
			onchange={(e) => onEventDetailsChange({ timezone: e.currentTarget.value })}
		>
			{#each timezoneOptions as tz}
				<option value={tz}>{tz}</option>
			{/each}
		</select>
	</div>
	<div class="flex flex-col gap-2 md:col-span-2">
		<label class="label" for="event-location-name">Meetup location</label>
		<input
			id="event-location-name"
			class="input bg-surface-900/60"
			value={eventDetails.locationName}
			oninput={(e) => onEventDetailsChange({ locationName: e.currentTarget.value })}
			placeholder="Sellwood Park Boat Launch"
		/>
	</div>
	<div class="flex flex-col gap-2 md:col-span-2">
		<label class="label" for="event-location-address">Address or notes</label>
		<textarea
			id="event-location-address"
			class="textarea min-h-24 bg-surface-900/60"
			value={eventDetails.locationAddress}
			oninput={(e) => onEventDetailsChange({ locationAddress: e.currentTarget.value })}
			placeholder="123 River Rd, meet by the picnic tables. Parking is limited — roll or carpool if you can."
		></textarea>
	</div>
	<div class="space-y-3 md:col-span-2">
		<label class="label" for="event-map-search">Pin on map</label>
		<div
			id="event-map-search"
			class="input bg-surface-900/60 flex items-center gap-2 text-sm"
			bind:this={placesContainer}
		>
			{#if placesLoading}
				<span class="text-xs text-surface-400">Loading search…</span>
			{/if}
		</div>
		{#if placesError}
			<p class="text-xs text-error-400">{placesError}</p>
		{/if}
		<div
			class="h-64 w-full overflow-hidden rounded-lg border border-surface-700 bg-surface-950"
			bind:this={mapContainer}
		></div>
		{#if eventDetails.latitude && eventDetails.longitude}
			{#if Number.isFinite(Number(eventDetails.latitude)) && Number.isFinite(Number(eventDetails.longitude))}
				<p class="text-xs text-surface-500">
					Pinned at {Number(eventDetails.latitude).toFixed(6)},
					{Number(eventDetails.longitude).toFixed(6)}
				</p>
			{:else}
				<p class="text-xs text-surface-500">Coordinates pending refinement.</p>
			{/if}
		{:else}
			<p class="text-xs text-surface-500">
				Drop a pin or click the map to set coordinates. We'll save it automatically.
			</p>
		{/if}
	</div>
	<div class="flex flex-col gap-2">
		<label class="label" for="event-contact-email">Contact email</label>
		<input
			id="event-contact-email"
			class="input bg-surface-900/60"
			type="email"
			value={eventDetails.contactEmail}
			oninput={(e) => onEventDetailsChange({ contactEmail: e.currentTarget.value })}
			placeholder="volunteers@yourgroup.org"
		/>
	</div>
	<div class="flex flex-col gap-2">
		<label class="label" for="event-contact-phone">Contact phone</label>
		<input
			id="event-contact-phone"
			class="input bg-surface-900/60"
			type="tel"
			value={eventDetails.contactPhone}
			oninput={(e) => onEventDetailsChange({ contactPhone: e.currentTarget.value })}
			placeholder="(555) 123-4567"
		/>
	</div>
</section>
