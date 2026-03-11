import { DEFAULT_CREATED_BY_USER_ID, importRideSeedData } from './ride-imports.js';

const WEEKLYRIDES_BASE_URL = 'https://www.weeklyrides.com';
const WEEKLYRIDES_FEED_URL =
	'https://www.weeklyrides.com/index.php/rides/rides-events-card-view?format=feed&type=rss';
const WEEKLYRIDES_TIMEZONE = 'America/New_York';
const DEFAULT_EVENT_DURATION_MINUTES = 120;

const MONTH_ABBREVIATION_TO_INDEX = new Map([
	['jan', 0],
	['feb', 1],
	['mar', 2],
	['apr', 3],
	['may', 4],
	['jun', 5],
	['jul', 6],
	['aug', 7],
	['sep', 8],
	['oct', 9],
	['nov', 10],
	['dec', 11]
]);

const CATEGORY_TO_BIKE_IDS = new Map([
	['road cycling', ['opt_llcwDhK4lCNn0XY1BX5YW']],
	['road', ['opt_llcwDhK4lCNn0XY1BX5YW']],
	['gravel/mtb', ['opt_gykJ9KX9fukVjmHVaXqXu', 'opt_fZSPlKBeWn5sPfeyp1scr']],
	['gravel', ['opt_gykJ9KX9fukVjmHVaXqXu']],
	['mtb', ['opt_fZSPlKBeWn5sPfeyp1scr']],
	['mountain', ['opt_fZSPlKBeWn5sPfeyp1scr']],
	['touring', ['opt_llcwDhK4lCNn0XY1BX5YW']],
	['events', ['opt_9QlEhHWlBP2oUsAr7EWC8']]
]);

const US_STATE_CODES = new Set([
	'AL',
	'AK',
	'AZ',
	'AR',
	'CA',
	'CO',
	'CT',
	'DE',
	'FL',
	'GA',
	'HI',
	'ID',
	'IL',
	'IN',
	'IA',
	'KS',
	'KY',
	'LA',
	'ME',
	'MD',
	'MA',
	'MI',
	'MN',
	'MS',
	'MO',
	'MT',
	'NE',
	'NV',
	'NH',
	'NJ',
	'NM',
	'NY',
	'NC',
	'ND',
	'OH',
	'OK',
	'OR',
	'PA',
	'RI',
	'SC',
	'SD',
	'TN',
	'TX',
	'UT',
	'VT',
	'VA',
	'WA',
	'WV',
	'WI',
	'WY',
	'DC'
]);

const LOCATION_COUNTRY_NAME_TO_CODE = new Map([
	['united states', 'us'],
	['usa', 'us'],
	['us', 'us'],
	['canada', 'ca'],
	['mexico', 'mx'],
	['spain', 'es'],
	['france', 'fr'],
	['portugal', 'pt'],
	['italy', 'it'],
	['germany', 'de'],
	['united kingdom', 'gb'],
	['uk', 'gb'],
	['ireland', 'ie'],
	['australia', 'au'],
	['new zealand', 'nz']
]);

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function compactWhitespace(value) {
	return safeTrim(value).replace(/\s+/g, ' ').trim();
}

function uniq(values) {
	return Array.from(new Set(values.filter((value) => value !== null && value !== undefined)));
}

function decodeHtmlEntities(value) {
	return String(value || '')
		.replace(/&#(\d+);/g, (_, codePoint) => {
			const parsed = Number.parseInt(codePoint, 10);
			return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : '';
		})
		.replace(/&#x([0-9a-f]+);/gi, (_, hexCodePoint) => {
			const parsed = Number.parseInt(hexCodePoint, 16);
			return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : '';
		})
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
	return decodeHtmlEntities(String(html || '').replace(/<[^>]*>/g, ' '));
}

function unwrapCdata(value) {
	const match = /^<!\[CDATA\[([\s\S]*)\]\]>$/i.exec(String(value || '').trim());
	return match ? match[1] : value;
}

function extractTagValue(xmlBlock, tagName) {
	const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
	const match = pattern.exec(xmlBlock);
	return match ? safeTrim(match[1]) : '';
}

