import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { isReservedMicrositeSlug, normalizeMicrositeSlug } from '$lib/microsites/host';

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

	if (isReservedMicrositeSlug(slug)) {
		return json({
			available: false,
			reason: 'reserved',
			slug
		});
	}

	const { data, error } = await supabase
		.from('groups')
		.select('id')
		.or(`microsite_slug.eq.${slug},slug.eq.${requested}`)
		.limit(1);
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
