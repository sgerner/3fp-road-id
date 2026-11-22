import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({
	gfm: true,
	breaks: false
});

const sanitizeOptions = {
	allowedTags: [
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'p',
		'br',
		'hr',
		'blockquote',
		'pre',
		'code',
		'strong',
		'em',
		'ul',
		'ol',
		'li',
		'table',
		'thead',
		'tbody',
		'tr',
		'th',
		'td',
		'a',
		'img'
	],
	allowedAttributes: {
		a: ['href', 'name', 'target', 'rel'],
		img: ['src', 'alt', 'title'],
		table: ['data-stackable'],
		td: ['data-label']
	},
	allowedSchemes: ['http', 'https', 'mailto'],
	transformTags: {
		a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true)
	}
};

export function parseMarkdownDocument(source) {
	const parsed = matter(source || '');
	return {
		frontmatter: parsed.data || {},
		body: (parsed.content || '').trim()
	};
}

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function slugifyHeading(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function stripMarkdown(text) {
	return safeTrim(text)
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/(\*\*|__|\*|_|~~)/g, '')
		.trim();
}

export function extractMarkdownHeadings(markdown) {
	const seen = new Map();
	const headings = [];

	marked.walkTokens(marked.lexer(safeTrim(markdown)), (token) => {
		if (token.type !== 'heading') return;
		const depth = token.depth;
		const text = stripMarkdown(token.text);
		if (!text) return;
		const baseId = slugifyHeading(text) || `section-${headings.length + 1}`;
		const count = seen.get(baseId) ?? 0;
		seen.set(baseId, count + 1);
		headings.push({
			depth,
			text,
			id: count ? `${baseId}-${count + 1}` : baseId
		});
	});

	return headings;
}

export function splitMarkdownIntoSections(markdown) {
	const lines = safeTrim(markdown).replace(/\r\n?/g, '\n').split('\n');
	const headingMatches = lines
		.map((line, index) => {
			const match = line.match(/^(#{1,6})\s+(.*)$/);
			return match
				? { index, depth: match[1].length, raw: line, text: stripMarkdown(match[2]) }
				: null;
		})
		.filter(Boolean);

	const splitDepth = headingMatches.some((heading) => heading.depth === 2)
		? 2
		: headingMatches.some((heading) => heading.depth === 1)
			? 1
			: null;

	if (!splitDepth) {
		return {
			introMarkdown: safeTrim(markdown),
			sections: []
		};
	}

	const boundaryIndexes = headingMatches
		.filter((heading) => heading.depth === splitDepth)
		.map((heading) => heading.index);

	const introLines = lines.slice(0, boundaryIndexes[0]);
	const sections = boundaryIndexes.map((startIndex, index) => {
		const endIndex = boundaryIndexes[index + 1] ?? lines.length;
		const chunk = lines.slice(startIndex, endIndex).join('\n').trim();
		const heading = headingMatches.find((item) => item.index === startIndex);
		return {
			title: heading?.text || `Section ${index + 1}`,
			markdown: chunk
		};
	});

	return {
		introMarkdown: introLines.join('\n').trim(),
		sections
	};
}

function escapeHtmlAttribute(value) {
	return safeTrim(value)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function extractTableHeaderText(cellHtml) {
	const withLineBreaksSpaced = String(cellHtml || '').replace(/<br\s*\/?>/gi, ' ');
	const stripped = sanitizeHtml(withLineBreaksSpaced, {
		allowedTags: [],
		allowedAttributes: {}
	});
	return stripped
		.replace(/&#(\d+);/g, (_, dec) => {
			const code = Number(dec);
			return Number.isFinite(code) ? String.fromCodePoint(code) : '';
		})
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
			const code = Number.parseInt(hex, 16);
			return Number.isFinite(code) ? String.fromCodePoint(code) : '';
		})
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();
}

function replaceTopLevelTables(html, transformTable) {
	const tagPattern = /<\/?table\b[^>]*>/gi;
	let result = '';
	let cursor = 0;
	let depth = 0;
	let tableStart = -1;
	let openTagEnd = -1;
	let openAttrs = '';
	let match;

	while ((match = tagPattern.exec(html)) !== null) {
		const token = match[0];
		const isClosing = token.startsWith('</');
		if (!isClosing) {
			if (depth === 0) {
				result += html.slice(cursor, match.index);
				tableStart = match.index;
				openTagEnd = tagPattern.lastIndex;
				openAttrs = token.slice('<table'.length, -1);
			}
			depth += 1;
		} else if (depth > 0) {
			depth -= 1;
			if (depth === 0 && tableStart !== -1) {
				const innerHtml = html.slice(openTagEnd, match.index);
				result += transformTable(openAttrs, innerHtml);
				cursor = tagPattern.lastIndex;
				tableStart = -1;
				openTagEnd = -1;
				openAttrs = '';
			}
		}
	}

	if (depth > 0 && tableStart !== -1) {
		result += html.slice(tableStart);
	} else {
		result += html.slice(cursor);
	}

	return result;
}

