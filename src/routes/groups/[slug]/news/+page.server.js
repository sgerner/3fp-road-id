import { error } from '@sveltejs/kit';
import {
	buildGroupNewsView,
	getGroupBySlug,
	getGroupNewsClient,
	getGroupNewsProfilesMap,
	listPublishedGroupNewsPosts
} from '$lib/server/groupNews';

export const load = async ({ params, cookies, url }) => {
	const { supabase } = getGroupNewsClient(cookies);
	const group = await getGroupBySlug(supabase, params.slug);

	if (!group) {
		throw error(404, 'Group not found.');
	}

	const posts = await listPublishedGroupNewsPosts(supabase, group.id);
	const profileIds = Array.from(
		new Set(
			posts
				.flatMap((post) => [post.created_by_user_id, post.updated_by_user_id])
				.filter((value) => Boolean(value))
		)
	);
	const profiles = await getGroupNewsProfilesMap(supabase, profileIds);
	const postViews = await Promise.all(posts.map((post) => buildGroupNewsView(post, { profiles })));
	const requestedSlug = (url.searchParams.get('open') || '').trim();
	const initialOpenSlug = postViews.some((post) => post.slug === requestedSlug)
		? requestedSlug
		: '';

	return {
		group,
		posts: postViews,
		initialOpenSlug,
		can_edit: false
	};
};
