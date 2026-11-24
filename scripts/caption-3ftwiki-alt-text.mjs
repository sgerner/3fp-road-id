import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import {
	LEARN_ALT_TEXT_MAX_LENGTH,
	cleanMarkdownImageUrl,
	extractMarkdownImages,
	isFilenameOrPlaceholderAlt,
	sanitizeAltText
} from '../src/lib/learn/altText.js';
import { extractMarkdownHeadings } from '../src/lib/learn/markdown.js';
import { executeLearnMultimodalAltRequest } from '../src/lib/server/learnAiCore.js';

const workspace = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_DOCS_ROOT = path.join(workspace, 'docs/3ftwiki');
export const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_DOCS_ROOT, 'alt-text-manifest.json');
const envPath = path.join(workspace, '.env');

const ASSET_MIME_TYPES = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml'
};

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function slugify(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function parseLegacyDocument(raw) {
	if (!raw || !raw.startsWith('---')) {
		return { frontmatter: {}, body: safeTrim(raw) };
	}

	const parts = raw.split(/^---\s*$/m);
	if (parts.length < 3) {
		return { frontmatter: {}, body: safeTrim(raw) };
	}

	const frontmatterBlock = parts[1] || '';
	const body = parts.slice(2).join('---\n').trim();
	const frontmatter = {};

	for (const line of frontmatterBlock.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const separator = trimmed.indexOf(':');
		if (separator === -1) continue;
		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();
		frontmatter[key] = value;
	}

	return { frontmatter, body };
}

async function walkMarkdownFiles(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkMarkdownFiles(fullPath)));
		} else if (path.extname(entry.name).toLowerCase() === '.md') {
			files.push(fullPath);
		}
	}
	return files.sort();
}

export function demangleWikiAssetPath(rawTarget, guideRelativePath = '') {
	let cleaned = cleanMarkdownImageUrl(rawTarget)
		.replace(/^<|>$/g, '')
		.replace(/\\_/g, '_')
		.replace(/\*/g, '_')
		.trim();
	if (!cleaned || /^(?:https?:|mailto:|data:)/i.test(cleaned)) return cleaned;

	if (!cleaned.startsWith('/')) {
		const baseDir = path.posix.dirname(`/${guideRelativePath.replace(/\\/g, '/')}`);
		cleaned = path.posix.join(baseDir, cleaned);
	}
	return cleaned.replace(/^\/+/, '');
}

export function formatWikiImageTarget(assetPath) {
	const clean = safeTrim(assetPath).replace(/^\/+/, '');
	if (!clean) return '';
	const rooted = `/${clean}`;
	return /[()\s]/.test(rooted) ? `<${rooted}>` : rooted;
}

export async function loadAltTextManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
	try {
		const raw = await fs.readFile(manifestPath, 'utf8');
		const parsed = JSON.parse(raw);
		const items = Array.isArray(parsed?.items) ? parsed.items : [];
		return {
			version: parsed?.version ?? 1,
			description:
				parsed?.description ??
				'Staged multimodal AI alt-text captions for legacy 3ftwiki guides. Only entries with reviewed=true are applied to docs/3ftwiki, learn_assets, or learn_articles.',
			items
		};
	} catch (error) {
		if (error.code === 'ENOENT') {
			return {
				version: 1,
				description:
					'Staged multimodal AI alt-text captions for legacy 3ftwiki guides. Only entries with reviewed=true are applied to docs/3ftwiki, learn_assets, or learn_articles.',
				items: []
			};
		}
		throw error;
	}
}

