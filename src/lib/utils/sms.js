export const SMS_MAX_BODY_LENGTH = 480;
export const SMS_MAX_SEGMENTS = 3;
export const SMS_CATEGORY_BY_KIND = Object.freeze({
	ride_reminder: 'ride_reminders',
	volunteer_reminder: 'volunteer_reminders',
	admin: 'admin_messages',
	bike_valet: 'bike_valet_messages'
});

const STOP_KEYWORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'arret']);
const HELP_KEYWORDS = new Set(['help', 'info', 'support']);
const START_KEYWORDS = new Set(['start', 'unstop', 'subscribe']);
const GSM7_BASIC = new Set(
	Array.from(
		'@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9 !"#\u00a4%&\'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0'
	)
);
const GSM7_EXTENSION = new Set(['\f', '^', '{', '}', '\\', '[', '~', ']', '|', '\u20ac']);
const LINK_LIKE_PATTERN =
	/(?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:\/[^\s<]*)?/gi;
const SMS_STATUS_RANK = Object.freeze({
	queued: 0,
	initiated: 1,
	sending: 1,
	sent: 2,
	failed: 3,
	undelivered: 3,
	canceled: 3,
	cancelled: 3,
	delivered: 4
});
function cleanText(value, maxLength = 2000) {
	if (value === null || value === undefined) return '';
	return String(value).split('\u0000').join('').trim().slice(0, maxLength);
}

function gsm7UnitCount(value) {
	let units = 0;
	for (const character of value) {
		if (GSM7_BASIC.has(character)) units += 1;
		else if (GSM7_EXTENSION.has(character)) units += 2;
		else return null;
	}
	return units;
}

export function smsSegmentCount(body) {
	const normalized = String(body ?? '');
	if (!normalized) return 0;
	const gsm7Units = gsm7UnitCount(normalized);
	if (gsm7Units !== null) {
		return gsm7Units <= 160 ? 1 : Math.ceil(gsm7Units / 153);
	}
	// JavaScript string length is the UTF-16 code-unit count used by UCS-2
	// segmentation, so astral characters such as emoji correctly consume two.
	return normalized.length <= 70 ? 1 : Math.ceil(normalized.length / 67);
}

function assertAllowedLinks(body) {
	const urls = Array.from(String(body).matchAll(LINK_LIKE_PATTERN)).map((match) => match[0]);
	for (const rawUrl of urls) {
		try {
			const cleaned = rawUrl.replace(/[),.!?;:]+$/, '');
			const parsed = new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
			const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
			if (hostname !== '3fp.org' && !hostname.endsWith('.3fp.org')) {
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

export function subscriptionAllowsSms(subscription, { kind, phoneE164 } = {}) {
	if (!subscription || subscription.status !== 'active') return false;
	if (phoneE164 && subscription.phone_e164 !== phoneE164) return false;
	const category = SMS_CATEGORY_BY_KIND[kind];
	return !category || subscription[category] === true;
}

export function shouldApplySmsStatus(currentStatus, nextStatus) {
	const current = String(currentStatus || '').toLowerCase();
	const next = String(nextStatus || '').toLowerCase();
	if (!next) return false;
	if (!current) return true;
	const currentRank = SMS_STATUS_RANK[current];
	const nextRank = SMS_STATUS_RANK[next];
	if (nextRank === undefined) return currentRank === undefined;
	if (currentRank === undefined) return true;
	return nextRank >= currentRank;
}

export function smsProviderMessageId(payload = {}) {
	return String(
		payload?.id ||
			payload?.message_id ||
			payload?.MessageSid ||
			payload?.message_sid ||
			payload?.sid ||
			''
	)
		.trim()
		.slice(0, 240);
}

export function smsProviderStatus(payload = {}) {
	return String(payload?.status || payload?.MessageStatus || payload?.message_status || '')
		.trim()
		.toLowerCase()
		.slice(0, 80);
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
