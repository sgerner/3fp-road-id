import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearnArticleBackfillUpdate } from './learnSearchBackfill.js';

const signals = {
	tags: ['new'],
	audience: 'riders',
	difficulty_level: 'beginner',
	ride_type: 'road',
	geo_scope: 'local',
	geo_city: 'Tempe',
	geo_state: 'AZ',
	content_type: 'guide',
	is_evergreen: true,
	metadata_confidence: 0.5,
	embedding_literal: '[0.1,0.2]'
};
const article = { reader_summary: 'Curated', key_takeaways: ['kept'] };
const readingAid = { readerSummary: 'Generated', keyTakeaways: ['generated'] };

test('index-only backfill writes only the embedding', () => {
	const update = buildLearnArticleBackfillUpdate({
		article,
		signals,
		readingAid,
		editorUserId: 'user-1',
		indexOnly: true
	});
	assert.deepEqual(update, { article_embedding: '[0.1,0.2]' });
});

test('full backfill keeps curated summaries and rewrites inferred metadata', () => {
	const update = buildLearnArticleBackfillUpdate({
		article,
		signals,
		readingAid,
		editorUserId: 'user-1'
	});
	assert.equal(update.reader_summary, 'Curated');
	assert.deepEqual(update.key_takeaways, ['kept']);
	assert.equal(update.content_type, 'guide');
	assert.equal(update.article_embedding, '[0.1,0.2]');
	assert.equal(update.updated_by_user_id, 'user-1');
});
