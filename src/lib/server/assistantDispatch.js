import { json } from '@sveltejs/kit';
import {
	normalizeReportTopicLabel,
	rideDraftFingerprint,
	summarizeRideDraft
} from '#lib/ai/assistantHelpers.js';

export const MAX_ASSISTANT_ENVELOPE_BYTES = 128 * 1024;

export const MODE_MAX_BYTES = Object.freeze({
	discover: 64 * 1024,
	'learn-library': 48 * 1024,
	'learn-article': 48 * 1024,
	'learn-write': 48 * 1024,
	'safety-report': 16 * 1024,
	'ride-write': 128 * 1024,
	'group-site-write': 128 * 1024
});

function cleanString(value, maxLength = 500) {
	if (typeof value !== 'string') return '';
	return value.trim().slice(0, maxLength);
}

function splitPathAndQuery(rawPathname) {
	const raw = typeof rawPathname === 'string' ? rawPathname.trim() : '';
	if (!raw) return { pathname: '/', search: '' };
	const hashIndex = raw.indexOf('#');
	const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
	const queryIndex = withoutHash.indexOf('?');
	if (queryIndex < 0) {
		return { pathname: withoutHash || '/', search: '' };
	}
	return {
		pathname: withoutHash.slice(0, queryIndex) || '/',
		search: withoutHash.slice(queryIndex)
	};
}

function safeDecodeSegment(segment) {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

export function inferLearnArticleSlug(pathname) {
	const match = /^\/learn\/([^/]+)\/?$/i.exec(pathname);
	if (!match) return '';
	const slug = safeDecodeSegment(match[1]).trim();
	if (!slug) return '';
	const reserved = new Set(['new', 'category', 'safer-cycling-better-messages']);
	if (reserved.has(slug.toLowerCase())) return '';
	return slug.slice(0, 180);
}

export function inferGroupSiteSlug(pathname) {
	const match = /^\/groups\/([^/]+)\/manage\/site\/?$/i.exec(pathname);
	if (!match) return '';
	return safeDecodeSegment(match[1]).trim().slice(0, 140);
}

export function resolveAssistantDispatch(payload = {}) {
	const rawMode = cleanString(payload?.mode, 40).toLowerCase();
	const { pathname, search } = splitPathAndQuery(payload?.pathname);
	const viewingRevision =
		payload?.viewingRevision === true || /(?:^\?|&)revision=[^&]+/i.test(search);
	const explicitArticleSlug = cleanString(payload?.articleSlug, 180);
	const explicitArticleId = cleanString(payload?.articleId, 80);
	const explicitGroupSlug = cleanString(payload?.groupSlug, 140);

	if (rawMode === 'discover') {
		return { mode: 'discover', pathname };
	}
	if (rawMode === 'learn-library') {
		return { mode: 'learn-library', pathname };
	}
	if (rawMode === 'learn-article') {
		if (viewingRevision && !explicitArticleId && !explicitArticleSlug) {
			return { mode: 'discover', pathname };
		}
		return {
			mode: 'learn-article',
			pathname,
			articleSlug: explicitArticleSlug || inferLearnArticleSlug(pathname),
			articleId: explicitArticleId
		};
	}
	if (rawMode === 'safety-report') {
		return { mode: 'safety-report', pathname };
	}
	if (rawMode === 'learn-write') {
		return {
			mode: 'learn-write',
			pathname,
			articleId: explicitArticleId
		};
	}
	if (rawMode === 'ride-write') {
		return { mode: 'ride-write', pathname };
	}
	if (rawMode === 'group-site-write') {
		return {
			mode: 'group-site-write',
			pathname,
			groupSlug: explicitGroupSlug || inferGroupSiteSlug(pathname)
		};
	}

	// Infer contextual mode from pathname when mode is omitted or 'auto'
	if (!rawMode || rawMode === 'auto') {
		if (/^\/learn\/safer-cycling-better-messages\/?$/i.test(pathname)) {
			return { mode: 'safety-report', pathname };
		}
		if (/^\/learn\/new\/?$/i.test(pathname) || /^\/learn\/[^/]+\/edit\/?$/i.test(pathname)) {
			return {
				mode: 'learn-write',
				pathname,
				articleId: explicitArticleId
			};
		}
		if (/^\/learn\/?$/i.test(pathname) || /^\/learn\/category\/[^/]+\/?$/i.test(pathname)) {
			return { mode: 'learn-library', pathname };
		}
		const articleSlug = explicitArticleSlug || inferLearnArticleSlug(pathname);
		if (articleSlug && !viewingRevision) {
			return {
				mode: 'learn-article',
				pathname,
				articleSlug,
				articleId: explicitArticleId
			};
		}
		if (/^\/ride\/new\/?$/i.test(pathname) || /^\/ride\/[^/]+\/manage\/?$/i.test(pathname)) {
			return { mode: 'ride-write', pathname };
		}
		const groupSlug = explicitGroupSlug || inferGroupSiteSlug(pathname);
		if (groupSlug && /^\/groups\/[^/]+\/manage\/site\/?$/i.test(pathname)) {
			return {
				mode: 'group-site-write',
				pathname,
				groupSlug
			};
		}
	}

	return { mode: 'discover', pathname };
}

export function sanitizeDispatchMessages(rawMessages, { maxMessages = 20, maxChars = 4000 } = {}) {
	if (!Array.isArray(rawMessages)) return [];
	const normalized = rawMessages
		.filter((entry) => entry && typeof entry === 'object' && entry.synthetic !== true)
		.map((entry) => {
			const role = entry.role === 'assistant' ? 'assistant' : entry.role === 'user' ? 'user' : null;
			const content = typeof entry.content === 'string' ? entry.content.trim() : '';
			if (!role || !content) return null;
			return { role, content: content.slice(0, maxChars) };
		})
		.filter(
			/**
			 * @param {{ role: string, content: string } | null} entry
			 * @returns {entry is { role: string, content: string }}
			 */
			(entry) => Boolean(entry)
		);

	// Drop any leading synthetic greeting before the first user turn
	const firstUserIndex = normalized.findIndex((entry) => entry.role === 'user');
	const trimmed = firstUserIndex > 0 ? normalized.slice(firstUserIndex) : normalized;
	return trimmed.slice(-maxMessages);
}

export function extractLatestUserTurn(messages) {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === 'user' && messages[index]?.content) {
			return messages[index].content;
		}
	}
	return '';
}

