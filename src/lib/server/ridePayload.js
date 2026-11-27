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

const EXTERNAL_RIDE_DETAIL_COLUMNS = [
	'external_event_url',
	'external_group_url',
	'external_organizer_name'
];

/**
 * Detects PostgreSQL (42703) and PostgREST schema-cache (PGRST204) errors caused by
 * deploying runtime code before `external_event_url` / `external_group_url` / `external_organizer_name` exist.
 *
 * @param {any} error
 * @returns {boolean}
 */
export function isMissingExternalRideColumnsError(error) {
	if (!error || typeof error !== 'object') return false;
	const code = safeTrim(error.code).toUpperCase();
	const combined = [error.message, error.details, error.hint]
		.map((part) => safeTrim(part))
		.filter(Boolean)
		.join(' ');
	const mentionsExternalColumn =
		/\b(external_event_url|external_group_url|external_organizer_name)\b/i.test(combined);
	if (!mentionsExternalColumn) return false;
	if (code === 'PGRST204' || code === '42703') return true;
	return /(does not exist|schema cache|could not find|unknown column)/i.test(combined);
}

/**
 * Returns a shallow copy of a `ride_details` write payload without structured external columns.
 *
 * @param {Record<string, any> | null | undefined} rideRecord
 * @returns {Record<string, any>}
 */
export function omitExternalRideDetailColumns(rideRecord) {
	const clone = { ...(rideRecord ?? {}) };
	for (const column of EXTERNAL_RIDE_DETAIL_COLUMNS) {
		delete clone[column];
	}
	return clone;
}

/**
 * Inserts a `ride_details` row, retrying without structured external columns when the
 * database migration has not yet been applied.
 *
 * @param {any} supabase
 * @param {Record<string, any>} rideInsert
 * @returns {Promise<{ data: any; error: any; fellBackWithoutExternalColumns: boolean }>}
 */
export async function insertRideDetailsCompat(supabase, rideInsert) {
	const primary = await supabase.from('ride_details').insert(rideInsert);
	if (!primary?.error || !isMissingExternalRideColumnsError(primary.error)) {
		return {
			data: primary?.data ?? null,
			error: primary?.error ?? null,
			fellBackWithoutExternalColumns: false
		};
	}
	const fallback = await supabase
		.from('ride_details')
		.insert(omitExternalRideDetailColumns(rideInsert));
	return {
		data: fallback?.data ?? null,
		error: fallback?.error ?? null,
		fellBackWithoutExternalColumns: !fallback?.error
	};
}

/**
 * Updates a `ride_details` row by `activity_event_id`, retrying without structured external
 * columns when the database migration has not yet been applied.
 *
 * @param {any} supabase
 * @param {string} activityEventId
 * @param {Record<string, any>} ridePatch
 * @returns {Promise<{ data: any; error: any; fellBackWithoutExternalColumns: boolean }>}
 */
export async function updateRideDetailsCompat(supabase, activityEventId, ridePatch) {
	const primary = await supabase
		.from('ride_details')
		.update(ridePatch)
		.eq('activity_event_id', activityEventId);
	if (!primary?.error || !isMissingExternalRideColumnsError(primary.error)) {
		return {
			data: primary?.data ?? null,
			error: primary?.error ?? null,
			fellBackWithoutExternalColumns: false
		};
	}
	const fallback = await supabase
		.from('ride_details')
		.update(omitExternalRideDetailColumns(ridePatch))
		.eq('activity_event_id', activityEventId);
	return {
		data: fallback?.data ?? null,
		error: fallback?.error ?? null,
		fellBackWithoutExternalColumns: !fallback?.error
	};
}

function sanitizeExtractedUrl(rawUrl) {
	return normalizeExternalEventUrl(safeTrim(rawUrl).replace(/[.,;:]+$/, ''));
}

function humanizeMeetupSlug(slug) {
	return safeTrim(slug)
		.split('-')
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}

/**
 * Extracts fallback `external_event_url` and `external_organizer_name` from legacy imported
 * `activity_events` rows when `ride_details` has not yet been migrated.
 *
 * @param {Record<string, any> | null | undefined} activity
 * @returns {{ external_event_url: string | null; external_organizer_name: string | null }}
 */
