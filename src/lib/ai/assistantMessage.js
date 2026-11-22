import { isSafeInternalPath } from '#lib/security/navigation.js';
import { safeHttpUrl } from '#lib/security/urls.js';

const KNOWN_INTERNAL_ROUTE_SEGMENTS = [
	'roadid',
	'merch',
	'donate',
	'volunteer',
	'get-involved',
	'learn',
	'ride',
	'groups',
	'profile',
	'research',
	'privacy',
	'terms',
	'data-deletion'
];

const KNOWN_ROUTE_SEGMENT_SET = new Set(KNOWN_INTERNAL_ROUTE_SEGMENTS);
const SAME_SITE_HOSTS = new Set([
	'3fp.org',
	'www.3fp.org',
	'3feetplease.org',
	'www.3feetplease.org',
	'localhost',
	'127.0.0.1'
]);

const PLACEHOLDER_LEARN_PATH_PATTERN =
	/^\/learn\/(?:to-?do|todo|tbd|coming-soon|placeholder)(?:[/?#]|$)/i;

const INLINE_ROUTE_PATTERN =
	/^\/(?:roadid|merch|donate|volunteer|get-involved|learn|ride|groups|profile)(?:\/[^\s<>"')\]]*)?/i;

const INLINE_BARE_SITE_PATTERN = /^3fp\.org(\/[^\s<>"')\]]*)?/i;

const INLINE_HTTP_URL_PATTERN = /^https?:\/\/[^\s<>"')\]]+/i;

export function escapeAssistantHtml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function cleanInternalPathCandidate(rawPath) {
	const collapsed = '/' + String(rawPath || '').replace(/^\/+/, '');
	const normalized = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : '/';
	if (PLACEHOLDER_LEARN_PATH_PATTERN.test(normalized)) return '';
	return isSafeInternalPath(normalized) ? normalized : '';
}

/**
 * Normalize and validate assistant links and action targets.
 * Repairs malformed internal URLs (such as `https://.../roadid`, `https:///donate`,
 * `https://roadid/`, or `https://3fp.org/merch`) into safe internal paths, and
 * validates external URLs via `safeHttpUrl`.
 */
export function normalizeAssistantHref(raw) {
	const candidate = String(raw ?? '')
		.trim()
		.replace(/^<+|>+$/g, '');
	if (
		!candidate ||
		candidate.includes('\\') ||
		[...candidate].some((character) => {
			const code = character.charCodeAt(0);
			return code <= 0x1f || code === 0x7f;
		})
	) {
		return '';
	}

	// Reject protocol-relative external URLs strictly.
	if (candidate.startsWith('//')) {
		return '';
	}

	// Repair triple-slash scheme URLs: https:///roadid -> /roadid
	const tripleSlashMatch = candidate.match(/^https?:\/\/\/+([^\s]+)$/i);
	if (tripleSlashMatch) {
		return cleanInternalPathCandidate(tripleSlashMatch[1]);
	}

	// Repair ellipsis placeholder host URLs: https://.../roadid or https://…/donate -> /roadid
	const ellipsisHostMatch = candidate.match(/^https?:\/\/(?:\.{2,}|…+)(\/[^\s]*)?$/i);
	if (ellipsisHostMatch) {
		return cleanInternalPathCandidate(ellipsisHostMatch[1] || '/');
	}

	// Normalize bare 3fp.org/... mentions into internal paths.
	const bareSiteMatch = candidate.match(/^(?:www\.)?3fp\.org(\/[^\s]*)?$/i);
	if (bareSiteMatch) {
		return cleanInternalPathCandidate(bareSiteMatch[1] || '/');
	}

	// Repair relative known 3FP routes (e.g. "roadid" or "learn/new" inside markdown links).
	const bareRelativeRouteMatch = candidate.match(
		/^(roadid|merch|donate|volunteer|get-involved|learn|ride|groups|profile)(\/[^\s]*)?$/i
	);
	if (bareRelativeRouteMatch) {
		const segment = bareRelativeRouteMatch[1].toLowerCase();
		const rest = bareRelativeRouteMatch[2] || '';
		return cleanInternalPathCandidate(`${segment}${rest}`);
	}

	// Direct internal path: /roadid, /merch, /groups/madison-bikes-inc-madison-wi
	if (candidate.startsWith('/')) {
		return cleanInternalPathCandidate(candidate);
	}

	// Scheme-prefixed HTTP(S) URL: check for same-site or missing-domain internal route host.
	if (/^https?:\/\//i.test(candidate)) {
		const validated = safeHttpUrl(candidate);
		if (!validated) return '';
		try {
			const parsed = new URL(validated);
			const host = parsed.hostname.toLowerCase();

			if (SAME_SITE_HOSTS.has(host)) {
				const fullPath = `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
				return cleanInternalPathCandidate(fullPath);
			}

			// Repair https://roadid/ or https://groups/madison-bikes-inc-madison-wi
			if (KNOWN_ROUTE_SEGMENT_SET.has(host)) {
				const restPath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
				const fullPath = `/${host}${restPath}${parsed.search || ''}${parsed.hash || ''}`;
				return cleanInternalPathCandidate(fullPath);
			}

			// Reject broken single-label hostnames without a TLD dot (e.g. https://placeholder/)
			if (!host.includes('.')) {
				return '';
			}

			return parsed.href;
		} catch {
			return '';
		}
	}

	return '';
}

export function normalizeNavigationTarget(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const href = normalizeAssistantHref(raw.url);
	if (!href) return null;
	const label = String(raw.label || 'Open').trim() || 'Open';
	const reason = String(raw.reason || '').trim();
	return {
		url: href,
		label,
		reason
	};
}

function splitTrailingPunctuation(token) {
	let core = String(token || '');
	let trailing = '';
	while (core.length > 1 && /[.,;:!?]$/.test(core)) {
		trailing = core.slice(-1) + trailing;
		core = core.slice(0, -1);
	}
	return { core, trailing };
}

function isMalformedUrlDisplay(text) {
	const trimmed = String(text || '').trim();
	if (/^https?:\/\/\/+/i.test(trimmed)) return true;
	if (/^https?:\/\/(?:\.{2,}|…+)/i.test(trimmed)) return true;
	const schemeHostMatch = trimmed.match(/^https?:\/\/([a-z0-9-]+)(?:\/|$)/i);
	if (schemeHostMatch && KNOWN_ROUTE_SEGMENT_SET.has(schemeHostMatch[1].toLowerCase())) {
		return true;
	}
	return false;
}

function renderAnchorTag(href, labelHtml) {
	if (href.startsWith('/')) {
		return `<a href="${escapeAssistantHtml(href)}" class="assistant-link">${labelHtml}</a>`;
	}
	return `<a href="${escapeAssistantHtml(href)}" class="assistant-link" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;
}

function isLinkBoundaryChar(charBefore) {
	if (!charBefore) return true;
	return /[\s([{"'“‘]/.test(charBefore);
}

function renderInlineFormattingOnly(text) {
	const input = String(text || '');
	const len = input.length;
	let index = 0;
	let buffer = '';
	let output = '';

	const flush = () => {
		if (buffer) {
			output += escapeAssistantHtml(buffer);
			buffer = '';
		}
	};

	while (index < len) {
		if (input.startsWith('**', index)) {
			const end = input.indexOf('**', index + 2);
			if (end > index + 2) {
				flush();
				output += `<strong>${renderInlineFormattingOnly(input.slice(index + 2, end))}</strong>`;
				index = end + 2;
				continue;
			}
		}

		if (input[index] === '*' && !input.startsWith('**', index)) {
			const end = input.indexOf('*', index + 1);
			if (end > index + 1) {
				flush();
				output += `<em>${renderInlineFormattingOnly(input.slice(index + 1, end))}</em>`;
				index = end + 1;
				continue;
			}
		}

		if (input[index] === '`') {
			const end = input.indexOf('`', index + 1);
			if (end > index + 1) {
				flush();
				output += `<code class="assistant-inline-code">${escapeAssistantHtml(input.slice(index + 1, end))}</code>`;
				index = end + 1;
				continue;
			}
		}

		buffer += input[index];
		index += 1;
	}

	flush();
	return output;
}

export function renderAssistantInlineHtml(text) {
	const input = String(text || '');
	const len = input.length;
	let index = 0;
	let buffer = '';
	let output = '';

	const flush = () => {
		if (buffer) {
			output += escapeAssistantHtml(buffer);
			buffer = '';
		}
	};

	while (index < len) {
		// Inline code spans
		if (input[index] === '`') {
			const end = input.indexOf('`', index + 1);
			if (end > index + 1) {
				flush();
				const codeContent = input.slice(index + 1, end).trim();
				const maybeRouteHref = INLINE_ROUTE_PATTERN.test(codeContent)
					? normalizeAssistantHref(codeContent)
					: '';
				if (maybeRouteHref) {
					output += renderAnchorTag(
						maybeRouteHref,
						`<code class="assistant-inline-code">${escapeAssistantHtml(maybeRouteHref)}</code>`
					);
				} else {
					output += `<code class="assistant-inline-code">${escapeAssistantHtml(input.slice(index + 1, end))}</code>`;
				}
				index = end + 1;
				continue;
			}
		}

		// Markdown links: [label](target)
		if (input[index] === '[') {
			const closeBracket = input.indexOf(']', index + 1);
			const openParen = closeBracket !== -1 ? input.indexOf('(', closeBracket) : -1;
			const closeParen = openParen === closeBracket + 1 ? input.indexOf(')', openParen + 1) : -1;
			if (closeBracket > index && openParen === closeBracket + 1 && closeParen > openParen) {
				const rawLabel = input.slice(index + 1, closeBracket);
				const rawTarget = input.slice(openParen + 1, closeParen);
				const href = normalizeAssistantHref(rawTarget);
				flush();
				if (href) {
					const cleanLabel = isMalformedUrlDisplay(rawLabel) ? href : rawLabel;
					output += renderAnchorTag(href, renderInlineFormattingOnly(cleanLabel));
				} else {
					output += renderInlineFormattingOnly(rawLabel);
				}
				index = closeParen + 1;
				continue;
			}
		}

		// Bold: **text**
		if (input.startsWith('**', index)) {
			const end = input.indexOf('**', index + 2);
			if (end > index + 2) {
				flush();
				output += `<strong>${renderAssistantInlineHtml(input.slice(index + 2, end))}</strong>`;
				index = end + 2;
				continue;
			}
		}

		// Italic: *text* (avoiding ** and mid-word asterisks)
		if (
			input[index] === '*' &&
			!input.startsWith('**', index) &&
			input[index + 1] &&
			!/\s/.test(input[index + 1])
		) {
			const end = input.indexOf('*', index + 1);
			if (end > index + 1 && !/\s/.test(input[end - 1])) {
				flush();
				output += `<em>${renderAssistantInlineHtml(input.slice(index + 1, end))}</em>`;
				index = end + 1;
				continue;
			}
		}

		const prevChar = index > 0 ? input[index - 1] : '';
		if (isLinkBoundaryChar(prevChar)) {
			const slice = input.slice(index);

			// Bare HTTP(S) URLs (including malformed https://.../roadid or https://roadid/)
			const httpMatch = slice.match(INLINE_HTTP_URL_PATTERN);
			if (httpMatch) {
				const { core, trailing } = splitTrailingPunctuation(httpMatch[0]);
				const href = normalizeAssistantHref(core);
				if (href) {
					flush();
					const displayText = isMalformedUrlDisplay(core) ? href : core;
					output += renderAnchorTag(href, escapeAssistantHtml(displayText));
					index += core.length;
					if (trailing) {
						buffer += trailing;
						index += trailing.length;
					}
					continue;
				}
			}

			// Bare 3fp.org/... mentions
			const bareSiteMatch = slice.match(INLINE_BARE_SITE_PATTERN);
			if (bareSiteMatch) {
				const { core, trailing } = splitTrailingPunctuation(bareSiteMatch[0]);
				const href = normalizeAssistantHref(core);
				if (href) {
					flush();
					output += renderAnchorTag(href, escapeAssistantHtml(core));
					index += core.length;
					if (trailing) {
						buffer += trailing;
						index += trailing.length;
					}
					continue;
				}
			}

			// Bare internal routes (/roadid, /merch, /donate, /groups/..., etc.)
			const routeMatch = slice.match(INLINE_ROUTE_PATTERN);
			if (routeMatch) {
				const { core, trailing } = splitTrailingPunctuation(routeMatch[0]);
				const href = normalizeAssistantHref(core);
				if (href) {
					flush();
					output += renderAnchorTag(href, escapeAssistantHtml(href));
					index += core.length;
					if (trailing) {
						buffer += trailing;
						index += trailing.length;
					}
					continue;
				}
			}
		}

		buffer += input[index];
		index += 1;
	}

	flush();
	return output;
}

export function renderAssistantMessageHtml(content) {
	const normalized = String(content ?? '').replace(/\r\n?/g, '\n');
	if (!normalized) return '';
	return normalized
		.split('\n')
		.map((line) => renderAssistantInlineHtml(line))
		.join('<br />');
}