function toAbsoluteUrl(url) {
	const raw = safeTrim(url);
	if (!raw) return '';
	try {
		if (/^https?:\/\//i.test(raw)) return new URL(raw).toString();
		if (raw.startsWith('//')) return new URL(`https:${raw}`).toString();
		return new URL(raw, WEEKLYRIDES_BASE_URL).toString();
	} catch {
		return '';
	}
}

function isWeeklyRidesUrl(url) {
	const absolute = toAbsoluteUrl(url);
	if (!absolute) return false;
	try {
		const parsed = new URL(absolute);
		return parsed.hostname.endsWith('weeklyrides.com');
	} catch {
		return false;
	}
}

function toDateOnlyInTimeZone(date, timeZone) {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	const parts = formatter.formatToParts(date);
	const map = {};
	for (const part of parts) {
		if (part.type === 'literal') continue;
		map[part.type] = part.value;
	}
	const year = Number(map.year);
	const month = Number(map.month);
	const day = Number(map.day);
	if (![year, month, day].every(Number.isFinite)) return '';
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getTimePartsInTimeZone(date, timeZone) {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	const parts = formatter.formatToParts(date);
	const map = {};
	for (const part of parts) {
		if (part.type === 'literal') continue;
		map[part.type] = part.value;
	}
	const hour = Number(map.hour);
	const minute = Number(map.minute);
	if (![hour, minute].every(Number.isFinite)) return { hour: 5, minute: 0 };
	return { hour: hour === 24 ? 0 : hour, minute };
}

function addMonths({ year, monthIndex }, monthDelta) {
	const monthCount = monthIndex + monthDelta;
	const nextYear = year + Math.floor(monthCount / 12);
	const nextMonthIndex = ((monthCount % 12) + 12) % 12;
	return { year: nextYear, monthIndex: nextMonthIndex };
}

function formatDateOnly(year, monthIndex, day) {
	const normalizedDay = Math.max(1, Math.min(31, day));
	return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(normalizedDay).padStart(2, '0')}`;
}

function parseDescriptionMetadata(descriptionHtml) {
	const html = String(descriptionHtml || '');
	const links = [];
	const linkPattern = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
	let linkMatch;
	while ((linkMatch = linkPattern.exec(html))) {
		const url = toAbsoluteUrl(decodeHtmlEntities(linkMatch[2]));
		if (!url) continue;
		const text = compactWhitespace(stripTags(linkMatch[3]));
		links.push({ url, text });
	}
	const uniqueLinks = [];
	const seenLinks = new Set();
	for (const link of links) {
		if (seenLinks.has(link.url)) continue;
		seenLinks.add(link.url);
		uniqueLinks.push(link);
	}

	const imageMatch = /<img\b[^>]*src=(["'])(.*?)\1[^>]*>/i.exec(html);
	const imageUrl = imageMatch ? toAbsoluteUrl(decodeHtmlEntities(imageMatch[2])) : '';

	const locationMatch = /<strong>\s*Location:\s*<\/strong>\s*([^<]+)/i.exec(html);
	const categoryMatch = /<strong>\s*Category:\s*<\/strong>\s*([^<]+)/i.exec(html);
	const dateBadgeMatch =
		/<strong[^>]*>\s*([A-Z]{3})\s*<\/strong>\s*<br\s*\/?>\s*<strong[^>]*>\s*([0-9]{1,2}(?:\s*-\s*[0-9]{1,2})?)\s*<\/strong>/i.exec(
			html
		);

	return {
		imageUrl,
		links: uniqueLinks,
		location: compactWhitespace(decodeHtmlEntities(locationMatch?.[1] || '')),
		category: compactWhitespace(decodeHtmlEntities(categoryMatch?.[1] || '')),
		dateBadgeMonthAbbrev: safeTrim(dateBadgeMatch?.[1]).toLowerCase(),
		dateBadgeDayText: safeTrim(dateBadgeMatch?.[2])
	};
}

function resolveStartEndDates({ publishedDate, monthAbbrev, dayText, timeZone }) {
	const fallbackDate = toDateOnlyInTimeZone(publishedDate, timeZone);
	if (!fallbackDate) return { startDate: '', endDate: '' };
	const fallbackMonthIndex = Number.parseInt(fallbackDate.slice(5, 7), 10) - 1;
	const fallbackYear = Number.parseInt(fallbackDate.slice(0, 4), 10);
	const fallbackDay = Number.parseInt(fallbackDate.slice(8, 10), 10);

	const parsedMonthIndex = MONTH_ABBREVIATION_TO_INDEX.get(safeTrim(monthAbbrev).toLowerCase());
	if (!Number.isInteger(parsedMonthIndex)) {
		return { startDate: fallbackDate, endDate: fallbackDate };
	}

	let startYear = fallbackYear;
	if (parsedMonthIndex === 11 && fallbackMonthIndex === 0) startYear -= 1;
	if (parsedMonthIndex === 0 && fallbackMonthIndex === 11) startYear += 1;

	const dayMatch = /^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/.exec(safeTrim(dayText));
	const startDay = dayMatch ? Number.parseInt(dayMatch[1], 10) : fallbackDay;
	const endDayRaw = dayMatch?.[2] ? Number.parseInt(dayMatch[2], 10) : startDay;

	let endYear = startYear;
	let endMonthIndex = parsedMonthIndex;
	let endDay = endDayRaw;
	if (endDay < startDay) {
		if (startDay >= 24) {
			const bumped = addMonths({ year: startYear, monthIndex: parsedMonthIndex }, 1);
			endYear = bumped.year;
			endMonthIndex = bumped.monthIndex;
		} else {
			endDay = startDay;
		}
	}

	return {
		startDate: formatDateOnly(startYear, parsedMonthIndex, startDay),
		endDate: formatDateOnly(endYear, endMonthIndex, endDay)
	};
}

function mapCategoryToBikeIds(categoryName) {
	const normalized = safeTrim(categoryName).toLowerCase();
	return CATEGORY_TO_BIKE_IDS.get(normalized) || ['opt_9QlEhHWlBP2oUsAr7EWC8'];
}

export function inferGeocodeCountryCodeFromLocation(location) {
	const normalized = compactWhitespace(location);
	if (!normalized) return '';

	const segments = normalized
		.split(',')
		.map((segment) => safeTrim(segment))
		.filter(Boolean);
	const tail = segments[segments.length - 1] || '';
	const tailUpper = tail.toUpperCase();
	const tailLower = tail.toLowerCase();

	if (US_STATE_CODES.has(tailUpper)) return 'us';
	if (LOCATION_COUNTRY_NAME_TO_CODE.has(tailLower)) {
		return LOCATION_COUNTRY_NAME_TO_CODE.get(tailLower) || '';
	}
	if (
		tailUpper.length === 2 &&
		['US', 'CA', 'MX', 'GB', 'ES', 'FR', 'PT', 'IT', 'DE'].includes(tailUpper)
	) {
		return tailLower;
	}
	if (/\b(united states|u\.s\.a\.?|usa)\b/i.test(normalized)) return 'us';
	return '';
}

function buildEventDescription({ location, category, itemUrl, externalUrl }) {
	return [
		location ? `Location: ${location}` : '',
		category ? `Category: ${category}` : '',
		externalUrl ? `Event link: ${externalUrl}` : '',
		itemUrl ? `WeeklyRides listing: ${itemUrl}` : ''
	]
		.filter(Boolean)
		.join('\n');
}

function buildSeedEventFromRssItem(itemXml) {
	const title = decodeHtmlEntities(unwrapCdata(extractTagValue(itemXml, 'title')));
	const itemLink = toAbsoluteUrl(decodeHtmlEntities(unwrapCdata(extractTagValue(itemXml, 'link'))));
	const itemGuid = toAbsoluteUrl(decodeHtmlEntities(unwrapCdata(extractTagValue(itemXml, 'guid'))));
	const pubDateRaw = decodeHtmlEntities(unwrapCdata(extractTagValue(itemXml, 'pubDate')));
	const descriptionHtmlRaw = decodeHtmlEntities(
		unwrapCdata(extractTagValue(itemXml, 'description'))
	);

	const sourceEventId = safeTrim(itemGuid || itemLink);
	const publishedDate = new Date(pubDateRaw);
	if (!sourceEventId || !title || Number.isNaN(publishedDate.getTime())) return null;

	const metadata = parseDescriptionMetadata(descriptionHtmlRaw);
	const externalLink =
		metadata.links.find((link) => !isWeeklyRidesUrl(link.url)) || metadata.links[0] || null;
	const detailsLinks = uniq([externalLink?.url || '', itemLink]).filter(Boolean);
	const { hour: startHour, minute: startMinutes } = getTimePartsInTimeZone(
		publishedDate,
		WEEKLYRIDES_TIMEZONE
	);
	const endTotalMinutes = Math.min(
		23 * 60 + 59,
		startHour * 60 + startMinutes + DEFAULT_EVENT_DURATION_MINUTES
	);
	const endHour = Math.floor(endTotalMinutes / 60);
	const endMinutes = endTotalMinutes % 60;

	const { startDate, endDate } = resolveStartEndDates({
		publishedDate,
		monthAbbrev: metadata.dateBadgeMonthAbbrev,
		dayText: metadata.dateBadgeDayText,
		timeZone: WEEKLYRIDES_TIMEZONE
	});
	if (!startDate) return null;

	return {
		id: sourceEventId,
		title: compactWhitespace(title),
		description: buildEventDescription({
			location: metadata.location,
			category: metadata.category,
			itemUrl: itemLink,
			externalUrl: externalLink?.url || ''
		}),
		location: metadata.location,
		geocodeCountryCodes: inferGeocodeCountryCodeFromLocation(metadata.location),
		timezone: WEEKLYRIDES_TIMEZONE,
		startDate,
		endDate: endDate || startDate,
		startHour,
		startMinutes,
		endHour,
		endMinutes,
		links: detailsLinks.map((url, index) => ({
			url,
			text:
				index === 0
					? externalLink?.text || ''
					: itemLink === url
						? 'WeeklyRides listing'
						: 'Reference link'
		})),
		image: metadata.imageUrl ? { url: metadata.imageUrl } : null,
		categories: {
			cat_L7VpwwziHgCs0DV1r7T6p: mapCategoryToBikeIds(metadata.category)
		}
	};
}

export function parseWeeklyRidesRssFeed(xmlText) {
	const xml = String(xmlText || '').trim();
	if (!xml.includes('<rss')) {
		throw new Error('Invalid WeeklyRides feed payload.');
	}
	const lastBuildDateRaw = decodeHtmlEntities(unwrapCdata(extractTagValue(xml, 'lastBuildDate')));
	const lastBuildDate = lastBuildDateRaw ? new Date(lastBuildDateRaw).toISOString() : null;
	const itemMatches = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi));
	const events = itemMatches
		.map((itemMatch) => buildSeedEventFromRssItem(itemMatch[1]))
		.filter((event) => event !== null);
	return {
		lastBuildDate,
		events
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

export async function importWeeklyRidesFeed(
	supabase,
	{
		feedUrl = WEEKLYRIDES_FEED_URL,
		createdByUserId = DEFAULT_CREATED_BY_USER_ID,
		publish = true,
		dryRun = false,
		onlyNew = true,
		slugPrefix = 'weeklyrides-',
		requireGeocoding = true,
		skipGeocoding = false,
		skipImageUpload = true
	} = {}
) {
	const effectiveSkipGeocoding = requireGeocoding ? false : skipGeocoding;
	const response = await fetch(feedUrl, {
		headers: {
			accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5'
		}
	});
	if (!response.ok) {
		throw new Error(`WeeklyRides feed request failed: ${response.status} ${response.statusText}`);
	}
	const xmlText = await response.text();
	const parsedFeed = parseWeeklyRidesRssFeed(xmlText);
	if (!parsedFeed.events.length) {
		return {
			feedUrl,
			feedLastBuildDate: parsedFeed.lastBuildDate,
			feedEventCount: 0,
			candidateEventCount: 0,
			inserted: [],
			skipped: 0,
			skippedExisting: [],
			skippedGeocoding: [],
			skippedInvalid: [],
			skippedEquivalent: [],
			reason: 'WeeklyRides feed returned zero events.'
		};
	}

	let candidateEvents = parsedFeed.events;
	let preSkippedExisting = [];
	if (onlyNew) {
		const existingBySourceId = await fetchExistingEventsBySourceId(
			supabase,
			parsedFeed.events.map((event) => event.id)
		);
		preSkippedExisting = parsedFeed.events
			.map((event) => existingBySourceId.get(event.id))
			.filter(Boolean);
		candidateEvents = parsedFeed.events.filter((event) => !existingBySourceId.has(event.id));
	}

	if (!candidateEvents.length) {
		return {
			feedUrl,
			feedLastBuildDate: parsedFeed.lastBuildDate,
			feedEventCount: parsedFeed.events.length,
			candidateEventCount: 0,
			inserted: [],
			skipped: 0,
			skippedExisting: preSkippedExisting,
			skippedGeocoding: [],
			skippedInvalid: [],
			skippedEquivalent: [],
			reason: 'No new WeeklyRides events to import.'
		};
	}

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
		feedUrl,
		feedLastBuildDate: parsedFeed.lastBuildDate,
		feedEventCount: parsedFeed.events.length,
		candidateEventCount: candidateEvents.length,
		skippedExisting: [...preSkippedExisting, ...existingFromImport]
	};
}
