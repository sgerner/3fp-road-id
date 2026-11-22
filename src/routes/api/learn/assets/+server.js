import path from 'node:path';
import { json } from '@sveltejs/kit';
import { extractMarkdownHeadings } from '#lib/learn/markdown';
import { sanitizeAltText } from '#lib/learn/altText';
import { getLearnServiceClient, requireLearnUser, slugifyLearn } from '#lib/server/learn';
import { generateLearnImageAltText } from '#lib/server/learnAi';
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
		const { user } = await requireLearnUser(cookies);
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
		const supabase = getLearnServiceClient();
		const formData = parsedForm.value;
		const articleId = String(formData.get('articleId') || '').trim() || null;
		let articleTitle = String(formData.get('articleTitle') || formData.get('title') || '')
			.trim()
			.slice(0, 300);
		let bodyMarkdown = String(formData.get('bodyMarkdown') || '').slice(0, 12_000);
		const enclosingLinkUrl = String(formData.get('enclosingLinkUrl') || '')
			.trim()
			.slice(0, 500);
		const files = formData.getAll('files').filter((entry) => entry instanceof File);

		if (!files.length) {
			return json({ error: 'No files were provided.' }, { status: 400 });
		}
		if (files.length > MAX_FILES) {
			return json({ error: `You can upload up to ${MAX_FILES} files at a time.` }, { status: 400 });
		}

		if (articleId && (!articleTitle || !bodyMarkdown)) {
			const { data: articleRow } = await supabase
				.from('learn_articles')
				.select('title, body_markdown')
				.eq('id', articleId)
				.maybeSingle();
			if (articleRow) {
				if (!articleTitle && articleRow.title)
					articleTitle = String(articleRow.title).slice(0, 300);
				if (!bodyMarkdown && articleRow.body_markdown) {
					bodyMarkdown = String(articleRow.body_markdown).slice(0, 12_000);
				}
			}
		}

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
			const uploadResult = await supabase.storage
				.from('learn-media')
				.upload(objectPath, optimized.buffer, {
					contentType: optimized.contentType,
					upsert: false
				});

			if (uploadResult.error) {
				return json({ error: uploadResult.error.message }, { status: 500 });
			}

			const { data: publicUrlData } = supabase.storage.from('learn-media').getPublicUrl(objectPath);
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

			const { data: assetRow, error: assetError } = await supabase
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

			if (articleId) {
				const { error: linkError } = await supabase.from('learn_article_asset_links').upsert(
					{
						article_id: articleId,
						asset_id: assetRow.id,
						created_by_user_id: user.id,
						usage_kind: file.type.startsWith('image/') ? 'embedded' : 'attachment'
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
				usageKind: file.type.startsWith('image/') ? 'embedded' : 'attachment'
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

		return json({ files: uploadedFiles, aiAltStatus });
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
		const { user } = await requireLearnUser(cookies);
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
		const assetId = String(body.assetId || '').trim();
		const publicUrl = String(body.publicUrl || '').trim();
		if (!assetId && !publicUrl) {
			return json({ error: 'Asset identifier is required.' }, { status: 400 });
		}

		const supabase = getLearnServiceClient();
		let lookup = supabase
			.from('learn_assets')
			.select('id, uploaded_by_user_id, file_name, public_url, alt_text, metadata');
		lookup = assetId ? lookup.eq('id', assetId) : lookup.eq('public_url', publicUrl);
		const { data: existing, error: fetchError } = await lookup.maybeSingle();
		if (fetchError) {
			return json({ error: fetchError.message }, { status: 500 });
		}
		if (!existing) {
			return json({ error: 'Asset not found.' }, { status: 404 });
		}

		const isDecorative = Boolean(body.isDecorative);
		const nextAlt = isDecorative
			? ''
			: sanitizeAltText(String(body.altText ?? ''), {
					fileName: existing.file_name || '',
					imageUrl: existing.public_url || ''
				});
		if (!isDecorative && String(body.altText ?? '').trim() && !nextAlt) {
			return json(
				{ error: 'Enter descriptive alt text instead of a filename or placeholder.' },
				{ status: 400 }
			);
		}

		const nextMetadata = {
			...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
			is_decorative: isDecorative,
			alt_reviewed: true
		};

		const { data: updated, error: updateError } = await supabase
			.from('learn_assets')
			.update({
				alt_text: nextAlt || null,
				metadata: nextMetadata
			})
			.eq('id', existing.id)
			.select('id, public_url, file_name, alt_text, metadata')
			.single();

		if (updateError) {
			return json({ error: updateError.message }, { status: 500 });
		}

		return json({
			asset: {
				id: updated.id,
				url: updated.public_url,
				fileName: updated.file_name,
				altText: updated.alt_text || '',
				altGenerated: Boolean(updated.metadata?.alt_generated),
				isDecorative: Boolean(updated.metadata?.is_decorative),
				metadata: updated.metadata || {}
			}
		});
	} catch (routeError) {
		const status = routeError?.status || 500;
		return json(
			{ error: routeError?.body?.message || routeError?.message || 'Unable to update asset.' },
			{ status }
		);
	}
}
