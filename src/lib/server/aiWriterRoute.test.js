import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiWriterRoute } from './aiWriterRoute.js';
import * as groupUpdateWriterRoute from '../../routes/api/ai/group-update-writer/+server.js';
import * as rideWriterRoute from '../../routes/api/ai/ride-writer/+server.js';
import * as volunteerEventWriterRoute from '../../routes/api/ai/volunteer-event-writer/+server.js';

const SAMPLE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['reply'],
	properties: {
		reply: { type: 'string' },
		draft: { type: 'object', nullable: true }
	}
};

let ipCounter = 0;

function nextClientIp() {
	ipCounter += 1;
	return `198.51.100.${ipCounter}`;
}

function createJsonEvent(body, { ip = nextClientIp(), rawBody = null, cookies = {} } = {}) {
	const serialized = rawBody !== null ? rawBody : JSON.stringify(body);
	return {
		request: new Request('https://3fp.org/api/ai/writer', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: serialized
		}),
		cookies: {
			get(name) {
				return cookies[name] ?? null;
			}
		},
		getClientAddress() {
			return ip;
		}
	};
}

function baseOptions(overrides = {}) {
	const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return {
		rateLimit: {
			ipName: `test-writer-ip-${id}`,
			userName: `test-writer-user-${id}`
		},
		responseSchema: SAMPLE_SCHEMA,
		responseMimeType: 'application/json',
		errorLabel: 'Test writer',
		errorMessage: 'Unable to generate draft right now.',
		buildContents(payload) {
			return `Prompt: ${payload.messages.map((m) => m.content).join(' | ')}`;
		},
		normalizePayload(parsed, rawText) {
			return {
				reply: parsed?.reply ?? rawText,
				follow_up_questions: parsed?.follow_up_questions ?? null,
				draft: parsed?.draft ?? null
			};
		},
		...overrides
	};
}

function baseDependencies(overrides = {}) {
	return {
		async resolveVerifiedSession() {
			return { user: { id: 'user-123' }, verified: true };
		},
		isAiModelConfigured() {
			return true;
		},
		getAiConfigurationError() {
			return null;
		},
		requireAiModel() {
			return {
				model: { model: 'gpt-6-luna' },
				client: {
					async generateContent() {
						return { text: '{"reply":"Ready","draft":{"title":"Morning Ride"}}' };
					}
				}
			};
		},
		...overrides
	};
}

test('createAiWriterRoute validates required declarative options including explicit responseMimeType', () => {
	assert.throws(() => createAiWriterRoute(null), /options object is required/);
	assert.throws(
		() => createAiWriterRoute({ ...baseOptions(), rateLimit: { ipName: '', userName: 'u' } }),
		/rateLimit\.ipName/
	);
	assert.throws(
		() => createAiWriterRoute({ ...baseOptions(), responseSchema: null }),
		/responseSchema/
	);

	const withoutMimeType = baseOptions();
	delete withoutMimeType.responseMimeType;
	assert.throws(() => createAiWriterRoute(withoutMimeType), /responseMimeType must be explicitly/);

	assert.throws(
		() => createAiWriterRoute({ ...baseOptions(), responseMimeType: '' }),
		/responseMimeType must be undefined or a non-empty string/
	);
	assert.throws(
		() => createAiWriterRoute({ ...baseOptions(), buildContents: null }),
		/buildContents/
	);
	assert.throws(
		() => createAiWriterRoute({ ...baseOptions(), normalizePayload: null }),
		/normalizePayload/
	);
	assert.throws(() => createAiWriterRoute({ ...baseOptions(), errorLabel: '' }), /errorLabel/);
	assert.throws(() => createAiWriterRoute({ ...baseOptions(), errorMessage: '' }), /errorMessage/);

	assert.equal(
		typeof createAiWriterRoute({ ...baseOptions(), responseMimeType: undefined }),
		'function'
	);
});

