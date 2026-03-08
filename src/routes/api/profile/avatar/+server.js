import path from 'node:path';
import { json } from '@sveltejs/kit';
import { getActivityClient, getActivityServiceClient } from '$lib/server/activities';

const BUCKET_NAME = 'storage';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
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
		slugifySegment(path.basename(fileName || 'avatar-image', extension)) || 'avatar-image';
	return `profiles/${userId}/avatar-${Date.now()}-${baseName}${extension}`;
}

export async function POST({ request, cookies }) {
	const { user, supabase } = getActivityClient(cookies);
	if (!user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const storageClient = getActivityServiceClient() || supabase;
	if (!storageClient) {
		return json({ error: 'Avatar uploads are not configured.' }, { status: 500 });
	}

	const formData = await request.formData();
	const fileEntry = formData.get('file');
	if (!(fileEntry instanceof File)) {
		return json({ error: 'No image file was provided.' }, { status: 400 });
	}

	if (!ALLOWED_TYPES.has(fileEntry.type)) {
		return json({ error: 'Avatar must be a JPG, PNG, WEBP, or GIF image.' }, { status: 400 });
	}

	if (fileEntry.size > MAX_FILE_BYTES) {
		return json({ error: 'Avatar image exceeds the 5 MB upload limit.' }, { status: 400 });
	}

	const objectPath = buildObjectPath(user.id, fileEntry.name);
	const arrayBuffer = await fileEntry.arrayBuffer();
	const { error: uploadError } = await storageClient.storage
		.from(BUCKET_NAME)
		.upload(objectPath, arrayBuffer, {
			contentType: fileEntry.type,
			upsert: false
		});

	if (uploadError) {
		return json(
			{ error: uploadError.message || 'Unable to upload avatar image.' },
			{ status: 500 }
		);
	}

	const { data: publicUrlData } = storageClient.storage.from(BUCKET_NAME).getPublicUrl(objectPath);
	if (!publicUrlData?.publicUrl) {
		return json({ error: 'Unable to resolve avatar URL.' }, { status: 500 });
	}

	return json({ url: publicUrlData.publicUrl });
}
