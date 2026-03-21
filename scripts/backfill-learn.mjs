import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateLearnReadingAid } from '../src/lib/learn/readingAid.js';

const workspace = '/home/steven/code/3fp';
const envPath = path.join(workspace, '.env');
const filesToImport = [
	'docs/3ftwiki/education/ALERT.md',
	'docs/3ftwiki/education/crash-response.md',
	'docs/3ftwiki/support/emotional-support.md',
	'docs/3ftwiki/support/family-outreach.md',
	'docs/3ftwiki/support/victim-resources.md'
];

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

function titleFromFile(filePath, frontmatter) {
	return (
		safeTrim(frontmatter.title) ||
		path.basename(filePath, path.extname(filePath)).replace(/[-_]+/g, ' ')
	);
}

function categoryFromFile(filePath) {
	const dir = path.basename(path.dirname(filePath));
	const name = dir
		.split(/[-_]+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
	return {
		name: name || 'General',
		slug: slugify(name) || 'general'
	};
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

async function main() {
	const env = parseEnv(await fs.readFile(envPath, 'utf8'));
	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error('PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env');
	}

	const supabase = createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const { data: profiles, error: profilesError } = await supabase
		.from('profiles')
		.select('user_id, admin')
		.order('admin', { ascending: false })
		.limit(5);

	if (profilesError) throw profilesError;
	const authorId = profiles?.[0]?.user_id;
	if (!authorId) {
		throw new Error('No profile rows available to attribute imported articles.');
	}

	for (const relativePath of filesToImport) {
		const absolutePath = path.join(workspace, relativePath);
		const raw = await fs.readFile(absolutePath, 'utf8');
		const parsed = parseLegacyDocument(raw);
		const title = titleFromFile(relativePath, parsed.data);
		const category = categoryFromFile(relativePath);
		const slug = slugify(title);
		const summary = safeTrim(parsed.data.description) || null;
		const body = safeTrim(parsed.content);
		const readingAid = generateLearnReadingAid({ title, summary, markdown: body });

		const { error: upsertError } = await supabase.from('learn_articles').upsert(
			{
				title,
				slug,
				summary,
				body_markdown: body,
				editor_mode: 'markdown',
				category_slug: category.slug,
				category_name: category.name,
				reader_summary: readingAid.readerSummary,
				key_takeaways: readingAid.keyTakeaways,
				created_by_user_id: authorId,
				updated_by_user_id: authorId,
				is_published: true
			},
			{
				onConflict: 'slug'
			}
		);

		if (upsertError) throw upsertError;
		console.log(`Imported ${relativePath} -> ${slug}`);
	}
}

await main();
