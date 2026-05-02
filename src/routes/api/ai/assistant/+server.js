import { json } from '@sveltejs/kit';
import { getActivityClient } from '$lib/server/activities';
import { isAiModelConfigured, requireAiModel } from '$lib/server/ai/models';
import { buildHybridArticleCandidates, inferArticleIntent } from '$lib/server/learnRecommendations';

export const config = { runtime: 'nodejs20.x', maxDuration: 60 };

const MAX_MESSAGE_COUNT = 24;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_RECOMMENDATIONS = 6;
const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'but',
	'by',
	'for',
	'from',
	'how',
	'i',
	'if',
	'in',
	'into',
	'is',
	'it',
	'me',
	'my',
	'of',
	'on',
	'or',
	'our',
	'please',
	're',
	'do',
	'did',
	'does',
	'done',
	'so',
	'that',
	'what',
	'when',
	'where',
	'who',
	'why',
	'should',
	'could',
	'would',
	'recent',
	'after',
	'before',
	'anything',
	'nothing',
	'the',
	'them',
	'they',
	'this',
	'to',
	'us',
	'we',
	'with',
	'you',
	'your'
]);

const FOCUS_ALLOWED = new Set(['groups', 'rides', 'volunteer']);
const CREATE_ROUTE_BY_TYPE = {
	ride: {
		url: '/ride/new',
		label: 'Post A Ride',
		reason: 'Create a new public ride listing.'
	},
	group: {
		url: '/groups/new',
		label: 'Create A Group',
		reason: 'Create a new group profile and publish it.'
	},
	volunteer: {
		url: '/volunteer/new',
		label: 'Host A Volunteer Event',
		reason: 'Set up a volunteer event with shifts and signups.'
	},
	article: {
		url: '/learn/new',
		label: 'Write A Learn Article',
		reason: 'Publish a new article in Learn.'
	}
};

const CHAT_RESPONSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['reply'],
	properties: {
		reply: { type: 'string' },
		follow_up_question: { type: 'string', nullable: true },
		learned_context: {
			type: 'object',
			nullable: true,
			additionalProperties: false,
			properties: {
				location: { type: 'string', nullable: true },
				interests: {
					type: 'array',
					nullable: true,
					items: { type: 'string' }
				},
				recommendation_focus: {
					type: 'array',
					nullable: true,
					items: { type: 'string' }
				}
			}
		}
	}
};

const ARTICLE_RERANK_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['selected_ids'],
	properties: {
		selected_ids: {
			type: 'array',
			items: { type: 'string' }
		}
	}
};

let schemaUnsupported = false;

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function normalizeObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return value;
}

function normalizeMessages(messages) {
	if (!Array.isArray(messages)) return [];
	const rows = [];
	for (const raw of messages) {
		if (!raw || typeof raw !== 'object') continue;
		const role = raw.role === 'assistant' ? 'assistant' : raw.role === 'user' ? 'user' : null;
		if (!role) continue;
		const content = safeTrim(raw.content).slice(0, MAX_MESSAGE_LENGTH);
		if (!content) continue;
		rows.push({ role, content });
		if (rows.length >= MAX_MESSAGE_COUNT) break;
	}
	return rows;
}

function tokenize(value) {
	return safeTrim(value)
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function uniqStrings(values, limit = 24) {
	const next = [];
	for (const value of values || []) {
		const cleaned = safeTrim(value);
		if (!cleaned) continue;
		if (next.some((entry) => entry.toLowerCase() === cleaned.toLowerCase())) continue;
		next.push(cleaned);
		if (next.length >= limit) break;
	}
	return next;
}

function normalizeLearnedContext(raw) {
	const source = normalizeObject(raw);
	const location = safeTrim(source.location).slice(0, 120);
	const interests = uniqStrings(source.interests, 8).map((item) => item.slice(0, 40));
	const recommendationFocus = uniqStrings(source.recommendation_focus, 3)
		.map((item) => item.toLowerCase())
		.filter((item) => FOCUS_ALLOWED.has(item));
	if (!location && !interests.length && !recommendationFocus.length) return null;
	return {
		location: location || null,
		interests,
		recommendation_focus: recommendationFocus
	};
}

function safeParseJson(text) {
	if (!text) return null;
	const first = text.indexOf('{');
	const last = text.lastIndexOf('}');
	if (first === -1 || last === -1 || last <= first) return null;
	const candidate = text.slice(first, last + 1).trim();
	try {
		return JSON.parse(candidate);
	} catch {
		const cleaned = candidate.replace(/^```json\s*/i, '').replace(/```$/i, '');
		try {
			return JSON.parse(cleaned);
		} catch {
			return null;
		}
	}
}

function isSchemaUnsupportedError(error) {
	if (!error) return false;
	const raw = error?.message;
	if (typeof raw !== 'string') return false;
	try {
		const parsed = JSON.parse(raw);
		const message = parsed?.error?.message || '';
		return /response_schema/i.test(message) || /Invalid JSON payload/i.test(message);
	} catch {
		return /response_schema/i.test(raw) || /Invalid JSON payload/i.test(raw);
	}
}

async function safeSelect(queryPromise, label) {
	const { data, error } = await queryPromise;
	if (error) {
		console.warn(`assistant query failed for ${label}`, error);
		return [];
	}
	return Array.isArray(data) ? data : [];
}

function extractLatestUserMessage(messages) {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === 'user') return messages[index].content;
	}
	return '';
}

