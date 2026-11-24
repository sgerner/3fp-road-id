import { optimizeImageForStorage } from '#lib/server/storageImages.js';

export function parseGroupEditorImageDataUrl(dataUrl) {
	if (!dataUrl || typeof dataUrl !== 'string') return null;
	const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
	if (!match) return null;
	const [, mime, base64] = match;
	try {
		return { mime, buffer: Buffer.from(base64, 'base64') };
	} catch {
		return null;
	}
}

export async function uploadGroupEditorImageDataUrl(supabase, dataUrl, destBasePath) {
	const parsed = parseGroupEditorImageDataUrl(dataUrl);
	if (!parsed) return null;
	const contentType = parsed.mime || 'image/jpeg';
	if (!contentType.startsWith('image/')) return null;
	const optimized = await optimizeImageForStorage(parsed.buffer, {
		contentType,
		maxWidth: 2400,
		maxHeight: 1800,
		quality: 82
	});

	const objectPath = `${destBasePath}.${optimized.extension}`;
	const { error } = await supabase.storage.from('storage').upload(objectPath, optimized.buffer, {
		contentType: optimized.contentType,
		upsert: true
	});
	if (error) return null;

	const { data } = supabase.storage.from('storage').getPublicUrl(objectPath);
	return data?.publicUrl || null;
}
