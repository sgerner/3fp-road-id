import { fail, redirect } from '@sveltejs/kit';
import {
	getLearnClient,
	requireLearnUser,
	learnFormDataValues,
	syncLearnCoverAsset
} from '#lib/server/learn';
import { loadLearnEditorOptions, prepareLearnArticleSave } from '#lib/server/learnEditor';
import { syncLearnArticleChunks } from '#lib/server/learnDiscovery';

export const load = async ({ cookies, url }) => {
	const { user, supabase } = await getLearnClient(cookies);
	if (!user) {
		throw redirect(303, `/learn?auth=required&returnTo=${encodeURIComponent(url.pathname)}`);
	}

	const editorOptions = await loadLearnEditorOptions(supabase, user.id);

	return {
		currentUser: user,
		...editorOptions,
		initialValues: {
			title: '',
			slug: '',
			summary: '',
			bodyMarkdown: '',
			editorMode: 'wysiwyg',
			categoryName: 'General',
			coverImageUrl: '',
			coverImageAlt: ''
		}
	};
};

export const actions = {
	default: async (event) => {
		const { request, cookies } = event;
		let values = null;
		try {
			const { user, supabase } = await requireLearnUser(cookies);
			const formData = await request.formData();
			values = learnFormDataValues(formData);
			const { record, chunks } = await prepareLearnArticleSave(event, { supabase, user, formData });

			const { data, error: insertError } = await supabase
				.from('learn_articles')
				.insert({
					...record,
					created_by_user_id: user.id,
					updated_by_user_id: user.id,
					is_published: true
				})
				.select('id,slug')
				.single();

			if (insertError) {
				return fail(400, {
					error: insertError.message,
					values
				});
			}

			if (record.cover_image_url) {
				await syncLearnCoverAsset(supabase, {
					articleId: data.id,
					coverImageUrl: record.cover_image_url,
					coverImageAlt: values.coverImageAlt,
					user
				});
			}

			await syncLearnArticleChunks(supabase, {
				articleId: data.id,
				chunks,
				userId: user.id
			});

			throw redirect(303, `/learn/${data.slug}`);
		} catch (actionError) {
			if (actionError?.status === 303) throw actionError;

			return fail(actionError?.status || 400, {
				error: actionError?.body?.message || actionError?.message || 'Unable to create article.',
				...(values ? { values } : {})
			});
		}
	}
};
