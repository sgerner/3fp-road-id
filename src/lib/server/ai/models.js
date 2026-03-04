import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

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
	GEMINI_31_FLASH_LITE_PREVIEW: 'google/gemini-3.1-flash-lite-preview',
	GEMINI_31_FLASH_IMAGE_PREVIEW: 'google/gemini-3.1-flash-image-preview'
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
		label: 'Gemini 3.1 Flash Image Preview',
		capabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.IMAGE_GENERATION,
			AI_CAPABILITIES.MULTIMODAL_INPUT,
			AI_CAPABILITIES.MULTIMODAL_OUTPUT
		]
	}
};

const AI_MODEL_PROFILES = {
	structured_text: {
		envVar: 'AI_MODEL_STRUCTURED_TEXT',
		fallbackModelId: MODEL_ID.MERCURY_2,
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
	image_generation: {
		envVar: 'AI_MODEL_IMAGE_GENERATION',
		fallbackModelId: MODEL_ID.GEMINI_31_FLASH_IMAGE_PREVIEW,
		requiredCapabilities: [AI_CAPABILITIES.IMAGE_GENERATION]
	}
};

let cachedGoogleClient = null;
let cachedGoogleApiKey = null;

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
		async generateImage({ model, prompt, aspectRatio = '16:9', imageSize = '2K' }) {
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

function resolveModel(profileName) {
	const profile = resolveProfile(profileName);
	const modelId = resolveModelId(profileName);
	const model = AI_MODELS[modelId];

	if (!model) {
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
	if (provider === 'inception') return getInceptionClient();
	throw new Error(`Unsupported AI provider "${provider}".`);
}

function missingApiKeyMessage(provider) {
	if (provider === 'google') return 'GENAI_API_KEY not configured.';
	if (provider === 'inception') return 'INCEPTION_API_KEY not configured.';
	return 'AI provider not configured.';
}

export function getAiModel(profileName) {
	const model = resolveModel(profileName);
	const client = resolveProviderClient(model.provider);

	if (!client) return null;

	return { client, model, profile: profileName };
}

export function requireAiModel(profileName) {
	const model = resolveModel(profileName);
	const client = resolveProviderClient(model.provider);
	if (!client) {
		throw new Error(missingApiKeyMessage(model.provider));
	}
	return { client, model, profile: profileName };
}

export function getAiConfigurationError(profileName) {
	const model = resolveModel(profileName);
	return resolveProviderClient(model.provider) ? null : missingApiKeyMessage(model.provider);
}

export function isAiModelConfigured(profileName) {
	return !getAiConfigurationError(profileName);
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
