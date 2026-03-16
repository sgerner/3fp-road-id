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