export function extractLegacyExternalRideMetadata(activity) {
	if (!activity || typeof activity !== 'object') {
		return { external_event_url: null, external_organizer_name: null };
	}

	const sourceEventId = safeTrim(activity.source_event_id ?? activity.sourceEventId);
	if (!sourceEventId) {
		return { external_event_url: null, external_organizer_name: null };
	}

	const slug = safeTrim(activity.slug);
	const description = String(activity.description ?? '');
	const isUnclaimed =
		!(activity.host_user_id ?? activity.hostUserId) &&
		!(activity.host_group_id ?? activity.hostGroupId);

	let rawUrl = null;
	let organizerName = null;

	const isMeetup =
		/(^meetup:|meetup\.com\/)/i.test(sourceEventId) ||
		slug.startsWith('meetup-') ||
		/(?:^|\n)\s*Meetup (?:event|group):/i.test(description);
	const isWeeklyRides =
		/weeklyrides\.com/i.test(sourceEventId) ||
		slug.startsWith('weeklyrides-') ||
		/(?:^|\n)\s*WeeklyRides listing:\s*https?:\/\//i.test(description);

	if (isMeetup) {
		const eventMatch = /(?:^|\n)\s*Meetup event:\s*(https?:\/\/\S+)/i.exec(description);
		rawUrl = eventMatch?.[1] || (/^https?:\/\/\S+$/i.test(sourceEventId) ? sourceEventId : null);
		const groupMatch = /(?:^|\n)\s*Meetup group:\s*([^\r\n]+)/i.exec(description);
		organizerName = safeTrim(groupMatch?.[1]) || null;
	} else if (isWeeklyRides) {
		const eventLinkMatch = /(?:^|\n)\s*Event link:\s*(https?:\/\/\S+)/i.exec(description);
		const listingMatch = /(?:^|\n)\s*WeeklyRides listing:\s*(https?:\/\/\S+)/i.exec(description);
		const eventLinkUrl = sanitizeExtractedUrl(eventLinkMatch?.[1]);
		rawUrl =
			eventLinkUrl ||
			listingMatch?.[1] ||
			(/^https?:\/\/\S+$/i.test(sourceEventId) ? sourceEventId : null);
		if (eventLinkUrl) {
			const meetupGroupMatch = /^https?:\/\/(?:www\.)?meetup\.com\/([^/?#]+)/i.exec(eventLinkUrl);
			if (meetupGroupMatch?.[1]) {
				organizerName = humanizeMeetupSlug(meetupGroupMatch[1]) || 'WeeklyRides';
			} else {
				try {
					const host = new URL(eventLinkUrl).hostname.replace(/^www\./i, '').toLowerCase();
					const genericHosts = [
						'weeklyrides.com',
						'facebook.com',
						'fb.me',
						'instagram.com',
						'eventbrite.com'
					];
					organizerName = genericHosts.some(
						(domain) => host === domain || host.endsWith(`.${domain}`)
					)
						? 'WeeklyRides'
						: host;
				} catch {
					organizerName = 'WeeklyRides';
				}
			}
		} else {
			organizerName = 'WeeklyRides';
		}
	} else if (/(?:^|\n)\s*More information:\s*\r?\n/i.test(description)) {
		const labeledMatch =
			/(?:^|\n)\s*More information:\s*(?:\r?\n)+\s*([^:\r\n]+):\s*(https?:\/\/\S+)/i.exec(
				description
			);
		const unlabeledMatch = /(?:^|\n)\s*More information:\s*(?:\r?\n)+\s*(https?:\/\/\S+)/i.exec(
			description
		);
		rawUrl = labeledMatch?.[2] || unlabeledMatch?.[1] || null;
		const candidateLabel = safeTrim(labeledMatch?.[1]);
		const genericLabels = new Set([
			'meetup event',
			'meetup group',
			'meetup group page',
			'weeklyrides listing',
			'reference link',
			'event link',
			'more info',
			'more information',
			'website',
			'register',
			'click here'
		]);
		organizerName =
			candidateLabel && !genericLabels.has(candidateLabel.toLowerCase()) ? candidateLabel : null;
	} else {
		if (isUnclaimed) {
			const trailingUrlMatch = /(https?:\/\/\S+)\s*$/i.exec(description);
			if (trailingUrlMatch?.[1]) {
				rawUrl = trailingUrlMatch[1];
			}
		}
		if (!rawUrl && /^https?:\/\/\S+$/i.test(sourceEventId)) {
			rawUrl = sourceEventId;
		}
	}

	return {
		external_event_url: sanitizeExtractedUrl(rawUrl),
		external_organizer_name: safeTrim(organizerName) || null
	};
}

/**
 * Resolves `external_event_url` and `external_organizer_name` from `rideDetails` when those
 * columns exist on the schema, or falls back to legacy imported activity metadata pre-migration.
 *
 * @param {Record<string, any> | null | undefined} activity
 * @param {Record<string, any> | null | undefined} rideDetails
 * @returns {{ external_event_url: string | null; external_organizer_name: string | null }}
 */
export function resolveExternalRideMetadata(activity, rideDetails) {
	if (
		rideDetails &&
		typeof rideDetails === 'object' &&
		('external_event_url' in rideDetails || 'external_organizer_name' in rideDetails)
	) {
		return {
			external_event_url: normalizeExternalEventUrl(rideDetails.external_event_url),
			external_organizer_name: safeTrim(rideDetails.external_organizer_name) || null
		};
	}
	return extractLegacyExternalRideMetadata(activity);
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
			...('externalGroupUrl' in payload || 'external_group_url' in payload
				? {
						external_group_url: normalizeExternalEventUrl(
							payload.externalGroupUrl ?? payload.external_group_url
						)
					}
				: {}),
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