test('POST enforces guards in exact order and short-circuits at each failure stage', async () => {
	// 1. IP rate limit short-circuits before session verification
	{
		let sessionCalls = 0;
		const ip = nextClientIp();
		const handler = createAiWriterRoute(
			baseOptions({
				rateLimit: { ipName: 'guard-ip-test', userName: 'guard-user-test', ipLimit: 1 }
			}),
			baseDependencies({
				async resolveVerifiedSession() {
					sessionCalls += 1;
					return { user: { id: 'user-1' } };
				}
			})
		);

		const first = await handler(
			createJsonEvent({ messages: [{ role: 'user', content: 'Hi' }] }, { ip })
		);
		assert.equal(first.status, 200);
		assert.equal(sessionCalls, 1);

		const second = await handler(
			createJsonEvent({ messages: [{ role: 'user', content: 'Hi again' }] }, { ip })
		);
		assert.equal(second.status, 429);
		assert.equal(second.headers.get('cache-control'), 'no-store');
		assert.ok(Number(second.headers.get('retry-after')) >= 1);
		assert.deepEqual(await second.json(), {
			error: 'Too many requests. Please try again later.'
		});
		assert.equal(sessionCalls, 1);
	}

	// 2. Unauthenticated request returns 401 before user rate limit and model check
	{
		const rateLimitCalls = [];
		let modelConfiguredCalled = false;
		const handler = createAiWriterRoute(
			baseOptions({
				rateLimit: { ipName: 'ai-ride-writer-ip', userName: 'ai-ride-writer-user' }
			}),
			baseDependencies({
				enforceRateLimit(_event, config) {
					rateLimitCalls.push(config);
					return null;
				},
				async resolveVerifiedSession() {
					return { user: null, verified: false };
				},
				isAiModelConfigured() {
					modelConfiguredCalled = true;
					return true;
				}
			})
		);

		const response = await handler(createJsonEvent({ messages: [] }));
		assert.equal(response.status, 401);
		assert.deepEqual(await response.json(), { error: 'Authentication required.' });
		assert.deepEqual(rateLimitCalls, [
			{ name: 'ai-ride-writer-ip', limit: 60, windowMs: 10 * 60 * 1000 }
		]);
		assert.equal(modelConfiguredCalled, false);
	}

	// 3. User rate limit uses verified user.id with default 30 / 10m window and short-circuits before model check
	{
		const rateLimitCalls = [];
		let modelConfiguredCalled = false;
		const handler = createAiWriterRoute(
			baseOptions({
				rateLimit: { ipName: 'ai-group-writer-ip', userName: 'ai-group-writer-user', userLimit: 1 }
			}),
			baseDependencies({
				enforceRateLimit(event, config) {
					rateLimitCalls.push(config);
					if (config.key === 'organizer-42' && rateLimitCalls.length >= 4) {
						return new Response(
							JSON.stringify({ error: 'Too many requests. Please try again later.' }),
							{
								status: 429,
								headers: { 'content-type': 'application/json' }
							}
						);
					}
					return null;
				},
				async resolveVerifiedSession() {
					return { user: { id: 'organizer-42' }, verified: true };
				},
				isAiModelConfigured() {
					modelConfiguredCalled = true;
					return true;
				}
			})
		);

		const okResponse = await handler(createJsonEvent({ messages: [] }));
		assert.equal(okResponse.status, 200);
		assert.equal(modelConfiguredCalled, true);

		modelConfiguredCalled = false;
		const limitedResponse = await handler(createJsonEvent({ messages: [] }));
		assert.equal(limitedResponse.status, 429);
		assert.equal(modelConfiguredCalled, false);
		assert.deepEqual(rateLimitCalls[1], {
			name: 'ai-group-writer-user',
			limit: 1,
			windowMs: 10 * 60 * 1000,
			key: 'organizer-42'
		});
	}

	// 4. Unconfigured model returns 503 before reading request body
	{
		let bodyReadCalled = false;
		const handler = createAiWriterRoute(
			baseOptions(),
			baseDependencies({
				isAiModelConfigured(profile) {
					assert.equal(profile, 'structured_text');
					return false;
				},
				getAiConfigurationError(profile) {
					assert.equal(profile, 'structured_text');
					return 'OPENAI_API_KEY not configured.';
				},
				async readJsonBody() {
					bodyReadCalled = true;
					return { ok: true, value: { messages: [] } };
				}
			})
		);

		const response = await handler(createJsonEvent({ messages: [] }));
		assert.equal(response.status, 503);
		assert.deepEqual(await response.json(), { error: 'OPENAI_API_KEY not configured.' });
		assert.equal(bodyReadCalled, false);
	}

	// 5. Oversized (413) and invalid JSON (400) bodies short-circuit before buildContents
	{
		let buildCalled = false;
		const handler = createAiWriterRoute(
			baseOptions({
				buildContents() {
					buildCalled = true;
					return 'unused';
				}
			}),
			baseDependencies()
		);

		const oversizedRaw = JSON.stringify({
			messages: [{ role: 'user', content: 'x'.repeat(130 * 1024) }]
		});
		const tooLarge = await handler(createJsonEvent(null, { rawBody: oversizedRaw }));
		assert.equal(tooLarge.status, 413);
		assert.deepEqual(await tooLarge.json(), { error: 'Request body is too large.' });
		assert.equal(buildCalled, false);

		const badJson = await handler(createJsonEvent(null, { rawBody: '{invalid-json' }));
		assert.equal(badJson.status, 400);
		assert.deepEqual(await badJson.json(), { error: 'Invalid JSON request body.' });
		assert.equal(buildCalled, false);
	}

	// 6. Missing or non-array messages returns 400 before buildContents and requireAiModel
	{
		let buildCalled = false;
		let modelRequired = false;
		const handler = createAiWriterRoute(
			baseOptions({
				buildContents() {
					buildCalled = true;
					return 'unused';
				}
			}),
			baseDependencies({
				requireAiModel() {
					modelRequired = true;
					throw new Error('should not be called');
				}
			})
		);

		for (const invalidBody of [{}, { messages: 'hello' }, null]) {
			const response = await handler(createJsonEvent(invalidBody));
			assert.equal(response.status, 400);
			assert.deepEqual(await response.json(), { error: 'messages array required' });
		}
		assert.equal(buildCalled, false);
		assert.equal(modelRequired, false);
	}
});