export function buildReviewedManifestMaps(manifest) {
	const byGuideAndAsset = new Map();
	const byAsset = new Map();
	for (const item of manifest?.items ?? []) {
		if (!item || item.reviewed !== true) continue;
		const guidePath = safeTrim(item.guidePath).replace(/\\/g, '/');
		const assetPath = safeTrim(item.assetPath).replace(/^\/+/, '');
		if (!assetPath) continue;
		const sanitized = item.isDecorative
			? ''
			: sanitizeAltText(item.altText, {
					maxLength: LEARN_ALT_TEXT_MAX_LENGTH,
					imageUrl: assetPath
				});
		if (!item.isDecorative && !sanitized) continue;
		const record = {
			...item,
			guidePath,
			assetPath,
			altText: sanitized,
			isDecorative: Boolean(item.isDecorative),
			altGenerated: Boolean(item.altGenerated),
			reviewed: true
		};
		if (guidePath) {
			byGuideAndAsset.set(`${guidePath}::${assetPath}`, record);
			byGuideAndAsset.set(`${guidePath.toLowerCase()}::${assetPath.toLowerCase()}`, record);
		}
		if (!byAsset.has(assetPath)) {
			byAsset.set(assetPath, record);
			byAsset.set(assetPath.toLowerCase(), record);
		}
	}
	return { byGuideAndAsset, byAsset };
}

/**
 * @param {object} [options]
 * @param {string} [options.docsRoot]
 * @param {string} [options.manifestPath]
 * @param {{ generateContent: (params: any) => Promise<any> } | null} [options.client]
 * @param {string} [options.model]
 * @param {boolean} [options.forceRegenerate]
 */
export async function stageWikiAltCaptions({
	docsRoot = DEFAULT_DOCS_ROOT,
	manifestPath = DEFAULT_MANIFEST_PATH,
	client = null,
	model = 'gemini-2.5-flash',
	forceRegenerate = false
} = {}) {
	const manifest = await loadAltTextManifest(manifestPath);
	const existingByKey = new Map(
		manifest.items.map((item) => [`${item.guidePath}::${item.assetPath}`, item])
	);
	const mdFiles = await walkMarkdownFiles(docsRoot);
	const stagedItems = [...manifest.items];

	for (const filePath of mdFiles) {
		const guidePath = path.relative(docsRoot, filePath).replace(/\\/g, '/');
		const raw = await fs.readFile(filePath, 'utf8');
		const parsedDoc = parseLegacyDocument(raw);
		const title =
			safeTrim(parsedDoc.frontmatter?.title) || path.basename(guidePath, path.extname(guidePath));
		const summary = safeTrim(parsedDoc.frontmatter?.description);
		const guideSlug = slugify(title);
		const headings = extractMarkdownHeadings(parsedDoc.body).map((h) => h.text);
		const images = extractMarkdownImages(parsedDoc.body);

		for (const image of images) {
			const assetPath = demangleWikiAssetPath(image.rawTarget, guidePath);
			const key = `${guidePath}::${assetPath}`;
			const existing = existingByKey.get(key);
			if (!image.needsRemediation && !existing) continue;
			if (existing?.reviewed && !forceRegenerate) continue;

			const diskAssetPath = path.join(docsRoot, assetPath);
			const imageBuffer = await fs.readFile(diskAssetPath);
			const ext = path.extname(diskAssetPath).toLowerCase();
			const mimeType = ASSET_MIME_TYPES[ext] || 'image/jpeg';

			let drafted = { altText: existing?.altText || '', isDecorative: false };
			if (client) {
				drafted = await executeLearnMultimodalAltRequest({
					client,
					model,
					imageBuffer,
					mimeType,
					fileName: path.basename(assetPath),
					imageUrl: assetPath,
					title,
					summary,
					sectionHeading: image.sectionHeading,
					headings,
					surroundingContext: image.surroundingContext,
					enclosingLinkUrl: image.enclosingLinkUrl,
					enclosingLinkText: image.enclosingLinkText,
					isSoleLinkContent: image.isSoleLinkContent
				});
			}

			const nextEntry = {
				guidePath,
				guideSlug,
				assetPath,
				enclosingLinkUrl: image.enclosingLinkUrl || '',
				isSoleLinkContent: Boolean(image.isSoleLinkContent),
				altText: drafted.altText,
				isDecorative: Boolean(drafted.isDecorative),
				altGenerated: Boolean(client || existing?.altGenerated),
				reviewed: false
			};

			const existingIdx = stagedItems.findIndex(
				(item) => item.guidePath === guidePath && item.assetPath === assetPath
			);
			if (existingIdx >= 0) stagedItems[existingIdx] = nextEntry;
			else stagedItems.push(nextEntry);
			existingByKey.set(key, nextEntry);
		}
	}

	const updatedManifest = {
		...manifest,
		items: stagedItems
	};
	const formattedJson = await prettier.format(JSON.stringify(updatedManifest, null, '\t'), {
		filepath: manifestPath
	});
	await fs.writeFile(manifestPath, formattedJson, 'utf8');
	return updatedManifest;
}

