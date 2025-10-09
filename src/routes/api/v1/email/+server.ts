import { json, type RequestHandler } from '@sveltejs/kit';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { env } from '$env/dynamic/private';
import { PUBLIC_URL_BASE } from '$env/static/public';
import { wrapHtmlWithBranding, wrapTextWithBranding } from '$lib/email/branding';

const MAX_RECIPIENTS = 10;
const MAX_BODY_LENGTH = 5000;
const MAX_URLS = 5;
const MIN_SUBJECT_LENGTH = 3;

const ALLOWED_HTML_TAGS = new Set([
        'a',
        'b',
        'body',
        'br',
        'div',
        'em',
        'head',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'html',
        'i',
        'img',
        'li',
        'meta',
        'ol',
        'p',
        'section',
        'span',
        'strong',
        'table',
        'tbody',
        'td',
        'tfoot',
        'th',
        'thead',
        'title',
        'tr',
        'u',
        'ul'
]);
const SELF_CLOSING_TAGS = new Set(['br', 'img', 'meta']);

const GLOBAL_ALLOWED_ATTRIBUTES = new Set([
        'align',
        'aria-hidden',
        'aria-label',
        'border',
        'cellpadding',
        'cellspacing',
        'colspan',
        'height',
        'role',
        'rowspan',
        'style',
        'valign',
        'width'
]);

const TAG_SPECIFIC_ATTRIBUTES: Record<string, Set<string>> = {
        a: new Set(['href', 'rel', 'target', 'title']),
        body: new Set(['style']),
        div: new Set(['style']),
        h1: new Set(['style']),
        h2: new Set(['style']),
        h3: new Set(['style']),
        h4: new Set(['style']),
        h5: new Set(['style']),
        h6: new Set(['style']),
        html: new Set(['lang']),
        img: new Set(['src', 'alt', 'width', 'height', 'style']),
        li: new Set(['style']),
        meta: new Set(['charset', 'content', 'http-equiv', 'name']),
        ol: new Set(['style']),
        p: new Set(['style']),
        section: new Set(['style']),
        span: new Set(['style']),
        table: new Set(['role', 'cellpadding', 'cellspacing', 'border', 'width', 'style']),
        tbody: new Set(['style']),
        td: new Set(['align', 'valign', 'colspan', 'rowspan', 'width', 'height', 'style']),
        tfoot: new Set(['style']),
        th: new Set(['align', 'valign', 'colspan', 'rowspan', 'width', 'height', 'style']),
        thead: new Set(['style']),
        tr: new Set(['align', 'valign', 'style']),
        ul: new Set(['style'])
};

const ALLOWED_STYLE_PROPERTIES = new Set([
        'background',
        'background-color',
        'background-image',
        'border',
        'border-bottom',
        'border-color',
        'border-left',
        'border-radius',
        'border-right',
        'border-style',
        'border-top',
        'border-width',
        'box-shadow',
        'color',
        'display',
        'font-family',
        'font-size',
        'font-weight',
        'height',
        'letter-spacing',
        'line-height',
        'margin',
        'margin-bottom',
        'margin-left',
        'margin-right',
        'margin-top',
        'max-width',
        'min-width',
        'overflow',
        'padding',
        'padding-bottom',
        'padding-left',
        'padding-right',
        'padding-top',
        'text-align',
        'text-decoration',
        'text-transform',
        'vertical-align',
        'width'
]);

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

type SesTag = { Name: string; Value: string };

const PUBLIC_BRAND_BASE = (PUBLIC_URL_BASE || '').trim().replace(/\/+$/, '');

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

function normalizeOrigin(value?: string | null): string {
        if (!value) return '';
        return value.trim().replace(/\/+$/, '');
}

