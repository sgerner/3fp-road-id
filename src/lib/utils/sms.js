export const SMS_MAX_BODY_LENGTH = 480;
export const SMS_MAX_SEGMENTS = 3;

const STOP_KEYWORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'arret']);
const HELP_KEYWORDS = new Set(['help', 'info', 'support']);
const START_KEYWORDS = new Set(['start', 'unstop', 'subscribe']);
function cleanText(value, maxLength = 2000) {
	if (value === null || value === undefined) return '';
	return String(value).split('\u0000').join('').trim().slice(0, maxLength);
}

function isGsm7Basic(value) {
	for (const character of value) {
		if (character.codePointAt(0) > 127) return false;
	}
	return true;
}

export function smsSegmentCount(body) {
	const normalized = String(body ?? '');
	if (!normalized) return 0;
	if (isGsm7Basic(normalized)) {
		return normalized.length <= 160 ? 1 : Math.ceil(normalized.length / 153);
	}
	return normalized.length <= 70 ? 1 : Math.ceil(normalized.length / 67);
}

function assertAllowedLinks(body) {
	const urls = Array.from(String(body).matchAll(/(?:https?:\/\/|www\.)[^\s<]+/gi)).map(
		(match) => match[0]
	);
	for (const rawUrl of urls) {
		try {
			const parsed = new URL(
				rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl.replace(/[),.!?;:]+$/, '')
			);
			const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
			if (hostname !== '3fp.org') {
				throw new Error('SMS messages may only include links to 3fp.org.');
			}
		} catch (error) {
			if (error?.message?.includes('only include links')) throw error;
			throw new Error('SMS messages contain an invalid link.');
		}
	}
}

export function validateSmsBody(value, { appendStopFooter = false } = {}) {
	let body = String(value ?? '')
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t]+\n/g, '\n')
		.trim();
	if (!body) throw new Error('SMS message cannot be empty.');
	if (body.length > SMS_MAX_BODY_LENGTH) {
		throw new Error(`SMS messages are limited to ${SMS_MAX_BODY_LENGTH} characters.`);
	}
	if (appendStopFooter && !/\breply\s+stop\b/i.test(body)) {
		body = `${body} Reply STOP to opt out.`;
	}
	if (body.length > SMS_MAX_BODY_LENGTH) {
		throw new Error(`SMS messages are limited to ${SMS_MAX_BODY_LENGTH} characters.`);
	}
	assertAllowedLinks(body);
	const segments = smsSegmentCount(body);
	if (segments > SMS_MAX_SEGMENTS) {
		throw new Error(`SMS messages are limited to ${SMS_MAX_SEGMENTS} segments.`);
	}
	return { body, segments };
}

export function classifySmsKeyword(value) {
	const normalized = cleanText(value, 160).toLowerCase();
	const words = normalized.match(/[a-z]+/g) || [];
	if (words.some((word) => STOP_KEYWORDS.has(word))) return 'stop';
	const keyword = words.join('');
	if (HELP_KEYWORDS.has(keyword) && words.length === 1) return 'help';
	if (START_KEYWORDS.has(keyword) && words.length === 1) return 'start';
	return null;
}

export function buildSmsContextKey({
	activityEventId,
	activityOccurrenceId,
	volunteerEventId,
	volunteerSignupId,
	bikeValetReference,
	contextKey
} = {}) {
	if (contextKey) return cleanText(contextKey, 240);
	if (activityEventId) {
		return `ride:${activityEventId}:${activityOccurrenceId || 'general'}`;
	}
	if (volunteerEventId) {
		return `volunteer:${volunteerEventId}:${volunteerSignupId || 'general'}`;
	}
	if (bikeValetReference) return `bike-valet:${cleanText(bikeValetReference, 120)}`;
	return 'general';
}
