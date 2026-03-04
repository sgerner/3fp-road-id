import path from 'node:path';
import { json } from '@sveltejs/kit';
import { getImageStylePreset } from '$lib/ai/imageStyles';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';
import {
	getAiConfigurationError,
	isAiModelConfigured,
	requireAiModel
} from '$lib/server/ai/models';

export const config = { runtime: 'nodejs20.x', maxDuration: 60 };

const ALLOWED_TARGETS = new Set(['ride', 'learn', 'group']);
const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '3:4', '4:3', '9:16', '16:9']);

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

function buildFinalPrompt({ target, context, prompt, stylePrompt }) {
	const targetPrompt = buildTargetPrompt(target, context);
	return `${stylePrompt}

Target brief:
${targetPrompt}

Optional user direction:
${prompt || 'No additional steering provided.'}

Output requirements:
- Single polished illustration suitable for a wide 16:9 cover image unless another aspect ratio is requested.
- Keep the scene readable at thumbnail size.
- If using lettering, keep it minimal, bold, and stylized rather than dense or detailed.
- Preserve the wholesome, slightly ridiculous comic-book energy.`;
}

function getStorageConfig(target, userId, articleId, context) {
	const baseName =
		slugifySegment(context?.title || context?.name || context?.slug || `${target}-image`) ||
		`${target}-image`;

	if (target === 'ride') {
		return {
			bucket: 'ride-media',
			objectPath: `${userId}/${Date.now()}-${baseName}.png`
		};
	}

	if (target === 'learn') {
		return {
			bucket: 'learn-media',
			objectPath: `${userId}/${Date.now()}-${baseName}.png`,
			articleId: safeTrim(articleId) || null
		};
	}

	return {
		bucket: 'storage',
		objectPath: `groups/generated/${userId}/${Date.now()}-${baseName}.png`
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
	if (!isAiModelConfigured('image_generation')) {
		return json({ error: getAiConfigurationError('image_generation') }, { status: 503 });
	}

	const { user } = resolveSession(cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		return json({ error: 'Supabase service role is not configured.' }, { status: 500 });
	}

	const payload = await request.json().catch(() => null);
	const target = safeTrim(payload?.target);
	if (!ALLOWED_TARGETS.has(target)) {
		return json({ error: 'Unsupported image target.' }, { status: 400 });
	}

	const aspectRatio = ALLOWED_ASPECT_RATIOS.has(payload?.aspectRatio)
		? payload.aspectRatio
		: '16:9';
	const stylePreset = getImageStylePreset(payload?.styleId);
	const prompt = sanitizePrompt(payload?.prompt, 800);
	const context = payload?.context && typeof payload.context === 'object' ? payload.context : {};
	const finalPrompt = buildFinalPrompt({
		target,
		context,
		prompt,
		stylePrompt: stylePreset.prompt
	});

	try {
		const { client, model } = requireAiModel('image_generation');
		const generated = await client.generateImage({
			model: model.model,
			prompt: finalPrompt,
			aspectRatio
		});

		const imageBytes = generated?.imageBytes;
		if (!imageBytes) {
			return json({ error: 'Image generation returned no image data.' }, { status: 502 });
		}

		const storage = getStorageConfig(target, user.id, payload?.articleId, context);
		const buffer = Buffer.from(imageBytes, 'base64');
		const uploadResult = await supabase.storage
			.from(storage.bucket)
			.upload(storage.objectPath, buffer, {
				contentType: generated?.mimeType || 'image/png',
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
