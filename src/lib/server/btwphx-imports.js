import { DEFAULT_CREATED_BY_USER_ID, importRideSeedData } from './ride-imports.js';
import { fetchPublicHttp, readResponseBuffer } from './security.js';
import { inferGeocodeCountryCodeFromLocation } from './weeklyrides-imports.js';

const BTWPHX_PROJECT_ID = 'proj_W0ZyzxfO5LSngvzL903Xy';
const BTWPHX_USER_ID = 'user_nzH4OBAFtFGvSeB5rBCCW';
const BTWPHX_REFERRER = 'https://www.btwphx.com/';
const BTWPHX_ORIGIN =
	'https://www-btwphx-com.filesusr.com/html/016e89_91ab43d54ab2e399e745bd0b06c37753.html';
const BTWPHX_PLATFORM = 'web';
const BTWPHX_APP = 'calendar';
const BTWPHX_DATA_URL = `https://inffuse.eventscalendar.co/api/v0.1/projects/${BTWPHX_PROJECT_ID}/data/public/events?user=${BTWPHX_USER_ID}&app=${BTWPHX_APP}`;
const BTWPHX_LEGACY_DATA_URL = `https://inffuse.eventscalendar.co/js/v0.1/calendar/data?id=${BTWPHX_PROJECT_ID}&_referrer=${BTWPHX_REFERRER}&platform=${BTWPHX_PLATFORM}`;

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function hasCoordinates(row) {
	if (row?.start_latitude === null || row?.start_latitude === undefined) return false;
	if (row?.start_longitude === null || row?.start_longitude === undefined) return false;
	const latitude = Number(row?.start_latitude);
	const longitude = Number(row?.start_longitude);
	return (
		Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0)
	);
}

function hasImage(row) {
	const rideDetails = Array.isArray(row?.ride_details)
		? row.ride_details[0] || null
		: row?.ride_details || null;
	return Array.isArray(rideDetails?.image_urls) && rideDetails.image_urls.some(Boolean);
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
	const events = Array.isArray(payload?.value) ? payload.value : payload?.project?.data?.events;
	if (!Array.isArray(events)) {
		throw new Error('Invalid BTWPHX calendar response payload.');
	}

	const normalized = events.map(normalizeBtwPhxEvent).filter(Boolean);
	return {
		projectId: safeTrim(payload?.project?.id) || BTWPHX_PROJECT_ID,
		events: normalized
	};
}

function isLegacyDataUrl(dataUrl) {
	try {
		return new URL(dataUrl).pathname === '/js/v0.1/calendar/data';
	} catch {
		return false;
	}
}

async function fetchCalendarPayload(
	dataUrl,
	{ referrer, origin, projectId, platform, app },
	fetchHttp = fetchPublicHttp
) {
	const legacyRequest = isLegacyDataUrl(dataUrl);
	const request = {
		method: legacyRequest ? 'POST' : 'GET',
		headers: {
			accept: 'application/json, text/plain, */*',
			...(legacyRequest
				? {
						'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
						origin: 'https://www.btwphx.com'
					}
				: {}),
			referer: referrer
		}
	};
	if (legacyRequest) {
		request.body = new URLSearchParams({
			id: projectId,
			_referrer: referrer,
			platform,
			_origin: origin,
			app
		});
	}

	const response = await fetchHttp(dataUrl, request, {
		timeoutMs: 12_000,
		maxRedirects: 2,
		maxResponseBytes: 8 * 1024 * 1024,
		allowedHosts: ['inffuse.eventscalendar.co']
	});
	if (!response) throw new Error('BTWPHX calendar request was blocked or timed out.');
	if (!response.ok) {
		throw new Error(`BTWPHX calendar request failed: ${response.status} ${response.statusText}`);
	}
	const responseBuffer = await readResponseBuffer(response, 8 * 1024 * 1024);
	if (!responseBuffer) throw new Error('BTWPHX calendar response was too large.');
	return JSON.parse(responseBuffer.toString('utf8'));
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
			.select(
				'id,slug,title,source_event_id,start_latitude,start_longitude,ride_details(image_urls)'
			)
			.in('source_event_id', chunk);
		if (error) throw error;
		for (const row of data || []) {
			existingBySourceId.set(safeTrim(row.source_event_id), {
				sourceEventId: safeTrim(row.source_event_id),
				activityId: row.id,
				slug: row.slug,
				title: row.title,
				start_latitude: row.start_latitude,
				start_longitude: row.start_longitude,
				hasImage: hasImage(row)
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
		fetchHttp = fetchPublicHttp,
		createdByUserId = DEFAULT_CREATED_BY_USER_ID,
		publish = true,
		dryRun = false,
		onlyNew = true,
		slugPrefix = '',
		requireGeocoding = false,
		skipGeocoding = false,
		skipImageUpload = false,
		reconcileMissingImages = false,
		existingOnly = false,
		maintenance = null,
		limit = null
	} = {}
) {
	let requestedDataUrl = dataUrl;
	let payload;
	try {
		payload = await fetchCalendarPayload(
			dataUrl,
			{ referrer, origin, projectId, platform, app },
			fetchHttp
		);
	} catch (error) {
		if (dataUrl !== BTWPHX_DATA_URL) throw error;
		requestedDataUrl = BTWPHX_LEGACY_DATA_URL;
		payload = await fetchCalendarPayload(
			requestedDataUrl,
			{
				referrer,
				origin,
				projectId,
				platform,
				app
			},
			fetchHttp
		);
	}
	const parsedData = parseBtwPhxCalendarData(payload);

	if (!parsedData.events.length) {
		return {
			dataUrl: requestedDataUrl,
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
	if (maintenance === 'images' || maintenance === 'geocoding') {
		const existingBySourceId = await fetchExistingEventsBySourceId(
			supabase,
			parsedData.events.map((event) => event.id)
		);
		candidateEvents = parsedData.events.filter((event) => {
			const existing = existingBySourceId.get(event.id);
			if (!existing) return false;
			if (maintenance === 'images') return !existing.hasImage && Boolean(event.image?.url);
			return !hasCoordinates(existing);
		});
	} else if (onlyNew && !reconcileMissingImages) {
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
			dataUrl: requestedDataUrl,
			projectId: parsedData.projectId,
			feedEventCount: parsedData.events.length,
			candidateEventCount: 0,
			inserted: [],
			skipped: 0,
			skippedExisting: preSkippedExisting,
			skippedGeocoding: [],
			skippedInvalid: [],
			skippedEquivalent: [],
			reason:
				maintenance === 'images' || maintenance === 'geocoding'
					? `No BTWPHX ${maintenance} maintenance work is pending.`
					: 'No new BTWPHX events to import.',
			maintenance
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
			limit,
			requireGeocoding: maintenance === 'images' ? false : requireGeocoding,
			skipGeocoding: maintenance === 'images' ? true : effectiveSkipGeocoding,
			skipImageUpload:
				maintenance === 'images' ? false : maintenance === 'geocoding' || skipImageUpload,
			reconcileMissingImages: maintenance === 'images' ? true : reconcileMissingImages,
			existingOnly: maintenance ? true : existingOnly,
			updateExistingCoordinates: maintenance === 'geocoding'
		}
	);

	const existingFromImport = Array.isArray(importResult.skippedExisting)
		? importResult.skippedExisting
		: [];
	return {
		...importResult,
		dataUrl: requestedDataUrl,
		projectId: parsedData.projectId,
		feedEventCount: parsedData.events.length,
		candidateEventCount: candidateEvents.length,
		skippedExisting: [...preSkippedExisting, ...existingFromImport],
		maintenance
	};
}
