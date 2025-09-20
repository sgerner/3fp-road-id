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
