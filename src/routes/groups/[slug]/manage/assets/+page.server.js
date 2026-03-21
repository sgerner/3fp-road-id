import path from 'node:path';
import { fail } from '@sveltejs/kit';
import { GROUP_ASSET_BUCKET } from '$lib/groups/assets';
import {
	buildGroupAssetObjectPath,
	ensureCanonicalGroupAssetSections,
	getGroupAssetsReadClient,
	listGroupAssetBuckets,
	removeStoredGroupAssetFiles,
	requireGroupAssetManager,
	sanitizeExternalUrl,
	validateAssetUpload
} from '$lib/server/groupAssets';

async function loadManagedAsset(auth, assetId) {
	const { data, error } = await auth.serviceSupabase
		.from('group_assets')
		.select('id, group_id, object_path, asset_kind')
		.eq('group_id', auth.group.id)
		.eq('id', assetId)
		.maybeSingle();

	if (error) throw new Error(error.message);
	return data ?? null;
}

async function nextSortOrderForSection(supabase, groupId, sectionId) {
	const { data, error } = await supabase
		.from('group_assets')
		.select('sort_order')
		.eq('group_id', groupId)
		.eq('section_id', sectionId)
		.order('sort_order', { ascending: false })
		.limit(1);

	if (error) throw new Error(error.message);
	return Number(data?.[0]?.sort_order ?? -1) + 1;
}

async function uploadBucketFiles(auth, files, bucket) {
	const sections = await ensureCanonicalGroupAssetSections(
		auth.serviceSupabase,
		auth.group.id,
		auth.userId
	);
	const section = sections[bucket];
	if (!section?.id) {
		throw new Error('Unable to resolve the storage bucket for this asset type.');
	}

	for (const file of files) {
		const validationError = validateAssetUpload(file, bucket);
		if (validationError) {
			return { ok: false, status: 400, error: validationError };
		}
	}

	let sortOrder = await nextSortOrderForSection(auth.serviceSupabase, auth.group.id, section.id);
	const uploadedObjectPaths = [];
	const insertedAssetIds = [];

	for (const file of files) {
		const objectPath = buildGroupAssetObjectPath({
			groupId: auth.group.id,
			bucket,
			fileName: file.name
		});
		const arrayBuffer = await file.arrayBuffer();
		const upload = await auth.serviceSupabase.storage
			.from(GROUP_ASSET_BUCKET)
			.upload(objectPath, arrayBuffer, {
				contentType: file.type,
				upsert: false
			});

		if (upload.error) {
			await removeStoredGroupAssetFiles(
				auth.serviceSupabase,
				uploadedObjectPaths.map((storedPath) => ({ object_path: storedPath }))
			);
			if (insertedAssetIds.length) {
				await auth.serviceSupabase.from('group_assets').delete().in('id', insertedAssetIds);
			}
			return { ok: false, status: 500, error: upload.error.message };
		}

		uploadedObjectPaths.push(objectPath);
		const { data: publicUrlData } = auth.serviceSupabase.storage
			.from(GROUP_ASSET_BUCKET)
			.getPublicUrl(objectPath);

		const insert = await auth.serviceSupabase
			.from('group_assets')
			.insert({
				group_id: auth.group.id,
				section_id: section.id,
				created_by_user_id: auth.userId,
				asset_kind: 'file',
				title: file.name,
				description: null,
				sort_order: sortOrder,
				file_url: publicUrlData?.publicUrl || null,
				bucket_id: GROUP_ASSET_BUCKET,
				object_path: objectPath,
				file_name: file.name,
				mime_type: file.type,
				size_bytes: file.size,
				metadata: {
					extension: path.extname(file.name || '').toLowerCase(),
					bucket
				}
			})
			.select('id')
			.single();

		if (insert.error) {
			await removeStoredGroupAssetFiles(
				auth.serviceSupabase,
				uploadedObjectPaths.map((storedPath) => ({ object_path: storedPath }))
			);
			if (insertedAssetIds.length) {
				await auth.serviceSupabase.from('group_assets').delete().in('id', insertedAssetIds);
			}
			return { ok: false, status: 500, error: insert.error.message };
		}

		insertedAssetIds.push(insert.data.id);
		sortOrder += 1;
	}

	return { ok: true };
}

export const load = async ({ parent, cookies, params }) => {
	const { group } = await parent();
	const auth = await requireGroupAssetManager(cookies, params.slug);
	if (auth.ok) {
		await ensureCanonicalGroupAssetSections(auth.serviceSupabase, auth.group.id, auth.userId).catch(
			(err) => {
				console.warn('Failed to ensure canonical group asset sections', err);
			}
		);
	}

	const buckets = await listGroupAssetBuckets(getGroupAssetsReadClient(), group.id, {
		includeEmpty: true
	}).catch((err) => {
		console.warn('Failed to load group asset buckets for manage page', err);
		return [];
	});

	return {
		buckets
	};
};

