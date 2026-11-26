import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateLearnReadingAid, isGenericLearnPlaceholder } from '../src/lib/learn/readingAid.js';
import { buildLearnArticleBackfillUpdate } from '../src/lib/server/learnSearchBackfill.js';
import {
	isProtectedLearnCatalogArticle,
	syncSafetyReportToDatabase
} from '../src/lib/server/learnCatalog.js';
import {
	buildLearnArticleChunks,
	inferLearnArticleSearchSignals,
	syncLearnArticleChunks
} from '../src/lib/server/learnDiscovery.js';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const envPath = path.join(workspace, '.env');
const pageSize = 100;
// --index-only rebuilds only embeddings and chunks; curated metadata is left untouched.
const indexOnly = process.argv.includes('--index-only');

async function loadEnv() {
	try {
		loadEnvFile(envPath);
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	const env = process.env;
	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error('PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env');
	}
	return { supabaseUrl, serviceRoleKey };
}

async function backfillArticles() {
	const { supabaseUrl, serviceRoleKey } = await loadEnv();
	const supabase = createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	let processed = 0;
	let from = 0;
	let fallbackAuthorUserId = null;

	while (true) {
		const to = from + pageSize - 1;
		const { data: rows, error } = await supabase
			.from('learn_articles')
			.select(
				'id,slug,title,summary,reader_summary,key_takeaways,body_markdown,category_name,subcategory_name,import_source_path,created_by_user_id,updated_by_user_id'
			)
			.order('updated_at', { ascending: false })
			.range(from, to);
		if (error) throw error;
		if (!rows?.length) break;

		for (const article of rows) {
			const editorUserId = article.updated_by_user_id || article.created_by_user_id || null;
			if (!fallbackAuthorUserId && editorUserId) {
				fallbackAuthorUserId = editorUserId;
			}

			// The authoritative Safer Cycling report is synced directly from safetyReport.json below.
			if (isProtectedLearnCatalogArticle(article)) {
				continue;
			}

			const readingAid = generateLearnReadingAid({
				title: article.title || '',
				summary: article.summary || '',
				markdown: article.body_markdown || ''
			});
			const nextReaderSummary =
				article.reader_summary && !isGenericLearnPlaceholder(article.reader_summary)
					? article.reader_summary
					: readingAid.readerSummary;

			const signals = inferLearnArticleSearchSignals({
				title: article.title || '',
				summary: article.summary || nextReaderSummary || '',
				bodyMarkdown: article.body_markdown || '',
				categoryName: article.category_name || '',
				subcategoryName: article.subcategory_name || ''
			});
			const chunks = buildLearnArticleChunks({
				title: article.title || '',
				summary: article.summary || nextReaderSummary || '',
				bodyMarkdown: article.body_markdown || '',
				categoryName: article.category_name || '',
				signals
			});

			const { error: updateError } = await supabase
				.from('learn_articles')
				.update(
					buildLearnArticleBackfillUpdate({ article, signals, readingAid, editorUserId, indexOnly })
				)
				.eq('id', article.id);
			if (updateError) throw updateError;

			await syncLearnArticleChunks(supabase, {
				articleId: article.id,
				chunks,
				userId: editorUserId
			});

			processed += 1;
			console.log(
				`Backfilled article ${processed}: ${article.title || article.id} [${signals.content_type}]`
			);
		}

		if (rows.length < pageSize) break;
		from += pageSize;
	}

	if (indexOnly) {
		console.log(`Done. Rebuilt embeddings and chunks for ${processed} wiki article(s).`);
		return;
	}

	const reportSync = await syncSafetyReportToDatabase(supabase, {
		userId: fallbackAuthorUserId
	});
	if (reportSync) {
		console.log(
			`Synchronized Safer Cycling, Better Messages (${reportSync.articleId}) with ${reportSync.chunkCount} chunks.`
		);
	} else {
		console.warn(
			'Skipped Safer Cycling, Better Messages DB sync because no author user ID was available.'
		);
	}

	console.log(`Done. Backfilled ${processed} wiki article(s).`);
}

await backfillArticles();
