import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { normalizeMicrositeSlug } from '$lib/microsites/host';

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export const GET = async ({ url }) => {
	const requested = cleanText(url.searchParams.get('slug'));
	const slug = normalizeMicrositeSlug(requested);
	const currentGroupId = cleanText(url.searchParams.get('current_group_id'));

	if (!slug) {
		return json({
			available: false,
			reason: 'invalid',
			slug
		});
	}

	const { data, error } = await supabase.from('groups').select('id').eq('microsite_slug', slug).limit(1);
	if (error) {
		return json(
			{
				available: false,
				reason: 'error',
				slug
			},
			{ status: 500 }
		);
	}

	const match = Array.isArray(data) && data.length ? data[0] : null;
	if (!match) {
		return json({
			available: true,
			reason: 'available',
			slug
		});
	}

	if (currentGroupId && match.id === currentGroupId) {
		return json({
			available: true,
			reason: 'current',
			slug
		});
	}

	return json({
		available: false,
		reason: 'taken',
		slug
	});
};
