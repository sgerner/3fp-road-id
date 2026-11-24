const GOOGLE_MAPS_SCRIPT_ID = 'gmaps-places-shared';
const GOOGLE_MAPS_CALLBACK = '__3fpInitGoogleMapsPlaces';

let baseLeafletPromise = null;
let clusterLeafletPromise = null;
let googleMapsPlacesPromise = null;

export async function ensureLeafletDefaultIcon(L) {
	try {
		const iconRetina = (await import('leaflet/dist/images/marker-icon-2x.png')).default;
		const iconUrl = (await import('leaflet/dist/images/marker-icon.png')).default;
		const shadowUrl = (await import('leaflet/dist/images/marker-shadow.png')).default;
		try {
			// Some Leaflet builds define this method; remove so mergeOptions applies
			delete L.Icon.Default.prototype._getIconUrl;
		} catch {}
		L.Icon.Default.mergeOptions({ iconRetinaUrl: iconRetina, iconUrl, shadowUrl });
	} catch (e) {
		console.warn('Leaflet marker icon assets not set', e);
	}
}

export async function loadLeaflet({ cluster = false } = {}) {
	if (!baseLeafletPromise) {
		baseLeafletPromise = Promise.all([import('#lib/map/leaflet.css'), import('leaflet')])
			.then(async ([, mod]) => {
				const L = mod.default || mod;
				await ensureLeafletDefaultIcon(L);
				return L;
			})
			.catch((err) => {
				baseLeafletPromise = null;
				throw err;
			});
	}

	const L = await baseLeafletPromise;

	if (cluster) {
		if (!clusterLeafletPromise) {
			clusterLeafletPromise = (async () => {
				// leaflet.markercluster is a UMD bundle that attaches onto globalThis.L
				globalThis.L = L;
				await import('leaflet.markercluster');
				return L;
			})().catch((err) => {
				clusterLeafletPromise = null;
				throw err;
			});
		}
		await clusterLeafletPromise;
	}

	return L;
}

export function loadGoogleMapsPlaces(apiKey) {
	if (typeof window === 'undefined') {
		return Promise.resolve(null);
	}
	if (window.google?.maps?.places) {
		return Promise.resolve(window.google.maps);
	}
	const trimmedKey = String(apiKey ?? '').trim();
	if (!trimmedKey) {
		return Promise.resolve(null);
	}
	if (googleMapsPlacesPromise) {
		return googleMapsPlacesPromise;
	}

	googleMapsPlacesPromise = new Promise((resolve, reject) => {
		const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
		if (existing) {
			const checkInterval = window.setInterval(() => {
				if (window.google?.maps?.places) {
					window.clearInterval(checkInterval);
					resolve(window.google.maps);
				}
			}, 100);
			window.setTimeout(() => {
				window.clearInterval(checkInterval);
				if (window.google?.maps?.places) {
					resolve(window.google.maps);
				} else {
					googleMapsPlacesPromise = null;
					reject(new Error('Timed out loading Google Maps Places.'));
				}
			}, 10000);
			return;
		}

		window[GOOGLE_MAPS_CALLBACK] = () => {
			try {
				delete window[GOOGLE_MAPS_CALLBACK];
			} catch {}
			resolve(window.google?.maps ?? null);
		};

		const script = document.createElement('script');
		script.id = GOOGLE_MAPS_SCRIPT_ID;
		script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(trimmedKey)}&libraries=places&callback=${GOOGLE_MAPS_CALLBACK}`;
		script.async = true;
		script.defer = true;
		script.onerror = () => {
			googleMapsPlacesPromise = null;
			try {
				delete window[GOOGLE_MAPS_CALLBACK];
			} catch {}
			reject(new Error('Unable to load Google Maps Places.'));
		};
		document.head.appendChild(script);
	});

	return googleMapsPlacesPromise;
}

export function parseCoordinate(value) {
	if (value === null || value === undefined || typeof value === 'boolean') return null;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}
	return null;
}

export function isValidLatLng(lat, lng) {
	const parsedLat = parseCoordinate(lat);
	const parsedLng = parseCoordinate(lng);
	if (parsedLat === null || parsedLng === null) return false;
	return parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180;
}

export function clampCoordinate(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

export function formatCoordinate(value, decimals = 6) {
	const parsed = parseCoordinate(value);
	return parsed === null ? '' : parsed.toFixed(decimals);
}

export function formatClusterAriaLabel(count, singular = 'listing', plural = 'listings') {
	const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
	const noun = safeCount === 1 ? singular : plural;
	return `Cluster of ${safeCount} ${noun} — activate to zoom in and expand`;
}

export function buildUniqueMarkerLabels(items = [], fallbackNoun = 'Map listing') {
	const baseLabels = items.map((item) => {
		const explicit = typeof item?.markerLabel === 'string' ? item.markerLabel.trim() : '';
		if (explicit) return explicit;
		const title = typeof item?.title === 'string' ? item.title.trim() : '';
		const subtitle = typeof item?.subtitle === 'string' ? item.subtitle.trim() : '';
		const parts = [title || fallbackNoun, subtitle].filter(Boolean);
		return parts.join(' — ');
	});

	const baseCounts = new Map();
	for (const label of baseLabels) {
		baseCounts.set(label, (baseCounts.get(label) ?? 0) + 1);
	}

	const withMetaLabels = items.map((item, idx) => {
		const base = baseLabels[idx];
		if ((baseCounts.get(base) ?? 0) <= 1) return base;
		const meta = typeof item?.meta === 'string' ? item.meta.trim() : '';
		return meta ? `${base} (${meta})` : base;
	});

	const finalCounts = new Map();
	for (const label of withMetaLabels) {
		finalCounts.set(label, (finalCounts.get(label) ?? 0) + 1);
	}

	const seenCollisions = new Map();
	const result = new Map();

	items.forEach((item, idx) => {
		const id = String(item?.id ?? idx);
		const candidate = withMetaLabels[idx];
		const total = finalCounts.get(candidate) ?? 1;
		if (total <= 1) {
			result.set(id, candidate);
			return;
		}
		const current = (seenCollisions.get(candidate) ?? 0) + 1;
		seenCollisions.set(candidate, current);
		result.set(id, `${candidate} (${current} of ${total})`);
	});

	return result;
}
