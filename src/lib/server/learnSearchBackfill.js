import { isGenericLearnPlaceholder } from '../learn/readingAid.js';

/**
 * Build the learn_articles update for the search backfill.
 * In index-only mode only the derived embedding is written, so curated
 * metadata (tags, audience, difficulty, geo, content_type, summaries) is never touched.
 * @param {{ article: any, signals: any, readingAid: { readerSummary: string, keyTakeaways: string[] }, editorUserId: string | null, indexOnly?: boolean }} options
 */
export function buildLearnArticleBackfillUpdate({
	article,
	signals,
	readingAid,
	editorUserId,
	indexOnly = false
}) {
	if (indexOnly) {
		return { article_embedding: signals.embedding_literal };
	}
	return {
		reader_summary:
			article.reader_summary && !isGenericLearnPlaceholder(article.reader_summary)
				? article.reader_summary
				: readingAid.readerSummary,
		key_takeaways:
			Array.isArray(article.key_takeaways) && article.key_takeaways.length
				? article.key_takeaways
				: readingAid.keyTakeaways,
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
	};
}
