const { chromium } = await import('playwright');
import fs from 'node:fs';
import path from 'node:path';

const preset = process.argv[2];
const sitePath = process.argv[3] || '/site/3-feet-please';

if (!preset) {
	console.error('Usage: node scripts/capture-microsite-screenshots.mjs <preset> [sitePath]');
	process.exit(1);
}

const outDir = path.resolve('artifacts/microsite-presets');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
	for (const mode of ['light', 'dark']) {
		const context = await browser.newContext({ viewport: { width: 1728, height: 1117 } });
		await context.addInitScript((value) => {
			localStorage.setItem('3fp-microsite-color-mode', value);
		}, mode);
		const page = await context.newPage();
		await page.goto(`http://127.0.0.1:4173${sitePath}`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(1200);
		const outPath = path.join(outDir, `site-3-feet-please-layout-${preset}-${mode}.png`);
		await page.screenshot({ path: outPath, fullPage: true });
		await context.close();
	}
} finally {
	await browser.close();
}
