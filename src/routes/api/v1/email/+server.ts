import { json, type RequestHandler } from '@sveltejs/kit';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { env } from '$env/dynamic/private';

const MAX_RECIPIENTS = 10;
const MAX_BODY_LENGTH = 5000;
const MAX_URLS = 5;
const MIN_SUBJECT_LENGTH = 3;

const ALLOWED_HTML_TAGS = new Set([
	'a',
	'b',
	'br',
	'em',
	'i',
	'li',
	'ol',
	'p',
	'span',
	'strong',
	'u',
	'ul'
]);
const SELF_CLOSING_TAGS = new Set(['br']);

const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
	{
		pattern: /viagra|cialis|levitra/i,
		message: 'pharmaceutical solicitation terms are not permitted.'
	},
	{ pattern: /casino|gambling|betting/i, message: 'gambling language is not permitted.' },
	{ pattern: /lottery|jackpot|sweepstakes/i, message: 'lottery language is not permitted.' },
	{ pattern: /porn|xxx|adult content/i, message: 'adult content references are not permitted.' },
	{
		pattern: /weapon|gun|firearm|explosive/i,
		message: 'weapons or explosives references are not permitted.'
	},
	{
		pattern: /terror|extortion|ransom/i,
		message: 'terrorism or extortion language is not permitted.'
	},
	{
		pattern: /money laundering|counterfeit|fraud/i,
		message: 'financial crime language is not permitted.'
	},
	{
		pattern: /get rich quick|make money fast|double your income/i,
		message: 'get rich quick solicitations are not permitted.'
	},
	{
		pattern: /bitcoin|crypto( currency| investment)?/i,
		message: 'cryptocurrency solicitations are not permitted.'
	},
	{
		pattern: /free money|no obligation|act now/i,
		message: 'spam trigger phrases are not permitted.'
	}
];

const DISALLOWED_HTML_SNIPPETS = [
	/<\s*script/gi,
	/<\s*iframe/gi,
	/<\s*object/gi,
	/<\s*embed/gi,
	/<\s*form/gi,
	/<\s*input/gi,
	/<\s*button/gi,
	/<\s*textarea/gi,
	/<\s*style/gi,
	/javascript:/gi
];

let cachedClient: SESClient | null = null;

function ensureSesClient(): SESClient {
	if (cachedClient) {
		return cachedClient;
	}

	const region = env.AWS_SES_REGION;
	const accessKeyId = env.AWS_SES_ACCESS_KEY_ID;
	const secretAccessKey = env.AWS_SES_SECRET_ACCESS_KEY;

	if (!region) {
		throw new Error('AWS_SES_REGION is not configured.');
	}
	if (!accessKeyId || !secretAccessKey) {
		throw new Error('AWS SES credentials are not configured.');
	}

	cachedClient = new SESClient({
		region,
		credentials: { accessKeyId, secretAccessKey }
	});

	return cachedClient;
}

function normalizeRecipients(recipientInput: unknown): string[] {
	if (typeof recipientInput === 'string') {
		return [recipientInput.trim()].filter(Boolean);
	}
	if (Array.isArray(recipientInput)) {
		const cleaned = recipientInput
			.filter((value): value is string => typeof value === 'string')
			.map((value) => value.trim())
			.filter(Boolean);
		return Array.from(new Set(cleaned));
	}
	return [];
}

function isValidEmail(address: string): boolean {
	const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailPattern.test(address);
}

function sanitizeSubject(subject: unknown): string {
	if (typeof subject !== 'string') return '';
	return subject.replace(/\s+/g, ' ').trim();
}

