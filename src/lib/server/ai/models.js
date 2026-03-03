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
	GEMINI_25_FLASH: 'google/gemini-2.5-flash'
};

const AI_MODELS = {
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
	}
};

const AI_MODEL_PROFILES = {
	structured_text: {
		envVar: 'AI_MODEL_STRUCTURED_TEXT',
		fallbackModelId: MODEL_ID.GEMINI_25_FLASH,
		requiredCapabilities: [AI_CAPABILITIES.TEXT_GENERATION, AI_CAPABILITIES.STRUCTURED_OUTPUT]
	},
	tool_augmented_text: {
		envVar: 'AI_MODEL_TOOL_AUGMENTED_TEXT',
		fallbackModelId: MODEL_ID.GEMINI_25_FLASH,
		requiredCapabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.STRUCTURED_OUTPUT,
			AI_CAPABILITIES.TOOL_USE
		]
	},
	group_enrichment: {
		envVar: 'AI_MODEL_GROUP_ENRICHMENT',
		fallbackModelId: MODEL_ID.GEMINI_25_FLASH,
		requiredCapabilities: [
			AI_CAPABILITIES.TEXT_GENERATION,
			AI_CAPABILITIES.STRUCTURED_OUTPUT,
			AI_CAPABILITIES.TOOL_USE,
			AI_CAPABILITIES.WEB_SEARCH,
			AI_CAPABILITIES.URL_CONTEXT
		]
	}
};

let cachedGoogleClient = null;
let cachedGoogleApiKey = null;

function getGoogleClient() {
	const apiKey = env.GENAI_API_KEY || null;
	if (!apiKey) return null;
	if (cachedGoogleClient && cachedGoogleApiKey === apiKey) {
		return cachedGoogleClient;
	}

	cachedGoogleClient = new GoogleGenAI({ apiKey });
	cachedGoogleApiKey = apiKey;
	return cachedGoogleClient;
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

function resolveModelId(profileName) {
	const profile = resolveProfile(profileName);
	return env[profile.envVar] || profile.fallbackModelId;
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
	throw new Error(`Unsupported AI provider "${provider}".`);
}

export function getAiModel(profileName) {
	const model = resolveModel(profileName);
	const ai = resolveProviderClient(model.provider);

	if (!ai) return null;

	return { ai, model, profile: profileName };
}

export function requireAiModel(profileName) {
	const resolved = getAiModel(profileName);
	if (!resolved) {
		throw new Error('GENAI_API_KEY not configured.');
	}
	return resolved;
}

export function isAiModelConfigured(profileName) {
	return Boolean(getAiModel(profileName));
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
