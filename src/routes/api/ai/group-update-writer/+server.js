import { createAiWriterRoute } from '#lib/server/aiWriterRoute.js';

export const config = { maxDuration: 60 };

const MAX_MESSAGE_COUNT = 16;
const MAX_MESSAGE_LENGTH = 1200;
const STYLE_PRESETS = {
	quick_bulletin: {
		label: 'Quick bulletin',
		guidance:
			'Direct, compact, factual, and easy to scan. Prioritize the key change first and keep the copy tight.'
	},
	warm_community: {
		label: 'Warm community',
		guidance: 'Friendly, welcoming, and human. Keep it polished but still concise and clear.'
	},
	energy_boost: {
		label: 'Energy boost',
		guidance:
			'Upbeat and lively without sounding spammy. Good for launches, recaps, and celebratory updates.'
	},
	action_focused: {
		label: 'Action focused',
		guidance: 'Organized around next steps, deadlines, links, and what members need to do now.'
	}
};

const RESPONSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['reply'],
	properties: {
		reply: { type: 'string' },
		follow_up_questions: {
			type: 'array',
			nullable: true,
			items: { type: 'string' }
		},
		draft: {
			type: 'object',
			nullable: true,
			additionalProperties: false,
			properties: {
				title: { type: 'string', nullable: true },
				summary: { type: 'string', nullable: true },
				body_markdown: { type: 'string', nullable: true }
			}
		}
	}
};

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function normalizeMessages(messages) {
	if (!Array.isArray(messages)) return [];
	const normalized = [];
	for (const raw of messages) {
		if (!raw || typeof raw !== 'object') continue;
		const role = raw.role === 'assistant' ? 'assistant' : raw.role === 'user' ? 'user' : null;
		if (!role) continue;
		const content = safeTrim(raw.content).slice(0, MAX_MESSAGE_LENGTH);
		if (!content) continue;
		normalized.push({ role, content });
		if (normalized.length >= MAX_MESSAGE_COUNT) break;
	}
	return normalized;
}

function normalizeContext(context) {
	if (!context || typeof context !== 'object' || Array.isArray(context)) return {};
	const group = context.group && typeof context.group === 'object' ? context.group : {};
	const draft = context.draft && typeof context.draft === 'object' ? context.draft : {};

	return {
		group_name: safeTrim(group.name).slice(0, 120),
		group_location: [safeTrim(group.city), safeTrim(group.state)]
			.filter(Boolean)
			.join(', ')
			.slice(0, 120),
		group_summary: safeTrim(group.description || group.short_description || '').slice(0, 500),
		current_title: safeTrim(draft.title).slice(0, 180),
		current_summary: safeTrim(draft.summary).slice(0, 500),
		current_body_markdown: safeTrim(draft.body_markdown).slice(0, 8000)
	};
}

function formatContext(context) {
	return Object.entries(context)
		.filter(([, value]) => value)
		.map(([key, value]) => `${key}: ${value}`)
		.join('\n');
}

function formatMessages(messages) {
	if (!messages.length) return '';
	return messages
		.map((message) => {
			const speaker = message.role === 'assistant' ? 'Update Muse' : 'Owner';
			return `${speaker}: ${message.content}`;
		})
		.join('\n');
}

function buildPrompt(payload) {
	const messages = normalizeMessages(payload.messages);
	const context = normalizeContext(payload.context);
	const stylePreset = STYLE_PRESETS[safeTrim(payload.style_preset).toLowerCase()]
		? safeTrim(payload.style_preset).toLowerCase()
		: 'warm_community';
	const style = STYLE_PRESETS[stylePreset];

	return `
You are Update Muse, an expert editorial assistant helping group owners draft polished public updates for their group page.

Your job:
- Draft clean, beautiful, publish-ready update copy.
- Revise the draft when the owner asks for changes.
- Preserve real details from the conversation and current draft context.
- Never invent dates, links, locations, or logistics that were not provided.

Output rules:
- Return JSON matching the schema.
- Put the ready-to-publish headline in draft.title.
- Put a short preview blurb in draft.summary. 1 to 2 sentences, max 240 characters when possible.
- Put the full formatted content in draft.body_markdown.
- Use tasteful markdown formatting: short headings only when useful, bullet lists for logistics, bold for key details, links when given.
- Do not use code fences, frontmatter, emojis, or fake placeholders like [insert link].
- Keep the copy concise. Most updates should be readable in under a minute.
- When revising, improve the current draft instead of starting from scratch unless the owner asks for a different direction.

Style preset:
- ${style.label}: ${style.guidance}

Conversation:
${formatMessages(messages)}

Known context:
${formatContext(context)}

Respond with JSON only.`;
}

function normalizeAiPayload(parsed, rawText = '') {
	const draftSource = parsed?.draft && typeof parsed.draft === 'object' ? parsed.draft : null;
	const draft = draftSource
		? {
				title: safeTrim(draftSource.title) || null,
				summary:
					typeof draftSource.summary === 'string' ? draftSource.summary.trim().slice(0, 400) : null,
				body_markdown:
					typeof draftSource.body_markdown === 'string' ? draftSource.body_markdown.trim() : null
			}
		: null;
	const followUpQuestions = Array.isArray(parsed?.follow_up_questions)
		? parsed.follow_up_questions
				.map((item) => safeTrim(item))
				.filter(Boolean)
				.slice(0, 4)
		: null;
	const reply =
		safeTrim(parsed?.reply) ||
		rawText.trim() ||
		(draft
			? 'I drafted an update and applied it to the editor. Ask for changes if you want a different angle.'
			: 'I need a little more detail before I can draft the update.');

	return {
		reply,
		follow_up_questions: followUpQuestions,
		draft
	};
}

export const POST = createAiWriterRoute({
	rateLimit: {
		ipName: 'ai-group-writer-ip',
		userName: 'ai-group-writer-user'
	},
	responseSchema: RESPONSE_SCHEMA,
	responseMimeType: 'application/json',
	errorLabel: 'Group update writer',
	errorMessage: 'Unable to generate an update right now.',
	buildContents: buildPrompt,
	normalizePayload: normalizeAiPayload
});
