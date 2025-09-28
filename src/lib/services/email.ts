export interface SesEmailTag {
	Name: string;
	Value: string;
}

export interface SendEmailRequestBody {
	to: string | string[];
	subject: string;
	text?: string;
	html?: string;
	replyTo?: string;
	tags?: SesEmailTag[];
}

export interface SendEmailResponse {
	message: string;
	messageId?: string;
	sanitized?: {
		textBodyChanged: boolean;
		htmlBodyChanged: boolean;
	};
	details?: string[];
}

type FetchLike = typeof fetch;

function resolveFetch(fetchImpl?: FetchLike): FetchLike {
	if (fetchImpl) return fetchImpl;
	if (typeof fetch !== 'undefined') return fetch;
	throw new Error('A fetch implementation must be provided to send email.');
}

export async function sendEmail(
	requestBody: SendEmailRequestBody,
	{ fetch: fetchImpl }: { fetch?: FetchLike } = {}
) {
	const fetchFn = resolveFetch(fetchImpl);

	const response = await fetchFn('/api/email', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(requestBody)
	});

	let payload: unknown = null;
	const raw = await response.text();
	if (raw) {
		try {
			payload = JSON.parse(raw);
		} catch (error) {
			payload = raw;
		}
	}

	if (!response.ok) {
		const message =
			typeof payload === 'object' && payload !== null && 'error' in payload
				? String((payload as { error: unknown }).error)
				: 'Failed to send email.';
		const error = new Error(message);
		(error as Error & { status?: number }).status = response.status;
		(error as Error & { payload?: unknown }).payload = payload;
		throw error;
	}

	return (payload ?? {}) as SendEmailResponse;
}
