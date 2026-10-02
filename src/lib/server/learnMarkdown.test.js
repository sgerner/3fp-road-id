import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMarkdownHeadings, renderLearnMarkdown } from '../learn/markdown.js';

test('article outline matches rendered headings including setext and duplicate headings', async () => {
	const markdown =
		'Overview\n========\n\n## Steps\n\n```md\n## Not a section\n```\n\n## Steps\n\n> ### Within a quote';
	const headings = extractMarkdownHeadings(markdown);
	assert.deepEqual(
		headings.map(({ id }) => id),
		['overview', 'steps', 'steps-2', 'within-a-quote']
	);
	const html = await renderLearnMarkdown(markdown);
	for (const heading of headings) assert.ok(html.includes(`id="${heading.id}"`));
	assert.ok(!html.includes('id="not-a-section"'));
});

test('article rendering removes executable HTML while retaining outline and safe links', async () => {
	const html = await renderLearnMarkdown(
		'## Hello\n\n<script>alert(1)</script>\n\n[Bad](javascript:alert)\n\n[Good](https://example.com)\n\n<img src="x" onerror="alert(1)">'
	);
	assert.ok(html.includes('id="hello"'));
	assert.ok(html.includes('href="https://example.com"'));
	assert.ok(!html.includes('<script'));
	assert.ok(!html.includes('javascript:'));
	assert.ok(!html.includes('onerror'));
});
