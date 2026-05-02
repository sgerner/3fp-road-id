import { GoogleGenAI } from '@google/genai';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { env } from '$env/dynamic/private';
import { IMAGE_GENERATION_MODEL_IDS } from '$lib/ai/imageGenerationModels';

export const AI_CAPABILITIES = {
	TEXT_GENERATION: 'text_generation',
	STRUCTURED_OUTPUT: 'structured_output',
	TOOL_USE: 'tool_use',
	WEB_SEARCH: 'web_search',
	URL_CONTEXT: 'url_context',
	IMAGE_GENERATION: 'image_generation',
	MULTIMODAL_INPUT: 'multimodal_input',
	MULTIMODAL_OUTPUT: 'multimodal_output'
};

const MODEL_ID = {
	MERCURY_2: 'inception/mercury-2',
	GEMINI_25_FLASH: 'google/gemini-2.5-flash',
	GEMINI_3_FLASH_PREVIEW: 'google/gemini-3-flash-preview',
	GEMINI_31_FLASH_LITE_PREVIEW: 'google/gemini-3.1-flash-lite-preview',
	GEMINI_31_FLASH_IMAGE_PREVIEW: 'google/gemini-3.1-flash-image-preview',
	OPENAI_GPT_IMAGE_2: IMAGE_GENERATION_MODEL_IDS.OPENAI_GPT_IMAGE_2,
	STABLE_IMAGE_CORE: IMAGE_GENERATION_MODEL_IDS.STABLE_IMAGE_CORE
};

const AI_MODELS = {
	[MODEL_ID.MERCURY_2]: {
		id: MODEL_ID.MERCURY_2,
		provider: 'inception',
		model: 'mercury-2',
		label: 'Mercury 2',
		capabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.STRUCTURED_OUTPUT,
			AI_CAPABILITIES.TOOL_USE
		]
	},
	[MODEL_ID.GEMINI_25_FLASH]: {
		id: MODEL_ID.GEMINI_25_FLASH,
		provider: 'google',
		model: 'gemini-2.5-flash',
		label: 'Gemini 2.5 Flash',
		capabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.STRUCTURED_OUTPUT,
			AI_CAPABILITIES.TOOL_USE,
			AI_CAPABILITIES.WEB_SEARCH,
			AI_CAPABILITIES.URL_CONTEXT,
			AI_CAPABILITIES.MULTIMODAL_INPUT
		]
	},
	[MODEL_ID.GEMINI_3_FLASH_PREVIEW]: {
		id: MODEL_ID.GEMINI_3_FLASH_PREVIEW,
		provider: 'google',
		model: 'gemini-3-flash-preview',
		label: 'Gemini 3 Flash Preview',
		fallbackModel: 'gemini-2.5-flash',
		capabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.STRUCTURED_OUTPUT,
			AI_CAPABILITIES.TOOL_USE,
			AI_CAPABILITIES.WEB_SEARCH,
			AI_CAPABILITIES.URL_CONTEXT,
			AI_CAPABILITIES.MULTIMODAL_INPUT
		]
	},
	[MODEL_ID.GEMINI_31_FLASH_LITE_PREVIEW]: {
		id: MODEL_ID.GEMINI_31_FLASH_LITE_PREVIEW,
		provider: 'google',
		model: 'gemini-3.1-flash-lite-preview',
		label: 'Gemini 3.1 Flash Lite Preview',
		fallbackModel: 'gemini-2.5-flash',
		capabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.STRUCTURED_OUTPUT,
			AI_CAPABILITIES.TOOL_USE,
			AI_CAPABILITIES.WEB_SEARCH,
			AI_CAPABILITIES.URL_CONTEXT,
			AI_CAPABILITIES.MULTIMODAL_INPUT
		]
	},
	[MODEL_ID.GEMINI_31_FLASH_IMAGE_PREVIEW]: {
		id: MODEL_ID.GEMINI_31_FLASH_IMAGE_PREVIEW,
		provider: 'google',
		model: 'gemini-3.1-flash-image-preview',
		label: 'Gemini',
		capabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.IMAGE_GENERATION,
			AI_CAPABILITIES.MULTIMODAL_INPUT,
			AI_CAPABILITIES.MULTIMODAL_OUTPUT
		]
	},
	[MODEL_ID.OPENAI_GPT_IMAGE_2]: {
		id: MODEL_ID.OPENAI_GPT_IMAGE_2,
		provider: 'openai',
		model: 'gpt-image-2',
		label: 'ChatGPT',
		capabilities: [AI_CAPABILITIES.IMAGE_GENERATION]
	},
	[MODEL_ID.STABLE_IMAGE_CORE]: {
		id: MODEL_ID.STABLE_IMAGE_CORE,
		provider: 'bedrock',
		model: 'stability.stable-image-core-v1:1',
		label: 'Stability',
		capabilities: [AI_CAPABILITIES.IMAGE_GENERATION]
	}
};

