export function escapeEmailHtmlValue(input) {
	return String(input ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function safeEmailHref(input) {
	const candidate = String(input ?? '').trim();
	if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
	try {
		const parsed = new URL(candidate);
		return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname
			? parsed.toString()
			: '';
	} catch {
		return '';
	}
}

export function createSafeEmailHtmlContext(context = {}, { trustedHtmlPrefixes = [] } = {}) {
	return Object.fromEntries(
		Object.entries(context).map(([key, value]) => [
			key,
			trustedHtmlPrefixes.some((prefix) => key.startsWith(prefix))
				? String(value ?? '')
				: escapeEmailHtmlValue(value)
		])
	);
}