test('POST passes string and multi-part array contents unchanged and invokes domain normalizer', async () => {
	// String prompt with application/json
	const stringCalls = [];
	const normalizedInputs = [];
	const stringHandler = createAiWriterRoute(
		baseOptions({
			responseMimeType: 'application/json',
			buildContents(payload, context) {
				assert.equal(context.user.id, 'user-123');
				return `Ride prompt: ${payload.messages[0].content}`;
			},
			normalizePayload(parsed, rawText) {
				normalizedInputs.push({ parsed, rawText });
				return {
					reply: parsed.reply,
					follow_up_questions: ['What pace?'],
					draft: parsed.draft
				};
			}
		}),
		baseDependencies({
			requireAiModel(profile) {
				assert.equal(profile, 'structured_text');
				return {
					model: { model: 'gpt-6-luna' },
					client: {
						async generateContent(call) {
							stringCalls.push(call);
							return { text: '```json\n{"reply":"Sunset loop","draft":{"title":"Loop"}}\n```' };
						}
					}
				};
			}
		})
	);

	const stringRes = await stringHandler(
		createJsonEvent({ messages: [{ role: 'user', content: 'Plan an evening loop' }] })
	);
	assert.equal(stringRes.status, 200);
	assert.deepEqual(await stringRes.json(), {
		reply: 'Sunset loop',
		follow_up_questions: ['What pace?'],
		draft: { title: 'Loop' }
	});
	assert.deepEqual(stringCalls, [
		{
			model: 'gpt-6-luna',
			contents: 'Ride prompt: Plan an evening loop',
			config: {
				responseMimeType: 'application/json',
				responseSchema: SAMPLE_SCHEMA
			}
		}
	]);
	assert.deepEqual(normalizedInputs, [
		{
			parsed: { reply: 'Sunset loop', draft: { title: 'Loop' } },
			rawText: '```json\n{"reply":"Sunset loop","draft":{"title":"Loop"}}\n```'
		}
	]);

	// Multi-part array contents with responseMimeType: undefined and function response.text()
	const arrayCalls = [];
	const multipartContents = [
		'Planner instructions',
		'Host: Need volunteers for bike valet',
		'Provide draft suggestions when feasible.'
	];
	const arrayHandler = createAiWriterRoute(
		baseOptions({
			responseMimeType: undefined,
			buildContents() {
				return multipartContents;
			},
			normalizePayload(parsed, rawText) {
				if (!parsed) return { reply: rawText || '', follow_up_questions: null, draft: null };
				return parsed;
			}
		}),
		baseDependencies({
			requireAiModel() {
				return {
					model: { model: 'gemini-2.5-flash' },
					client: {
						async generateContent(call) {
							arrayCalls.push(call);
							return {
								text() {
									return 'Plain conversational follow-up without JSON';
								}
							};
						}
					}
				};
			}
		})
	);

	const arrayRes = await arrayHandler(
		createJsonEvent({ messages: [{ role: 'user', content: 'Need volunteers' }] })
	);
	assert.equal(arrayRes.status, 200);
	assert.deepEqual(await arrayRes.json(), {
		reply: 'Plain conversational follow-up without JSON',
		follow_up_questions: null,
		draft: null
	});
	assert.equal(arrayCalls.length, 1);
	assert.equal(arrayCalls[0].contents, multipartContents);
	assert.deepEqual(arrayCalls[0].config, { responseSchema: SAMPLE_SCHEMA });
});

