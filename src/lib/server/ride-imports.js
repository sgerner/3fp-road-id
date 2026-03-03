import path from 'node:path';
import { searchGeocode } from '$lib/server/geocoding';

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
const TITLE_FORMATTING_PREFIX_RE =
	/^(?:[A-Z]{2,6}\s*:\s*\((?:[^)]*)\)\s*|[A-Z]{2,6}\s*-\s*)/i;

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function uniq(values) {
	return Array.from(new Set(values.filter((value) => value !== null && value !== undefined)));
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
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
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
	for (let cursor = new Date(first); cursor.getUTCMonth() === month; cursor = addUtcDays(cursor, 1)) {
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
	for (let monthCursor = new Date(origin); monthCursor <= horizonEnd; monthCursor = addUtcMonths(monthCursor, 1)) {
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
	return occurrences.sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());
}

function pickPrimaryLink(event) {
	return Array.isArray(event.links) && event.links.length ? event.links[0] : null;
}

function buildSummary(description) {
	const firstParagraph = safeTrim(String(description || '').split(/\n\s*\n/)[0]);
	if (!firstParagraph) return null;
	return firstParagraph.length > 180 ? `${firstParagraph.slice(0, 177).trim()}...` : firstParagraph;
}

function hasLegacyTitlePrefix(title) {
	return LEGACY_TITLE_PREFIX_RE.test(safeTrim(title));
}

function normalizeImportedTitle(title) {
	return safeTrim(title).replace(TITLE_FORMATTING_PREFIX_RE, '').trim();
}

function extractLocationName(event) {
	const primaryLink = pickPrimaryLink(event);
	if (primaryLink?.text) return safeTrim(primaryLink.text);
	const cleanedTitle = normalizeImportedTitle(safeTrim(event.title).replace(LEGACY_TITLE_PREFIX_RE, ''));
	return cleanedTitle || safeTrim(event.location) || 'Ride start';
}

function buildDescription(event) {
	const base = safeTrim(event.description);
	const linkLines = (event.links || [])
		.map((link) => {
			const text = safeTrim(link?.text);
			const url = safeTrim(link?.url);
			if (!url) return null;
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

function buildGeocodeQueries(event) {
	const location = safeTrim(event.location);
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
	for (const query of buildGeocodeQueries(event)) {
		const match = (await searchGeocode(query, { limit: 1 }))[0] ?? null;
		if (match) return match;
	}
	return null;
}

function toUtcIso(dateOnly, hour, minute, timezone) {
	if (!safeTrim(dateOnly)) {
		throw new Error('Missing date');
	}
	const hh = String(Number(hour) || 0).padStart(2, '0');
	const mm = String(Number(minute) || 0).padStart(2, '0');
	if (safeTrim(timezone || DEFAULT_TIMEZONE) === DEFAULT_TIMEZONE) {
		const iso = new Date(`${dateOnly}T${hh}:${mm}:00${DEFAULT_UTC_OFFSET}`);
		if (Number.isNaN(iso.getTime())) {
			throw new Error('Invalid date/time');
		}
		return iso.toISOString();
	}
	throw new Error(`Unsupported timezone in seed file: ${timezone}`);
}

function inferMonthlySetPosition(dateOnly) {
	const parts = parseDateOnly(dateOnly);
	if (!parts) return [1];
	const current = new Date(Date.UTC(parts.year, parts.month, parts.day));
	const weekday = isoWeekday(current);
	const dates = [];
	for (let cursor = new Date(Date.UTC(parts.year, parts.month, 1)); cursor.getUTCMonth() === parts.month; cursor = addUtcDays(cursor, 1)) {
		if (isoWeekday(cursor) === weekday) dates.push(toDateOnlyUtc(cursor));
	}
	const currentDateOnly = toDateOnlyUtc(current);
	const index = dates.indexOf(currentDateOnly);
	if (index === -1) return [1];
	if (index === dates.length - 1) return [-1];
	return [index + 1];
}

function mapRecurrence(event, startsAt) {
	const repeat = event.repeat || null;
	if (!repeat || !Object.keys(repeat).length) return null;
	const repeatPeriod = safeTrim(repeat.period) || (repeat.month ? 'month' : 'week');
	const intervalCount = Math.max(1, Number.parseInt(repeat.value ?? 1, 10) || 1);
	const repeatEnd = repeat.end ? toDateOnlyUtc(new Date(repeat.end)) : null;
	const weekDays = uniq((repeat.week?.days || []).map(toIsoWeekday).filter(Boolean));
	if (repeatPeriod === 'month') {
		const positionType = repeat.month?.type;
		const positions =
			positionType === 'lastWeek' ? [-1] : inferMonthlySetPosition(event.startDate);
		return {
			frequency: 'monthly',
			interval_count: intervalCount,
			by_weekdays: weekDays.length ? weekDays : [isoWeekday(new Date(startsAt))],
			by_set_positions: positions,
			starts_on: event.startDate,
			until_on: repeatEnd
		};
	}
	return {
		frequency: 'weekly',
		interval_count: intervalCount,
		by_weekdays: weekDays,
		by_set_positions: [],
		starts_on: event.startDate,
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
		throw new Error(`Unable to download source image for ${event.id}: ${response.status} ${response.statusText}`);
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

async function mapEvent(event, { slugPrefix, status, requireGeocoding }) {
	const timezone = safeTrim(event.timezone) || DEFAULT_TIMEZONE;
	const traits = deriveRideTraits(event);
	const rawTitle = safeTrim(event.title);
	if (hasLegacyTitlePrefix(rawTitle)) return null;
	const title = normalizeImportedTitle(rawTitle);
	let startsAt;
	let endsAt;
	try {
		startsAt = toUtcIso(event.startDate, event.startHour, event.startMinutes, timezone);
		endsAt = toUtcIso(event.endDate || event.startDate, event.endHour, event.endMinutes, timezone);
	} catch (error) {
		return {
			skippedReason: 'invalid_datetime',
			sourceEventId: event.id,
			title,
			detail: error.message
		};
	}
	const geocoded = await geocodeEvent(event);
	if (requireGeocoding && !geocoded) {
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
			start_location_address: safeTrim(event.location) || null,
			start_latitude: geocoded?.latitude ?? null,
			start_longitude: geocoded?.longitude ?? null,
			host_group_id: null,
			host_user_id: null,
			contact_email: null,
			contact_phone: null
		},
		recurrenceRule: mapRecurrence(event, startsAt),
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
		const nextOccurrence = occurrences.find((occurrence) => occurrence.starts_at >= nowIso) || occurrences[0];
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
		requireGeocoding = true
	} = {}
) {
	let events = Array.isArray(source.events) ? source.events : [];
	if (eventId) events = events.filter((event) => event.id === eventId);
	if (Number.isInteger(limit) && limit > 0) events = events.slice(0, limit);
	if (!events.length) throw new Error('No events matched the provided filters.');
	const filteredEvents = events.filter((event) => !hasLegacyTitlePrefix(event.title));
	const mappedResults = await Promise.all(
		filteredEvents.map((event) =>
			mapEvent(event, {
				slugPrefix,
				status: publish ? 'published' : 'draft',
				requireGeocoding
			})
		)
	);
	const skippedGeocoding = mappedResults
		.filter((item) => item?.skippedReason === 'geocode_failed')
		.map((item) => ({
			sourceEventId: item.sourceEventId,
			title: item.title
		}));
	const skippedInvalid = mappedResults
		.filter((item) => item?.skippedReason === 'invalid_datetime')
		.map((item) => ({
			sourceEventId: item.sourceEventId,
			title: item.title,
			detail: item.detail
		}));
	const mapped = mappedResults.filter((item) => item && !item.skippedReason);
	if (!mapped.length) {
		return {
			inserted: [],
			skipped: events.length,
			skippedExisting: [],
			skippedGeocoding,
			skippedInvalid,
			reason: 'All matching events were excluded by legacy title-prefix rules.'
		};
	}
	if (dryRun) {
		return {
			mapped,
			skipped: events.length - filteredEvents.length,
			skippedGeocoding,
			skippedInvalid
		};
	}
	const results = [];
	const skippedExisting = [];
	for (const [index, record] of mapped.entries()) {
		const existing = await findExistingBySourceEventId(supabase, record.sourceEventId);
		if (existing) {
			skippedExisting.push({
				sourceEventId: record.sourceEventId,
				activityId: existing.id,
				slug: existing.slug,
				title: existing.title
			});
			continue;
		}
		record.ride.image_urls = await uploadEventImage(supabase, filteredEvents[index]);
		const inserted = await insertRide(supabase, record, createdByUserId);
		results.push({
			sourceEventId: record.sourceEventId,
			title: record.activity.title,
			activityId: inserted.activityId,
			slug: inserted.slug,
			imageCount: record.ride.image_urls.length,
			occurrenceCount: inserted.occurrenceCount
		});
	}
	return {
		inserted: results,
		skipped: events.length - filteredEvents.length,
		skippedExisting,
		skippedGeocoding,
		skippedInvalid
	};
}
