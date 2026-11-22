import { redirect } from '@sveltejs/kit';
import { buildPresenceRedirectFromSite } from '#lib/groups/presenceStudio.js';

export const load = async ({ params, url }) => {
	throw redirect(307, buildPresenceRedirectFromSite(params.slug, url.searchParams));
};

export const actions = {
	save: async ({ params, url }) => {
		throw redirect(303, buildPresenceRedirectFromSite(params.slug, url.searchParams));
	},
	reset: async ({ params, url }) => {
		throw redirect(303, buildPresenceRedirectFromSite(params.slug, url.searchParams));
	}
};
