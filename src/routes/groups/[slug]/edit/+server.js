import { redirect } from '@sveltejs/kit';
import { buildPresenceRedirectFromEdit } from '#lib/groups/presenceStudio.js';

export const GET = ({ params, url }) => {
	throw redirect(308, buildPresenceRedirectFromEdit(params.slug, url.searchParams));
};

export const POST = ({ params, url }) => {
	throw redirect(303, buildPresenceRedirectFromEdit(params.slug, url.searchParams));
};

export const PUT = ({ params, url }) => {
	throw redirect(307, buildPresenceRedirectFromEdit(params.slug, url.searchParams));
};

export const PATCH = ({ params, url }) => {
	throw redirect(307, buildPresenceRedirectFromEdit(params.slug, url.searchParams));
};

export const DELETE = ({ params, url }) => {
	throw redirect(307, buildPresenceRedirectFromEdit(params.slug, url.searchParams));
};
