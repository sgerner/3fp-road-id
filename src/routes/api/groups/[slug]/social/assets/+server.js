import path from 'node:path';
import { json } from '@sveltejs/kit';
import { requireGroupSocialManager } from '$lib/server/social/permissions';

const BUCKET_NAME = 'group-social-media';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 8;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function slugifySegment(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function buildObjectPath({ groupId, userId, fileName }) {
	const extension = path.extname(fileName || '').toLowerCase();
	const baseName =
		slugifySegment(path.basename(fileName || 'social-media', extension)) || 'social-media';
	return `groups/${groupId}/social/${userId}/${Date.now()}-${baseName}${extension}`;
}

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

			const objectPath = buildObjectPath({
				groupId: auth.group.id,
				userId: auth.userId,
				fileName: file.name
			});
			const arrayBuffer = await file.arrayBuffer();
			const uploadResult = await auth.serviceSupabase.storage
				.from(BUCKET_NAME)
				.upload(objectPath, arrayBuffer, {
					contentType: file.type,
					upsert: false
				});
			if (uploadResult.error) {
				return json({ error: uploadResult.error.message }, { status: 500 });
			}

			const { data } = auth.serviceSupabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath);
			uploaded.push({
				url: data?.publicUrl || null,
				file_name: file.name,
				mime_type: file.type,
				size_bytes: file.size,
				object_path: objectPath,
				bucket: BUCKET_NAME
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
