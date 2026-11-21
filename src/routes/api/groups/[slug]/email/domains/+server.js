import { respond } from '#lib/server/groupApiResponse';
import { json } from '@sveltejs/kit';
import {
	listGroupEmailSendingDomains,
	upsertGroupEmailSendingDomain
} from '#lib/server/groupEmailDomains';

export async function GET({ params, cookies }) {
	const result = await listGroupEmailSendingDomains({
		cookies,
		groupSlug: params.slug
	});
	return respond(result);
}

export async function POST({ params, cookies, request }) {
	const payload = await request.json().catch(() => ({}));
	const result = await upsertGroupEmailSendingDomain({
		cookies,
		groupSlug: params.slug,
		payload
	});
	return respond(result, 201);
}
