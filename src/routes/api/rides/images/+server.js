import { json } from '@sveltejs/kit';
import { uploadCanonicalMediaAsset } from '$lib/server/mediaAssets';
import { getActivityClient, getActivityServiceClient } from '$lib/server/activities';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 6;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST({ request, cookies }) {
	const { user } = getActivityClient(cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const supabase = getActivityServiceClient();
	if (!supabase) {
		return json({ error: 'Ride uploads are not configured.' }, { status: 500 });
	}

	const formData = await request.formData();
	const files = formData.getAll('files').filter((entry) => entry instanceof File);

	if (!files.length) {
		return json({ error: 'No images were provided.' }, { status: 400 });
	}

	if (files.length > MAX_FILES) {
		return json({ error: `You can upload up to ${MAX_FILES} images at a time.` }, { status: 400 });
	}

	const uploaded = [];

	for (const file of files) {
		if (!ALLOWED_TYPES.has(file.type)) {
			return json({ error: `Unsupported image type: ${file.type || file.name}` }, { status: 400 });
		}

		if (file.size > MAX_FILE_BYTES) {
			return json({ error: `${file.name} exceeds the 10 MB upload limit.` }, { status: 400 });
		}

		const uploadedAsset = await uploadCanonicalMediaAsset({
			supabase,
			bucketId: 'ride-media',
			contentType: file.type,
			buffer: await file.arrayBuffer(),
			fileName: file.name,
			sizeBytes: file.size
		});

		uploaded.push({
			url: uploadedAsset.url,
			fileName: file.name,
			file_name: uploadedAsset.file_name || file.name,
			mime_type: uploadedAsset.mime_type || file.type,
			size_bytes: uploadedAsset.size_bytes ?? file.size,
			object_path: uploadedAsset.object_path || null,
			bucket: 'ride-media',
			content_hash: uploadedAsset.content_hash || null
		});
	}

	return json({ files: uploaded.filter((file) => file.url) });
}
