function parseDate(value) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
	return String(value).padStart(2, '0');
}

function toGoogleDateStamp(value) {
	const date = parseDate(value);
	if (!date) return '';
	return (
		`${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
		`T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
	);
}

function toIcsDateStamp(value) {
	return toGoogleDateStamp(value);
}

function ensureEventEnd(startValue, endValue) {
	const start = parseDate(startValue);
	if (!start) return null;
	const end = parseDate(endValue);
	if (end) return end;
	return new Date(start.getTime() + 60 * 60 * 1000);
}

function compactText(value) {
	return String(value || '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function escapeIcsText(value) {
	return String(value || '')
		.replace(/\\/g, '\\\\')
		.replace(/\r?\n/g, '\\n')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,');
}

function foldIcsLine(line) {
	const limit = 74;
	if (line.length <= limit) return line;
	const chunks = [];
	let index = 0;
	while (index < line.length) {
		chunks.push(line.slice(index, index + limit));
		index += limit;
	}
	return chunks.join('\r\n ');
}

export function buildGoogleCalendarUrl({ title, start, end, description, location, url }) {
	const startStamp = toGoogleDateStamp(start);
	if (!startStamp) return '';
	const endStamp = toGoogleDateStamp(ensureEventEnd(start, end));
	const params = new URLSearchParams();
	params.set('action', 'TEMPLATE');
	params.set('text', compactText(title) || 'Event');
	params.set('dates', `${startStamp}/${endStamp}`);

	const detailsParts = [compactText(description), compactText(url)].filter(Boolean);
	if (detailsParts.length) params.set('details', detailsParts.join('\n\n'));

	const cleanLocation = compactText(location);
	if (cleanLocation) params.set('location', cleanLocation);

	return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcsContent({ uid, title, start, end, description, location, url }) {
	const startStamp = toIcsDateStamp(start);
	if (!startStamp) return '';
	const endStamp = toIcsDateStamp(ensureEventEnd(start, end));
	const dtStamp = toIcsDateStamp(new Date());
	const safeUid = compactText(uid) || `${Date.now()}@3fp`;

	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//3 Feet Please//Calendar//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${escapeIcsText(safeUid)}`,
		`DTSTAMP:${dtStamp}`,
		`DTSTART:${startStamp}`,
		`DTEND:${endStamp}`,
		`SUMMARY:${escapeIcsText(compactText(title) || 'Event')}`
	];

	const cleanDescription = compactText(description);
	if (cleanDescription) lines.push(`DESCRIPTION:${escapeIcsText(cleanDescription)}`);
	const cleanLocation = compactText(location);
	if (cleanLocation) lines.push(`LOCATION:${escapeIcsText(cleanLocation)}`);
	const cleanUrl = compactText(url);
	if (cleanUrl) lines.push(`URL:${escapeIcsText(cleanUrl)}`);

	lines.push('END:VEVENT', 'END:VCALENDAR');
	return lines.map(foldIcsLine).join('\r\n');
}

export function eventLocation(...parts) {
	return parts
		.map((part) => compactText(part))
		.filter(Boolean)
		.join(', ');
}
