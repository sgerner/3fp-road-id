import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

const groupHeroCardPath = fileURLToPath(
	new URL('../components/groups/GroupHeroCard.svelte', import.meta.url)
);
const volunteerGroupPagePath = fileURLToPath(
	new URL('../../routes/volunteer/groups/[slug]/+page.svelte', import.meta.url)
);

test('GroupHeroCard compiles cleanly for client and server targets', async () => {
	const source = await readFile(groupHeroCardPath, 'utf8');
	const clientCompiled = compile(source, {
		filename: groupHeroCardPath,
		generate: 'client'
	});
	const serverCompiled = compile(source, {
		filename: groupHeroCardPath,
		generate: 'server'
	});

	assert.equal(clientCompiled.warnings.length, 0);
	assert.equal(serverCompiled.warnings.length, 0);
});

test('GroupHeroCard removes legacy overlay, rounded corners, orbs, gradients, and pulse CSS', async () => {
	const source = await readFile(groupHeroCardPath, 'utf8');

	assert.doesNotMatch(source, /aspect-\[16\/9\]/);
	assert.doesNotMatch(source, /aspect-\[21\/9\]/);
	assert.doesNotMatch(source, /\brounded-[^\s"']+/);
	assert.doesNotMatch(source, /app-orb/);
	assert.doesNotMatch(source, /cta-pulse/);
	assert.doesNotMatch(source, /logo-ring/);
	assert.doesNotMatch(source, /bg-gradient-/);
	assert.doesNotMatch(source, /drop-shadow/);
	assert.doesNotMatch(source, /<style[\s>]/);
});

test('GroupHeroCard uses the split Lane Lines hero grid, wrap-anywhere heading, and reduced-motion transitions', async () => {
	const source = await readFile(groupHeroCardPath, 'utf8');

	assert.match(source, /grid\s+grid-cols-1\s+lg:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(0,1fr\)\]/);
	assert.match(source, /bg-primary-500/);
	assert.match(source, /bg-surface-950/);
	assert.match(source, /bg-secondary-500/);
	assert.match(source, /bg-tertiary-500/);
	assert.match(source, />3FT</);
	assert.match(source, /<h1[\s\S]*?min-w-0[\s\S]*?wrap-anywhere[\s\S]*?>/);
	assert.match(source, /motion-safe:transition/);
});

test('GroupHeroCard preserves CTA branches, _self mail/phone links, and accessible mobile contact icons', async () => {
	const source = await readFile(groupHeroCardPath, 'utf8');

	for (const propName of ['group', 'canEdit', 'primaryCta', 'membershipCta', 'contactLinks']) {
		assert.match(source, new RegExp(`\\b${propName}\\b`));
	}

	assert.match(source, /\/groups\/\$\{group\?\.slug \?\? ''\}\/manage/);
	assert.match(source, /Manage Group/);
	assert.match(source, /primaryCta\.key !== 'custom'/);
	assert.match(
		source,
		/primaryCta\.key === 'email' \|\| primaryCta\.key === 'phone' \? '_self' : '_blank'/
	);
	assert.match(source, /membershipCta\.href/);
	assert.match(source, /membershipCta\.onClick/);
	assert.match(source, /aria-label=\{getContactLabel\(c\)\}/);
	assert.match(source, /\bmin-h-11\b/);
	assert.match(source, /\bmin-w-11\b/);
	assert.match(source, /c\.key === 'email' \|\| c\.key === 'phone' \? '_self' : '_blank'/);
});

test('volunteer group route renders GroupHeroCard in a full-bleed wrapper with contactLinks', async () => {
	const source = await readFile(volunteerGroupPagePath, 'utf8');

	assert.match(source, /class="-mx-4 -mt-4 mb-4"/);
	assert.doesNotMatch(source, /max-w-7xl/);
	assert.match(
		source,
		/<GroupHeroCard\s+\{group\}\s+canEdit=\{false\}\s+\{contactLinks\}\s+\{primaryCta\}\s*\/>/
	);
});
