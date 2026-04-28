export function cleanSeoText(value) {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/\s+/g, ' ')
		.replace(/[#*_`>[\]]/g, ' ')
		.trim();
}

export function limitSeoText(value, max = 160) {
	const text = cleanSeoText(value);
	if (text.length <= max) return text;
	return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function normalizePathname(pathname) {
	const value = String(pathname || '').trim() || '/';
	const stripped = value.replace(/\/+$/g, '');
	return stripped || '/';
}

export function buildAbsoluteUrl(origin, pathname = '/') {
	try {
		return new URL(pathname, origin).toString();
	} catch {
		return String(origin || '');
	}
}

export function getRelativePathname(pathname, basePath = '/') {
	const current = normalizePathname(pathname);
	const base = normalizePathname(basePath);

	if (current === base) return '';
	if (base === '/') {
		return current === '/' ? '' : current.slice(1);
	}
	if (!current.startsWith(`${base}/`)) return '';
	return current.slice(base.length + 1);
}
