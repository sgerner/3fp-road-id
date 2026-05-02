import path from 'node:path';
import { json } from '@sveltejs/kit';
import {
	BIKE_VIBE_STYLE_ID,
	getImageStylePreset,
	STATE_MASCOT_STYLE_ID
} from '$lib/ai/imageStyles';
import {
	IMAGE_GENERATION_MODEL_IDS,
	normalizeSocialImageGenerationModelId
} from '$lib/ai/imageGenerationModels';
import { getBikeVibeById, normalizeBikeVibeId } from '$lib/ai/bikeVibes';
import { getUsStateName, normalizeUsStateCode } from '$lib/geo/usStates';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';
import {
	getAiModel,
	getAiConfigurationError,
	isAiModelConfigured,
	requireAiModel
} from '$lib/server/ai/models';

export const config = { runtime: 'nodejs20.x', maxDuration: 300 };

const ALLOWED_TARGETS = new Set(['ride', 'learn', 'group']);
const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '3:4', '4:3', '4:5', '9:16', '16:9']);

function safeTrim(value) {
	if (value == null) return '';
	return String(value).trim();
}

function sanitizePrompt(value, limit = 5000) {
	return safeTrim(value).replace(/\s+/g, ' ').slice(0, limit);
}

function slugifySegment(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
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
		return null;
	}
}

function summarizeMarkdown(markdown, limit = 1200) {
	const normalized = safeTrim(markdown)
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]*`/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
		.replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
		.replace(/[#>*_\-\n\r]+/g, ' ')
		.replace(/\s+/g, ' ');
	return normalized.slice(0, limit);
}

const STABILITY_REWRITE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['optimized_prompt'],
	properties: {
		optimized_prompt: { type: 'string' }
	}
};

async function optimizePromptForStability(
	finalPrompt,
	{ allowTextInImage = false, target = 'group' } = {}
) {
	const optimizer = getAiModel('narrative_text_fast');
	if (!optimizer) return finalPrompt;

	const optimizationPrompt = `Rewrite the following image prompt so it works better for Stability AI "Stable Image Core".

Goals:
- Keep the creative direction, tone, and key constraints intact.
- Translate abstract language into concrete visual direction (subjects, composition, lighting, scene details).
- Keep it concise and production-ready for text-to-image.
- Avoid over-literal interpretation of metaphors and slogans.
- Prefer one clear scene with one primary focal subject.
- Preserve aspect-ratio-neutral framing.
- Preserve whether text is allowed in-image.

Rules:
- Do not add brand names, logos, watermarks, or copyrighted characters.
- Do not invent factual event details that are not in the source prompt.
- If target is a social post cover, optimize for strong thumbnail readability.
- Return strict JSON: {"optimized_prompt":"..."}.

Generation target: ${safeTrim(target) || 'group'}
Text allowed in image: ${allowTextInImage ? 'yes' : 'no'}

Source prompt:
${finalPrompt}`;

	try {
		const { client, model } = optimizer;
		const rewritten = await client.generateContent({
			model: model.model,
			contents: optimizationPrompt,
			config: {
				responseMimeType: 'application/json',
				responseSchema: STABILITY_REWRITE_SCHEMA
			}
		});
		let text = rewritten?.text ?? '';
		if (typeof text === 'function') text = text();
		const parsed = safeParseJson(text);
		const optimized = sanitizePrompt(parsed?.optimized_prompt || text, 5000);
		return optimized || finalPrompt;
	} catch {
		return finalPrompt;
	}
}

function formatContextLines(context = {}) {
	return Object.entries(context)
		.flatMap(([key, value]) => {
			if (value == null || value === '') return [];
			if (Array.isArray(value)) {
				const cleaned = value.map((item) => safeTrim(item)).filter(Boolean);
				return cleaned.length ? [`${key}: ${cleaned.join(', ')}`] : [];
			}
			if (typeof value === 'object') {
				const nested = Object.entries(value)
					.map(([nestedKey, nestedValue]) => `${nestedKey}=${safeTrim(nestedValue)}`)
					.filter((line) => !line.endsWith('='));
				return nested.length ? [`${key}: ${nested.join('; ')}`] : [];
			}
			return [`${key}: ${safeTrim(value)}`];
		})
		.filter(Boolean);
}

function buildTargetPrompt(target, context = {}) {
	if (target === 'ride') {
		return [
			'Create promotional cover art for a community bike ride.',
			'Show cyclists like comic-book heroes with clear motion, fun, and welcoming community energy.',
			'Favor a bold lead image that works well as a ride card and ride page header.',
			...formatContextLines({
				title: context.title,
				summary: context.summary,
				description: context.description,
				start_location: context.startLocation,
				end_location: context.endLocation,
				time: context.time,
				distance: context.distance,
				disciplines: context.disciplines,
				difficulty: context.difficulty,
				host_group: context.hostGroup,
				pace_notes: context.paceNotes,
				accessibility_notes: context.accessibilityNotes
			})
		].join('\n');
	}

	if (target === 'learn') {
		return [
			'Create editorial cover art for a learn article about cycling, advocacy, or community organizing.',
			'The image should feel informative, memorable, and poster-like rather than literal stock art.',
			'Use symbolic storytelling and clear central composition suitable for an article cover.',
			...formatContextLines({
				title: context.title,
				summary: context.summary,
				category: context.category,
				subcategory: context.subcategory,
				key_excerpt: summarizeMarkdown(context.bodyMarkdown)
			})
		].join('\n');
	}

	return [
		'Create banner-style cover art for a local cycling group page.',
		'The image should communicate the group identity, welcome new people, and feel like a signature 3FP poster.',
		'Show community energy, group personality, and the local riding environment.',
		...formatContextLines({
			name: context.name,
			tagline: context.tagline,
			description: context.description,
			location: context.location,
			service_area: context.serviceArea,
			activity_frequency: context.activityFrequency,
			typical_time: context.typicalTime,
			riding_disciplines: context.ridingDisciplines,
			audience_focuses: context.audienceFocuses,
			how_to_join: context.howToJoin
		})
	].join('\n');
}

function buildFinalPrompt({
	target,
	context,
	prompt,
	stylePrompt,
	styleId,
	styleOptions,
	allowTextInImage = false,
	textOverlay = ''
}) {
	const targetPrompt = buildTargetPrompt(target, context);
	const selectedStateCode = normalizeUsStateCode(styleOptions?.stateCode);
	const selectedStateName = selectedStateCode ? getUsStateName(selectedStateCode) : '';
	const selectedBikeVibeId = normalizeBikeVibeId(styleOptions?.bikeVibeId);
	const selectedBikeVibe = selectedBikeVibeId ? getBikeVibeById(selectedBikeVibeId) : null;
	const stateDirective =
		styleId === STATE_MASCOT_STYLE_ID && selectedStateCode
			? `
