import { redirect } from '@sveltejs/kit';

function destination(slug, search = '') {
	return `/groups/${slug}/manage/edit${search || ''}`;
}

export const GET = ({ params, url }) => {
	throw redirect(308, destination(params.slug, url.search));
};

export const POST = ({ params, url }) => {
	throw redirect(303, destination(params.slug, url.search));
};

export const PUT = ({ params, url }) => {
	throw redirect(307, destination(params.slug, url.search));
};

export const PATCH = ({ params, url }) => {
	throw redirect(307, destination(params.slug, url.search));
};

export const DELETE = ({ params, url }) => {
	throw redirect(307, destination(params.slug, url.search));
};
