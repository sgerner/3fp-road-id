export const IMAGE_GENERATION_MODEL_IDS = Object.freeze({
	STABLE_IMAGE_CORE: 'bedrock/stability-stable-image-core-v1',
	GEMINI_31_FLASH_IMAGE_PREVIEW: 'google/gemini-3.1-flash-image-preview'
});

export const SOCIAL_IMAGE_GENERATION_MODELS = Object.freeze([
	{
		id: IMAGE_GENERATION_MODEL_IDS.STABLE_IMAGE_CORE,
		label: 'Stable Image Core'
	},
	{
		id: IMAGE_GENERATION_MODEL_IDS.GEMINI_31_FLASH_IMAGE_PREVIEW,
		label: 'Gemini 3.1 Flash Image Preview'
	}
]);

export const DEFAULT_SOCIAL_IMAGE_GENERATION_MODEL_ID =
	IMAGE_GENERATION_MODEL_IDS.GEMINI_31_FLASH_IMAGE_PREVIEW;

export function normalizeSocialImageGenerationModelId(value) {
	const candidate = typeof value === 'string' ? value.trim() : '';
	if (!candidate) return '';
	return SOCIAL_IMAGE_GENERATION_MODELS.some((option) => option.id === candidate) ? candidate : '';
}
