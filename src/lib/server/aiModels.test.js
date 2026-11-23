import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildOpenAiInput,
	buildOpenAiResponseBody,
	createOpenAiTextProviderClient,
	extractOpenAiText,
	extractOpenAiToolCalls,
	OPENAI_GPT_6_LUNA_MODEL,
	OPENAI_RESPONSES_ENDPOINT
} from './ai/openai.js';
import {
	createGoogleTextProviderClient as createGoogleProviderClient,
	normalizeGeminiGenerationConfig,
	runBoundedToolLoop
} from './ai/toolLoop.js';
import {
	IMAGE_GENERATION_MODEL_IDS,
	normalizeSocialImageGenerationModelId
} from '../ai/imageGenerationModels.js';

test('OpenAI text requests use the Responses API and Luna xhigh reasoning', () => {
	const body = buildOpenAiResponseBody({
		model: OPENAI_GPT_6_LUNA_MODEL,
		contents: ['First instruction', { text: 'Second instruction' }],
		config: {
			responseMimeType: 'application/json',
			responseSchema: {
				type: 'object',
				properties: {
					caption: { type: 'string' },
					optional_note: { type: 'string', nullable: true }
				}
			}
		}
	});

	assert.equal(body.model, OPENAI_GPT_6_LUNA_MODEL);
	assert.equal(body.input, 'First instruction\n\nSecond instruction');
	assert.equal(body.store, false);
	assert.deepEqual(body.reasoning, { effort: 'xhigh' });
	assert.equal(body.text.format.type, 'json_schema');
	assert.deepEqual(body.text.format.schema.required, ['caption', 'optional_note']);
	assert.equal(body.text.format.schema.additionalProperties, false);
	assert.deepEqual(body.text.format.schema.properties.optional_note.type, ['string', 'null']);
});

test('OpenAI input normalization preserves message content', () => {
	assert.equal(
		buildOpenAiInput([
			{ role: 'user', content: 'What should I ride?' },
			{ role: 'assistant', content: 'A short local loop.' }
		]),
		'What should I ride?\n\nA short local loop.'
	);
});

test('OpenAI provider extracts Responses output and sends the expected request', async () => {
	let request;
	const client = createOpenAiTextProviderClient('test-key', async (url, options) => {
		request = { url, options };
		return {
			ok: true,
			async json() {
				return {
					output: [
						{ type: 'reasoning', content: [] },
						{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }
					]
				};
			}
		};
	});

	const response = await client.generateContent({
		model: OPENAI_GPT_6_LUNA_MODEL,
		contents: 'Return JSON.',
		config: { responseMimeType: 'application/json' }
	});

	assert.equal(request.url, OPENAI_RESPONSES_ENDPOINT);
	assert.equal(request.options.headers.Authorization, 'Bearer test-key');
	assert.equal(JSON.parse(request.options.body).text.format.type, 'json_object');
	assert.equal(response.text, '{"ok":true}');
});

test('retired Gemini image preview ids normalize to the stable image model', () => {
	assert.equal(
		normalizeSocialImageGenerationModelId(IMAGE_GENERATION_MODEL_IDS.GEMINI_31_FLASH_IMAGE_PREVIEW),
		IMAGE_GENERATION_MODEL_IDS.GEMINI_31_FLASH_IMAGE
	);
});

