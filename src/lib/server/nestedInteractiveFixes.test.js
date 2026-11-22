import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'htmlparser2';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function loadCompiledServerComponent(relativePath) {
	const fullPath = path.join(repoRoot, relativePath);
	const source = fs.readFileSync(fullPath, 'utf8');
	const compiled = compile(source, {
		filename: fullPath,
		generate: 'server'
	});
	// Rewrite bare 'svelte/internal/server' import to an absolute file URL so data: module imports resolve cleanly.
	const svelteServerUrl = import.meta.resolve('svelte/internal/server');
	const code = compiled.js.code.replaceAll(
		"'svelte/internal/server'",
		JSON.stringify(svelteServerUrl)
	);
	const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
	const mod = await import(dataUrl);
	return mod.default;
}

function findElements(node, predicate, acc = []) {
	if (!node) return acc;
	if (node.type === 'tag' && predicate(node)) {
		acc.push(node);
	}
	if (Array.isArray(node.children)) {
		for (const child of node.children) {
			findElements(child, predicate, acc);
		}
	}
	return acc;
}

function getTextContent(node) {
	if (!node) return '';
	if (node.type === 'text') return node.data || '';
	if (Array.isArray(node.children)) {
		return node.children.map(getTextContent).join('');
	}
	return '';
}

test('AutoLinkText default mode renders Markdown links and bare URLs as <a> elements', async () => {
	const AutoLinkText = await loadCompiledServerComponent(
		'src/lib/components/ui/AutoLinkText.svelte'
	);

	const { body } = render(AutoLinkText, {
		props: {
			text: 'Read [TBAG Bylaws](/bylaws) or visit https://3fp.org/rides. Also see www.example.org!',
			className: 'summary-copy'
		}
	});

	const doc = parseDocument(body);
	const anchors = findElements(doc, (el) => el.name === 'a');
	assert.equal(anchors.length, 3);
	assert.deepEqual(
		anchors.map((a) => ({ href: a.attribs.href, text: getTextContent(a).trim() })),
		[
			{ href: '/bylaws', text: 'TBAG Bylaws' },
			{ href: 'https://3fp.org/rides', text: 'https://3fp.org/rides' },
			{ href: 'https://www.example.org', text: 'www.example.org' }
		]
	);
});

test('AutoLinkText plainText mode formats Markdown links and bare URLs as non-interactive spans without <a> tags', async () => {
	const AutoLinkText = await loadCompiledServerComponent(
		'src/lib/components/ui/AutoLinkText.svelte'
	);

	const { body } = render(AutoLinkText, {
		props: {
			text: 'Proposed [TBAG Bylaw Change](/bylaws) — details at https://3fp.org/tempe-bicycle-action-group/updates, or www.biketempe.org.',
			plainText: true,
			className: 'preview-copy'
		}
	});

	const doc = parseDocument(body);
	const anchors = findElements(doc, (el) => el.name === 'a');
	assert.equal(anchors.length, 0);

	const spans = findElements(doc, (el) => el.name === 'span');
	assert.ok(spans.length >= 4, 'renders outer wrapper span plus inner plain-text spans for links');
	assert.equal(
		getTextContent(doc).replace(/\s+/g, ' ').trim(),
		'Proposed TBAG Bylaw Change — details at https://3fp.org/tempe-bicycle-action-group/updates, or www.biketempe.org.'
	);
});

test('Asset link row with plainText AutoLinkText keeps a single intact <a> element', async () => {
	const AutoLinkText = await loadCompiledServerComponent(
		'src/lib/components/ui/AutoLinkText.svelte'
	);

	const descriptionHtml = render(AutoLinkText, {
		props: {
			text: 'Official [Tempe Bike Count](https://3fp.org/count) mirror at https://example.com/archive.',
			plainText: true,
			className: 'resource-subtext block line-clamp-2 text-sm'
		}
	}).body;

	const rowHtml = `<a href="https://3fp.org/resource" class="resource-row link-row"><div class="min-w-0 flex-1"><h3 class="resource-title">Bike Count</h3>${descriptionHtml}</div></a>`;
	const doc = parseDocument(rowHtml);
	const anchors = findElements(doc, (el) => el.name === 'a');
	assert.equal(anchors.length, 1);
	assert.equal(anchors[0].attribs.href, 'https://3fp.org/resource');
	assert.match(
		getTextContent(anchors[0]),
		/Official Tempe Bike Count mirror at https:\/\/example\.com\/archive\./
	);
});

test('Target route and volunteer management templates enforce isolated interactive controls', () => {
	const updatesSource = fs.readFileSync(
		path.join(repoRoot, 'src/routes/[siteSlug]/updates/+page.svelte'),
		'utf8'
	);
	assert.match(updatesSource, /<AutoLinkText[\s\S]*?text=\{post\.preview_text\}[\s\S]*?plainText/);
	assert.match(updatesSource, /\{@html detail\.bodyHtml\}/);

	const assetsSource = fs.readFileSync(
		path.join(repoRoot, 'src/routes/[siteSlug]/assets/+page.svelte'),
		'utf8'
	);
	assert.match(assetsSource, /<AutoLinkText[\s\S]*?text=\{asset\.description\}[\s\S]*?plainText/);

	const rideSource = fs.readFileSync(
		path.join(repoRoot, 'src/routes/ride/[slug]/+page.svelte'),
		'utf8'
	);
	assert.match(
		rideSource,
		/renderLinkifiedText\(\s*selectedOccurrence\?\.start_location_name \|\| activity\?\.start_location_name\s*\)/
	);
	assert.match(
		rideSource,
		/formatPlainLocationText\(\s*occurrence\.start_location_name \|\| activity\?\.start_location_name\s*\)/
	);
	// Occurrence <button> block must not inject renderLinkifiedText HTML
	const occurrencesSection = rideSource.slice(rideSource.indexOf('id="occurrences-heading"'));
	assert.doesNotMatch(occurrencesSection, /renderLinkifiedText/);

	const signupSource = fs.readFileSync(
		path.join(repoRoot, 'src/lib/components/volunteer/manage/SignupManagement.svelte'),
		'utf8'
	);
	assert.doesNotMatch(signupSource, /role="button"/);
	assert.doesNotMatch(signupSource, /<svelte:window\s+onclick=\{closeMenus\}/);
	assert.doesNotMatch(signupSource, /stopPropagation/);
	assert.match(signupSource, /aria-expanded=\{isExpanded\}/);
	assert.match(signupSource, /aria-label=\{detailsAriaLabel\}/);
	assert.match(signupSource, /min-h-\[44px\]\s+min-w-\[44px\]/);
});
