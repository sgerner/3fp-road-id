import { json } from '@sveltejs/kit';
import { isAiModelConfigured, requireAiModel } from '$lib/server/ai/models';

export const config = { runtime: 'nodejs20.x', maxDuration: 60 };

let schemaUnsupported = false;

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
				metadata: {
					type: 'object',
					nullable: true,
					additionalProperties: false,
					properties: {
						title: { type: 'string', nullable: true },
						summary: { type: 'string', nullable: true },
						description: { type: 'string', nullable: true },
						status: { type: 'string', nullable: true },
						timezone: { type: 'string', nullable: true },
						starts_at: { type: 'string', nullable: true, format: 'date-time' },
						ends_at: { type: 'string', nullable: true, format: 'date-time' },
						start_location_name: { type: 'string', nullable: true },
						start_location_address: { type: 'string', nullable: true },
						start_latitude: { type: 'number', nullable: true },
						start_longitude: { type: 'number', nullable: true },
						end_location_name: { type: 'string', nullable: true },
						end_location_address: { type: 'string', nullable: true },
						end_latitude: { type: 'number', nullable: true },
						end_longitude: { type: 'number', nullable: true }
					}
				},
				ride: {
					type: 'object',
					nullable: true,
					additionalProperties: false,
					properties: {
						participant_visibility: { type: 'string', nullable: true },
						estimated_distance_miles: { type: 'number', nullable: true },
						estimated_duration_minutes: { type: 'number', nullable: true },
						elevation_gain_feet: { type: 'number', nullable: true },
						pace_notes: { type: 'string', nullable: true },
						is_no_drop: { type: 'boolean', nullable: true },
						surface_types: {
							type: 'array',
							nullable: true,
							items: { type: 'string' }
						},
						bike_suitability: {
							type: 'array',
							nullable: true,
							items: { type: 'string' }
						},
						accessibility_notes: { type: 'string', nullable: true },
						waiver_required: { type: 'boolean', nullable: true },
						difficulty_labels: {
							type: 'array',
							nullable: true,
							items: { type: 'string' }
						},
						riding_disciplines: {
							type: 'array',
							nullable: true,
							items: { type: 'string' }
						}
					}
				},
				recurrence: {
					type: 'object',
					nullable: true,
					additionalProperties: false,
					properties: {
						enabled: { type: 'boolean', nullable: true },
						frequency: { type: 'string', nullable: true },
						interval_count: { type: 'number', nullable: true },
						by_weekdays: {
							type: 'array',
							nullable: true,
							items: { type: 'number' }
						},
						by_set_positions: {
							type: 'array',
							nullable: true,
							items: { type: 'number' }
						},
						until_on: { type: 'string', nullable: true }
					}
				},
				email_templates: {
					type: 'array',
					nullable: true,
					items: {
						type: 'object',
						additionalProperties: false,
						properties: {
							name: { type: 'string', nullable: true },
							template_type: { type: 'string', nullable: true },
							send_offset_minutes: { type: 'number', nullable: true },
							subject: { type: 'string', nullable: true },
							body: { type: 'string', nullable: true }
						}
					}
				}
			}
		}
	}
};

function formatContext(context) {
	if (!context || typeof context !== 'object') return '';
	return Object.entries(context)
		.filter(([, value]) => value !== null && value !== undefined && value !== '')
		.map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
		.join('\n');
}

function formatMessages(messages) {
	if (!Array.isArray(messages)) return '';
	return messages
		.map((message) => {
			const role = message?.role === 'assistant' ? 'Ride Muse' : 'Organizer';
			const content = String(message?.content || '').trim();
			return content ? `${role}: ${content}` : '';
		})
		.filter(Boolean)
		.join('\n');
}

function safeParseJson(text) {
	if (!text) return null;
	const first = text.indexOf('{');
	const last = text.lastIndexOf('}');
	if (first === -1 || last === -1 || last <= first) return null;
	const candidate = text.slice(first, last + 1);
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

async function generateRideDraft({ prompt, useSchema = true }) {
	const { ai, model } = requireAiModel('structured_text');
	const config = {};
	if (useSchema) config.responseSchema = RESPONSE_SCHEMA;
	config.responseMimeType = 'application/json';
	return ai.models.generateContent({
		model: model.model,
		contents: prompt,
		config
	});
}

function normalizeAiPayload(parsed, rawText = '') {
	const draft = parsed?.draft ?? null;
	const followUpQuestions = Array.isArray(parsed?.follow_up_questions)
		? parsed.follow_up_questions.filter((item) => typeof item === 'string' && item.trim())
		: null;
	const reply =
		typeof parsed?.reply === 'string' && parsed.reply.trim()
			? parsed.reply.trim()
			: rawText.trim() ||
				(draft
					? 'Draft is ready. Review it, tweak anything you want, then apply it to the form.'
					: 'I need a little more detail to turn this into a ride draft.');

	return {
		reply,
		follow_up_questions: followUpQuestions,
		draft
	};
}

export async function POST({ request }) {
	if (!isAiModelConfigured('structured_text')) {
		return json({ error: 'GENAI_API_KEY not configured.' }, { status: 503 });
	}

	const payload = await request.json().catch(() => null);
	if (!payload || !Array.isArray(payload.messages)) {
		return json({ error: 'messages array required' }, { status: 400 });
	}

	const prompt = `
You are Ride Muse, a concise and witty AI co-planner for community bike rides.

Style:
- Be fun, vivid, and warm.
- Keep generated ride copy succinct.
- Prefer clean, useful specifics over hype.
- Ask short follow-up questions only when essential details are missing.

Required ride planning priorities:
- Start time, end time or duration, and meetup location.
- Difficulty labels from: Beginner, Casual, Challenging, Expert, Uncategorized.
- Route discipline, surface type, bike suitability, and whether the ride is drop or no-drop.
- Mention accessibility notes and waiver needs when relevant.
- When recurrence is described, convert it into either a weekly or monthly pattern using weekdays (1=Mon ... 7=Sun) and optional set positions (1,2,3,4,-1).
- Reminder email copy should be brief and practical.

Conversation:
${formatMessages(payload.messages)}

Known context:
${formatContext(payload.context)}

Respond with JSON matching the schema.`;

	try {
		const response = await generateRideDraft({
			prompt,
			useSchema: !schemaUnsupported
		});

		let text = response?.text ?? '';
		if (typeof text === 'function') text = text();
		const parsed = safeParseJson(text);
		return json(normalizeAiPayload(parsed, text));
	} catch (error) {
		if (!schemaUnsupported && isSchemaUnsupportedError(error)) {
			schemaUnsupported = true;
			try {
				const fallbackResponse = await generateRideDraft({
					prompt,
					useSchema: false
				});
				let text = fallbackResponse?.text ?? '';
				if (typeof text === 'function') text = text();
				const parsed = safeParseJson(text);
				return json(normalizeAiPayload(parsed, text));
			} catch (fallbackError) {
				console.error('Ride writer fallback failed', fallbackError);
				return json({ error: 'Unable to generate ride draft right now.' }, { status: 500 });
			}
		}

		console.error('Ride writer failed', error);
		return json({ error: 'Unable to generate ride draft right now.' }, { status: 500 });
	}
}
