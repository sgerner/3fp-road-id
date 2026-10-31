import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseDocument, DomUtils } from 'htmlparser2';
const { findAll, getText, getOuterHTML } = DomUtils;
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';

// Run from the repository root. Source files are the published report and v9 QA exports.
const deliverables = path.join(os.homedir(), 'Downloads/3fp');
const report =
	process.env.SAFETY_REPORT_SOURCE_DIR || path.join(deliverables, 'public-research-review');
const release = process.env.CAMPAIGN_SOURCE_DIR || path.join(deliverables, '_release-v9');
const campaignRoot = process.env.CAMPAIGN_ASSET_SOURCE_DIR || deliverables;
const output = 'static/reports/safer-cycling-better-messages';
const base = '/reports/safer-cycling-better-messages';
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const clean = (text) => text.replace(/\s+/g, ' ').trim();
const descendants = (node, name) => findAll((el) => el.name === name, node.children || []);
const titleCase = (s) =>
	s
		.replace(/^\d+-/, '')
		.replaceAll('-', ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
const campaignAsset = (campaigns, folder, filename) => {
	for (const campaign of campaigns) {
		const candidate = path.join(campaignRoot, campaign, 'edition-v9', folder, filename);
		if (fs.existsSync(candidate)) return candidate;
	}
	throw new Error(`Missing v9 campaign asset: ${campaigns.join(', ')} / ${folder}/${filename}`);
};
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(`${output}/figures`, { recursive: true });
fs.mkdirSync(`${output}/campaigns`, { recursive: true });
fs.mkdirSync(`${output}/artwork`, { recursive: true });
for (const file of [
	'safer-cycling-better-messages-public-review.pdf',
	'safer-cycling-campaigns-quick-guide.pdf'
])
	fs.copyFileSync(path.join(report, file), `${output}/${file}`);
fs.copyFileSync(`${report}/evidence-matrix.csv`, `${output}/evidence-matrix.csv`);
for (const file of fs.readdirSync(`${report}/print-artwork`).filter((f) => f.endsWith('.svg')))
	fs.copyFileSync(`${report}/print-artwork/${file}`, `${output}/artwork/${file}`);

const document = parseDocument(fs.readFileSync(`${report}/report.html`, 'utf8'));
const main = findAll((el) => el.name === 'main', document.children)[0];
const nodes = main.children.filter((n) => n.type === 'tag');
const sections = [];
let current;
for (const node of nodes) {
	if (
		node.name === 'h2' &&
		/^(executive-findings|chapter-\d+|references)$/.test(node.attribs.id || '')
	) {
		current = { id: node.attribs.id, title: clean(getText(node)), nodes: [] };
		sections.push(current);
	}
	if (current) current.nodes.push(node);
}
// Preserve the opening infrastructure notice alongside the executive findings.
sections[0].nodes.unshift(nodes.find((n) => n.attribs?.class === 'notice'));
const figures = [];
for (const section of sections) {
	for (const fig of section.nodes.flatMap((n) =>
		n.name === 'figure' ? [n] : descendants(n, 'figure')
	)) {
		const img = descendants(fig, 'img')[0];
		const caption = clean(getText(descendants(fig, 'figcaption')[0]));
		const id = fig.attribs.id;
		const name = path.basename(img.attribs.src, '.svg');
		const src = `${base}/figures/${name}.webp`;
		await sharp(`${report}/${img.attribs.src}`, { density: 160 })
			.resize({ width: 1600, withoutEnlargement: true })
			.webp({ quality: 85 })
			.toFile(`${output}/figures/${name}.webp`);
		img.attribs.src = src;
		const kind = id.startsWith('fig-') ? 'figure' : 'print';
		const item = {
			id,
			number: Number(id.split('-')[1]),
			kind,
			title: caption.replace(/^(Figure|Print example) \d+\.\s*/, '').split(/(?<=\.)\s/)[0],
			caption,
			alt: img.attribs.alt,
			src,
			chapterId: section.id,
			topic: section.title.replace(/^\d+\.\s*/, '')
		};
		const original = `${report}/print-artwork/${name}.svg`;
		if (fs.existsSync(original)) item.downloadUrl = `${base}/artwork/${name}.svg`;
		figures.push(item);
	}
}
const allowedTags = [
	'h2',
	'h3',
	'h4',
	'p',
	'div',
	'strong',
	'em',
	'ul',
	'ol',
	'li',
	'a',
	'figure',
	'figcaption',
	'img',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td',
	'br',
	'span',
	'small'
];
const sanitize = (html) =>
	sanitizeHtml(html, {
		allowedTags,
		allowedAttributes: {
			'*': ['id', 'class'],
			a: ['href'],
			img: ['src', 'alt'],
			th: ['scope'],
			td: ['colspan', 'rowspan']
		},
		allowedSchemes: ['http', 'https', 'mailto'],
		allowProtocolRelative: false,
		transformTags: {
			a: (tag, attrs) => ({
				tagName: tag,
				attribs: {
					...attrs,
					href: attrs.href === 'evidence-matrix.csv' ? `${base}/evidence-matrix.csv` : attrs.href
				}
			})
		}
	});
const resultSections = sections.map((section) => {
	const html = sanitize(section.nodes.map(getOuterHTML).join(''));
	const plainText = clean(parseDocument(html).children.map(getText).join(' '));
	const takeaways = section.nodes.flatMap((n) =>
		n.attribs?.class === 'lead' ? descendants(n, 'li').map((li) => clean(getText(li))) : []
	);
	const sourceIds = [...new Set([...html.matchAll(/#ref-(R\d+)/g)].map((m) => m[1]))];
	const figureIds = figures.filter((f) => f.chapterId === section.id).map((f) => f.id);
	return {
		id: section.id,
		title: section.title,
		number: section.id.startsWith('chapter-') ? Number(section.id.split('-')[1]) : null,
		html,
		plainText,
		takeaways,
		sourceIds,
		figureIds
	};
});
const sources = JSON.parse(
	execFileSync(
		'python3',
		[
			'-c',
			'import csv,json,sys; print(json.dumps(list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))))',
			`${report}/evidence-matrix.csv`
		],
		{ encoding: 'utf8' }
	)
).map((row) => ({ ...row, id: row.record }));
const validation = readJson(
	fs.existsSync(`${release}/qa/validation.json`)
		? `${release}/qa/validation.json`
		: `${release}/validation.json`
);
const campaignGallery = [];
for (const record of validation.records) {
	const campaigns = record.campaigns;
	const campaign = campaigns.join(', ');
	const label = record.campaigns
		.map((name) =>
			name === '03-a-person-on-a-bike' ? 'Family, Friends & Everyday Rides' : titleCase(name)
		)
		.join(', ');
	for (const page of record.pages) {
		const id = `${path.basename(record.master, '.pptx')}-page-${String(page.page).padStart(2, '0')}`;
		const proof = campaignAsset(
			record.campaigns,
			'proofs',
			`${path.basename(record.master, '.pptx')}/page-${String(page.page).padStart(2, '0')}.png`
		);
		await sharp(proof)
			.resize({ width: 1200, withoutEnlargement: true })
			.webp({ quality: 82 })
			.toFile(`${output}/campaigns/${id}.webp`);
		campaignGallery.push({
			id,
			title: `${label} — ${titleCase(record.kind)} (page ${page.page})`,
			src: `${base}/campaigns/${id}.webp`,
			alt: `${label}, ${record.kind}, page ${page.page} of ${record.pages.length}`,
			campaign,
			kind: record.kind,
			page: page.page,
			pageCount: record.pages.length
		});
	}
}
const quickGuidePath = process.env.QUICK_GUIDE_SOURCE || `${report}/quick-guide/content.json`;
const quickGuide = fs.existsSync(quickGuidePath)
	? readJson(quickGuidePath)
	: readJson('src/lib/content/safetyReport.json').quickGuide;
const data = {
	meta: {
		title: 'Safer Cycling, Better Messages',
		edition: 'Public edition 4.4',
		reviewedThrough: '2026-10-28',
		publishedAt: '2026-10-29',
		fullPdfUrl: `${base}/safer-cycling-better-messages-public-review.pdf`,
		quickPdfUrl: `${base}/safer-cycling-campaigns-quick-guide.pdf`,
		csvUrl: `${base}/evidence-matrix.csv`
	},
	sections: resultSections,
	sources,
	figures,
	campaignGallery,
	quickGuide
};
if (
	sources.length !== 68 ||
	figures.length !== 31 ||
	campaignGallery.length !== 82 ||
	sections.length !== 15
)
	throw new Error(
		`Unexpected coverage: ${sources.length} sources, ${figures.length} figures, ${campaignGallery.length} proofs, ${sections.length} sections`
	);
fs.writeFileSync('src/lib/content/safetyReport.json', `${JSON.stringify(data, null, 2)}\n`);
console.log(
	`Built ${sections.length} sections, ${sources.length} sources, ${figures.length} figures, ${campaignGallery.length} proof pages.`
);

// Attach public downloads and verified copy-safe Canva template links.
await import('./build-safety-campaign-assets.mjs');
