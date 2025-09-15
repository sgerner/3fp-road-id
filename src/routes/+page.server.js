import { supabase } from '$lib/supabaseClient';

export const load = async () => {
	const { data, error } = await supabase
		.from('groups')
		.select('id, slug, name, tagline, city, state_region, country, logo_url, cover_photo_url')
		.not('cover_photo_url', 'is', null)
		.not('logo_url', 'is', null)
		.order('name', { ascending: true })
		.limit(2);

	return { highlights: data || [], error: error?.message || null };
};
