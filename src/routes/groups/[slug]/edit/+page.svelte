<script>
	let { data } = $props();
	import { FileUpload } from '@skeletonlabs/skeleton-svelte';
	import IconDropzone from '@lucide/svelte/icons/image-plus';
	import IconFile from '@lucide/svelte/icons/paperclip';
	import IconRemove from '@lucide/svelte/icons/circle-x';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import ImageGeneratorPanel from '$lib/components/ai/ImageGeneratorPanel.svelte';
	import { toaster } from '../../../toaster-svelte';
	import IconGlobe from '@lucide/svelte/icons/globe';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconFacebook from '@lucide/svelte/icons/facebook';
	import IconInstagram from '@lucide/svelte/icons/instagram';
	import BrandX from '$lib/icons/BrandX.svelte';
	import BrandStrava from '$lib/icons/BrandStrava.svelte';
	import BrandTikTok from '$lib/icons/BrandTikTok.svelte';
	import BrandBluesky from '$lib/icons/BrandBluesky.svelte';
	import BrandDiscord from '$lib/icons/BrandDiscord.svelte';
	import BrandMastodon from '$lib/icons/BrandMastodon.svelte';
	import BrandThreads from '$lib/icons/BrandThreads.svelte';
	import IconLink from '@lucide/svelte/icons/link';
	import IconMountain from '@lucide/svelte/icons/mountain';
	import { renderTurnstile, executeTurnstile, resetTurnstile } from '$lib/security/turnstile';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
	function getPageData() {
		return data ?? {};
	}
	const pageData = getPageData();

	let L; // loaded dynamically on client

	const MAX_BYTES = 10 * 1024 * 1024; // 10MB
	const ZOOM_MIN = 0.1;
	const ZOOM_MAX = 6;
	let logoTooLarge = $state(false);
	let coverTooLarge = $state(false);
	let submitError = $state('');
	let logoPreview = $state('');
	let coverPreview = $state('');
	let logoFiles = $state([]);
	let coverFiles = $state([]);
	let logoApi = $state();
	let coverApi = $state();
	let cropping = $state(false);
	let cropTarget = $state(''); // 'logo' | 'cover'
	let cropSrc = $state('');
	let cropScale = $state(1);
	let cropMinScale = $state(1);
	let cropOffset = $state({ x: 0, y: 0 });
	let cropDragging = false;
	let cropStart = { x: 0, y: 0 };
	let cropImgNatural = { w: 0, h: 0 };
	let cropReady = $state(false);
	let formEl = $state();
	let stripeAccount = $state(pageData.donation_account || null);
	let stripeBusy = $state(false);
	let stripeError = $state('');
	let stripeMessage = $state(
		pageData.stripe_status === 'connected'
			? 'Stripe account connected.'
			: pageData.stripe_status === 'error'
				? `Stripe connection failed${pageData.stripe_reason ? `: ${pageData.stripe_reason}` : ''}`
				: ''
	);
	let stripeConnected = $derived(Boolean(stripeAccount?.stripe_account_id));
	let stripeReady = $derived(Boolean(stripeAccount?.charges_enabled));

	// Crop viewport container ref (no measurements used)
	let cropContainerEl = $state(null);

	// Server logs now print profile; no client logging needed

	// Map + Places
	let mapEl;
	let map;
	let marker;
	let placesContainer;
	let placesEl;
	let placesLoading = $state(false);
	let searchText = $state('');
	let cityValue = $state((pageData.group?.city || '').trim());
	let stateValue = $state((pageData.group?.state_region || '').trim());
	let countryValue = $state((pageData.group?.country || 'US').toUpperCase());
	let locationGeocodeTimeout;
	let locationPendingGeocode;
	let locationLastKey = '';
	let locationGeocoder;
	let googlePlacesReady = false;
	let meetingAddress = $state((pageData.group?.specific_meeting_point_address || '').trim());
	function formatDefaultSearch() {
		const meetingTrim = (meetingAddress || '').trim();
		if (meetingTrim) return meetingTrim;
		const p = [];
		if (pageData.group?.city) p.push(pageData.group.city);
		if (pageData.group?.state_region) p.push(pageData.group.state_region);
		if (pageData.group?.country) p.push(pageData.group.country);
		return p.join(', ');
	}
	async function doSearch() {
		const q = (searchText || '').trim();
		if (!q) return;
		if (!window.google?.maps?.Geocoder) {
			console.warn('Google Maps Geocoder not available');
			return;
		}
		try {
			const geocoder = new window.google.maps.Geocoder();
			const { results } = await geocoder.geocode({ address: q });
			const res = results?.[0];
			const loc = res?.geometry?.location;
			if (!loc) return;
			const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
			const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
			if (typeof lat === 'number' && typeof lng === 'number') {
				placeMarker(lat, lng);
				queueSave({ fields: { latitude: lat, longitude: lng } });
			}
		} catch (e) {
			console.error('Google geocode failed', e);
		}
	}
	function ensureMap(lat = 37.8, lng = -96, zoom = 4) {
		if (!L || !mapEl) return;
		if (map) return;
		map = L.map(mapEl).setView([lat, lng], zoom);
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap contributors'
		}).addTo(map);
		map.on('click', (e) => {
			const { lat, lng } = e.latlng;
			placeMarker(lat, lng);
			queueSave({ fields: { latitude: lat, longitude: lng } });
		});
	}
	function syncLatLngInputs(lat, lng) {
		const latInput = document.getElementById('latitude');
		const lngInput = document.getElementById('longitude');
		const latNum = Number(lat);
		const lngNum = Number(lng);
		const latStr = Number.isFinite(latNum) ? latNum.toFixed(6) : '';
		const lngStr = Number.isFinite(lngNum) ? lngNum.toFixed(6) : '';
		if (latInput) latInput.value = latStr;
		if (lngInput) lngInput.value = lngStr;
	}
	function placeMarker(lat, lng) {
		syncLatLngInputs(lat, lng);
		if (!map) return;
		if (!marker) marker = L.marker([lat, lng]).addTo(map);
		marker.setLatLng([lat, lng]);
		map.setView([lat, lng], Math.max(map.getZoom(), 12));
	}
	function ensurePlacesHelpers() {
		if (typeof window === 'undefined') return false;
		const maps = window.google?.maps;
		if (!maps?.places) return false;
		if (!locationGeocoder) locationGeocoder = new maps.Geocoder();
		googlePlacesReady = Boolean(locationGeocoder);
		return googlePlacesReady;
	}
	function buildLocationConfig() {
		const countryTrim = (countryValue || '').trim().toUpperCase();
		const meetingTrim = (meetingAddress || '').trim();
		if (meetingTrim) {
			const meetingCountry = countryTrim && countryTrim !== 'OTHER' ? countryTrim : '';
			return {
				query: meetingTrim,
				country: meetingCountry,
				key: `${meetingTrim}|${meetingCountry}`
			};
		}
		const cityTrim = (cityValue || '').trim();
		const stateTrim = (stateValue || '').trim();
		const parts = [];
		if (cityTrim) parts.push(cityTrim);
		if (stateTrim) parts.push(stateTrim);
		if (!parts.length) return null;
		if (countryTrim && countryTrim !== 'OTHER') parts.push(countryTrim);
		const query = parts.join(', ');
		if (!query) return null;
		const countryCode = countryTrim && countryTrim !== 'OTHER' ? countryTrim : '';
		return { query, country: countryCode, key: `${query}|${countryCode}` };
	}
	function scheduleLocationGeocode(options = {}) {
		const config = buildLocationConfig();
		if (!config) return;
		if (!options.force && config.key === locationLastKey) return;
		locationPendingGeocode = config;
		if (!ensurePlacesHelpers()) return;
		const run = () => runLocationGeocode(config);
		clearTimeout(locationGeocodeTimeout);
		if (options.immediate) run();
		else locationGeocodeTimeout = setTimeout(run, 600);
	}
	async function runLocationGeocode(config) {
		if (!config) return;
		const active = locationPendingGeocode;
		try {
			const coords = await fetchLocationWithGeocoder(config.query, config.country);
			if (!coords) return;
			if (active && active.key !== config.key) return;
			locationLastKey = config.key;
			placeMarker(coords.lat, coords.lng);
			queueSave({ fields: { latitude: coords.lat, longitude: coords.lng } });
		} catch (error) {
			console.error('Failed to geocode city/state', error);
		}
	}
	function fetchLocationWithGeocoder(query, countryCode) {
		if (!locationGeocoder) return Promise.resolve(null);
		return new Promise((resolve) => {
			const request = { address: query };
			if (countryCode) request.componentRestrictions = { country: countryCode };
			locationGeocoder.geocode(request, (results, status) => {
				const okStatus = window.google?.maps?.GeocoderStatus?.OK;
				if (status !== 'OK' && status !== okStatus) {
					resolve(null);
					return;
				}
				const result = results?.[0];
				const loc = result?.geometry?.location;
				if (!loc) {
					resolve(null);
					return;
				}
				const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
				const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
				if (typeof lat === 'number' && typeof lng === 'number') resolve({ lat, lng });
				else resolve(null);
			});
		});
	}
	function onLocationBlur() {
		scheduleLocationGeocode({ immediate: true, force: true });
	}
	function loadGooglePlaces() {
		if (typeof window === 'undefined') return;
		if (window.google?.maps?.places) {
			ensurePlacesHelpers();
			return initPlaces();
		}
		const key = env.PUBLIC_GOOGLE_MAPS_API_KEY;
		if (!key) {
			console.warn('Missing PUBLIC_GOOGLE_MAPS_API_KEY');
			return;
		}
		if (document.getElementById('gmaps-places')) return; // already loading

		placesLoading = true;
		const s = document.createElement('script');
		s.id = 'gmaps-places';
		s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&v=beta&callback=initGooglePlaces`;
		s.async = true;
		s.defer = true;
		s.onerror = () => {
			placesLoading = false;
			console.error('Failed to load Google Maps Places');
		};
		document.head.appendChild(s);
	}
	function initPlaces() {
		placesLoading = false;
		try {
			if (!ensurePlacesHelpers()) return;
			googlePlacesReady = true;
			if (locationPendingGeocode?.query) {
				scheduleLocationGeocode({ immediate: true, force: true });
			}
			if (!placesContainer || !window.google?.maps?.places) return;
			const PAE = window.google.maps.places.PlaceAutocompleteElement;
			if (PAE) {
				placesEl = new PAE();
				const def = formatDefaultSearch();
				if (def) placesEl.value = def;
				placesContainer.innerHTML = '';
				placesContainer.appendChild(placesEl);
				placesEl.addEventListener('gmp-select', async ({ placePrediction }) => {
					try {
						const place = placePrediction.toPlace();
						await place.fetchFields({ fields: ['location', 'viewport'] });
						const loc = place.location;
						let lat, lng;
						if (loc) {
							lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
							lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
						}
						if (typeof lat === 'number' && typeof lng === 'number') {
							placeMarker(lat, lng);
							queueSave({ fields: { latitude: lat, longitude: lng } });
						}
					} catch (err) {
						console.error('Place selection failed', err);
					}
				});
				return;
			}
			// Fallback to legacy Autocomplete
			const input = document.createElement('input');
			input.className = 'input bg-primary-50-950/30';
			input.placeholder = 'Start typing a city or address…';
			const def = formatDefaultSearch();
			if (def) input.value = def;
			placesContainer.innerHTML = '';
			placesContainer.appendChild(input);
			if (window.google.maps.places.Autocomplete) {
				const ac = new window.google.maps.places.Autocomplete(input, {
					fields: ['geometry'],
					types: ['(regions)']
				});
				ac.addListener('place_changed', () => {
					const p = ac.getPlace();
					const loc = p?.geometry?.location;
					if (!loc) return;
					const lat = loc.lat();
					const lng = loc.lng();
					placeMarker(lat, lng);
					queueSave({ fields: { latitude: lat, longitude: lng } });
				});
			}
		} catch (e) {
			console.error('Failed to init Places', e);
		}
	}

	// No resize listeners while modal is open to avoid layout loops

	// Removed reactive loop on cropScale; clamp offsets on explicit events instead

	onMount(async () => {
		// Make initPlaces globally available for the callback
		window.initGooglePlaces = initPlaces;
		const readVal = (id) => document.getElementById(id)?.value?.trim() || '';
		meetingAddress = readVal('specific_meeting_point_address');
		cityValue = readVal('city');
		stateValue = readVal('state_region');
		const countryEl = document.getElementById('country');
		if (countryEl) countryValue = (countryEl.value || countryValue).toUpperCase();

		if (data.group?.logo_url) {
			logoPreview = data.group.logo_url;
		}
		if (data.group?.cover_photo_url) {
			coverPreview = data.group.cover_photo_url;
		}
		// Map init
		try {
			const mod = await import('leaflet');
			L = mod.default || mod;
			const { ensureLeafletDefaultIcon } = await import('$lib/map/leaflet');
			await ensureLeafletDefaultIcon(L);
		} catch (e) {
			console.error('Failed to load Leaflet', e);
		}
		const hasCoords =
			Number.isFinite(data.group?.latitude) && Number.isFinite(data.group?.longitude);
		const lat = hasCoords ? Number(data.group.latitude) : 37.8;
		const lng = hasCoords ? Number(data.group.longitude) : -96;
		requestAnimationFrame(() => {
			ensureMap(lat, lng, hasCoords ? 12 : 4);
			if (hasCoords) placeMarker(lat, lng);
		});
		if (placesContainer) {
			loadGooglePlaces();
		}
		if (!hasCoords && (meetingAddress || '').trim()) {
			scheduleLocationGeocode({ force: true });
		}

		return () => {
			// Cleanup the global function when the component is destroyed
			if (window.initGooglePlaces === initPlaces) {
				delete window.initGooglePlaces;
			}
			if (locationGeocodeTimeout) clearTimeout(locationGeocodeTimeout);
		};
	});

	function openCropper(target, file) {
		if (!file) return;
		const arr = Array.from(file instanceof FileList || Array.isArray(file) ? file : [file]);
		const f = arr[0];
		if (!f) return;
		const url = URL.createObjectURL(f);
		cropSrc = url;
		cropTarget = target;
		cropScale = 1;
		cropMinScale = 1;
		cropOffset = { x: 0, y: 0 };
		cropReady = false;
		cropping = true;
	}

	function onCropImgLoad(e) {
		const img = e.target;
		cropImgNatural = { w: img.naturalWidth, h: img.naturalHeight };
		// Load at 1x and centered via CSS transform; user will zoom as needed
		cropScale = 1;
		cropOffset = { x: 0, y: 0 };
		cropReady = true;
	}

	// Pinch + drag handling
	let activePointers = new Map(); // id -> { x, y }
	let isPinching = false;
	let pinchStartDistance = 0;
	let pinchStartScale = 1;
	let pinchStartOffset = { x: 0, y: 0 };
	let pinchCenter = { x: 0, y: 0 };

	function onCropPointerDown(e) {
		activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		// Capture pointer to this element for consistent move/up events
		try {
			e.currentTarget?.setPointerCapture?.(e.pointerId);
		} catch {}
		if (activePointers.size === 2) {
			const pts = Array.from(activePointers.values());
			const dx = pts[1].x - pts[0].x;
			const dy = pts[1].y - pts[0].y;
			pinchStartDistance = Math.hypot(dx, dy) || 1;
			pinchStartScale = cropScale;
			pinchStartOffset = { ...cropOffset };
			const rect = cropContainerEl?.getBoundingClientRect?.();
			const cx = (pts[0].x + pts[1].x) / 2 - (rect?.left || 0);
			const cy = (pts[0].y + pts[1].y) / 2 - (rect?.top || 0);
			pinchCenter = { x: cx, y: cy };
			isPinching = true;
			cropDragging = false;
		} else if (activePointers.size === 1) {
			cropDragging = true;
			cropStart = { x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y };
		}
		e.preventDefault();
	}
	function onCropPointerMove(e) {
		if (activePointers.has(e.pointerId)) {
			activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		}
		if (isPinching && activePointers.size >= 2) {
			const pts = Array.from(activePointers.values());
			const dx = pts[1].x - pts[0].x;
			const dy = pts[1].y - pts[0].y;
			const dist = Math.hypot(dx, dy) || 1;
			const factor = dist / (pinchStartDistance || 1);
			const maxScale = ZOOM_MAX;
			const newScale = Math.max(ZOOM_MIN, Math.min(maxScale, pinchStartScale * factor));
			const imgX = (pinchCenter.x - pinchStartOffset.x) / pinchStartScale;
			const imgY = (pinchCenter.y - pinchStartOffset.y) / pinchStartScale;
			cropScale = newScale;
			cropOffset = { x: pinchCenter.x - imgX * cropScale, y: pinchCenter.y - imgY * cropScale };
			// no clamping without measurements
		} else if (cropDragging) {
			cropOffset = { x: e.clientX - cropStart.x, y: e.clientY - cropStart.y };
		}
	}
	function onCropPointerUp(e) {
		// Release pointer capture if held
		try {
			e.currentTarget?.releasePointerCapture?.(e.pointerId);
		} catch {}
		cropDragging = false;
		isPinching = false;
		activePointers.clear();
	}

	async function applyCrop() {
		// Render to canvas with desired aspect
		const ar = cropTarget === 'logo' ? 1 : 16 / 9;
		const outW = cropTarget === 'logo' ? 800 : 1600;
		const outH = Math.round(outW / ar);
		const img = document.getElementById('crop-img');
		if (!img) return;

		// Compute the visible area in image coordinates using DOM rects (robust to any CSS/layout)
		const imgRect = img.getBoundingClientRect();
		const contRect = cropContainerEl?.getBoundingClientRect?.() || {
			left: 0,
			top: 0,
			width: 800,
			height: 800
		};
		const left = imgRect.left - contRect.left; // image top-left within viewport (CSS px)
		const top = imgRect.top - contRect.top;
		const scaleDom = imgRect.width / cropImgNatural.w || 1; // CSS px per image px
		const sx = Math.max(0, -left / scaleDom);
		const sy = Math.max(0, -top / scaleDom);
		const sWidth = Math.min(cropImgNatural.w - sx, contRect.width / scaleDom);
		const sHeight = Math.min(cropImgNatural.h - sy, contRect.height / scaleDom);

		const canvas = document.createElement('canvas');
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext('2d');
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, outW, outH);

		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
		if (!blob) return;
		const dataUrl = await new Promise((resolve) => {
			const fr = new FileReader();
			fr.onload = () => resolve(fr.result);
			fr.readAsDataURL(blob);
		});
		if (cropTarget === 'logo') {
			if (logoPreview) URL.revokeObjectURL(logoPreview);
			logoPreview = URL.createObjectURL(blob);
			const input = document.getElementById('logo_file_cropped');
			if (input) input.value = dataUrl;
			// Autosave cropped logo immediately
			try {
				saving = true;
				const res = await fetch(`/api/groups/${data.group?.slug}/autosave`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ logo_file_cropped: dataUrl })
				});
				if (!res.ok) {
					throw new Error(await res.text());
				}
				notifySaved('Logo updated');
			} catch (e) {
				console.error('Autosave cropped logo failed', e);
				notifyError('Failed to save logo');
			} finally {
				saving = false;
			}
		} else if (cropTarget === 'cover') {
			if (coverPreview) URL.revokeObjectURL(coverPreview);
			coverPreview = URL.createObjectURL(blob);
			const input = document.getElementById('cover_file_cropped');
			if (input) input.value = dataUrl;
			// Autosave cropped cover immediately
			try {
				saving = true;
				const res = await fetch(`/api/groups/${data.group?.slug}/autosave`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ cover_file_cropped: dataUrl })
				});
				if (!res.ok) {
					throw new Error(await res.text());
				}
				notifySaved('Cover photo updated');
			} catch (e) {
				console.error('Autosave cropped cover failed', e);
				notifyError('Failed to save cover photo');
			} finally {
				saving = false;
			}
		}
		closeCropper();
	}

	function closeCropper() {
		if (cropSrc) URL.revokeObjectURL(cropSrc);
		cropSrc = '';
		cropping = false;
		cropTarget = '';
	}

	// AUTOSAVE: debounced field updates
	let saveTimer;
	let pending = {};
	let saving = $state(false);
	const isAdminUser = $derived(Boolean(pageData.current_profile?.admin));
	let deepEnrichLoading = $state(false);
	let deepEnrichError = $state('');
	let deepEnrichSuccess = $state('');

	function notifySaved(title = 'Changes saved') {
		toaster.success({
			title,
			duration: 2500
		});
	}

	function notifyError(title = 'Failed to save changes') {
		toaster.error({
			title,
			duration: 4000
		});
	}

	function queueSave(partial) {
		pending = { ...pending, ...partial };
		clearTimeout(saveTimer);
		saveTimer = setTimeout(runSave, 600);
	}
	async function runSave() {
		const body = { ...pending };
		pending = {};
		if (!Object.keys(body).length) {
			return;
		}
		saving = true;
		try {
			const res = await fetch(`/api/groups/${data.group?.slug}/autosave`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(await res.text());
			notifySaved();
		} catch (e) {
			console.error('Autosave failed', e);
			notifyError();
		} finally {
			saving = false;
		}
	}

	function onField(e) {
		const el = e.currentTarget;
		const key = el.name;
		if (!key) return;
		let val = el.value;
		if (key === 'city') cityValue = (val || '').trim();
		if (key === 'state_region') stateValue = (val || '').trim();
		if (key === 'specific_meeting_point_address') {
			meetingAddress = (val || '').trim();
			scheduleLocationGeocode({ force: true });
		}
		if (key === 'country') {
			val = (val || '').toUpperCase();
			countryValue = val;
			scheduleLocationGeocode({ immediate: true, force: true });
		}
		if (key === 'website_url') websiteLocal = val;
		if (key === 'public_contact_email') emailLocal = val;
		if (key === 'public_phone_number') phoneLocal = val;
		queueSave({ fields: { [key]: val } });
	}

	function onMMChange() {
		const q = (sel) =>
			Array.from(document.querySelectorAll(sel))
				.filter((x) => x.checked)
				.map((x) => Number(x.value))
				.filter(Boolean);
		const gt = q('input[name="group_type_ids"]');
		const af = q('input[name="audience_focus_ids"]');
		const rd = q('input[name="riding_discipline_ids"]');
		const sl = q('input[name="skill_level_ids"]');
		queueSave({
			group_type_ids: gt,
			audience_focus_ids: af,
			riding_discipline_ids: rd,
			skill_level_ids: sl
		});
	}

	function collectSocialLinksFromInputs() {
		const getVal = (id) => document.getElementById(id)?.value?.trim() || '';
		const buildUrl = (v, p) =>
			!v ? null : /^https?:\/\//i.test(v) ? v : `${p}${v.replace(/^@/, '')}`;
		const socials = {
			instagram: buildUrl(getVal('social_instagram'), 'https://www.instagram.com/'),
			facebook: buildUrl(getVal('social_facebook'), 'https://www.facebook.com/'),
			x: buildUrl(getVal('social_x'), 'https://x.com/'),
			threads: buildUrl(getVal('social_threads'), 'https://www.threads.net/@'),
			mastodon: (() => {
				const v = getVal('social_mastodon');
				if (!v) return null;
				if (/^https?:\/\//i.test(v)) return v;
				const s = v.replace(/^@/, '');
				if (s.includes('@')) {
					const [user, host] = s.split('@');
					if (user && host) return `https://${host}/@${user}`;
				}
				// Fallback to mastodon.social if only username provided
				return `https://mastodon.social/@${s}`;
			})(),
			youtube: (() => {
				const v = getVal('social_youtube');
				if (!v) return null;
				if (/^https?:\/\//i.test(v)) return v;
				const h = v.startsWith('@') ? v : `@${v}`;
				return `https://www.youtube.com/${h}`;
			})(),
			tiktok: buildUrl(getVal('social_tiktok'), 'https://www.tiktok.com/@'),
			strava: (() => {
				const v = getVal('social_strava');
				if (!v) return null;
				if (/^https?:\/\//i.test(v)) return v;
				return `https://www.strava.com/clubs/${v}`;
			})(),
			bluesky: (() => {
				const v = getVal('social_bluesky');
				if (!v) return null;
				if (/^https?:\/\//i.test(v)) return v;
				return `https://bsky.app/profile/${v.replace(/^@/, '')}`;
			})(),
			discord: (() => {
				const v = getVal('social_discord');
				if (!v) return null;
				if (/^https?:\/\//i.test(v)) return v;
				// Accept invite codes or vanity names
				return `https://discord.gg/${v.replace(/^@/, '')}`;
			})(),
			linkedin: (() => {
				const v = getVal('social_linkedin');
				if (!v) return null;
				if (/^https?:\/\//i.test(v)) return v;
				return `https://www.linkedin.com/company/${v}`;
			})()
		};
		return Object.fromEntries(Object.entries(socials).filter(([_, v]) => !!v));
	}

	function onSocialsChange() {
		const cleaned = collectSocialLinksFromInputs();
		socialsLocal = { ...cleaned };
		queueSave({ fields: { social_links: Object.keys(cleaned).length ? cleaned : null } });
	}

	function buildGroupImageContext() {
		const formData = new FormData(formEl);
		const selectedAudience = Array.from(
			formEl?.querySelectorAll?.('input[name="audience_focus_ids"]:checked') ?? []
		)
			.map((input) => {
				const id = Number(input.value);
				return data.audience_focuses.find((item) => item.id === id)?.name || '';
			})
			.filter(Boolean);
		const selectedDisciplines = Array.from(
			formEl?.querySelectorAll?.('input[name="riding_discipline_ids"]:checked') ?? []
		)
			.map((input) => {
				const id = Number(input.value);
				return data.riding_disciplines.find((item) => item.id === id)?.name || '';
			})
			.filter(Boolean);

		return {
			name: formData.get('name')?.toString().trim() || data.group?.name || '',
			tagline: formData.get('tagline')?.toString().trim() || '',
			description: formData.get('description')?.toString().trim() || '',
			location: [
				formData.get('specific_meeting_point_address'),
				formData.get('city'),
				formData.get('state_region'),
				formData.get('country')
			]
				.map((value) => (value == null ? '' : String(value).trim()))
				.filter(Boolean)
				.join(', '),
			serviceArea: formData.get('service_area_description')?.toString().trim() || '',
			activityFrequency: formData.get('activity_frequency')?.toString().trim() || '',
			typicalTime: formData.get('typical_activity_day_time')?.toString().trim() || '',
			ridingDisciplines: selectedDisciplines,
			audienceFocuses: selectedAudience,
			howToJoin: formData.get('how_to_join_instructions')?.toString().trim() || ''
		};
	}

	function selectedCategoryNames(inputName, catalog = []) {
		const checked = Array.from(
			formEl?.querySelectorAll?.(`input[name="${inputName}"]:checked`) ?? []
		)
			.map((input) => Number(input.value))
			.filter((value) => Number.isFinite(value));
		const out = [];
		for (const id of checked) {
			const name = catalog.find((row) => Number(row.id) === Number(id))?.name;
			if (name && !out.includes(name)) out.push(name);
		}
		return out;
	}

	function buildExistingProfileForDeepEnrich() {
		const formData = new FormData(formEl);
		const getText = (key, fallback = '') => formData.get(key)?.toString().trim() || fallback;
		const getNumber = (key) => {
			const raw = formData.get(key)?.toString().trim();
			if (!raw) return null;
			const n = Number(raw);
			return Number.isFinite(n) ? n : null;
		};
		const socialLinks = collectSocialLinksFromInputs();
		const fields = {
			name: getText('name', pageData.group?.name || ''),
			tagline: getText('tagline', pageData.group?.tagline || ''),
			description: getText('description', pageData.group?.description || ''),
			city: getText('city', pageData.group?.city || ''),
			state_region: getText('state_region', pageData.group?.state_region || ''),
			country: getText('country', pageData.group?.country || 'US').toUpperCase(),
			website_url: getText('website_url', pageData.group?.website_url || ''),
			public_contact_email: getText(
				'public_contact_email',
				pageData.group?.public_contact_email || ''
			),
			public_phone_number: getText('public_phone_number', pageData.group?.public_phone_number || ''),
			preferred_contact_method_instructions: getText(
				'preferred_contact_method_instructions',
				pageData.group?.preferred_contact_method_instructions || ''
			),
			how_to_join_instructions: getText(
				'how_to_join_instructions',
				pageData.group?.how_to_join_instructions || ''
			),
			membership_info: getText('membership_info', pageData.group?.membership_info || ''),
			specific_meeting_point_address: getText(
				'specific_meeting_point_address',
				pageData.group?.specific_meeting_point_address || ''
			),
			latitude: getNumber('latitude'),
			longitude: getNumber('longitude'),
			service_area_description: getText(
				'service_area_description',
				pageData.group?.service_area_description || ''
			),
			skill_levels_description: getText(
				'skill_levels_description',
				pageData.group?.skill_levels_description || ''
			),
			activity_frequency: getText('activity_frequency', pageData.group?.activity_frequency || ''),
			typical_activity_day_time: getText(
				'typical_activity_day_time',
				pageData.group?.typical_activity_day_time || ''
			),
			logo_url: pageData.group?.logo_url || '',
			cover_photo_url: pageData.group?.cover_photo_url || '',
			social_links: socialLinks
		};
		const categories = {
			group_types: selectedCategoryNames('group_type_ids', pageData.group_types || []),
			audience_focuses: selectedCategoryNames('audience_focus_ids', pageData.audience_focuses || []),
			riding_disciplines: selectedCategoryNames(
				'riding_discipline_ids',
				pageData.riding_disciplines || []
			),
			skill_levels: selectedCategoryNames('skill_level_ids', pageData.skill_levels || [])
		};
		const extras = {
			zip_code: getText('zip_code', pageData.group?.zip_code || ''),
			preferred_cta_kind: ctaKind || pageData.group?.preferred_cta_kind || 'auto',
			preferred_cta_label: ctaLabel || pageData.group?.preferred_cta_label || '',
			preferred_cta_url: ctaUrl || pageData.group?.preferred_cta_url || ''
		};
		return { fields, categories, extras };
	}

	function applySocialLinksToInputs(links) {
		const map = {
			instagram: 'social_instagram',
			facebook: 'social_facebook',
			x: 'social_x',
			threads: 'social_threads',
			mastodon: 'social_mastodon',
			youtube: 'social_youtube',
			tiktok: 'social_tiktok',
			strava: 'social_strava',
			bluesky: 'social_bluesky',
			discord: 'social_discord',
			linkedin: 'social_linkedin'
		};
		for (const [key, inputId] of Object.entries(map)) {
			const el = document.getElementById(inputId);
			if (el) el.value = links?.[key] || '';
		}
		socialsLocal = { ...(links || {}) };
	}

	function applyEnrichedProfile(payload) {
		const fields = payload?.fields || {};
		const setField = (key, value) => {
			const el = formEl?.querySelector?.(`[name="${key}"]`);
			if (!el) return;
			const normalized = value == null ? '' : String(value);
			el.value = normalized;
			if (key === 'city') cityValue = normalized.trim();
			if (key === 'state_region') stateValue = normalized.trim();
			if (key === 'country') countryValue = normalized.trim().toUpperCase();
			if (key === 'specific_meeting_point_address') meetingAddress = normalized.trim();
			if (key === 'website_url') websiteLocal = normalized;
			if (key === 'public_contact_email') emailLocal = normalized;
			if (key === 'public_phone_number') phoneLocal = normalized;
		};

		const fieldsPatch = {};
		const scalarKeys = [
			'name',
			'tagline',
			'description',
			'city',
			'state_region',
			'country',
			'website_url',
			'public_contact_email',
			'public_phone_number',
			'preferred_contact_method_instructions',
			'how_to_join_instructions',
			'membership_info',
			'specific_meeting_point_address',
			'service_area_description',
			'skill_levels_description',
			'activity_frequency',
			'typical_activity_day_time',
			'logo_url',
			'cover_photo_url'
		];
		for (const key of scalarKeys) {
			const value = fields[key];
			if (typeof value !== 'string' || !value.trim()) continue;
			setField(key, value.trim());
			fieldsPatch[key] = value.trim();
		}
		if (Number.isFinite(fields.latitude) && Number.isFinite(fields.longitude)) {
			setField('latitude', Number(fields.latitude).toFixed(6));
			setField('longitude', Number(fields.longitude).toFixed(6));
			fieldsPatch.latitude = Number(fields.latitude);
			fieldsPatch.longitude = Number(fields.longitude);
		}

		const currentSocial = collectSocialLinksFromInputs();
		const mergedSocial = { ...currentSocial };
		if (fields.social_links && typeof fields.social_links === 'object') {
			for (const [key, value] of Object.entries(fields.social_links)) {
				if (typeof value === 'string' && value.trim()) mergedSocial[key] = value.trim();
			}
		}
		applySocialLinksToInputs(mergedSocial);
		fieldsPatch.social_links = Object.keys(mergedSocial).length ? mergedSocial : null;
		queueSave({ fields: fieldsPatch });

		const categoryPayload = payload?.categories || {};
		let categoryChanged = false;
		const applyCategoryNames = (names, inputName, catalog) => {
			const normalized = new Set(
				(Array.isArray(names) ? names : [])
					.map((name) => String(name || '').trim().toLowerCase())
					.filter(Boolean)
			);
			if (!normalized.size) return;
			for (const row of catalog || []) {
				const rowName = String(row?.name || '').trim().toLowerCase();
				if (!rowName || !normalized.has(rowName)) continue;
				const box = formEl?.querySelector?.(`input[name="${inputName}"][value="${row.id}"]`);
				if (box && !box.checked) {
					box.checked = true;
					categoryChanged = true;
				}
			}
		};
		applyCategoryNames(categoryPayload.group_types, 'group_type_ids', pageData.group_types || []);
		applyCategoryNames(
			categoryPayload.audience_focuses,
			'audience_focus_ids',
			pageData.audience_focuses || []
		);
		applyCategoryNames(
			categoryPayload.riding_disciplines,
			'riding_discipline_ids',
			pageData.riding_disciplines || []
		);
		if (categoryChanged) onMMChange();
	}

	async function runDeepEnrichFromExistingProfile() {
		if (!isAdminUser || deepEnrichLoading) return;
		deepEnrichError = '';
		deepEnrichSuccess = '';
		deepEnrichLoading = true;
		try {
			if (Object.keys(pending || {}).length) await runSave();
			const profileContext = buildExistingProfileForDeepEnrich();
			const res = await fetch('/api/ai/enrich-group', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					instagram: profileContext?.fields?.social_links?.instagram || '',
					facebook: profileContext?.fields?.social_links?.facebook || '',
					website: profileContext?.fields?.website_url || '',
					name: profileContext?.fields?.name || '',
					existing_profile: profileContext
				})
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || 'Deep enrichment request failed.');
			}
			const payload = await res.json();
			applyEnrichedProfile(payload);
			deepEnrichSuccess = 'AI profile expansion applied. New details are being autosaved.';
			notifySaved('AI enrichment applied');
		} catch (error) {
			deepEnrichError = error?.message || 'Failed to run deep AI enrichment.';
			notifyError('AI enrichment failed');
		} finally {
			deepEnrichLoading = false;
		}
	}

	function applyGeneratedGroupCover(result) {
		const url = result?.url || '';
		if (!url) return;
		coverPreview = url;
		queueSave({ fields: { cover_photo_url: url } });
	}

	// Preferred CTA
	function onCtaKindChange(e) {
		const kind = e?.target?.value || 'auto';
		ctaKind = kind;
		queueSave({
			fields: { preferred_cta_kind: kind, preferred_cta_label: null, preferred_cta_url: null }
		});
	}

	function onCtaLabelInput(e) {
		const el = e.currentTarget;
		let v = (el.value || '').slice(0, 10);
		if (v !== el.value) el.value = v;
		ctaLabel = v;
		queueSave({ fields: { preferred_cta_label: v } });
	}

	function onCtaUrlInput(e) {
		const v = e.currentTarget.value || '';
		ctaUrl = v;
		if (/^https?:\/\/.+/i.test(v)) {
			queueSave({ fields: { preferred_cta_url: v } });
		}
	}

	function connectStripeForGroup() {
		const slug = data.group?.slug || '';
		if (!slug) return;
		window.location.href = `/api/donations/connect/start?recipient=group&group=${encodeURIComponent(slug)}`;
	}

	async function disconnectStripeForGroup() {
		if (typeof window !== 'undefined') {
			const ok = window.confirm('Disconnect this group Stripe account?');
			if (!ok) return;
		}
		stripeError = '';
		stripeMessage = '';
		stripeBusy = true;
		try {
			const res = await fetch('/api/donations/connect/disconnect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipient: 'group', group: data.group?.slug || '' })
			});
			const payload = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(payload?.error || 'Failed to disconnect Stripe account.');
			}
			stripeAccount = {
				...(stripeAccount || {}),
				stripe_account_id: null,
				stripe_account_email: null,
				charges_enabled: false,
				payouts_enabled: false,
				connected_at: null
			};
			stripeMessage = 'Stripe account disconnected.';
		} catch (error) {
			stripeError = error?.message || 'Failed to disconnect Stripe account.';
		} finally {
			stripeBusy = false;
		}
	}

	// Owner invite
	let ownerEmail = $state('');
	let ownerLoading = $state(false);
	let ownerError = $state('');
	let ownerSuccess = $state('');
	let ownerValid = $derived(/^\S+@\S+\.[^\s@]+$/.test(ownerEmail));
	let ownerHoneypot = $state('');
	const turnstileEnabled = Boolean(PUBLIC_TURNSTILE_SITE_KEY);
	let ownerTurnstileEl = $state(null);
	let ownerTurnstileWidgetId = $state(null);
	// Local reactive owners list so UI updates on removal
	let owners = $state((pageData.owners || []).slice());

	async function initOwnerTurnstile() {
		if (!turnstileEnabled || !ownerTurnstileEl || ownerTurnstileWidgetId) return;
		try {
			const widgetId = await renderTurnstile(ownerTurnstileEl, {
				sitekey: PUBLIC_TURNSTILE_SITE_KEY,
				size: 'invisible'
			});
			ownerTurnstileWidgetId = widgetId;
		} catch (err) {
			console.error('Failed to initialize Turnstile widget', err);
		}
	}

	$effect(() => {
		if (turnstileEnabled && ownerTurnstileEl && !ownerTurnstileWidgetId) {
			initOwnerTurnstile();
		}
	});
	async function inviteOwner(e) {
		e?.preventDefault?.();
		ownerError = '';
		ownerSuccess = '';
		if (!ownerValid) {
			ownerError = 'Enter a valid email address.';
			return;
		}
		if (ownerHoneypot.trim()) {
			ownerError = 'Invalid submission.';
			return;
		}
		ownerLoading = true;
		try {
			let turnstileToken = '';
			if (turnstileEnabled) {
				await initOwnerTurnstile();
				if (!ownerTurnstileWidgetId) {
					ownerError = 'Verification failed. Please reload and try again.';
					ownerLoading = false;
					return;
				}
				turnstileToken = await executeTurnstile(ownerTurnstileWidgetId);
				if (!turnstileToken) {
					ownerError = 'Verification failed. Please try again.';
					ownerLoading = false;
					return;
				}
			}
			const rtUrl = new URL(window.location.href);
			rtUrl.searchParams.set('auto_add_owner', data.group?.slug || '');
			const res = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: ownerEmail,
					createProfile: true,
					returnTo: rtUrl.pathname + rtUrl.search + rtUrl.hash,
					honeypot: ownerHoneypot,
					turnstileToken
				})
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				throw new Error(j.error || 'Failed to send invite');
			}
			ownerSuccess = `Invite sent to ${ownerEmail}. They will be added when they sign in.`;
			ownerEmail = '';
			ownerHoneypot = '';
		} catch (err) {
			ownerError = err.message || 'Failed to send invite.';
		} finally {
			ownerLoading = false;
			if (turnstileEnabled && ownerTurnstileWidgetId) {
				resetTurnstile(ownerTurnstileWidgetId);
			}
		}
	}

	async function removeOwner(uid, email) {
		try {
			const label = email || uid;
			if (typeof window !== 'undefined') {
				const ok = window.confirm(`Remove owner ${label}?`);
				if (!ok) return;
			}
			const res = await fetch(`/api/groups/${data.group?.slug}/owners/remove`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: uid })
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				throw new Error(j.error || 'Failed to remove owner');
			}
			// Optimistically update the list
			const idx = owners.findIndex((x) => x.user_id === uid);
			if (idx > -1) owners.splice(idx, 1);
			ownerSuccess = `Owner ${label} removed.`;
			ownerError = '';
		} catch (err) {
			ownerError = err.message || 'Failed to remove owner.';
			ownerSuccess = '';
		}
	}

	let ctaKind = $state(pageData.group?.preferred_cta_kind || 'auto');
	let ctaLabel = $state(pageData.group?.preferred_cta_label || '');
	let ctaUrl = $state(pageData.group?.preferred_cta_url || '');
	let customUrlValid = $derived(!ctaUrl || /^https?:\/\/.+/i.test(ctaUrl));

	// Live values for availability and preview
	let websiteLocal = $state(pageData.group?.website_url || '');
	let emailLocal = $state(pageData.group?.public_contact_email || '');
	let phoneLocal = $state(pageData.group?.public_phone_number || '');
	let socialsLocal = $state({ ...(pageData.group?.social_links || {}) });

	const ctaChoices = [
		{ key: 'auto', label: 'Auto', icon: IconLink },
		{ key: 'website', label: 'Website', icon: IconGlobe },
		{ key: 'email', label: 'Email', icon: IconMail },
		{ key: 'phone', label: 'Phone', icon: IconPhone },
		{ key: 'facebook', label: 'Facebook', icon: IconFacebook },
		{ key: 'instagram', label: 'Instagram', icon: IconInstagram },
		{ key: 'strava', label: 'Strava', icon: BrandStrava },
		{ key: 'x', label: 'X', icon: BrandX },
		{ key: 'tiktok', label: 'TikTok', icon: BrandTikTok },
		{ key: 'mastodon', label: 'Mastodon', icon: BrandMastodon },
		{ key: 'discord', label: 'Discord', icon: BrandDiscord },
		{ key: 'custom', label: 'Custom', icon: null }
	];

	function setCtaKind(kind) {
		ctaKind = kind;
		onCtaKindChange({ target: { value: kind } });
	}

	let availableByKind = $derived(() => ({
		auto: true,
		custom: true,
		website: !!(websiteLocal || '').trim(),
		email: !!(emailLocal || '').trim(),
		phone: !!(phoneLocal || '').trim(),
		facebook: !!(socialsLocal.facebook || '').trim(),
		instagram: !!(socialsLocal.instagram || '').trim(),
		strava: !!(socialsLocal.strava || '').trim(),
		x: !!(socialsLocal.x || '').trim(),
		tiktok: !!(socialsLocal.tiktok || '').trim(),
		mastodon: !!(socialsLocal.mastodon || '').trim(),
		discord: !!(socialsLocal.discord || '').trim()
	}));

	function ctaUnavailableReason(kind) {
		switch (kind) {
			case 'website':
				return 'Add a Website URL above to enable';
			case 'email':
				return 'Add a Public Email above to enable';
			case 'phone':
				return 'Add a Public Phone above to enable';
			case 'facebook':
				return 'Add your Facebook link under Socials to enable';
			case 'instagram':
				return 'Add your Instagram link under Socials to enable';
			case 'strava':
				return 'Add your Strava link under Socials to enable';
			case 'x':
				return 'Add your X (Twitter) link under Socials to enable';
			case 'tiktok':
				return 'Add your TikTok link under Socials to enable';
			default:
				return '';
		}
	}

	function pickCtaPreview() {
		const kind = ctaKind || 'auto';
		const website = (websiteLocal || '').trim()
			? { key: 'website', href: (websiteLocal || '').trim(), label: 'Website' }
			: null;
		const email = (emailLocal || '').trim()
			? { key: 'email', href: `mailto:${(emailLocal || '').trim()}`, label: 'Email' }
			: null;
		const phone = (phoneLocal || '').trim()
			? { key: 'phone', href: `tel:${(phoneLocal || '').trim()}`, label: 'Call' }
			: null;
		const socials = socialsLocal || {};
		const mapSocial = (k, label) => (socials[k] ? { key: k, href: socials[k], label } : null);
		const fb = mapSocial('facebook', 'Facebook');
		const ig = mapSocial('instagram', 'Instagram');
		const st = mapSocial('strava', 'Strava');
		const xx = mapSocial('x', 'X');
		const tt = mapSocial('tiktok', 'TikTok');
		const md = mapSocial('mastodon', 'Mastodon');
		const dc = mapSocial('discord', 'Discord');

		if (kind === 'custom') {
			if (ctaLabel && /^https?:\/\/.+/i.test(ctaUrl))
				return { key: 'custom', href: ctaUrl, label: ctaLabel };
		}
		if (kind === 'website' && website) return website;
		if (kind === 'email' && email) return email;
		if (kind === 'phone' && phone) return phone;
		if (kind === 'facebook' && fb) return fb;
		if (kind === 'instagram' && ig) return ig;
		if (kind === 'strava') return st || { key: 'strava', href: '#', label: 'Strava' };
		if (kind === 'x') return xx || { key: 'x', href: '#', label: 'X' };
		if (kind === 'tiktok') return tt || { key: 'tiktok', href: '#', label: 'TikTok' };
		if (kind === 'mastodon') return md || { key: 'mastodon', href: '#', label: 'Mastodon' };
		if (kind === 'discord') return dc || { key: 'discord', href: '#', label: 'Discord' };

		// Auto fallback
		return website || email || phone || fb || ig || st || xx || tt || md || dc || null;
	}

	function tooLarge(files) {
		const arr = Array.from(files || []);
		return arr.some((f) => f && f.size > MAX_BYTES);
	}

	function setPreview(which, files) {
		const arr = Array.from(files || []);
		const file = arr[0];
		if (!file) {
			if (which === 'logo' && logoPreview) (URL.revokeObjectURL(logoPreview), (logoPreview = ''));
			if (which === 'cover' && coverPreview)
				(URL.revokeObjectURL(coverPreview), (coverPreview = ''));
			return;
		}
		const url = URL.createObjectURL(file);
		if (which === 'logo') {
			if (logoPreview) URL.revokeObjectURL(logoPreview);
			logoPreview = url;
		}
		if (which === 'cover') {
			if (coverPreview) URL.revokeObjectURL(coverPreview);
			coverPreview = url;
		}
	}

	function onLogoChange(details) {
		const files = details?.acceptedFiles || [];
		logoFiles = files;
		logoTooLarge = tooLarge(files);
		setPreview('logo', files);
		if (files.length) openCropper('logo', files);
	}
	function onCoverChange(details) {
		const files = details?.acceptedFiles || [];
		coverFiles = files;
		coverTooLarge = tooLarge(files);
		setPreview('cover', files);
		if (files.length) openCropper('cover', files);
	}
	function onReject(err) {
		// Just surface a generic message; Skeleton will handle UI for rejection
		submitError = 'One or more files were rejected. Ensure they are images under 10MB.';
	}
	function removeImage(which) {
		if (which === 'logo') {
			logoApi?.clearFiles();
			if (logoPreview) URL.revokeObjectURL(logoPreview);
			logoPreview = '';
			logoFiles = [];
			const input = document.getElementById('logo_file_cropped');
			if (input) input.value = '';
			const clear = document.getElementById('clear_logo');
			if (clear) clear.value = '1';
			// Do not mutate data.group; leave server to persist on submit
		} else if (which === 'cover') {
			coverApi?.clearFiles();
			if (coverPreview) URL.revokeObjectURL(coverPreview);
			coverPreview = '';
			coverFiles = [];
			const input = document.getElementById('cover_file_cropped');
			if (input) input.value = '';
			const clear = document.getElementById('clear_cover');
			if (clear) clear.value = '1';
			// Do not mutate data.group; leave server to persist on submit
		}
	}
