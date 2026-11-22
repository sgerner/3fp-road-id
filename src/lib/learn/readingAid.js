function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

const GENERIC_PLACEHOLDER_PATTERNS = [
	/^open the article to read the full guide/i,
	/is a practical guide for organizers and community members\.?$/i
];

export function isGenericLearnPlaceholder(text) {
	const normalized = safeTrim(text);
	if (!normalized) return true;
	return GENERIC_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isBoilerplateLine(text) {
	const normalized = safeTrim(text);
	if (!normalized) return true;
	if (/\b(click here|click for a canva|canva template|easy to edit canva)\b/i.test(normalized)) {
		return true;
	}
	if (/^!\[[^\]]*\]\([^)]+\)$/.test(normalized)) return true;
	if (/\.(png|jpe?g|gif|webp|svg|pdf)\b/i.test(normalized) && normalized.length < 90) {
		return true;
	}
	return false;
}

export function stripMarkdown(text) {
	return safeTrim(text)
		.replace(/<[^>]+>/g, ' ')
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, ' ')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/(\*\*|__|\*|_|~~)/g, '')
		.replace(/^>\s?/gm, '')
		.replace(/^#+\s+/gm, '')
		.replace(/^\s*[-*+]\s+/gm, '')
		.replace(/^\s*\d+\.\s+/gm, '')
		.replace(/\r?\n+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function cleanMarkdownLines(markdown) {
	return safeTrim(markdown)
		.split(/\r?\n/)
		.filter((line) => !isBoilerplateLine(line))
		.join('\n');
}

function isUsefulSentence(text) {
	const normalized = stripMarkdown(text);
	if (!normalized || normalized.length < 30) return false;
	if (isBoilerplateLine(normalized)) return false;
	if (/\b(canva template)\b/i.test(normalized)) return false;
	return true;
}

function splitSentences(text) {
	return stripMarkdown(text)
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
}

function truncate(text, maxLength = 280) {
	const normalized = safeTrim(text);
	if (normalized.length <= maxLength) return normalized;
	const sliced = normalized.slice(0, maxLength - 1);
	const wordBoundary = sliced.lastIndexOf(' ');
	const compact =
		wordBoundary >= Math.floor(maxLength * 0.6) ? sliced.slice(0, wordBoundary) : sliced;
	return `${compact.trimEnd().replace(/[,:;·-]+$/, '')}…`;
}

function extractBullets(markdown) {
	return cleanMarkdownLines(markdown)
		.split(/\r?\n/)
		.map((line) => line.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/)?.[1] || null)
		.filter(Boolean)
		.map((item) => truncate(stripMarkdown(item), 140))
		.filter((item) => item && !isBoilerplateLine(item));
}

function extractParagraphs(markdown) {
	return cleanMarkdownLines(markdown)
		.split(/\r?\n\r?\n/)
		.map((block) => block.trim())
		.filter((block) => block && !/^#{1,6}\s+/.test(block))
		.map((block) => stripMarkdown(block))
		.filter((block) => isUsefulSentence(block));
}

function extractOpeningBodyText(markdown, maxLength = 260) {
	const lines = cleanMarkdownLines(markdown)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !/^#{1,6}\s+/.test(line) && !/^[-|:\s]+$/.test(line))
		.map((line) => stripMarkdown(line))
		.filter((line) => line && line.length >= 8 && !isBoilerplateLine(line));
	if (!lines.length) return '';
	return truncate(lines.slice(0, 4).join(' · '), maxLength);
}

export function estimateReadMinutes(markdown) {
	const words = stripMarkdown(markdown).split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(words / 220));
}

export function generateLearnReadingAid({ title = '', summary = '', markdown = '' }) {
	const cleanSummary = truncate(stripMarkdown(summary), 260);
	const paragraphs = extractParagraphs(markdown);
	const bullets = extractBullets(markdown);
	const paragraphSentences = paragraphs.flatMap((paragraph) => splitSentences(paragraph));
	const bulletPreview = bullets
		.filter((item) => item.length >= 10)
		.slice(0, 3)
		.join(' · ');
	const openingText = extractOpeningBodyText(markdown, 260);

	const readerSummary =
		(cleanSummary && cleanSummary.length >= 20 && !isGenericLearnPlaceholder(cleanSummary)
			? cleanSummary
			: '') ||
		truncate(
			paragraphSentences.filter(isUsefulSentence).slice(0, 2).join(' ') ||
				paragraphs[0] ||
				bulletPreview ||
				openingText ||
				`${safeTrim(title) || 'This guide'} covers practical cycling safety and community organizing guidance.`,
			260
		);

	let keyTakeaways = bullets.slice(0, 4);

	if (!keyTakeaways.length) {
		keyTakeaways = paragraphSentences
			.filter(isUsefulSentence)
			.slice(0, 4)
			.map((sentence) => truncate(sentence, 140));
	}

	if (!keyTakeaways.length && readerSummary) {
		keyTakeaways = [readerSummary];
	}

	return {
		readerSummary,
		keyTakeaways: Array.from(new Set(keyTakeaways)).slice(0, 4),
		estimatedReadMinutes: estimateReadMinutes(markdown)
	};
}

export function buildLearnCardExcerpt(article = {}, maxLength = 220) {
	const directExcerpt = stripMarkdown(article?.card_excerpt || '');
	if (directExcerpt && !isGenericLearnPlaceholder(directExcerpt)) {
		return truncate(directExcerpt, maxLength);
	}

	const summary = stripMarkdown(article?.summary || '');
	const readerSummary = stripMarkdown(article?.reader_summary || article?.readerSummary || '');
	const hasValidSummary = Boolean(summary && !isGenericLearnPlaceholder(summary));
	const hasValidReaderSummary = Boolean(readerSummary && !isGenericLearnPlaceholder(readerSummary));

	if (hasValidSummary && summary.length >= 28) {
		return truncate(summary, maxLength);
	}

	if (hasValidSummary && hasValidReaderSummary) {
		if (readerSummary.toLowerCase().startsWith(summary.toLowerCase())) {
			return truncate(readerSummary, maxLength);
		}
		const cleanLead = summary.replace(/[.!?]+$/, '');
		return truncate(`${cleanLead} — ${readerSummary}`, maxLength);
	}

	if (hasValidReaderSummary) {
		return truncate(readerSummary, maxLength);
	}

	const takeawaysRaw = Array.isArray(article?.key_takeaways)
		? article.key_takeaways
		: Array.isArray(article?.keyTakeaways)
			? article.keyTakeaways
			: [];
	const takeaways = takeawaysRaw
		.map((item) => stripMarkdown(item))
		.filter((item) => item && !isGenericLearnPlaceholder(item) && !isBoilerplateLine(item));
	if (takeaways.length) {
		return truncate(takeaways.slice(0, 3).join(' · '), maxLength);
	}

	const bodyMarkdown = safeTrim(article?.body_markdown || article?.bodyMarkdown || '');
	if (bodyMarkdown) {
		const generated = generateLearnReadingAid({
			title: article?.title || '',
			summary: '',
			markdown: bodyMarkdown
		});
		if (generated.readerSummary && !isGenericLearnPlaceholder(generated.readerSummary)) {
			return truncate(generated.readerSummary, maxLength);
		}
		const opening = extractOpeningBodyText(bodyMarkdown, maxLength);
		if (opening) return opening;
	}

	const categoryLabel = stripMarkdown(article?.category_name || article?.category_slug || 'Learn');
	const titleLabel = stripMarkdown(article?.title || 'community cycling');
	return truncate(`${categoryLabel} resource covering ${titleLabel}.`, maxLength);
}
