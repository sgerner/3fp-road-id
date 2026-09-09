import { json } from '@sveltejs/kit';
import { retryGroupSubscriberWelcome } from '$lib/server/groupSubscriberWelcome';

function respond(result) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data });
}

export async function POST({ params, cookies, url, fetch: fetchImpl }) {
	return respond(
		await retryGroupSubscriberWelcome({
			cookies,
			groupSlug: params.slug,
			subscriberId: params.id,
			origin: url?.origin,
			fetchImpl
		})
	);
}
