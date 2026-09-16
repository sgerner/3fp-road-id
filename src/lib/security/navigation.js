/**
 * Accept only same-origin paths for post-authentication redirects.
 *
 * This is shared by server routes and the browser confirmation page so the
 * redirect contract cannot drift between the two sides of the login flow.
 */
export function isSafeInternalPath(value) {
	if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false;
	if (
		value.includes('\\') ||
		[...value].some((character) => {
			const code = character.charCodeAt(0);
			return code < 0x20 || code > 0x7e;
		})
	) {
		return false;
	}

	try {
		const decoded = decodeURIComponent(value);
		if (
			decoded.startsWith('//') ||
			decoded.includes('\\') ||
			[...decoded].some((character) => {
				const code = character.charCodeAt(0);
				return code < 0x20 || code === 0x7f;
			})
		) {
			return false;
		}
		const parsed = new URL(value, 'https://internal.invalid');
		return parsed.origin === 'https://internal.invalid';
	} catch {
		return false;
	}
}