const AI_MODEL_PROFILES = {
	structured_text: {
		envVar: 'AI_MODEL_STRUCTURED_TEXT',
		fallbackModelId: MODEL_ID.MERCURY_2,
		requiredCapabilities: [AI_CAPABILITIES.TEXT_GENERATION, AI_CAPABILITIES.STRUCTURED_OUTPUT]
	},
	narrative_text_fast: {
		envVar: 'AI_MODEL_NARRATIVE_FAST',
		fallbackModelId: MODEL_ID.MERCURY_2,
		ignoreDefaultModel: true,
		requiredCapabilities: [AI_CAPABILITIES.TEXT_GENERATION, AI_CAPABILITIES.STRUCTURED_OUTPUT]
	},
	tool_augmented_text: {
		envVar: 'AI_MODEL_TOOL_AUGMENTED_TEXT',
		fallbackModelId: MODEL_ID.MERCURY_2,
		requiredCapabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.STRUCTURED_OUTPUT,
			AI_CAPABILITIES.TOOL_USE
		]
	},
	group_enrichment: {
		envVar: 'AI_MODEL_GROUP_ENRICHMENT',
		fallbackModelId: MODEL_ID.GEMINI_31_FLASH_LITE_PREVIEW,
		requiredCapabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.STRUCTURED_OUTPUT,
			AI_CAPABILITIES.TOOL_USE,
			AI_CAPABILITIES.WEB_SEARCH,
			AI_CAPABILITIES.URL_CONTEXT
		]
	},
	group_enrichment_retry: {
		envVar: 'AI_MODEL_GROUP_ENRICHMENT_RETRY',
		fallbackModelId: MODEL_ID.GEMINI_3_FLASH_PREVIEW,
		ignoreDefaultModel: true,
		requiredCapabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.STRUCTURED_OUTPUT,
			AI_CAPABILITIES.TOOL_USE,
			AI_CAPABILITIES.WEB_SEARCH,
			AI_CAPABILITIES.URL_CONTEXT
		]
	},
	image_generation: {
		envVar: 'AI_MODEL_IMAGE_GENERATION',
		fallbackModelId: MODEL_ID.OPENAI_GPT_IMAGE_2,
		requiredCapabilities: [AI_CAPABILITIES.IMAGE_GENERATION]
	}
};

let cachedGoogleClient = null;
let cachedGoogleApiKey = null;
let cachedOpenAiClient = null;
let cachedOpenAiApiKey = null;
let cachedBedrockClient = null;
let cachedBedrockConfigKey = null;

const STABLE_IMAGE_CORE_ASPECT_RATIO_MAP = {
	'1:1': '1:1',
	'3:4': '2:3',
	'4:3': '3:2',
	'4:5': '4:5',
	'9:16': '9:16',
	'16:9': '16:9'
};

const OPENAI_IMAGE_SIZE_BY_ASPECT_RATIO = {
	'1:1': '1024x1024',
	'3:4': '768x1024',
	'4:3': '1024x768',
	'4:5': '820x1024',
	'9:16': '576x1024',
	'16:9': '1024x576'
};

function convertSchemaNode(node) {
	if (!node || typeof node !== 'object' || Array.isArray(node)) {
		return node;
	}

	const converted = {};
	for (const [key, value] of Object.entries(node)) {
		if (key === 'nullable') continue;
		if (Array.isArray(value)) {
			converted[key] = value.map((item) => convertSchemaNode(item));
		} else if (value && typeof value === 'object') {
			converted[key] = convertSchemaNode(value);
		} else {
			converted[key] = value;
		}
	}

	if (node.nullable) {
		if (typeof converted.type === 'string') {
			converted.type = [converted.type, 'null'];
		} else if (Array.isArray(converted.type) && !converted.type.includes('null')) {
			converted.type = [...converted.type, 'null'];
		} else if (!converted.type) {
			converted.anyOf = [...(converted.anyOf || []), { type: 'null' }];
		}
	}

	return converted;
}

function buildInceptionMessages(contents) {
	if (typeof contents === 'string') {
		return [{ role: 'user', content: contents }];
	}

	if (Array.isArray(contents)) {
		const parts = contents
			.map((item) => {
				if (typeof item === 'string') return item.trim();
				if (item == null) return '';
				if (typeof item === 'object' && typeof item.text === 'string') return item.text.trim();
				return String(item).trim();
			})
			.filter(Boolean);
		return [{ role: 'user', content: parts.join('\n\n') }];
	}

	return [{ role: 'user', content: String(contents ?? '') }];
}

