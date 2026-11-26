/**
 * Accept only same-origin paths for post-authentication redirects.
 *
 * This is shared by server routes and the browser confirmation page so the
 * redirect contract cannot drift between the two sides of the login flow.
 *
 * @param {unknown} value
 * @returns {boolean}
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
		return parsed.origin === 'https://internal.invalid' && !parsed.pathname.startsWith('//');
	} catch {
		return false;
	}
}

/** @type {{ pathname: string; build: () => string } | null} */
let registeredLoginReturnPathEntry = null;

/**
 * @param {string} rawPath
 * @returns {boolean}
 */
function hasDotPathSegment(rawPath) {
	let decodedPath = rawPath;
	try {
		decodedPath = decodeURIComponent(rawPath);
	} catch {
		return true;
	}
	const pathnameOnly = decodedPath.split(/[?#]/, 1)[0] || '';
	return pathnameOnly.split('/').some((segment) => segment === '.' || segment === '..');
}

/**
 * Register a route-scoped builder that enriches the post-login `returnTo` query
 * string for `pathname` without mutating `window`. Returns an unregister cleanup.
 *
 * @param {string} pathname
 * @param {() => string} build
 * @returns {() => void}
 */
export function registerLoginReturnPathBuilder(pathname, build) {
	if (typeof pathname !== 'string' || !pathname.startsWith('/') || typeof build !== 'function') {
		return () => {};
	}
	const entry = { pathname, build };
	registeredLoginReturnPathEntry = entry;
	return () => {
		if (registeredLoginReturnPathEntry === entry) {
			registeredLoginReturnPathEntry = null;
		}
	};
}

/**
 * Resolve a registered login return path only when it targets the exact active
 * `currentPathname` and passes `isSafeInternalPath`.
 *
 * @param {string} currentPathname
 * @returns {string}
 */
export function resolveRegisteredLoginReturnPath(currentPathname) {
	if (
		!registeredLoginReturnPathEntry ||
		typeof currentPathname !== 'string' ||
		registeredLoginReturnPathEntry.pathname !== currentPathname
	) {
		return '';
	}
	try {
		const candidate = String(registeredLoginReturnPathEntry.build() || '').trim();
		if (!isSafeInternalPath(candidate) || hasDotPathSegment(candidate)) {
			return '';
		}
		const parsed = new URL(candidate, 'https://internal.invalid');
		if (parsed.pathname !== currentPathname) {
			return '';
		}
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return '';
	}
}