</script>

<div class="edit-page mx-auto w-full max-w-4xl space-y-5 pb-10">
	<!-- ── Cinematic header ── -->
	<header class="edit-header relative overflow-hidden rounded-3xl">
		<div class="edit-orb edit-orb-1" aria-hidden="true"></div>
		<div class="edit-orb edit-orb-2" aria-hidden="true"></div>
		<div class="edit-orb edit-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-10"
		>
			<div class="space-y-4">
				<a
					href={`/groups/${data.group?.slug}`}
					class="text-primary-200 flex items-center gap-1 text-xs font-semibold transition-colors hover:text-white"
				>
					← Back to group
				</a>
				<h1 class="group-headline text-4xl font-extrabold tracking-tight text-balance lg:text-5xl">
					Edit <span class="text-secondary-700-300">{data.group?.name}</span>
				</h1>
				<p class="max-w-3xl text-base leading-relaxed opacity-80">
					Changes are saved automatically as you type.
				</p>
			</div>
			<div class="flex shrink-0 flex-wrap gap-3">
				<!-- Autosave status -->
				{#if saving}
					<div class="chip preset-tonal-primary animate-pulse text-xs">Saving…</div>
				{:else}
					<div class="chip preset-tonal-surface text-xs opacity-60">Auto-saved</div>
				{/if}
				{#if isAdminUser}
					<button
						type="button"
						class="btn btn-sm preset-filled-secondary-500"
						disabled={deepEnrichLoading}
						onclick={runDeepEnrichFromExistingProfile}
					>
						{deepEnrichLoading ? 'AI Enriching…' : 'Deep Enrich Profile (Admin)'}
					</button>
				{/if}
			</div>
		</div>
	</header>
	{#if isAdminUser && deepEnrichError}
		<div class="text-error-600-400 mb-3 text-sm">{deepEnrichError}</div>
	{/if}
	{#if isAdminUser && deepEnrichSuccess}
		<div class="text-success-600-400 mb-3 text-sm">{deepEnrichSuccess}</div>
	{/if}

	<form
		method="POST"
		enctype="multipart/form-data"
		class="space-y-5"
		bind:this={formEl}
		onsubmit={(event) => event.preventDefault()}
	>
		<!-- ── Identity ── -->
		<section class="edit-card relative overflow-hidden rounded-2xl p-5">
			<div class="edit-card-accent-bar primary" aria-hidden="true"></div>
			<h2 class="edit-section-title">Identity</h2>
			<div class="mt-4 grid grid-cols-1 gap-4">
				<div class="flex flex-col gap-1">
					<label class="label" for="name">Group Name</label>
					<input
						id="name"
						name="name"
						class="input preset-tonal-surface"
						value={data.group?.name || ''}
						oninput={onField}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="tagline">Tagline</label>
					<input
						id="tagline"
						name="tagline"
						class="input preset-tonal-surface"
						value={data.group?.tagline || ''}
						oninput={onField}
						placeholder="A short, punchy sentence about your group"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="description">Description</label>
					<textarea
						id="description"
						name="description"
						class="textarea preset-tonal-surface"
						rows="4"
						oninput={onField}>{data.group?.description || ''}</textarea
					>
				</div>
			</div>
		</section>

		<!-- ── Location ── -->
		<section class="edit-card relative overflow-hidden rounded-2xl p-5">
			<div class="edit-card-accent-bar secondary" aria-hidden="true"></div>
			<h2 class="edit-section-title">Location</h2>
			<div class="mt-4 grid grid-cols-1 gap-4">
				<div class="flex flex-col gap-1">
					<label class="label" for="specific_meeting_point_address">Meeting Point Address</label>
					<input
						id="specific_meeting_point_address"
						name="specific_meeting_point_address"
						class="input preset-tonal-surface"
						value={meetingAddress}
						oninput={onField}
						onblur={onLocationBlur}
						placeholder="Street, city, state"
					/>
				</div>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div class="flex flex-col gap-1">
						<label class="label" for="city">City</label>
						<input
							id="city"
							name="city"
							class="input preset-tonal-surface"
							value={data.group?.city || ''}
							oninput={onField}
							onblur={onLocationBlur}
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label class="label" for="state_region"
							>State / Region <span class="text-error-400">*</span></label
						>
						<input
							id="state_region"
							name="state_region"
							class="input preset-tonal-surface"
							required
							value={data.group?.state_region || ''}
							oninput={onField}
							onblur={onLocationBlur}
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label class="label" for="country">Country <span class="text-error-400">*</span></label>
						<select
							id="country"
							name="country"
							class="select preset-tonal-surface"
							required
							onchange={onField}
						>
							<option value="US" selected={data.group?.country === 'US'}>United States</option>
							<option value="CA" selected={data.group?.country === 'CA'}>Canada</option>
							<option value="MX" selected={data.group?.country === 'MX'}>Mexico</option>
							<option value="GB" selected={data.group?.country === 'GB'}>United Kingdom</option>
							<option value="AU" selected={data.group?.country === 'AU'}>Australia</option>
							<option value="NZ" selected={data.group?.country === 'NZ'}>New Zealand</option>
							<option
								value="OTHER"
								selected={data.group?.country &&
									!['US', 'CA', 'MX', 'GB', 'AU', 'NZ'].includes(data.group.country)}>Other</option
							>
						</select>
					</div>
				</div>

				<!-- Map -->
				<div class="edit-map-panel rounded-xl p-3">
					<label class="label mb-2" for="map_location">Map Location</label>
					<input
						id="map_location"
						name="map_location"
						type="text"
						class="sr-only"
						tabindex="-1"
						aria-hidden="true"
					/>
					<div bind:this={placesContainer}></div>
					<p class="text-surface-600-400 my-1.5 text-xs">
						Search for a city or address to pin the map.
					</p>
					{#if placesLoading}
						<p class="text-surface-600-400 text-xs">Loading places…</p>
					{/if}
					<div class="mt-2 overflow-hidden rounded-lg" style="height: 300px;">
						<div bind:this={mapEl} style="height: 100%; width: 100%;"></div>
					</div>
					<p class="text-surface-600-400 mt-1.5 text-xs">
						Or click directly on the map to set the pin.
					</p>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="flex flex-col gap-1">
						<label class="label" for="service_area_description">Service Area</label>
						<input
							id="service_area_description"
							name="service_area_description"
							class="input preset-tonal-surface"
							value={data.group?.service_area_description || ''}
							oninput={onField}
							placeholder="e.g. West Valley of Phoenix"
						/>
					</div>
					<div class="flex flex-col gap-1">
						<label class="label" for="zip_code">ZIP / Postal Code</label>
						<input
							id="zip_code"
							name="zip_code"
							class="input preset-tonal-surface"
							value={data.group?.zip_code || ''}
							oninput={onField}
						/>
					</div>
				</div>
			</div>

			<!-- Hidden lat/lng -->
			<div class="hidden">
				<input
					id="latitude"
					name="latitude"
					type="number"
					step="any"
					value={data.group?.latitude ?? ''}
					oninput={onField}
					hidden
				/>
				<input
					id="longitude"
					name="longitude"
					type="number"
					step="any"
					value={data.group?.longitude ?? ''}
					oninput={onField}
					hidden
				/>
			</div>
		</section>

		<!-- ── Contact ── -->
		<section class="edit-card relative overflow-hidden rounded-2xl p-5">
			<div class="edit-card-accent-bar tertiary" aria-hidden="true"></div>
			<h2 class="edit-section-title">Contact & Reach</h2>
			<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="flex flex-col gap-1">
					<label class="label" for="website_url">Website</label>
					<input
						id="website_url"
						name="website_url"
						class="input preset-tonal-surface"
						value={data.group?.website_url || ''}
						oninput={onField}
						placeholder="https://"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="public_contact_email">Public Email</label>
					<input
						id="public_contact_email"
						name="public_contact_email"
						class="input preset-tonal-surface"
						value={data.group?.public_contact_email || ''}
						oninput={onField}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="public_phone_number">Public Phone</label>
					<input
						id="public_phone_number"
						name="public_phone_number"
						class="input preset-tonal-surface"
						value={data.group?.public_phone_number || ''}
						oninput={onField}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="preferred_contact_method_instructions"
						>Preferred Contact Method</label
					>
					<input
						id="preferred_contact_method_instructions"
						name="preferred_contact_method_instructions"
						class="input preset-tonal-surface"
						value={data.group?.preferred_contact_method_instructions || ''}
						oninput={onField}
						placeholder="e.g. Email for general inquiries"
					/>
				</div>
			</div>

			<!-- Preferred CTA -->
			<div class="mt-5">
				<div class="label mb-2">Preferred Call-to-Action Button</div>
				<div class="flex flex-wrap gap-2">
					{#each ctaChoices as opt}
						<button
							type="button"
							class={`chip ${ctaKind === opt.key ? 'preset-filled-primary-500' : 'preset-tonal-surface'} flex items-center gap-2`}
							onclick={() => setCtaKind(opt.key)}
						>
							{#if opt.icon}<opt.icon class="h-4 w-4" />{/if}
							<span>{opt.label}</span>
						</button>
					{/each}
				</div>
				{#if ctaKind === 'custom'}
					<div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label class="label" for="preferred_cta_label">Label (10 char max)</label>
							<input
								id="preferred_cta_label"
								name="preferred_cta_label"
								class="input preset-tonal-surface"
								maxlength="10"
								bind:value={ctaLabel}
								oninput={onCtaLabelInput}
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label class="label" for="preferred_cta_url">URL</label>
							<input
								id="preferred_cta_url"
								name="preferred_cta_url"
								class="input preset-tonal-surface {ctaUrl && !customUrlValid
									? 'border-error-500 border'
									: ''}"
								bind:value={ctaUrl}
								oninput={onCtaUrlInput}
								placeholder="https://example.com/join"
							/>
							{#if ctaUrl && !customUrlValid}
								<small class="text-error-600-400 text-xs">Must start with http:// or https://</small
								>
							{/if}
						</div>
					</div>
				{/if}
				{#if pickCtaPreview()}
					<div class="mt-3">
						<div class="text-surface-600-400 mb-1 text-xs">Preview</div>
						{#key ctaKind + ctaLabel + ctaUrl}
							{#await Promise.resolve(pickCtaPreview()) then cp}
								<button
									type="button"
									class="btn btn-sm preset-filled-primary-500 flex items-center gap-2"
								>
									{#if cp.key !== 'custom'}
										{#if cp.key === 'website'}<IconGlobe class="h-4 w-4" />
										{:else if cp.key === 'email'}<IconMail class="h-4 w-4" />
										{:else if cp.key === 'phone'}<IconPhone class="h-4 w-4" />
										{:else if cp.key === 'facebook'}<IconFacebook class="h-4 w-4" />
										{:else if cp.key === 'instagram'}<IconInstagram class="h-4 w-4" />
										{:else if cp.key === 'strava'}<BrandStrava className="h-4 w-4" />
										{:else if cp.key === 'x'}<BrandX className="h-4 w-4" />
										{:else if cp.key === 'tiktok'}<BrandTikTok className="h-4 w-4" />
										{:else if cp.key === 'mastodon'}<BrandMastodon className="h-4 w-4" />
										{:else if cp.key === 'discord'}<BrandDiscord className="h-4 w-4" />
										{:else}<IconLink class="h-4 w-4" />{/if}
									{/if}
									<span>{cp.label}</span>
								</button>
							{/await}
						{/key}
					</div>
				{/if}
			</div>
		</section>

		<!-- ── Donations ── -->
		<section class="edit-card relative overflow-hidden rounded-2xl p-5">
			<div class="edit-card-accent-bar tertiary" aria-hidden="true"></div>
			<h2 class="edit-section-title">Donations</h2>
			<p class="text-surface-600-400 mt-1 text-sm">
				Connect a Stripe account to accept donations on this group's public page.
			</p>
			<div class="mt-4 rounded-xl border border-white/10 p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="text-sm">
						<div class="font-semibold">
							{stripeConnected ? 'Stripe account connected' : 'Stripe not connected'}
						</div>
						{#if stripeConnected}
							<div class="text-surface-600-400 mt-0.5">
								{stripeAccount?.stripe_account_email || stripeAccount?.stripe_account_id}
							</div>
							<div class="text-surface-600-400 mt-0.5">
								{stripeReady
									? 'Account can accept charges.'
									: 'Account connected but not yet ready for charges.'}
							</div>
						{/if}
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="btn preset-filled-primary-500"
							disabled={stripeBusy}
							onclick={connectStripeForGroup}
						>
							{stripeConnected ? 'Reconnect Stripe' : 'Connect Stripe'}
						</button>
						{#if stripeConnected}
							<button
								type="button"
								class="btn preset-outlined-error-500"
								disabled={stripeBusy}
								onclick={disconnectStripeForGroup}
							>
								{stripeBusy ? 'Disconnecting…' : 'Disconnect'}
							</button>
						{/if}
					</div>
				</div>
				{#if stripeError}
					<div class="text-error-600-400 mt-3 text-sm">{stripeError}</div>
				{/if}
				{#if stripeMessage}
					<div class="text-success-600-400 mt-3 text-sm">{stripeMessage}</div>
				{/if}
			</div>
		</section>

		<!-- ── Social links ── -->
		<section class="edit-card relative overflow-hidden rounded-2xl p-5">
			<div class="edit-card-accent-bar primary" aria-hidden="true"></div>
			<h2 class="edit-section-title">Social Links</h2>
			<p class="text-surface-600-400 mt-1 mb-4 text-xs">
				Enter a username or full URL — we'll build the link automatically.
			</p>
			<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
				{#each [{ id: 'social_instagram', label: 'Instagram', placeholder: 'username or full URL' }, { id: 'social_facebook', label: 'Facebook', placeholder: 'page/username or full URL' }, { id: 'social_x', label: 'X (Twitter)', placeholder: 'handle or full URL' }, { id: 'social_threads', label: 'Threads', placeholder: '@handle or full URL' }, { id: 'social_youtube', label: 'YouTube', placeholder: '@channel or full URL' }, { id: 'social_mastodon', label: 'Mastodon', placeholder: '@user@instance or full URL' }, { id: 'social_tiktok', label: 'TikTok', placeholder: '@handle or full URL' }, { id: 'social_strava', label: 'Strava', placeholder: 'club name/ID or full URL' }, { id: 'social_bluesky', label: 'Bluesky', placeholder: 'handle or full URL' }, { id: 'social_discord', label: 'Discord', placeholder: 'invite code or full URL' }, { id: 'social_linkedin', label: 'LinkedIn', placeholder: 'company/school or full URL' }] as s}
					<div class="flex flex-col gap-1">
						<label class="label" for={s.id}>{s.label}</label>
						<input
							id={s.id}
							name={s.id}
							class="input preset-tonal-surface"
							value={(data.group?.social_links &&
								data.group.social_links[s.id.replace('social_', '')]) ||
								''}
							placeholder={s.placeholder}
							oninput={onSocialsChange}
						/>
					</div>
				{/each}
			</div>
		</section>

		<!-- ── Activity details ── -->
		<section class="edit-card relative overflow-hidden rounded-2xl p-5">
			<div class="edit-card-accent-bar secondary" aria-hidden="true"></div>
			<h2 class="edit-section-title">Activity Details</h2>
			<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="flex flex-col gap-1">
					<label class="label" for="activity_frequency">Activity Frequency</label>
					<input
						id="activity_frequency"
						name="activity_frequency"
						class="input preset-tonal-surface"
						value={data.group?.activity_frequency || ''}
						oninput={onField}
						placeholder="e.g. Weekly, Every Saturday"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label class="label" for="typical_activity_day_time">Typical Day / Time</label>
					<input
						id="typical_activity_day_time"
						name="typical_activity_day_time"
						class="input preset-tonal-surface"
						value={data.group?.typical_activity_day_time || ''}
						oninput={onField}
						placeholder="e.g. Saturdays at 7am"
					/>
				</div>
				<div class="flex flex-col gap-1 md:col-span-2">
					<label class="label" for="how_to_join_instructions">How to Join</label>
					<textarea
						id="how_to_join_instructions"
						name="how_to_join_instructions"
						class="textarea preset-tonal-surface"
						rows="3"
						oninput={onField}>{data.group?.how_to_join_instructions || ''}</textarea
					>
				</div>
				<div class="flex flex-col gap-1 md:col-span-2">
					<label class="label" for="membership_info">Membership Info</label>
					<textarea
						id="membership_info"
						name="membership_info"
						class="textarea preset-tonal-surface"
						rows="3"
						oninput={onField}>{data.group?.membership_info || ''}</textarea
					>
				</div>
			</div>
		</section>

		<!-- ── Categories ── -->
		<section class="edit-card relative overflow-hidden rounded-2xl p-5">
			<div class="edit-card-accent-bar tertiary" aria-hidden="true"></div>
			<h2 class="edit-section-title">Categories & Tags</h2>
			<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				<div class="edit-check-card rounded-xl p-3">
					<div class="mb-2 text-sm font-semibold">Group Types</div>
					<div class="flex flex-col gap-2">
						{#each data.group_types as gt}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="group_type_ids"
									value={gt.id}
									class="checkbox"
									checked={data.selected.group_type_ids?.includes(gt.id)}
									onchange={onMMChange}
								/>
								<span>{gt.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<div class="edit-check-card rounded-xl p-3">
					<div class="mb-2 text-sm font-semibold">Audience Focus</div>
					<div class="flex flex-col gap-2">
						{#each data.audience_focuses as af}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="audience_focus_ids"
									value={af.id}
									class="checkbox"
									checked={data.selected.audience_focus_ids?.includes(af.id)}
									onchange={onMMChange}
								/>
								<span>{af.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<div class="edit-check-card rounded-xl p-3">
					<div class="mb-2 text-sm font-semibold">Riding Disciplines</div>
					<div class="flex flex-col gap-2">
						{#each data.riding_disciplines as rd}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="riding_discipline_ids"
									value={rd.id}
									class="checkbox"
									checked={data.selected.riding_discipline_ids?.includes(rd.id)}
									onchange={onMMChange}
								/>
								<span>{rd.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<div class="edit-check-card rounded-xl p-3">
					<div class="mb-2 text-sm font-semibold">Skill Levels</div>
					<div class="flex flex-col gap-2">
						{#each data.skill_levels as sl}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									name="skill_level_ids"
									value={sl.id}
									class="checkbox"
									checked={data.selected.skill_level_ids?.includes(sl.id)}
									onchange={onMMChange}
								/>
								<span>{sl.name}</span>
							</label>
						{/each}
					</div>
				</div>
			</div>
		</section>

		<!-- ── Photos ── -->
		<section class="edit-card relative overflow-hidden rounded-2xl p-5">
			<div class="edit-card-accent-bar primary" aria-hidden="true"></div>
			<h2 class="edit-section-title">Photos</h2>
			<div class="mt-4">
				<ImageGeneratorPanel
					target="group"
					heading="Generate group cover art"
					description="Create a fresh comic-style banner from the current group details and save it directly to the cover photo."
					helperText="This updates the live cover image immediately through autosave."
					currentImageUrl={coverPreview}
					buildContext={buildGroupImageContext}
					onApply={applyGeneratedGroupCover}
				/>
			</div>
			<div class="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
				<!-- Logo -->
				<div class="flex flex-col gap-2">
					<label class="label" for="logo_url"
						>Logo <span class="text-surface-500 text-xs font-normal">(1:1)</span></label
					>
					<FileUpload
						name="logo_file"
						accept="image/*"
						maxFiles={1}
						maxFileSize={MAX_BYTES}
						classes="w-full"
						onFileChange={onLogoChange}
						onFileReject={onReject}
						onApiReady={(api) => (logoApi = api)}
					>
						{#snippet children()}
							<button
								type="button"
								class="edit-dropzone rounded-xl border-2 border-dashed p-6"
								onclick={() => logoApi?.openFilePicker?.()}
								aria-label="Select logo file or drag here"
							>
								<IconDropzone class="mx-auto mb-2 h-8 w-8 opacity-50" />
								<p class="text-sm">Select or drag a file</p>
								<small class="text-xs opacity-50">PNG · JPG · WEBP · Max 10MB</small>
							</button>
						{/snippet}
					</FileUpload>
					{#if logoTooLarge}<p class="text-error-600-400 text-xs">File exceeds 10MB limit.</p>{/if}
					{#if logoPreview}
						<div
							class="relative mt-1 aspect-square w-24 overflow-hidden rounded-xl border border-white/10"
						>
							<img src={logoPreview} alt="Logo preview" class="h-full w-full object-cover" />
							<button
								type="button"
								class="absolute top-1 right-1 rounded-full bg-black/60 p-0.5"
								onclick={() => removeImage('logo')}
							>
								<IconRemove class="h-4 w-4 text-white" />
							</button>
						</div>
					{/if}
				</div>
				<!-- Cover -->
				<div class="flex flex-col gap-2">
					<label class="label" for="cover_photo_url"
						>Cover Photo <span class="text-surface-500 text-xs font-normal">(16:9)</span></label
					>
					<FileUpload
						name="cover_file"
						accept="image/*"
						maxFiles={1}
						maxFileSize={MAX_BYTES}
						classes="w-full"
						onFileChange={onCoverChange}
						onFileReject={onReject}
						onApiReady={(api) => (coverApi = api)}
					>
						{#snippet children()}
							<button
								type="button"
								class="edit-dropzone rounded-xl border-2 border-dashed p-6"
								onclick={() => coverApi?.openFilePicker?.()}
								aria-label="Select cover image or drag here"
							>
								<IconDropzone class="mx-auto mb-2 h-8 w-8 opacity-50" />
								<p class="text-sm">Select or drag a file</p>
								<small class="text-xs opacity-50">PNG · JPG · WEBP · Max 10MB</small>
							</button>
						{/snippet}
					</FileUpload>
					{#if coverTooLarge}<p class="text-error-600-400 text-xs">File exceeds 10MB limit.</p>{/if}
					{#if coverPreview}
						<div
							class="relative mt-1 aspect-[16/9] overflow-hidden rounded-xl border border-white/10"
						>
							<img
								src={coverPreview}
								alt="Cover preview"
								class="absolute inset-0 h-full w-full object-cover"
							/>
							<button
								type="button"
								class="absolute top-1 right-1 rounded-full bg-black/60 p-0.5"
								onclick={() => removeImage('cover')}
							>
								<IconRemove class="h-4 w-4 text-white" />
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Hidden inputs -->
			<input type="hidden" id="logo_file_cropped" name="logo_file_cropped" />
			<input type="hidden" id="cover_file_cropped" name="cover_file_cropped" />
			<input type="hidden" id="clear_logo" name="clear_logo" />
			<input type="hidden" id="clear_cover" name="clear_cover" />
		</section>

		<!-- ── Owners ── -->
		<section class="edit-card relative overflow-hidden rounded-2xl p-5">
			<div class="edit-card-accent-bar secondary" aria-hidden="true"></div>
			<h2 class="edit-section-title">Owners</h2>
			<p class="text-surface-600-400 mt-1 mb-4 text-sm">
				Add co-owners by email — we'll send a secure login link. They'll become an owner when they
				sign in.
			</p>
			<div class="flex flex-col gap-2 md:flex-row">
				<input
					type="email"
					placeholder="owner@example.com"
					bind:value={ownerEmail}
					class="input preset-tonal-surface md:w-80"
					required
					onkeydown={(e) => {
						if (e.key === 'Enter') inviteOwner(e);
					}}
				/>
				<input
					type="text"
					name="website"
					bind:value={ownerHoneypot}
					autocomplete="off"
					tabindex="-1"
					aria-hidden="true"
					style="position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0;"
				/>
				<div aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden;">
					<div bind:this={ownerTurnstileEl}></div>
				</div>
				<button
					type="button"
					class="btn preset-filled-primary-500 {ownerLoading ? 'animate-pulse' : ''}"
					disabled={!ownerValid || ownerLoading}
					onclick={inviteOwner}>Send Invite</button
				>
			</div>
			{#if ownerError}<div class="text-error-600-400 mt-2 text-sm">{ownerError}</div>{/if}
			{#if ownerSuccess}<div class="text-success-600-400 mt-2 text-sm">{ownerSuccess}</div>{/if}

			{#if owners?.length}
				<div class="mt-4">
					<div class="text-surface-600-400 mb-2 text-xs font-medium tracking-wider uppercase">
						Current owners
					</div>
					<ul class="divide-surface-700/20 border-surface-700/20 divide-y rounded-xl border">
						{#each owners as o (o.user_id)}
							<li class="flex items-center justify-between gap-3 px-3 py-2.5">
								<div class="truncate text-sm">
									{o.user_id === data.current_user_id ? '(You)' : o.email || o.user_id}
								</div>
								{#if o.user_id !== data.current_user_id}
									<button
										type="button"
										class="btn btn-xs preset-outlined-error-500"
										onclick={() => removeOwner(o.user_id, o.email)}>Remove</button
									>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>

		{#if submitError}<p class="text-error-600-400 text-sm">{submitError}</p>{/if}
		{#if $page.form?.error}<p class="text-error-600-400 text-sm">{$page.form.error}</p>{/if}
	</form>

	<!-- ── Crop modal ── -->
	{#if cropping}
		<div
			class="bg-surface-50-950/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onpointermove={onCropPointerMove}
			onpointerup={onCropPointerUp}
			onpointercancel={onCropPointerUp}
		>
			<div class="edit-card w-full max-w-4xl rounded-2xl p-5">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-xl font-bold">
						Crop {cropTarget === 'logo' ? 'Logo (1:1)' : 'Cover (16:9)'}
					</h3>
					<button
						type="button"
						class="btn btn-sm preset-outlined-surface-400"
						onclick={closeCropper}>Cancel</button
					>
				</div>
				<div
					bind:this={cropContainerEl}
					class="relative mx-auto w-full overflow-hidden rounded-xl border border-white/10"
					style={`max-width: 800px; aspect-ratio: ${cropTarget === 'logo' ? '1 / 1' : '16 / 9'}`}
				>
					<img
						id="crop-img"
						src={cropSrc}
						alt="Crop source"
						onload={onCropImgLoad}
						onpointerdown={onCropPointerDown}
						style={`position:absolute; left:50%; top:50%; transform: translate(-50%, -50%) translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale}); transform-origin: center center;`}
						class={cropReady ? '' : 'opacity-0'}
					/>
					{#if !cropReady}<div
							class="text-surface-700-300 absolute inset-0 grid place-items-center"
						>
							Loading…
						</div>{/if}
					<div class="pointer-events-none absolute inset-0">
						<div class="bg-surface-950-50/40 absolute top-0 bottom-0 left-[33.333%] w-px"></div>
						<div class="bg-surface-950-50/40 absolute top-0 bottom-0 left-[66.666%] w-px"></div>
						<div class="bg-surface-950-50/40 absolute top-[33.333%] right-0 left-0 h-px"></div>
						<div class="bg-surface-950-50/40 absolute top-[66.666%] right-0 left-0 h-px"></div>
						<div class="border-surface-950-50/50 absolute inset-0 border"></div>
					</div>
				</div>
				<div class="mt-4 flex flex-wrap items-center gap-3">
					<input
						id="crop-zoom"
						type="range"
						min={ZOOM_MIN}
						max={ZOOM_MAX}
						step="0.01"
						bind:value={cropScale}
						class="range flex-1"
					/>
					<button
						type="button"
						class="btn preset-outlined-surface-400"
						onclick={() => {
							cropScale = 1;
							cropOffset = { x: 0, y: 0 };
						}}>Reset</button
					>
					<button type="button" class="btn preset-filled-primary-500" onclick={applyCrop}
						>Apply</button
					>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* ── Edit page header ── */
	.edit-header {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.edit-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(72px);
		pointer-events: none;
	}

	.edit-orb-1 {
		width: 55%;
		height: 200%;
		top: -50%;
		left: -10%;
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		animation: orb-drift 18s ease-in-out infinite alternate;
	}

	.edit-orb-2 {
		width: 40%;
		height: 160%;
		top: -30%;
		right: 5%;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation: orb-drift 24s ease-in-out infinite alternate-reverse;
	}

	.edit-orb-3 {
		width: 35%;
		height: 120%;
		bottom: -40%;
		left: 40%;
		background: color-mix(in oklab, var(--color-tertiary-500) 15%, transparent);
		animation: orb-drift 20s ease-in-out infinite alternate;
	}

		.group-headline {
		color: var(--color-primary-50);
		text-align: left;
	}

	/* ── Form section cards ── */
	.edit-card {
		background: color-mix(in oklab, var(--color-surface-900) 94%, var(--color-primary-500) 6%);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 18%, transparent);
		animation: card-in 360ms ease both;
	}

	.edit-card-accent-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		border-radius: 2rem 2rem 0 0;
	}
	.edit-card-accent-bar.primary {
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
		opacity: 0.7;
	}
	.edit-card-accent-bar.secondary {
		background: linear-gradient(90deg, var(--color-secondary-500), var(--color-tertiary-500));
		opacity: 0.7;
	}
	.edit-card-accent-bar.tertiary {
		background: linear-gradient(90deg, var(--color-tertiary-500), var(--color-primary-500));
		opacity: 0.6;
	}

	.edit-section-title {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.55;
		margin-bottom: 0;
	}

	/* ── Map panel ── */
	.edit-map-panel {
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 15%, transparent);
	}

	/* ── Check cards ── */
	.edit-check-card {
		background: color-mix(in oklab, var(--color-surface-950) 55%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 14%, transparent);
	}

	/* ── Dropzone ── */
	.edit-dropzone {
		width: 100%;
		text-align: center;
		border-color: color-mix(in oklab, var(--color-surface-500) 30%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 40%, transparent);
		transition:
			background 180ms ease,
			border-color 180ms ease;
	}
	.edit-dropzone:hover {
		background: color-mix(in oklab, var(--color-primary-500) 8%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 40%, transparent);
	}

	/* ── Card entrance ── */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
