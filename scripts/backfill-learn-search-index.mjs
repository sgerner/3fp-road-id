import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
	buildLearnArticleChunks,
	inferLearnArticleSearchSignals,
	syncLearnArticleChunks
} from '../src/lib/server/learnDiscovery.js';

const workspace = '/home/steven/code/3fp';
const envPath = path.join(workspace, '.env');
const pageSize = 100;

function parseEnv(raw) {
	const env = {};
	for (const line of String(raw || '').split(/\r?\n/)) {
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

async function loadEnv() {
	const envRaw = await fs.readFile(envPath, 'utf8');
	const env = parseEnv(envRaw);
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

	while (true) {
		const to = from + pageSize - 1;
		const { data: rows, error } = await supabase
			.from('learn_articles')
			.select(
				'id,title,summary,body_markdown,category_name,subcategory_name,created_by_user_id,updated_by_user_id'
			)
			.order('updated_at', { ascending: false })
			.range(from, to);
		if (error) throw error;
		if (!rows?.length) break;

		for (const article of rows) {
			const signals = inferLearnArticleSearchSignals({
				title: article.title || '',
				summary: article.summary || '',
				bodyMarkdown: article.body_markdown || '',
				categoryName: article.category_name || '',
				subcategoryName: article.subcategory_name || ''
			});
			const chunks = buildLearnArticleChunks({
				title: article.title || '',
				summary: article.summary || '',
				bodyMarkdown: article.body_markdown || '',
				categoryName: article.category_name || '',
				signals
			});

			const editorUserId = article.updated_by_user_id || article.created_by_user_id || null;
			const { error: updateError } = await supabase
				.from('learn_articles')
				.update({
					tags: signals.tags,
					audience: signals.audience,
					difficulty_level: signals.difficulty_level,
					ride_type: signals.ride_type,
					geo_scope: signals.geo_scope,
					geo_city: signals.geo_city,
					geo_state: signals.geo_state,
					content_type: signals.content_type,
					is_evergreen: signals.is_evergreen,
					metadata_confidence: signals.metadata_confidence,
					article_embedding: signals.embedding_literal,
					updated_by_user_id: editorUserId
				})
				.eq('id', article.id);
			if (updateError) throw updateError;

			await syncLearnArticleChunks(supabase, {
				articleId: article.id,
				chunks,
				userId: editorUserId
			});

			processed += 1;
			console.log(`Backfilled article ${processed}: ${article.title || article.id}`);
		}

		if (rows.length < pageSize) break;
		from += pageSize;
	}

	console.log(`Done. Backfilled ${processed} article(s).`);
}

await backfillArticles();
