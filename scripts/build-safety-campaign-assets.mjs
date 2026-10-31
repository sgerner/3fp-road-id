import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

// Published artifacts are exported once; normal website builds use the checked-in assets.
const release =
	process.env.CAMPAIGN_SOURCE_DIR || path.join(os.homedir(), 'Downloads/3fp/_release-v9');
const campaignRoot = process.env.CAMPAIGN_ASSET_SOURCE_DIR || path.dirname(release);
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const validation = read(
	path.join(
		release,
		fs.existsSync(path.join(release, 'validation.json')) ? 'validation.json' : 'qa/validation.json'
	)
);
const templatesPath = 'src/lib/content/safetyReportTemplates.json';
const templates = fs.existsSync(templatesPath) ? read(templatesPath) : {};
const reportPath = 'src/lib/content/safetyReport.json';
const report = read(reportPath);
const base = '/reports/safer-cycling-better-messages/downloads';
const outputDir = `static${base}`;
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
const resolve = (original, record, folder, filename) => {
	if (original && fs.existsSync(original)) return original;
	if (original && fs.existsSync(path.resolve(release, original)))
		return path.resolve(release, original);
	for (const campaign of record.campaigns) {
		const candidate = path.join(campaignRoot, campaign, 'edition-v9', folder, filename);
		if (fs.existsSync(candidate)) return candidate;
	}
	throw new Error(
		`Missing v9 campaign artifact: ${record.campaigns.join(', ')} / ${folder}/${filename}`
	);
};
let exports = 0;
for (const record of validation.records) {
	const master = path.basename(record.master);
	const assetId = path.basename(master, '.pptx');
	const template = Object.values(templates).find((item) => item.file === master);
	const pdf =
		record.kind === 'social'
			? null
			: resolve(record.file, record, 'print', path.basename(record.file));
	const editable = resolve(record.master, record, 'editable', master);
	const pdfName = `${assetId}.pdf`;
	if (pdf) fs.copyFileSync(pdf, `${outputDir}/${pdfName}`);
	fs.copyFileSync(editable, `${outputDir}/${master}`);
	const templateUrl = template?.url || null;
	if (templateUrl && !/^https:\/\/(canva\.link|www\.canva\.com)\//.test(templateUrl))
		throw new Error(`Invalid template URL: ${master}`);
	for (const item of report.campaignGallery.filter((i) => i.id.startsWith(`${assetId}-page-`))) {
		Object.assign(item, {
			assetId,
			pdfUrl: pdf ? `${base}/${pdfName}` : null,
			pdfBytes: pdf ? fs.statSync(pdf).size : null,
			editableUrl: `${base}/${master}`,
			editableBytes: fs.statSync(editable).size,
			canvaTemplateUrl: templateUrl,
			dimensions: record.pages[0].trim_inches || null
		});
		if (record.kind === 'social') {
			const page = record.pages.find((p) => p.page === item.page);
			const name = `${item.id}.png`;
			const proof = resolve(
				page.proof,
				record,
				'proofs',
				`${assetId}/page-${String(page.page).padStart(2, '0')}.png`
			);
			const result = await sharp(proof)
				.resize({ width: 1080 })
				.png()
				.toFile(`static${base}/${name}`);
			Object.assign(item, {
				pngUrl: `${base}/${name}`,
				pngBytes: result.size,
				pixelWidth: result.width,
				pixelHeight: result.height
			});
		}
	}
	exports++;
}
report.meta.campaignAssetCount = exports;
report.meta.campaignTemplateCount = Object.keys(templates).length;
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
	`Exported ${exports} PDF and editable campaign sets; ${Object.keys(templates).length} verified Canva templates.`
);
