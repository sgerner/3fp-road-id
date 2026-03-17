import fs from 'node:fs/promises';
import path from 'node:path';
import TurndownService from 'turndown';
import { createClient } from '@supabase/supabase-js';
import { generateLearnReadingAid } from '../src/lib/learn/readingAid.js';

const workspace = '/home/steven/code/3fp';
const docsRoot = path.join(workspace, 'docs/3ftwiki');
const envPath = path.join(workspace, '.env');
const contentExtensions = new Set(['.md', '.html']);
const assetMimeTypes = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.pdf': 'application/pdf',
	'.csv': 'text/csv'
};
const manualLinkAliases = new Map([
	['/education/alert', '/education/ALERT'],
	['/policies/complete-streets/resoultions', '/policies/complete-streets/resolutions'],
	['/policies/complete-streets/assets', '/policies/complete-streets/marketing-plan'],
	['/policies/complete-streets/marketing-assets', '/policies/complete-streets/marketing-plan'],
	['/policies/complete-streets/case-study', '/policies/complete-streets/briefing'],
	[
		'/support_materials/volunteer-roles-signup-sheet.csv',
		'/elections/volunteer-roles-signup-sheet.csv'
	],
	['/community/social-media', '/community/social-media'],
	['/education/rodeo', '/community/neighborhood-events'],
	['/outreach/media', '/outreach/storytelling'],
	['/media/memorial-press-release', '/outreach/advocacy-letters'],
	['/advocacy/election-cycles', '/policies/elections/strategic-infrastructure-ride'],
	['/advocacy/safety-audit', '/policies/complete-streets/policy-audit'],
	['/policies/design-standards', '/policies/complete-streets'],
	['/policies/complete-streets/press-releases', '/outreach/advocacy-letters'],
	['/policies/complete-streets/op-eds', '/policies/complete-streets/op-eds'],
	['/stories/official-engagement-success', '/stories/tbag-winter-games'],
	['/stories/memorial-community-action', '/stories/tbag-winter-games'],
	['/stories/downtown-family-rides', '/stories/tbag-winter-games'],
	['/stories/rural-safety-rides', '/stories/tbag-winter-games'],
	['/stories/council-awareness-ride', '/stories/tbag-winter-games'],
	['/policies/elections/short-form-video-content', '/policies/elections/short-form-video']
]);

function parseEnv(raw) {
	const env = {};
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const separator = trimmed.indexOf('=');
		if (separator === -1) continue;
		const key = trimmed.slice(0, separator).trim();
		let value = trimmed.slice(separator + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		env[key] = value;
	}
	return env;
}

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

function titleCase(value) {
	return safeTrim(value)
		.split(/[-_]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walk(fullPath)));
		} else {
			files.push(fullPath);
		}
	}
	return files;
}

function parseLegacyDocument(raw) {
	if (!raw.startsWith('---')) {
		return { data: {}, content: raw };
	}

	const parts = raw.split(/^---\s*$/m);
	if (parts.length < 3) {
		return { data: {}, content: raw };
	}

	const frontmatterBlock = parts[1] || '';
	const content = parts.slice(2).join('---\n').trim();
	const data = {};

	for (const line of frontmatterBlock.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const separator = trimmed.indexOf(':');
		if (separator === -1) continue;
		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();
		data[key] = value;
	}

	return { data, content };
}

function parseHtmlDocument(raw) {
	const commentMatch = raw.match(/<!--([\s\S]*?)-->/);
	const meta = {};
	if (commentMatch) {
		for (const line of commentMatch[1].split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const separator = trimmed.indexOf(':');
			if (separator === -1) continue;
			const key = trimmed.slice(0, separator).trim();
			const value = trimmed.slice(separator + 1).trim();
			meta[key] = value;
		}
	}

	const withoutComment = commentMatch ? raw.replace(commentMatch[0], '') : raw;
	const bodyMatch = withoutComment.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	const bodyHtml = (bodyMatch?.[1] || withoutComment).trim();
	return { data: meta, content: bodyHtml };
}

function getCategoryMeta(relativePath) {
	const parts = relativePath.split('/');
	if (parts.length <= 1) {
		return {
			categoryName: 'General',
			categorySlug: 'general',
			subcategoryName: null,
			subcategorySlug: null
		};
	}

	const categoryName = titleCase(parts[0]);
	const categorySlug = slugify(parts[0]);
	const subcategoryPart = parts.length > 2 ? parts[1] : null;

	return {
		categoryName,
		categorySlug,
		subcategoryName: subcategoryPart ? titleCase(subcategoryPart) : null,
		subcategorySlug: subcategoryPart ? slugify(subcategoryPart) : null
	};
}