function detectRequestedTypes(message) {
	const text = safeTrim(message).toLowerCase();
	const types = new Set();
	if (/\b(ride|riding|bike ride|group ride|road ride|gravel|mtb)\b/.test(text)) types.add('ride');
	if (/\b(group|club|team|chapter|community)\b/.test(text)) types.add('group');
	if (/\b(volunteer|shift|host|help out|staff)\b/.test(text)) types.add('volunteer');
	if (/\b(article|learn|guide|resource|read|blog|write)\b/.test(text)) types.add('article');
	return Array.from(types);
}

function detectCreateIntent(message) {
	const text = safeTrim(message).toLowerCase();
	if (!text) return null;
	const wantsCreate = /\b(post|create|start|host|publish|add|submit|list|share|make)\b/.test(text);
	if (!wantsCreate) return null;

	if (/\b(ride|bike ride|group ride|route)\b/.test(text)) return CREATE_ROUTE_BY_TYPE.ride;
	if (/\b(group|club|team|chapter)\b/.test(text)) return CREATE_ROUTE_BY_TYPE.group;
	if (/\b(volunteer|shift|opportunity|event)\b/.test(text)) return CREATE_ROUTE_BY_TYPE.volunteer;
	if (/\b(article|learn|guide|resource|blog|write)\b/.test(text))
		return CREATE_ROUTE_BY_TYPE.article;

	return {
		url: '/get-involved',
		label: 'Choose What To Post',
		reason: 'Pick whether you want to post a ride, group, volunteer event, or article.'
	};
}

function normalizeLocationTerms(value) {
	return tokenize(value).filter((token) => token.length >= 3);
}

function summarizeProfileContext(profile) {
	const metadata = normalizeObject(profile?.metadata);
	const recommendationContext = normalizeObject(metadata.recommendation_context);
	const assistantMemory = normalizeObject(metadata.ai_assistant);
	return {
		recommendationContext: {
			location: safeTrim(recommendationContext.location).slice(0, 120),
			interests: uniqStrings(recommendationContext.interests, 12),
			recommendation_focus: uniqStrings(recommendationContext.recommendation_focus, 3)
				.map((value) => value.toLowerCase())
				.filter((value) => FOCUS_ALLOWED.has(value))
		},
		assistantMemory: {
			learned_location: safeTrim(assistantMemory.learned_location).slice(0, 120),
			learned_interests: uniqStrings(assistantMemory.learned_interests, 12),
			recent_topics: uniqStrings(assistantMemory.recent_topics, 16)
		}
	};
}

function normalizeGroupRow(row) {
	return {
		id: row?.id ?? null,
		slug: row?.slug ?? null,
		name: row?.name ?? 'Untitled group',
		tagline: row?.tagline ?? '',
		description: row?.description ?? '',
		city: row?.city ?? '',
		state_region: row?.state_region ?? '',
		country: row?.country ?? '',
		membership_info: row?.membership_info ?? '',
		service_area_description: row?.service_area_description ?? '',
		activity_frequency: row?.activity_frequency ?? '',
		typical_activity_day_time: row?.typical_activity_day_time ?? ''
	};
}

function normalizeRideRow(row) {
	return {
		id: row?.id ?? null,
		slug: row?.slug ?? null,
		title: row?.title ?? 'Ride',
		summary: row?.summary ?? '',
		description: row?.description ?? '',
		start_location_name: row?.start_location_name ?? '',
		start_location_address: row?.start_location_address ?? '',
		next_occurrence_start: row?.next_occurrence_start ?? null,
		host_group_id: row?.host_group_id ?? null
	};
}

function normalizeVolunteerRow(row) {
	return {
		id: row?.id ?? null,
		slug: row?.slug ?? null,
		title: row?.title ?? 'Volunteer event',
		summary: row?.summary ?? '',
		description: row?.description ?? '',
		event_start: row?.event_start ?? null,
		location_name: row?.location_name ?? '',
		location_address: row?.location_address ?? '',
		host_group_id: row?.host_group_id ?? null,
		event_type_slug: row?.event_type_slug ?? ''
	};
}

function buildGroupMap(rows) {
	return new Map(
		(rows || []).filter((row) => row?.id).map((row) => [String(row.id), normalizeGroupRow(row)])
	);
}

