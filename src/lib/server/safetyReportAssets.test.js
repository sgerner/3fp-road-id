import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const report = JSON.parse(
	fs.readFileSync(new URL('../content/safetyReport.json', import.meta.url))
);
const templates = JSON.parse(
	fs.readFileSync(new URL('../content/safetyReportTemplates.json', import.meta.url))
);
const staticRoot = new URL('../../../static/', import.meta.url);

test('every campaign proof offers a public copy-safe template and complete downloadable set', () => {
	assert.equal(Object.keys(templates).length, report.meta.campaignAssetCount);
	for (const item of report.campaignGallery) {
		assert.equal(item.canvaUrl, undefined, 'Do not expose editable organization masters');
		assert.ok(
			Object.values(templates).some(
				(template) =>
					template.url === item.canvaTemplateUrl && template.file === `${item.assetId}.pptx`
			),
			item.id
		);
		const template = new URL(item.canvaTemplateUrl);
		assert.equal(template.protocol, 'https:');
		assert.equal(template.hostname, 'canva.link');
		for (const key of [...(item.kind === 'social' ? ['pngUrl'] : ['pdfUrl']), 'editableUrl']) {
			const url = item[key];
			assert.ok(url.startsWith('/reports/safer-cycling-better-messages/downloads/'), item.id);
			assert.ok(!url.includes('..'));
			const stat = fs.statSync(new URL(url.slice(1), staticRoot));
			assert.ok(stat.size > 0, url);
		}
	}
});

test('all pages of a design share the same downloadable files and template', () => {
	const sets = new Map();
	for (const item of report.campaignGallery) {
		const signature = JSON.stringify([
			item.pdfUrl,
			item.editableUrl,
			item.canvaTemplateUrl,
			item.pageCount
		]);
		if (sets.has(item.assetId)) assert.equal(sets.get(item.assetId), signature, item.assetId);
		else sets.set(item.assetId, signature);
	}
	assert.equal(sets.size, report.meta.campaignAssetCount);
});
