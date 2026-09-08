import { json } from '@sveltejs/kit';
import { getActivityClient, getActivityServiceClient } from '$lib/server/activities';
import { optimizeImageForStorage } from '$lib/server/storageImages';

const BUCKET_NAME = 'storage';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function buildObjectPath(userId, extension) {
	return `profiles/${userId}/avatar.${extension}`;
}

function objectPathFromPublicUrl(value) {
	try {
		const parsed = new URL(value);
		const marker = '/storage/v1/object/public/storage/';
		const index = parsed.pathname.indexOf(marker);
		if (index === -1) return null;
		return decodeURIComponent(parsed.pathname.slice(index + marker.length));
	} catch {
		return null;
	}
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

	const { data: currentProfile } = await storageClient
		.from('profiles')
		.select('avatar_url')
		.eq('user_id', user.id)
		.maybeSingle();
	const optimized = await optimizeImageForStorage(Buffer.from(await fileEntry.arrayBuffer()), {
		contentType: fileEntry.type,
		maxWidth: 512,
		maxHeight: 512,
		quality: 80
	});
	const objectPath = buildObjectPath(user.id, optimized.extension);
	const { error: uploadError } = await storageClient.storage
		.from(BUCKET_NAME)
		.upload(objectPath, optimized.buffer, {
			contentType: optimized.contentType,
			upsert: true
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

	const previousPath = objectPathFromPublicUrl(currentProfile?.avatar_url);
	if (previousPath && previousPath !== objectPath) {
		await storageClient.storage
			.from(BUCKET_NAME)
			.remove([previousPath])
			.catch(() => null);
	}

	return json({ url: `${publicUrlData.publicUrl}?v=${Date.now()}` });
}
