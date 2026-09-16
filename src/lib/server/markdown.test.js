import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, renderInlineMarkdown } from '../markdown.js';

test('HTML escaping handles arbitrary display values safely', () => {
	assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
	assert.equal(escapeHtml(0), '0');
});

test('Markdown links only allow safe URL schemes', () => {
	const rendered = renderInlineMarkdown(
		'[script](javascript:alert(1)) [data](data:text/html,hello) [remote](//attacker.example/path)'
	);

	assert.doesNotMatch(rendered, /<a\b/i);
	assert.match(rendered, /script/);
	assert.match(rendered, /data/);
	assert.match(rendered, /remote/);
});

test('Markdown links preserve safe relative URLs and escape absolute URLs', () => {
	assert.equal(
		renderInlineMarkdown('[local](/groups/example) [external](https://example.com/a?x=1&y=2)'),
		'<a href="/groups/example" target="_blank" rel="noopener noreferrer">local</a> <a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">external</a>'
	);
});
