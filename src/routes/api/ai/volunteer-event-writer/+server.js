import { json } from '@sveltejs/kit';
import {
	getAiConfigurationError,
	isAiModelConfigured,
	requireAiModel
} from '$lib/server/ai/models';
import { enforceRateLimit, readJsonBody } from '$lib/server/security';
import { resolveVerifiedSession } from '$lib/server/session';

export const config = { maxDuration: 60 };

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
	const { client, model } = requireAiModel('structured_text');
	const config = {};
	if (useSchema) config.responseSchema = RESPONSE_SCHEMA;
	return client.generateContent({
		model: model.model,
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
	return lines.length ? `Known event details:\n${lines.join('\n')}`.slice(0, 24_000) : '';
}

function formatMessages(messages) {
	if (!Array.isArray(messages)) return 'Conversation: (none yet)';
	const parts = [];
	for (const entry of messages.slice(0, 16)) {
		const role = entry?.role === 'assistant' ? DEFAULT_ASSISTANT_NAME : 'Host';
		const content = (entry?.content ?? '').toString().trim().slice(0, 1_200);
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

function normalizeAiPayload(parsed) {
	if (!parsed || typeof parsed !== 'object') return parsed;

	const reply = parsed.reply;
	if (typeof reply !== 'string') return parsed;

	const nested = safeParseJson(reply);
	if (!nested || typeof nested !== 'object') return parsed;

	if (
		typeof nested.reply === 'string' ||
		Object.prototype.hasOwnProperty.call(nested, 'follow_up_questions') ||
		Object.prototype.hasOwnProperty.call(nested, 'draft')
	) {
		return nested;
	}

	return parsed;
}

export const POST = async (event) => {
	const { request, cookies } = event;
	const limitedByIp = enforceRateLimit(event, {
		name: 'ai-volunteer-writer-ip',
		limit: 60,
		windowMs: 10 * 60 * 1000
	});
	if (limitedByIp) return limitedByIp;
	const { user } = await resolveVerifiedSession(cookies);
	if (!user?.id) return json({ error: 'Authentication required.' }, { status: 401 });
	const limited = enforceRateLimit(event, {
		name: 'ai-volunteer-writer-user',
		limit: 30,
		windowMs: 10 * 60 * 1000,
		key: user.id
	});
	if (limited) return limited;

	if (!isAiModelConfigured('structured_text')) {
		return json({ error: getAiConfigurationError('structured_text') }, { status: 503 });
	}

	const parsedBody = await readJsonBody(request, { maxBytes: 128 * 1024 });
	if (!parsedBody.ok) return json({ error: parsedBody.error }, { status: parsedBody.status });
	const payload = parsedBody.value;
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
		.map((option) => `${option?.value ?? ''}${option?.label ? ` (${option.label})` : ''}`.trim())
		.filter(Boolean)
		.join('\n');
	const opportunityTypeOptions = Array.isArray(payload.opportunity_type_options)
		? payload.opportunity_type_options.filter(Boolean)
		: [];
	const opportunityTypeCatalog = opportunityTypeOptions
		.map((option) => `${option?.value ?? ''}${option?.label ? ` (${option.label})` : ''}`.trim())
		.filter(Boolean)
		.join('\n');
	const emailMergeTags = Array.isArray(payload.email_merge_tags)
		? payload.email_merge_tags.filter(Boolean)
		: [];
	const preferDraft = payload.preferDraft !== false; // default true

	const planner = `You are ${DEFAULT_ASSISTANT_NAME}, an AI co-host helping volunteer event organizers craft high-energy ride listings and supporting materials.
${STYLE_GUIDE}

Responsibilities:
- Ask short follow-up questions when critical details are missing (especially date, time, meetup spot, ride difficulty, capacity limits, equipment expectations, accessibility notes).
- Provide structured suggestions for the Event Builder when the organizer gives enough detail. Include realistic schedules, opportunities, shifts, and reminder emails.
- Populate metadata.event_start and metadata.event_end whenever timing information is available, and ensure shift windows align with the event when unspecified.
- Choose opportunity_type values for activities from the allowed list so they align with the host's description.
- Leave metadata.host_group_id untouched unless the organizer explicitly confirms a change.
- Set metadata.location_name to the full street address. Place additional wayfinding details in metadata.location_address (or metadata.location_notes when available).
- Keep instructions actionable and friendly. Avoid legal claims or medical advice.
- If the organizer requests help rewriting or brainstorming, respond in the style guide.
${goal ? `\nOrganizer Goal:\n${goal}` : ''}
${constraints ? `\nAdditional Constraints:\n${constraints}` : ''}
${contextBlock ? `\n${contextBlock}` : ''}
${eventTypeCatalog ? `\nEvent type slugs available (value — label):\n${eventTypeCatalog}\nAlways set draft.metadata.event_type_slug to one of these slugs.` : ''}
${opportunityTypeCatalog ? `\nOpportunity type values available (value — label):\n${opportunityTypeCatalog}\nAlways set draft.opportunities[*].opportunity_type to one of these values.` : ''}
${emailMergeTags.length ? `\nEmail merge tags available for templated copy: ${emailMergeTags.join(', ')}.` : ''}

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
			contents: [
				planner,
				conversation,
				preferDraft ? 'Provide draft suggestions when feasible.' : ''
			],
			useSchema
		});

		let text = response?.text ?? '';
		if (typeof text === 'function') text = text();
		const parsed = normalizeAiPayload(safeParseJson(text));
		if (!parsed) {
			return json({ reply: text || '', follow_up_questions: null, draft: null });
		}

		return json(parsed);
	} catch (error) {
		if (!schemaUnsupported && isSchemaUnsupportedError(error)) {
			schemaUnsupported = true;
			try {
				const fallbackResponse = await generateWithSchema({
					contents: [
						planner,
						conversation,
						preferDraft ? 'Provide draft suggestions when feasible.' : ''
					],
					useSchema: false
				});

				let text = fallbackResponse?.text ?? '';
				if (typeof text === 'function') text = text();
				const parsed = normalizeAiPayload(safeParseJson(text));
				if (!parsed) {
					return json({ reply: text || '', follow_up_questions: null, draft: null });
				}

				return json(parsed);
			} catch (fallbackError) {
				console.error('Volunteer event writer fallback failed', fallbackError);
				return json({ error: 'Unable to generate an event draft right now.' }, { status: 500 });
			}
		}

		console.error('Volunteer event writer failed', error);
		return json({ error: 'Unable to generate an event draft right now.' }, { status: 500 });
	}
};
