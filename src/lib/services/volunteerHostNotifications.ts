type FetchLike = typeof fetch;

export interface VolunteerHostNotificationPayload {
	assignmentId?: string | number;
	assignmentIds?: (string | number)[];
	type: 'register' | 'cancel';
}

function resolveFetch(fetchImpl?: FetchLike): FetchLike {
	if (fetchImpl) return fetchImpl;
	if (typeof fetch !== 'undefined') return fetch;
	throw new Error('A fetch implementation must be provided to notify volunteer hosts.');
}

export async function notifyVolunteerHosts(
	payload: VolunteerHostNotificationPayload,
	{ fetch: fetchImpl }: { fetch?: FetchLike } = {}
) {
	const fetchFn = resolveFetch(fetchImpl);
	const response = await fetchFn('/api/v1/volunteer-host-notifications', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			assignment_id: payload.assignmentId,
			assignment_ids: payload.assignmentIds,
			type: payload.type
		})
	});

	let body: unknown = null;
	const text = await response.text();
	if (text) {
		try {
			body = JSON.parse(text);
		} catch {
			body = text;
		}
	}

	if (!response.ok) {
		const message =
			(typeof body === 'object' && body !== null && 'error' in body
				? String((body as { error?: unknown }).error)
				: null) || 'Failed to notify event hosts.';
		const error = new Error(message);
		(error as Error & { status?: number }).status = response.status;
		(error as Error & { payload?: unknown }).payload = body;
		throw error;
	}

	return body ?? {};
}
