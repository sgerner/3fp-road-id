import { isSafeInternalPath } from './navigation.js';

export function safeHttpUrl(value) {
	const raw = String(value ?? '').trim();
	if (
		!raw ||
		raw.startsWith('/') ||
		raw.includes('\\') ||
		[...raw].some((character) => {
			const code = character.charCodeAt(0);
			return code <= 0x1f || code === 0x7f;
		})
	) {
		return '';
	}

	const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw;
	try {
		const url = new URL(candidate);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
		return url.href;
	} catch {
		return '';
	}
}

export function safeNavigationUrl(value) {
	const raw = String(value ?? '').trim();
	if (
		!raw ||
		raw.includes('\\') ||
		[...raw].some((character) => {
			const code = character.charCodeAt(0);
			return code <= 0x1f || code === 0x7f;
		})
	) {
		return '';
	}

	if (isSafeInternalPath(raw)) return raw;
	if (/^(?:mailto|tel):/i.test(raw)) {
		try {
			const url = new URL(raw);
			return ['mailto:', 'tel:'].includes(url.protocol) ? url.href : '';
		} catch {
			return '';
		}
	}
	return safeHttpUrl(raw);
}
