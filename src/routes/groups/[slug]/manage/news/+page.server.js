import { fail, redirect } from '@sveltejs/kit';
import {
	countGroupUpdateEmailRecipients,
	ensureUniqueGroupNewsSlug,
	getGroupNewsPostBySlug,
	getGroupNewsIntent,
	getGroupNewsPostById,
	getGroupNewsPostId,
	getGroupNewsClient,
	getGroupNewsServiceClient,
	listGroupNewsPostsForManagement,
	normalizeGroupNewsPayload,
	queueGroupUpdateEmailBatch,
	requireGroupNewsManager,
	toGroupNewsFormValues
} from '$lib/server/groupNews';

export const load = async ({ parent, cookies, url }) => {
	const parentData = await parent();
	const { supabase } = getGroupNewsClient(cookies);
	const serviceSupabase = getGroupNewsServiceClient();
	const posts = await listGroupNewsPostsForManagement(supabase, parentData.group.id);
	const editSlug = url.searchParams.get('edit') || '';
	const selectedPost = editSlug ? (posts.find((post) => post.slug === editSlug) ?? null) : null;
	let memberEmailCount = 0;
	if (serviceSupabase) {
		try {
			memberEmailCount = await countGroupUpdateEmailRecipients(
				serviceSupabase,
				parentData.group.id
			);
		} catch (err) {
			console.warn('Failed to load update email recipient count for manage page', err);
			memberEmailCount = 0;
		}
	}

	return {
		group: parentData.group,
		posts,
		memberEmailCount,
		selectedPost,
		selectedSlug: selectedPost?.slug || '',
		initialValues: toGroupNewsFormValues(selectedPost)
	};
};

export const actions = {
	default: async ({ request, cookies, params, url }) => {
		try {
			const { user, supabase, group } = await requireGroupNewsManager(cookies, params.slug);
			const serviceSupabase = getGroupNewsServiceClient();
			const formData = await request.formData();
			const intent = getGroupNewsIntent(formData);
			const postId = getGroupNewsPostId(formData);
			const shouldEmailMembers = formData.get('emailMembers') === 'on';
			const existing = postId
				? await getGroupNewsPostById(supabase, group.id, postId, { includeDrafts: true })
				: null;

			if (intent === 'delete') {
				if (!existing) {
					return fail(404, { error: 'Update not found.' });
				}

				const { error: deleteError } = await supabase
					.from('group_news_posts')
					.delete()
					.eq('id', existing.id);

				if (deleteError) {
					return fail(400, {
						error: deleteError.message,
						values: toGroupNewsFormValues(existing),
						editingSlug: existing.slug,
						emailMembers: false
					});
				}

				throw redirect(303, `/groups/${group.slug}/manage/news`);
			}

			const payload = normalizeGroupNewsPayload(formData);
			const slug = await ensureUniqueGroupNewsSlug(
				supabase,
				group.id,
				payload.slug || payload.title,
				existing?.id
			);
			const nowIso = new Date().toISOString();
			const nextPublishedAt = intent === 'publish' ? existing?.published_at || nowIso : null;

			if (existing) {
				const { error: updateError } = await supabase
					.from('group_news_posts')
					.update({
						...payload,
						slug,
						published_at: nextPublishedAt,
						updated_by_user_id: user.id,
						updated_at: nowIso
					})
					.eq('id', existing.id);

				if (updateError) {
					return fail(400, {
						error: updateError.message,
						values: {
							postId: existing.id,
							title: payload.title,
							slug: payload.slug,
							summary: payload.summary ?? '',
							bodyMarkdown: payload.body_markdown
						},
						editingSlug: existing.slug,
						emailMembers: shouldEmailMembers
					});
				}
			} else {
				const { error: insertError } = await supabase.from('group_news_posts').insert({
					...payload,
					group_id: group.id,
					slug,
					published_at: nextPublishedAt,
					created_by_user_id: user.id,
					updated_by_user_id: user.id,
					updated_at: nowIso
				});

				if (insertError) {
					return fail(400, {
						error: insertError.message,
						values: {
							postId: '',
							title: payload.title,
							slug: payload.slug,
							summary: payload.summary ?? '',
							bodyMarkdown: payload.body_markdown
						},
						emailMembers: shouldEmailMembers
					});
				}
			}

			if (intent === 'publish' && shouldEmailMembers) {
				if (!serviceSupabase) {
					return fail(500, {
						error: 'Update saved, but the email queue is not configured in this environment.',
						values: {
							postId: existing?.id || '',
							title: payload.title,
							slug,
							summary: payload.summary ?? '',
							bodyMarkdown: payload.body_markdown
						},
						editingSlug: slug,
						emailMembers: true
					});
				}

				const publishedPost = await getGroupNewsPostBySlug(serviceSupabase, group.id, slug, {
					includeDrafts: true
				});
				if (!publishedPost) {
					return fail(500, {
						error: 'Update saved, but the published version could not be loaded for email.',
						values: {
							postId: existing?.id || '',
							title: payload.title,
							slug,
							summary: payload.summary ?? '',
							bodyMarkdown: payload.body_markdown
						},
						editingSlug: slug,
						emailMembers: true
					});
				}

				try {
					const queued = await queueGroupUpdateEmailBatch(serviceSupabase, {
						group,
						post: publishedPost,
						requestedByUserId: user.id,
						origin: url.origin
					});
					if (!queued.queuedCount) {
						return fail(400, {
							error:
								'This update was published, but there are no active members with email addresses to send to.',
							values: {
								postId: publishedPost.id,
								title: payload.title,
								slug,
								summary: payload.summary ?? '',
								bodyMarkdown: payload.body_markdown
							},
							editingSlug: slug,
							emailMembers: true
						});
					}
				} catch (queueError) {
					return fail(500, {
						error:
							queueError?.message || 'Update saved, but member emails could not be queued.',
						values: {
							postId: publishedPost.id,
							title: payload.title,
							slug,
							summary: payload.summary ?? '',
							bodyMarkdown: payload.body_markdown
						},
						editingSlug: slug,
						emailMembers: true
					});
				}
			}

			throw redirect(303, `/groups/${group.slug}/manage/news?edit=${encodeURIComponent(slug)}`);
		} catch (actionError) {
			if (actionError?.status === 303) throw actionError;
			return fail(actionError?.status || 400, {
				error: actionError?.body?.message || actionError?.message || 'Unable to save update.',
				emailMembers: false
			});
		}
	}
};
