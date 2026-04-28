import { error } from '@sveltejs/kit';
import { cleanGroupAssetBucket } from '$lib/groups/assets';
import { getGroupAssetsReadClient, listGroupAssetBuckets } from '$lib/server/groupAssets';
import { resolveSession } from '$lib/server/session';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';

export const load = async ({ params, cookies, url }) => {
	const supabase = getGroupAssetsReadClient();
	const { data: group, error: groupError } = await supabase
		.from('groups')
		.select('id,slug,name,logo_url,is_published')
		.eq('slug', params.slug)
		.maybeSingle();

	if (groupError) throw error(500, groupError.message);
	if (!group) throw error(404, 'Group not found.');

	const buckets = await listGroupAssetBuckets(supabase, group.id, { includeEmpty: true }).catch(
		(err) => {
			throw error(500, err?.message || 'Failed to load assets.');
		}
	);
	const bucketsWithAssets = buckets.filter((bucket) => bucket.asset_count > 0);
	if (!bucketsWithAssets.length) throw error(404, 'No shared assets found for this group.');

	const bucketParam = cleanGroupAssetBucket(url.searchParams.get('bucket'));
	const hasBucketParam = bucketsWithAssets.some((bucket) => bucket.slug === bucketParam);
	const activeBucket = hasBucketParam ? bucketParam : bucketsWithAssets[0].slug;

	const { accessToken, user } = resolveSession(cookies);
	let canEdit = false;
	if (accessToken && user?.id) {
		try {
			const requestSupabase = createRequestSupabaseClient(accessToken);
			const { data: profile } = await requestSupabase
				.from('profiles')
				.select('admin')
				.eq('user_id', user.id)
				.maybeSingle();

			if (profile?.admin === true) {
				canEdit = true;
			} else {
				const { data: ownerRows } = await requestSupabase
					.from('group_members')
					.select('user_id')
					.eq('group_id', group.id)
					.eq('user_id', user.id)
					.eq('role', 'owner')
					.limit(1);
				canEdit = Array.isArray(ownerRows) && ownerRows.length > 0;
			}
		} catch (err) {
			console.warn('Failed to resolve group asset edit permissions', err);
			canEdit = false;
		}
	}

	return {
		group,
		buckets: bucketsWithAssets,
		active_bucket: activeBucket,
		can_edit: canEdit
	};
};