export function buildSafetyReportDispatchBody(messages, rawTopic = '') {
	let lastUserIdx = -1;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (messages[i]?.role === 'user') {
			lastUserIdx = i;
			break;
		}
	}
	const rawQuestion = lastUserIdx >= 0 ? messages[lastUserIdx].content.trim().slice(0, 1200) : '';
	const topicLabel = normalizeReportTopicLabel(rawTopic);
	const topicSuffix = topicLabel ? `\nReport topic: ${topicLabel}` : '';
	const question =
		rawQuestion && topicSuffix && rawQuestion.length + topicSuffix.length <= 1200
			? `${rawQuestion}${topicSuffix}`
			: rawQuestion;

	const prior = lastUserIdx > 0 ? messages.slice(0, lastUserIdx) : [];
	const recent = prior.slice(-6);
	let remaining = 6000;
	const history = recent
		.slice()
		.reverse()
		.map((turn) => {
			const content = turn.content.slice(0, Math.min(2000, remaining));
			remaining -= content.length;
			return { role: turn.role, content };
		})
		.reverse()
		.filter((turn) => turn.content.length > 0);

	return { question, history };
}

/**
 * @param {any} event
 * @param {string} targetPath
 * @param {any} bodyPayload
 * @param {Record<string, any> | null} [extraParams]
 */
