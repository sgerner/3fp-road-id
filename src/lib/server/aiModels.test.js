import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildOpenAiInput,
	buildOpenAiResponseBody,
	createOpenAiTextProviderClient,
	extractOpenAiText,
	OPENAI_GPT_56_LUNA_MODEL,
	OPENAI_RESPONSES_ENDPOINT
} from './ai/openai.js';
import {
	IMAGE_GENERATION_MODEL_IDS,
	normalizeSocialImageGenerationModelId
} from '../ai/imageGenerationModels.js';

test('OpenAI text requests use the Responses API and Luna xhigh reasoning', () => {
	const body = buildOpenAiResponseBody({
		model: OPENAI_GPT_56_LUNA_MODEL,
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

	assert.equal(body.model, OPENAI_GPT_56_LUNA_MODEL);
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
		model: OPENAI_GPT_56_LUNA_MODEL,
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