export async function applyReviewedManifestToDocs({
	docsRoot = DEFAULT_DOCS_ROOT,
	manifestPath = DEFAULT_MANIFEST_PATH
} = {}) {
	const manifest = await loadAltTextManifest(manifestPath);
	const { byGuideAndAsset } = buildReviewedManifestMaps(manifest);
	const unreviewedCount = manifest.items.filter((item) => item?.reviewed !== true).length;
	const mdFiles = await walkMarkdownFiles(docsRoot);
	const updatedGuides = [];
	let updatedImagesCount = 0;

	for (const filePath of mdFiles) {
		const guidePath = path.relative(docsRoot, filePath).replace(/\\/g, '/');
		const raw = await fs.readFile(filePath, 'utf8');
		const images = extractMarkdownImages(raw);
		if (!images.length) continue;

		let nextRaw = raw;
		let fileChanged = false;
		for (let idx = images.length - 1; idx >= 0; idx -= 1) {
			const image = images[idx];
			const assetPath = demangleWikiAssetPath(image.rawTarget, guidePath);
			const reviewed =
				byGuideAndAsset.get(`${guidePath}::${assetPath}`) ||
				byGuideAndAsset.get(`${guidePath.toLowerCase()}::${assetPath.toLowerCase()}`);
			if (!reviewed || reviewed.reviewed !== true) continue;

			const cleanTarget = formatWikiImageTarget(assetPath);
			const nextAlt = reviewed.isDecorative ? '' : reviewed.altText;
			const replacement = `![${nextAlt}](${cleanTarget})`;
			if (raw.slice(image.start, image.end) !== replacement) {
				nextRaw = nextRaw.slice(0, image.start) + replacement + nextRaw.slice(image.end);
				fileChanged = true;
				updatedImagesCount += 1;
			}
		}

		if (fileChanged) {
			const formatted = await prettier.format(nextRaw, { filepath: filePath });
			await fs.writeFile(filePath, formatted, 'utf8');
			updatedGuides.push(guidePath);
		}
	}

	return {
		updatedGuides,
		updatedImagesCount,
		skippedUnreviewedCount: unreviewedCount
	};
}

