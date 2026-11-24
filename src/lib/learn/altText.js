export const LEARN_ALT_TEXT_MAX_LENGTH = 150;

const REDUNDANT_ALT_PREFIX_RE =
	/^(?:an?\s+)?(?:image|picture|photo|photograph|graphic|illustration|screenshot|thumbnail|icon)\s+(?:of|showing|depicting)\s+/i;

const FILE_EXTENSION_RE = /\.(?:jpe?g|png|webp|gif|svg|avif|bmp|tiff?|ico|heic|heif|pdf|csv)\s*$/i;

const PLACEHOLDER_ALT_VALUES = new Set([
	'alt',
	'alt text',
	'asset',
	'banner',
	'cover',
	'cover art',
	'cover image',
	'cover photo',
	'cover preview',
	'file',
	'generated',
	'generated art',
	'generated artwork',
	'generated cover',
	'generated image',
	'generated preview',
	'graphic',
	'icon',
	'illustration',
	'image',
	'image preview',
	'logo preview',
	'media',
	'n/a',
	'none',
	'null',
	'photo',
	'photograph',
	'picture',
	'placeholder',
	'preview',
	'screenshot',
	'tbd',
	'thumbnail',
	'todo',
	'undefined',
	'untitled',
	'upload',
	'uploaded image'
]);

const CAMERA_OR_EXPORT_NAME_RE =
	/^(?:img|dsc|dcim|pxl|mvimg|vid|pic|screenshot|screen[\s_-]*shot|asset|upload|untitled|file)[\s_-]*\d[\w\s().&-]*$/i;

const DIMENSION_SUFFIX_RE = /\(\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*(?:px|in)?\s*\)/i;

function safeString(value) {
	if (typeof value !== 'string') return '';
	return value;
}

export function stripRedundantAltPrefix(value) {
	const raw = safeString(value).trim();
	if (!raw) return '';
	const stripped = raw.replace(REDUNDANT_ALT_PREFIX_RE, '').trim();
	if (!stripped || stripped === raw) return raw;
	if (/^[A-Z]/.test(raw) && /^[a-z]/.test(stripped)) {
		return stripped.charAt(0).toUpperCase() + stripped.slice(1);
	}
	return stripped;
}