function deriveRequestOrigin(request: Request): string {
        const headers = request.headers;
        const forwardedHost = headers.get('x-forwarded-host');
        const forwardedProto = headers.get('x-forwarded-proto');

        if (forwardedHost) {
                const host = forwardedHost.split(',')[0]?.trim();
                if (host) {
                        const proto = forwardedProto?.split(',')[0]?.trim().toLowerCase() || 'https';
                        return normalizeOrigin(`${proto}://${host}`);
                }
        }

        const originHeader = headers.get('origin');
        if (originHeader) {
                return normalizeOrigin(originHeader);
        }

        const hostHeader = headers.get('host');
        if (hostHeader) {
                const url = new URL(request.url);
                const protocol = forwardedProto?.split(',')[0]?.trim().toLowerCase() || url.protocol.replace(':', '') || 'https';
                return normalizeOrigin(`${protocol}://${hostHeader.trim()}`);
        }

        return normalizeOrigin(PUBLIC_BRAND_BASE);
}

function deriveBrandingCategory(tags: SesTag[] | undefined): string {
        if (!tags || tags.length === 0) return 'Message';

        for (const tag of tags) {
                if (!tag?.Name) continue;
                if (tag.Name.toLowerCase() !== 'context') continue;
                const value = tag.Value ?? '';
                if (/volunteer/i.test(value)) {
                        return 'Volunteer update';
                }
        }

        return 'Message';
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
        return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/'/g, '&#39;');
}