export const actions = {
	uploadPhotos: async ({ cookies, params, request }) => {
		const auth = await requireGroupAssetManager(cookies, params.slug);
		if (!auth.ok) return fail(auth.status, { error: auth.error });

		const formData = await request.formData();
		const files = formData.getAll('files').filter((entry) => entry instanceof File);
		if (!files.length) {
			return fail(400, { error: 'Choose at least one photo to upload.' });
		}

		const result = await uploadBucketFiles(auth, files, 'photos');
		if (!result.ok) {
			return fail(result.status, { error: result.error });
		}

		return { success: 'Photos uploaded successfully.' };
	},

	updateLink: async ({ cookies, params, request }) => {
		const auth = await requireGroupAssetManager(cookies, params.slug);
		if (!auth.ok) return fail(auth.status, { error: auth.error });

		const formData = await request.formData();
		const assetId = String(formData.get('asset_id') || '').trim();
		const title = String(formData.get('title') || '').trim();
		const description = String(formData.get('description') || '').trim() || null;
		const externalUrl = sanitizeExternalUrl(formData.get('external_url'));

		if (!assetId) {
			return fail(400, { error: 'Asset id is required.' });
		}
		if (!title) {
			return fail(400, { error: 'Link title is required.' });
		}
		if (!externalUrl) {
			return fail(400, { error: 'Enter a valid http(s) URL.' });
		}

		try {
			const asset = await loadManagedAsset(auth, assetId);
			if (!asset || asset.asset_kind !== 'link') {
				return fail(404, { error: 'Link asset not found.' });
			}

			const { error } = await auth.serviceSupabase
				.from('group_assets')
				.update({
					title,
					description,
					external_url: externalUrl
				})
				.eq('id', asset.id)
				.eq('group_id', auth.group.id)
				.eq('asset_kind', 'link');

			if (error) {
				return fail(500, { error: error.message });
			}
		} catch (err) {
			return fail(500, { error: err?.message || 'Unable to update link.' });
		}

		return { updated: true };
	},

	uploadFiles: async ({ cookies, params, request }) => {
		const auth = await requireGroupAssetManager(cookies, params.slug);
		if (!auth.ok) return fail(auth.status, { error: auth.error });

		const formData = await request.formData();
		const files = formData.getAll('files').filter((entry) => entry instanceof File);
		if (!files.length) {
			return fail(400, { error: 'Choose at least one file to upload.' });
		}

		const result = await uploadBucketFiles(auth, files, 'files');
		if (!result.ok) {
			return fail(result.status, { error: result.error });
		}

		return { success: 'Files uploaded successfully.' };
	},

	addLink: async ({ cookies, params, request }) => {
		const auth = await requireGroupAssetManager(cookies, params.slug);
		if (!auth.ok) return fail(auth.status, { error: auth.error });

		const formData = await request.formData();
		const title = String(formData.get('title') || '').trim();
		const description = String(formData.get('description') || '').trim() || null;
		const externalUrl = sanitizeExternalUrl(formData.get('external_url'));

		if (!title) {
			return fail(400, { error: 'Link title is required.' });
		}
		if (!externalUrl) {
			return fail(400, { error: 'Enter a valid http(s) URL.' });
		}

		try {
			const sections = await ensureCanonicalGroupAssetSections(
				auth.serviceSupabase,
				auth.group.id,
				auth.userId
			);
			const section = sections.links;
			const sortOrder = await nextSortOrderForSection(
				auth.serviceSupabase,
				auth.group.id,
				section.id
			);

			const { error } = await auth.serviceSupabase.from('group_assets').insert({
				group_id: auth.group.id,
				section_id: section.id,
				created_by_user_id: auth.userId,
				asset_kind: 'link',
				title,
				description,
				sort_order: sortOrder,
				external_url: externalUrl,
				metadata: {
					bucket: 'links'
				}
			});

			if (error) {
				return fail(500, { error: error.message });
			}
		} catch (err) {
			return fail(500, { error: err?.message || 'Unable to add link.' });
		}

		return { success: 'Link added successfully.' };
	},

	deleteAsset: async ({ cookies, params, request }) => {
		const auth = await requireGroupAssetManager(cookies, params.slug);
		if (!auth.ok) return fail(auth.status, { error: auth.error });

		const formData = await request.formData();
		const assetId = String(formData.get('asset_id') || '').trim();
		if (!assetId) {
			return fail(400, { error: 'Asset id is required.' });
		}

		try {
			const asset = await loadManagedAsset(auth, assetId);
			if (!asset) {
				return fail(404, { error: 'Asset not found.' });
			}

			await removeStoredGroupAssetFiles(auth.serviceSupabase, [asset]);

			const { error } = await auth.serviceSupabase
				.from('group_assets')
				.delete()
				.eq('id', asset.id)
				.eq('group_id', auth.group.id);

			if (error) {
				return fail(500, { error: error.message });
			}
		} catch (err) {
			return fail(500, { error: err?.message || 'Unable to remove asset.' });
		}

		return { success: 'Asset removed successfully.' };
	}
};