test('schema fallback retries once without schema and isolates schemaUnsupported state per factory instance', async () => {
	const groupCalls = [];
	const volunteerCalls = [];
	let volunteerBuildCount = 0;

	const groupHandler = createAiWriterRoute(
		baseOptions({
			responseMimeType: 'application/json',
			errorLabel: 'Group update writer',
			errorMessage: 'Unable to generate an update right now.'
		}),
		baseDependencies({
			requireAiModel() {
				return {
					model: { model: 'gpt-6-luna' },
					client: {
						async generateContent(call) {
							groupCalls.push(call);
							if (call.config?.responseSchema) {
								throw new Error(
									JSON.stringify({
										error: {
											message: 'Invalid JSON payload received. Unknown name "response_schema".'
										}
									})
								);
							}
							return { text: '{"reply":"Group fallback succeeded","draft":null}' };
						}
					}
				};
			}
		})
	);

	const volunteerHandler = createAiWriterRoute(
		baseOptions({
			responseMimeType: undefined,
			errorLabel: 'Volunteer event writer',
			errorMessage: 'Unable to generate an event draft right now.',
			buildContents() {
				volunteerBuildCount += 1;
				return ['planner', 'conversation', ''];
			}
		}),
		baseDependencies({
			requireAiModel() {
				return {
					model: { model: 'gemini-2.5-flash' },
					client: {
						async generateContent(call) {
							volunteerCalls.push(call);
							if (call.config?.responseSchema) {
								throw new Error('response_schema is not supported for this model');
							}
							return { text: '{"reply":"Volunteer fallback succeeded","draft":null}' };
						}
					}
				};
			}
		})
	);

	// Trigger schema rejection on volunteerHandler
	const firstVolunteer = await volunteerHandler(
		createJsonEvent({ messages: [{ role: 'user', content: 'Volunteer event' }] })
	);
	assert.equal(firstVolunteer.status, 200);
	assert.deepEqual(await firstVolunteer.json(), {
		reply: 'Volunteer fallback succeeded',
		follow_up_questions: null,
		draft: null
	});
	assert.equal(volunteerBuildCount, 1, 'buildContents runs once even when fallback retries');
	assert.equal(volunteerCalls.length, 2);
	assert.deepEqual(volunteerCalls[0].config, { responseSchema: SAMPLE_SCHEMA });
	assert.equal(volunteerCalls[1].config, undefined);

	// Subsequent request on volunteerHandler skips schema immediately
	const secondVolunteer = await volunteerHandler(
		createJsonEvent({ messages: [{ role: 'user', content: 'Second turn' }] })
	);
	assert.equal(secondVolunteer.status, 200);
	assert.equal(volunteerCalls.length, 3);
	assert.equal(volunteerCalls[2].config, undefined);

	// Meanwhile, groupHandler still attempts responseSchema first and preserves responseMimeType on fallback
	const firstGroup = await groupHandler(
		createJsonEvent({ messages: [{ role: 'user', content: 'Group news' }] })
	);
	assert.equal(firstGroup.status, 200);
	assert.deepEqual(await firstGroup.json(), {
		reply: 'Group fallback succeeded',
		follow_up_questions: null,
		draft: null
	});
	assert.equal(groupCalls.length, 2);
	assert.deepEqual(groupCalls[0].config, {
		responseMimeType: 'application/json',
		responseSchema: SAMPLE_SCHEMA
	});
	assert.deepEqual(groupCalls[1].config, {
		responseMimeType: 'application/json'
	});
});

