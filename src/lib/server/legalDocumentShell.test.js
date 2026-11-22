import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRawSnippet } from 'svelte';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith('.svelte')) {
			const filename = fileURLToPath(url);
			const source = fs.readFileSync(filename, 'utf8');
			const compiled = compile(source, { generate: 'server', filename });
			return { format: 'module', shortCircuit: true, source: compiled.js.code };
		}
		return nextLoad(url, context);
	}
});

const { default: LegalDocumentShell } =
	await import('#lib/components/legal/LegalDocumentShell.svelte');
const { default: PrivacyPage } = await import('../../routes/privacy/+page.svelte');
const { default: TermsPage } = await import('../../routes/terms/+page.svelte');
const { default: DataDeletionPage } = await import('../../routes/data-deletion/+page.svelte');

function parseNavAnchors(body) {
	const navMatch = body.match(/<nav\b[^>]*aria-label="Legal documents"[^>]*>([\s\S]*?)<\/nav>/);
	assert.ok(navMatch, 'expected <nav aria-label="Legal documents">');
	return [...navMatch[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, text]) => ({
		attrs,
		href: attrs.match(/\bhref="([^"]+)"/)?.[1] ?? '',
		ariaCurrent: attrs.match(/\baria-current="([^"]*)"/)?.[1] ?? null,
		hasAriaCurrentAttr: /\baria-current\b/.test(attrs),
		text: text.replace(/<!--[\s\S]*?-->/g, '').trim()
	}));
}

test('LegalDocumentShell renders head metadata, landmarks, default heading size, children, and aria-hidden rulers', () => {
	const children = createRawSnippet(() => ({
		render: () => '<div data-clause="01">Sample Clause Row</div>'
	}));

	const { head, body } = render(LegalDocumentShell, {
		props: {
			metaTitle: 'Sample Policy | 3 Feet Please',
			metaDescription: 'Sample description for policy testing.',
			headingId: 'sample-policy-heading',
			titlePrefix: 'Sample',
			titleAccent: 'Policy',
			lead: 'Sample lead paragraph explaining the policy.',
			lastUpdated: 'October 1, 2026',
			currentPath: '/privacy',
			children
		}
	});

	assert.match(head, /<title>Sample Policy \| 3 Feet Please<\/title>/);
	assert.match(
		head,
		/<meta\s+name="description"\s+content="Sample description for policy testing\."\s*\/?>/
	);

	assert.match(body, /<header\b[^>]*aria-labelledby="sample-policy-heading"/);
	assert.match(
		body,
		/<h1\b[^>]*id="sample-policy-heading"[^>]*class="[^"]*text-\[clamp\(2\.9rem,6\.8vw,6rem\)\][^"]*"[^>]*>[\s\S]*?Sample\s*<span class="text-secondary-500">Policy<\/span>[\s\S]*?<\/h1>/
	);
	assert.match(body, /Sample lead paragraph explaining the policy\./);
	assert.match(body, /Last updated:\s*October 1, 2026/);
	assert.match(body, /<div data-clause="01">Sample Clause Row<\/div>/);

	const anchors = parseNavAnchors(body);
	assert.deepEqual(
		anchors.map((a) => ({
			href: a.href,
			text: a.text,
			ariaCurrent: a.ariaCurrent,
			hasAriaCurrentAttr: a.hasAriaCurrentAttr
		})),
		[
			{
				href: '/privacy',
				text: 'Privacy Policy',
				ariaCurrent: 'page',
				hasAriaCurrentAttr: true
			},
			{
				href: '/terms',
				text: 'Terms of Service',
				ariaCurrent: null,
				hasAriaCurrentAttr: false
			},
			{
				href: '/data-deletion',
				text: 'Data Deletion',
				ariaCurrent: null,
				hasAriaCurrentAttr: false
			}
		]
	);

	// Vertical 3FT hero stripe and horizontal 0 -> 3 ft ruler band are both aria-hidden="true".
	assert.match(body, /<div\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?>3FT<[\s\S]*?>0<[\s\S]*?<\/div>/);
	assert.match(
		body,
		/<div\b[^>]*class="[^"]*grid-cols-3[^"]*"[^>]*aria-hidden="true"[^>]*>[\s\S]*?>0<[\s\S]*?>1 ft<[\s\S]*?>2 ft<[\s\S]*?>3 ft<[\s\S]*?<\/div>/
	);
});

