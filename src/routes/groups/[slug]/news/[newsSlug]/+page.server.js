import { error } from '@sveltejs/kit';
import {
	buildGroupNewsView,
	getGroupBySlug,
	getGroupNewsClient,
	getGroupNewsPostBySlug,
	getGroupNewsProfilesMap,
	listPublishedGroupNewsPosts
} from '$lib/server/groupNews';

export const load = async ({ params, cookies }) => {
	const { supabase } = getGroupNewsClient(cookies);
	const group = await getGroupBySlug(supabase, params.slug);

	if (!group) {
		throw error(404, 'Group not found.');
	}

	const post = await getGroupNewsPostBySlug(supabase, group.id, params.newsSlug);
	if (!post) {
		throw error(404, 'Announcement not found.');
	}

	const [profiles, relatedPosts] = await Promise.all([
		getGroupNewsProfilesMap(supabase, [post.created_by_user_id, post.updated_by_user_id]),
		listPublishedGroupNewsPosts(supabase, group.id, { limit: 4 })
	]);

	return {
		group,
		post: await buildGroupNewsView(post, { profiles }),
		relatedPosts: relatedPosts.filter((entry) => entry.id !== post.id).slice(0, 3)
	};
};
