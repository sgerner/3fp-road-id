const ROOT_DOMAIN = '3fp.bike';
const RESERVED_SUBDOMAINS = new Set(['www', 'api']);
const RESERVED_MICROSITE_SLUGS = new Set([
	'admin',
	'api',
	'auth',
	'donate',
	'groups',
	'learn',
	'merch',
	'privacy',
	'profile',
	'ride',
	'roadid',
	'site',
	'terms',
	'volunteer'
]);

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function normalizeMicrositeSlug(value) {
	return cleanText(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]/g, '');
}

export function normalizeHostname(value) {
	return cleanText(value).toLowerCase().replace(/:\d+$/, '');
}

export function extractMicrositeSlugFromHostname(hostname) {
	const normalized = normalizeHostname(hostname);
	if (!normalized) return '';

	if (normalized.endsWith(`.${ROOT_DOMAIN}`)) {
		const label = normalized.slice(0, -1 * (`.${ROOT_DOMAIN}`.length));
		if (!label || label.includes('.')) return '';
		return RESERVED_SUBDOMAINS.has(label) || RESERVED_MICROSITE_SLUGS.has(label) ? '' : label;
	}

	if (normalized.endsWith('.localhost')) {
		const label = normalized.slice(0, -1 * '.localhost'.length);
		if (!label || label.includes('.')) return '';
		return RESERVED_SUBDOMAINS.has(label) || RESERVED_MICROSITE_SLUGS.has(label) ? '' : label;
	}

	return '';
}

export function buildMicrositeUrl(slug, requestUrl) {
	const safeSlug = normalizeMicrositeSlug(slug);
	if (!safeSlug) return '';
	if (!requestUrl) return `https://${safeSlug}.${ROOT_DOMAIN}`;

	const url = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl));
	const host = normalizeHostname(url.hostname);
	const protocol = url.protocol || 'https:';
	const port = url.port ? `:${url.port}` : '';

	if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) {
		return `https://${safeSlug}.${ROOT_DOMAIN}`;
	}

	if (host === 'localhost' || host === '127.0.0.1') {
		return `${protocol}//${safeSlug}.localhost${port}`;
	}

	return `${url.origin}/${encodeURIComponent(safeSlug)}`;
}

export function isReservedMicrositeSlug(value) {
	const normalized = normalizeMicrositeSlug(value);
	return Boolean(normalized) && RESERVED_MICROSITE_SLUGS.has(normalized);
}
