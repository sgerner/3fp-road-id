export const IMAGE_GENERATION_MODEL_IDS = Object.freeze({
	OPENAI_GPT_IMAGE_2: 'openai/gpt-image-2',
	STABLE_IMAGE_CORE: 'bedrock/stability-stable-image-core-v1',
	GEMINI_31_FLASH_IMAGE_PREVIEW: 'google/gemini-3.1-flash-image-preview'
});

export const SOCIAL_IMAGE_GENERATION_MODELS = Object.freeze([
	{
		id: IMAGE_GENERATION_MODEL_IDS.OPENAI_GPT_IMAGE_2,
		label: 'ChatGPT'
	},
	{
		id: IMAGE_GENERATION_MODEL_IDS.STABLE_IMAGE_CORE,
		label: 'Stability'
	},
	{
		id: IMAGE_GENERATION_MODEL_IDS.GEMINI_31_FLASH_IMAGE_PREVIEW,
		label: 'Gemini'
	}
]);

export const DEFAULT_SOCIAL_IMAGE_GENERATION_MODEL_ID =
	IMAGE_GENERATION_MODEL_IDS.OPENAI_GPT_IMAGE_2;

export function normalizeSocialImageGenerationModelId(value) {
	const candidate = typeof value === 'string' ? value.trim() : '';
	if (!candidate) return '';
	return SOCIAL_IMAGE_GENERATION_MODELS.some((option) => option.id === candidate) ? candidate : '';
}
