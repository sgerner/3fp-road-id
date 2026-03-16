import {
	getAiConfigurationError,
	isAiModelConfigured,
	requireAiModel
} from '$lib/server/ai/models';

const RESPONSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['caption'],
	properties: {
		caption: { type: 'string' }
	}
};

const COMMENT_REPLY_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['reply'],
	properties: {
		reply: { type: 'string' }
	}
};

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
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
		return null;
	}
}

function buildPrompt(input = {}) {
	const sections = [];
	const pairs = [
		['Group name', input.group_name],
		['Event title', input.event_title],
		['Event date/time', input.event_datetime],
		['Location', input.event_location],
		['Ride details', input.ride_details],
		['Advocacy details', input.advocacy_details],
		['Tone', input.target_tone],
		['Platforms', Array.isArray(input.platforms) ? input.platforms.join(', ') : input.platforms],
		['Call to action', input.call_to_action],
		['Hashtags', input.hashtags]
	];

	for (const [label, value] of pairs) {
		const cleaned = cleanText(value, 600);
		if (!cleaned) continue;
		sections.push(`${label}: ${cleaned}`);
	}

	return `You write social media captions for local bike groups.
Style requirements:
- Friendly, specific, and community-focused.
- Avoid spammy language and excessive punctuation.
- Keep it concise and action-oriented.
- Mention practical event details only when explicitly provided in the context.
- If a call to action is provided, include it naturally.
- Never invent facts that are not present in the provided context.
- Do not fabricate dates, times, locations, meeting points, rides, or events.
- If details are missing, keep the caption general and truthful.

Generate one caption only.
Return strict JSON: {"caption":"..."}.

Context:
${sections.join('\n')}`;
}

export async function generateGroupSocialCaptionDraft(input = {}) {
	if (!isAiModelConfigured('structured_text')) {
		return {
			ok: false,
			error: getAiConfigurationError('structured_text')
		};
	}

	const prompt = buildPrompt(input);
	const { client, model } = requireAiModel('structured_text');
	const response = await client.generateContent({
		model: model.model,
		contents: prompt,
		config: {
			responseMimeType: 'application/json',
			responseSchema: RESPONSE_SCHEMA
		}
	});

	let text = response?.text ?? '';
	if (typeof text === 'function') text = text();
	const parsed = safeParseJson(text);
	const caption = cleanText(parsed?.caption || text, 4000);
	if (!caption) {
		return {
			ok: false,
			error: 'AI did not return a usable caption.'
		};
	}

	return {
		ok: true,
		caption,
		prompt
	};
}

function buildCommentReplyPrompt(input = {}) {
	const groupName = cleanText(input.group_name, 200);
	const platform = cleanText(input.platform, 80);
	const commentText = cleanText(input.comment_text, 1600);
	const postCaption = cleanText(input.post_caption, 1600);
	const postContext = cleanText(input.post_context, 600);
	const tone = cleanText(input.target_tone, 120) || 'Friendly, helpful, and concise';

	return `You write social media comment replies for local bike advocacy groups.
Task:
- Draft exactly one short public reply to a comment.
- Keep it respectful, human, and specific to the comment.
- Avoid making up facts, dates, locations, links, promotions, or events.
- Do not mention direct messages or private contact.
- No hashtags unless the user explicitly asked for them.
- Aim for 1-3 sentences and under 300 characters.

Return strict JSON: {"reply":"..."}.

Context:
Group: ${groupName || 'Local bike group'}
Platform: ${platform || 'social'}
Desired tone: ${tone}
Original comment: ${commentText || 'N/A'}
Related post caption: ${postCaption || 'N/A'}
Related post context: ${postContext || 'N/A'}`;
}

export async function generateGroupSocialCommentReplyDraft(input = {}) {
	if (!isAiModelConfigured('structured_text')) {
		return {
			ok: false,
			error: getAiConfigurationError('structured_text')
		};
	}

	const prompt = buildCommentReplyPrompt(input);
	const { client, model } = requireAiModel('structured_text');
	const response = await client.generateContent({
		model: model.model,
		contents: prompt,
		config: {
			responseMimeType: 'application/json',
			responseSchema: COMMENT_REPLY_SCHEMA
		}
	});

	let text = response?.text ?? '';
	if (typeof text === 'function') text = text();
	const parsed = safeParseJson(text);
	const reply = cleanText(parsed?.reply || text, 2200);
	if (!reply) {
		return {
			ok: false,
			error: 'AI did not return a usable reply.'
		};
	}

	return {
		ok: true,
		reply,
		prompt
	};
}
