/** @type {Set<string> | null} */
let supportedTimezoneSet = null;

/** @type {Map<string, string | null>} */
const canonicalTimezoneCache = new Map();

/** @type {Map<string, Intl.DateTimeFormat>} */
const formatterCache = new Map();

function getSupportedTimezoneSet() {
	if (supportedTimezoneSet) return supportedTimezoneSet;
	if (typeof Intl?.supportedValuesOf === 'function') {
		try {
			supportedTimezoneSet = new Set(Intl.supportedValuesOf('timeZone'));
			return supportedTimezoneSet;
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Resolve a timezone string to its canonical IANA identifier, or null if invalid.
 * Mirrors src/lib/server/timezones.js while remaining browser-safe and supporting UTC/legacy aliases.
 * @param {unknown} timezone
 * @returns {string | null}
 */
export function canonicalizeTimezone(timezone) {
	if (typeof timezone !== 'string') return null;
	const value = timezone.trim();
	if (!value) return null;
	if (canonicalTimezoneCache.has(value)) {
		return canonicalTimezoneCache.get(value) ?? null;
	}

	const supported = getSupportedTimezoneSet();
	let isValid = supported ? supported.has(value) : false;
	let canonical = null;

	try {
		canonical = new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
		isValid = Boolean(canonical);
	} catch {
		isValid = false;
	}

	const resolved = isValid ? canonical || value : null;
	canonicalTimezoneCache.set(value, resolved);
	return resolved;
}

/**
 * Validate an event IANA timezone, returning `fallback` for missing or malformed legacy values
 * so `Intl.DateTimeFormat` never throws `RangeError`.
 * @template {string | null | undefined} TFallback
 * @param {unknown} timezone
 * @param {TFallback} [fallback=null]
 * @returns {string | TFallback}
 */
export function normalizeEventTimezone(timezone, fallback = /** @type {any} */ (null)) {
	if (typeof timezone !== 'string') return fallback;
	const value = timezone.trim();
	if (!value) return fallback;
	return canonicalizeTimezone(value) ? value : fallback;
}

/**
 * Resolve the active runtime viewer timezone, or `fallback` when unavailable.
 * @template {string | null | undefined} TFallback
 * @param {TFallback} [fallback=null]
 * @returns {string | TFallback}
 */
export function getViewerTimezone(fallback = /** @type {any} */ (null)) {
	try {
		const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return normalizeEventTimezone(resolved, fallback);
	} catch {
		return fallback;
	}
}

/**
 * Return a cached `Intl.DateTimeFormat` instance keyed by locale, canonical timezone, and options.
 * @param {unknown} timezone
 * @param {Intl.DateTimeFormatOptions} [options={}]
 * @param {string} [locale='en-US']
 * @returns {Intl.DateTimeFormat}
 */
export function getCachedDateTimeFormat(timezone, options = {}, locale = 'en-US') {
	const canonicalTz = canonicalizeTimezone(timezone);
	const optionEntries = Object.entries(options)
		.filter(([, value]) => value !== undefined)
		.sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
	const cacheKey = `${locale || 'default'}|${canonicalTz ?? '__local__'}|${JSON.stringify(optionEntries)}`;

	const cached = formatterCache.get(cacheKey);
	if (cached) return cached;

	/** @type {Intl.DateTimeFormatOptions} */
	const formatOptions = canonicalTz ? { ...options, timeZone: canonicalTz } : { ...options };
	const formatter = new Intl.DateTimeFormat(locale || undefined, formatOptions);
	formatterCache.set(cacheKey, formatter);
	return formatter;
}

/**
 * Return the current number of cached `Intl.DateTimeFormat` instances.
 */
export function getFormatterCacheSize() {
	return formatterCache.size;
}

/**
 * Parse a `Date`, ISO timestamp, or epoch value into a valid `Date` or `null`.
 * @param {unknown} value
 * @returns {Date | null}
 */
export function parseCalendarDate(value) {
	if (value === null || value === undefined || value === '') return null;
	const date = value instanceof Date ? value : new Date(/** @type {string | number} */ (value));
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format a `Date` using its civil local `YYYY-MM-DD` components (never slicing UTC `toISOString()`),
 * returning `''` for nullish, non-Date, or invalid `Date` inputs.
 * @param {Date | null | undefined} date
 * @returns {string}
 */
export function toLocalDateKey(date) {
	if (!date || typeof date.getTime !== 'function' || Number.isNaN(date.getTime())) {
		return '';
	}
	const year = String(date.getFullYear()).padStart(4, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Alias of `toLocalDateKey` for civil `YYYY-MM-DD` calendar grid keys.
 * @param {Date | null | undefined} date
 * @returns {string}
 */
export function toCivilDateKey(date) {
	return toLocalDateKey(date);
}

/**
 * Format an event instant into its civil `YYYY-MM-DD` date key in `timezone`,
 * falling back to viewer local civil time when `timezone` is missing or invalid.
 * @param {unknown} value
 * @param {unknown} [timezone]
 * @returns {string}
 */
export function toEventDateKey(value, timezone) {
	const date = parseCalendarDate(value);
	if (!date) return '';

	const validTz = normalizeEventTimezone(timezone, null);
	if (!validTz) {
		return toCivilDateKey(date);
	}

	const parts = getCachedDateTimeFormat(
		validTz,
		{
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		},
		'en-US'
	).formatToParts(date);

	let year = '';
	let month = '';
	let day = '';
	for (const part of parts) {
		if (part.type === 'year') year = part.value;
		else if (part.type === 'month') month = part.value;
		else if (part.type === 'day') day = part.value;
	}
	return year && month && day ? `${year}-${month}-${day}` : toCivilDateKey(date);
}

/**
 * Group events by their venue IANA timezone civil `YYYY-MM-DD` date key (with viewer-local fallback).
 * @template T
 * @param {T[]} items
 * @param {(item: T) => unknown} getStart
 * @param {(item: T) => unknown} [getTimezone]
 * @returns {Record<string, T[]>}
 */
export function bucketEventsByTimezone(
	items,
	getStart,
	getTimezone = (item) => /** @type {any} */ (item)?.timezone
) {
	/** @type {Record<string, T[]>} */
	const grouped = {};
	for (const item of items ?? []) {
		if (!item) continue;
		const key = toEventDateKey(getStart(item), getTimezone(item));
		if (!key) continue;
		(grouped[key] ??= []).push(item);
	}
	return grouped;
}

/**
 * Build a local-midnight start-of-month `Date` from a civil `YYYY-MM-DD` key.
 * @param {string | null | undefined} dateKey
 * @param {Date} [fallbackDate]
 * @returns {Date}
 */
export function startOfMonthFromDateKey(dateKey, fallbackDate = new Date()) {
	const match = typeof dateKey === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey) : null;
	if (match) {
		return new Date(Number(match[1]), Number(match[2]) - 1, 1);
	}
	return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1);
}

/**
 * Add calendar days to a civil `YYYY-MM-DD` key without UTC rollover.
 * @param {string} dateKey
 * @param {number} offsetDays
 * @returns {string}
 */
export function addDaysToDateKey(dateKey, offsetDays) {
	const match = typeof dateKey === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey) : null;
	if (!match) return '';
	const next = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offsetDays);
	return toCivilDateKey(next);
}

/**
 * Evaluate date-range presets against civil `YYYY-MM-DD` keys consistently with calendar placement.
 * @param {string} eventDateKey
 * @param {string} preset
 * @param {{ todayKey?: string, customStartDate?: string, customEndDate?: string }} [options]
 * @returns {boolean}
 */
export function matchesCivilDateRange(
	eventDateKey,
	preset,
	{ todayKey = toCivilDateKey(new Date()), customStartDate = '', customEndDate = '' } = {}
) {
	if (!eventDateKey) return false;
	if (!preset || preset === 'anytime') return true;

	if (preset === 'today') {
		return Boolean(todayKey) && eventDateKey === todayKey;
	}

	if (preset === 'tomorrow') {
		if (!todayKey) return false;
		return eventDateKey === addDaysToDateKey(todayKey, 1);
	}

	if (preset === 'this_week' || preset === 'next_week') {
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayKey);
		if (!match) return false;
		const todayLocal = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
		const weekday = todayLocal.getDay();
		const weekOffset = preset === 'next_week' ? 7 - weekday : -weekday;
		const startKey = addDaysToDateKey(todayKey, weekOffset);
		const endKey = addDaysToDateKey(startKey, 6);
		return eventDateKey >= startKey && eventDateKey <= endKey;
	}

	if (preset === 'custom') {
		const startKey = customStartDate?.trim() || '';
		const endKey = customEndDate?.trim() || '';
		if (!startKey && !endKey) return true;
		if (startKey && eventDateKey < startKey) return false;
		if (endKey && eventDateKey > endKey) return false;
		return true;
	}

	return true;
}

/**
 * Return the short timezone abbreviation (e.g. `MST`, `PST`, `CST`, `EST`, `UTC`) for an instant.
 * @param {unknown} value
 * @param {unknown} timezone
 * @returns {string}
 */
export function getTimezoneShortName(value, timezone) {
	const date = parseCalendarDate(value);
	const validTz = normalizeEventTimezone(timezone, null);
	if (!date || !validTz) return '';

	const parts = getCachedDateTimeFormat(validTz, { timeZoneName: 'short' }, 'en-US').formatToParts(
		date
	);
	return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

/**
 * Return a short timezone badge (such as `MST`) when `eventTimezone` differs from `viewerTimezone`,
 * or `''` when the viewer shares that timezone or the event falls back to viewer local time.
 * @param {unknown} value
 * @param {unknown} eventTimezone
 * @param {unknown} [viewerTimezone]
 * @returns {string}
 */
export function getTimezoneBadge(value, eventTimezone, viewerTimezone = getViewerTimezone()) {
	const eventCanonical = canonicalizeTimezone(eventTimezone);
	if (!eventCanonical) return '';

	const viewerCanonical = canonicalizeTimezone(viewerTimezone);
	if (viewerCanonical && eventCanonical === viewerCanonical) {
		return '';
	}

	return getTimezoneShortName(value, eventCanonical);
}

/**
 * Format an instant's short clock time (e.g. `6:00 PM`) in `timezone` (with viewer-local fallback).
 * @param {unknown} value
 * @param {unknown} [timezone]
 * @returns {string}
 */
export function formatEventTime(value, timezone) {
	const date = parseCalendarDate(value);
	if (!date) return '';
	return getCachedDateTimeFormat(
		timezone,
		{
			hour: 'numeric',
			minute: '2-digit'
		},
		'en-US'
	).format(date);
}

/**
 * Format a ride start/end schedule in its venue IANA timezone (aligned with activities.js).
 * @param {unknown} startsAt
 * @param {unknown} [endsAt]
 * @param {unknown} [timezone]
 * @param {{ includeWeekday?: boolean, includeEnd?: boolean, rangeSeparator?: string }} [options]
 * @returns {string}
 */
export function formatRideSchedule(
	startsAt,
	endsAt,
	timezone,
	{ includeWeekday = true, includeEnd = true, rangeSeparator = ' – ' } = {}
) {
	const start = parseCalendarDate(startsAt);
	if (!start) return '';
	const end = includeEnd ? parseCalendarDate(endsAt) : null;

	const dateOptions = /** @type {Intl.DateTimeFormatOptions} */ (
		includeWeekday
			? { weekday: 'short', month: 'short', day: 'numeric' }
			: { month: 'short', day: 'numeric' }
	);
	const dateFormatter = getCachedDateTimeFormat(timezone, dateOptions, 'en-US');
	const startDateLabel = dateFormatter.format(start);
	const startTimeLabel = formatEventTime(start, timezone);

	if (!end || end.getTime() === start.getTime()) {
		return `${startDateLabel} · ${startTimeLabel}`;
	}

	const endTimeLabel = formatEventTime(end, timezone);
	if (toEventDateKey(start, timezone) === toEventDateKey(end, timezone)) {
		return `${startDateLabel} · ${startTimeLabel}${rangeSeparator}${endTimeLabel}`;
	}

	const endDateLabel = dateFormatter.format(end);
	return `${startDateLabel} ${startTimeLabel} → ${endDateLabel} ${endTimeLabel}`;
}

/**
 * Format month/day/time fields for compact ride date blocks in the ride's venue timezone.
 * @param {unknown} startsAt
 * @param {unknown} [timezone]
 * @returns {{ month: string, day: string, time: string }}
 */
export function formatRideDayBlock(startsAt, timezone) {
	const start = parseCalendarDate(startsAt);
	if (!start) return { month: '--', day: '--', time: '--' };

	const month = getCachedDateTimeFormat(timezone, { month: 'short' }, 'en-US')
		.format(start)
		.toUpperCase();
	const day = getCachedDateTimeFormat(timezone, { day: 'numeric' }, 'en-US').format(start);
	const time = formatEventTime(start, timezone);
	return { month, day, time };
}

/**
 * Format a volunteer event start/end schedule in its venue IANA timezone
 * (aligned with src/routes/volunteer/[slug]/+page.svelte).
 * @param {unknown} startsAt
 * @param {unknown} [endsAt]
 * @param {unknown} [timezone]
 * @param {{ dateStyle?: 'full' | 'long' | 'medium' | 'short' }} [options]
 * @returns {string}
 */
export function formatVolunteerSchedule(startsAt, endsAt, timezone, { dateStyle = 'full' } = {}) {
	const start = parseCalendarDate(startsAt);
	if (!start) return '';
	const end = parseCalendarDate(endsAt);

	const dateFormatter = getCachedDateTimeFormat(timezone, { dateStyle }, 'en-US');
	const startDateLabel = dateFormatter.format(start);
	const startTimeLabel = formatEventTime(start, timezone);

	if (!end || end.getTime() === start.getTime()) {
		return `${startDateLabel} · ${startTimeLabel}`.trim();
	}

	const endTimeLabel = formatEventTime(end, timezone);
	if (toEventDateKey(start, timezone) === toEventDateKey(end, timezone)) {
		return `${startDateLabel} · ${startTimeLabel} – ${endTimeLabel}`.trim();
	}

	const endDateLabel = dateFormatter.format(end);
	return `${startDateLabel} ${startTimeLabel} → ${endDateLabel} ${endTimeLabel}`.trim();
}

/**
 * Build six Sunday-first weeks for a month using civil `YYYY-MM-DD` date keys by default.
 * @template T
 * @param {Date} reference
 * @param {Record<string, T[]>} [itemsByDate]
 * @param {(date: Date) => string} [toDateKey=toLocalDateKey]
 */
export function buildMonthGrid(reference, itemsByDate = {}, toDateKey = toLocalDateKey) {
	const month = reference.getMonth();
	const year = reference.getFullYear();
	const firstOfMonth = new Date(year, month, 1);
	const firstWeekday = firstOfMonth.getDay();

	return Array.from({ length: 6 }, (_, week) =>
		Array.from({ length: 7 }, (_, weekday) => {
			const date = new Date(year, month, 1 - firstWeekday + week * 7 + weekday);
			const key = toDateKey(date);
			return {
				date,
				key,
				inMonth: date.getMonth() === month && date.getFullYear() === year,
				items: itemsByDate[key] ?? []
			};
		})
	);
}
