import path from 'node:path';

export const DEFAULT_CREATED_BY_USER_ID = '9f78db1a-27b6-488a-8288-fbd38e85c815';
const DEFAULT_TIMEZONE = 'America/Phoenix';
const DEFAULT_UTC_OFFSET = '-07:00';
const MAX_OCCURRENCE_MONTHS = 18;

const PACE_TO_DIFFICULTY = new Map([
	['opt_LQaBOwx3oU60EENfXGG2r', 4],
	['opt_BHEaWiOKJFY0QRiOOcHpm', 3],
	['opt_7jX5VnWkrUR5ivhhsZpsd', 2],
	['opt_yELFx9Bk1VZjsikBw6wvo', 5],
	['opt_GARRmkhaoNc52CB0mLouX', 5],
	['opt_h1cBzZetTVuxuwImhADnM', 5],
	['opt_RliMgBKM49OBaIoQbDmff', 5],
	['opt_5IeJ6Fev2yuVkME9yCm6h', 5],
	['opt_Ohl326sr59HH5n9xUj24v', 5]
]);

const BIKE_CATEGORY_MAP = new Map([
	['opt_llcwDhK4lCNn0XY1BX5YW', { label: 'Road', disciplineId: 1 }],
	['opt_gykJ9KX9fukVjmHVaXqXu', { label: 'Gravel', disciplineId: 3 }],
	['opt_fZSPlKBeWn5sPfeyp1scr', { label: 'Mountain', disciplineId: 2 }],
	['opt_7T2ItqNTzEnnPDW13BNiE', { label: 'Fixie', disciplineId: null }],
	['opt_WOP1MjjIO6zTvUzsrx0gP', { label: 'BMX', disciplineId: 4 }],
	['opt_mVJ7QvxyVs1zlG0dPvdLS', { label: 'E-bike', disciplineId: 8 }],
	['opt_9QlEhHWlBP2oUsAr7EWC8', { label: 'All Bikes Welcome', disciplineId: null }]
]);

const LEGACY_TITLE_PREFIX_RE =
	/^[A-Z]{2,6}\s*(?:-\s*)?\((?=[^)]*(?:weekly|monthly|daily|bi[- ]?monthly|bimonthly|every other))[^)]*\)\s*:?\s*/i;
const TITLE_FORMATTING_PREFIX_RE = /^(?:[A-Z]{2,6}\s*:\s*\((?:[^)]*)\)\s*|[A-Z]{2,6}\s*-\s*)/i;
const GEOCODER_USER_AGENT = '3 Feet Please Ride Geocoder';
const DATE_TIME_FORMATTER_CACHE = new Map();

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function uniq(values) {
	return Array.from(new Set(values.filter((value) => value !== null && value !== undefined)));
}

function compactWhitespace(value) {
	return safeTrim(value).replace(/\s+/g, ' ').trim();
}

function normalizeLocationText(value) {
	return compactWhitespace(value)
		.replace(/\s+,/g, ',')
		.replace(/[,; -]+$/g, '')
		.trim();
}

function normalizeDescriptionText(value) {
	const lines = String(value ?? '')
		.replace(/\r\n/g, '\n')
		.split('\n');
	const cleaned = lines
		.map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
		.join('\n')
		.trim();
	return cleaned
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)
		.join('\n\n');
}

function normalizeNumberArray(values) {
	return uniq(
		(values || []).map((value) => Number.parseInt(value, 10)).filter(Number.isFinite)
	).sort((left, right) => left - right);
}

function toFiniteNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

async function searchGeocode(query, { limit = 5, fetchImpl = fetch, countryCodes = '' } = {}) {
	const trimmed = safeTrim(query);
	if (!trimmed) return [];
	const normalizedCountryCodes = safeTrim(countryCodes).toLowerCase();

	const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
	nominatimUrl.searchParams.set('format', 'jsonv2');
	nominatimUrl.searchParams.set('limit', String(limit));
	nominatimUrl.searchParams.set('q', trimmed);
	if (normalizedCountryCodes) {
		nominatimUrl.searchParams.set('countrycodes', normalizedCountryCodes);
	}

	const nominatimResponse = await fetchImpl(nominatimUrl.toString(), {
		headers: {
			accept: 'application/json',
			'user-agent': GEOCODER_USER_AGENT
		}
	});

	if (nominatimResponse.ok) {
		const payload = await nominatimResponse.json().catch(() => []);
		const matches = (Array.isArray(payload) ? payload : [])
			.map((entry) => ({
				label: safeTrim(entry.display_name),
				latitude: toFiniteNumber(entry.lat),
				longitude: toFiniteNumber(entry.lon),
				source: 'nominatim'
			}))
			.filter((entry) => entry.label && entry.latitude !== null && entry.longitude !== null);
		if (matches.length) return matches;
	}

	const googleKey = safeTrim(process.env.PUBLIC_GOOGLE_MAPS_API_KEY);
	if (!googleKey) return [];

	const googleUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
	googleUrl.searchParams.set('address', trimmed);
	googleUrl.searchParams.set('key', googleKey);
	if (normalizedCountryCodes === 'us') {
		googleUrl.searchParams.set('components', 'country:US');
	}

	const googleResponse = await fetchImpl(googleUrl.toString(), {
		headers: { accept: 'application/json' }
	});
	if (!googleResponse.ok) return [];

	const googlePayload = await googleResponse.json().catch(() => null);
	if (!googlePayload || !Array.isArray(googlePayload.results)) return [];
	if (!['OK', 'ZERO_RESULTS'].includes(googlePayload.status)) return [];

	return googlePayload.results
		.slice(0, limit)
		.map((entry) => ({
			label: safeTrim(entry.formatted_address),
			latitude: toFiniteNumber(entry.geometry?.location?.lat),
			longitude: toFiniteNumber(entry.geometry?.location?.lng),
			source: 'google'
		}))
		.filter((entry) => entry.label && entry.latitude !== null && entry.longitude !== null);
}

