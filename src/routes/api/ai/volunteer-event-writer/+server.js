import { json } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

export const config = { runtime: 'nodejs20.x', maxDuration: 60 };

const apiKey = env.GENAI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const STYLE_GUIDE = `You are writing event descriptions for a grassroots cycling community. Your audience is a diverse mix of riders: road racers, cargo-bike parents, trail explorers, commuters, and late-night coffee-shop fixie kids. They share a streak of independence and a deep respect for others. Your job is to make them feel the event is alive, worth showing up for, and welcoming to every type of rider.

Voice & Tone
- Playful and a bit rebellious—cheeky metaphors, sly humor, the confidence of someone who rides through a red-gold sunrise.
- Warm and inclusive—make new riders feel invited, not tested.
- Energetic but never salesy—avoid corporate buzzwords or empty hype.
- Use vivid, sensory details (sounds of freewheels, smell of morning asphalt, clink of coffee cups).
- Short, punchy sentences mixed with longer, rolling ones—like a fast group ride with a few breathless sprints.

Content Moves
- Hook: Start with an image or feeling rather than a dry date/time.
- Purpose: In one or two lines, say why this ride matters (fun, fitness, protest, coffee, charity).
- Invitation: Make it clear all riders are welcome—mention multiple motivations (competition, wellness, community).
- Details: Date, time, location, distance, pace. Give them straight, no fluff.
- Call to Action: End with a nudge or wink.

Examples of phrasing: “A sunrise ride with enough miles to wake your legs and enough coffee to keep them humming.” / “No spandex required, just a love of two wheels and a little disregard for alarm clocks.” / “Whether you chase KOMs, conversation, or just the smell of fresh asphalt, this ride’s for you.”`;

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
						event_start: { type: 'string', nullable: true, format: 'date-time' },
						event_end: { type: 'string', nullable: true, format: 'date-time' },
						timezone: { type: 'string', nullable: true },
						location_name: { type: 'string', nullable: true },
						location_address: { type: 'string', nullable: true },
						latitude: { type: 'number', nullable: true },
						longitude: { type: 'number', nullable: true },
						status: { type: 'string', nullable: true },
						contact_email: { type: 'string', nullable: true },
						contact_phone: { type: 'string', nullable: true },
						require_signup_approval: { type: 'boolean', nullable: true },
						waitlist_enabled: { type: 'boolean', nullable: true },
						max_volunteers: { type: 'number', nullable: true }
					}
				},
				opportunities: {
					type: 'array',
					nullable: true,
					items: {
						type: 'object',
						additionalProperties: false,
						properties: {
							title: { type: 'string', nullable: true },
							description: { type: 'string', nullable: true },
							opportunity_type: { type: 'string', nullable: true },
							requires_approval: { type: 'boolean', nullable: true },
							auto_confirm_attendance: { type: 'boolean', nullable: true },
							min_volunteers: { type: 'number', nullable: true },
							max_volunteers: { type: 'number', nullable: true },
							waitlist_limit: { type: 'number', nullable: true },
							location_name: { type: 'string', nullable: true },
							location_notes: { type: 'string', nullable: true },
							tags: {
								type: 'array',
								nullable: true,
								items: { type: 'string' }
							},
							shifts: {
								type: 'array',
								nullable: true,
								items: {
									type: 'object',
									additionalProperties: false,
									properties: {
									starts_at: { type: 'string', nullable: true, format: 'date-time' },
									ends_at: { type: 'string', nullable: true, format: 'date-time' },
										capacity: { type: 'number', nullable: true },
										timezone: { type: 'string', nullable: true },
										location_name: { type: 'string', nullable: true },
										location_address: { type: 'string', nullable: true },
										notes: { type: 'string', nullable: true }
									}
								}
							}
						}
					}
				}
			},
			custom_questions: {
				type: 'array',
				nullable: true,
				items: {
					type: 'object',
					additionalProperties: false,
					properties: {
						field_key: { type: 'string', nullable: true },
						label: { type: 'string', nullable: true },
						help_text: { type: 'string', nullable: true },
						field_type: { type: 'string', nullable: true },
						is_required: { type: 'boolean', nullable: true },
						options: { type: 'array', nullable: true, items: { type: 'string' } }
					}
				}
			},
			emails: {
				type: 'array',
				nullable: true,
				items: {
					type: 'object',
					additionalProperties: false,
					properties: {
						email_type: { type: 'string', nullable: true },
						send_offset_minutes: { type: 'number', nullable: true },
						subject: { type: 'string', nullable: true },
						body: { type: 'string', nullable: true },
						require_confirmation: { type: 'boolean', nullable: true },
						survey_url: { type: 'string', nullable: true }
					}
				}
			}
		}
	}
};

let schemaUnsupported = false;

function isSchemaUnsupportedError(error) {
	if (!error) return false;
	const raw = error?.message;
	if (typeof raw !== 'string') return false;
	try {
		const parsed = JSON.parse(raw);
		const details = parsed?.error;
		const msg = details?.message || '';
		return /response_schema/i.test(msg) || /Invalid JSON payload/i.test(msg);
	} catch {
		return /response_schema/i.test(raw) || /Invalid JSON payload/i.test(raw);
	}
}

