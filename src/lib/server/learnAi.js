import {
	getAiConfigurationError,
	isAiModelConfigured,
	requireAiModel
} from '#lib/server/ai/models';
import { extractMarkdownHeadings } from '#lib/learn/markdown';
import { generateLearnReadingAid } from '#lib/learn/readingAid';
import { buildHybridArticleCandidates } from '#lib/server/learnRecommendations';
import { fetchPublicHttp, readResponseBuffer } from '#lib/server/security';
import {
	buildLearnArticleQuestionPrompt,
	buildLearnNavigationExplanationPrompt,
	buildLearnNavigationIntentPrompt,
	buildLearnTakeawaysPrompt,
	buildLearnWritingPrompt,
	cleanLearnAiString,
	executeLearnMultimodalAltRequest,
	extractMarkdownImages,
	generateReadingAidWithFallback,
	LEARN_AI_SOURCE_LIMIT,
	normalizeLearnAiTakeaways,
	normalizeLearnAiTextResult,
	parseLearnAiJson,
	rankLearnNavigationCandidates,
	runLearnMarkdownAltAudit,
	sanitizeAltText,
	withLearnAiTimeout
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

const MAX_AUDIT_IMAGES = 24;
const MAX_AUDIT_IMAGE_BYTES = 8 * 1024 * 1024;
const AUDIT_CONCURRENCY = 3;

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
	const parsed = parseLearnAiJson(text);
	if (!parsed) throw new Error('AI returned an invalid response.');
	return parsed;
}

function resolveMultimodalClient({ hasImage = true, clientOverride = null } = {}) {
	if (clientOverride?.client && clientOverride?.model) {
		return clientOverride;
	}
	const profileName = hasImage
		? 'multimodal_structured'
		: isAiModelConfigured('multimodal_structured')
			? 'multimodal_structured'
			: 'structured_text';
	if (!isAiModelConfigured(profileName)) {
		const error = new Error(getAiConfigurationError(profileName));
		error.code = 'AI_UNAVAILABLE';
		throw error;
	}
	return requireAiModel(profileName);
}

export async function generateLearnImageAltText({
	imageBuffer = null,
	imageBase64 = '',
	mimeType = 'image/png',
	fileName = '',
	imageUrl = '',
	title = '',
	summary = '',
	sectionHeading = '',
	headings = [],
	surroundingContext = '',
	enclosingLinkUrl = '',
	enclosingLinkText = '',
	isSoleLinkContent = false,
	target = 'learn',
	context = null,
	timeoutMs = 18_000,
	clientOverride = null
} = {}) {
	const hasImage = Boolean(imageBase64 || (imageBuffer && imageBuffer.byteLength > 0));
	const { client, model } = resolveMultimodalClient({ hasImage, clientOverride });
	return executeLearnMultimodalAltRequest({
		client,
		model,
		imageBuffer,
		imageBase64,
		mimeType,
		fileName,
		imageUrl,
		title,
		summary,
		sectionHeading,
		headings,
		surroundingContext,
		enclosingLinkUrl,
		enclosingLinkText,
		isSoleLinkContent,
		target,
		context,
		timeoutMs
	});
}

async function fetchAuditImageBytes(url, fetchImageImpl = null) {
	const cleanUrl = cleanText(url, 2000);
	if (!/^https?:\/\//i.test(cleanUrl)) return null;
	if (typeof fetchImageImpl === 'function') {
		return fetchImageImpl(cleanUrl);
	}
	try {
		const response = await fetchPublicHttp(
			cleanUrl,
			{ headers: { accept: 'image/*' } },
			{ timeoutMs: 8_000, maxRedirects: 2 }
		);
		if (!response?.ok) return null;
		const headerType = cleanText(response.headers?.get?.('content-type') || '', 120)
			.split(';')[0]
			.trim()
			.toLowerCase();
		if (headerType && !headerType.startsWith('image/')) return null;
		const buffer = await readResponseBuffer(response, MAX_AUDIT_IMAGE_BYTES);
		if (!buffer?.byteLength) return null;
		return {
			buffer,
			mimeType: headerType || 'image/jpeg'
		};
	} catch {
		return null;
	}
}

export async function auditLearnMarkdownAltText({
	supabase = null,
	title = '',
	summary = '',
	content = '',
	articleId = '',
	fetchImageImpl = null,
	generateAltImpl = null
} = {}) {
	if (typeof content !== 'string' || !content.trim()) {
		throw Object.assign(new Error('Add article content first.'), { code: 'INVALID_INPUT' });
	}

	const allImages = extractMarkdownImages(content);
	const flagged = allImages.filter((item) => item.needsRemediation).slice(0, MAX_AUDIT_IMAGES);
	if (!flagged.length) {
		return {
			totalImages: allImages.length,
			flaggedCount: 0,
			issues: [],
			proposals: [],
			draft: content
		};
	}

	const headings = extractMarkdownHeadings(content).map((heading) => heading.text);
	const storedAltByUrl = new Map();

	if (supabase) {
		try {
			const urls = [...new Set(flagged.map((item) => item.imageUrl).filter(Boolean))];
			if (urls.length) {
				const { data: assetRows } = await supabase
					.from('learn_assets')
					.select('public_url, file_name, mime_type, alt_text')
					.in('public_url', urls);
				for (const row of assetRows ?? []) {
					const verifiedAlt = sanitizeAltText(row?.alt_text || '', {
						fileName: row?.file_name || '',
						imageUrl: row?.public_url || ''
					});
					if (row?.public_url && verifiedAlt) {
						storedAltByUrl.set(row.public_url, verifiedAlt);
					}
				}
			}
			if (articleId && !storedAltByUrl.size) {
				const { data: linkedRows } = await supabase
					.from('learn_assets')
					.select('public_url, file_name, alt_text')
					.eq('article_id', articleId);
				for (const row of linkedRows ?? []) {
					const verifiedAlt = sanitizeAltText(row?.alt_text || '', {
						fileName: row?.file_name || '',
						imageUrl: row?.public_url || ''
					});
					if (row?.public_url && verifiedAlt) {
						storedAltByUrl.set(row.public_url, verifiedAlt);
					}
				}
			}
		} catch {
			// Best-effort asset metadata lookup; continue with AI synthesis.
		}
	}

	const aiConfigured =
		Boolean(generateAltImpl) ||
		isAiModelConfigured('multimodal_structured') ||
		isAiModelConfigured('structured_text');

	return runLearnMarkdownAltAudit({
		title,
		summary,
		content,
		headings,
		storedAltByUrl,
		maxImages: MAX_AUDIT_IMAGES,
		concurrency: AUDIT_CONCURRENCY,
		generateAlt: aiConfigured
			? async (item) => {
					if (typeof generateAltImpl === 'function') {
						return generateAltImpl(item);
					}
					const fetched = isAiModelConfigured('multimodal_structured')
						? await fetchAuditImageBytes(item.imageUrl, fetchImageImpl)
						: null;
					return generateLearnImageAltText({
						imageBuffer: fetched?.buffer ?? null,
						mimeType: fetched?.mimeType || 'image/jpeg',
						imageUrl: item.imageUrl,
						fileName: item.currentAlt,
						title,
						summary,
						sectionHeading: item.sectionHeading,
						headings,
						surroundingContext: item.surroundingContext,
						enclosingLinkUrl: item.enclosingLinkUrl,
						enclosingLinkText: item.enclosingLinkText,
						isSoleLinkContent: item.isSoleLinkContent
					});
				}
			: null
	});
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
