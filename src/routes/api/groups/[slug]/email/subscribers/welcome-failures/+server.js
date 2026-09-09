import { json } from '@sveltejs/kit';
import { listGroupSubscriberWelcomeFailures } from '$lib/server/groupSubscriberWelcome';

function respond(result) {
	if (!result?.ok) {
		return json({ error: result?.error || 'Request failed.' }, { status: result?.status || 500 });
	}
	return json({ data: result.data });
}

export async function GET({ params, cookies }) {
	return respond(
		await listGroupSubscriberWelcomeFailures({
			cookies,
			groupSlug: params.slug
		})
	);
}
