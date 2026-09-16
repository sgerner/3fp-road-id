const DEFAULT_ORIGIN = 'https://3fp.org';

function isLocalHost(hostname) {
	const normalized = String(hostname || '')
		.toLowerCase()
		.replace(/^\[|\]$/g, '');
	return (
		normalized === 'localhost' ||
		normalized.endsWith('.localhost') ||
		normalized === '127.0.0.1' ||
		normalized === '::1'
	);
}

export function normalizePublicOrigin(value, fallback = DEFAULT_ORIGIN) {
	let fallbackOrigin = DEFAULT_ORIGIN;
	try {
		const fallbackUrl = new URL(fallback);
		if (['http:', 'https:'].includes(fallbackUrl.protocol)) fallbackOrigin = fallbackUrl.origin;
	} catch {
		// Keep the built-in canonical origin.
	}

	const candidate = String(value || '').trim();
	if (!candidate) return fallbackOrigin;

	try {
		const url = new URL(candidate);
		if (
			!['http:', 'https:'].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			(url.protocol === 'http:' && !isLocalHost(url.hostname))
		) {
			return fallbackOrigin;
		}
		return url.origin;
	} catch {
		return fallbackOrigin;
	}
}
