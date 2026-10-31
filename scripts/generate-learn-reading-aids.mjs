import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateLearnReadingAid } from '../src/lib/learn/readingAid.js';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const envPath = path.join(workspace, '.env');

async function main() {
	try {
		loadEnvFile(envPath);
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	const env = process.env;
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
