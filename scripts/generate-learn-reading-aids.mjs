import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateLearnReadingAid } from '../src/lib/learn/readingAid.js';

const workspace = '/home/steven/code/3fp';
const envPath = path.join(workspace, '.env');

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

async function main() {
	const env = parseEnv(await fs.readFile(envPath, 'utf8'));
	const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const { data: articles, error } = await supabase
		.from('learn_articles')
		.select('id, slug, title, summary, body_markdown');

	if (error) throw error;

	for (const article of articles ?? []) {
		const readingAid = generateLearnReadingAid({
			title: article.title,
			summary: article.summary,
			markdown: article.body_markdown
		});

		const { error: updateError } = await supabase
			.from('learn_articles')
			.update({
				reader_summary: readingAid.readerSummary,
				key_takeaways: readingAid.keyTakeaways
			})
			.eq('id', article.id);

		if (updateError) throw updateError;
		console.log(`Updated reading aids for ${article.slug}`);
	}
}

await main();