function stampRowCells(rowHtml, headers) {
	let colIndex = 0;
	return rowHtml.replace(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (cellMatch, tag, attrs, inner) => {
		const label = headers[colIndex] || '';
		colIndex += 1;
		if (tag.toLowerCase() !== 'td' || !label) return cellMatch;
		return `<td${attrs} data-label="${escapeHtmlAttribute(label)}">${inner}</td>`;
	});
}

function stampStackableTables(html) {
	return replaceTopLevelTables(html, (openAttrs, innerHtml) => {
		const nestedTables = [];
		const maskedInner = replaceTopLevelTables(innerHtml, (childAttrs, childInner) => {
			const stampedChild = stampStackableTables(`<table${childAttrs}>${childInner}</table>`);
			const token = `__LEARN_NESTED_TABLE_${nestedTables.length}__`;
			nestedTables.push(stampedChild);
			return token;
		});

		let headers = [];
		let skipLeadingBodyRow = false;
		const theadMatch = maskedInner.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);

		if (theadMatch) {
			const firstHeaderRow = theadMatch[1].match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
			if (firstHeaderRow) {
				const cells = Array.from(firstHeaderRow[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi));
				if (cells.some((cell) => cell[1].toLowerCase() === 'th')) {
					headers = cells.map((cell) => extractTableHeaderText(cell[2]));
				}
			}
		} else {
			const firstRow = maskedInner.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
			if (firstRow) {
				const cells = Array.from(firstRow[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi));
				if (cells.length > 0 && cells.every((cell) => cell[1].toLowerCase() === 'th')) {
					headers = cells.map((cell) => extractTableHeaderText(cell[2]));
					skipLeadingBodyRow = true;
				}
			}
		}

		const restoreNested = (content) =>
			content.replace(/__LEARN_NESTED_TABLE_(\d+)__/g, (_, idx) => nestedTables[Number(idx)] ?? '');

		if (!headers.some(Boolean)) {
			return `<table${openAttrs}>${restoreNested(maskedInner)}</table>`;
		}

		let stampedBody;
		if (theadMatch) {
			let theadSkipped = false;
			stampedBody = maskedInner.replace(
				/<thead\b[^>]*>[\s\S]*?<\/thead>|<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi,
				(segment, trAttrs, trInner) => {
					if (!theadSkipped && /^<thead\b/i.test(segment)) {
						theadSkipped = true;
						return segment;
					}
					return `<tr${trAttrs}>${stampRowCells(trInner, headers)}</tr>`;
				}
			);
		} else {
			let rowIndex = 0;
			stampedBody = maskedInner.replace(
				/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi,
				(rowMatch, trAttrs, trInner) => {
					const currentRow = rowIndex;
					rowIndex += 1;
					if (skipLeadingBodyRow && currentRow === 0) return rowMatch;
					return `<tr${trAttrs}>${stampRowCells(trInner, headers)}</tr>`;
				}
			);
		}

		return `<table${openAttrs} data-stackable="true">${restoreNested(stampedBody)}</table>`;
	});
}

export async function renderLearnMarkdown(markdown, { headings = null } = {}) {
	const rawHtml = await marked.parse(markdown || '');
	const headingList = headings ?? extractMarkdownHeadings(markdown);
	let headingIndex = 0;
	const htmlWithIds = rawHtml.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (match, level, inner) => {
		const heading = headingList[headingIndex];
		headingIndex += 1;
		if (!heading) return match;
		return `<h${level} id="${heading.id}">${inner}</h${level}>`;
	});

	const headingAttributes = {
		h1: ['id'],
		h2: ['id'],
		h3: ['id'],
		h4: ['id'],
		h5: ['id'],
		h6: ['id']
	};

	const normalizedHtml = sanitizeHtml(htmlWithIds, {
		...sanitizeOptions,
		allowedAttributes: {
			a: sanitizeOptions.allowedAttributes.a,
			img: sanitizeOptions.allowedAttributes.img,
			...headingAttributes
		}
	});

	const stampedHtml = stampStackableTables(normalizedHtml);

	return sanitizeHtml(stampedHtml, {
		...sanitizeOptions,
		allowedAttributes: {
			...sanitizeOptions.allowedAttributes,
			...headingAttributes
		}
	});
}
