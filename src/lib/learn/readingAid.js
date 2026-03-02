function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function stripMarkdown(text) {
	return safeTrim(text)
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
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

function isUsefulSentence(text) {
	const normalized = stripMarkdown(text);
	if (!normalized || normalized.length < 35) return false;
	if (/\b(click here|canva template|template)\b/i.test(normalized)) return false;
	if (/\.(png|jpe?g|gif|webp|svg|pdf)\b/i.test(normalized)) return false;
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
	return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function extractBullets(markdown) {
	return safeTrim(markdown)
		.split(/\r?\n/)
		.map((line) => line.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/)?.[1] || null)
		.filter(Boolean)
		.map((item) => truncate(stripMarkdown(item), 140));
}

function extractParagraphs(markdown) {
	return safeTrim(markdown)
		.split(/\r?\n\r?\n/)
		.map((block) => stripMarkdown(block))
		.filter((block) => block && !block.startsWith('#'))
		.filter((block) => isUsefulSentence(block));
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

	const readerSummary =
		(cleanSummary && cleanSummary.length >= 40 ? cleanSummary : '') ||
		truncate(
			paragraphSentences.filter(isUsefulSentence).slice(0, 2).join(' ') ||
				paragraphs[0] ||
				`${safeTrim(title)} is a practical guide for organizers and community members.`,
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
