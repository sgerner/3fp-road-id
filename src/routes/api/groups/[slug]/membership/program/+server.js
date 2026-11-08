import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import { getMembershipProgramForViewer, updateMembershipProgram } from '#lib/server/memberships';

export async function GET({ params, cookies, url }) {
	const includeInactive =
		url.searchParams.get('include_inactive') === '1' ||
		url.searchParams.get('include_inactive') === 'true';
	const result = await getMembershipProgramForViewer({
		cookies,
		groupSlug: params.slug,
		includeInactive
	});
	return respond(result);
}

export async function PUT({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await updateMembershipProgram({
		cookies,
		groupSlug: params.slug,
		payload
	});
	return respond(result);
}
