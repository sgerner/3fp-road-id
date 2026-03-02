import { fail, redirect } from '@sveltejs/kit';
import {
	ensureUniqueLearnSlug,
	getLearnClient,
	normalizeLearnPayload,
	requireLearnUser,
	withLearnReadingAid
} from '$lib/server/learn';

export const load = async ({ cookies, url }) => {
	const { user, supabase } = getLearnClient(cookies);
	if (!user) {
		throw redirect(303, `/learn?auth=required&returnTo=${encodeURIComponent(url.pathname)}`);
	}

	const [{ data: categories }, { data: subcategories }] = await Promise.all([
		supabase.from('learn_categories').select('slug, name').order('name'),
		supabase.from('learn_subcategories').select('slug, name, category_slug').order('sort_order')
	]);

	return {
		currentUser: user,
		categories: categories ?? [],
		subcategories: subcategories ?? [],
		initialValues: {
			title: '',
			slug: '',
			summary: '',
			bodyMarkdown: '',
			editorMode: 'wysiwyg',
			categoryName: 'General',
			coverImageUrl: ''
		}
	};
};

export const actions = {
	default: async ({ request, cookies }) => {
		try {
			const { user, supabase } = requireLearnUser(cookies);
			const formData = await request.formData();
			const payload = withLearnReadingAid(normalizeLearnPayload(formData));
			const slug = await ensureUniqueLearnSlug(supabase, payload.slug || payload.title);

			const { data, error: insertError } = await supabase
				.from('learn_articles')
				.insert({
					...payload,
					slug,
					created_by_user_id: user.id,
					updated_by_user_id: user.id,
					is_published: true
				})
				.select('slug')
				.single();

			if (insertError) {
				return fail(400, {
					error: insertError.message,
					values: {
						title: payload.title,
						slug: payload.slug,
						summary: payload.summary ?? '',
						bodyMarkdown: payload.body_markdown,
						editorMode: payload.editor_mode,
						categoryName: payload.category_name,
						coverImageUrl: payload.cover_image_url ?? ''
					}
				});
			}

			throw redirect(303, `/learn/${data.slug}`);
		} catch (actionError) {
			if (actionError?.status === 303) throw actionError;

			return fail(actionError?.status || 400, {
				error: actionError?.body?.message || actionError?.message || 'Unable to create article.'
			});
		}
	}
};
