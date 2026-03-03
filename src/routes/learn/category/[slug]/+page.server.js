import { error, fail } from '@sveltejs/kit';
import { getLearnClient, slugifyLearn } from '$lib/server/learn';

export const load = async ({ params, cookies }) => {
    const { user, supabase } = getLearnClient(cookies);

    const { data: category, error: categoryError } = await supabase
        .from('learn_categories')
        .select('*')
        .eq('slug', params.slug)
        .maybeSingle();

    if (categoryError) throw categoryError;
    if (!category) {
        throw error(404, 'Category not found.');
    }

    const [{ data: subcategories, error: subError }, { data: articles, error: artError }] = await Promise.all([
        supabase
            .from('learn_subcategories')
            .select('*')
            .eq('category_slug', category.slug)
            .order('sort_order', { ascending: true }),
        supabase
            .from('learn_articles')
            .select('id, title, slug, summary, category_slug, subcategory_slug, sort_order, updated_at, cover_image_url')
            .eq('category_slug', category.slug)
            .eq('is_published', true)
            .order('sort_order', { ascending: true })
    ]);

    if (subError) throw subError;
    if (artError) throw artError;

    return {
        category,
        subcategories: subcategories ?? [],
        articles: articles ?? [],
        canEdit: Boolean(user)
    };
};

export const actions = {
    createSubcategory: async ({ request, cookies, params }) => {
        const { user, supabase } = getLearnClient(cookies);
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
    updateOrder: async ({ request, cookies }) => {
        const { user, supabase } = getLearnClient(cookies);
        if (!user) return fail(401, { error: 'Authentication required' });

        const formData = await request.formData();
        const type = formData.get('type');
        const itemsStr = formData.get('items');
        try {
            const items = JSON.parse(itemsStr);
            if (type === 'subcategory') {
                for (const item of items) {
                    await supabase.from('learn_subcategories').update({ sort_order: item.sort_order }).eq('slug', item.id);
                }
            } else if (type === 'article') {
                for (const item of items) {
                    await supabase.from('learn_articles').update({ sort_order: item.sort_order, subcategory_slug: item.subcategory_slug || null }).eq('id', item.id);
                }
            }
        } catch (e) {
            return fail(400, { error: 'Invalid order data' });
        }
        return { success: true };
    },
    deleteSubcategory: async ({ request, cookies }) => {
        const { user, supabase } = getLearnClient(cookies);
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
        if (count > 0) return fail(400, { error: 'Cannot delete a subcategory that still has articles.' });

        const { error: deleteError } = await supabase
            .from('learn_subcategories')
            .delete()
            .eq('slug', slug);
        if (deleteError) return fail(500, { error: deleteError.message });

        return { success: true };
    }
};