function getSourceRoute(relativePath) {
	const normalized = relativePath.replace(/\\/g, '/');
	if (normalized === 'home.html') return '/';
	return `/${normalized.replace(/\.(md|html)$/i, '')}`;
}

function normalizeWikiPath(input) {
	const cleaned = safeTrim(input)
		.replace(/^docs\/3ftwiki/i, '')
		.replace(/^https?:\/\/[^/]+/i, '')
		.replace(/[?#].*$/, '')
		.replace(/\.(md|html)$/i, '')
		.replace(/\/+/g, '/');

	if (!cleaned || cleaned === '/') return '/';
	return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

function cleanMarkdownTarget(target) {
	return safeTrim(target)
		.replace(/\s+=\d.*$/, '')
		.replace(/^['"]|['"]$/g, '');
}

function unwrapParens(target) {
	let output = safeTrim(target);
	while (output.startsWith('(') && output.endsWith(')')) {
		output = output.slice(1, -1).trim();
	}
	return output;
}

function buildSlugEntries(entries) {
	const used = new Set();
	for (const entry of entries) {
		const base =
			slugify(entry.title) ||
			slugify(path.basename(entry.relativePath, path.extname(entry.relativePath))) ||
			'article';
		const candidates = [
			base,
			`${base}-${slugify(entry.subcategorySlug || '')}`.replace(/-$/, ''),
			`${base}-${slugify(path.basename(path.dirname(entry.relativePath)))}`.replace(/-$/, ''),
			`${base}-${slugify(entry.relativePath.replace(/\.(md|html)$/i, '').replace(/\//g, '-'))}`
		].filter(Boolean);

		let chosen = candidates.find((candidate) => !used.has(candidate));
		if (!chosen) {
			let suffix = 2;
			while (!chosen) {
				const candidate = `${base}-${suffix}`;
				if (!used.has(candidate)) chosen = candidate;
				suffix += 1;
			}
		}

		entry.slug = chosen;
		used.add(chosen);
	}
}

function buildContentKeyMap(entries) {
	const routeMap = new Map();
	const basenameMap = new Map();
	for (const entry of entries) {
		const route = normalizeWikiPath(entry.sourceRoute);
		routeMap.set(route, entry.slug);
		routeMap.set(route.toLowerCase(), entry.slug);
		if (route === '/') routeMap.set('/home', entry.slug);
		const baseName = slugify(path.basename(entry.relativePath, path.extname(entry.relativePath)));
		if (baseName && !basenameMap.has(baseName)) basenameMap.set(baseName, entry.slug);
		const titleSlug = slugify(entry.title);
		if (titleSlug && !basenameMap.has(titleSlug)) basenameMap.set(titleSlug, entry.slug);
	}
	return { routeMap, basenameMap };
}

async function uploadAssets(supabase, assetPaths, authorId) {
	const assetMap = new Map();
	const basenameMap = new Map();
	for (const assetPath of assetPaths) {
		const relativePath = path.relative(docsRoot, assetPath).replace(/\\/g, '/');
		const ext = path.extname(assetPath).toLowerCase();
		const mimeType = assetMimeTypes[ext] || 'application/octet-stream';
		const objectPath = `imports/${relativePath}`;
		const content = await fs.readFile(assetPath);
		const { error: uploadError } = await supabase.storage
			.from('learn-media')
			.upload(objectPath, content, {
				upsert: true,
				contentType: mimeType
			});
		if (uploadError) throw uploadError;
		const { data: urlData } = supabase.storage.from('learn-media').getPublicUrl(objectPath);
		const publicUrl = urlData?.publicUrl;
		const stat = await fs.stat(assetPath);
		const { data: assetRow, error: assetError } = await supabase
			.from('learn_assets')
			.upsert(
				{
					uploaded_by_user_id: authorId,
					bucket_id: 'learn-media',
					object_path: objectPath,
					public_url: publicUrl,
					file_name: path.basename(relativePath),
					mime_type: mimeType,
					size_bytes: stat.size,
					source_type: 'import',
					source_path: relativePath,
					metadata: {
						imported_from: relativePath
					}
				},
				{ onConflict: 'object_path' }
			)
			.select(
				'id, public_url, object_path, mime_type, file_name, size_bytes, source_type, source_path'
			)
			.single();
		if (assetError) throw assetError;
		const route = normalizeWikiPath(`/${relativePath}`);
		const assetDetails = {
			id: assetRow.id,
			publicUrl,
			objectPath,
			mimeType,
			relativePath
		};
		assetMap.set(route, assetDetails);
		assetMap.set(route.toLowerCase(), assetDetails);
		const baseName = path.basename(relativePath).toLowerCase();
		if (baseName && !basenameMap.has(baseName)) basenameMap.set(baseName, assetDetails);
	}
	return { assetMap, basenameMap };
}

function resolveRelativeTarget(currentRoute, target) {
	if (target.startsWith('/')) return normalizeWikiPath(target);
	const baseDir = currentRoute === '/' ? '/' : path.posix.dirname(currentRoute);
	return normalizeWikiPath(path.posix.join(baseDir, target));
}

function normalizeLegacySizedLinks(markdown) {
	return safeTrim(markdown).replace(/\]\((.+?)\s+=\d+[^)]*\)/g, ']($1)');
}

function rewriteMarkdownLinks(markdown, entry, maps, unresolved) {
	const referencedImages = [];
	const referencedAssets = [];
	const normalizedMarkdown = normalizeLegacySizedLinks(markdown);
	const rewriteTarget = (rawTarget) => {
		let target = cleanMarkdownTarget(unwrapParens(rawTarget));
		if (!target || /^(https?:|mailto:|#)/i.test(target)) return target;
		const resolved = resolveRelativeTarget(entry.sourceRoute, target);
		const aliasResolved =
			manualLinkAliases.get(resolved) || manualLinkAliases.get(resolved.toLowerCase()) || resolved;

		if (maps.contentRoutes.has(aliasResolved)) {
			return `/learn/${maps.contentRoutes.get(aliasResolved)}`;
		}
		if (maps.contentRoutes.has(aliasResolved.toLowerCase())) {
			return `/learn/${maps.contentRoutes.get(aliasResolved.toLowerCase())}`;
		}
		if (maps.assetRoutes.has(aliasResolved)) {
			const asset = maps.assetRoutes.get(aliasResolved);
			if (asset.mimeType.startsWith('image/')) referencedImages.push(asset.publicUrl);
			referencedAssets.push(asset);
			return asset.publicUrl;
		}
		if (maps.assetRoutes.has(aliasResolved.toLowerCase())) {
			const asset = maps.assetRoutes.get(aliasResolved.toLowerCase());
			if (asset.mimeType.startsWith('image/')) referencedImages.push(asset.publicUrl);
			referencedAssets.push(asset);
			return asset.publicUrl;
		}

		const basename = path.basename(aliasResolved).toLowerCase();
		if (basename && maps.assetBasenames.has(basename)) {
			const asset = maps.assetBasenames.get(basename);
			if (asset.mimeType.startsWith('image/')) referencedImages.push(asset.publicUrl);
			referencedAssets.push(asset);
			return asset.publicUrl;
		}
		if (basename) {
			const nameWithoutExt = slugify(path.basename(basename, path.extname(basename)));
			if (maps.contentBasenames.has(nameWithoutExt)) {
				return `/learn/${maps.contentBasenames.get(nameWithoutExt)}`;
			}
		}

		if (/^(\/|\.{1,2}\/)/.test(target)) {
			unresolved.push({ source: entry.relativePath, target });
		}
		return target;
	};

	const rewritten = normalizedMarkdown.replace(
		/\]\(((?:[^()\n]+|\([^()\n]*\))+)\)/g,
		(match, target) => `](${rewriteTarget(target)})`
	);
	return {
		markdown: rewritten,
		referencedImages: Array.from(new Set(referencedImages)),
		referencedAssets: Array.from(
			new Map(referencedAssets.map((asset) => [asset.id, asset])).values()
		)
	};
}

async function syncArticleAssetLinks(supabase, articleId, authorId, assets) {
	if (!articleId || !assets.length) return;

	const links = assets.map((asset, index) => ({
		article_id: articleId,
		asset_id: asset.id,
		created_by_user_id: authorId,
		usage_kind: asset.mimeType.startsWith('image/') ? 'embedded' : 'attachment',
		sort_order: index
	}));

	const { error } = await supabase
		.from('learn_article_asset_links')
		.upsert(links, { onConflict: 'article_id,asset_id' });
	if (error) throw error;
}

async function syncCategories(supabase, entries) {
	const categories = Array.from(
		new Map(
			entries.map((entry, index) => [
				entry.categorySlug,
				{
					slug: entry.categorySlug,
					name: entry.categoryName,
					sort_order: index
				}
			])
		).values()
	);

	if (categories.length) {
		const { error } = await supabase
			.from('learn_categories')
			.upsert(categories, { onConflict: 'slug' });
		if (error) throw error;
	}

	const subcategories = Array.from(
		new Map(
			entries
				.filter((entry) => entry.subcategorySlug)
				.map((entry, index) => [
					`${entry.categorySlug}:${entry.subcategorySlug}`,
					{
						slug: entry.subcategorySlug,
						category_slug: entry.categorySlug,
						name: entry.subcategoryName,
						sort_order: index
					}
				])
		).values()
	);

	if (subcategories.length) {
		const { error } = await supabase
			.from('learn_subcategories')
			.upsert(subcategories, { onConflict: 'slug' });
		if (error) throw error;
	}
}

function extractTitle(parsedData, relativePath) {
	return (
		safeTrim(parsedData.title) || titleCase(path.basename(relativePath, path.extname(relativePath)))
	);
}

async function main() {
	const env = parseEnv(await fs.readFile(envPath, 'utf8'));
	const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const allFiles = await walk(docsRoot);
	const contentFiles = allFiles.filter((file) =>
		contentExtensions.has(path.extname(file).toLowerCase())
	);
	const assetFiles = allFiles.filter(
		(file) => !contentExtensions.has(path.extname(file).toLowerCase())
	);

	const { data: profiles, error: profilesError } = await supabase
		.from('profiles')
		.select('user_id, admin')
		.order('admin', { ascending: false })
		.limit(5);
	if (profilesError) throw profilesError;
	const authorId = profiles?.[0]?.user_id;
	if (!authorId) throw new Error('No profile rows available to attribute imported articles.');

	const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

	const entries = [];
	for (const filePath of contentFiles) {
		const relativePath = path.relative(docsRoot, filePath).replace(/\\/g, '/');
		const ext = path.extname(filePath).toLowerCase();
		const raw = await fs.readFile(filePath, 'utf8');
		const parsed = ext === '.html' ? parseHtmlDocument(raw) : parseLegacyDocument(raw);
		const bodyMarkdown =
			ext === '.html' ? turndown.turndown(parsed.content || '').trim() : safeTrim(parsed.content);
		const { categoryName, categorySlug, subcategoryName, subcategorySlug } =
			getCategoryMeta(relativePath);

		entries.push({
			filePath,
			relativePath,
			sourceRoute: getSourceRoute(relativePath),
			title: extractTitle(parsed.data, relativePath),
			summary: safeTrim(parsed.data.description) || null,
			bodyMarkdown,
			categoryName,
			categorySlug,
			subcategoryName,
			subcategorySlug
		});
	}

	buildSlugEntries(entries);
	const { routeMap, basenameMap } = buildContentKeyMap(entries);
	await syncCategories(supabase, entries);
	const { assetMap, basenameMap: assetBasenames } = await uploadAssets(
		supabase,
		assetFiles,
		authorId
	);
	const unresolved = [];

	for (const entry of entries) {
		const rewritten = rewriteMarkdownLinks(
			entry.bodyMarkdown,
			entry,
			{
				contentRoutes: routeMap,
				contentBasenames: basenameMap,
				assetRoutes: assetMap,
				assetBasenames
			},
			unresolved
		);
		const readingAid = generateLearnReadingAid({
			title: entry.title,
			summary: entry.summary,
			markdown: rewritten.markdown
		});
		const coverImageUrl = rewritten.referencedImages[0] || null;

		const { data: articleRow, error: upsertError } = await supabase
			.from('learn_articles')
			.upsert(
				{
					title: entry.title,
					slug: entry.slug,
					summary: entry.summary,
					body_markdown: rewritten.markdown,
					editor_mode: 'markdown',
					category_slug: entry.categorySlug,
					category_name: entry.categoryName,
					subcategory_slug: entry.subcategorySlug,
					subcategory_name: entry.subcategoryName,
					import_source_path: entry.relativePath,
					cover_image_url: coverImageUrl,
					reader_summary: readingAid.readerSummary,
					key_takeaways: readingAid.keyTakeaways,
					created_by_user_id: authorId,
					updated_by_user_id: authorId,
					is_published: true
				},
				{ onConflict: 'slug' }
			)
			.select('id')
			.single();

		if (upsertError) throw upsertError;
		await syncArticleAssetLinks(supabase, articleRow.id, authorId, rewritten.referencedAssets);
		console.log(`Imported ${entry.relativePath} -> ${entry.slug}`);
	}

	console.log(`Imported ${entries.length} articles and uploaded ${assetFiles.length} assets.`);
	if (unresolved.length) {
		console.log(`Unresolved internal references: ${unresolved.length}`);
		for (const item of unresolved.slice(0, 50)) {
			console.log(`- ${item.source}: ${item.target}`);
		}
	}
}

await main();
