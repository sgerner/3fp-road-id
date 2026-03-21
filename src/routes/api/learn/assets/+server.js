import path from 'node:path';
import { json } from '@sveltejs/kit';
import { getLearnServiceClient, requireLearnUser, slugifyLearn } from '$lib/server/learn';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/svg+xml',
	'application/pdf',
	'text/csv'
]);

function buildObjectPath(userId, fileName) {
	const extension = path.extname(fileName || '').toLowerCase();
	const base = slugifyLearn(path.basename(fileName || 'asset', extension)) || 'asset';
	return `${userId}/${Date.now()}-${base}${extension}`;
}

export async function POST({ request, cookies }) {
	try {
		const { user } = requireLearnUser(cookies);
		const supabase = getLearnServiceClient();
		const formData = await request.formData();
		const articleId = String(formData.get('articleId') || '').trim() || null;
		const files = formData.getAll('files').filter((entry) => entry instanceof File);

		if (!files.length) {
			return json({ error: 'No files were provided.' }, { status: 400 });
		}

		const uploadedFiles = [];

		for (const file of files) {
			if (!ALLOWED_TYPES.has(file.type)) {
				return json({ error: `Unsupported file type: ${file.type || file.name}` }, { status: 400 });
			}

			if (file.size > MAX_FILE_BYTES) {
				return json({ error: `${file.name} exceeds the 25 MB upload limit.` }, { status: 400 });
			}

			const objectPath = buildObjectPath(user.id, file.name);
			const arrayBuffer = await file.arrayBuffer();
			const uploadResult = await supabase.storage
				.from('learn-media')
				.upload(objectPath, arrayBuffer, {
					contentType: file.type,
					upsert: false
				});

			if (uploadResult.error) {
				return json({ error: uploadResult.error.message }, { status: 500 });
			}

			const { data: publicUrlData } = supabase.storage.from('learn-media').getPublicUrl(objectPath);
			const publicUrl = publicUrlData?.publicUrl || null;

			const { data: assetRow, error: assetError } = await supabase
				.from('learn_assets')
				.insert({
					article_id: articleId,
					uploaded_by_user_id: user.id,
					object_path: objectPath,
					public_url: publicUrl,
					file_name: file.name,
					mime_type: file.type,
					size_bytes: file.size,
					source_type: 'upload',
					metadata: {}
				})
				.select(
					'id, article_id, object_path, public_url, file_name, mime_type, size_bytes, created_at, source_type, source_path'
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
				usageKind: file.type.startsWith('image/') ? 'embedded' : 'attachment'
			});
		}

		return json({ files: uploadedFiles });
	} catch (routeError) {
		const status = routeError?.status || 500;
		return json(
			{ error: routeError?.body?.message || routeError?.message || 'Upload failed.' },
			{ status }
		);
	}
}
