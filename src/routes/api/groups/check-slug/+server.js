import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export const GET = async ({ url }) => {
  const raw = url.searchParams.get('slug') || '';
  const slug = slugify(raw);

  if (!slug || slug.length < 3) {
    return json({ available: false, reason: 'too_short_or_invalid', slug });
  }

  const { data, error } = await supabase
    .from('groups')
    .select('id')
    .eq('slug', slug)
    .limit(1);

  if (error) return json({ available: false, error: error.message, slug }, { status: 500 });
  const taken = (data || []).length > 0;
  return json({ available: !taken, slug });
};

