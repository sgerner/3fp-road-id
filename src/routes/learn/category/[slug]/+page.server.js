import { error, fail } from '@sveltejs/kit';
import { enrichLearnArticleCards, getLearnClient, slugifyLearn } from '#lib/server/learn.js';
import {
	applyCategoryOrderUpdate,
	mergeSafetyReportIntoCatalog
} from '#lib/server/learnCatalog.js';
import { sanitizeLearnSearchQuery, searchLearnArticles } from '#lib/server/learnSearch.js';

export const load = async ({ params, cookies, url }) => {
	const { user, supabase } = await getLearnClient(cookies);
	const initialQuery = sanitizeLearnSearchQuery(url.searchParams.get('q') ?? '');

	const { data: category, error: categoryError } = await supabase
		.from('learn_categories')
		.select('*')
		.eq('slug', params.slug)
		.maybeSingle();

	if (categoryError) throw categoryError;
	if (!category) {
		throw error(404, 'Category not found.');
	}

	const [
		{ data: subcategories, error: subError },
		{ data: rawArticles, error: artError },
		searchResult
	] = await Promise.all([
		supabase
			.from('learn_subcategories')
			.select('*')
			.eq('category_slug', category.slug)
			.order('sort_order', { ascending: true }),
		supabase
			.from('learn_articles')
			.select(
				'id, title, slug, summary, reader_summary, key_takeaways, category_slug, category_name, subcategory_slug, subcategory_name, sort_order, content_type, import_source_path, updated_at, cover_image_url'
			)
			.eq('category_slug', category.slug)
			.eq('is_published', true)
			.order('sort_order', { ascending: true }),
		initialQuery
			? searchLearnArticles({
					supabase,
					query: initialQuery,
					categorySlug: category.slug
				})
			: Promise.resolve(null)
	]);

	if (subError) throw subError;
	if (artError) throw artError;

	const enriched = await enrichLearnArticleCards(supabase, rawArticles ?? []);
	const articles = mergeSafetyReportIntoCatalog(enriched, { categorySlug: category.slug });

	return {
		category,
		subcategories: subcategories ?? [],
		articles,
		initialQuery,
		initialSearchResults: searchResult ? searchResult.articles : null,
		canEdit: Boolean(user)
	};
};

export const actions = {
	createSubcategory: async ({ request, cookies, params }) => {
		const { user, supabase } = await getLearnClient(cookies);
		if (!user) return fail(401, { error: 'Authentication required' });

		const formData = await request.formData();
		const name = String(formData.get('name') || '').trim();
		if (!name) return fail(400, { error: 'Name is required' });

		const slug = slugifyLearn(name);

		const { error: insertError } = await supabase.from('learn_subcategories').insert({
			slug,
			category_slug: params.slug,
			name,
			sort_order: 999
		});

		if (insertError) {
			return fail(400, { error: insertError.message });
		}
		return { success: true };
	},
	updateOrder: async ({ request, cookies, params }) => {
		const { user, supabase } = await getLearnClient(cookies);
		if (!user) return fail(401, { error: 'Authentication required' });

		const formData = await request.formData();
		return applyCategoryOrderUpdate({
			supabase,
			categorySlug: params.slug,
			formData
		});
	},
	deleteSubcategory: async ({ request, cookies }) => {
		const { user, supabase } = await getLearnClient(cookies);
		if (!user) return fail(401, { error: 'Authentication required' });

		const formData = await request.formData();
		const slug = String(formData.get('slug') || '').trim();
		if (!slug) return fail(400, { error: 'Slug is required' });

		// Safety check: refuse if there are still articles in this subcategory
		const { count, error: countError } = await supabase
			.from('learn_articles')
			.select('id', { count: 'exact', head: true })
			.eq('subcategory_slug', slug);
		if (countError) return fail(500, { error: countError.message });
		if (count > 0)
			return fail(400, { error: 'Cannot delete a subcategory that still has articles.' });

		const { error: deleteError } = await supabase
			.from('learn_subcategories')
			.delete()
			.eq('slug', slug);
		if (deleteError) return fail(500, { error: deleteError.message });

		return { success: true };
	}
};