function createDelegatedEvent(event, targetPath, bodyPayload, extraParams = null) {
	const headers = new Headers(event.request?.headers || {});
	headers.set('content-type', 'application/json');
	headers.delete('content-length');

	const baseOrigin = event.url?.origin || 'http://localhost';
	const targetUrl = new URL(targetPath, baseOrigin);
	const subRequest = new Request(targetUrl.toString(), {
		method: 'POST',
		headers,
		body: JSON.stringify(bodyPayload)
	});

	return {
		...event,
		url: targetUrl,
		params: extraParams ? { ...(event.params || {}), ...extraParams } : event.params || {},
		request: subRequest
	};
}

/**
 * @param {Response | null | undefined} response
 * @returns {Record<string, string>}
 */
function copySafeHeaders(response) {
	/** @type {Record<string, string>} */
	const headers = {};
	for (const key of ['cache-control', 'retry-after']) {
		const val = response?.headers?.get?.(key);
		if (val) headers[key] = val;
	}
	return headers;
}

export async function dispatchContextualAssistantRequest({
	event,
	payload,
	byteLength = 0,
	handlers
}) {
	const target = resolveAssistantDispatch(payload);
	const maxBytes = MODE_MAX_BYTES[target.mode] ?? MODE_MAX_BYTES.discover;
	if (byteLength > maxBytes) {
		return json({ error: 'Request body is too large.' }, { status: 413 });
	}

	if (target.mode === 'discover') {
		return null;
	}

	const messages = sanitizeDispatchMessages(payload?.messages, {
		maxMessages: 20,
		maxChars: target.mode === 'discover' ? 1500 : 2500
	});
	const latestUserMessage =
		extractLatestUserTurn(messages) || cleanString(payload?.prompt || payload?.question, 1200);

	if (target.mode === 'learn-library') {
		if (!latestUserMessage) {
			return json({ error: 'Describe what you are looking for.' }, { status: 400 });
		}
		const subEvent = createDelegatedEvent(event, '/api/learn/ai', {
			action: 'navigate',
			question: latestUserMessage.slice(0, 700)
		});
		const response = await handlers.learnAi(subEvent);
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			return json(
				{ error: data.error || 'The library guide is unavailable right now.', mode: target.mode },
				{ status: response.status, headers: copySafeHeaders(response) }
			);
		}
		const recommendations = Array.isArray(data.articles)
			? data.articles
					.filter((article) => article?.slug && article?.title)
					.map((article) => ({
						id: article.id ? String(article.id) : String(article.slug),
						articleId: article.id ? String(article.id) : null,
						type: 'article',
						title: String(article.title),
						subtitle: article.category_name ? String(article.category_name) : 'Learn field guide',
						summary: article.summary ? String(article.summary) : null,
						reason: article.summary
							? String(article.summary)
							: 'Relevant article in the Learn library.',
						url: `/learn/${encodeURIComponent(String(article.slug))}`
					}))
			: [];
		return json(
			{
				mode: 'learn-library',
				reply: String(data.answer || 'Here are relevant articles from the Learn library.'),
				recommendations,
				navigationTarget: null,
				followUpQuestion: null
			},
			{ status: 200, headers: copySafeHeaders(response) }
		);
	}

	if (target.mode === 'learn-article') {
		if (!latestUserMessage) {
			return json({ error: 'Add a question first.' }, { status: 400 });
		}
		if (!target.articleSlug && !target.articleId) {
			return json({ error: 'Choose an article to ask about.' }, { status: 400 });
		}
		const subEvent = createDelegatedEvent(event, '/api/learn/ai', {
			action: 'ask',
			question: latestUserMessage.slice(0, 700),
			...(target.articleId ? { articleId: target.articleId } : {}),
			...(target.articleSlug ? { articleSlug: target.articleSlug } : {})
		});
		const response = await handlers.learnAi(subEvent);
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			return json(
				{
					error: data.error || 'The article assistant is unavailable right now.',
					mode: target.mode
				},
				{ status: response.status, headers: copySafeHeaders(response) }
			);
		}
		return json(
			{
				mode: 'learn-article',
				reply: String(data.answer || '').trim(),
				article: data.article || null,
				recommendations: [],
				navigationTarget: null,
				followUpQuestion: null
			},
			{ status: 200, headers: copySafeHeaders(response) }
		);
	}

	if (target.mode === 'safety-report') {
		const reportBody = buildSafetyReportDispatchBody(messages, payload?.topic);
		const subEvent = createDelegatedEvent(
			event,
			'/api/learn/safety-report/ask',
			reportBody.question ? reportBody : { question: latestUserMessage, history: [] }
		);
		const response = await handlers.safetyReportAsk(subEvent);
		const data = await response.json().catch(() => ({}));
		const relatedSections = Array.isArray(data.sections) ? data.sections : [];
		if (!response.ok) {
			return json(
				{
					error: data.error || 'The report assistant could not answer right now.',
					mode: 'safety-report',
					reportEvidence: {
						nextSteps: [],
						sections: relatedSections,
						sources: []
					}
				},
				{ status: response.status, headers: copySafeHeaders(response) }
			);
		}
		return json(
			{
				mode: 'safety-report',
				reply: String(data.answer || '').trim(),
				reportEvidence: {
					nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps : [],
					sections: relatedSections,
					sources: Array.isArray(data.sources) ? data.sources : []
				},
				recommendations: [],
				navigationTarget: null,
				followUpQuestion: null
			},
			{ status: 200, headers: copySafeHeaders(response) }
		);
	}

	if (target.mode === 'learn-write') {
		const editorContext =
			payload?.editorContext && typeof payload.editorContext === 'object'
				? payload.editorContext
				: {};
		const rawAction = cleanString(payload?.learnAction, 24).toLowerCase();
		let action =
			rawAction === 'takeaways' || rawAction === 'ask' || rawAction === 'write' ? rawAction : '';
		if (!action) {
			if (
				/\b(?:preview|generate|find|create)\s+(?:key\s+)?takeaways?\b|^takeaways\b/i.test(
					latestUserMessage
				)
			) {
				action = 'takeaways';
			} else {
				action = 'write';
			}
		}

		const articleId = target.articleId || cleanString(editorContext.articleId, 80);
		const content =
			typeof editorContext.bodyMarkdown === 'string' ? editorContext.bodyMarkdown : '';
		const title = cleanString(editorContext.title, 300);
		const summary = cleanString(editorContext.summary, 500);

		const learnBody = {
			action,
			...(articleId ? { articleId } : {}),
			...(action === 'ask' ? { question: latestUserMessage.slice(0, 700) } : {}),
			...(action === 'write' ? { prompt: latestUserMessage.slice(0, 1200), content, title } : {}),
			...(action === 'takeaways' ? { content, title, summary } : {})
		};

		const subEvent = createDelegatedEvent(event, '/api/learn/ai', learnBody);
		const response = await handlers.learnAi(subEvent);
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			return json(
				{
					error: data.error || 'The writing assistant could not complete that request.',
					mode: 'learn-write'
				},
				{ status: response.status, headers: copySafeHeaders(response) }
			);
		}

		if (action === 'ask') {
			return json(
				{
					mode: 'learn-write',
					reply: String(data.answer || '').trim(),
					recommendations: [],
					navigationTarget: null,
					followUpQuestion: null
				},
				{ status: 200, headers: copySafeHeaders(response) }
			);
		}

		if (action === 'takeaways') {
			const takeaways = Array.isArray(data.takeaways)
				? data.takeaways.map((item) => String(item || '').trim()).filter(Boolean)
				: [];
			const takeawaySummary = String(data.summary || '').trim();
			return json(
				{
					mode: 'learn-write',
					reply:
						'Here is a preview of the key takeaways and reader summary for your current draft. Saving the article refreshes published takeaways, or you can apply the summary below.',
					proposal: {
						kind: 'learn-takeaways',
						takeaways,
						summary: takeawaySummary,
						baseSummary:
							typeof editorContext.baseSummary === 'string' ? editorContext.baseSummary : summary
					},
					recommendations: [],
					navigationTarget: null,
					followUpQuestion: null
				},
				{ status: 200, headers: copySafeHeaders(response) }
			);
		}

		const draftText = String(data.draft ?? data.suggestion ?? '').trim();
		return json(
			{
				mode: 'learn-write',
				reply:
					'I prepared a draft suggestion from your current article. Review the preview below before applying it—you can undo after applying.',
				proposal: {
					kind: 'learn-draft',
					draft: draftText,
					baseMarkdown:
						typeof editorContext.baseMarkdown === 'string' ? editorContext.baseMarkdown : content
				},
				recommendations: [],
				navigationTarget: null,
				followUpQuestion: null
			},
			{ status: 200, headers: copySafeHeaders(response) }
		);
	}

	if (target.mode === 'ride-write') {
		if (!messages.length) {
			return json({ error: 'messages array required' }, { status: 400 });
		}
		const editorContext =
			payload?.editorContext && typeof payload.editorContext === 'object'
				? payload.editorContext
				: {};
		const ridePayload =
			editorContext.payload && typeof editorContext.payload === 'object'
				? editorContext.payload
				: editorContext;
		const baseFingerprint =
			typeof editorContext.fingerprint === 'string' && editorContext.fingerprint
				? editorContext.fingerprint
				: rideDraftFingerprint(ridePayload);

		const subEvent = createDelegatedEvent(event, '/api/ai/ride-writer', {
			messages,
			context: ridePayload
		});
		const response = await handlers.rideWriter(subEvent);
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			return json(
				{
					error: data.error || 'Unable to generate ride draft right now.',
					mode: 'ride-write'
				},
				{ status: response.status, headers: copySafeHeaders(response) }
			);
		}
		const followUpQuestions = Array.isArray(data.follow_up_questions)
			? data.follow_up_questions.filter((q) => typeof q === 'string' && q.trim())
			: [];
		return json(
			{
				mode: 'ride-write',
				reply: String(
					data.reply || 'Review the proposed ride updates below and apply when ready.'
				).trim(),
				followUpQuestions,
				followUpQuestion: followUpQuestions.length
					? followUpQuestions.map((q) => `• ${q}`).join('\n')
					: null,
				proposal: data.draft
					? {
							kind: 'ride-draft',
							draft: data.draft,
							summary: summarizeRideDraft(ridePayload, data.draft),
							baseFingerprint
						}
					: null,
				recommendations: [],
				navigationTarget: null
			},
			{ status: 200, headers: copySafeHeaders(response) }
		);
	}

	if (target.mode === 'group-site-write') {
		if (!target.groupSlug) {
			return json({ error: 'Group slug is required.' }, { status: 400 });
		}
		const editorContext =
			payload?.editorContext && typeof payload.editorContext === 'object'
				? payload.editorContext
				: {};
		const currentConfig =
			editorContext.currentConfig && typeof editorContext.currentConfig === 'object'
				? editorContext.currentConfig
				: payload?.currentConfig && typeof payload.currentConfig === 'object'
					? payload.currentConfig
					: {};
		const baseFingerprint =
			typeof editorContext.baseFingerprint === 'string' ? editorContext.baseFingerprint : '';

		const subEvent = createDelegatedEvent(
			event,
			`/api/groups/${encodeURIComponent(target.groupSlug)}/site/ai-draft-chat`,
			{
				messages,
				currentConfig
			},
			{ slug: target.groupSlug }
		);
		const response = await handlers.groupSiteDraftChat(subEvent);
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			return json(
				{
					error: data.error || 'The design assistant is unavailable right now.',
					mode: 'group-site-write'
				},
				{ status: response.status, headers: copySafeHeaders(response) }
			);
		}
		return json(
			{
				mode: 'group-site-write',
				reply: String(data.reply || 'Tell me what you would like to refine next.').trim(),
				proposal:
					data.generated && data.config
						? {
								kind: 'group-site-draft',
								config: data.config,
								source: String(data.source || 'ai'),
								generationPrompt: String(data.generationPrompt || ''),
								summary: Array.isArray(data.summary) ? data.summary.filter(Boolean) : [],
								baseFingerprint
							}
						: null,
				recommendations: [],
				navigationTarget: null,
				followUpQuestion: null
			},
			{ status: 200, headers: copySafeHeaders(response) }
		);
	}

	return null;
}