export async function verifyWikiAltCaptions({
	docsRoot = DEFAULT_DOCS_ROOT,
	manifestPath = DEFAULT_MANIFEST_PATH
} = {}) {
	const manifest = await loadAltTextManifest(manifestPath);
	const errors = [];

	for (const item of manifest.items) {
		const label = `${item.guidePath} -> ${item.assetPath}`;
		if (item.reviewed !== true) {
			errors.push(`Unreviewed manifest item: ${label}`);
			continue;
		}
		if (!item.isDecorative) {
			const sanitized = sanitizeAltText(item.altText, {
				maxLength: LEARN_ALT_TEXT_MAX_LENGTH,
				imageUrl: item.assetPath
			});
			if (!sanitized) {
				errors.push(`Invalid or filename altText in manifest for ${label}: ${item.altText}`);
			}
			if ((item.altText || '').length > LEARN_ALT_TEXT_MAX_LENGTH) {
				errors.push(`Manifest altText exceeds ${LEARN_ALT_TEXT_MAX_LENGTH} chars for ${label}`);
			}
			if (item.isSoleLinkContent && /canva\.com/i.test(item.enclosingLinkUrl || '')) {
				if (!/canva|template/i.test(item.altText || '')) {
					errors.push(
						`Canva image-only link altText must describe Canva template purpose: ${label}`
					);
				}
			}
		} else if (item.isSoleLinkContent) {
			errors.push(`Sole-content link image cannot be marked decorative: ${label}`);
		}
	}

	const mdFiles = await walkMarkdownFiles(docsRoot);
	let totalImages = 0;
	let canvaSoleLinkImages = 0;
	for (const filePath of mdFiles) {
		const guidePath = path.relative(docsRoot, filePath).replace(/\\/g, '/');
		const raw = await fs.readFile(filePath, 'utf8');
		const parsedDoc = parseLegacyDocument(raw);
		const images = extractMarkdownImages(parsedDoc.body);
		for (const image of images) {
			totalImages += 1;
			if (image.isSoleLinkContent && image.isCanvaLink) {
				canvaSoleLinkImages += 1;
				if (!/canva|template/i.test(image.currentAlt)) {
					errors.push(
						`${guidePath}: Canva image link missing link-purpose description (${image.currentAlt})`
					);
				}
			}
			if (isFilenameOrPlaceholderAlt(image.currentAlt, image.imageUrl)) {
				errors.push(`${guidePath}: filename or placeholder alt text (${image.currentAlt})`);
			}
			if (image.currentAlt.length > LEARN_ALT_TEXT_MAX_LENGTH) {
				errors.push(
					`${guidePath}: alt text exceeds ${LEARN_ALT_TEXT_MAX_LENGTH} characters (${image.currentAlt.length})`
				);
			}
		}
	}

	return {
		ok: errors.length === 0,
		totalImages,
		canvaSoleLinkImages,
		reviewedManifestCount: manifest.items.filter((item) => item.reviewed === true).length,
		errors
	};
}

/**
 * @param {object} [options]
 * @param {any} [options.supabase]
 * @param {string} [options.manifestPath]
 */
export async function applyReviewedManifestToSupabase({
	supabase,
	manifestPath = DEFAULT_MANIFEST_PATH
} = {}) {
	const manifest = await loadAltTextManifest(manifestPath);
	const unreviewed = manifest.items.filter((item) => item.reviewed !== true);
	if (unreviewed.length) {
		throw new Error(
			`Refusing to update live database while ${unreviewed.length} manifest item(s) have reviewed=false.`
		);
	}
	const { byGuideAndAsset, byAsset } = buildReviewedManifestMaps(manifest);

	let updatedAssets = 0;
	for (const [assetPath, entry] of byAsset.entries()) {
		if (assetPath !== entry.assetPath) continue;
		const { data: existingRows, error: fetchError } = await supabase
			.from('learn_assets')
			.select('id, metadata')
			.eq('source_path', assetPath);
		if (fetchError) throw fetchError;
		for (const row of existingRows ?? []) {
			const mergedMeta = {
				...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
				alt_generated: Boolean(entry.altGenerated),
				alt_reviewed: true
			};
			const { error: updateError } = await supabase
				.from('learn_assets')
				.update({
					alt_text: entry.altText,
					metadata: mergedMeta
				})
				.eq('id', row.id);
			if (updateError) throw updateError;
			updatedAssets += 1;
		}
	}

	const guideSlugs = [...new Set(manifest.items.map((item) => item.guideSlug).filter(Boolean))];
	let updatedArticles = 0;
	if (guideSlugs.length) {
		const { data: articles, error: articlesError } = await supabase
			.from('learn_articles')
			.select('id, slug, import_source_path, body_markdown')
			.in('slug', guideSlugs);
		if (articlesError) throw articlesError;

		for (const article of articles ?? []) {
			const guidePath = safeTrim(article.import_source_path);
			const images = extractMarkdownImages(article.body_markdown || '');
			if (!images.length) continue;

			let nextMarkdown = article.body_markdown;
			let changed = false;
			for (let idx = images.length - 1; idx >= 0; idx -= 1) {
				const image = images[idx];
				const decodedUrl = decodeURIComponent(image.imageUrl || '');
				const importMatch = decodedUrl.match(/\/imports\/(.+)$/);
				const assetPath = importMatch
					? importMatch[1]
					: demangleWikiAssetPath(image.rawTarget, guidePath);
				const reviewed =
					(guidePath && byGuideAndAsset.get(`${guidePath}::${assetPath}`)) ||
					byAsset.get(assetPath);
				if (!reviewed || reviewed.reviewed !== true) continue;
				if (!image.needsRemediation) continue;

				const replacement = `![${reviewed.altText}](${image.rawTarget})`;
				nextMarkdown =
					nextMarkdown.slice(0, image.start) + replacement + nextMarkdown.slice(image.end);
				changed = true;
			}

			if (changed) {
				const { error: articleUpdateError } = await supabase
					.from('learn_articles')
					.update({ body_markdown: nextMarkdown })
					.eq('id', article.id);
				if (articleUpdateError) throw articleUpdateError;
				updatedArticles += 1;
			}
		}
	}

	return { updatedAssets, updatedArticles };
}