test('OpenAI provider runs bounded tool calls at low reasoning effort without empty-text errors', async () => {
	const requests = [];
	const client = createOpenAiTextProviderClient('test-key', async (_url, options) => {
		const body = JSON.parse(options.body);
		requests.push(body);
		if (requests.length === 1) {
			return {
				ok: true,
				async json() {
					return {
						output: [
							{ type: 'reasoning', content: [] },
							{
								type: 'function_call',
								call_id: 'call_route_1',
								name: 'select_route',
								arguments: '{"route_key":"roadid","reason":null}'
							}
						]
					};
				}
			};
		}
		return {
			ok: true,
			async json() {
				return {
					output: [
						{
							type: 'message',
							content: [{ type: 'output_text', text: '{"reply":"Open /roadid."}' }]
						}
					]
				};
			}
		};
	});

	const sharedTools = [
		{
			functionDeclarations: [
				{
					name: 'select_route',
					description: 'Pick a route.',
					parameters: {
						type: 'object',
						properties: {
							route_key: { type: 'string' },
							reason: { type: 'string', nullable: true }
						}
					}
				}
			]
		}
	];

	const result = await runBoundedToolLoop({
		client,
		model: { provider: 'openai', model: OPENAI_GPT_6_LUNA_MODEL },
		prompt: 'Set up Road ID',
		tools: sharedTools,
		reasoningEffort: 'low',
		responseMimeType: 'application/json',
		executeTool: async (call) => ({ selected: call.args.route_key })
	});

	assert.equal(requests.length, 2);
	assert.deepEqual(requests[0].reasoning, { effort: 'low' });
	assert.equal(requests[0].tools[0].name, 'select_route');
	assert.deepEqual(requests[1].reasoning, { effort: 'low' });
	assert.ok(
		requests[1].input.some(
			(item) => item.type === 'function_call_output' && item.call_id === 'call_route_1'
		)
	);
	assert.equal(result.rounds, 2);
	assert.equal(result.toolCalls.length, 1);
	assert.equal(result.text, '{"reply":"Open /roadid."}');
	assert.equal(extractOpenAiToolCalls({ output: [] }).length, 0);
});

test('Google provider runs bounded tool calls at LOW thinkingLevel and preserves shared tool schemas', async () => {
	const calls = [];
	const sharedTools = [
		{
			functionDeclarations: [
				{
					name: 'search_groups',
					description: 'Search groups.',
					parameters: {
						type: 'object',
						properties: {
							city: { type: 'string', nullable: true },
							state: { type: 'string', nullable: true }
						}
					}
				}
			]
		}
	];

	const normalized = normalizeGeminiGenerationConfig({
		reasoningEffort: 'low',
		tools: sharedTools
	});
	assert.deepEqual(normalized.thinkingConfig, { thinkingLevel: 'LOW' });
	assert.equal('reasoningEffort' in normalized, false);
	// Simulate @google/genai in-place mutation on normalized.tools and verify sharedTools is untouched
	normalized.tools[0].functionDeclarations[0].parameters.type = 'OBJECT';
	assert.equal(sharedTools[0].functionDeclarations[0].parameters.type, 'object');

	const googleClient = createGoogleProviderClient({
		models: {
			async generateContent({ model, contents, config }) {
				calls.push({ model, contents, config });
				if (calls.length === 1) {
					return {
						candidates: [
							{
								content: {
									role: 'model',
									parts: [
										{ thought: true, text: 'Selecting Madison search' },
										{
											functionCall: {
												id: 'gem_call_1',
												name: 'search_groups',
												args: { city: 'Madison', state: 'WI' }
											},
											thoughtSignature: 'sig-123'
										}
									]
								}
							}
						]
					};
				}
				return {
					candidates: [
						{
							content: {
								role: 'model',
								parts: [{ text: '{"reply":"Found Madison Bikes, Inc."}' }]
							}
						}
					]
				};
			}
		}
	});

	const result = await runBoundedToolLoop({
		client: googleClient,
		model: { provider: 'google', model: 'gemini-4-hydrogen' },
		prompt: 'Cycling groups in Madison, WI',
		tools: sharedTools,
		reasoningEffort: 'low',
		responseMimeType: 'application/json',
		executeTool: async (call) => ({ groups: [{ city: call.args.city, state: call.args.state }] })
	});

	assert.equal(calls.length, 2);
	assert.deepEqual(calls[0].config.thinkingConfig, { thinkingLevel: 'LOW' });
	assert.deepEqual(calls[1].config.thinkingConfig, { thinkingLevel: 'LOW' });
	assert.equal(calls[1].contents[1].parts[1].thoughtSignature, 'sig-123');
	assert.equal(calls[1].contents[2].parts[0].functionResponse.name, 'search_groups');
	assert.equal(result.rounds, 2);
	assert.equal(result.text, '{"reply":"Found Madison Bikes, Inc."}');
});