async function generateWithSchema({ contents, useSchema = true }) {
	const config = {};
	if (useSchema) config.responseSchema = RESPONSE_SCHEMA;
	return ai.models.generateContent({
		model: 'gemini-2.5-flash',
		contents,
		config: Object.keys(config).length ? config : undefined
	});
}

const DEFAULT_ASSISTANT_NAME = 'Ride Muse';

function formatContext(context) {
	if (!context || typeof context !== 'object') return '';
	const lines = [];
	for (const [key, value] of Object.entries(context)) {
		if (value == null || value === '') continue;
		if (typeof value === 'object') {
			lines.push(`${key}: ${JSON.stringify(value, null, 2)}`);
		} else {
			lines.push(`${key}: ${value}`);
		}
	}
	return lines.length ? `Known event details:\n${lines.join('\n')}` : '';
}

function formatMessages(messages) {
	if (!Array.isArray(messages)) return 'Conversation: (none yet)';
	const parts = [];
	for (const entry of messages) {
		const role = entry?.role === 'assistant' ? DEFAULT_ASSISTANT_NAME : 'Host';
		const content = (entry?.content ?? '').toString().trim();
		if (!content) continue;
		parts.push(`${role}: ${content}`);
	}
	return parts.length ? parts.join('\n') : 'Conversation: (none yet)';
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
		const cleaned = candidate.replace(/^```json\n?|```$/g, '');
		try {
			return JSON.parse(cleaned);
		} catch {
			return null;
		}
	}
}

export const POST = async ({ request }) => {
	if (!ai) {
		return json({ error: 'GENAI_API_KEY not configured.' }, { status: 503 });
	}

	const payload = await request.json().catch(() => null);
	if (!payload || !Array.isArray(payload.messages)) {
		return json({ error: 'messages array required' }, { status: 400 });
	}

	const conversation = formatMessages(payload.messages);
	const contextBlock = formatContext(payload.context);
	const goal = typeof payload.goal === 'string' ? payload.goal : '';
	const constraints = Array.isArray(payload.constraints) ? payload.constraints.join('\n') : '';
	const eventTypeOptions = Array.isArray(payload.event_type_options)
		? payload.event_type_options.filter(Boolean)
		: [];
	const eventTypeCatalog = eventTypeOptions
		.map((option) =>
			`${option?.value ?? ''}${option?.label ? ` (${option.label})` : ''}`.trim()
		)
		.filter(Boolean)
		.join('\n');
	const preferDraft = payload.preferDraft !== false; // default true

	const planner = `You are ${DEFAULT_ASSISTANT_NAME}, an AI co-host helping volunteer event organizers craft high-energy ride listings and supporting materials.
${STYLE_GUIDE}

Responsibilities:
- Ask short follow-up questions when critical details are missing (especially date, time, meetup spot, ride difficulty, capacity limits, equipment expectations, accessibility notes).
- Provide structured suggestions for the Event Builder when the organizer gives enough detail. Include realistic schedules, opportunities, shifts, and reminder emails.
- Keep instructions actionable and friendly. Avoid legal claims or medical advice.
- If the organizer requests help rewriting or brainstorming, respond in the style guide.
${goal ? `\nOrganizer Goal:\n${goal}` : ''}
${constraints ? `\nAdditional Constraints:\n${constraints}` : ''}
${contextBlock ? `\n${contextBlock}` : ''}
${eventTypeCatalog ? `\nEvent type slugs available (value — label):\n${eventTypeCatalog}\nAlways set draft.metadata.event_type_slug to one of these slugs.` : ''}

Return JSON with keys:
- reply: string (your next chat message)
- follow_up_questions: string[] | null (questions you still need answered)
- draft: object | null (only when you can reasonably fill structured fields)
If you cannot produce a draft yet, set draft to null and use follow_up_questions to gather info.
Use full ISO 8601 timestamps with timezone offsets (e.g. 2025-08-14T18:00:00-07:00) for event_start, event_end, and every shift starts_at/ends_at.
Default shift timezones to the event timezone when none is provided and mirror the event meetup location when shift-specific details are missing.
`;

	try {
		const useSchema = !schemaUnsupported;
		const response = await generateWithSchema({
			contents: [planner, conversation, preferDraft ? 'Provide draft suggestions when feasible.' : ''],
			useSchema
		});

		let text = response?.text ?? '';
		if (typeof text === 'function') text = text();
		const parsed = safeParseJson(text);
		if (!parsed) {
			return json({ reply: text || '', follow_up_questions: null, draft: null });
		}

		return json(parsed);
	} catch (error) {
		if (!schemaUnsupported && isSchemaUnsupportedError(error)) {
			schemaUnsupported = true;
			try {
				const fallbackResponse = await generateWithSchema({
					contents: [planner, conversation, preferDraft ? 'Provide draft suggestions when feasible.' : ''],
					useSchema: false
				});

				let text = fallbackResponse?.text ?? '';
				if (typeof text === 'function') text = text();
				const parsed = safeParseJson(text);
				if (!parsed) {
					return json({ reply: text || '', follow_up_questions: null, draft: null });
				}

				return json(parsed);
			} catch (fallbackError) {
				return json({ error: fallbackError?.message || 'AI request failed' }, { status: 500 });
			}
		}

		return json({ error: error?.message || 'AI request failed' }, { status: 500 });
	}
};
