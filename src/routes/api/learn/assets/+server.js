import path from 'node:path';
import { json } from '@sveltejs/kit';
import { extractMarkdownHeadings } from '#lib/learn/markdown';
import { getLearnServiceClient, requireLearnUser, slugifyLearn } from '#lib/server/learn';
import { generateLearnImageAltText } from '#lib/server/learnAi';
import {
	resolveLearnUploadArticleContext,
	updateLearnAssetAltAuthorized
} from '#lib/server/learnAiCore';
import { optimizeImageForStorage, replaceFileExtension } from '#lib/server/storageImages';
import { enforceRateLimit, readFormData, readJsonBody } from '#lib/server/security';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_FORM_BYTES = 64 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'application/pdf',
	'text/csv'
]);

function buildObjectPath(userId, fileName) {
	const extension = path.extname(fileName || '').toLowerCase();
	const base = slugifyLearn(path.basename(fileName || 'asset', extension)) || 'asset';
	return `${userId}/${Date.now()}-${base}${extension}`;
}

export async function POST(event) {
	const { request, cookies } = event;
	try {
		const { user, supabase: userSupabase } = await requireLearnUser(cookies);
		const limited = enforceRateLimit(event, {
			name: 'learn-asset-upload',
			key: user.id,
			limit: 20,
			windowMs: 60 * 60 * 1000
		});
		if (limited) return limited;
		const ipLimited = enforceRateLimit(event, {
			name: 'learn-asset-upload-ip',
			limit: 30,
			windowMs: 60 * 60 * 1000
		});
		if (ipLimited) return ipLimited;
		const parsedForm = await readFormData(request, { maxBytes: MAX_FORM_BYTES });
		if (!parsedForm.ok) {
			return json({ error: parsedForm.error }, { status: parsedForm.status });
		}
		const formData = parsedForm.value;
		const requestedArticleId = String(formData.get('articleId') || '').trim() || null;
		const rawArticleTitle = String(formData.get('articleTitle') || formData.get('title') || '')
			.trim()
			.slice(0, 300);
		const rawBodyMarkdown = String(formData.get('bodyMarkdown') || '').slice(0, 12_000);
		const enclosingLinkUrl = String(formData.get('enclosingLinkUrl') || '')
			.trim()
			.slice(0, 500);
		const requestedUsageKind = String(formData.get('usageKind') || '')
			.trim()
			.toLowerCase();
		const files = formData.getAll('files').filter((entry) => entry instanceof File);

		if (!files.length) {
			return json({ error: 'No files were provided.' }, { status: 400 });
		}
		if (files.length > MAX_FILES) {
			return json({ error: `You can upload up to ${MAX_FILES} files at a time.` }, { status: 400 });
		}

		const articleContext = await resolveLearnUploadArticleContext({
			userSupabase,
			user,
			articleId: requestedArticleId,
			articleTitle: rawArticleTitle,
			bodyMarkdown: rawBodyMarkdown
		});
		if (!articleContext.ok) {
			return json({ error: articleContext.error }, { status: articleContext.status });
		}

		const { articleId, articleTitle, bodyMarkdown } = articleContext;
		const serviceSupabase = getLearnServiceClient();
		const headings = extractMarkdownHeadings(bodyMarkdown).map((heading) => heading.text);
		const uploadedFiles = [];
		let imageCount = 0;
		let generatedAltCount = 0;

		for (const file of files) {
			if (!ALLOWED_TYPES.has(file.type)) {
				return json({ error: `Unsupported file type: ${file.type || file.name}` }, { status: 400 });
			}

			if (file.size > MAX_FILE_BYTES) {
				return json({ error: `${file.name} exceeds the 25 MB upload limit.` }, { status: 400 });
			}

			const sourceBuffer = Buffer.from(await file.arrayBuffer());
			const optimized = await optimizeImageForStorage(sourceBuffer, {
				contentType: file.type,
				maxWidth: 2400,
				maxHeight: 1800,
				quality: 82
			});
			const storedFileName = optimized.optimized
				? replaceFileExtension(file.name, optimized.extension)
				: file.name;
			const objectPath = buildObjectPath(user.id, storedFileName);
			const uploadResult = await serviceSupabase.storage
				.from('learn-media')
				.upload(objectPath, optimized.buffer, {
					contentType: optimized.contentType,
					upsert: false
				});

			if (uploadResult.error) {
				return json({ error: uploadResult.error.message }, { status: 500 });
			}

			const { data: publicUrlData } = serviceSupabase.storage
				.from('learn-media')
				.getPublicUrl(objectPath);
			const publicUrl = publicUrlData?.publicUrl || null;

			let draftedAltText = '';
			let isDecorative = false;
			let altGenerated = false;
			let altModel = '';

			if (file.type.startsWith('image/')) {
				imageCount += 1;
				try {
					const altResult = await generateLearnImageAltText({
						imageBuffer: optimized.buffer,
						mimeType: optimized.contentType,
						fileName: file.name,
						imageUrl: publicUrl || '',
						title: articleTitle,
						headings,
						enclosingLinkUrl,
						isSoleLinkContent: Boolean(enclosingLinkUrl),
						timeoutMs: 12_000
					});
					draftedAltText = altResult.altText || '';
					isDecorative = Boolean(altResult.isDecorative);
					altGenerated = Boolean(altResult.altGenerated && (draftedAltText || isDecorative));
					altModel = altResult.model || '';
					if (altGenerated) generatedAltCount += 1;
				} catch (altError) {
					if (altError?.code !== 'AI_UNAVAILABLE') {
						console.warn(`Learn asset alt synthesis skipped for ${file.name}:`, altError?.message);
					}
				}
			}

			const assetMetadata = {
				alt_generated: altGenerated,
				...(isDecorative ? { is_decorative: true } : {}),
				...(altModel ? { alt_model: altModel } : {})
			};

			const { data: assetRow, error: assetError } = await serviceSupabase
				.from('learn_assets')
				.insert({
					article_id: articleId,
					uploaded_by_user_id: user.id,
					object_path: objectPath,
					public_url: publicUrl,
					file_name: file.name,
					mime_type: optimized.contentType,
					size_bytes: optimized.optimizedBytes,
					source_type: 'upload',
					alt_text: draftedAltText || null,
					metadata: assetMetadata
				})
				.select(
					'id, article_id, object_path, public_url, file_name, mime_type, size_bytes, created_at, source_type, source_path, alt_text, metadata'
				)
				.single();

			if (assetError) {
				return json({ error: assetError.message }, { status: 500 });
			}

			const resolvedUsageKind = file.type.startsWith('image/')
				? requestedUsageKind === 'cover'
					? 'cover'
					: 'embedded'
				: 'attachment';

			if (articleId) {
				const { error: linkError } = await serviceSupabase.from('learn_article_asset_links').upsert(
					{
						article_id: articleId,
						asset_id: assetRow.id,
						created_by_user_id: user.id,
						usage_kind: resolvedUsageKind
					},
					{ onConflict: 'article_id,asset_id' }
				);

				if (linkError) {
					return json({ error: linkError.message }, { status: 500 });
				}
			}

			uploadedFiles.push({
				id: assetRow.id,
				articleId: assetRow.article_id,
				url: assetRow.public_url,
				fileName: assetRow.file_name,
				mimeType: assetRow.mime_type,
				sizeBytes: assetRow.size_bytes,
				createdAt: assetRow.created_at,
				sourceType: assetRow.source_type,
				sourcePath: assetRow.source_path,
				altText: assetRow.alt_text || '',
				altGenerated: Boolean(assetRow.metadata?.alt_generated),
				isDecorative: Boolean(assetRow.metadata?.is_decorative),
				metadata: assetRow.metadata || {},
				usageKind: resolvedUsageKind
			});
		}

		const aiAltStatus =
			imageCount === 0
				? 'not_applicable'
				: generatedAltCount === imageCount
					? 'generated'
					: generatedAltCount > 0
						? 'partial'
						: 'unavailable';
		const aiAltSummary = {
			totalImages: imageCount,
			generated: generatedAltCount,
			unavailable: Math.max(0, imageCount - generatedAltCount)
		};

		return json({ files: uploadedFiles, aiAltStatus, aiAltSummary });
	} catch (routeError) {
		const status = routeError?.status || 500;
		return json(
			{ error: routeError?.body?.message || routeError?.message || 'Upload failed.' },
			{ status }
		);
	}
}

export async function PATCH(event) {
	const { request, cookies } = event;
	try {
		const { user, supabase: userSupabase } = await requireLearnUser(cookies);
		const limited = enforceRateLimit(event, {
			name: 'learn-asset-alt-update',
			key: user.id,
			limit: 120,
			windowMs: 60 * 60 * 1000
		});
		if (limited) return limited;

		const parsed = await readJsonBody(request, { maxBytes: 16 * 1024 });
		if (!parsed.ok) {
			return json({ error: parsed.error }, { status: parsed.status });
		}

		const body = parsed.value && typeof parsed.value === 'object' ? parsed.value : {};
		const assetId = String(body.assetId || body.id || '').trim();
		const publicUrl = String(body.publicUrl || body.url || '').trim();

		const result = await updateLearnAssetAltAuthorized({
			userSupabase,
			user,
			assetId,
			publicUrl,
			altText: body.altText,
			isDecorative: body.isDecorative
		});
		if (!result.ok) {
			return json({ error: result.error }, { status: result.status });
		}

		return json({ asset: result.asset });
	} catch (routeError) {
		const status = routeError?.status || 500;
		return json(
			{ error: routeError?.body?.message || routeError?.message || 'Unable to update asset.' },
			{ status }
		);
	}
}
