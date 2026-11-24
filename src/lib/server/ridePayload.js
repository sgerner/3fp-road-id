import { normalizeTimezone, resolveTimezoneFromCoordinates } from './timezones.js';

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function asArray(value) {
	return Array.isArray(value) ? value : [];
}

function uniq(values) {
	return Array.from(new Set(values.filter((value) => value !== null && value !== undefined)));
}

function normalizeUrlList(value) {
	return uniq(
		asArray(value)
			.map((entry) => safeTrim(entry))
			.filter((entry) => /^https?:\/\//i.test(entry))
	);
}

export function normalizeExternalEventUrl(value) {
	const raw = safeTrim(value);
	if (!raw || /\s/.test(raw)) return null;
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
		if (!parsed.hostname) return null;
		return raw;
	} catch {
		return null;
	}
}

export function isValidExternalEventUrlInput(value) {
	const raw = safeTrim(value);
	if (!raw) return true;
	return normalizeExternalEventUrl(raw) !== null;
}

function toIso(value) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

/**
 * @param {Record<string, any>} [template]
 * @param {number} [index]
 */
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

/**
 * @param {Record<string, any>} [payload]
 */
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
			image_urls: normalizeUrlList(payload.imageUrls ?? payload.image_urls),
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
			surface_types: uniq(
				asArray(payload.surfaceTypes ?? payload.surface_types).map(safeTrim)
			).filter(Boolean),
			bike_suitability: uniq(
				asArray(payload.bikeSuitability ?? payload.bike_suitability).map(safeTrim)
			).filter(Boolean),
			accessibility_notes:
				safeTrim(payload.accessibilityNotes ?? payload.accessibility_notes) || null,
			waiver_required: coerceBoolean(payload.waiverRequired ?? payload.waiver_required, false),
			external_event_url: normalizeExternalEventUrl(
				payload.externalEventUrl ?? payload.external_event_url
			),
			external_organizer_name:
				safeTrim(payload.externalOrganizerName ?? payload.external_organizer_name) || null
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
					.filter((value) => value !== null && value >= 1 && value <= 7)
			),
			by_set_positions: uniq(
				asArray(payload.recurrenceMonthPositions ?? payload.recurrence_month_positions)
					.map((value) => toInteger(value))
					.filter((value) => value !== null && [-1, 1, 2, 3, 4].includes(value))
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
