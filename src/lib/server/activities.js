import { createRequestSupabaseClient, createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';
import { normalizeTimezone, resolveTimezoneFromCoordinates } from '$lib/server/timezones';

const MAX_OCCURRENCE_MONTHS = 18;
const ACTIVITY_SELECT = `
	id,
	activity_type,
	host_user_id,
	host_group_id,
	created_by_user_id,
	created_at,
	updated_at,
	published_at,
	title,
	slug,
	summary,
	description,
	timezone,
	starts_at,
	ends_at,
	next_occurrence_start,
	next_occurrence_end,
	status,
	start_location_name,
	start_location_address,
	start_latitude,
	start_longitude,
	contact_email,
	contact_phone
`;

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function slugify(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function asArray(value) {
	return Array.isArray(value) ? value : [];
}

function toIso(value) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeOccurrenceStartKey(value) {
	return toIso(value) || safeTrim(value);
}

function toNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function toInteger(value) {
	const parsed = toNumber(value);
	return parsed === null ? null : Math.round(parsed);
}

function coerceBoolean(value, fallback = false) {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
		if (['false', '0', 'no', 'off'].includes(normalized)) return false;
	}
	return fallback;
}

function uniq(values) {
	return Array.from(new Set(values.filter((value) => value !== null && value !== undefined)));
}

function toDateOnlyUtc(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
		date.getUTCDate()
	).padStart(2, '0')}`;
}

function parseDateOnly(value) {
	if (!value) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
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

function formatOccurrenceTitle(activity, occurrence) {
	return safeTrim(occurrence?.title_override) || safeTrim(activity?.title) || 'Ride';
}

export function getActivityClient(cookies) {
	const { accessToken, user } = resolveSession(cookies);
	return {
		user,
		supabase: createRequestSupabaseClient(accessToken)
	};
}

export function getActivityServiceClient() {
	return createServiceSupabaseClient();
}

export async function canManageActivity(supabase, activityEventId) {
	if (!activityEventId) return false;
	const { data, error } = await supabase.rpc('can_manage_activity', {
		target_activity_event_id: activityEventId
	});
	if (error) throw error;
	return Boolean(data);
}

export async function ensureUniqueActivitySlug(supabase, source, excludeId = null) {
	const base = slugify(source) || 'ride';
	let attempt = 0;
	let candidate = base;

	while (attempt < 50) {
		let query = supabase.from('activity_events').select('id', { count: 'exact', head: true }).eq('slug', candidate);
		if (excludeId) query = query.neq('id', excludeId);
		const { count, error } = await query;
		if (error) throw error;
		if (!count) return candidate;
		attempt += 1;
		candidate = `${base}-${attempt + 1}`;
	}

	return `${base}-${Date.now()}`;
}

export function normalizeEmailTemplate(template = {}, index = 0) {
	return {
		id: template.id ?? `template-${index + 1}`,
		name: safeTrim(template.name) || `Reminder ${index + 1}`,
		templateType: safeTrim(template.template_type ?? template.templateType) || 'reminder',
		sendOffsetMinutes: toInteger(
			template.send_offset_minutes ?? template.sendOffsetMinutes ?? template.offsetMinutes
		),
		subject: safeTrim(template.subject),
		body: safeTrim(template.body),
		isActive: coerceBoolean(template.is_active ?? template.isActive, true)
	};
}

export function normalizeRidePayload(payload = {}) {
	const submittedTimezone = safeTrim(payload.timezone);
	const canonicalTimezone =
		resolveTimezoneFromCoordinates(
			payload.startLatitude ?? payload.start_latitude,
			payload.startLongitude ?? payload.start_longitude
		) || normalizeTimezone(submittedTimezone);

	return {
		activity: {
			title: safeTrim(payload.title),
			slug: safeTrim(payload.slug),
			summary: safeTrim(payload.summary) || null,
			description: safeTrim(payload.description) || null,
			status: safeTrim(payload.status) || 'draft',
			timezone: canonicalTimezone,
			is_host: coerceBoolean(payload.isHost ?? payload.is_host, true),
			starts_at: toIso(payload.startsAt ?? payload.starts_at),
			ends_at: toIso(payload.endsAt ?? payload.ends_at),
			start_location_name: safeTrim(payload.startLocationName ?? payload.start_location_name),
			start_location_address:
				safeTrim(payload.startLocationAddress ?? payload.start_location_address) || null,
			start_latitude: toNumber(payload.startLatitude ?? payload.start_latitude),
			start_longitude: toNumber(payload.startLongitude ?? payload.start_longitude),
			contact_email: safeTrim(payload.contactEmail ?? payload.contact_email) || null,
			contact_phone: safeTrim(payload.contactPhone ?? payload.contact_phone) || null,
			host_group_id: safeTrim(payload.hostGroupId ?? payload.host_group_id) || null
		},
		ride: {
			participant_visibility:
				safeTrim(payload.participantVisibility ?? payload.participant_visibility) || 'public',
			end_location_name: safeTrim(payload.endLocationName ?? payload.end_location_name) || null,
			end_location_address:
				safeTrim(payload.endLocationAddress ?? payload.end_location_address) || null,
			end_latitude: toNumber(payload.endLatitude ?? payload.end_latitude),
			end_longitude: toNumber(payload.endLongitude ?? payload.end_longitude),
			estimated_distance_miles: toNumber(
				payload.estimatedDistanceMiles ?? payload.estimated_distance_miles
			),
			estimated_duration_minutes: toInteger(
				payload.estimatedDurationMinutes ?? payload.estimated_duration_minutes
			),
			elevation_gain_feet: toInteger(payload.elevationGainFeet ?? payload.elevation_gain_feet),
			pace_notes: safeTrim(payload.paceNotes ?? payload.pace_notes) || null,
			is_no_drop: coerceBoolean(payload.isNoDrop ?? payload.is_no_drop, true),
			surface_types: uniq(asArray(payload.surfaceTypes ?? payload.surface_types).map(safeTrim)).filter(
				Boolean
			),
			bike_suitability: uniq(
				asArray(payload.bikeSuitability ?? payload.bike_suitability).map(safeTrim)
			).filter(Boolean),
			accessibility_notes:
				safeTrim(payload.accessibilityNotes ?? payload.accessibility_notes) || null,
			waiver_required: coerceBoolean(payload.waiverRequired ?? payload.waiver_required, false)
		},
		recurrence: {
			enabled: coerceBoolean(payload.recurrenceEnabled ?? payload.recurrence_enabled, false),
			frequency: safeTrim(payload.recurrenceFrequency ?? payload.recurrence_frequency) || 'weekly',
			interval_count: Math.max(
				1,
				toInteger(payload.recurrenceInterval ?? payload.recurrence_interval) ?? 1
			),
			by_weekdays: uniq(
				asArray(payload.recurrenceWeekdays ?? payload.recurrence_weekdays)
					.map((value) => toInteger(value))
					.filter((value) => value >= 1 && value <= 7)
			),
			by_set_positions: uniq(
				asArray(payload.recurrenceMonthPositions ?? payload.recurrence_month_positions)
					.map((value) => toInteger(value))
					.filter((value) => [-1, 1, 2, 3, 4].includes(value))
			),
			until_on: safeTrim(payload.recurrenceUntilOn ?? payload.recurrence_until_on) || null
		},
		difficultyLevelIds: uniq(
			asArray(payload.difficultyLevelIds ?? payload.difficulty_level_ids)
				.map((value) => toInteger(value))
				.filter(Boolean)
		),
		ridingDisciplineIds: uniq(
			asArray(payload.ridingDisciplineIds ?? payload.riding_discipline_ids)
				.map((value) => toInteger(value))
				.filter(Boolean)
		),
		exclusions: asArray(payload.exclusions)
			.map((entry) => ({
				id: safeTrim(entry?.id) || null,
				starts_on: safeTrim(entry?.starts_on ?? entry?.startsOn),
				ends_on: safeTrim(entry?.ends_on ?? entry?.endsOn),
				note: safeTrim(entry?.note) || null
			}))
			.filter((entry) => entry.starts_on && entry.ends_on),
		emailTemplates: asArray(payload.emailTemplates ?? payload.email_templates)
			.map((template, index) => normalizeEmailTemplate(template, index))
			.filter((template) => template.subject && template.body)
	};
}

function generateWeeklyOccurrences({ templateStart, durationMs, rule, horizonEnd, exclusions }) {
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
			{
				year: day.getUTCFullYear(),
				month: day.getUTCMonth(),
				day: day.getUTCDate()
			},
			templateStart
		);
		if (startsAt < templateStart) continue;
		if (exclusions.has(toDateOnlyUtc(startsAt))) continue;
		results.push({ starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + durationMs).toISOString() });
	}
	return results;
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

function generateMonthlyOccurrences({ templateStart, durationMs, rule, horizonEnd, exclusions }) {
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
					{
						year: day.getUTCFullYear(),
						month: day.getUTCMonth(),
						day: day.getUTCDate()
					},
					templateStart
				);
				if (startsAt < templateStart) continue;
				if (startsAt > horizonEnd) continue;
				if (exclusions.has(toDateOnlyUtc(startsAt))) continue;
				results.push({
					starts_at: startsAt.toISOString(),
					ends_at: new Date(startsAt.getTime() + durationMs).toISOString()
				});
			}
		}
	}
	return results;
}

export function buildOccurrenceSchedule(activity, recurrenceRule, exclusions = []) {
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

	const rule = {
		frequency: safeTrim(recurrenceRule.frequency),
		interval_count: Math.max(1, toInteger(recurrenceRule.interval_count) ?? 1),
		by_weekdays: uniq(asArray(recurrenceRule.by_weekdays).map((value) => toInteger(value)).filter(Boolean)),
		by_set_positions: uniq(
			asArray(recurrenceRule.by_set_positions).map((value) => toInteger(value)).filter(Boolean)
		),
		starts_on: safeTrim(recurrenceRule.starts_on) || toDateOnlyUtc(templateStart),
		until_on: safeTrim(recurrenceRule.until_on) || null
	};

	const horizonEnd = rule.until_on
		? endOfUtcDay(new Date(`${rule.until_on}T00:00:00.000Z`))
		: endOfUtcDay(addUtcMonths(templateStart, MAX_OCCURRENCE_MONTHS));
	const exclusionDates = new Set();
	for (const exclusion of exclusions) {
		const start = parseDateOnly(exclusion.starts_on);
		const end = parseDateOnly(exclusion.ends_on);
		if (!start || !end) continue;
		for (
			let cursor = new Date(Date.UTC(start.year, start.month, start.day));
			cursor <= new Date(Date.UTC(end.year, end.month, end.day));
			cursor = addUtcDays(cursor, 1)
		) {
			exclusionDates.add(toDateOnlyUtc(cursor));
		}
	}

	const occurrences =
		rule.frequency === 'monthly'
			? generateMonthlyOccurrences({
					templateStart,
					durationMs,
					rule,
					horizonEnd,
					exclusions: exclusionDates
				})
			: generateWeeklyOccurrences({
					templateStart,
					durationMs,
					rule,
					horizonEnd,
					exclusions: exclusionDates
				});

	return occurrences.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

export async function syncActivityOccurrences(supabase, activityEventId, schedule, { cutoffStart = null } = {}) {
	const cutoffIso = cutoffStart ? toIso(cutoffStart) : null;
	let occurrenceQuery = supabase
		.from('activity_occurrences')
		.select('*')
		.eq('activity_event_id', activityEventId)
		.order('starts_at', { ascending: true });
	if (cutoffIso) occurrenceQuery = occurrenceQuery.gte('starts_at', cutoffIso);
	const { data: existingRows, error: existingError } = await occurrenceQuery;
	if (existingError) throw existingError;

	const existing = asArray(existingRows);
	const manualByStart = new Map(
		existing
			.filter((row) => row.status !== 'cancelled' && row.is_generated === false)
			.map((row) => [normalizeOccurrenceStartKey(row.starts_at), row])
	);
	const generatedByStart = new Map(
		existing
			.filter((row) => row.is_generated !== false)
			.map((row) => [normalizeOccurrenceStartKey(row.starts_at), row])
	);
	const wantedStarts = new Set(schedule.map((entry) => normalizeOccurrenceStartKey(entry.starts_at)));

	for (const entry of schedule) {
		const startKey = normalizeOccurrenceStartKey(entry.starts_at);
		if (!startKey) continue;
		if (manualByStart.has(startKey)) continue;
		const existingGenerated = generatedByStart.get(startKey);
		const payload = {
			activity_event_id: activityEventId,
			starts_at: entry.starts_at,
			ends_at: entry.ends_at,
			status: 'scheduled',
			is_generated: true,
			updated_at: new Date().toISOString()
		};
		if (existingGenerated) {
			const { error } = await supabase
				.from('activity_occurrences')
				.update(payload)
				.eq('id', existingGenerated.id);
			if (error) throw error;
			continue;
		}
		const { error } = await supabase.from('activity_occurrences').insert(payload);
		if (error) throw error;
	}

	for (const row of existing) {
		const startKey = normalizeOccurrenceStartKey(row.starts_at);
		if (!row.is_generated) continue;
		if (wantedStarts.has(startKey)) continue;
		const { error } = await supabase
			.from('activity_occurrences')
			.update({
				status: 'cancelled',
				updated_at: new Date().toISOString()
			})
			.eq('id', row.id);
		if (error) throw error;
	}

	return refreshActivityNextOccurrence(supabase, activityEventId);
}

export async function refreshActivityNextOccurrence(supabase, activityEventId) {
	const nowIso = new Date().toISOString();
	const { data: nextOccurrence, error: nextError } = await supabase
		.from('activity_occurrences')
		.select('starts_at, ends_at')
		.eq('activity_event_id', activityEventId)
		.eq('status', 'scheduled')
		.gte('starts_at', nowIso)
		.order('starts_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	if (nextError) throw nextError;

	const fallbackOccurrence =
		nextOccurrence ||
		(
			await supabase
				.from('activity_occurrences')
				.select('starts_at, ends_at')
				.eq('activity_event_id', activityEventId)
				.eq('status', 'scheduled')
				.order('starts_at', { ascending: true })
				.limit(1)
				.maybeSingle()
		).data ||
		null;

	const { error: updateError } = await supabase
		.from('activity_events')
		.update({
			next_occurrence_start: fallbackOccurrence?.starts_at ?? null,
			next_occurrence_end: fallbackOccurrence?.ends_at ?? null,
			updated_at: new Date().toISOString()
		})
		.eq('id', activityEventId);
	if (updateError) throw updateError;
}

export async function loadRideLookups(supabase) {
	const [{ data: difficultyLevels, error: difficultyError }, { data: disciplines, error: disciplinesError }] =
		await Promise.all([
			supabase.from('ride_difficulty_levels').select('*').order('sort_order', { ascending: true }),
			supabase.from('riding_disciplines').select('id,name,slug,description').order('name', {
				ascending: true
			})
		]);
	if (difficultyError) throw difficultyError;
	if (disciplinesError) throw disciplinesError;
	return {
		difficultyLevels: asArray(difficultyLevels),
		disciplines: asArray(disciplines)
	};
}

async function loadActivityHosts(supabase, activityEventId) {
	const { data, error } = await supabase
		.from('activity_hosts')
		.select('activity_event_id,user_id,created_at')
		.eq('activity_event_id', activityEventId)
		.order('created_at', { ascending: true });
	if (error) throw error;

	const rows = asArray(data);
	const userIds = uniq(rows.map((row) => row.user_id).filter(Boolean));
	if (!userIds.length) return rows.map((row) => ({ ...row, profile: null }));

	const { data: profiles, error: profileError } = await supabase
		.from('profiles')
		.select('user_id,full_name,email')
		.in('user_id', userIds);
	if (profileError) throw profileError;

	const profileMap = new Map(asArray(profiles).map((profile) => [profile.user_id, profile]));
	return rows.map((row) => ({
		...row,
		profile: profileMap.get(row.user_id) ?? null
	}));
}

async function loadGroupManagers(supabase, groupId) {
	if (!groupId) return [];
	const { data, error } = await supabase
		.from('group_members')
		.select('user_id,role,profile:profiles(user_id,full_name,email)')
		.eq('group_id', groupId)
		.in('role', ['owner', 'admin']);
	if (error) throw error;
	return asArray(data);
}

function mapProfileSummary(profile) {
	return {
		userId: profile?.user_id ?? null,
		fullName: safeTrim(profile?.full_name) || null,
		email: safeTrim(profile?.email) || null
	};
}

function buildRsvpSummary(rsvp) {
	return {
		id: rsvp.id,
		userId: rsvp.user_id,
		status: rsvp.status,
		participantName: rsvp.participant_name,
		participantEmail: rsvp.participant_email,
		participantPhone: rsvp.participant_phone,
		createdAt: rsvp.created_at,
		cancelledAt: rsvp.cancelled_at
	};
}

async function loadRideRecord(supabase, filters, { includeTemplates = false } = {}) {
	let query = supabase.from('activity_events').select(ACTIVITY_SELECT).eq('activity_type', 'ride');
	for (const [key, value] of Object.entries(filters)) {
		query = query.eq(key, value);
	}
	const { data: activity, error: activityError } = await query.maybeSingle();
	if (activityError) throw activityError;
	if (!activity) return null;

	const [
		{ data: rideDetails, error: rideDetailsError },
		{ data: occurrences, error: occurrencesError },
		{ data: recurrenceRule, error: recurrenceError },
		{ data: exclusions, error: exclusionsError },
		{ data: difficultyLinks, error: difficultyLinksError },
		{ data: disciplineLinks, error: disciplineLinksError },
		{ data: rsvps, error: rsvpsError },
		hosts,
		groupManagers,
		templatesResult
	] = await Promise.all([
		supabase.from('ride_details').select('*').eq('activity_event_id', activity.id).maybeSingle(),
		supabase
			.from('activity_occurrences')
			.select('*')
			.eq('activity_event_id', activity.id)
			.order('starts_at', { ascending: true }),
		supabase
			.from('activity_recurrence_rules')
			.select('*')
			.eq('activity_event_id', activity.id)
			.maybeSingle(),
		supabase
			.from('activity_recurrence_exclusions')
			.select('*')
			.eq('activity_event_id', activity.id)
			.order('starts_on', { ascending: true }),
		supabase
			.from('activity_x_ride_difficulty_levels')
			.select('difficulty_level_id,level:ride_difficulty_levels(*)')
			.eq('activity_event_id', activity.id),
		supabase
			.from('activity_x_riding_disciplines')
			.select('riding_discipline_id,discipline:riding_disciplines(*)')
			.eq('activity_event_id', activity.id),
		supabase
			.from('activity_rsvps')
			.select('*')
			.eq('activity_event_id', activity.id)
			.order('created_at', { ascending: true }),
		loadActivityHosts(supabase, activity.id),
		loadGroupManagers(supabase, activity.host_group_id),
		includeTemplates
			? supabase
					.from('activity_email_templates')
					.select('*')
					.eq('activity_event_id', activity.id)
					.order('created_at', { ascending: true })
			: Promise.resolve({ data: [], error: null })
	]);

	if (rideDetailsError) throw rideDetailsError;
	if (occurrencesError) throw occurrencesError;
	if (recurrenceError) throw recurrenceError;
	if (exclusionsError) throw exclusionsError;
	if (difficultyLinksError) throw difficultyLinksError;
	if (disciplineLinksError) throw disciplineLinksError;
	if (rsvpsError) throw rsvpsError;
	if (templatesResult?.error) throw templatesResult.error;

	const occurrenceRows = asArray(occurrences);
	const rsvpRows = asArray(rsvps);
	const rsvpsByOccurrenceId = new Map();
	for (const rsvp of rsvpRows) {
		const key = safeTrim(rsvp.activity_occurrence_id);
		if (!key) continue;
		if (!rsvpsByOccurrenceId.has(key)) rsvpsByOccurrenceId.set(key, []);
		rsvpsByOccurrenceId.get(key)?.push(buildRsvpSummary(rsvp));
	}

	return {
		activity,
		rideDetails: rideDetails ?? null,
		occurrences: occurrenceRows.map((occurrence) => ({
			...occurrence,
			title: formatOccurrenceTitle(activity, occurrence),
			rsvps: rsvpsByOccurrenceId.get(String(occurrence.id)) ?? []
		})),
		recurrenceRule: recurrenceRule ?? null,
		exclusions: asArray(exclusions),
		difficultyLevels: asArray(difficultyLinks)
			.map((entry) => entry.level)
			.filter(Boolean),
		ridingDisciplines: asArray(disciplineLinks)
			.map((entry) => entry.discipline)
			.filter(Boolean),
		hosts: asArray(hosts).map((host) => ({
			userId: host.user_id,
			profile: mapProfileSummary(host.profile)
		})),
		groupManagers: asArray(groupManagers).map((manager) => ({
			userId: manager.user_id,
			role: manager.role,
			profile: mapProfileSummary(manager.profile)
		})),
		emailTemplates: asArray(templatesResult?.data)
	};
}

export async function loadRideBySlug(supabase, slug, options = {}) {
	return loadRideRecord(supabase, { slug }, options);
}

export async function loadRideById(supabase, id, options = {}) {
	return loadRideRecord(supabase, { id }, options);
}

export async function upsertActivityRelations(
	supabase,
	activityEventId,
	{ difficultyLevelIds = [], ridingDisciplineIds = [], emailTemplates = [], hostIds = [] } = {}
) {
	await supabase
		.from('activity_x_ride_difficulty_levels')
		.delete()
		.eq('activity_event_id', activityEventId);
	if (difficultyLevelIds.length) {
		const { error } = await supabase.from('activity_x_ride_difficulty_levels').insert(
			difficultyLevelIds.map((difficultyLevelId) => ({
				activity_event_id: activityEventId,
				difficulty_level_id: difficultyLevelId
			}))
		);
		if (error) throw error;
	}

	await supabase
		.from('activity_x_riding_disciplines')
		.delete()
		.eq('activity_event_id', activityEventId);
	if (ridingDisciplineIds.length) {
		const { error } = await supabase.from('activity_x_riding_disciplines').insert(
			ridingDisciplineIds.map((ridingDisciplineId) => ({
				activity_event_id: activityEventId,
				riding_discipline_id: ridingDisciplineId
			}))
		);
		if (error) throw error;
	}

	const uniqueHostIds = uniq(hostIds.map((id) => safeTrim(id)).filter(Boolean));
	await supabase.from('activity_hosts').delete().eq('activity_event_id', activityEventId);
	if (uniqueHostIds.length) {
		const { error } = await supabase.from('activity_hosts').insert(
			uniqueHostIds.map((userId) => ({
				activity_event_id: activityEventId,
				user_id: userId
			}))
		);
		if (error) throw error;
	}

	await supabase
		.from('activity_email_templates')
		.delete()
		.eq('activity_event_id', activityEventId);
	if (emailTemplates.length) {
		const { error } = await supabase.from('activity_email_templates').insert(
			emailTemplates.map((template) => ({
				activity_event_id: activityEventId,
				template_type: template.templateType,
				name: template.name,
				send_offset_minutes: template.sendOffsetMinutes,
				subject: template.subject,
				body: template.body,
				is_active: template.isActive
			}))
		);
		if (error) throw error;
	}
}

export function buildOccurrenceView(activity, rideDetails, occurrence) {
	return {
		id: occurrence.id,
		title: formatOccurrenceTitle(activity, occurrence),
		startsAt: occurrence.starts_at,
		endsAt: occurrence.ends_at,
		status: occurrence.status,
		startLocationName: safeTrim(occurrence.start_location_name) || activity.start_location_name,
		startLocationAddress:
			safeTrim(occurrence.start_location_address) || activity.start_location_address || '',
		startLatitude:
			occurrence.start_latitude ?? activity.start_latitude ?? null,
		startLongitude:
			occurrence.start_longitude ?? activity.start_longitude ?? null,
		endLocationName: safeTrim(occurrence.end_location_name) || rideDetails?.end_location_name || '',
		endLocationAddress:
			safeTrim(occurrence.end_location_address) || rideDetails?.end_location_address || '',
		endLatitude: occurrence.end_latitude ?? rideDetails?.end_latitude ?? null,
		endLongitude: occurrence.end_longitude ?? rideDetails?.end_longitude ?? null
	};
}

function renderTemplateLine(value) {
	return safeTrim(value) ? `${value}` : '';
}

export function renderRideEmailTemplate(templateText, context) {
	const replacements = {
		'{{ride_title}}': context.rideTitle,
		'{{ride_date}}': context.rideDate,
		'{{ride_time}}': context.rideTime,
		'{{start_location}}': context.startLocation,
		'{{participant_name}}': context.participantName,
		'{{ride_url}}': context.rideUrl,
		'{{pace_line}}': renderTemplateLine(context.paceLine),
		'{{distance_line}}': renderTemplateLine(context.distanceLine),
		'{{waiver_line}}': renderTemplateLine(context.waiverLine)
	};

	let output = safeTrim(templateText);
	for (const [token, replacement] of Object.entries(replacements)) {
		output = output.split(token).join(replacement ?? '');
	}
	return output.replace(/\n{3,}/g, '\n\n').trim();
}

export function formatRideDateTimeRange(startsAt, endsAt, timezone = 'UTC') {
	const start = new Date(startsAt);
	const end = new Date(endsAt);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return { rideDate: '', rideTime: '' };
	}
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
	const timeFormatter = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hour: 'numeric',
		minute: '2-digit'
	});
	return {
		rideDate: dateFormatter.format(start),
		rideTime: `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`
	};
}

export function buildRideReminderContext({ activity, rideDetails, occurrence, rsvp, rideUrl }) {
	const { rideDate, rideTime } = formatRideDateTimeRange(
		occurrence.starts_at,
		occurrence.ends_at,
		activity.timezone
	);
	return {
		rideTitle: activity.title,
		rideDate,
		rideTime,
		startLocation: safeTrim(occurrence.start_location_name) || activity.start_location_name,
		participantName: rsvp.participant_name,
		rideUrl,
		paceLine: rideDetails?.pace_notes ? `Pace: ${rideDetails.pace_notes}` : '',
		distanceLine: rideDetails?.estimated_distance_miles
			? `Distance: ${rideDetails.estimated_distance_miles} miles`
			: '',
		waiverLine: rideDetails?.waiver_required ? 'A waiver is required before the ride.' : ''
	};
}

export async function getCronSecretVerifier(secretName, providedSecret) {
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase || !providedSecret) return false;
	const { data, error } = await serviceSupabase.rpc('verify_internal_cron_secret', {
		secret_name: secretName,
		provided_secret: providedSecret
	});
	if (error) {
		console.error('Unable to verify internal cron secret', error);
		return false;
	}
	return Boolean(data);
}
