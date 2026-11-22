import { error } from '@sveltejs/kit';
import {
	buildGroupNewsView,
	getGroupBySlug,
	getGroupNewsClient,
	getGroupNewsProfilesMap,
	getGroupNewsPublicReadClient,
	getPublicGroupBySlug,
	listPublicGroupNewsPosts,
	listPublishedGroupNewsPosts
} from '#lib/server/groupNews';

export const load = async ({ params, cookies, url }) => {
	const { user, supabase } = await getGroupNewsClient(cookies);
	const isAuthenticated = Boolean(user?.id);
	const readClient = isAuthenticated ? supabase : getGroupNewsPublicReadClient();
	const group = isAuthenticated
		? await getGroupBySlug(supabase, params.slug)
		: await getPublicGroupBySlug(readClient, params.slug);

	if (!group) {
		throw error(404, 'Group not found.');
	}

	const posts = isAuthenticated
		? await listPublishedGroupNewsPosts(supabase, group.id)
		: await listPublicGroupNewsPosts(readClient, group.id);
	const profileIds = Array.from(
		new Set(
			posts
				.flatMap((post) => [post.created_by_user_id, post.updated_by_user_id])
				.filter((value) => Boolean(value))
		)
	);
	const profiles = await getGroupNewsProfilesMap(readClient, profileIds);
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
