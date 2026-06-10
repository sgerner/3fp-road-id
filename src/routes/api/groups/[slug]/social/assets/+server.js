import { json } from '@sveltejs/kit';
import { uploadCanonicalMediaAsset } from '$lib/server/mediaAssets';
import { requireGroupSocialManager } from '$lib/server/social/permissions';

const BUCKET_NAME = 'group-social-media';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 8;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST({ cookies, params, request }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const formData = await request.formData();
		const files = formData.getAll('files').filter((entry) => entry instanceof File);
		if (!files.length) {
			return json({ error: 'No images were provided.' }, { status: 400 });
		}
		if (files.length > MAX_FILES) {
			return json({ error: `You can upload up to ${MAX_FILES} files at once.` }, { status: 400 });
		}

		const uploaded = [];
		for (const file of files) {
			if (!ALLOWED_TYPES.has(file.type)) {
				return json({ error: `Unsupported file type: ${file.type || file.name}` }, { status: 400 });
			}
			if (file.size > MAX_FILE_BYTES) {
				return json({ error: `${file.name} exceeds the 15 MB upload limit.` }, { status: 400 });
			}

			const uploadedAsset = await uploadCanonicalMediaAsset({
				supabase: auth.serviceSupabase,
				bucketId: BUCKET_NAME,
				contentType: file.type,
				buffer: await file.arrayBuffer(),
				fileName: file.name,
				sizeBytes: file.size
			});

			uploaded.push({
				url: uploadedAsset.url,
				file_name: uploadedAsset.file_name || file.name,
				mime_type: uploadedAsset.mime_type || file.type,
				size_bytes: uploadedAsset.size_bytes ?? file.size,
				object_path: uploadedAsset.object_path || null,
				bucket: BUCKET_NAME,
				content_hash: uploadedAsset.content_hash || null
			});
		}

		return json({
			data: uploaded.filter((file) => file.url)
		});
	} catch (error) {
		console.error('Unable to upload group social media assets', error);
		return json(
			{ error: error?.message || 'Unable to upload social media assets.' },
			{ status: 500 }
		);
	}
}
