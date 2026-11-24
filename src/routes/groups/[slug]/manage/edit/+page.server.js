import { redirect } from '@sveltejs/kit';
import { buildPresenceRedirectFromEdit } from '#lib/groups/presenceStudio.js';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, url }) => {
	throw redirect(307, buildPresenceRedirectFromEdit(params.slug, url.searchParams));
};

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, url }) => {
		throw redirect(303, buildPresenceRedirectFromEdit(params.slug, url.searchParams));
	},
	delete: async ({ params, url }) => {
		throw redirect(303, buildPresenceRedirectFromEdit(params.slug, url.searchParams));
	}
};