function sanitizePlainText(content: string): string {
	return content
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line) => line.trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function escapeHtmlAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function sanitizeHtml(rawHtml: string): string {
	let sanitized = rawHtml;

	for (const snippet of DISALLOWED_HTML_SNIPPETS) {
		sanitized = sanitized.replace(snippet, '');
	}

	sanitized = sanitized.replace(/on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
	sanitized = sanitized.replace(/style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

	return sanitized.replace(/<\s*\/?\s*([a-z0-9]+)([^>]*)>/gi, (match, tag, attrs) => {
		const lowerTag = String(tag).toLowerCase();
		const isClosing = /^<\s*\//.test(match);

		if (!ALLOWED_HTML_TAGS.has(lowerTag)) {
			return '';
		}

		if (isClosing) {
			return `</${lowerTag}>`;
		}

		if (SELF_CLOSING_TAGS.has(lowerTag)) {
			return `<${lowerTag} />`;
		}

		if (lowerTag === 'a') {
			const hrefMatch = attrs?.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
			const hrefValue = hrefMatch ? (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '') : '';
			const safeHref = hrefValue.trim();

			if (!safeHref || !/^https?:\/\//i.test(safeHref)) {
				return '<a>';
			}

			return `<a href="${escapeHtmlAttribute(safeHref)}" rel="noopener noreferrer">`;
		}

		return `<${lowerTag}>`;
	});
}

function htmlToPlainText(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li)>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function detectContentIssues(subject: string, textBody: string, htmlBody?: string): string[] {
	const issues: string[] = [];
	const combinedForChecks = `${subject} \n ${textBody} \n ${htmlBody ? htmlToPlainText(htmlBody) : ''}`;

	if (combinedForChecks.length > MAX_BODY_LENGTH) {
		issues.push(
			`Email content is too long. Limit combined subject and body to ${MAX_BODY_LENGTH} characters.`
		);
	}

	const urlMatches = combinedForChecks.match(/https?:\/\/[^\s]+/gi) ?? [];
	if (urlMatches.length > MAX_URLS) {
		issues.push(
			`Email contains ${urlMatches.length} links. Limit messages to ${MAX_URLS} or fewer links.`
		);
	}

	const lettersOnly = combinedForChecks.replace(/[^a-zA-Z]/g, '');
	const uppercaseLetters = lettersOnly.replace(/[^A-Z]/g, '');
	if (lettersOnly.length >= 20) {
		const uppercaseRatio = uppercaseLetters.length / lettersOnly.length;
		if (uppercaseRatio > 0.6) {
			issues.push('Email content is overly capitalized, which is characteristic of spam.');
		}
	}

	if (/(.)\1{7,}/.test(combinedForChecks)) {
		issues.push('Email contains excessive character repetition, which is characteristic of spam.');
	}

	for (const { pattern, message } of SUSPICIOUS_PATTERNS) {
		if (pattern.test(combinedForChecks)) {
			issues.push(`Email failed policy check: ${message}`);
		}
	}

	return issues;
}

function validateRequestPayload(payload: Record<string, unknown>) {
	const errors: string[] = [];

	const to = normalizeRecipients(payload.to);
	if (to.length === 0) {
		errors.push('At least one recipient email address is required.');
	}
	if (to.length > MAX_RECIPIENTS) {
		errors.push(`No more than ${MAX_RECIPIENTS} recipients are allowed per message.`);
	}
	for (const email of to) {
		if (!isValidEmail(email)) {
			errors.push(`Invalid email address: ${email}`);
		}
	}

	const replyTo = typeof payload.replyTo === 'string' ? payload.replyTo.trim() : '';
	if (replyTo && !isValidEmail(replyTo)) {
		errors.push('replyTo must be a valid email address when provided.');
	}

	const subject = sanitizeSubject(payload.subject);
	if (!subject) {
		errors.push('An email subject is required.');
	} else if (subject.length < MIN_SUBJECT_LENGTH) {
		errors.push(`Subject must be at least ${MIN_SUBJECT_LENGTH} characters long.`);
	}

	const textBodyRaw = typeof payload.text === 'string' ? payload.text : '';
	const htmlBodyRaw = typeof payload.html === 'string' ? payload.html : '';

	const sanitizedText = textBodyRaw ? sanitizePlainText(textBodyRaw) : '';
	const sanitizedHtml = htmlBodyRaw ? sanitizeHtml(htmlBodyRaw) : '';
	const normalizedText = sanitizedText || (sanitizedHtml ? htmlToPlainText(sanitizedHtml) : '');

	if (!normalizedText) {
		errors.push('Email body cannot be empty.');
	}

	const issueMessages = detectContentIssues(subject, normalizedText, sanitizedHtml);
	if (issueMessages.length > 0) {
		errors.push(...issueMessages);
	}

	return {
		errors,
		to,
		replyTo,
		subject,
		sanitizedText,
		sanitizedHtml,
		normalizedText,
		rawText: textBodyRaw,
		rawHtml: htmlBodyRaw
	};
}

export const POST: RequestHandler = async ({ request }) => {
	let payload: Record<string, unknown>;

	try {
		payload = await request.json();
	} catch (error) {
		return json({ error: 'Invalid JSON payload.' }, { status: 400 });
	}

	const validation = validateRequestPayload(payload);
	if (validation.errors.length > 0) {
		return json(
			{ error: 'Email request failed validation.', details: validation.errors },
			{ status: 422 }
		);
	}

	const fromAddress = env.AWS_SES_FROM_ADDRESS ?? env.EMAIL_FROM_ADDRESS ?? env.DEFAULT_FROM_EMAIL;
	if (!fromAddress) {
		return json({ error: 'No SES from-address configured.' }, { status: 500 });
	}

	let client: SESClient;
	try {
		client = ensureSesClient();
	} catch (error) {
		console.error('SES configuration error', error);
		return json({ error: 'Email service is not configured correctly.' }, { status: 500 });
	}

	const command = new SendEmailCommand({
		Source: fromAddress,
		Destination: {
			ToAddresses: validation.to
		},
		ReplyToAddresses: validation.replyTo ? [validation.replyTo] : undefined,
		Message: {
			Subject: {
				Data: validation.subject,
				Charset: 'UTF-8'
			},
			Body: {
				Text: validation.normalizedText
					? {
							Data: validation.normalizedText,
							Charset: 'UTF-8'
						}
					: undefined,
				Html: validation.sanitizedHtml
					? {
							Data: validation.sanitizedHtml,
							Charset: 'UTF-8'
						}
					: undefined
			}
		},
		Tags: Array.isArray(payload.tags)
			? payload.tags
					.filter(
						(tag): tag is { Name: string; Value: string } =>
							!!tag &&
							typeof tag === 'object' &&
							typeof tag.Name === 'string' &&
							typeof tag.Value === 'string'
					)
					.slice(0, 10)
			: undefined
	});

	try {
		const response = await client.send(command);

		return json(
			{
				message: 'Email accepted for delivery.',
				messageId: response.MessageId,
				sanitized: {
					textBodyChanged:
						typeof validation.rawText === 'string'
							? validation.sanitizedText !== validation.rawText
							: false,
					htmlBodyChanged:
						typeof validation.rawHtml === 'string'
							? validation.sanitizedHtml !== validation.rawHtml
							: false
				}
			},
			{ status: 202 }
		);
	} catch (error) {
		console.error('Failed to send email via SES', error);
		return json({ error: 'Failed to send email.' }, { status: 502 });
	}
};
