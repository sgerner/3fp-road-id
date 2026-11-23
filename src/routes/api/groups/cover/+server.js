import path from 'node:path';
import { json } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '#lib/server/supabaseClient';
import { resolveVerifiedSession } from '#lib/server/session';
import { optimizeImageForStorage } from '#lib/server/storageImages';
import { enforceRateLimit, readFormData } from '#lib/server/security';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FORM_BYTES = 14 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

function slugifyBaseName(fileName = '') {
	const ext = path.extname(fileName);
	const raw = path.basename(fileName || 'group-cover', ext);
	return (
		String(raw)
			.trim()
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 80) || 'group-cover'
	);
}

export async function POST(event) {
	const { request, cookies } = event;
	const { user, verified } = await resolveVerifiedSession(cookies);
	if (!verified || !user?.id) {
		return json({ error: 'Authentication required.' }, { status: 401 });
	}

	const userLimited = enforceRateLimit(event, {
		name: 'group-cover-upload-user',
		key: user.id,
		limit: 20,
		windowMs: 60 * 60 * 1000
	});
	if (userLimited) return userLimited;

	const ipLimited = enforceRateLimit(event, {
		name: 'group-cover-upload-ip',
		limit: 30,
		windowMs: 60 * 60 * 1000
	});
	if (ipLimited) return ipLimited;

	const supabase = createServiceSupabaseClient();
	if (!supabase) {
		return json({ error: 'Group cover uploads are not configured.' }, { status: 503 });
	}

	const parsedForm = await readFormData(request, { maxBytes: MAX_FORM_BYTES });
	if (!parsedForm.ok) {
		return json({ error: parsedForm.error }, { status: parsedForm.status });
	}

	const formData = parsedForm.value;
	const fileCandidate =
		formData.get('file') || formData.getAll('files').find((entry) => entry instanceof File);

	if (!(fileCandidate instanceof File)) {
		return json({ error: 'No cover image was provided.' }, { status: 400 });
	}

	if (!ALLOWED_TYPES.has(fileCandidate.type)) {
		return json(
			{ error: `Unsupported image type: ${fileCandidate.type || fileCandidate.name}` },
			{ status: 400 }
		);
	}

	if (fileCandidate.size > MAX_FILE_BYTES) {
		return json({ error: 'Cover image exceeds the 10 MB upload limit.' }, { status: 400 });
	}

	try {
		const sourceBuffer = Buffer.from(await fileCandidate.arrayBuffer());
		const optimized = await optimizeImageForStorage(sourceBuffer, {
			contentType: fileCandidate.type,
			maxWidth: 2400,
			maxHeight: 1800,
			quality: 82
		});
		const baseName = slugifyBaseName(fileCandidate.name);
		const safeExt = (optimized.extension || 'webp').replace(/^\./, '');
		const objectPath = `groups/uploads/${user.id}/${Date.now()}-${baseName}.${safeExt}`;

		const uploadResult = await supabase.storage
			.from('storage')
			.upload(objectPath, optimized.buffer, {
				contentType: optimized.contentType,
				upsert: false
			});

		if (uploadResult.error) {
			return json({ error: uploadResult.error.message }, { status: 500 });
		}

		const { data: publicUrlData } = supabase.storage.from('storage').getPublicUrl(objectPath);
		const url = publicUrlData?.publicUrl || '';
		if (!url) {
			return json({ error: 'Unable to resolve uploaded cover image URL.' }, { status: 500 });
		}

		return json({
			url,
			fileName: fileCandidate.name,
			mimeType: optimized.contentType,
			sizeBytes: optimized.optimizedBytes,
			objectPath
		});
	} catch (uploadError) {
		return json(
			{ error: uploadError?.message || 'Unable to process cover image.' },
			{ status: 400 }
		);
	}
}