function createGoogleProviderClient(ai) {
	return {
		async generateContent({ model, contents, config }) {
			try {
				return await ai.models.generateContent({ model, contents, config });
			} catch (error) {
				const fallbackModel = Object.values(AI_MODELS).find(
					(candidate) => candidate.provider === 'google' && candidate.model === model
				)?.fallbackModel;
				if (!fallbackModel) throw error;
				return ai.models.generateContent({ model: fallbackModel, contents, config });
			}
		},
		async generateImage({ model, prompt, aspectRatio = '16:9', imageSize = '1K' }) {
			const response = await ai.models.generateContent({
				model,
				contents: prompt,
				config: {
					responseModalities: ['IMAGE'],
					imageConfig: {
						aspectRatio,
						imageSize
					}
				}
			});

			const inlinePart = response?.candidates
				?.flatMap((candidate) => candidate?.content?.parts ?? [])
				.find((part) => part?.inlineData?.data);
			if (inlinePart?.inlineData?.data) {
				return {
					imageBytes: inlinePart.inlineData.data,
					mimeType: inlinePart.inlineData.mimeType || 'image/png',
					raw: response
				};
			}

			if (response?.generatedImages?.[0]?.image?.imageBytes) {
				return {
					imageBytes: response.generatedImages[0].image.imageBytes,
					mimeType: response.generatedImages[0].image.mimeType || 'image/png',
					raw: response
				};
			}

			if (typeof response?.data === 'string' && response.data) {
				return {
					imageBytes: response.data,
					mimeType: 'image/png',
					raw: response
				};
			}

			throw new Error('Model did not return an image.');
		}
	};
}

function mapOpenAiImageSize(aspectRatio = '16:9') {
	return OPENAI_IMAGE_SIZE_BY_ASPECT_RATIO[aspectRatio] || '1536x1024';
}

function createOpenAiProviderClient(apiKey) {
	return {
		async generateImage({ model, prompt, aspectRatio = '16:9' }) {
			const body = {
				model,
				prompt,
				size: mapOpenAiImageSize(aspectRatio),
				quality: 'low'
			};

			if (model !== 'gpt-image-2') {
				body.response_format = 'b64_json';
			}

			const response = await fetch('https://api.openai.com/v1/images/generations', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => '');
				throw new Error(
					errorText || `OpenAI image generation failed with status ${response.status}.`
				);
			}

			const data = await response.json();
			let imageBytes = data?.data?.[0]?.b64_json;
			let mimeType = 'image/png';

			if (!imageBytes && data?.data?.[0]?.url) {
				const imageResponse = await fetch(data.data[0].url);
				if (!imageResponse.ok) {
					throw new Error(`Failed to fetch generated image from URL: ${imageResponse.statusText}`);
				}
				const contentType = imageResponse.headers.get('content-type');
				if (contentType) mimeType = contentType;
				const arrayBuffer = await imageResponse.arrayBuffer();
				imageBytes = Buffer.from(arrayBuffer).toString('base64');
			}

			if (!imageBytes) {
				throw new Error('OpenAI image generation returned no image.');
			}

			return {
				imageBytes,
				mimeType,
				raw: data
			};
		}
	};
}

function mapStableImageCoreAspectRatio(aspectRatio = '16:9') {
	return STABLE_IMAGE_CORE_ASPECT_RATIO_MAP[aspectRatio] || '16:9';
}

async function decodeBedrockBody(body) {
	if (!body) return '';
	if (typeof body === 'string') return body;
	if (body instanceof Uint8Array) return new TextDecoder().decode(body);
	if (typeof body.transformToString === 'function') {
		return body.transformToString();
	}
	if (Symbol.asyncIterator in body) {
		const chunks = [];
		for await (const chunk of body) {
			chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk || []));
		}
		return Buffer.concat(chunks).toString('utf8');
	}
	return '';
}

async function invokeBedrockJson(client, { modelId, payload, bearerToken = '', region = '' }) {
	let text = '';

	if (bearerToken) {
		const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				Authorization: `Bearer ${bearerToken}`
			},
			body: JSON.stringify(payload)
		});
		text = await response.text().catch(() => '');
		if (!response.ok) {
			throw new Error(text || `Bedrock invoke failed with status ${response.status}.`);
		}
	} else {
		const response = await client.send(
			new InvokeModelCommand({
				modelId,
				contentType: 'application/json',
				accept: 'application/json',
				body: JSON.stringify(payload)
			})
		);
		text = await decodeBedrockBody(response?.body);
	}

	if (!text) {
		throw new Error('Bedrock model response was empty.');
	}

	try {
		return JSON.parse(text);
	} catch {
		throw new Error('Bedrock model returned invalid JSON.');
	}
}

