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
		img: ['src', 'alt', 'title']
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

	for (const line of safeTrim(markdown).split(/\r?\n/)) {
		const match = line.match(/^(#{1,6})\s+(.*)$/);
		if (!match) continue;
		const depth = match[1].length;
		const text = stripMarkdown(match[2]);
		if (!text) continue;
		const baseId = slugifyHeading(text) || `section-${headings.length + 1}`;
		const count = seen.get(baseId) ?? 0;
		seen.set(baseId, count + 1);
		headings.push({
			depth,
			text,
			id: count ? `${baseId}-${count + 1}` : baseId
		});
	}

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

	return sanitizeHtml(htmlWithIds, {
		...sanitizeOptions,
		allowedAttributes: {
			...sanitizeOptions.allowedAttributes,
			h1: ['id'],
			h2: ['id'],
			h3: ['id'],
			h4: ['id'],
			h5: ['id'],
			h6: ['id']
		}
	});
}
