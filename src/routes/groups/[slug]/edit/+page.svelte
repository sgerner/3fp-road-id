<script>
	let { data } = $props();
	import { FileUpload } from '@skeletonlabs/skeleton-svelte';
	import IconDropzone from '@lucide/svelte/icons/image-plus';
	import IconFile from '@lucide/svelte/icons/paperclip';
	import IconRemove from '@lucide/svelte/icons/circle-x';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import IconGlobe from '@lucide/svelte/icons/globe';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconFacebook from '@lucide/svelte/icons/facebook';
	import IconInstagram from '@lucide/svelte/icons/instagram';
	import IconTwitter from '@lucide/svelte/icons/twitter';
	import IconMusic from '@lucide/svelte/icons/music';
	import IconLink from '@lucide/svelte/icons/link';
	import IconMountain from '@lucide/svelte/icons/mountain';

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

	// Crop viewport container ref (no measurements used)
	let cropContainerEl = $state(null);

	// Map + Places
	let mapEl;
	let map;
	let marker;
	let placesContainer;
	let placesEl;
	let placesLoading = $state(false);
	let searchText = $state('');
	function formatDefaultSearch() {
		const p = [];
		if (data.group?.city) p.push(data.group.city);
		if (data.group?.state_region) p.push(data.group.state_region);
		if (data.group?.country) p.push(data.group.country);
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
	function placeMarker(lat, lng) {
		if (!map) return;
		if (!marker) marker = L.marker([lat, lng]).addTo(map);
		marker.setLatLng([lat, lng]);
		map.setView([lat, lng], Math.max(map.getZoom(), 12));
	}
	function loadGooglePlaces() {
		if (typeof window === 'undefined') return;
		if (window.google?.maps?.places) return initPlaces();
		const key = env.PUBLIC_GOOGLE_MAPS_API_KEY;
		if (!key) {
			console.warn('Missing PUBLIC_GOOGLE_MAPS_API_KEY');
			return;
		}
		if (document.getElementById('gmaps-places')) return; // already loading

		placesLoading = true;
		const s = document.createElement('script');
		s.id = 'gmaps-places';
		s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&v=beta&callback=initGooglePlaces`;
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
			input.className = 'input bg-primary-950/30';
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

		return () => {
			// Cleanup the global function when the component is destroyed
			if (window.initGooglePlaces === initPlaces) {
				delete window.initGooglePlaces;
			}
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
				if (res.ok) savedAt = new Date().toLocaleTimeString();
			} catch (e) {
				console.error('Autosave cropped logo failed', e);
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
				if (res.ok) savedAt = new Date().toLocaleTimeString();
			} catch (e) {
				console.error('Autosave cropped cover failed', e);
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
	let savedAt = $state('');

	function queueSave(partial) {
		pending = { ...pending, ...partial };
		clearTimeout(saveTimer);
		saveTimer = setTimeout(runSave, 600);
	}
	async function runSave() {
		const body = { ...pending };
		pending = {};
		saving = true;
		try {
			const res = await fetch(`/api/groups/${data.group?.slug}/autosave`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(await res.text());
			savedAt = new Date().toLocaleTimeString();
		} catch (e) {
			console.error('Autosave failed', e);
		} finally {
			saving = false;
		}
	}

	function onField(e) {
		const el = e.currentTarget;
		const key = el.name;
		if (!key) return;
		let val = el.value;
		if (key === 'country') val = (val || '').toUpperCase();
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

	function onSocialsChange() {
		const getVal = (id) => document.getElementById(id)?.value?.trim() || '';
		const buildUrl = (v, p) =>
			!v ? null : /^https?:\/\//i.test(v) ? v : `${p}${v.replace(/^@/, '')}`;
		const socials = {
			instagram: buildUrl(getVal('social_instagram'), 'https://www.instagram.com/'),
			facebook: buildUrl(getVal('social_facebook'), 'https://www.facebook.com/'),
			x: buildUrl(getVal('social_x'), 'https://x.com/'),
			threads: buildUrl(getVal('social_threads'), 'https://www.threads.net/@'),
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
			linkedin: (() => {
				const v = getVal('social_linkedin');
				if (!v) return null;
				if (/^https?:\/\//i.test(v)) return v;
				return `https://www.linkedin.com/company/${v}`;
			})()
		};
		const cleaned = Object.fromEntries(Object.entries(socials).filter(([_, v]) => !!v));
		socialsLocal = { ...cleaned };
		queueSave({ fields: { social_links: Object.keys(cleaned).length ? cleaned : null } });
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

	let ctaKind = $state(data.group?.preferred_cta_kind || 'auto');
	let ctaLabel = $state(data.group?.preferred_cta_label || '');
	let ctaUrl = $state(data.group?.preferred_cta_url || '');
	let customUrlValid = $derived(!ctaUrl || /^https?:\/\/.+/i.test(ctaUrl));

	// Live values for availability and preview
	let websiteLocal = $state(data.group?.website_url || '');
	let emailLocal = $state(data.group?.public_contact_email || '');
	let phoneLocal = $state(data.group?.public_phone_number || '');
	let socialsLocal = $state({ ...(data.group?.social_links || {}) });

	const ctaChoices = [
		{ key: 'auto', label: 'Auto', icon: IconLink },
		{ key: 'website', label: 'Website', icon: IconGlobe },
		{ key: 'email', label: 'Email', icon: IconMail },
		{ key: 'phone', label: 'Phone', icon: IconPhone },
		{ key: 'facebook', label: 'Facebook', icon: IconFacebook },
		{ key: 'instagram', label: 'Instagram', icon: IconInstagram },
		{ key: 'strava', label: 'Strava', icon: IconMountain },
		{ key: 'x', label: 'X', icon: IconTwitter },
		{ key: 'tiktok', label: 'TikTok', icon: IconMusic },
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
		tiktok: !!(socialsLocal.tiktok || '').trim()
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

		if (kind === 'custom') {
			if (ctaLabel && /^https?:\/\/.+/i.test(ctaUrl))
				return { key: 'custom', href: ctaUrl, label: ctaLabel };
		}
		if (kind === 'website' && website) return website;
		if (kind === 'email' && email) return email;
		if (kind === 'phone' && phone) return phone;
		if (kind === 'facebook' && fb) return fb;
		if (kind === 'instagram' && ig) return ig;
		if (kind === 'strava' && st) return st;
		if (kind === 'x' && xx) return xx;
		if (kind === 'tiktok' && tt) return tt;

		// Auto fallback
		return website || email || phone || fb || ig || st || xx || tt || null;
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
	function validateBeforeSubmit(e) {
		submitError = '';
		if (logoTooLarge || coverTooLarge) {
			e.preventDefault();
			submitError = 'Please remove files over 10MB before saving.';
		}
	}

	function removeImage(which) {
		if (which === 'logo') {
			logoApi?.clearFiles();
			if (logoPreview) URL.revokeObjectURL(logoPreview);
			logoPreview = '';
			logoFiles = [];
			const input = document.getElementById('logo_file_cropped');
			if (input) input.value = '';
			const urlInput = document.getElementById('logo_url');
			if (urlInput) urlInput.value = '';
			// Do not mutate data.group; leave server to persist on submit
		} else if (which === 'cover') {
			coverApi?.clearFiles();
			if (coverPreview) URL.revokeObjectURL(coverPreview);
			coverPreview = '';
			coverFiles = [];
			const input = document.getElementById('cover_file_cropped');
			if (input) input.value = '';
			const urlInput = document.getElementById('cover_photo_url');
			if (urlInput) urlInput.value = '';
			// Do not mutate data.group; leave server to persist on submit
		}
	}
</script>

<div class="mx-auto w-full max-w-4xl space-y-6">
	<header class="space-y-2">
		<h1 class="text-3xl font-bold">Edit {data.group?.name}</h1>
	</header>

	<div class="text-surface-400 text-right text-xs">
		{#if saving}
			Saving…
		{:else if savedAt}
			Saved at {savedAt}
		{/if}
	</div>

	<section class="card border-primary-300 bg-surface-950 card-hover border p-4">
		<form
			method="POST"
			enctype="multipart/form-data"
			class="grid grid-cols-1 gap-4"
			onsubmit={validateBeforeSubmit}
		>
			<div class="grid grid-cols-1 gap-2 md:grid-cols-1">
				<div class="flex flex-col">
					<label class="label" for="name">Group Name</label>
					<input
						id="name"
						name="name"
						class="input bg-primary-950/30"
						value={data.group?.name || ''}
						oninput={onField}
					/>
				</div>
			</div>
			<div class="flex flex-col">
				<label class="label" for="tagline">Tagline</label>
				<input
					id="tagline"
					name="tagline"
					class="input bg-primary-950/30"
					value={data.group?.tagline || ''}
					oninput={onField}
				/>
			</div>
			<div class="grid grid-cols-1 gap-2 md:grid-cols-3">
				<div class="flex flex-col">
					<label class="label" for="city">City</label>
					<input
						id="city"
						name="city"
						class="input bg-primary-950/30"
						value={data.group?.city || ''}
						oninput={onField}
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="state_region">State/Region (Required)</label>
					<input
						id="state_region"
						name="state_region"
						class="input bg-primary-950/30"
						required
						value={data.group?.state_region || ''}
						oninput={onField}
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="country">Country (Required)</label>
					<select
						id="country"
						name="country"
						class="select bg-primary-950/30"
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

				<div class="col-span-3">
					<!-- Places search + Leaflet map -->
					<div class="border-primary-950/30 bg-primary-950/30 my-2 border p-2">
						<label class="label" for="map_location">Map Location</label>
						<input
							id="map_location"
							name="map_location"
							type="text"
							class="sr-only"
							tabindex="-1"
							aria-hidden="true"
						/>

						<div bind:this={placesContainer} class=""></div>
						<small class="text-surface-400 my-2 text-xs"
							>Search for a city or address to set the map marker.</small
						>
						{#if placesLoading}
							<small class="text-surface-400 mt-1 text-xs">Loading places…</small>
						{/if}
						<div
							class="border-surface-600 overflow-hidden rounded-md border"
							style="height: 320px;"
						>
							<div bind:this={mapEl} style="height: 100%; width: 100%;"></div>
						</div>
						<small class="text-surface-400 text-xs"
							>Click the map to set the marker and coordinates.</small
						>
					</div>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
				<div class="flex flex-col">
					<label class="label" for="website_url">Website</label>
					<input
						id="website_url"
						name="website_url"
						class="input bg-primary-950/30"
						value={data.group?.website_url || ''}
						oninput={onField}
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="public_contact_email">Public Email</label>
					<input
						id="public_contact_email"
						name="public_contact_email"
						class="input bg-primary-950/30"
						value={data.group?.public_contact_email || ''}
						oninput={onField}
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
				<div class="flex flex-col">
					<label class="label" for="public_phone_number">Public Phone</label>
					<input
						id="public_phone_number"
						name="public_phone_number"
						class="input bg-primary-950/30"
						value={data.group?.public_phone_number || ''}
						oninput={onField}
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="preferred_contact_method_instructions">Preferred Contact</label>
					<input
						id="preferred_contact_method_instructions"
						name="preferred_contact_method_instructions"
						class="input bg-primary-950/30"
						value={data.group?.preferred_contact_method_instructions || ''}
						oninput={onField}
					/>
				</div>
			</div>

			<!-- Preferred CTA selection -->
			<section class="card border-surface-600/50 bg-surface-900 my-2 space-y-2 border p-3">
				<div class="label">Preferred Call-to-Action</div>
				<div class="flex flex-wrap gap-2">
					{#each ctaChoices as opt}
						<button
							type="button"
							class={`chip ${ctaKind === opt.key ? 'preset-filled-primary-500' : 'preset-tonal-surface'} flex items-center gap-2`}
							onclick={() => setCtaKind(opt.key)}
						>
							{#if opt.icon}
								<svelte:component this={opt.icon} class="h-4 w-4" />
							{/if}
							<span>{opt.label}</span>
						</button>
					{/each}
				</div>
				{#if ctaKind === 'custom'}
					<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
						<div class="flex flex-col">
							<label class="label" for="preferred_cta_label">Custom CTA Label (10 char max)</label>
							<input
								id="preferred_cta_label"
								name="preferred_cta_label"
								class="input bg-primary-950/30"
								maxlength="10"
								bind:value={ctaLabel}
								oninput={onCtaLabelInput}
							/>
						</div>
						<div class="flex flex-col">
							<label class="label" for="preferred_cta_url">Custom CTA URL</label>
							<input
								id="preferred_cta_url"
								name="preferred_cta_url"
								class="input bg-primary-950/30 {ctaUrl && !customUrlValid
									? 'border border-red-500'
									: ''}"
								bind:value={ctaUrl}
								oninput={onCtaUrlInput}
								placeholder="https://example.com/join"
							/>
							<small class="text-surface-400 mt-1 text-xs"
								>Use a full URL starting with http:// or https://</small
							>
							{#if ctaUrl && !customUrlValid}
								<small class="text-xs text-red-400"
									>Enter a valid URL beginning with http:// or https://</small
								>
							{/if}
						</div>
					</div>
				{/if}

				<!-- CTA Preview -->
				<div class="mt-2">
					<div class="text-surface-300 mb-1 text-xs">Preview</div>
					{#if pickCtaPreview()}
						{#key ctaKind + ctaLabel + ctaUrl}
							{#await Promise.resolve(pickCtaPreview()) then cp}
								<button
									href={cp.href}
									target="_blank"
									rel="noopener"
									class="btn btn-sm preset-filled-primary-500 flex items-center gap-2"
								>
									{#if cp.key !== 'custom'}
										<!-- icon mapping -->
										{#if cp.key === 'website'}<IconGlobe class="h-4 w-4" />
										{:else if cp.key === 'email'}<IconMail class="h-4 w-4" />
										{:else if cp.key === 'phone'}<IconPhone class="h-4 w-4" />
										{:else if cp.key === 'facebook'}<IconFacebook class="h-4 w-4" />
										{:else if cp.key === 'instagram'}<IconInstagram class="h-4 w-4" />
										{:else if cp.key === 'strava'}<IconMountain class="h-4 w-4" />
										{:else if cp.key === 'x'}<IconTwitter class="h-4 w-4" />
										{:else if cp.key === 'tiktok'}<IconMusic class="h-4 w-4" />
										{:else}<IconLink class="h-4 w-4" />{/if}
									{/if}
									<span>{cp.label}</span>
								</button>
							{/await}
						{/key}
					{:else}
						<span class="text-surface-400 text-xs"
							>No valid CTA available based on current selection.</span
						>
					{/if}
				</div>
			</section>

			<div class="flex flex-col">
				<label class="label" for="description">Description</label>
				<textarea
					id="description"
					name="description"
					class="textarea bg-primary-950/30"
					rows="4"
					oninput={onField}>{data.group?.description || ''}</textarea
				>
			</div>

			<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
				<div class="flex flex-col">
					<label class="label" for="how_to_join_instructions">How to Join</label>
					<textarea
						id="how_to_join_instructions"
						name="how_to_join_instructions"
						class="textarea bg-primary-950/30"
						rows="3"
						oninput={onField}>{data.group?.how_to_join_instructions || ''}</textarea
					>
				</div>
				<div class="flex flex-col">
					<label class="label" for="membership_info">Membership Info</label>
					<textarea
						id="membership_info"
						name="membership_info"
						class="textarea bg-primary-950/30"
						rows="3">{data.group?.membership_info || ''}</textarea
					>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
				<div class="flex flex-col">
					<label class="label" for="specific_meeting_point_address">Meeting Point Address</label>
					<input
						id="specific_meeting_point_address"
						name="specific_meeting_point_address"
						class="input bg-primary-950/30"
						value={data.group?.specific_meeting_point_address || ''}
						oninput={onField}
					/>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="flex flex-col">
						<label class="label hidden" for="latitude">Latitude</label>
						<input
							id="latitude"
							name="latitude"
							type="number"
							step="any"
							class="input bg-primary-950/30"
							value={data.group?.latitude ?? ''}
							oninput={onField}
							hidden
						/>
					</div>
					<div class="flex flex-col">
						<label class="label hidden" for="longitude">Longitude</label>
						<input
							id="longitude"
							name="longitude"
							type="number"
							step="any"
							class="input bg-primary-950/30"
							value={data.group?.longitude ?? ''}
							oninput={onField}
							hidden
						/>
					</div>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
				<div class="flex flex-col">
					<label class="label" for="service_area_description">Service Area</label>
					<input
						id="service_area_description"
						name="service_area_description"
						class="input bg-primary-950/30"
						value={data.group?.service_area_description || ''}
						oninput={onField}
					/>
				</div>
				<div class="flex flex-col">
					<label class="label" for="activity_frequency">Activity Frequency</label>
					<input
						id="activity_frequency"
						name="activity_frequency"
						class="input bg-primary-950/30"
						value={data.group?.activity_frequency || ''}
						oninput={onField}
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
				<div class="flex flex-col">
					<label class="label" for="typical_activity_day_time">Typical Activity Day/Time</label>
					<input
						id="typical_activity_day_time"
						name="typical_activity_day_time"
						class="input bg-primary-950/30"
						value={data.group?.typical_activity_day_time || ''}
						oninput={onField}
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="flex flex-col gap-2">
					<label class="label" for="logo_url">Logo</label>
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
								class="rounded-base border-surface-400/50 hover:preset-tonal flex w-full flex-col items-center gap-2 border border-dashed p-4"
								onclick={() => logoApi?.openFilePicker?.()}
								aria-label="Select logo file or drag here"
							>
								<IconDropzone class="size-8" />
								<p>Select file or drag here</p>
								<small class="text-xs opacity-60">Max 10MB. PNG/JPG/WEBP.</small>
							</button>
						{/snippet}
					</FileUpload>
					{#if logoFiles.length}
						<ul class="mt-2 space-y-2">
							{#each logoFiles as f (f.name)}
								<li
									class="rounded-base bg-surface-800 flex items-center justify-between px-3 py-2 text-sm"
								>
									<span class="truncate">{f.name}</span>
									<button
										type="button"
										class="btn btn-xs preset-outlined-surface-400"
										onclick={() => {
											logoApi?.deleteFile?.(f);
											onLogoChange({ acceptedFiles: logoApi?.acceptedFiles || [] });
										}}>Remove</button
									>
								</li>
							{/each}
						</ul>
					{/if}

					{#if logoTooLarge}
						<p class="text-error-400 text-xs">
							Selected file exceeds 10MB limit. Please choose a smaller image.
						</p>
					{/if}
					{#if logoPreview}
						<div
							class="border-surface-600 bg-surface-800 relative mt-2 h-24 w-24 overflow-hidden rounded-md border"
						>
							<img src={logoPreview} alt="Logo preview" class="h-full w-full object-cover" />
							<button
								type="button"
								class="btn btn-sm preset-icon-error-500 absolute top-1 right-1"
								onclick={() => removeImage('logo')}
							>
								<IconRemove class="size-4" />
							</button>
						</div>
					{/if}
				</div>
				<div class="flex flex-col gap-2">
					<label class="label" for="cover_photo_url">Cover Photo</label>
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
								class="rounded-base border-surface-400/50 hover:preset-tonal flex w-full flex-col items-center gap-2 border border-dashed p-4"
								onclick={() => coverApi?.openFilePicker?.()}
								aria-label="Select cover image or drag here"
							>
								<IconDropzone class="size-8" />
								<p>Select file or drag here</p>
								<small class="text-xs opacity-60">Max 10MB. PNG/JPG/WEBP.</small>
							</button>
						{/snippet}
					</FileUpload>
					{#if coverFiles.length}
						<ul class="mt-2 space-y-2">
							{#each coverFiles as f (f.name)}
								<li
									class="rounded-base bg-surface-800 flex items-center justify-between px-3 py-2 text-sm"
								>
									<span class="truncate">{f.name}</span>
									<button
										type="button"
										class="btn btn-xs preset-outlined-surface-400"
										onclick={() => {
											coverApi?.deleteFile?.(f);
											onCoverChange({ acceptedFiles: coverApi?.acceptedFiles || [] });
										}}>Remove</button
									>
								</li>
							{/each}
						</ul>
					{/if}

					{#if coverTooLarge}
						<p class="text-error-400 text-xs">
							Selected file exceeds 10MB limit. Please choose a smaller image.
						</p>
					{/if}
					{#if coverPreview}
						<div
							class="border-surface-600 bg-surface-800 relative mt-2 aspect-[16/9] w-full overflow-hidden rounded-md border"
						>
							<img
								src={coverPreview}
								alt="Cover preview"
								class="absolute inset-0 h-full w-full object-cover"
							/>
							<button
								type="button"
								class="btn btn-sm preset-icon-error-500 absolute top-1 right-1"
								onclick={() => removeImage('cover')}
							>
								<IconRemove class="size-4" />
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Hidden inputs for cropped data URLs -->
			<input type="hidden" id="logo_file_cropped" name="logo_file_cropped" />
			<input type="hidden" id="cover_file_cropped" name="cover_file_cropped" />

			{#if submitError}
				<p class="text-error-400 text-sm">{submitError}</p>
			{/if}
			{#if $page.form?.error}
				<p class="text-error-400 text-sm">{$page.form.error}</p>
			{/if}

			{#if cropping}
				<div
					class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
					onpointermove={onCropPointerMove}
					onpointerup={onCropPointerUp}
					onpointercancel={onCropPointerUp}
				>
					<div class="card border-surface-600 bg-surface-900 w-full max-w-4xl border p-4">
						<div class="mb-3 flex items-center justify-between">
							<h3 class="text-xl font-semibold">
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
							class="border-surface-600 bg-surface-800 relative mx-auto w-full overflow-hidden border"
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
							{#if !cropReady}
								<div class="text-surface-300 absolute inset-0 grid place-items-center">
									Loading…
								</div>
							{/if}
							<!-- Rule-of-thirds and boundary guides -->
							<div class="pointer-events-none absolute inset-0">
								<!-- Vertical thirds -->
								<div class="absolute top-0 bottom-0 left-[33.333%] w-px bg-white/40"></div>
								<div class="absolute top-0 bottom-0 left-[66.666%] w-px bg-white/40"></div>
								<!-- Horizontal thirds -->
								<div class="absolute top-[33.333%] right-0 left-0 h-px bg-white/40"></div>
								<div class="absolute top-[66.666%] right-0 left-0 h-px bg-white/40"></div>
								<!-- Visible area border -->
								<div class="absolute inset-0 border border-white/50"></div>
							</div>
						</div>
						<div class="mt-3 flex w-full flex-wrap items-center gap-3">
							<input
								id="crop-zoom"
								type="range"
								min={ZOOM_MIN}
								max={ZOOM_MAX}
								step="0.01"
								bind:value={cropScale}
								class="range"
							/>
							<button
								type="button"
								class="btn preset-outlined-surface-400"
								onclick={() => {
									cropScale = 1;
									cropOffset = { x: 0, y: 0 };
								}}
							>
								Reset
							</button>
							<button
								type="button"
								class="btn preset-filled-primary-500 ml-auto"
								onclick={applyCrop}>Apply</button
							>
						</div>
					</div>
				</div>
			{/if}

			<!-- Many-to-many selections -->
			<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
				<div class="card bg-surface-900 p-3">
					<div class="font-semibold">Group Types</div>
					<div class="mt-2 flex flex-col gap-2">
						{#each data.group_types as gt}
							<label class="flex items-center gap-2">
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
				<div class="card bg-surface-900 p-3">
					<div class="font-semibold">Audience Focus</div>
					<div class="mt-2 flex flex-col gap-2">
						{#each data.audience_focuses as af}
							<label class="flex items-center gap-2">
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
				<div class="card bg-surface-900 p-3">
					<div class="font-semibold">Riding Disciplines</div>
					<div class="mt-2 flex flex-col gap-2">
						{#each data.riding_disciplines as rd}
							<label class="flex items-center gap-2">
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
				<div class="card bg-surface-900 p-3">
					<div class="font-semibold">Skill Levels</div>
					<div class="mt-2 flex flex-col gap-2">
						{#each data.skill_levels as sl}
							<label class="flex items-center gap-2">
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

			<div class="card bg-surface-900 p-3">
				<div class="mb-2 font-semibold">Social Links</div>
				<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
					<div class="flex flex-col">
						<label class="label" for="social_instagram">Instagram Username</label>
						<input
							id="social_instagram"
							name="social_instagram"
							class="input bg-primary-950/30"
							value={(data.group?.social_links && data.group.social_links.instagram) || ''}
							placeholder="username or full URL"
							oninput={onSocialsChange}
						/>
					</div>
					<div class="flex flex-col">
						<label class="label" for="social_facebook">Facebook</label>
						<input
							id="social_facebook"
							name="social_facebook"
							class="input bg-primary-950/30"
							value={(data.group?.social_links && data.group.social_links.facebook) || ''}
							placeholder="username/page or full URL"
							oninput={onSocialsChange}
						/>
					</div>
					<div class="flex flex-col">
						<label class="label" for="social_x">X (Twitter)</label>
						<input
							id="social_x"
							name="social_x"
							class="input bg-primary-950/30"
							value={(data.group?.social_links && data.group.social_links.x) || ''}
							placeholder="handle or full URL"
							oninput={onSocialsChange}
						/>
					</div>
					<div class="flex flex-col">
						<label class="label" for="social_threads">Threads</label>
						<input
							id="social_threads"
							name="social_threads"
							class="input bg-primary-950/30"
							value={(data.group?.social_links && data.group.social_links.threads) || ''}
							placeholder="@handle or full URL"
							oninput={onSocialsChange}
						/>
					</div>
					<div class="flex flex-col">
						<label class="label" for="social_youtube">YouTube</label>
						<input
							id="social_youtube"
							name="social_youtube"
							class="input bg-primary-950/30"
							value={(data.group?.social_links && data.group.social_links.youtube) || ''}
							placeholder="@handle/channel or full URL"
							oninput={onSocialsChange}
						/>
					</div>
					<div class="flex flex-col">
						<label class="label" for="social_tiktok">TikTok</label>
						<input
							id="social_tiktok"
							name="social_tiktok"
							class="input bg-primary-950/30"
							value={(data.group?.social_links && data.group.social_links.tiktok) || ''}
							placeholder="@handle or full URL"
							oninput={onSocialsChange}
						/>
					</div>
					<div class="flex flex-col">
						<label class="label" for="social_strava">Strava</label>
						<input
							id="social_strava"
							name="social_strava"
							class="input bg-primary-950/30"
							value={(data.group?.social_links && data.group.social_links.strava) || ''}
							placeholder="club name/ID or full URL"
							oninput={onSocialsChange}
						/>
					</div>
					<div class="flex flex-col">
						<label class="label" for="social_bluesky">Bluesky</label>
						<input
							id="social_bluesky"
							name="social_bluesky"
							class="input bg-primary-950/30"
							value={(data.group?.social_links && data.group.social_links.bluesky) || ''}
							placeholder="handle or full URL"
							oninput={onSocialsChange}
						/>
					</div>
					<div class="flex flex-col">
						<label class="label" for="social_linkedin">LinkedIn</label>
						<input
							id="social_linkedin"
							name="social_linkedin"
							class="input bg-primary-950/30"
							value={(data.group?.social_links && data.group.social_links.linkedin) || ''}
							placeholder="company/school or full URL"
							oninput={onSocialsChange}
						/>
					</div>
				</div>
				<p class="text-surface-400 mt-1 text-xs">
					Enter usernames or full URLs. We’ll format the links automatically.
				</p>
			</div>

			<div class="mt-2 flex justify-end">
				<button class="btn preset-filled-primary-500">Save Changes</button>
			</div>
		</form>
	</section>
</div>
