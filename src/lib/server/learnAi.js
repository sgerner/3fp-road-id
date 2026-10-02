import {
	getAiConfigurationError,
	isAiModelConfigured,
	requireAiModel
} from '$lib/server/ai/models';
import { generateLearnReadingAid } from '$lib/learn/readingAid';
import { buildHybridArticleCandidates } from '$lib/server/learnRecommendations';
import {
	buildLearnNavigationExplanationPrompt,
	buildLearnNavigationIntentPrompt,
	buildLearnArticleQuestionPrompt,
	buildLearnWritingPrompt,
	buildLearnTakeawaysPrompt,
	cleanLearnAiString,
	rankLearnNavigationCandidates,
	parseLearnAiJson,
	normalizeLearnAiTakeaways,
	normalizeLearnAiTextResult,
	generateReadingAidWithFallback,
	withLearnAiTimeout,
	LEARN_AI_SOURCE_LIMIT
} from './learnAiCore.js';

const TAKEAWAYS_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['summary', 'takeaways'],
	properties: {
		summary: { type: 'string' },
		takeaways: { type: 'array', items: { type: 'string' } }
	}
};
const NAVIGATION_INTENT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['search_query'],
	properties: { search_query: { type: 'string' } }
};
const TEXT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['text'],
	properties: { text: { type: 'string' } }
};

const cleanText = cleanLearnAiString;

async function generateJson(prompt, schema, schemaName) {
	if (!isAiModelConfigured('structured_text')) {
		const error = new Error(getAiConfigurationError('structured_text'));
		error.code = 'AI_UNAVAILABLE';
		throw error;
	}
	const { client, model } = requireAiModel('structured_text');
	const response = await withLearnAiTimeout(
		client.generateContent({
			model: model.model,
			contents: prompt,
			config: { responseMimeType: 'application/json', responseSchema: schema, schemaName }
		}),
		30_000
	);
	let text = response?.text ?? '';
	if (typeof text === 'function') text = text();
	const parsed = parseLearnAiJson(text);
	if (!parsed) throw new Error('AI returned an invalid response.');
	return parsed;
}

export async function generateLearnAiTakeaways({ title = '', summary = '', content = '' } = {}) {
	const source = cleanText(content);
	if (!source) return null;
	try {
		const result = await generateJson(
			buildLearnTakeawaysPrompt({ title, summary, content: source }),
			TAKEAWAYS_SCHEMA,
			'learn_reading_aid'
		);
		return normalizeLearnAiTakeaways(result);
	} catch (error) {
		if (error?.code !== 'AI_UNAVAILABLE')
			console.warn('AI learn takeaways failed; using local reading aid.', error);
		return null;
	}
}

export async function withLearnAiReadingAid(payload, { generateAi = true } = {}) {
	const articleLength =
		typeof payload.body_markdown === 'string' ? payload.body_markdown.length : 0;
	const shouldGenerate = generateAi && articleLength <= LEARN_AI_SOURCE_LIMIT;
	const aiAid = await generateReadingAidWithFallback({
		generate: () =>
			shouldGenerate
				? generateLearnAiTakeaways({
						title: payload.title,
						summary: payload.summary,
						content: payload.body_markdown
					})
				: Promise.resolve(null),
		fallback: () =>
			generateLearnReadingAid({
				title: payload.title,
				summary: payload.summary,
				markdown: payload.body_markdown
			})
	});
	return { ...payload, reader_summary: aiAid.readerSummary, key_takeaways: aiAid.keyTakeaways };
}

export async function generateLearnWritingDraft({ title = '', content = '', prompt = '' } = {}) {
	const source = cleanText(content);
	const instruction = cleanText(prompt, 1200);
	if (!instruction)
		throw Object.assign(new Error('Add a writing instruction first.'), { code: 'INVALID_INPUT' });
	const result = await generateJson(
		buildLearnWritingPrompt({ title, prompt: instruction, content: source }),
		TEXT_SCHEMA,
		'learn_writing_assistant'
	);
	const draft = normalizeLearnAiTextResult(result, 18_000);
	if (!draft) throw new Error('AI did not return a usable draft.');
	return draft;
}

export async function answerLearnArticleQuestion({ question, article }) {
	const result = await generateJson(
		buildLearnArticleQuestionPrompt(question, article),
		TEXT_SCHEMA,
		'learn_article_answer'
	);
	const answer = normalizeLearnAiTextResult(result, 2000);
	if (!answer) throw new Error('AI did not return a usable answer.');
	return answer;
}

export async function navigateLearnArticles({ supabase, question }) {
	if (!cleanText(question, 700))
		return { articles: [], answer: 'Describe what you are looking for.' };
	const intent = await generateJson(
		buildLearnNavigationIntentPrompt(question),
		NAVIGATION_INTENT_SCHEMA,
		'learn_navigation_intent'
	);
	const query = cleanText(intent.search_query, 300);
	if (!query) throw new Error('AI did not return a usable search query.');
	const originalQuery = cleanText(question, 700);
	const queries = [...new Set([query, originalQuery])];
	const retrievals = await Promise.all(
		queries.map((queryText) => buildHybridArticleCandidates({ supabase, queryText, limit: 24 }))
	);
	const ranked = rankLearnNavigationCandidates(
		retrievals.flatMap((retrieval) => retrieval.candidates),
		queries
	);
	if (!ranked.length) {
		return {
			articles: [],
			answer:
				'I could not find a close match. Try a different phrase or browse the article categories.'
		};
	}
	const articles = ranked.slice(0, 5).map(({ article }) => ({
		id: article.id,
		slug: article.slug,
		title: article.title,
		summary: article.summary,
		category_name: article.category_name
	}));
	const explanation = await generateJson(
		buildLearnNavigationExplanationPrompt(question, articles),
		TEXT_SCHEMA,
		'learn_navigation_explanation'
	);
	const answer = normalizeLearnAiTextResult(explanation, 800);
	if (!answer) throw new Error('AI did not return a usable article explanation.');
	return { articles, answer };
}
