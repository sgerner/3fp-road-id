import path from 'node:path';
import { json } from '@sveltejs/kit';
import { getActivityClient, getActivityServiceClient } from '$lib/server/activities';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 6;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function slugifySegment(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function buildObjectPath(userId, fileName) {
	const extension = path.extname(fileName || '').toLowerCase();
	const baseName =
		slugifySegment(path.basename(fileName || 'ride-image', extension)) || 'ride-image';
	return `${userId}/${Date.now()}-${baseName}${extension}`;
}

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

		const objectPath = buildObjectPath(user.id, file.name);
		const arrayBuffer = await file.arrayBuffer();
		const uploadResult = await supabase.storage.from('ride-media').upload(objectPath, arrayBuffer, {
			contentType: file.type,
			upsert: false
		});

		if (uploadResult.error) {
			return json({ error: uploadResult.error.message }, { status: 500 });
		}

		const { data: publicUrlData } = supabase.storage.from('ride-media').getPublicUrl(objectPath);
		uploaded.push({
			url: publicUrlData?.publicUrl || null,
			fileName: file.name
		});
	}

	return json({ files: uploaded.filter((file) => file.url) });
}
