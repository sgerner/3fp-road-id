import { json } from '@sveltejs/kit';
import {
	answerLearnArticleQuestion,
	generateLearnAiTakeaways,
	generateLearnWritingDraft,
	navigateLearnArticles
} from '$lib/server/learnAi';
import { getLearnClient } from '$lib/server/learn';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';
import {
	buildLearnQuestionContext,
	canAccessLearnAiArticle,
	canUseLearnAiAction,
	cleanLearnAiString,
	LEARN_AI_SOURCE_LIMIT
} from '$lib/server/learnAiCore';

const MAX_REQUEST_BYTES = 48 * 1024;
const MAX_CONTENT_CHARS = 18_000;

function cleanText(value, limit) {
	return cleanLearnAiString(value, limit);
}

function fail(message, status = 400) {
	return json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
}

function mapAiError(error) {
	if (error?.code === 'AI_UNAVAILABLE')
		return fail('AI writing tools are not configured right now.', 503);
	if (error?.code === 'INVALID_INPUT') return fail(error.message, 400);
	console.error('Learn AI request failed', error);
	return fail('The AI request could not be completed. Please try again.', 502);
}

export async function POST(event) {
	const { request, cookies } = event;
	const parsed = await readJsonBody(request, { maxBytes: MAX_REQUEST_BYTES });
	if (!parsed.ok) return fail(parsed.error, parsed.status);
	const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
	const action = cleanText(body.action, 30).toLowerCase();
	const writingAction = action === 'write' || action === 'takeaways';
	const { user, supabase } = await getLearnClient(cookies);
	if (!canUseLearnAiAction(action, user)) return fail('Authentication required.', 401);
	const limited = enforceRateLimit(event, {
		name: `learn-ai-${writingAction ? 'writer' : 'reader'}`,
		key: writingAction && user?.id ? user.id : '',
		limit: writingAction ? 24 : 30,
		windowMs: 60 * 60 * 1000
	});
	if (limited) return limited;
	if (writingAction && user?.id) {
		const ipLimited = enforceRateLimit(event, {
			name: 'learn-ai-writer-ip',
			limit: 40,
			windowMs: 60 * 60 * 1000
		});
		if (ipLimited) return ipLimited;
	}

	try {
		if (action === 'takeaways') {
			if (typeof body.content !== 'string') return fail('Add article content first.');
			if (body.content.length > MAX_CONTENT_CHARS)
				return fail('Article content must be 18,000 characters or fewer.', 413);
			const content = cleanText(body.content, MAX_CONTENT_CHARS);
			if (!content) return fail('Add article content first.');
			const aid = await generateLearnAiTakeaways({
				title: cleanText(body.title, 300),
				summary: cleanText(body.summary, 500),
				content
			});
			if (!aid) return fail('AI takeaway generation is unavailable right now.', 503);
			return json(
				{ takeaways: aid.keyTakeaways, summary: aid.readerSummary },
				{ headers: { 'cache-control': 'no-store' } }
			);
		}
		if (action === 'write') {
			if (body.content != null && typeof body.content !== 'string')
				return fail('Article draft must be text.');
			if (typeof body.content === 'string' && body.content.length > MAX_CONTENT_CHARS) {
				return fail(
					'Article draft must be 18,000 characters or fewer so the assistant can preserve it completely.',
					413
				);
			}
			const draft = await generateLearnWritingDraft({
				prompt: cleanText(body.prompt, 1200),
				title: cleanText(body.title, 300),
				content: cleanText(body.content, MAX_CONTENT_CHARS)
			});
			return json({ draft }, { headers: { 'cache-control': 'no-store' } });
		}
		if (action === 'ask') {
			const question = cleanText(body.question, 700);
			if (!question) return fail('Add a question first.');
			const id = cleanText(body.articleId, 80);
			const slug = cleanText(body.articleSlug, 180);
			if (!id && !slug) return fail('Choose an article to ask about.');
			let query = supabase
				.from('learn_articles')
				.select('id,slug,title,summary,body_markdown,is_published,created_by_user_id');
			query = id ? query.eq('id', id) : query.eq('slug', slug);
			const { data: article, error: articleError } = await query.maybeSingle();
			if (articleError) throw articleError;
			if (!canAccessLearnAiArticle(article, user)) {
				return fail('Article not found.', 404);
			}
			let chunks = [];
			if (
				typeof article.body_markdown === 'string' &&
				article.body_markdown.length > LEARN_AI_SOURCE_LIMIT
			) {
				const chunkResult = await supabase
					.from('learn_article_chunks')
					.select('chunk_index,heading,chunk_text')
					.eq('article_id', article.id)
					.order('chunk_index', { ascending: true })
					.limit(500);
				if (!chunkResult.error) chunks = chunkResult.data || [];
			}
			const context = buildLearnQuestionContext(article, chunks, question);
			const answer = await answerLearnArticleQuestion({
				question,
				article: {
					...article,
					body_markdown: context.text,
					source_excerpt_truncated: context.truncated
				}
			});
			return json(
				{ answer, article: { slug: article.slug, title: article.title } },
				{ headers: { 'cache-control': 'no-store' } }
			);
		}
		if (action === 'navigate') {
			const question = cleanText(body.question, 700);
			if (!question) return fail('Describe what you are looking for.');
			return json(await navigateLearnArticles({ supabase, question }), {
				headers: { 'cache-control': 'no-store' }
			});
		}
		return fail('Unknown AI action.');
	} catch (error) {
		return mapAiError(error);
	}
}