async function runCli() {
	try {
		loadEnvFile(envPath);
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}

	const args = new Set(process.argv.slice(2));
	const manifestFlagIdx = process.argv.indexOf('--manifest');
	const manifestPath =
		manifestFlagIdx >= 0 && process.argv[manifestFlagIdx + 1]
			? path.resolve(process.argv[manifestFlagIdx + 1])
			: DEFAULT_MANIFEST_PATH;

	if (args.has('--stage') || args.has('--generate')) {
		const apiKey = safeTrim(process.env.GENAI_API_KEY);
		let client = null;
		if (apiKey) {
			const ai = new GoogleGenAI({ apiKey });
			client = {
				generateContent: (params) => ai.models.generateContent(params)
			};
		} else {
			console.warn(
				'GENAI_API_KEY is not set; staging manifest entries without live Gemini calls (reviewed=false).'
			);
		}
		const staged = await stageWikiAltCaptions({
			manifestPath,
			client,
			forceRegenerate: args.has('--force')
		});
		const unreviewed = staged.items.filter((item) => !item.reviewed).length;
		console.log(
			`Staged ${staged.items.length} caption item(s) in ${manifestPath} (${unreviewed} awaiting maintainer review).`
		);
		return;
	}

	if (args.has('--apply-docs')) {
		const result = await applyReviewedManifestToDocs({ manifestPath });
		console.log(
			`Applied ${result.updatedImagesCount} reviewed alt-text caption(s) across ${result.updatedGuides.length} guide(s).`
		);
		if (result.skippedUnreviewedCount) {
			console.log(`Skipped ${result.skippedUnreviewedCount} unreviewed item(s).`);
		}
	}

	if (args.has('--apply-db')) {
		if (!process.env.PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
			throw new Error(
				'PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply-db.'
			);
		}
		const supabase = createClient(
			process.env.PUBLIC_SUPABASE_URL,
			process.env.SUPABASE_SERVICE_ROLE_KEY,
			{ auth: { persistSession: false, autoRefreshToken: false } }
		);
		const dbResult = await applyReviewedManifestToSupabase({ supabase, manifestPath });
		console.log(
			`Updated ${dbResult.updatedAssets} learn_assets row(s) and ${dbResult.updatedArticles} learn_articles row(s).`
		);
	}

	if (args.has('--verify') || (!args.has('--apply-docs') && !args.has('--apply-db'))) {
		const verification = await verifyWikiAltCaptions({ manifestPath });
		if (!verification.ok) {
			console.error('3ftwiki alt-text verification failed:');
			for (const err of verification.errors) console.error(`- ${err}`);
			process.exitCode = 1;
			return;
		}
		console.log(
			`Verified ${verification.totalImages} markdown image(s) (${verification.canvaSoleLinkImages} Canva image-only links, ${verification.reviewedManifestCount} reviewed manifest captions).`
		);
	}
}

const isDirectExecution =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
	await runCli();
}
