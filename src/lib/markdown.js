export function escapeHtml(value) {
	return (value || '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function renderInlineMarkdown(text) {
	const input = text || '';
	const len = input.length;
	let index = 0;
	let buffer = '';
	let output = '';

	const flushBuffer = () => {
		if (buffer) {
			output += escapeHtml(buffer);
			buffer = '';
		}
	};

	while (index < len) {
		if (input.startsWith('**', index)) {
			const end = input.indexOf('**', index + 2);
			if (end !== -1) {
				flushBuffer();
				output += `<strong>${renderInlineMarkdown(input.slice(index + 2, end))}</strong>`;
				index = end + 2;
				continue;
			}
		}

		if (input[index] === '*' && !input.startsWith('**', index)) {
			const end = input.indexOf('*', index + 1);
			if (end !== -1) {
				flushBuffer();
				output += `<em>${renderInlineMarkdown(input.slice(index + 1, end))}</em>`;
				index = end + 1;
				continue;
			}
		}

		if (input[index] === '`') {
			const end = input.indexOf('`', index + 1);
			if (end !== -1) {
				flushBuffer();
				output += `<code>${escapeHtml(input.slice(index + 1, end))}</code>`;
				index = end + 1;
				continue;
			}
		}

		if (input[index] === '[') {
			const closeBracket = input.indexOf(']', index + 1);
			const openParen = closeBracket !== -1 ? input.indexOf('(', closeBracket) : -1;
			const closeParen = openParen !== -1 ? input.indexOf(')', openParen) : -1;
			if (closeBracket !== -1 && openParen === closeBracket + 1 && closeParen !== -1) {
				const label = renderInlineMarkdown(input.slice(index + 1, closeBracket));
				const href = escapeHtml(input.slice(openParen + 1, closeParen).trim());
				flushBuffer();
				output += `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
				index = closeParen + 1;
				continue;
			}
		}

		buffer += input[index];
		index += 1;
	}

	flushBuffer();
	return output;
}

export function renderMarkdown(text) {
	const raw = (text || '').replace(/\r\n?/g, '\n');
	if (!raw.trim()) return '';
	const lines = raw.split('\n');
	const blocks = [];
	let currentList = null;

	const flushList = () => {
		if (!currentList) return;
		const items = currentList.items
			.map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
			.join('');
		blocks.push(`<${currentList.type}>${items}</${currentList.type}>`);
		currentList = null;
	};

	for (const originalLine of lines) {
		const line = originalLine.trim();
		if (!line) {
			flushList();
			continue;
		}

		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			flushList();
			const level = headingMatch[1].length;
			const content = renderInlineMarkdown(headingMatch[2]);
			blocks.push(`<h${level}>${content}</h${level}>`);
			continue;
		}

		const ordered = line.match(/^(\d+)\.\s+(.*)$/);
		if (ordered) {
			if (!currentList || currentList.type !== 'ol') {
				flushList();
				currentList = { type: 'ol', items: [] };
			}
			currentList.items.push(ordered[2]);
			continue;
		}

		const unordered = line.match(/^[-*+]\s+(.*)$/);
		if (unordered) {
			if (!currentList || currentList.type !== 'ul') {
				flushList();
				currentList = { type: 'ul', items: [] };
			}
			currentList.items.push(unordered[1]);
			continue;
		}

		flushList();
		blocks.push(`<p>${renderInlineMarkdown(line)}</p>`);
	}

	flushList();
	return blocks.join('');
}
