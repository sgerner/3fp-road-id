import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run after npm run build. Isolate the server chunks from node_modules so
// local dependencies cannot hide missing packages in a Vercel deployment.
const isolated = await mkdtemp(join(tmpdir(), '3fp-sanitizer-'));
try {
	await writeFile(join(isolated, 'package.json'), '{"type":"module"}');
	await cp('.svelte-kit/output/server/chunks', join(isolated, 'chunks'), { recursive: true });
	// Shared runtime helpers also import Kit's environment config. Allow only
	// that framework package; sanitizer dependencies must all be bundled.
	await mkdir(join(isolated, 'node_modules/@sveltejs'), { recursive: true });
	await symlink(
		resolve('node_modules/@sveltejs/kit'),
		join(isolated, 'node_modules/@sveltejs/kit')
	);
	const bundled = await import(pathToFileURL(join(isolated, 'chunks/sanitize-html.js')).href);
	// Rolldown shortens export names; this chunk exports the CommonJS initializer.
	const [loadSanitizer] = Object.values(bundled);
	const sanitizeHtml = loadSanitizer();
	assert.equal(
		sanitizeHtml('<h2>Safe</h2><script>alert(1)</script><a href="javascript:alert(2)">Link</a>'),
		'<h2>Safe</h2><a>Link</a>'
	);
	assert.equal(
		sanitizeHtml('<p style="color:red">Safe</p>', {
			allowedAttributes: { p: ['style'] },
			allowedStyles: { p: { color: [/^red$/] } }
		}),
		'<p style="color:red">Safe</p>'
	);
	console.log('Built server sanitizer works without node_modules or require(ESM).');
} finally {
	await rm(isolated, { recursive: true, force: true });
}