function toItem(type, row, groupMap) {
	if (!row?.slug) return null;
	if (type === 'group') {
		const locationBits = [row.city, row.state_region, row.country].filter(Boolean).join(', ');
		const locationBlob = [row.city, row.state_region, row.country, row.service_area_description]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();
		return {
			type,
			id: row.id,
			title: row.name,
			subtitle: locationBits || null,
			summary: row.tagline || row.description || row.membership_info || null,
			url: `/groups/${row.slug}`,
			hostGroupId: row.id,
			startAt: null,
			updatedAt: null,
			searchBlob: [
				row.name,
				row.tagline,
				row.description,
				row.city,
				row.state_region,
				row.country,
				row.membership_info,
				row.service_area_description,
				row.activity_frequency,
				row.typical_activity_day_time
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase(),
			locationBlob
		};
	}

	if (type === 'ride') {
		const hostGroup = groupMap.get(String(row.host_group_id));
		const locationBits = [
			row.start_location_name,
			row.start_location_address,
			hostGroup?.city,
			hostGroup?.state_region
		]
			.filter(Boolean)
			.join(' · ');
		return {
			type,
			id: row.id,
			title: row.title,
			subtitle: locationBits || null,
			summary: row.summary || row.description || null,
			url: `/ride/${row.slug}`,
			hostGroupId: row.host_group_id,
			startAt: row.next_occurrence_start,
			updatedAt: null,
			searchBlob: [
				row.title,
				row.summary,
				row.description,
				row.start_location_name,
				row.start_location_address,
				hostGroup?.name,
				hostGroup?.city,
				hostGroup?.state_region
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase(),
			locationBlob: [
				row.start_location_name,
				row.start_location_address,
				hostGroup?.city,
				hostGroup?.state_region,
				hostGroup?.country
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
		};
	}

	if (type === 'volunteer') {
		const hostGroup = groupMap.get(String(row.host_group_id));
		const locationBits = [
			row.location_name,
			row.location_address,
			hostGroup?.city,
			hostGroup?.state_region
		]
			.filter(Boolean)
			.join(' · ');
		return {
			type,
			id: row.id,
			title: row.title,
			subtitle: locationBits || null,
			summary: row.summary || row.description || null,
			url: `/volunteer/${row.slug}`,
			hostGroupId: row.host_group_id,
			startAt: row.event_start,
			updatedAt: null,
			searchBlob: [
				row.title,
				row.summary,
				row.description,
				row.location_name,
				row.location_address,
				row.event_type_slug,
				hostGroup?.name,
				hostGroup?.city,
				hostGroup?.state_region
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase(),
			locationBlob: [
				row.location_name,
				row.location_address,
				hostGroup?.city,
				hostGroup?.state_region,
				hostGroup?.country
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
		};
	}

	const category = row.category_name ? `Category: ${row.category_name}` : '';
	return {
		type,
		id: row.id,
		title: row.title,
		subtitle: row.category_name || null,
		summary: row.summary || null,
		url: `/learn/${row.slug}`,
		hostGroupId: null,
		startAt: null,
		updatedAt: row.updated_at,
		searchBlob: [row.title, row.summary, row.category_name, category]
			.filter(Boolean)
			.join(' ')
			.toLowerCase(),
		locationBlob: ''
	};
}

function locationHintFromContext({ recommendationContext, assistantMemory }) {
	return recommendationContext.location || assistantMemory.learned_location || '';
}

function scoreItem(item, context) {
	const {
		queryTerms,
		interestTerms,
		historyTerms,
		locationTerms,
		requestedTypes,
		recommendationFocus,
		affinityGroupIds,
		now
	} = context;
	let score = 1;
	const keywordHits = [];
	const interestHits = [];
	let locationMatched = false;
	let groupAffinityMatched = false;

	for (const term of queryTerms) {
		if (item.searchBlob.includes(term)) {
			score += 4;
			keywordHits.push(term);
		}
	}

	for (const term of interestTerms) {
		if (item.searchBlob.includes(term)) {
			score += 2;
			interestHits.push(term);
		}
	}

	for (const term of historyTerms) {
		if (item.searchBlob.includes(term)) {
			score += 1;
		}
	}

	for (const term of locationTerms) {
		if (item.locationBlob.includes(term)) {
			score += 3;
			locationMatched = true;
		}
	}

	if (item.hostGroupId && affinityGroupIds.has(String(item.hostGroupId))) {
		score += 5;
		groupAffinityMatched = true;
	}

	if (requestedTypes.length && requestedTypes.includes(item.type)) {
		score += 6;
	}

	if (recommendationFocus.has('rides') && item.type === 'ride') score += 4;
	if (recommendationFocus.has('groups') && item.type === 'group') score += 4;
	if (recommendationFocus.has('volunteer') && item.type === 'volunteer') score += 4;

	if ((item.type === 'ride' || item.type === 'volunteer') && item.startAt) {
		const startTs = new Date(item.startAt).getTime();
		if (Number.isFinite(startTs)) {
			const daysOut = (startTs - now.getTime()) / 86400000;
			if (daysOut >= -1 && daysOut <= 30) score += 3;
			else if (daysOut > 30 && daysOut <= 90) score += 1;
		}
	}

	if (item.type === 'article' && item.updatedAt) {
		const updatedTs = new Date(item.updatedAt).getTime();
		if (Number.isFinite(updatedTs)) {
			const ageDays = (now.getTime() - updatedTs) / 86400000;
			if (ageDays <= 14) score += 2;
			else if (ageDays <= 45) score += 1;
		}
	}

	return {
		item,
		score,
		keywordHits: uniqStrings(keywordHits, 3),
		interestHits: uniqStrings(interestHits, 3),
		locationMatched,
		groupAffinityMatched
	};
}

function buildReason(scored, locationHint) {
	if (scored.locationMatched && locationHint) {
		return `Close to ${locationHint}.`;
	}
	if (scored.groupAffinityMatched) {
		return 'Connected to groups you have engaged with.';
	}
	if (scored.keywordHits.length) {
		return `Matches what you asked for (${scored.keywordHits.slice(0, 2).join(', ')}).`;
	}
	if (scored.interestHits.length) {
		return `Aligned with your interests (${scored.interestHits.slice(0, 2).join(', ')}).`;
	}
	if (scored.item.type === 'ride') return 'Upcoming ride with relevant details and timing.';
	if (scored.item.type === 'volunteer') return 'Upcoming volunteer event that fits your profile.';
	if (scored.item.type === 'group') return 'Likely group fit based on your profile and activity.';
	return 'Useful learning resource based on your recent asks.';
}

function selectRecommendations(scoredItems, requestedTypes) {
	const picked = [];
	const usedUrls = new Set();
	const perType = new Map();

	for (const type of requestedTypes) {
		const candidate = scoredItems.find(
			(row) => row.item.type === type && !usedUrls.has(row.item.url)
		);
		if (!candidate) continue;
		picked.push(candidate);
		usedUrls.add(candidate.item.url);
		perType.set(type, (perType.get(type) || 0) + 1);
		if (picked.length >= MAX_RECOMMENDATIONS) return picked;
	}

	for (const candidate of scoredItems) {
		if (picked.length >= MAX_RECOMMENDATIONS) break;
		if (usedUrls.has(candidate.item.url)) continue;
		const typeCount = perType.get(candidate.item.type) || 0;
		if (typeCount >= 3) continue;
		picked.push(candidate);
		usedUrls.add(candidate.item.url);
		perType.set(candidate.item.type, typeCount + 1);
	}

	return picked;
}

function formatRecommendation(scored, locationHint) {
	const reason =
		scored.item.type === 'article' && scored.articleCandidate
			? buildArticleReasonFromCandidate(scored.articleCandidate, locationHint)
			: buildReason(scored, locationHint);
	const recommendation = {
		id: scored.item.id ? String(scored.item.id) : null,
		type: scored.item.type,
		title: scored.item.title,
		subtitle: scored.item.subtitle,
		summary: scored.item.summary,
		url: scored.item.url,
		reason
	};
	if (scored.item.type === 'article') {
		recommendation.articleId = scored.item.id ? String(scored.item.id) : null;
		recommendation.chunkId = scored.item.chunkId || scored.articleCandidate?.best_chunk_id || null;
		recommendation.contentType =
			scored.item.contentType || scored.articleCandidate?.article?.content_type || null;
	}
	return recommendation;
}

function buildArticleReasonFromCandidate(candidate, locationHint) {
	const features = normalizeObject(candidate?.features);
	const article = normalizeObject(candidate?.article);
	if (Number(features.location) >= 0.35 && locationHint) {
		return `Relevant near ${locationHint}.`;
	}
	if (Number(features.chunk_lexical) >= 0.45 && safeTrim(candidate?.best_chunk_heading)) {
		return `Matches the "${safeTrim(candidate.best_chunk_heading)}" section closely.`;
	}
	if (Number(features.personalization) >= 0.3) {
		return 'Aligned with your saved interests and prior activity.';
	}
	if (safeTrim(article.content_type) && safeTrim(article.content_type) !== 'reference') {
		return `Good ${safeTrim(article.content_type)} match for this question.`;
	}
	return 'Strong match based on article metadata and semantic relevance.';
}

function scoreArticleCandidate(candidate, { requestedTypes, locationHint }) {
	const article = candidate?.article || {};
	const baseScore = Number(candidate?.score || 0);
	const wantsArticle = requestedTypes.includes('article');
	const locationMatched = Number(candidate?.features?.location || 0) >= 0.3;
	return {
		item: {
			type: 'article',
			id: article.id || null,
			title: article.title || 'Learn article',
			subtitle: article.category_name || null,
			summary: article.summary || null,
			url: article.slug ? `/learn/${article.slug}` : '/learn',
			hostGroupId: null,
			startAt: null,
			updatedAt: article.updated_at || null,
			searchBlob: '',
			locationBlob: [article.geo_city, article.geo_state, article.geo_scope]
				.filter(Boolean)
				.join(' ')
				.toLowerCase(),
			chunkId: candidate?.best_chunk_id || null,
			contentType: article.content_type || null
		},
		score:
			8 + baseScore * 14 + (wantsArticle ? 6 : 0) + (locationMatched && locationHint ? 1.4 : 0),
		keywordHits: [],
		interestHits: [],
		locationMatched,
		groupAffinityMatched: false,
		articleCandidate: candidate
	};
}

async function rerankArticleCandidatesWithAi({
	latestUserMessage,
	candidates,
	profileContext,
	historyContext,
	locationHint,
	maxPool = 12
}) {
	if (!Array.isArray(candidates) || !candidates.length) return [];
	if (!isAiModelConfigured('structured_text')) return candidates;

	const topCandidates = candidates.slice(0, Math.max(3, maxPool));
	const optionsBlock = topCandidates
		.map((entry, index) => {
			const article = entry.article || {};
			return `${index + 1}. id=${article.id}; title=${article.title}; summary=${safeTrim(article.summary).slice(0, 180)}; content_type=${article.content_type}; score=${Number(entry.score || 0).toFixed(3)}`;
		})
		.join('\n');

	const prompt = `
You are ranking Learn articles for a user query.
Return JSON with selected_ids as an ordered array of candidate ids from most relevant to least.
Only include ids that exist in the options list.

User query:
${latestUserMessage}

Location hint:
${locationHint || '(none)'}

Profile signals:
${JSON.stringify(profileContext, null, 2)}

History summary:
${JSON.stringify(historyContext, null, 2)}

Options:
${optionsBlock}
`;

	try {
		const { client, model } = requireAiModel('structured_text');
		const response = await client.generateContent({
			model: model.model,
			contents: prompt,
			config: {
				responseMimeType: 'application/json',
				responseSchema: ARTICLE_RERANK_SCHEMA
			}
		});
		let text = response?.text ?? '';
		if (typeof text === 'function') text = text();
		const parsed = safeParseJson(text);
		const selectedIds = uniqStrings(
			Array.isArray(parsed?.selected_ids) ? parsed.selected_ids : [],
			topCandidates.length + 4
		).map((value) => value.toLowerCase());
		if (!selectedIds.length) return candidates;

		const topById = new Map(
			topCandidates.map((entry) => [String(entry?.article?.id || '').toLowerCase(), entry])
		);
		const reorderedTop = [];
		for (const id of selectedIds) {
			const candidate = topById.get(id);
			if (candidate && !reorderedTop.includes(candidate)) {
				reorderedTop.push(candidate);
			}
		}
		for (const candidate of topCandidates) {
			if (!reorderedTop.includes(candidate)) reorderedTop.push(candidate);
		}
		const carried = candidates.filter((candidate) => !topCandidates.includes(candidate));
		return [...reorderedTop, ...carried];
	} catch (error) {
		console.warn('assistant article rerank failed', error);
		return candidates;
	}
}

function fallbackAssistantReply({ recommendations, navigationTarget, requestedTypes }) {
	if (!recommendations.length && navigationTarget) {
		return {
			reply: `I can take you straight there: ${navigationTarget.label}.`,
			follow_up_question: 'Want me to help with details after you open the form?',
			learnedContext: null
		};
	}

	if (!recommendations.length) {
		return {
			reply:
				'I could not find strong matches yet. Share your location and what you want (ride, group, volunteer, or article), and I will narrow this down.',
			follow_up_question: 'What city or area should I prioritize?',
			learnedContext: null
		};
	}

	const topTitles = recommendations
		.slice(0, 3)
		.map((entry) => entry.title)
		.join(', ');
	const typeHint = requestedTypes.length ? ` for ${requestedTypes.join(', ')}` : '';
	const navLine = navigationTarget ? ` I also included ${navigationTarget.label}.` : '';
	return {
		reply: `Here are strong matches${typeHint}: ${topTitles}.${navLine}`,
		follow_up_question: 'Want me to narrow these by distance or date next?',
		learnedContext: null
	};
}

async function generateAssistantReply({
	messages,
	recommendations,
	navigationTarget,
	profileContext,
	historyContext,
	requestedTypes,
	locationHint
}) {
	const fallback = fallbackAssistantReply({ recommendations, navigationTarget, requestedTypes });
	if (!isAiModelConfigured('structured_text')) return fallback;

	const conversation = messages
		.map((entry) => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}`)
		.join('\n');
	const recommendationBlock = recommendations.length
		? recommendations
				.map(
					(entry, index) =>
						`${index + 1}. [${entry.type}] ${entry.title} — ${entry.reason} — ${entry.url}`
				)
				.join('\n')
		: '(none)';

	const prompt = `
You are Trail Guide, a concise assistant for a cycling community platform.

Your job:
- Write a practical, friendly reply in plain text (max 120 words).
- Mention 2-4 of the provided recommendations by title when available.
- If navigation_target exists, mention it clearly.
- Ask one useful follow-up question when it helps.
- Extract long-lived preference signals ONLY when explicitly stated by the user.

Conversation:
${conversation}

Profile signals:
${JSON.stringify(profileContext, null, 2)}

Platform history summary:
${JSON.stringify(historyContext, null, 2)}

Location hint:
${locationHint || '(none)'}

Requested types:
${requestedTypes.join(', ') || '(none)'}

Recommendation options:
${recommendationBlock}

Navigation target:
${navigationTarget ? JSON.stringify(navigationTarget) : '(none)'}

Return JSON with keys: reply, follow_up_question, learned_context.
learned_context can include:
- location (string)
- interests (string[])
- recommendation_focus (array from groups, rides, volunteer)
Set learned_context to null when nothing explicit was provided.
`;

	async function runWithSchema(useSchema = true) {
		const { client, model } = requireAiModel('structured_text');
		const config = { responseMimeType: 'application/json' };
		if (useSchema) config.responseSchema = CHAT_RESPONSE_SCHEMA;
		const response = await client.generateContent({
			model: model.model,
			contents: prompt,
			config
		});
		let text = response?.text ?? '';
		if (typeof text === 'function') text = text();
		const parsed = safeParseJson(text);
		const reply = safeTrim(parsed?.reply || text);
		const followUpQuestion = safeTrim(parsed?.follow_up_question) || null;
		const learnedContext = normalizeLearnedContext(parsed?.learned_context);
		if (!reply) return fallback;
		return { reply, follow_up_question: followUpQuestion, learnedContext };
	}

	try {
		return await runWithSchema(!schemaUnsupported);
	} catch (error) {
		if (!schemaUnsupported && isSchemaUnsupportedError(error)) {
			schemaUnsupported = true;
			try {
				return await runWithSchema(false);
			} catch (retryError) {
				console.error('assistant ai retry failed', retryError);
				return fallback;
			}
		}
		console.error('assistant ai generation failed', error);
		return fallback;
	}
}

function buildHistoryContext({
	rideHistory,
	volunteerHistory,
	groupMemberships,
	groupMap,
	recommendationContext,
	assistantMemory
}) {
	const rides = rideHistory
		.slice(0, 8)
		.map((entry) => entry.activity?.title)
		.filter(Boolean);
	const volunteer = volunteerHistory
		.slice(0, 8)
		.map((entry) => entry.event?.title)
		.filter(Boolean);
	const groups = groupMemberships
		.slice(0, 8)
		.map((entry) => groupMap.get(String(entry.group_id))?.name)
		.filter(Boolean);
	return {
		ride_titles: rides,
		volunteer_titles: volunteer,
		groups,
		recommendation_focus: recommendationContext.recommendation_focus,
		interests: recommendationContext.interests,
		assistant_topics: assistantMemory.recent_topics,
		counts: {
			ride_rsvps: rideHistory.length,
			volunteer_signups: volunteerHistory.length,
			group_memberships: groupMemberships.length
		}
	};
}

async function loadUserData(supabase, user) {
	if (!user?.id) {
		return {
			profile: null,
			recommendationContext: { location: '', interests: [], recommendation_focus: [] },
			assistantMemory: { learned_location: '', learned_interests: [], recent_topics: [] },
			rideHistory: [],
			volunteerHistory: [],
			groupMemberships: [],
			historyGroupIds: [],
			feedbackEvents: [],
			articleUserWeights: null
		};
	}

	const profileResult = await supabase
		.from('profiles')
		.select('id,user_id,email,metadata')
		.eq('user_id', user.id)
		.maybeSingle();
	if (profileResult.error) {
		console.warn('assistant profile lookup failed', profileResult.error);
	}
	const profile = profileResult.data || null;
	const contextSummary = summarizeProfileContext(profile);
	const profileEmail = safeTrim(profile?.email || user?.email || '').toLowerCase();

	const rideHistoryRows = await safeSelect(
		supabase
			.from('activity_rsvps')
			.select('id,activity_event_id,status,created_at')
			.eq('user_id', user.id)
			.order('created_at', { ascending: false })
			.limit(40),
		'ride history'
	);

	let volunteerQuery = supabase
		.from('volunteer_signups')
		.select('id,event_id,status,created_at,volunteer_user_id,volunteer_email')
		.order('created_at', { ascending: false })
		.limit(40);
	if (profileEmail) {
		volunteerQuery = volunteerQuery.or(
			`volunteer_user_id.eq.${user.id},volunteer_email.eq.${profileEmail}`
		);
	} else {
		volunteerQuery = volunteerQuery.eq('volunteer_user_id', user.id);
	}
	const volunteerHistoryRows = await safeSelect(volunteerQuery, 'volunteer history');

	const groupMemberships = await safeSelect(
		supabase
			.from('group_members')
			.select('group_id,role,joined_at')
			.eq('user_id', user.id)
			.order('joined_at', { ascending: false })
			.limit(40),
		'group memberships'
	);
	const feedbackEvents = await safeSelect(
		supabase
			.from('learn_article_feedback_events')
			.select('article_id,chunk_id,feedback_type,dwell_seconds,created_at')
			.eq('user_id', user.id)
			.order('created_at', { ascending: false })
			.limit(240),
		'learn article feedback'
	);
	const articleUserWeightsResult = await supabase
		.from('learn_article_user_weights')
		.select(
			'user_id,lexical_weight,semantic_weight,freshness_weight,personalization_weight,location_weight,diversity_weight'
		)
		.eq('user_id', user.id)
		.maybeSingle();
	if (articleUserWeightsResult.error) {
		console.warn('assistant article user weights lookup failed', articleUserWeightsResult.error);
	}

	const rideEventIds = uniqStrings(
		rideHistoryRows.map((row) => row.activity_event_id),
		60
	);
	const rideEvents = rideEventIds.length
		? await safeSelect(
				supabase
					.from('activity_events')
					.select('id,title,slug,host_group_id,start_location_name,start_location_address')
					.in('id', rideEventIds),
				'ride history events'
			)
		: [];
	const rideEventMap = new Map(rideEvents.map((row) => [String(row.id), row]));

	const volunteerEventIds = uniqStrings(
		volunteerHistoryRows.map((row) => row.event_id),
		60
	);
	const volunteerEvents = volunteerEventIds.length
		? await safeSelect(
				supabase
					.from('volunteer_events')
					.select('id,title,slug,host_group_id,location_name,location_address,event_start')
					.in('id', volunteerEventIds),
				'volunteer history events'
			)
		: [];
	const volunteerEventMap = new Map(volunteerEvents.map((row) => [String(row.id), row]));

	const historyGroupIds = uniqStrings(
		[
			...groupMemberships.map((row) => row.group_id),
			...rideEvents.map((row) => row.host_group_id),
			...volunteerEvents.map((row) => row.host_group_id)
		],
		120
	);

	const rideHistory = rideHistoryRows.map((row) => ({
		...row,
		activity: rideEventMap.get(String(row.activity_event_id)) || null
	}));
	const volunteerHistory = volunteerHistoryRows.map((row) => ({
		...row,
		event: volunteerEventMap.get(String(row.event_id)) || null
	}));

	return {
		profile,
		recommendationContext: contextSummary.recommendationContext,
		assistantMemory: contextSummary.assistantMemory,
		rideHistory,
		volunteerHistory,
		groupMemberships,
		historyGroupIds,
		feedbackEvents,
		articleUserWeights: articleUserWeightsResult.data || null
	};
}

async function loadRecommendationsData(supabase) {
	const nowIso = new Date().toISOString();
	const volunteerFloor = new Date();
	volunteerFloor.setDate(volunteerFloor.getDate() - 3);

	const [ridesRaw, groupsRaw, volunteerRaw] = await Promise.all([
		safeSelect(
			supabase
				.from('activity_events')
				.select(
					'id,slug,title,summary,description,start_location_name,start_location_address,next_occurrence_start,host_group_id'
				)
				.eq('activity_type', 'ride')
				.eq('status', 'published')
				.gte('next_occurrence_start', nowIso)
				.order('next_occurrence_start', { ascending: true })
				.limit(120),
			'rides recommendations'
		),
		safeSelect(
			supabase
				.from('groups')
				.select(
					'id,slug,name,tagline,description,city,state_region,country,membership_info,service_area_description,activity_frequency,typical_activity_day_time'
				)
				.order('updated_at', { ascending: false })
				.limit(120),
			'groups recommendations'
		),
		safeSelect(
			supabase
				.from('volunteer_events')
				.select(
					'id,slug,title,summary,description,event_start,location_name,location_address,host_group_id,event_type_slug'
				)
				.eq('status', 'published')
				.gte('event_start', volunteerFloor.toISOString())
				.order('event_start', { ascending: true })
				.limit(120),
			'volunteer recommendations'
		)
	]);

	const rides = ridesRaw.map(normalizeRideRow).filter((row) => row.id && row.slug);
	const groups = groupsRaw.map(normalizeGroupRow).filter((row) => row.id && row.slug);
	const volunteer = volunteerRaw.map(normalizeVolunteerRow).filter((row) => row.id && row.slug);

	const groupIds = uniqStrings(
		[
			...rides.map((row) => row.host_group_id),
			...volunteer.map((row) => row.host_group_id),
			...groups.map((row) => row.id)
		],
		200
	);

	const mappedGroups = groupIds.length
		? await safeSelect(
				supabase
					.from('groups')
					.select(
						'id,slug,name,tagline,description,city,state_region,country,membership_info,service_area_description,activity_frequency,typical_activity_day_time'
					)
					.in('id', groupIds),
				'group map'
			)
		: [];

	const groupMap = buildGroupMap([...mappedGroups, ...groups]);

	const items = [
		...rides.map((row) => toItem('ride', row, groupMap)),
		...groups.map((row) => toItem('group', row, groupMap)),
		...volunteer.map((row) => toItem('volunteer', row, groupMap))
	].filter(Boolean);

	return { items, groupMap };
}

async function persistLearnedAssistantContext({
	supabase,
	user,
	profile,
	recommendationContext,
	assistantMemory,
	learnedContext,
	latestUserMessage,
	navigationTarget,
	historyContext
}) {
	if (!user?.id) return;
	if (!learnedContext && !latestUserMessage) return;

	const existingMetadata = normalizeObject(profile?.metadata);
	const existingRecommendation = normalizeObject(existingMetadata.recommendation_context);
	const existingAssistant = normalizeObject(existingMetadata.ai_assistant);

	const mergedInterests = uniqStrings(
		[
			...(recommendationContext.interests || []),
			...(assistantMemory.learned_interests || []),
			...(learnedContext?.interests || []),
			...(existingRecommendation.interests || []),
			...(existingAssistant.learned_interests || [])
		],
		12
	);
	const mergedFocus = uniqStrings(
		[
			...(recommendationContext.recommendation_focus || []),
			...(learnedContext?.recommendation_focus || []),
			...(existingRecommendation.recommendation_focus || [])
		],
		3
	)
		.map((value) => value.toLowerCase())
		.filter((value) => FOCUS_ALLOWED.has(value));

	const learnedLocation =
		safeTrim(learnedContext?.location) ||
		safeTrim(recommendationContext.location) ||
		safeTrim(assistantMemory.learned_location) ||
		safeTrim(existingRecommendation.location) ||
		safeTrim(existingAssistant.learned_location);

	const nextRecommendation = {
		...existingRecommendation,
		location: learnedLocation || null,
		interests: mergedInterests,
		recommendation_focus: mergedFocus,
		updated_at: new Date().toISOString()
	};

	const nextAssistant = {
		...existingAssistant,
		learned_location: learnedLocation || null,
		learned_interests: mergedInterests,
		recent_topics: uniqStrings(
			[
				...(existingAssistant.recent_topics || []),
				...tokenize(latestUserMessage).slice(0, 8),
				...(historyContext.assistant_topics || [])
			],
			18
		),
		last_navigation_url: navigationTarget?.url || existingAssistant.last_navigation_url || null,
		last_user_message: safeTrim(latestUserMessage).slice(0, 240),
		last_message_at: new Date().toISOString()
	};

	const nextMetadata = {
		...existingMetadata,
		recommendation_context: nextRecommendation,
		ai_assistant: nextAssistant
	};

	if (profile?.id) {
		const { error } = await supabase
			.from('profiles')
			.update({ metadata: nextMetadata })
			.eq('id', profile.id)
			.eq('user_id', user.id);
		if (error) console.warn('assistant context update failed', error);
		return;
	}

	const { error } = await supabase.from('profiles').upsert(
		{
			user_id: user.id,
			email: user.email || null,
			metadata: nextMetadata
		},
		{ onConflict: 'user_id' }
	);
	if (error) console.warn('assistant context upsert failed', error);
}

export async function POST({ request, cookies }) {
	const payload = await request.json().catch(() => null);
	const messages = normalizeMessages(payload?.messages);
	if (!messages.length) {
		return json({ error: 'messages array required' }, { status: 400 });
	}

	const latestUserMessage = extractLatestUserMessage(messages);
	if (!latestUserMessage) {
		return json({ error: 'At least one user message is required.' }, { status: 400 });
	}

	const { supabase, user } = getActivityClient(cookies);
	const [userData, recommendationData] = await Promise.all([
		loadUserData(supabase, user),
		loadRecommendationsData(supabase)
	]);

	const explicitRequestedTypes = detectRequestedTypes(latestUserMessage);
	const inferredArticleIntent = inferArticleIntent(latestUserMessage);
	const requestedTypes = explicitRequestedTypes.includes('article')
		? [...explicitRequestedTypes]
		: inferredArticleIntent !== 'general'
			? ['article', ...explicitRequestedTypes]
			: [...explicitRequestedTypes];
	const navigationTarget = detectCreateIntent(latestUserMessage);
	const hasExplicitNonArticleType = explicitRequestedTypes.some((type) => type !== 'article');
	const forceArticlePrimary =
		requestedTypes[0] === 'article' &&
		inferredArticleIntent !== 'general' &&
		!hasExplicitNonArticleType &&
		!navigationTarget;

	const queryTerms = tokenize(latestUserMessage);
	const interestTerms = uniqStrings(
		[
			...userData.recommendationContext.interests,
			...userData.assistantMemory.learned_interests,
			...tokenize(userData.assistantMemory.recent_topics.join(' '))
		],
		24
	)
		.map((term) => term.toLowerCase())
		.filter(Boolean);

	const historyTerms = uniqStrings(
		[
			...userData.rideHistory.flatMap((entry) => tokenize(entry?.activity?.title || '')),
			...userData.volunteerHistory.flatMap((entry) => tokenize(entry?.event?.title || '')),
			...userData.groupMemberships.flatMap((entry) =>
				tokenize(recommendationData.groupMap.get(String(entry.group_id))?.name || '')
			)
		],
		36
	);

	const locationHint = locationHintFromContext({
		recommendationContext: userData.recommendationContext,
		assistantMemory: userData.assistantMemory
	});
	const locationTerms = normalizeLocationTerms(locationHint);
	const historyContext = buildHistoryContext({
		rideHistory: userData.rideHistory,
		volunteerHistory: userData.volunteerHistory,
		groupMemberships: userData.groupMemberships,
		groupMap: recommendationData.groupMap,
		recommendationContext: userData.recommendationContext,
		assistantMemory: userData.assistantMemory
	});

	const articleRetrieval = await buildHybridArticleCandidates({
		supabase,
		queryText: latestUserMessage,
		profileContext: {
			location: locationHint,
			interests: interestTerms
		},
		locationHint,
		historyTerms,
		feedbackEvents: userData.feedbackEvents,
		userWeights: userData.articleUserWeights,
		limit: 18
	});
	const rerankedArticleCandidates = await rerankArticleCandidatesWithAi({
		latestUserMessage,
		candidates: articleRetrieval.candidates,
		profileContext: userData.recommendationContext,
		historyContext,
		locationHint
	});
	const articleScored = rerankedArticleCandidates.map((candidate) =>
		scoreArticleCandidate(candidate, { requestedTypes, locationHint })
	);

	const scored = recommendationData.items
		.map((item) =>
			scoreItem(item, {
				queryTerms,
				interestTerms,
				historyTerms,
				locationTerms,
				requestedTypes,
				recommendationFocus: new Set(userData.recommendationContext.recommendation_focus),
				affinityGroupIds: new Set(userData.historyGroupIds.map((value) => String(value))),
				now: new Date()
			})
		)
		.map((entry) => {
			if (!forceArticlePrimary || entry.item.type === 'article') return entry;
			let scorePenalty = 4.5;
			if (entry.item.type === 'ride' || entry.item.type === 'volunteer') {
				scorePenalty += 2.5;
			}
			return { ...entry, score: entry.score - scorePenalty };
		})
		.concat(articleScored)
		.sort((a, b) => b.score - a.score);

	const picked = selectRecommendations(scored, requestedTypes);
	const recommendations = picked
		.slice(0, MAX_RECOMMENDATIONS)
		.map((entry) => formatRecommendation(entry, locationHint));

	const aiReply = await generateAssistantReply({
		messages,
		recommendations,
		navigationTarget,
		profileContext: userData.recommendationContext,
		historyContext,
		requestedTypes,
		locationHint
	});

	await persistLearnedAssistantContext({
		supabase,
		user,
		profile: userData.profile,
		recommendationContext: userData.recommendationContext,
		assistantMemory: userData.assistantMemory,
		learnedContext: aiReply.learnedContext,
		latestUserMessage,
		navigationTarget,
		historyContext
	});

	return json({
		reply: aiReply.reply,
		followUpQuestion: aiReply.follow_up_question || null,
		recommendations,
		navigationTarget,
		context: {
			locationHint: locationHint || null,
			articleSignals: {
				intent: inferredArticleIntent,
				retrievalIntent: articleRetrieval.intent,
				forceArticlePrimary,
				userWeights: articleRetrieval.weights || null
			},
			profileSignals: {
				interests: userData.recommendationContext.interests,
				recommendationFocus: userData.recommendationContext.recommendation_focus
			},
			historySignals: historyContext.counts
		}
	});
}