test('LegalDocumentShell supports headingSizeClass override and active aria-current switching', () => {
	const { body } = render(LegalDocumentShell, {
		props: {
			metaTitle: 'Data Deletion Instructions | 3 Feet Please',
			metaDescription: 'Deletion instructions.',
			headingId: 'data-deletion-heading',
			titlePrefix: 'Data Deletion',
			titleAccent: 'Instructions',
			lead: 'Deletion lead.',
			lastUpdated: 'March 14, 2026',
			currentPath: '/data-deletion',
			headingSizeClass: 'text-[clamp(2.6rem,6.4vw,5.75rem)]'
		}
	});

	assert.match(
		body,
		/<h1\b[^>]*id="data-deletion-heading"[^>]*class="[^"]*text-\[clamp\(2\.6rem,6\.4vw,5\.75rem\)\][^"]*"/
	);
	assert.doesNotMatch(body, /text-\[clamp\(2\.9rem,6\.8vw,6rem\)\]/);
	assert.doesNotMatch(body, /aria-current="false"/);

	const anchors = parseNavAnchors(body);
	assert.deepEqual(
		anchors.map((a) => [a.href, a.ariaCurrent, a.hasAriaCurrentAttr]),
		[
			['/privacy', null, false],
			['/terms', null, false],
			['/data-deletion', 'page', true]
		]
	);
});

test('policy routes (/privacy, /terms, /data-deletion) preserve metadata, headings, active nav, and clause content', () => {
	const privacy = render(PrivacyPage);
	assert.match(privacy.head, /<title>Privacy Policy \| 3 Feet Please<\/title>/);
	assert.match(
		privacy.head,
		/content="Privacy Policy for 3 Feet Please, including account, social, and optional SMS data handling\."/
	);
	assert.match(privacy.body, /aria-labelledby="privacy-heading"/);
	assert.match(privacy.body, /text-\[clamp\(2\.9rem,6\.8vw,6rem\)\]/);
	assert.match(privacy.body, /Information We Collect/);
	assert.equal(
		parseNavAnchors(privacy.body).find((a) => a.ariaCurrent === 'page')?.href,
		'/privacy'
	);

	const terms = render(TermsPage);
	assert.match(terms.head, /<title>Terms of Service \| 3 Feet Please<\/title>/);
	assert.match(terms.head, /content="Terms of Service for using 3fp\.org\."/);
	assert.match(terms.body, /aria-labelledby="terms-heading"/);
	assert.match(terms.body, /text-\[clamp\(2\.9rem,6\.8vw,6rem\)\]/);
	assert.match(terms.body, /Acceptance of Terms/);
	assert.equal(parseNavAnchors(terms.body).find((a) => a.ariaCurrent === 'page')?.href, '/terms');

	const deletion = render(DataDeletionPage);
	assert.match(deletion.head, /<title>Data Deletion Instructions \| 3 Feet Please<\/title>/);
	assert.match(
		deletion.head,
		/content="Instructions for requesting deletion of your 3 Feet Please account and connected social data\."/
	);
	assert.match(deletion.body, /aria-labelledby="data-deletion-heading"/);
	assert.match(deletion.body, /text-\[clamp\(2\.6rem,6\.4vw,5\.75rem\)\]/);
	assert.match(deletion.body, /Option 1: Disconnect Connected Social Accounts/);
	assert.equal(
		parseNavAnchors(deletion.body).find((a) => a.ariaCurrent === 'page')?.href,
		'/data-deletion'
	);
});
