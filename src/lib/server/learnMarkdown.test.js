import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
	extractMarkdownHeadings,
	parseMarkdownDocument,
	renderLearnMarkdown
} from '../learn/markdown.js';

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
		'## Hello\n\n<script>alert(1)</script>\n\n<button type="button">Injected</button>\n\n[Bad](javascript:alert)\n\n[Good](https://example.com)\n\n<img src="x" onerror="alert(1)">'
	);
	assert.ok(html.includes('id="hello"'));
	assert.ok(html.includes('href="https://example.com"'));
	assert.ok(!html.includes('<script'));
	assert.ok(!html.includes('<button'));
	assert.ok(!html.includes('javascript:'));
	assert.ok(!html.includes('onerror'));
});

test('markdown tables receive data-stackable and plain-text data-label attributes from headers', async () => {
	const markdown = [
		'| **Organization Type** | *Role* & "Scope" | `Contact` [Guide](https://example.com) |',
		'| :--- | :---: | ---: |',
		'| Neighborhood Assoc. | Safety & speeds | `info@example.com` |',
		'| Senior Center | | `555.555.5555` |'
	].join('\n');

	const html = await renderLearnMarkdown(markdown);
	assert.ok(html.includes('<table data-stackable="true">'));
	assert.ok(html.includes('<td data-label="Organization Type">Neighborhood Assoc.</td>'));
	assert.ok(
		html.includes('<td data-label="Role &amp; &quot;Scope&quot;">Safety &amp; speeds</td>')
	);
	assert.ok(html.includes('<td data-label="Contact Guide"><code>info@example.com</code></td>'));
	assert.ok(html.includes('<td data-label="Role &amp; &quot;Scope&quot;"></td>'));
});

test('headerless tables omit data-stackable and strip untrusted table attributes', async () => {
	const rawHeaderless = await renderLearnMarkdown(
		'<table data-stackable="true"><tbody><tr><td data-label="Fake">Alpha</td><td>Beta</td></tr></tbody></table>'
	);
	assert.ok(rawHeaderless.includes('<table>'));
	assert.ok(!rawHeaderless.includes('data-stackable'));
	assert.ok(!rawHeaderless.includes('data-label'));

	const emptyHeaderGfm = await renderLearnMarkdown('|   |   |\n| --- | --- |\n| Alpha | Beta |');
	assert.ok(emptyHeaderGfm.includes('<table>'));
	assert.ok(!emptyHeaderGfm.includes('data-stackable'));
	assert.ok(!emptyHeaderGfm.includes('data-label'));
});

test('tables nested inside list items preserve list structure and receive data-label attributes', async () => {
	const markdown = [
		'1. **Summary Table of Document Relevance Scores:**',
		'',
		'   | Document Type | Overall Relevance Score (Average) | Summary of Relevance (Brief) |',
		'   | :--- | :--- | :--- |',
		'   | General/Comprehensive Plan | [Average Score] | [Brief Summary] |'
	].join('\n');

	const html = await renderLearnMarkdown(markdown);
	assert.match(html, /<ol>\s*<li>[\s\S]*<table data-stackable="true">/);
	assert.ok(html.includes('<td data-label="Document Type">General/Comprehensive Plan</td>'));
	assert.ok(
		html.includes('<td data-label="Overall Relevance Score (Average)">[Average Score]</td>')
	);
	assert.ok(html.includes('<td data-label="Summary of Relevance (Brief)">[Brief Summary]</td>'));
});

test('real Learn guide tables and templates stamp stackable cells and preserve template blocks', async () => {
	const policyAuditDoc = parseMarkdownDocument(
		await readFile(
			new URL('../../../docs/3ftwiki/policies/complete-streets/policy-audit.md', import.meta.url),
			'utf8'
		)
	);
	const policyAuditHtml = await renderLearnMarkdown(policyAuditDoc.body);
	assert.ok(policyAuditHtml.includes('<table data-stackable="true">'));
	assert.ok(policyAuditHtml.includes('<td data-label="Relevant Document Names (Example)">'));

	const partnershipsDoc = parseMarkdownDocument(
		await readFile(
			new URL('../../../docs/3ftwiki/outreach/partnerships.md', import.meta.url),
			'utf8'
		)
	);
	const partnershipsHtml = await renderLearnMarkdown(partnershipsDoc.body);
	assert.ok(partnershipsHtml.includes('data-label="Organization Type"'));
	assert.ok(partnershipsHtml.includes('data-label="Best Collaboration Strategies"'));
	assert.ok(!partnershipsHtml.includes('data-label="<strong>'));

	const advocacyMeetingDoc = parseMarkdownDocument(
		await readFile(
			new URL('../../../docs/3ftwiki/community/advocacy-meeting.md', import.meta.url),
			'utf8'
		)
	);
	const advocacyMeetingHtml = await renderLearnMarkdown(advocacyMeetingDoc.body);
	assert.ok(
		advocacyMeetingHtml.includes(
			'<td data-label="I can help with: (circle) Testimony / Data Collection / Outreach / Other"></td>'
		)
	);

	const tragedyGuideDoc = parseMarkdownDocument(
		await readFile(
			new URL('../../../docs/3ftwiki/policies/tragedy-action-guide.md', import.meta.url),
			'utf8'
		)
	);
	const tragedyGuideHtml = await renderLearnMarkdown(tragedyGuideDoc.body);
	assert.ok(tragedyGuideHtml.includes('<pre><code>Subject: Urgent Safety Improvements Needed'));
});