test('POST logs route-specific console.error labels and returns 500 on primary and fallback errors', async (t) => {
	const loggedErrors = [];
	t.mock.method(console, 'error', (...args) => {
		loggedErrors.push(args);
	});

	// Primary non-schema failure
	const primaryError = new Error('Upstream provider timeout');
	const rideHandler = createAiWriterRoute(
		baseOptions({
			errorLabel: 'Ride writer',
			errorMessage: 'Unable to generate ride draft right now.'
		}),
		baseDependencies({
			requireAiModel() {
				return {
					model: { model: 'gpt-6-luna' },
					client: {
						async generateContent() {
							throw primaryError;
						}
					}
				};
			}
		})
	);

	const primaryRes = await rideHandler(
		createJsonEvent({ messages: [{ role: 'user', content: 'Plan ride' }] })
	);
	assert.equal(primaryRes.status, 500);
	assert.deepEqual(await primaryRes.json(), {
		error: 'Unable to generate ride draft right now.'
	});
	assert.equal(loggedErrors.length, 1);
	assert.equal(loggedErrors[0][0], 'Ride writer failed');
	assert.equal(loggedErrors[0][1], primaryError);

	// Fallback failure after schema rejection, then subsequent failure once schemaUnsupported is latched
	const schemaError = new Error('Invalid JSON payload: response_schema rejected');
	const fallbackError = new Error('Fallback call failed');
	let groupAttempt = 0;
	const groupHandler = createAiWriterRoute(
		baseOptions({
			errorLabel: 'Group update writer',
			errorMessage: 'Unable to generate an update right now.'
		}),
		baseDependencies({
			requireAiModel() {
				return {
					model: { model: 'gpt-6-luna' },
					client: {
						async generateContent() {
							groupAttempt += 1;
							if (groupAttempt === 1) throw schemaError;
							throw fallbackError;
						}
					}
				};
			}
		})
	);

	const fallbackRes = await groupHandler(
		createJsonEvent({ messages: [{ role: 'user', content: 'Draft update' }] })
	);
	assert.equal(fallbackRes.status, 500);
	assert.deepEqual(await fallbackRes.json(), {
		error: 'Unable to generate an update right now.'
	});
	assert.equal(groupAttempt, 2);
	assert.equal(loggedErrors.length, 2);
	assert.equal(loggedErrors[1][0], 'Group update writer fallback failed');
	assert.equal(loggedErrors[1][1], fallbackError);

	// Next request already has schemaUnsupported = true, so it must not retry a second time
	const thirdRes = await groupHandler(
		createJsonEvent({ messages: [{ role: 'user', content: 'Try again' }] })
	);
	assert.equal(thirdRes.status, 500);
	assert.equal(groupAttempt, 3);
	assert.equal(loggedErrors.length, 3);
	assert.equal(loggedErrors[2][0], 'Group update writer failed');
	assert.equal(loggedErrors[2][1], fallbackError);
});

test('all three AI writer +server.js modules retain maxDuration config and export factory POST handlers', () => {
	for (const routeModule of [groupUpdateWriterRoute, rideWriterRoute, volunteerEventWriterRoute]) {
		assert.deepEqual(routeModule.config, { maxDuration: 60 });
		assert.equal(typeof routeModule.POST, 'function');
	}
});