function extractBasenameWithoutExt(pathOrUrl) {
	const raw = safeString(pathOrUrl).trim();
	if (!raw) return '';
	const withoutQuery = raw
		.split(/[?#]/)[0]
		.replace(/\s+=\d+.*$/, '')
		.trim();
	const lastSegment = withoutQuery.split('/').filter(Boolean).pop() || '';
	let decoded = lastSegment;
	try {
		decoded = decodeURIComponent(lastSegment);
	} catch {
		decoded = lastSegment;
	}
	return decoded.replace(FILE_EXTENSION_RE, '').trim();
}

function normalizeFilenameComparisonToken(value) {
	return safeString(value)
		.toLowerCase()
		.replace(/\\_/g, '_')
		.replace(FILE_EXTENSION_RE, '')
		.replace(/^\d{10,}-/, '')
		.replace(/[*_\-\s]+/g, ' ')
		.trim();
}

export function isFilenameOrPlaceholderAlt(altText, imageUrlOrFileName = '') {
	const raw = safeString(altText).trim();
	if (!raw) return true;

	if (FILE_EXTENSION_RE.test(raw)) return true;

	const normalizedPlaceholder = raw
		.toLowerCase()
		.replace(/[^\w\s/]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!normalizedPlaceholder || PLACEHOLDER_ALT_VALUES.has(normalizedPlaceholder)) {
		return true;
	}

	if (/^\d+$/.test(raw)) return true;
	if (CAMERA_OR_EXPORT_NAME_RE.test(raw)) return true;
	if (DIMENSION_SUFFIX_RE.test(raw)) return true;

	// Single-token snake_case or Prettier-mangled filename token without natural prose spaces
	if (!/\s/.test(raw) && /[_*]/.test(raw)) return true;
	if (/^\d{10,}-[a-z0-9-]+$/i.test(raw)) return true;

	if (imageUrlOrFileName) {
		const base = extractBasenameWithoutExt(imageUrlOrFileName);
		if (base) {
			const cleanRawLower = raw.toLowerCase().replace(/\\_/g, '_').trim();
			const cleanBaseLower = base.toLowerCase().replace(/\\_/g, '_').trim();
			if (cleanRawLower === cleanBaseLower) return true;
			if (
				(/[_*]/.test(raw) || /^\d{10,}-/.test(raw)) &&
				normalizeFilenameComparisonToken(raw) === normalizeFilenameComparisonToken(base)
			) {
				return true;
			}
		}
	}

	return false;
}

export function truncateAltText(value, maxLength = LEARN_ALT_TEXT_MAX_LENGTH) {
	const cleaned = safeString(value).trim();
	if (!cleaned || cleaned.length <= maxLength) return cleaned;

	const slice = cleaned.slice(0, maxLength);
	const minBreak = Math.floor(maxLength * 0.6);
	const lastSpace = slice.lastIndexOf(' ');
	const cut = lastSpace >= minBreak ? slice.slice(0, lastSpace) : slice;
	return cut.replace(/[,;:\-–—\s]+$/, '').trim();
}

export function sanitizeAltText(
	value,
	{
		maxLength = LEARN_ALT_TEXT_MAX_LENGTH,
		fileName = '',
		imageUrl = '',
		rejectFilenames = true
	} = {}
) {
	if (typeof value !== 'string') return '';
	let cleaned = value
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/\[/g, '(')
		.replace(/\]/g, ')')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^["'“”]+|["'“”]+$/g, '')
		.trim();
	if (!cleaned) return '';

	cleaned = stripRedundantAltPrefix(cleaned);
	cleaned = truncateAltText(cleaned, maxLength);
	if (!cleaned) return '';

	if (rejectFilenames && isFilenameOrPlaceholderAlt(cleaned, fileName || imageUrl)) {
		return '';
	}

	return cleaned;
}

export function buildLearnImageMarkdownSnippet({
	url = '',
	altText = '',
	isDecorative = false
} = {}) {
	const cleanUrl = safeString(url).trim();
	if (!cleanUrl) return '';
	if (isDecorative) return `![](${cleanUrl})`;
	const sanitized = sanitizeAltText(altText, { imageUrl: cleanUrl });
	if (!sanitized) return '';
	return `![${sanitized}](${cleanUrl})`;
}

export function buildContextualCoverAlt({
	target = 'learn',
	context = {},
	styleLabel = '',
	heading = ''
} = {}) {
	const ctx = context && typeof context === 'object' ? context : {};
	const subject = safeString(ctx.title || ctx.name || '').trim();
	const detail = safeString(
		ctx.tagline || ctx.summary || ctx.location || ctx.startLocation || ''
	).trim();
	const stylePrefix = safeString(styleLabel).trim();

	let candidate = '';
	if (target === 'ride') {
		if (subject && detail) {
			candidate = `${stylePrefix ? `${stylePrefix} cover` : 'Cover'} illustration for ${subject} ride (${detail})`;
		} else if (subject) {
			candidate = `${stylePrefix ? `${stylePrefix} cover` : 'Cover'} illustration for ${subject} community bike ride`;
		} else {
			candidate = 'Illustrated cyclists riding together on a community group ride';
		}
	} else if (target === 'group') {
		if (subject && detail) {
			candidate = `${stylePrefix ? `${stylePrefix} banner` : 'Banner'} artwork for ${subject}: ${detail}`;
		} else if (subject) {
			candidate = `${stylePrefix ? `${stylePrefix} banner` : 'Banner'} artwork for ${subject} cycling group`;
		} else {
			candidate = 'Community cycling group banner artwork';
		}
	} else if (subject && detail) {
		candidate = `Editorial cover illustration for "${subject}": ${detail}`;
	} else if (subject) {
		candidate = `Editorial cover illustration for "${subject}" guide`;
	} else if (heading) {
		candidate = `${safeString(heading).trim()} cover illustration`;
	} else {
		candidate = 'Editorial cycling safety and advocacy cover illustration';
	}

	return (
		sanitizeAltText(candidate, { maxLength: LEARN_ALT_TEXT_MAX_LENGTH }) ||
		'Editorial cycling illustration'
	);
}

function buildCodeMask(markdown) {
	const length = markdown.length;
	const masked = new Uint8Array(length);
	let i = 0;

	while (i < length) {
		const isLineStart = i === 0 || markdown[i - 1] === '\n';
		if (isLineStart) {
			let indent = i;
			while (indent < length && (markdown[indent] === ' ' || markdown[indent] === '\t')) {
				indent += 1;
			}
			const fenceChar = markdown[indent];
			if (fenceChar === '`' || fenceChar === '~') {
				let fenceLen = 0;
				while (indent + fenceLen < length && markdown[indent + fenceLen] === fenceChar) {
					fenceLen += 1;
				}
				if (fenceLen >= 3) {
					let closePos = markdown.indexOf('\n', indent + fenceLen);
					let endBlock = length;
					while (closePos !== -1) {
						let lineIdx = closePos + 1;
						while (lineIdx < length && (markdown[lineIdx] === ' ' || markdown[lineIdx] === '\t')) {
							lineIdx += 1;
						}
						let closeCount = 0;
						while (lineIdx + closeCount < length && markdown[lineIdx + closeCount] === fenceChar) {
							closeCount += 1;
						}
						const nextNewline = markdown.indexOf('\n', lineIdx + closeCount);
						const restOfLine = markdown
							.slice(lineIdx + closeCount, nextNewline === -1 ? length : nextNewline)
							.trim();
						if (closeCount >= fenceLen && !restOfLine) {
							endBlock = nextNewline === -1 ? length : nextNewline;
							break;
						}
						closePos = nextNewline;
					}
					masked.fill(1, i, endBlock);
					i = endBlock;
					continue;
				}
			}
		}

		if (markdown[i] === '`') {
			let tickLen = 0;
			while (i + tickLen < length && markdown[i + tickLen] === '`') {
				tickLen += 1;
			}
			const tickSeq = '`'.repeat(tickLen);
			let searchFrom = i + tickLen;
			let foundClose = -1;
			while (searchFrom < length) {
				const candidate = markdown.indexOf(tickSeq, searchFrom);
				if (candidate === -1) break;
				const beforeOk = candidate === 0 || markdown[candidate - 1] !== '`';
				const afterOk = candidate + tickLen >= length || markdown[candidate + tickLen] !== '`';
				if (beforeOk && afterOk) {
					foundClose = candidate + tickLen;
					break;
				}
				searchFrom = candidate + 1;
			}
			if (foundClose !== -1) {
				masked.fill(1, i, foundClose);
				i = foundClose;
				continue;
			}
			i += tickLen;
			continue;
		}

		i += 1;
	}

	return masked;
}

function readBalancedBracket(text, openIndex, openChar, closeChar) {
	if (text[openIndex] !== openChar) return null;
	let depth = 0;
	for (let i = openIndex; i < text.length; i += 1) {
		const ch = text[i];
		if (ch === '\\') {
			i += 1;
			continue;
		}
		if (ch === openChar) depth += 1;
		else if (ch === closeChar) {
			depth -= 1;
			if (depth === 0) {
				return {
					end: i + 1,
					inner: text.slice(openIndex + 1, i)
				};
			}
		}
	}
	return null;
}

export function cleanMarkdownImageUrl(rawTarget) {
	let cleaned = safeString(rawTarget).trim();
	if (!cleaned) return '';
	if (cleaned.startsWith('<') && cleaned.includes('>')) {
		return cleaned.slice(1, cleaned.indexOf('>')).trim();
	}
	cleaned = cleaned
		.replace(/\s+=\d+[^)]*$/i, '')
		.replace(/\s+(?:"[^"]*"|'[^']*')\s*$/, '')
		.trim();
	return cleaned;
}

function collectHeadingOffsets(markdown, masked) {
	const headings = [];
	let lineStart = 0;
	while (lineStart <= markdown.length) {
		const nextNewline = markdown.indexOf('\n', lineStart);
		const lineEnd = nextNewline === -1 ? markdown.length : nextNewline;
		if (!masked[lineStart]) {
			const line = markdown.slice(lineStart, lineEnd);
			const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
			if (match) {
				headings.push({
					offset: lineStart,
					text: match[2].replace(/[*_`~]/g, '').trim()
				});
			}
		}
		if (nextNewline === -1) break;
		lineStart = nextNewline + 1;
	}
	return headings;
}

function findEnclosingLinks(markdown, masked) {
	const links = [];
	for (let i = 0; i < markdown.length; i += 1) {
		if (masked[i]) continue;
		if (markdown[i] === '\\') {
			i += 1;
			continue;
		}
		if (markdown[i] !== '[') continue;
		if (i > 0 && markdown[i - 1] === '!') continue;

		const labelPart = readBalancedBracket(markdown, i, '[', ']');
		if (!labelPart) continue;
		if (markdown[labelPart.end] !== '(') continue;
		const targetPart = readBalancedBracket(markdown, labelPart.end, '(', ')');
		if (!targetPart) continue;
		if (/\r?\n\s*\r?\n/.test(labelPart.inner)) continue;

		links.push({
			start: i,
			labelStart: i + 1,
			labelEnd: labelPart.end - 1,
			end: targetPart.end,
			labelInner: labelPart.inner,
			href: cleanMarkdownImageUrl(targetPart.inner)
		});
	}
	return links;
}

function isCanvaUrl(url) {
	return /(?:^https?:\/\/)?(?:www\.)?canva\.com\//i.test(safeString(url).trim());
}

export function extractMarkdownImages(markdown) {
	const source = safeString(markdown);
	if (!source) return [];

	const masked = buildCodeMask(source);
	const headings = collectHeadingOffsets(source, masked);
	const enclosingLinks = findEnclosingLinks(source, masked);
	const images = [];

	for (let i = 0; i < source.length - 3; i += 1) {
		if (masked[i]) continue;
		if (source[i] === '\\') {
			i += 1;
			continue;
		}
		if (source[i] !== '!' || source[i + 1] !== '[') continue;

		const altPart = readBalancedBracket(source, i + 1, '[', ']');
		if (!altPart) continue;
		if (source[altPart.end] !== '(') continue;
		const targetPart = readBalancedBracket(source, altPart.end, '(', ')');
		if (!targetPart) continue;
		if (/[\r\n]/.test(targetPart.inner)) continue;

		const start = i;
		const end = targetPart.end;
		const currentAlt = altPart.inner;
		const rawTarget = targetPart.inner;
		const imageUrl = cleanMarkdownImageUrl(rawTarget);

		let sectionHeading = '';
		for (const heading of headings) {
			if (heading.offset < start) sectionHeading = heading.text;
			else break;
		}

		const enclosingLink =
			enclosingLinks.find((link) => start >= link.labelStart && end <= link.labelEnd) || null;
		let enclosingLinkText = '';
		if (enclosingLink) {
			const relStart = start - enclosingLink.labelStart;
			const relEnd = end - enclosingLink.labelStart;
			const withoutThisImage =
				enclosingLink.labelInner.slice(0, relStart) + enclosingLink.labelInner.slice(relEnd);
			enclosingLinkText = withoutThisImage
				.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
				.replace(/[*_`~]/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();
		}

		const enclosingLinkUrl = enclosingLink?.href || '';
		const isSoleLinkContent = Boolean(enclosingLinkUrl && !enclosingLinkText);
		const isCanvaLink = isCanvaUrl(enclosingLinkUrl);

		const contextStart = Math.max(0, (enclosingLink ? enclosingLink.start : start) - 220);
		const contextEnd = Math.min(source.length, (enclosingLink ? enclosingLink.end : end) + 220);
		const surroundingContext = (
			source.slice(contextStart, enclosingLink ? enclosingLink.start : start) +
			' ' +
			source.slice(enclosingLink ? enclosingLink.end : end, contextEnd)
		)
			.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 360);

		const trimmedAlt = currentAlt.trim();
		const needsRemediation = trimmedAlt
			? isFilenameOrPlaceholderAlt(trimmedAlt, imageUrl)
			: isSoleLinkContent || !trimmedAlt;

		images.push({
			index: images.length,
			start,
			end,
			rawMarkdown: source.slice(start, end),
			currentAlt,
			rawTarget,
			imageUrl,
			sectionHeading,
			surroundingContext,
			enclosingLinkUrl,
			enclosingLinkText,
			isSoleLinkContent,
			isCanvaLink,
			needsRemediation
		});

		i = end - 1;
	}

	return images;
}

export function applyMarkdownAltReplacements(markdown, replacements = []) {
	const source = safeString(markdown);
	if (!source || !Array.isArray(replacements) || !replacements.length) return source;

	const images = extractMarkdownImages(source);
	if (!images.length) return source;

	const byIndex = new Map();
	for (const item of replacements) {
		if (!item || typeof item !== 'object') continue;
		const index = Number(item.index);
		if (!Number.isInteger(index) || index < 0 || index >= images.length) continue;
		const targetImage = images[index];
		if (item.isDecorative && !targetImage.isSoleLinkContent) {
			byIndex.set(index, '');
			continue;
		}
		const sanitized = sanitizeAltText(item.altText ?? item.proposedAlt ?? '', {
			imageUrl: targetImage.imageUrl
		});
		if (sanitized) {
			byIndex.set(index, sanitized);
		}
	}

	if (!byIndex.size) return source;

	let updated = source;
	const sortedIndexes = [...byIndex.keys()].sort((a, b) => b - a);
	for (const index of sortedIndexes) {
		const image = images[index];
		const nextAlt = byIndex.get(index);
		const replacement = `![${nextAlt}](${image.rawTarget})`;
		updated = updated.slice(0, image.start) + replacement + updated.slice(image.end);
	}

	return updated;
}

export function isLearnAttachmentAsset(asset) {
	if (!asset || typeof asset !== 'object') return false;
	const usageKind = safeString(asset.usage_kind ?? asset.usageKind ?? 'attachment')
		.trim()
		.toLowerCase();
	return usageKind !== 'embedded' && usageKind !== 'cover';
}

export function filterLearnAttachmentAssets(assets) {
	if (!Array.isArray(assets)) return [];
	return assets.filter(isLearnAttachmentAsset);
}
