import { DEFAULT_CREATED_BY_USER_ID, importRideSeedData } from './ride-imports.js';
import { inferGeocodeCountryCodeFromLocation } from './weeklyrides-imports.js';

const BTWPHX_PROJECT_ID = 'proj_W0ZyzxfO5LSngvzL903Xy';
const BTWPHX_REFERRER = 'https://www.btwphx.com/';
const BTWPHX_ORIGIN =
	'https://www-btwphx-com.filesusr.com/html/016e89_91ab43d54ab2e399e745bd0b06c37753.html';
const BTWPHX_PLATFORM = 'web';
const BTWPHX_APP = 'calendar';
const BTWPHX_DATA_URL =
	'https://inffuse.eventscalendar.co/js/v0.1/calendar/data?id=proj_W0ZyzxfO5LSngvzL903Xy&_referrer=https://www.btwphx.com/&platform=web';

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function uniq(values) {
	return Array.from(new Set(values.filter((value) => value !== null && value !== undefined)));
}

function normalizeLinkUrl(url) {
	const raw = safeTrim(url);
	if (!raw) return '';
	if (/^https?:\/\//i.test(raw)) return raw;
	if (raw.startsWith('//')) return `https:${raw}`;
	if (/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) return `https://${raw}`;
	return raw;
}

function toArray(value) {
	return Array.isArray(value) ? value : [];
}

function normalizeBtwPhxEvent(rawEvent) {
	const sourceEventId = safeTrim(rawEvent?.id);
	const title = safeTrim(rawEvent?.title);
	if (!sourceEventId || !title) return null;

	const location = safeTrim(rawEvent?.location);
	const linkItems = uniq(
		toArray(rawEvent?.links)
			.map((link) => {
				const url = normalizeLinkUrl(link?.url);
				if (!url) return null;
				return {
					url,
					text: safeTrim(link?.text)
				};
			})
			.filter(Boolean)
			.map((link) => JSON.stringify(link))
	).map((value) => JSON.parse(value));

	const imageUrl =
		safeTrim(rawEvent?.image?.url) ||
		safeTrim(rawEvent?.image?.sizes?.['800']) ||
		safeTrim(rawEvent?.image?.source);

	const timezone = safeTrim(rawEvent?.timezone) || 'America/Phoenix';
	const geocodeCountryCodes = inferGeocodeCountryCodeFromLocation(location) || 'us';

	return {
		id: sourceEventId,
		title,
		description: safeTrim(rawEvent?.description),
		location,
		timezone,
		start: rawEvent?.start,
		end: rawEvent?.end,
		startDate: safeTrim(rawEvent?.startDate),
		endDate: safeTrim(rawEvent?.endDate),
		startHour: rawEvent?.startHour,
		startMinutes: rawEvent?.startMinutes,
		endHour: rawEvent?.endHour,
		endMinutes: rawEvent?.endMinutes,
		repeat: rawEvent?.repeat && typeof rawEvent.repeat === 'object' ? rawEvent.repeat : null,
		categories:
			rawEvent?.categories && typeof rawEvent.categories === 'object' ? rawEvent.categories : {},
		links: linkItems,
		image: imageUrl ? { url: imageUrl } : null,
		geocodeCountryCodes
	};
}

export function parseBtwPhxCalendarData(payload) {
	const events = payload?.project?.data?.events;
	if (!Array.isArray(events)) {
		throw new Error('Invalid BTWPHX calendar response payload.');
	}

	const normalized = events.map(normalizeBtwPhxEvent).filter(Boolean);
	return {
		projectId: safeTrim(payload?.project?.id) || BTWPHX_PROJECT_ID,
		events: normalized
	};
}

async function fetchExistingEventsBySourceId(supabase, sourceEventIds) {
	const sourceIds = uniq(sourceEventIds.map((id) => safeTrim(id)).filter(Boolean));
	if (!sourceIds.length) return new Map();
	const existingBySourceId = new Map();
	const chunkSize = 40;
	for (let index = 0; index < sourceIds.length; index += chunkSize) {
		const chunk = sourceIds.slice(index, index + chunkSize);
		const { data, error } = await supabase
			.from('activity_events')
			.select('id,slug,title,source_event_id')
			.in('source_event_id', chunk);
		if (error) throw error;
		for (const row of data || []) {
			existingBySourceId.set(safeTrim(row.source_event_id), {
				sourceEventId: safeTrim(row.source_event_id),
				activityId: row.id,
				slug: row.slug,
				title: row.title
			});
		}
	}
	return existingBySourceId;
}

export async function importBtwPhxCalendar(
	supabase,
	{
		dataUrl = BTWPHX_DATA_URL,
		projectId = BTWPHX_PROJECT_ID,
		referrer = BTWPHX_REFERRER,
		origin = BTWPHX_ORIGIN,
		platform = BTWPHX_PLATFORM,
		app = BTWPHX_APP,
		createdByUserId = DEFAULT_CREATED_BY_USER_ID,
		publish = true,
		dryRun = false,
		onlyNew = true,
		slugPrefix = '',
		requireGeocoding = false,
		skipGeocoding = false,
		skipImageUpload = true
	} = {}
) {
	const requestBody = new URLSearchParams({
		id: projectId,
		_referrer: referrer,
		platform,
		_origin: origin,
		app
	});

	const response = await fetch(dataUrl, {
		method: 'POST',
		headers: {
			accept: 'application/json, text/plain, */*',
			'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
			origin: 'https://www.btwphx.com',
			referer: referrer
		},
		body: requestBody
	});

	if (!response.ok) {
		throw new Error(`BTWPHX calendar request failed: ${response.status} ${response.statusText}`);
	}

	const payload = await response.json();
	const parsedData = parseBtwPhxCalendarData(payload);

	if (!parsedData.events.length) {
		return {
			dataUrl,
			projectId: parsedData.projectId,
			feedEventCount: 0,
			candidateEventCount: 0,
			inserted: [],
			skipped: 0,
			skippedExisting: [],
			skippedGeocoding: [],
			skippedInvalid: [],
			skippedEquivalent: [],
			reason: 'BTWPHX calendar returned zero events.'
		};
	}

	let candidateEvents = parsedData.events;
	let preSkippedExisting = [];
	if (onlyNew) {
		const existingBySourceId = await fetchExistingEventsBySourceId(
			supabase,
			parsedData.events.map((event) => event.id)
		);
		preSkippedExisting = parsedData.events
			.map((event) => existingBySourceId.get(event.id))
			.filter(Boolean);
		candidateEvents = parsedData.events.filter((event) => !existingBySourceId.has(event.id));
	}

	if (!candidateEvents.length) {
		return {
			dataUrl,
			projectId: parsedData.projectId,
			feedEventCount: parsedData.events.length,
			candidateEventCount: 0,
			inserted: [],
			skipped: 0,
			skippedExisting: preSkippedExisting,
			skippedGeocoding: [],
			skippedInvalid: [],
			skippedEquivalent: [],
			reason: 'No new BTWPHX events to import.'
		};
	}

	const effectiveSkipGeocoding = requireGeocoding ? false : skipGeocoding;
	const importResult = await importRideSeedData(
		supabase,
		{ events: candidateEvents },
		{
			createdByUserId,
			publish,
			dryRun,
			slugPrefix,
			requireGeocoding,
			skipGeocoding: effectiveSkipGeocoding,
			skipImageUpload
		}
	);

	const existingFromImport = Array.isArray(importResult.skippedExisting)
		? importResult.skippedExisting
		: [];
	return {
		...importResult,
		dataUrl,
		projectId: parsedData.projectId,
		feedEventCount: parsedData.events.length,
		candidateEventCount: candidateEvents.length,
		skippedExisting: [...preSkippedExisting, ...existingFromImport]
	};
}