function createBedrockProviderClient({ client, bearerToken = '', region = '' }) {
	return {
		async generateImage({ model, prompt, aspectRatio = '16:9' }) {
			if (model === 'stability.stable-image-core-v1:1') {
				const response = await invokeBedrockJson(client, {
					modelId: model,
					bearerToken,
					region,
					payload: {
						prompt,
						aspect_ratio: mapStableImageCoreAspectRatio(aspectRatio),
						output_format: 'png'
					}
				});

				const finishReason = Array.isArray(response?.finish_reasons)
					? response.finish_reasons.find((reason) => reason != null)
					: null;
				if (finishReason) {
					throw new Error(`Stable Image Core generation failed: ${finishReason}`);
				}

				const imageBytes = response?.images?.[0];
				if (!imageBytes) {
					throw new Error('Stable Image Core returned no image.');
				}

				return {
					imageBytes,
					mimeType: 'image/png',
					raw: response
				};
			}

			throw new Error(`Unsupported Bedrock image model "${model}".`);
		}
	};
}

function createInceptionProviderClient(apiKey) {
	return {
		async generateContent({ model, contents, config = {} }) {
			const payload = {
				model,
				messages: buildInceptionMessages(contents)
			};

			if (config.tools) payload.tools = config.tools;
			if (config.temperature != null) payload.temperature = config.temperature;
			if (config.maxTokens != null) payload.max_tokens = config.maxTokens;
			if (config.responseSchema) {
				payload.response_format = {
					type: 'json_schema',
					json_schema: {
						name: config.schemaName || 'structured_response',
						strict: true,
						schema: convertSchemaNode(config.responseSchema)
					}
				};
			}

			const response = await fetch('https://api.inceptionlabs.ai/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => '');
				throw new Error(
					errorText || `Inception API request failed with status ${response.status}.`
				);
			}

			const data = await response.json();
			const text = data?.choices?.[0]?.message?.content ?? '';
			return { text, raw: data };
		}
	};
}

function getGoogleClient() {
	const apiKey = env.GENAI_API_KEY || null;
	if (!apiKey) return null;
	if (cachedGoogleClient && cachedGoogleApiKey === apiKey) {
		return cachedGoogleClient;
	}

	cachedGoogleClient = createGoogleProviderClient(new GoogleGenAI({ apiKey }));
	cachedGoogleApiKey = apiKey;
	return cachedGoogleClient;
}

function getOpenAiClient() {
	const apiKey = env.OPENAI_API_KEY || null;
	if (!apiKey) return null;
	if (cachedOpenAiClient && cachedOpenAiApiKey === apiKey) {
		return cachedOpenAiClient;
	}

	cachedOpenAiClient = createOpenAiProviderClient(apiKey);
	cachedOpenAiApiKey = apiKey;
	return cachedOpenAiClient;
}

function getBedrockConfigurationIssue() {
	const bearerToken = env.AWS_BEARER_TOKEN_BEDROCK || null;
	const region = env.AWS_BEDROCK_REGION || env.AWS_REGION || null;
	if (!region) {
		return 'AWS_BEDROCK_REGION or AWS_REGION is not configured.';
	}
	if (bearerToken) return null;

	const accessKeyId = env.AWS_BEDROCK_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || null;
	const secretAccessKey = env.AWS_BEDROCK_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || null;
	if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
		return 'Set both AWS_BEDROCK_ACCESS_KEY_ID and AWS_BEDROCK_SECRET_ACCESS_KEY (or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY).';
	}

	return null;
}

function getBedrockClient() {
	const configIssue = getBedrockConfigurationIssue();
	if (configIssue) return null;

	const region = env.AWS_BEDROCK_REGION || env.AWS_REGION;
	const bearerToken = (env.AWS_BEARER_TOKEN_BEDROCK || '').trim();
	const accessKeyId = env.AWS_BEDROCK_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || null;
	const secretAccessKey = env.AWS_BEDROCK_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || null;
	const sessionToken = env.AWS_BEDROCK_SESSION_TOKEN || env.AWS_SESSION_TOKEN || null;
	const configKey = [
		region,
		bearerToken ? `bearer:${bearerToken.slice(0, 12)}` : '',
		accessKeyId || '',
		secretAccessKey ? '1' : '0',
		sessionToken || ''
	].join(':');

	if (cachedBedrockClient && cachedBedrockConfigKey === configKey) {
		return cachedBedrockClient;
	}

	if (bearerToken) {
		cachedBedrockClient = createBedrockProviderClient({
			client: null,
			bearerToken,
			region
		});
		cachedBedrockConfigKey = configKey;
		return cachedBedrockClient;
	}

	const clientConfig = { region };
	if (accessKeyId && secretAccessKey) {
		clientConfig.credentials = {
			accessKeyId,
			secretAccessKey,
			...(sessionToken ? { sessionToken } : {})
		};
	}

	cachedBedrockClient = createBedrockProviderClient({
		client: new BedrockRuntimeClient(clientConfig),
		region
	});
	cachedBedrockConfigKey = configKey;
	return cachedBedrockClient;
}