function sanitizeStyleAttribute(value: string): string {
        const declarations = value
                .split(';')
                .map((declaration) => declaration.trim())
                .filter(Boolean);

        const safeDeclarations: string[] = [];

        for (const declaration of declarations) {
                const [propertyRaw, ...valueParts] = declaration.split(':');
                if (!propertyRaw || valueParts.length === 0) continue;

                const property = propertyRaw.trim().toLowerCase();
                if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue;

                const propertyValue = valueParts.join(':').trim();
                if (!propertyValue) continue;

                if (/url\s*\(/i.test(propertyValue)) continue;
                if (/expression|javascript|@import/i.test(propertyValue)) continue;

                safeDeclarations.push(`${property}:${propertyValue}`);
        }

        return safeDeclarations.join('; ');
}

function sanitizeHtml(rawHtml: string): string {
        let sanitized = rawHtml;

        for (const snippet of DISALLOWED_HTML_SNIPPETS) {
                sanitized = sanitized.replace(snippet, '');
        }

        return sanitized.replace(/<\s*\/?\s*([a-z0-9]+)([^>]*)>/gi, (match, tag, attrs) => {
                const lowerTag = String(tag).toLowerCase();
                const isClosing = /^<\s*\//.test(match);

                if (!ALLOWED_HTML_TAGS.has(lowerTag)) {
                        return '';
                }

                if (isClosing) {
                        return `</${lowerTag}>`;
                }

                const attributeSource = attrs ?? '';
                const allowedAttributes = new Set<string>(GLOBAL_ALLOWED_ATTRIBUTES);
                const tagSpecific = TAG_SPECIFIC_ATTRIBUTES[lowerTag];
                if (tagSpecific) {
                        for (const attribute of tagSpecific) {
                                allowedAttributes.add(attribute);
                        }
                }

                const renderedAttributes: string[] = [];
                const attributePattern = /([a-z0-9:-]+)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/gi;
                let attributeMatch: RegExpExecArray | null;

                while ((attributeMatch = attributePattern.exec(attributeSource))) {
                        const attrNameRaw = attributeMatch[1];
                        if (!attrNameRaw) continue;
                        const attrName = attrNameRaw.toLowerCase();

                        if (attrName.startsWith('on')) {
                                continue;
                        }

                        if (!allowedAttributes.has(attrName)) {
                                continue;
                        }

                        const value = attributeMatch[4] ?? attributeMatch[5] ?? attributeMatch[6] ?? '';
                        const trimmedValue = value.trim();

                        if (!trimmedValue) {
                                continue;
                        }

                        if (attrName === 'style') {
                                const safeStyle = sanitizeStyleAttribute(trimmedValue);
                                if (safeStyle) {
                                        renderedAttributes.push(`style="${escapeHtmlAttribute(safeStyle)}"`);
                                }
                                continue;
                        }

                        if (attrName === 'href') {
                                if (!/^https?:\/\//i.test(trimmedValue) && !/^mailto:/i.test(trimmedValue)) {
                                        continue;
                                }
                                renderedAttributes.push(`href="${escapeHtmlAttribute(trimmedValue)}"`);
                                if (!attributeSource.toLowerCase().includes('rel=')) {
                                        renderedAttributes.push('rel="noopener noreferrer"');
                                }
                                continue;
                        }

                        if (attrName === 'src') {
                                if (!/^https?:\/\//i.test(trimmedValue)) {
                                        continue;
                                }
                                renderedAttributes.push(`src="${escapeHtmlAttribute(trimmedValue)}"`);
                                continue;
                        }

                        if (attrName === 'target') {
                                const lowerValue = trimmedValue.toLowerCase();
                                if (lowerValue !== '_blank' && lowerValue !== '_self') {
                                        continue;
                                }
                                renderedAttributes.push(`target="${escapeHtmlAttribute(lowerValue)}"`);
                                continue;
                        }

                        if (attrName === 'width' || attrName === 'height' || attrName === 'cellpadding' || attrName === 'cellspacing' || attrName === 'border' || attrName === 'colspan' || attrName === 'rowspan') {
                                if (!/^\d{1,4}(%|px)?$/i.test(trimmedValue)) {
                                        continue;
                                }
                                renderedAttributes.push(`${attrName}="${escapeHtmlAttribute(trimmedValue)}"`);
                                continue;
                        }

                        renderedAttributes.push(`${attrName}="${escapeHtmlAttribute(trimmedValue)}"`);
                }

                const attributeString = renderedAttributes.length ? ` ${renderedAttributes.join(' ')}` : '';

                if (SELF_CLOSING_TAGS.has(lowerTag)) {
                        return `<${lowerTag}${attributeString} />`;
                }

                return `<${lowerTag}${attributeString}>`;
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

        const normalizedTags: SesTag[] = Array.isArray(payload.tags)
                ? payload.tags
                                .filter(
                                        (tag): tag is SesTag =>
                                                !!tag &&
                                                typeof tag === 'object' &&
                                                typeof (tag as { Name?: unknown }).Name === 'string' &&
                                                typeof (tag as { Value?: unknown }).Value === 'string'
                                )
                                .slice(0, 10)
                : [];

        const brandingCategory = deriveBrandingCategory(normalizedTags);
        const requestOrigin = deriveRequestOrigin(request);
        const brandingOrigin = requestOrigin || (PUBLIC_BRAND_BASE ? PUBLIC_BRAND_BASE : undefined);

        const sanitizedHtmlBody = validation.sanitizedHtml?.trim?.()
                ? validation.sanitizedHtml.trim()
                : '';
        const sanitizedTextBody = validation.normalizedText?.trim?.()
                ? validation.normalizedText.trim()
                : '';

        const brandingOptions = {
                origin: brandingOrigin,
                category: brandingCategory,
                subjectLine: validation.subject
        };

        const brandedHtml = sanitizedHtmlBody
                ? wrapHtmlWithBranding(sanitizedHtmlBody, brandingOptions)
                : '';
        const brandedText = sanitizedTextBody
                ? wrapTextWithBranding(sanitizedTextBody, brandingOptions)
                : '';

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
                                Text: brandedText
                                        ? {
                                                        Data: brandedText,
                                                        Charset: 'UTF-8'
                                                }
                                        : undefined,
                                Html: brandedHtml
                                        ? {
                                                        Data: brandedHtml,
                                                        Charset: 'UTF-8'
                                                }
                                        : undefined
                        }
                },
                Tags: normalizedTags.length ? normalizedTags : undefined
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