export async function geocodeLocation(
	query,
	{ countryCodes = '', limit = 1, fetchImpl = fetch } = {}
) {
	const normalizedCountryCodes = safeTrim(countryCodes).toLowerCase();
	const primaryMatch =
		(
			await searchGeocode(query, {
				limit,
				fetchImpl,
				countryCodes: normalizedCountryCodes
			})
		)[0] ?? null;
	if (primaryMatch) return primaryMatch;
	if (!normalizedCountryCodes) return null;
	return (
		(
			await searchGeocode(query, {
				limit,
				fetchImpl
			})
		)[0] ?? null
	);
}

function slugify(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function toIsoWeekday(sourceDay) {
	const day = Number(sourceDay);
	if (day === 0) return 7;
	if (day >= 1 && day <= 7) return day;
	return null;
}

function toDateOnlyUtc(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
		date.getUTCDate()
	).padStart(2, '0')}`;
}

function parseDateOnly(value) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
	if (!match) return null;
	return {
		year: Number(match[1]),
		month: Number(match[2]) - 1,
		day: Number(match[3])
	};
}

function buildUtcDateFromParts({ year, month, day }, templateDate) {
	return new Date(
		Date.UTC(
			year,
			month,
			day,
			templateDate.getUTCHours(),
			templateDate.getUTCMinutes(),
			templateDate.getUTCSeconds(),
			templateDate.getUTCMilliseconds()
		)
	);
}

function isoWeekday(date) {
	const day = date.getUTCDay();
	return day === 0 ? 7 : day;
}

function startOfUtcDay(date) {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
	);
}

function addUtcDays(date, days) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

function addUtcMonths(date, months) {
	const next = new Date(date);
	next.setUTCMonth(next.getUTCMonth() + months);
	return next;
}

function nthWeekdayOfMonth(year, month, weekday, position) {
	const dates = [];
	const first = new Date(Date.UTC(year, month, 1));
	for (
		let cursor = new Date(first);
		cursor.getUTCMonth() === month;
		cursor = addUtcDays(cursor, 1)
	) {
		if (isoWeekday(cursor) === weekday) dates.push(new Date(cursor));
	}
	if (!dates.length) return null;
	if (position === -1) return dates[dates.length - 1];
	return dates[position - 1] ?? null;
}

function generateWeeklyOccurrences({ templateStart, durationMs, rule, horizonEnd }) {
	const results = [];
	const firstDate = parseDateOnly(rule.starts_on);
	if (!firstDate) return results;
	const cursor = startOfUtcDay(new Date(Date.UTC(firstDate.year, firstDate.month, firstDate.day)));
	const weekdays = rule.by_weekdays.length ? rule.by_weekdays : [isoWeekday(templateStart)];
	for (let day = new Date(cursor); day <= horizonEnd; day = addUtcDays(day, 1)) {
		const diffDays = Math.floor((day.getTime() - cursor.getTime()) / 86_400_000);
		const weekIndex = Math.floor(diffDays / 7);
		if (weekIndex % rule.interval_count !== 0) continue;
		if (!weekdays.includes(isoWeekday(day))) continue;
		const startsAt = buildUtcDateFromParts(
			{ year: day.getUTCFullYear(), month: day.getUTCMonth(), day: day.getUTCDate() },
			templateStart
		);
		if (startsAt < templateStart) continue;
		results.push({
			starts_at: startsAt.toISOString(),
			ends_at: new Date(startsAt.getTime() + durationMs).toISOString()
		});
	}
	return results;
}

function generateMonthlyOccurrences({ templateStart, durationMs, rule, horizonEnd }) {
	const results = [];
	const startDate = parseDateOnly(rule.starts_on);
	if (!startDate) return results;
	const origin = new Date(Date.UTC(startDate.year, startDate.month, 1));
	const weekdays = rule.by_weekdays.length ? rule.by_weekdays : [isoWeekday(templateStart)];
	const positions = rule.by_set_positions.length ? rule.by_set_positions : [1];
	for (
		let monthCursor = new Date(origin);
		monthCursor <= horizonEnd;
		monthCursor = addUtcMonths(monthCursor, 1)
	) {
		const monthDelta =
			(monthCursor.getUTCFullYear() - origin.getUTCFullYear()) * 12 +
			(monthCursor.getUTCMonth() - origin.getUTCMonth());
		if (monthDelta % rule.interval_count !== 0) continue;
		for (const weekday of weekdays) {
			for (const position of positions) {
				const day = nthWeekdayOfMonth(
					monthCursor.getUTCFullYear(),
					monthCursor.getUTCMonth(),
					weekday,
					position
				);
				if (!day) continue;
				const startsAt = buildUtcDateFromParts(
					{ year: day.getUTCFullYear(), month: day.getUTCMonth(), day: day.getUTCDate() },
					templateStart
				);
				if (startsAt < templateStart) continue;
				if (startsAt > horizonEnd) continue;
				results.push({
					starts_at: startsAt.toISOString(),
					ends_at: new Date(startsAt.getTime() + durationMs).toISOString()
				});
			}
		}
	}
	return results;
}

function buildOccurrenceSchedule(activity, recurrenceRule) {
	const templateStart = new Date(activity.starts_at);
	const templateEnd = new Date(activity.ends_at);
	if (Number.isNaN(templateStart.getTime()) || Number.isNaN(templateEnd.getTime())) return [];
	const durationMs = Math.max(30 * 60_000, templateEnd.getTime() - templateStart.getTime());
	if (!recurrenceRule) {
		return [
			{
				starts_at: templateStart.toISOString(),
				ends_at: new Date(templateStart.getTime() + durationMs).toISOString()
			}
		];
	}
	const horizonEnd = recurrenceRule.until_on
		? endOfUtcDay(new Date(`${recurrenceRule.until_on}T00:00:00.000Z`))
		: endOfUtcDay(addUtcMonths(templateStart, MAX_OCCURRENCE_MONTHS));
	const occurrences =
		recurrenceRule.frequency === 'monthly'
			? generateMonthlyOccurrences({ templateStart, durationMs, rule: recurrenceRule, horizonEnd })
			: generateWeeklyOccurrences({ templateStart, durationMs, rule: recurrenceRule, horizonEnd });
	return occurrences.sort(
		(left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()
	);
}

function pickPrimaryLink(event) {
	return Array.isArray(event.links) && event.links.length ? event.links[0] : null;
}

function buildSummary(description) {
	const firstParagraph = safeTrim(normalizeDescriptionText(description).split(/\n\s*\n/)[0]);
	if (!firstParagraph) return null;
	return firstParagraph.length > 180 ? `${firstParagraph.slice(0, 177).trim()}...` : firstParagraph;
}

function normalizeImportedTitle(title) {
	const cleaned = compactWhitespace(title)
		.replace(LEGACY_TITLE_PREFIX_RE, '')
		.replace(TITLE_FORMATTING_PREFIX_RE, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
	return cleaned.replace(/[:-]+$/g, '').trim();
}

function extractLocationName(event) {
	const primaryLink = pickPrimaryLink(event);
	if (primaryLink?.text) return compactWhitespace(primaryLink.text);
	const cleanedTitle = normalizeImportedTitle(event.title);
	return cleanedTitle || normalizeLocationText(event.location) || 'Ride start';
}

function buildDescription(event) {
	const base = normalizeDescriptionText(event.description);
	const baseLower = base.toLowerCase();
	const linkLines = (event.links || [])
		.map((link) => {
			const text = compactWhitespace(link?.text);
			const url = safeTrim(link?.url);
			if (!url) return null;
			if (baseLower && baseLower.includes(url.toLowerCase())) return null;
			return text ? `${text}: ${url}` : url;
		})
		.filter(Boolean);
	if (!linkLines.length) return base || null;
	return [base, 'More information:', ...linkLines].filter(Boolean).join('\n\n');
}

function normalizeGeocodeText(value) {
	const trimmed = safeTrim(value);
	if (!trimmed) return '';
	return trimmed
		.replace(/\bparking lot\b/gi, '')
		.replace(/\bpark(?:ing)?\b/gi, '')
		.replace(/\blot\b/gi, '')
		.replace(/\s{2,}/g, ' ')
		.replace(/\s+,/g, ',')
		.trim()
		.replace(/[,\- ]+$/g, '')
		.trim();
}

function isAmbiguousLocation(value) {
	const normalized = safeTrim(value).toLowerCase();
	if (!normalized) return true;
	return /\b(tbd|tba|unknown|varies|check link|details to follow|virtual|online|n\/a)\b/.test(
		normalized
	);
}

function buildGeocodeQueries(event) {
	const location = normalizeLocationText(event.location);
	if (!location || isAmbiguousLocation(location)) return [];
	const normalizedLocation = normalizeGeocodeText(location);
	const titleLocation = extractLocationName(event);
	return uniq([
		location,
		normalizedLocation,
		[titleLocation, location].filter(Boolean).join(', '),
		[titleLocation, normalizedLocation].filter(Boolean).join(', '),
		[location, 'Arizona'].filter(Boolean).join(', ')
	]).filter(Boolean);
}

async function geocodeEvent(event) {
	const countryCodes = safeTrim(event?.geocodeCountryCodes).toLowerCase();
	for (const query of buildGeocodeQueries(event)) {
		const match = await geocodeLocation(query, { limit: 1, countryCodes });
		if (match) return match;
	}
	return null;
}

function getDateTimeFormatter(timezone) {
	if (!DATE_TIME_FORMATTER_CACHE.has(timezone)) {
		DATE_TIME_FORMATTER_CACHE.set(
			timezone,
			new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			})
		);
	}
	return DATE_TIME_FORMATTER_CACHE.get(timezone);
}

function getDateTimePartsInTimeZone(date, timezone) {
	try {
		const formatter = getDateTimeFormatter(timezone);
		const partMap = {};
		for (const part of formatter.formatToParts(date)) {
			if (part.type === 'literal') continue;
			partMap[part.type] = part.value;
		}
		const year = Number(partMap.year);
		const month = Number(partMap.month);
		const day = Number(partMap.day);
		const hourRaw = Number(partMap.hour);
		const minute = Number(partMap.minute);
		const second = Number(partMap.second);
		if (![year, month, day, hourRaw, minute, second].every(Number.isFinite)) return null;
		return {
			year,
			month,
			day,
			hour: hourRaw === 24 ? 0 : hourRaw,
			minute,
			second
		};
	} catch {
		return null;
	}
}

function toUtcIso(dateOnly, hour, minute, timezone) {
	if (!safeTrim(dateOnly)) {
		throw new Error('Missing date');
	}
	const dateParts = parseDateOnly(dateOnly);
	if (!dateParts) throw new Error('Invalid date');
	const hh = String(Number(hour) || 0).padStart(2, '0');
	const mm = String(Number(minute) || 0).padStart(2, '0');
	const timezoneName = safeTrim(timezone || DEFAULT_TIMEZONE) || DEFAULT_TIMEZONE;
	if (timezoneName === DEFAULT_TIMEZONE) {
		const phoenixIso = new Date(`${dateOnly}T${hh}:${mm}:00${DEFAULT_UTC_OFFSET}`);
		if (Number.isNaN(phoenixIso.getTime())) {
			throw new Error('Invalid date/time');
		}
		return phoenixIso.toISOString();
	}
	const targetHour = Number(hh);
	const targetMinute = Number(mm);
	const targetLocalMs = Date.UTC(
		dateParts.year,
		dateParts.month,
		dateParts.day,
		targetHour,
		targetMinute,
		0
	);
	let utcMs = targetLocalMs;
	for (let attempt = 0; attempt < 6; attempt += 1) {
		const zonedParts = getDateTimePartsInTimeZone(new Date(utcMs), timezoneName);
		if (!zonedParts) break;
		const zonedLocalMs = Date.UTC(
			zonedParts.year,
			zonedParts.month - 1,
			zonedParts.day,
			zonedParts.hour,
			zonedParts.minute,
			zonedParts.second
		);
		const delta = targetLocalMs - zonedLocalMs;
		if (delta === 0) return new Date(utcMs).toISOString();
		utcMs += delta;
	}
	throw new Error(`Invalid date/time or timezone in seed file: ${timezoneName}`);
}

function inferMonthlySetPosition(dateOnly) {
	const parts = parseDateOnly(dateOnly);
	if (!parts) return [1];
	const current = new Date(Date.UTC(parts.year, parts.month, parts.day));
	const weekday = isoWeekday(current);
	const dates = [];
	for (
		let cursor = new Date(Date.UTC(parts.year, parts.month, 1));
		cursor.getUTCMonth() === parts.month;
		cursor = addUtcDays(cursor, 1)
	) {
		if (isoWeekday(cursor) === weekday) dates.push(toDateOnlyUtc(cursor));
	}
	const currentDateOnly = toDateOnlyUtc(current);
	const index = dates.indexOf(currentDateOnly);
	if (index === -1) return [1];
	if (index === dates.length - 1) return [-1];
	return [index + 1];
}

function resolveEventDateOnly(event, { field = 'startDate', fallbackField = 'start' } = {}) {
	const direct = safeTrim(event?.[field]);
	if (direct) return direct;
	const fallback = event?.[fallbackField];
	if (fallback === null || fallback === undefined || fallback === '') return '';
	const fallbackDate =
		typeof fallback === 'number' || /^\d+$/.test(String(fallback))
			? new Date(Number(fallback))
			: new Date(fallback);
	if (Number.isNaN(fallbackDate.getTime())) return '';
	return toDateOnlyUtc(fallbackDate);
}

function mapRecurrence(event, startsAt, startsOnDate) {
	const repeat = event.repeat || null;
	if (!repeat || !Object.keys(repeat).length) return null;
	const repeatPeriod = safeTrim(repeat.period) || (repeat.month ? 'month' : 'week');
	const intervalCount = Math.max(1, Number.parseInt(repeat.value ?? 1, 10) || 1);
	const repeatEnd = repeat.end ? toDateOnlyUtc(new Date(repeat.end)) : null;
	const weekDays = uniq((repeat.week?.days || []).map(toIsoWeekday).filter(Boolean));
	const recurrenceStart = safeTrim(startsOnDate) || toDateOnlyUtc(startsAt);
	if (repeatPeriod === 'month') {
		const positionType = repeat.month?.type;
		const positions = positionType === 'lastWeek' ? [-1] : inferMonthlySetPosition(recurrenceStart);
		return {
			frequency: 'monthly',
			interval_count: intervalCount,
			by_weekdays: weekDays.length ? weekDays : [isoWeekday(new Date(startsAt))],
			by_set_positions: positions,
			starts_on: recurrenceStart,
			until_on: repeatEnd
		};
	}
	return {
		frequency: 'weekly',
		interval_count: intervalCount,
		by_weekdays: weekDays,
		by_set_positions: [],
		starts_on: recurrenceStart,
		until_on: repeatEnd
	};
}

function deriveRideTraits(event) {
	const categories = event.categories || {};
	const paceIds = categories.cat_FN10uUkTKJ2ClRba8zvlz || [];
	const bikeIds = categories.cat_L7VpwwziHgCs0DV1r7T6p || [];
	const difficultyLevelIds = uniq(paceIds.map((id) => PACE_TO_DIFFICULTY.get(id)).filter(Boolean));
	const mappedBikes = bikeIds.map((id) => BIKE_CATEGORY_MAP.get(id)).filter(Boolean);
	const bikeSuitability = uniq(mappedBikes.map((entry) => entry.label));
	const ridingDisciplineIds = uniq(mappedBikes.map((entry) => entry.disciplineId).filter(Boolean));
	const description = safeTrim(event.description).toLowerCase();
	const isNoDrop =
		description.includes('no-drop') ||
		paceIds.includes('opt_7jX5VnWkrUR5ivhhsZpsd') ||
		paceIds.includes('opt_yELFx9Bk1VZjsikBw6wvo');
	return {
		difficultyLevelIds: difficultyLevelIds.length ? difficultyLevelIds : [5],
		ridingDisciplineIds,
		bikeSuitability,
		isNoDrop,
		paceNotes: buildSummary(event.description)
	};
}

async function ensureUniqueSlug(supabase, baseSlug) {
	let attempt = 0;
	let candidate = baseSlug || 'ride';
	while (attempt < 100) {
		const { count, error } = await supabase
			.from('activity_events')
			.select('id', { count: 'exact', head: true })
			.eq('slug', candidate);
		if (error) throw error;
		if (!count) return candidate;
		attempt += 1;
		candidate = `${baseSlug}-${attempt + 1}`;
	}
	return `${baseSlug}-${Date.now()}`;
}

function buildStoragePath(eventId, url, contentType) {
	const pathname = new URL(url).pathname;
	const extensionFromUrl = path.extname(pathname).toLowerCase();
	const extensionFromType =
		contentType === 'image/png'
			? '.png'
			: contentType === 'image/webp'
				? '.webp'
				: contentType === 'image/gif'
					? '.gif'
					: '.jpg';
	const extension = extensionFromUrl || extensionFromType;
	return `starter-rides/${eventId}/cover${extension}`;
}

function normalizeImageContentType(url, contentType) {
	const normalized = safeTrim(contentType).toLowerCase();
	if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(normalized)) {
		return normalized;
	}
	const extension = path.extname(new URL(url).pathname).toLowerCase();
	if (extension === '.png') return 'image/png';
	if (extension === '.webp') return 'image/webp';
	if (extension === '.gif') return 'image/gif';
	return 'image/jpeg';
}

async function uploadEventImage(supabase, event) {
	const imageUrl = safeTrim(event.image?.url);
	if (!imageUrl) return [];
	const response = await fetch(imageUrl);
	if (!response.ok) {
		throw new Error(
			`Unable to download source image for ${event.id}: ${response.status} ${response.statusText}`
		);
	}
	const contentType = normalizeImageContentType(imageUrl, response.headers.get('content-type'));
	const arrayBuffer = await response.arrayBuffer();
	const objectPath = buildStoragePath(event.id, imageUrl, contentType);
	const uploadResult = await supabase.storage.from('ride-media').upload(objectPath, arrayBuffer, {
		contentType,
		upsert: true
	});
	if (uploadResult.error) throw uploadResult.error;
	const { data } = supabase.storage.from('ride-media').getPublicUrl(objectPath);
	return data?.publicUrl ? [data.publicUrl] : [];
}

async function mapEvent(event, { slugPrefix, status, requireGeocoding, skipGeocoding }) {
	const timezone = safeTrim(event.timezone) || DEFAULT_TIMEZONE;
	const traits = deriveRideTraits(event);
	const rawTitle = compactWhitespace(event.title);
	const title = normalizeImportedTitle(rawTitle);
	const startDateOnly = resolveEventDateOnly(event, { field: 'startDate', fallbackField: 'start' });
	const endDateOnly =
		resolveEventDateOnly(event, { field: 'endDate', fallbackField: 'end' }) || startDateOnly;
	let startsAt;
	let endsAt;
	try {
		startsAt = toUtcIso(startDateOnly, event.startHour, event.startMinutes, timezone);
		endsAt = toUtcIso(endDateOnly, event.endHour, event.endMinutes, timezone);
	} catch (error) {
		return {
			skippedReason: 'invalid_datetime',
			sourceEventId: event.id,
			title,
			detail: error.message
		};
	}
	const seededLatitude = toFiniteNumber(event.startLatitude);
	const seededLongitude = toFiniteNumber(event.startLongitude);
	const geocoded =
		skipGeocoding || (seededLatitude !== null && seededLongitude !== null)
			? null
			: await geocodeEvent(event);
	const resolvedLatitude = seededLatitude ?? geocoded?.latitude ?? null;
	const resolvedLongitude = seededLongitude ?? geocoded?.longitude ?? null;
	if (requireGeocoding && (resolvedLatitude === null || resolvedLongitude === null)) {
		return {
			skippedReason: 'geocode_failed',
			sourceEventId: event.id,
			title
		};
	}
	const baseSlug = `${slugPrefix}${slugify(title) || slugify(event.id) || 'ride'}`;
	return {
		sourceEventId: event.id,
		activity: {
			source_event_id: event.id,
			title,
			slug: baseSlug,
			summary: buildSummary(event.description),
			description: buildDescription(event),
			timezone,
			starts_at: startsAt,
			ends_at: endsAt,
			status,
			start_location_name: extractLocationName(event),
			start_location_address: normalizeLocationText(event.location) || null,
			start_latitude: resolvedLatitude,
			start_longitude: resolvedLongitude,
			host_group_id: null,
			host_user_id: null,
			contact_email: null,
			contact_phone: null
		},
		recurrenceRule: mapRecurrence(event, startsAt, startDateOnly),
		ride: {
			participant_visibility: 'public',
			end_location_name: null,
			end_location_address: null,
			end_latitude: null,
			end_longitude: null,
			estimated_distance_miles: null,
			estimated_duration_minutes: null,
			elevation_gain_feet: null,
			pace_notes: traits.paceNotes,
			is_no_drop: traits.isNoDrop,
			surface_types: [],
			bike_suitability: traits.bikeSuitability,
			accessibility_notes: null,
			waiver_required: false,
			image_urls: []
		},
		difficultyLevelIds: traits.difficultyLevelIds,
		ridingDisciplineIds: traits.ridingDisciplineIds
	};
}

async function insertRide(supabase, mapped, createdByUserId) {
	const nowIso = new Date().toISOString();
	const slug = await ensureUniqueSlug(supabase, mapped.activity.slug);
	const activityInsert = {
		activity_type: 'ride',
		host_user_id: mapped.activity.host_user_id,
		host_group_id: mapped.activity.host_group_id,
		created_by_user_id: createdByUserId,
		updated_at: nowIso,
		published_at: mapped.activity.status === 'published' ? nowIso : null,
		source_event_id: mapped.activity.source_event_id,
		title: mapped.activity.title,
		slug,
		summary: mapped.activity.summary,
		description: mapped.activity.description,
		timezone: mapped.activity.timezone,
		starts_at: mapped.activity.starts_at,
		ends_at: mapped.activity.ends_at,
		status: mapped.activity.status,
		start_location_name: mapped.activity.start_location_name,
		start_location_address: mapped.activity.start_location_address,
		start_latitude: mapped.activity.start_latitude,
		start_longitude: mapped.activity.start_longitude,
		contact_email: mapped.activity.contact_email,
		contact_phone: mapped.activity.contact_phone
	};
	const { data: activity, error: activityError } = await supabase
		.from('activity_events')
		.insert(activityInsert)
		.select('*')
		.single();
	if (activityError) throw activityError;
	const { error: rideError } = await supabase.from('ride_details').insert({
		activity_event_id: activity.id,
		updated_at: nowIso,
		...mapped.ride
	});
	if (rideError) throw rideError;
	if (mapped.recurrenceRule) {
		const { error: recurrenceError } = await supabase.from('activity_recurrence_rules').insert({
			activity_event_id: activity.id,
			updated_at: nowIso,
			frequency: mapped.recurrenceRule.frequency,
			interval_count: mapped.recurrenceRule.interval_count,
			by_weekdays: mapped.recurrenceRule.by_weekdays,
			by_set_positions: mapped.recurrenceRule.by_set_positions.length
				? mapped.recurrenceRule.by_set_positions
				: null,
			starts_on: mapped.recurrenceRule.starts_on,
			until_on: mapped.recurrenceRule.until_on
		});
		if (recurrenceError) throw recurrenceError;
	}
	if (mapped.difficultyLevelIds.length) {
		const { error } = await supabase.from('activity_x_ride_difficulty_levels').insert(
			mapped.difficultyLevelIds.map((difficultyLevelId) => ({
				activity_event_id: activity.id,
				difficulty_level_id: difficultyLevelId
			}))
		);
		if (error) throw error;
	}
	if (mapped.ridingDisciplineIds.length) {
		const { error } = await supabase.from('activity_x_riding_disciplines').insert(
			mapped.ridingDisciplineIds.map((ridingDisciplineId) => ({
				activity_event_id: activity.id,
				riding_discipline_id: ridingDisciplineId
			}))
		);
		if (error) throw error;
	}
	const occurrences = buildOccurrenceSchedule(activityInsert, mapped.recurrenceRule);
	if (occurrences.length) {
		const { error } = await supabase.from('activity_occurrences').insert(
			occurrences.map((occurrence) => ({
				activity_event_id: activity.id,
				starts_at: occurrence.starts_at,
				ends_at: occurrence.ends_at,
				status: 'scheduled',
				is_generated: true,
				updated_at: new Date().toISOString()
			}))
		);
		if (error) throw error;
		const nextOccurrence =
			occurrences.find((occurrence) => occurrence.starts_at >= nowIso) || occurrences[0];
		const { error: updateError } = await supabase
			.from('activity_events')
			.update({
				next_occurrence_start: nextOccurrence.starts_at,
				next_occurrence_end: nextOccurrence.ends_at,
				updated_at: new Date().toISOString()
			})
			.eq('id', activity.id);
		if (updateError) throw updateError;
	}
	return { activityId: activity.id, slug, occurrenceCount: occurrences.length };
}

async function findExistingBySourceEventId(supabase, sourceEventId) {
	if (!sourceEventId) return null;
	const { data, error } = await supabase
		.from('activity_events')
		.select('id,slug,title')
		.eq('source_event_id', sourceEventId)
		.maybeSingle();
	if (error) throw error;
	return data ?? null;
}

function toTimeOfDayKey(iso) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function recurrenceKey(rule) {
	if (!rule) return 'single';
	const weekdays = normalizeNumberArray(rule.by_weekdays).join(',');
	const positions = normalizeNumberArray(rule.by_set_positions).join(',');
	const interval = Math.max(1, Number.parseInt(rule.interval_count ?? 1, 10) || 1);
	return `recurring:${safeTrim(rule.frequency)}:${interval}:${weekdays}:${positions}`;
}

function buildRideSignature(activity, recurrenceRule) {
	const title = normalizeImportedTitle(activity?.title).toLowerCase();
	const timezone = safeTrim(activity?.timezone || DEFAULT_TIMEZONE).toLowerCase();
	const location = normalizeLocationText(activity?.start_location_address).toLowerCase();
	const startsAt = safeTrim(activity?.starts_at);
	const endsAt = safeTrim(activity?.ends_at);
	const startTime = toTimeOfDayKey(startsAt);
	const endTime = toTimeOfDayKey(endsAt);
	const recurrence = recurrenceKey(recurrenceRule);
	if (!title || !timezone) return null;
	if (recurrence === 'single') {
		return [title, timezone, location, 'single', startsAt, endsAt].join('|');
	}
	return [title, timezone, location, recurrence, startTime, endTime].join('|');
}

function extractRecurrenceRule(row) {
	const value = row?.activity_recurrence_rules;
	if (!value) return null;
	if (Array.isArray(value)) return value[0] || null;
	return value;
}

function summarizeExistingRow(row) {
	return {
		activityId: row.id,
		slug: row.slug,
		title: row.title,
		sourceEventId: row.source_event_id ?? null
	};
}

async function findExistingByEquivalentSignature(supabase, mapped) {
	const targetSignature = buildRideSignature(mapped.activity, mapped.recurrenceRule);
	if (!targetSignature) return null;
	let query = supabase
		.from('activity_events')
		.select(
			'id,slug,title,source_event_id,timezone,starts_at,ends_at,start_location_address,activity_recurrence_rules!left(frequency,interval_count,by_weekdays,by_set_positions)'
		)
		.eq('activity_type', 'ride')
		.eq('title', mapped.activity.title)
		.eq('timezone', mapped.activity.timezone)
		.limit(50);
	if (mapped.activity.start_location_address) {
		query = query.eq('start_location_address', mapped.activity.start_location_address);
	}
	const { data, error } = await query;
	if (error) throw error;
	for (const row of data || []) {
		const existingSignature = buildRideSignature(
			{
				title: row.title,
				timezone: row.timezone,
				start_location_address: row.start_location_address,
				starts_at: row.starts_at,
				ends_at: row.ends_at
			},
			extractRecurrenceRule(row)
		);
		if (existingSignature === targetSignature) return summarizeExistingRow(row);
	}
	return null;
}

export function parseRideSeedJson(rawText) {
	const text = String(rawText ?? '').replace(/^\uFEFF/, '');
	try {
		const parsed = JSON.parse(text);
		if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.events)) {
			throw new Error('Expected a JSON object with an events array.');
		}
		return parsed;
	} catch (originalError) {
		const sanitizedText = sanitizeJsonText(text);
		if (sanitizedText === text) {
			throw originalError;
		}
		const parsed = JSON.parse(sanitizedText);
		if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.events)) {
			throw new Error('Expected a JSON object with an events array.');
		}
		return parsed;
	}
}

function sanitizeJsonText(rawText) {
	let output = '';
	let inString = false;
	let escaping = false;

	for (let index = 0; index < rawText.length; index += 1) {
		const char = rawText[index];
		const code = char.charCodeAt(0);

		if (!inString) {
			if (char === '"') inString = true;
			output += char;
			continue;
		}

		if (escaping) {
			output += char;
			escaping = false;
			continue;
		}

		if (char === '\\') {
			output += char;
			escaping = true;
			continue;
		}

		if (char === '"') {
			output += char;
			inString = false;
			continue;
		}

		if (code < 0x20) {
			if (char === '\n') {
				output += '\\n';
				continue;
			}
			if (char === '\r') {
				output += '\\r';
				continue;
			}
			if (char === '\t') {
				output += '\\t';
				continue;
			}
			output += `\\u${code.toString(16).padStart(4, '0')}`;
			continue;
		}

		output += char;
	}
	return output;
}

export async function importRideSeedData(
	supabase,
	source,
	{
		createdByUserId = DEFAULT_CREATED_BY_USER_ID,
		eventId = null,
		limit = null,
		publish = true,
		slugPrefix = '',
		dryRun = false,
		requireGeocoding = true,
		skipGeocoding = false,
		skipImageUpload = false
	} = {}
) {
	let events = Array.isArray(source.events) ? source.events : [];
	if (eventId) events = events.filter((event) => event.id === eventId);
	if (Number.isInteger(limit) && limit > 0) events = events.slice(0, limit);
	if (!events.length) throw new Error('No events matched the provided filters.');
	const mappedResults = await Promise.all(
		events.map(async (event) => ({
			event,
			mapped: await mapEvent(event, {
				slugPrefix,
				status: publish ? 'published' : 'draft',
				requireGeocoding,
				skipGeocoding
			})
		}))
	);
	const skippedGeocoding = mappedResults
		.filter((item) => item?.mapped?.skippedReason === 'geocode_failed')
		.map((item) => ({
			sourceEventId: item.mapped.sourceEventId,
			title: item.mapped.title
		}));
	const skippedInvalid = mappedResults
		.filter((item) => item?.mapped?.skippedReason === 'invalid_datetime')
		.map((item) => ({
			sourceEventId: item.mapped.sourceEventId,
			title: item.mapped.title,
			detail: item.mapped.detail
		}));
	const mapped = mappedResults.filter((item) => item.mapped && !item.mapped.skippedReason);
	if (!mapped.length) {
		return {
			inserted: [],
			skipped: events.length,
			skippedExisting: [],
			skippedGeocoding,
			skippedInvalid,
			skippedEquivalent: [],
			reason: 'No valid events remained after mapping.'
		};
	}
	if (dryRun) {
		return {
			mapped: mapped.map((item) => item.mapped),
			skipped: events.length - mapped.length,
			skippedGeocoding,
			skippedInvalid,
			skippedEquivalent: []
		};
	}
	const results = [];
	const skippedExisting = [];
	const skippedEquivalent = [];
	const sourceSignatureMap = new Map();
	const dbSignatureMap = new Map();
	for (const { event, mapped: record } of mapped) {
		const signature = buildRideSignature(record.activity, record.recurrenceRule);
		if (signature && sourceSignatureMap.has(signature)) {
			skippedEquivalent.push({
				sourceEventId: record.sourceEventId,
				title: record.activity.title,
				reason: 'duplicate_in_source_feed',
				matchedSourceEventId: sourceSignatureMap.get(signature)
			});
			continue;
		}
		if (signature) sourceSignatureMap.set(signature, record.sourceEventId);
		const existing = await findExistingBySourceEventId(supabase, record.sourceEventId);
		if (existing) {
			skippedExisting.push({
				sourceEventId: record.sourceEventId,
				activityId: existing.id,
				slug: existing.slug,
				title: existing.title
			});
			if (signature) dbSignatureMap.set(signature, summarizeExistingRow(existing));
			continue;
		}
		const equivalentExisting =
			(signature && dbSignatureMap.get(signature)) ||
			(await findExistingByEquivalentSignature(supabase, record));
		if (equivalentExisting) {
			skippedEquivalent.push({
				sourceEventId: record.sourceEventId,
				title: record.activity.title,
				reason: 'equivalent_ride_exists',
				...equivalentExisting
			});
			if (signature) dbSignatureMap.set(signature, equivalentExisting);
			continue;
		}
		record.ride.image_urls = skipImageUpload ? [] : await uploadEventImage(supabase, event);
		const inserted = await insertRide(supabase, record, createdByUserId);
		results.push({
			sourceEventId: record.sourceEventId,
			title: record.activity.title,
			activityId: inserted.activityId,
			slug: inserted.slug,
			imageCount: record.ride.image_urls.length,
			occurrenceCount: inserted.occurrenceCount
		});
		if (signature) {
			dbSignatureMap.set(signature, {
				sourceEventId: record.sourceEventId,
				title: record.activity.title,
				activityId: inserted.activityId,
				slug: inserted.slug
			});
		}
	}
	return {
		inserted: results,
		skipped: events.length - mapped.length,
		skippedExisting,
		skippedGeocoding,
		skippedInvalid,
		skippedEquivalent
	};
}
