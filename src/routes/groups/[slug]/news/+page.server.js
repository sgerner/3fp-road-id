import { error } from '@sveltejs/kit';
import {
	getGroupBySlug,
	getGroupNewsClient,
	listPublishedGroupNewsPosts
} from '$lib/server/groupNews';

export const load = async ({ params, cookies }) => {
	const { supabase } = getGroupNewsClient(cookies);
	const group = await getGroupBySlug(supabase, params.slug);

	if (!group) {
		throw error(404, 'Group not found.');
	}

	const posts = await listPublishedGroupNewsPosts(supabase, group.id);

	return {
		group,
		posts,
		can_edit: false
	};
};
