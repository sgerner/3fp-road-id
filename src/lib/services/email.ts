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
	branding?: {
		brand?: {
			name?: string;
			logoPath?: string;
			logoUrl?: string;
			background?: string;
			surface?: string;
			border?: string;
			text?: string;
			muted?: string;
			accent?: string;
		};
		category?: string;
		recipientReason?: string;
		actionUrl?: string;
		actionLabel?: string;
	};
}

export interface SendEmailResponse {
	message: string;
	messageId?: string;
	code?: string;
	requestId?: string | null;
	sanitized?: {
		textBodyChanged: boolean;
		htmlBodyChanged: boolean;
	};
	details?: string[];
}

type FetchLike = typeof fetch;

type SendEmailOptions = {
	fetch?: FetchLike;
	internalSecret?: string;
};

function resolveFetch(fetchImpl?: FetchLike): FetchLike {
	if (fetchImpl) return fetchImpl;
	if (typeof fetch !== 'undefined') return fetch;
	throw new Error('A fetch implementation must be provided to send email.');
}

export async function sendEmail(
	requestBody: SendEmailRequestBody,
	{ fetch: fetchImpl, internalSecret }: SendEmailOptions = {}
) {
	const fetchFn = resolveFetch(fetchImpl);
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};
	if (internalSecret) headers['x-internal-email-secret'] = internalSecret;

	const response = await fetchFn('/api/v1/email', {
		method: 'POST',
		headers,
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
		const serverMessage =
			typeof payload === 'object' && payload !== null && 'error' in payload
				? String((payload as { error: unknown }).error)
				: 'Failed to send email.';
		const errorDetails: { code?: unknown; requestId?: unknown } =
			typeof payload === 'object' && payload !== null
				? (payload as { code?: unknown; requestId?: unknown })
				: {};
		const diagnosticParts = [`HTTP ${response.status}`];
		if (typeof errorDetails.code === 'string' && errorDetails.code.trim()) {
			diagnosticParts.push(`code ${errorDetails.code.trim()}`);
		}
		if (
			typeof errorDetails.requestId === 'string' &&
			errorDetails.requestId.trim() &&
			!serverMessage.includes(errorDetails.requestId.trim())
		) {
			diagnosticParts.push(`request ${errorDetails.requestId.trim()}`);
		}
		const message =
			serverMessage.trim().toLowerCase() === 'failed to send email.'
				? `Failed to send email (${diagnosticParts.join(', ')}).`
				: serverMessage;
		const error = new Error(message);
		(error as Error & { status?: number }).status = response.status;
		(error as Error & { payload?: unknown }).payload = payload;
		if (typeof errorDetails.code === 'string') {
			(error as Error & { code?: string }).code = errorDetails.code;
		}
		if (
			typeof errorDetails.requestId === 'string' ||
			errorDetails.requestId === null
		) {
			(error as Error & { requestId?: string | null }).requestId = errorDetails.requestId;
		}
		throw error;
	}

	return (payload ?? {}) as SendEmailResponse;
}