function getInceptionClient() {
	const apiKey = env.INCEPTION_API_KEY || null;
	if (!apiKey) return null;
	return createInceptionProviderClient(apiKey);
}

function hasCapabilities(model, requiredCapabilities = []) {
	return requiredCapabilities.every((capability) => model.capabilities.includes(capability));
}

function resolveProfile(profileName) {
	const profile = AI_MODEL_PROFILES[profileName];
	if (!profile) {
		throw new Error(`Unknown AI model profile "${profileName}".`);
	}
	return profile;
}

function resolveDefaultModelId(profile) {
	if (profile?.ignoreDefaultModel) return null;
	const defaultModelId = env.AI_MODEL_DEFAULT || null;
	if (!defaultModelId) return null;
	const defaultModel = AI_MODELS[defaultModelId];
	if (!defaultModel) return null;
	return hasCapabilities(defaultModel, profile.requiredCapabilities) ? defaultModelId : null;
}

function resolveModelId(profileName) {
	const profile = resolveProfile(profileName);
	return env[profile.envVar] || resolveDefaultModelId(profile) || profile.fallbackModelId;
}

function resolveModel(profileName, options = {}) {
	const profile = resolveProfile(profileName);
	const explicitModelId =
		typeof options?.modelIdOverride === 'string' ? options.modelIdOverride.trim() : '';
	const modelId = explicitModelId || resolveModelId(profileName);
	const model = AI_MODELS[modelId];

	if (!model) {
		if (explicitModelId) {
			throw new Error(`Unknown AI model "${modelId}".`);
		}
		throw new Error(`AI model profile "${profileName}" points to unknown model "${modelId}".`);
	}

	if (!hasCapabilities(model, profile.requiredCapabilities)) {
		throw new Error(
			`AI model "${modelId}" does not satisfy required capabilities for profile "${profileName}".`
		);
	}

	return model;
}

function resolveProviderClient(provider) {
	if (provider === 'google') return getGoogleClient();
	if (provider === 'openai') return getOpenAiClient();
	if (provider === 'bedrock') return getBedrockClient();
	if (provider === 'inception') return getInceptionClient();
	throw new Error(`Unsupported AI provider "${provider}".`);
}

function missingApiKeyMessage(provider) {
	if (provider === 'google') return 'GENAI_API_KEY not configured.';
	if (provider === 'openai') return 'OPENAI_API_KEY not configured.';
	if (provider === 'bedrock') return getBedrockConfigurationIssue() || 'Bedrock is not configured.';
	if (provider === 'inception') return 'INCEPTION_API_KEY not configured.';
	return 'AI provider not configured.';
}

export function getAiModel(profileName, options = {}) {
	const model = resolveModel(profileName, options);
	const client = resolveProviderClient(model.provider);

	if (!client) return null;

	return { client, model, profile: profileName };
}

export function requireAiModel(profileName, options = {}) {
	const model = resolveModel(profileName, options);
	const client = resolveProviderClient(model.provider);
	if (!client) {
		throw new Error(missingApiKeyMessage(model.provider));
	}
	return { client, model, profile: profileName };
}

export function getAiConfigurationError(profileName, options = {}) {
	const model = resolveModel(profileName, options);
	return resolveProviderClient(model.provider) ? null : missingApiKeyMessage(model.provider);
}

export function isAiModelConfigured(profileName, options = {}) {
	return !getAiConfigurationError(profileName, options);
}

export function listAiModelProfiles() {
	return Object.entries(AI_MODEL_PROFILES).map(([name, profile]) => ({
		name,
		envVar: profile.envVar,
		fallbackModelId: profile.fallbackModelId,
		requiredCapabilities: [...profile.requiredCapabilities]
	}));
}

export function listAiModels() {
	return Object.values(AI_MODELS).map((model) => ({
		...model,
		capabilities: [...model.capabilities]
	}));
}
