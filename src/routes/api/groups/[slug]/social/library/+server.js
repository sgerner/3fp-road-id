import { json } from '@sveltejs/kit';
import path from 'node:path';
import {
	createGroupSocialLibraryItem,
	listGroupSocialLibraryItems,
	listGroupSocialPosts,
	serializeSocialLibraryItem
} from '$lib/server/social/db';
import { requireGroupSocialManager } from '$lib/server/social/permissions';

const BUCKET_NAME = 'group-social-media';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 8;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

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

function normalizeMediaList(value) {
	if (!Array.isArray(value)) return [];
	const normalized = [];
	for (const entry of value) {
		if (typeof entry === 'string') {
			const url = cleanText(entry, 2000);
			if (!url) continue;
			normalized.push({ url });
			continue;
		}
		if (!entry || typeof entry !== 'object') continue;
		const url = cleanText(entry.url || entry.public_url || entry.src, 2000);
		if (!url) continue;
		normalized.push({ url, type: cleanText(entry.type, 40) || 'image' });
	}
	return normalized;
}

async function uploadMediaFiles(auth, files = []) {
	if (!Array.isArray(files) || files.length === 0) return [];
	if (files.length > MAX_FILES) {
		throw new Error(`You can upload up to ${MAX_FILES} files at once.`);
	}

	const uploaded = [];
	for (const file of files) {
		if (!(file instanceof File)) continue;
		if (!ALLOWED_TYPES.has(file.type)) {
			throw new Error(`Unsupported file type: ${file.type || file.name}`);
		}
		if (file.size > MAX_FILE_BYTES) {
			throw new Error(`${file.name} exceeds the 15 MB upload limit.`);
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
			throw new Error(uploadResult.error.message);
		}

		const { data } = auth.serviceSupabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath);
		const url = data?.publicUrl || null;
		if (url) {
			uploaded.push({
				url,
				file_name: file.name,
				mime_type: file.type,
				size_bytes: file.size,
				object_path: objectPath,
				bucket: BUCKET_NAME
			});
		}
	}

	return uploaded;
}

function normalizeFilter(value) {
	const cleaned = cleanText(value, 40).toLowerCase();
	if (cleaned === 'posted' || cleaned === 'scheduled' || cleaned === 'unused') return cleaned;
	return 'all';
}

function buildUsageByLibraryItem(posts = []) {
	const usage = new Map();
	for (const post of posts) {
		const key = cleanText(post?.content_library_item_id, 120);
		if (!key) continue;
		const status = cleanText(post?.status, 40).toLowerCase();
		if (!usage.has(key)) {
			usage.set(key, { posted: false, scheduled: false, usage_count: 0 });
		}
		const entry = usage.get(key);
		entry.usage_count += 1;
		if (status === 'published') entry.posted = true;
		if (status === 'scheduled' || status === 'queued' || status === 'publishing') {
			entry.scheduled = true;
		}
	}
	return usage;
}

function usageFilterMatch(filter, entry) {
	if (filter === 'posted') return entry.posted;
	if (filter === 'scheduled') return entry.scheduled;
	if (filter === 'unused') return !entry.posted && !entry.scheduled && entry.usage_count === 0;
	return true;
}

export async function GET({ cookies, params, url }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}
		const filter = normalizeFilter(url.searchParams.get('filter'));
		const [items, posts] = await Promise.all([
			listGroupSocialLibraryItems(auth.serviceSupabase, auth.group.id, { limit: 200 }),
			listGroupSocialPosts(auth.serviceSupabase, auth.group.id, { limit: 300 })
		]);
		const usageMap = buildUsageByLibraryItem(posts);
		const hydrated = items
			.map((item) => {
				const usage = usageMap.get(String(item.id)) || {
					posted: false,
					scheduled: false,
					usage_count: 0
				};
				return {
					...serializeSocialLibraryItem(item),
					usage
				};
			})
			.filter((item) => usageFilterMatch(filter, item.usage));

		return json({ data: hydrated, filter });
	} catch (error) {
		console.error('Unable to load social content library', error);
		return json({ error: error?.message || 'Unable to load content library.' }, { status: 500 });
	}
}

export async function POST({ cookies, params, request }) {
	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const contentType = cleanText(request.headers.get('content-type'), 200).toLowerCase();
		let body = {};
		let media = [];

		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			const files = formData.getAll('files').filter((entry) => entry instanceof File);
			media = await uploadMediaFiles(auth, files);
			body = Object.fromEntries(formData.entries());
		} else {
			body = await request.json().catch(() => ({}));
			media = normalizeMediaList(body.media);
		}

		if (!media.length) {
			return json(
				{ error: 'Content library entries must include at least one uploaded image.' },
				{ status: 400 }
			);
		}

		const created = await createGroupSocialLibraryItem(auth.serviceSupabase, {
			group_id: auth.group.id,
			created_by: auth.userId,
			caption: '',
			ai_prompt: null,
			post_target: 'page',
			ai_add_page_text: false,
			media,
			metadata: {}
		});

		return json({ data: serializeSocialLibraryItem(created) });
	} catch (error) {
		console.error('Unable to save social content library entry', error);
		return json(
			{ error: error?.message || 'Unable to save content library entry.' },
			{ status: 500 }
		);
	}
}
