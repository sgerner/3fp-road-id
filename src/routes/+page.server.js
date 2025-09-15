import { supabase } from '$lib/supabaseClient';

export const load = async () => {
	const { data, error } = await supabase
		.from('groups')
		.select('id, slug, name, tagline, city, state_region, country, logo_url, cover_photo_url')
		.not('cover_photo_url', 'is', null)
		.not('logo_url', 'is', null)
		.limit(64);

	const rows = Array.isArray(data) ? data.slice() : [];
	// Fisher-Yates shuffle
	for (let i = rows.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[rows[i], rows[j]] = [rows[j], rows[i]];
	}
	const highlights = rows.slice(0, 2);

	return { highlights, error: error?.message || null };
};