State-specific direction:
- The selected state/territory is ${selectedStateName} (${selectedStateCode}).
- Make the mascot and surrounding icons clearly specific to this place.
- Include recognizable nature, landmarks, and local culture cues for this location.
- Keep the mascot original and fictional (no existing mascots or logos).`
			: '';
	const bikeDirective =
		styleId === BIKE_VIBE_STYLE_ID && selectedBikeVibe
			? `
Bike vibe direction:
- The selected bike vibe is ${selectedBikeVibe.label}.
- Render the bike with design cues matching: ${selectedBikeVibe.promptCue}.
- Make the bike itself the clear hero, and align the environment with the same vibe.`
			: '';

	const textRequirement = allowTextInImage
		? textOverlay
			? `Include the essential story text directly in the image. Text to include: "${textOverlay}". Keep it readable and concise.`
			: 'Include any essential story text directly in the image in a readable, concise layout.'
		: 'Do not render readable words, captions, signs, logos, watermarks, or decorative lettering in the image.';

	return `${stylePrompt}

Target brief:
${targetPrompt}

Optional user direction:
${prompt || 'No additional steering provided.'}
${stateDirective}
${bikeDirective}

Output requirements:
- Single polished illustration suitable for a wide 16:9 cover image unless another aspect ratio is requested.
- Keep the scene readable at thumbnail size.
- ${textRequirement}
- Preserve the wholesome, slightly ridiculous comic-book energy.`;
}

function getStorageConfig(target, userId, articleId, context, extension = 'png') {
	const baseName =
		slugifySegment(context?.title || context?.name || context?.slug || `${target}-image`) ||
		`${target}-image`;
	const safeExt = extension.replace(/^\./, '');

	if (target === 'ride') {
		return {
			bucket: 'ride-media',
			objectPath: `${userId}/${Date.now()}-${baseName}.${safeExt}`
		};
	}

	if (target === 'learn') {
		return {
			bucket: 'learn-media',
			objectPath: `${userId}/${Date.now()}-${baseName}.${safeExt}`,
			articleId: safeTrim(articleId) || null
		};
	}

	return {
		bucket: 'storage',
		objectPath: `groups/generated/${userId}/${Date.now()}-${baseName}.${safeExt}`
	};
}

async function persistLearnAsset({
	supabase,
	userId,
	articleId,
	objectPath,
	publicUrl,
	fileName,
	sizeBytes,
	styleId,
	modelId
}) {
	const { data: assetRow, error: assetError } = await supabase
		.from('learn_assets')
		.insert({
			article_id: articleId,
			uploaded_by_user_id: userId,
			object_path: objectPath,
			public_url: publicUrl,
			file_name: fileName,
			mime_type: 'image/png',
			size_bytes: sizeBytes,
			source_type: 'upload',
			metadata: {
				generated: true,
				styleId,
				modelId
			}
		})
		.select(
			'id, article_id, object_path, public_url, file_name, mime_type, size_bytes, created_at, source_type, source_path'
		)
		.single();

	if (assetError) throw assetError;

	if (articleId) {
		const { error: linkError } = await supabase.from('learn_article_asset_links').upsert(
			{
				article_id: articleId,
				asset_id: assetRow.id,
				created_by_user_id: userId,
				usage_kind: 'embedded'
			},
			{ onConflict: 'article_id,asset_id' }
		);

		if (linkError) throw linkError;
	}

	return assetRow;
}

export async function POST({ request, cookies }) {
	const { user } = resolveSession(cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		return json({ error: 'Supabase service role is not configured.' }, { status: 500 });
	}

	const payload = await request.json().catch(() => null);
	const requestedModelId = normalizeSocialImageGenerationModelId(payload?.modelId);
	if (safeTrim(payload?.modelId) && !requestedModelId) {
		return json({ error: 'Unsupported image generation model.' }, { status: 400 });
	}
	const modelOptions = requestedModelId ? { modelIdOverride: requestedModelId } : {};
	if (!isAiModelConfigured('image_generation', modelOptions)) {
		return json(
			{ error: getAiConfigurationError('image_generation', modelOptions) },
			{ status: 503 }
		);
	}

	const target = safeTrim(payload?.target);
	if (!ALLOWED_TARGETS.has(target)) {
		return json({ error: 'Unsupported image target.' }, { status: 400 });
	}

	const aspectRatio = ALLOWED_ASPECT_RATIOS.has(payload?.aspectRatio)
		? payload.aspectRatio
		: '16:9';
	const stylePreset = getImageStylePreset(payload?.styleId);
	const styleOptions =
		payload?.styleOptions && typeof payload.styleOptions === 'object' ? payload.styleOptions : {};
	const prompt = sanitizePrompt(payload?.prompt, 800);
	const allowTextInImage = Boolean(payload?.allowTextInImage);
	const textOverlay = sanitizePrompt(payload?.textOverlay, 280);
	const thinking = ['off', 'low', 'medium', 'high'].includes(payload?.thinking)
		? payload.thinking
		: 'low';
	const context = payload?.context && typeof payload.context === 'object' ? payload.context : {};
	const selectedStateCode = normalizeUsStateCode(styleOptions?.stateCode);
	const selectedBikeVibeId = normalizeBikeVibeId(styleOptions?.bikeVibeId);
	if (stylePreset.id === STATE_MASCOT_STYLE_ID && !selectedStateCode) {
		return json(
			{ error: 'State selection is required for the selected image style.' },
			{ status: 400 }
		);
	}
	if (stylePreset.id === BIKE_VIBE_STYLE_ID && !selectedBikeVibeId) {
		return json(
			{ error: 'Bike type/vibe selection is required for the selected image style.' },
			{ status: 400 }
		);
	}
	const finalPrompt = buildFinalPrompt({
		target,
		context,
		prompt,
		stylePrompt: stylePreset.prompt,
		styleId: stylePreset.id,
		styleOptions,
		allowTextInImage,
		textOverlay
	});

	try {
		const { client, model } = requireAiModel('image_generation', modelOptions);
		const optimizedPrompt =
			model.id === IMAGE_GENERATION_MODEL_IDS.STABLE_IMAGE_CORE
				? await optimizePromptForStability(finalPrompt, { allowTextInImage, target })
				: finalPrompt;
		const generated = await client.generateImage({
			model: model.model,
			prompt: optimizedPrompt,
			aspectRatio,
			thinking
		});

		const imageBytes = generated?.imageBytes;
		if (!imageBytes) {
			return json({ error: 'Image generation returned no image data.' }, { status: 502 });
		}

		const mimeType = generated?.mimeType || 'image/png';
		const extension = mimeType.split('/')[1] || 'png';
		const storage = getStorageConfig(target, user.id, payload?.articleId, context, extension);
		const buffer = Buffer.from(imageBytes, 'base64');
		const uploadResult = await supabase.storage
			.from(storage.bucket)
			.upload(storage.objectPath, buffer, {
				contentType: mimeType,
				upsert: false
			});

		if (uploadResult.error) {
			return json({ error: uploadResult.error.message }, { status: 500 });
		}

		const { data: publicUrlData } = supabase.storage
			.from(storage.bucket)
			.getPublicUrl(storage.objectPath);
		const url = publicUrlData?.publicUrl || null;
		if (!url) {
			return json({ error: 'Unable to resolve public image URL.' }, { status: 500 });
		}

		let asset = null;
		if (target === 'learn') {
			asset = await persistLearnAsset({
				supabase,
				userId: user.id,
				articleId: storage.articleId,
				objectPath: storage.objectPath,
				publicUrl: url,
				fileName: path.basename(storage.objectPath),
				sizeBytes: buffer.byteLength,
				styleId: stylePreset.id,
				modelId: model.id
			});
		}

		return json({
			url,
			target,
			aspectRatio,
			styleId: stylePreset.id,
			model: model.id,
			asset
		});
	} catch (routeError) {
		return json(
			{
				error: routeError?.message || 'Unable to generate image.'
			},
			{ status: 500 }
		);
	}
}
