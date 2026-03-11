import { DEFAULT_CREATED_BY_USER_ID, importRideSeedData } from './ride-imports.js';

const MEETUP_ORIGIN = 'https://www.meetup.com';
const MEETUP_GQL2_URL = `${MEETUP_ORIGIN}/gql2`;
const MEETUP_TOPIC_URLKEY = 'road-cycling';
const MEETUP_GROUPS_PAGE_SIZE = 50;
const ROAD_BIKE_CATEGORY_OPTION_ID = 'opt_llcwDhK4lCNn0XY1BX5YW';

const GET_TOPIC_GROUPS_QUERY = `
query getAllTopicGroupsByUrlkey($first: Int!, $urlkey: String!, $after: String) {
  topicByUrlkey(urlkey: $urlkey) {
    id
    name
    groups(first: $first, after: $after) {
      edges {
        node {
          id
          name
          city
          state
          country
          urlname
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
}`;

const GET_GROUP_ACTIVE_EVENTS_QUERY = `
query getGroupUpcomingEvents($urlname: String!, $first: Int!, $after: String) {
  groupByUrlname(urlname: $urlname) {
    id
    name
    urlname
    city
    state
    country
    timezone
    events(filter: { status: [ACTIVE] }, first: $first, after: $after, sort: ASC) {
      totalCount
      pageInfo {
        endCursor
        hasNextPage
      }
      edges {
        node {
          id
          title
          eventUrl
          description
          dateTime
          endTime
          status
          isOnline
          eventType
          venue {
            id
            name
            lat
            lon
            address
            city
            state
            country
          }
          displayPhoto {
            id
            highResUrl
            baseUrl
          }
          series {
            description
            weeklyRecurrence {
              weeklyDaysOfWeek
              weeklyInterval
            }
          }
        }
      }
    }
  }
}`;

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function uniq(values) {
	return Array.from(new Set(values.filter((value) => value !== null && value !== undefined)));
}

function toFiniteNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function clampPositiveInteger(value, fallback) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
}

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function normalizeMeetupUrl(url) {
	const raw = safeTrim(url);
	if (!raw) return '';
	try {
		if (/^https?:\/\//i.test(raw)) return new URL(raw).toString();
		if (raw.startsWith('/')) return new URL(raw, MEETUP_ORIGIN).toString();
		return new URL(`/${raw}`, MEETUP_ORIGIN).toString();
	} catch {
		return raw;
	}
}

function toMeetupGroupUrl(urlname) {
	const key = safeTrim(urlname).replace(/^\/+|\/+$/g, '');
	if (!key) return '';
	return `${MEETUP_ORIGIN}/${key}/`;
}

async function fetchMeetupGraphql({ operationName, query, variables, referer, attempts = 3 }) {
	let lastError = null;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const response = await fetch(MEETUP_GQL2_URL, {
				method: 'POST',
				headers: {
					accept: 'application/json, text/plain, */*',
					'content-type': 'application/json',
					origin: MEETUP_ORIGIN,
					referer: safeTrim(referer) || MEETUP_ORIGIN
				},
				body: JSON.stringify({ operationName, query, variables })
			});

			if (!response.ok) {
				throw new Error(
					`${operationName} request failed (${response.status} ${response.statusText})`
				);
			}

			const payload = await response.json();
			if (Array.isArray(payload?.errors) && payload.errors.length) {
				throw new Error(
					`${operationName} GraphQL error: ${safeTrim(payload.errors[0]?.message) || 'Unknown error'}`
				);
			}

			return payload?.data || null;
		} catch (error) {
			lastError = error;
			if (attempt < attempts) {
				await sleep(200 * attempt);
				continue;
			}
		}
	}
	throw lastError || new Error(`${operationName} request failed`);
}

function parseDateAndTime(isoString) {
	const raw = safeTrim(isoString);
	if (!raw) return null;
	const directMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(raw);
	if (directMatch) {
		return {
			dateOnly: directMatch[1],
			hour: Number.parseInt(directMatch[2], 10),
			minute: Number.parseInt(directMatch[3], 10)
		};
	}
	const fallbackDate = new Date(raw);
	if (Number.isNaN(fallbackDate.getTime())) return null;
	return {
		dateOnly: `${fallbackDate.getUTCFullYear()}-${String(fallbackDate.getUTCMonth() + 1).padStart(2, '0')}-${String(
			fallbackDate.getUTCDate()
		).padStart(2, '0')}`,
		hour: fallbackDate.getUTCHours(),
		minute: fallbackDate.getUTCMinutes()
	};
}

function pad2(value) {
	return String(Math.max(0, Number.parseInt(value, 10) || 0)).padStart(2, '0');
}

function fallbackEndDateTime(startIso, durationMinutes = 120) {
	const start = new Date(startIso);
	if (Number.isNaN(start.getTime())) return null;
	const end = new Date(start.getTime() + durationMinutes * 60_000);
	return end.toISOString();
}

function formatLocation(venue, group) {
	const name = safeTrim(venue?.name);
	const address = safeTrim(venue?.address);
	const city = safeTrim(venue?.city || group?.city);
	const state = safeTrim(venue?.state || group?.state);
	const country = safeTrim(venue?.country || group?.country).toUpperCase();
	const cityState = [city, state].filter(Boolean).join(', ');
	return [name, address, cityState, country].filter(Boolean).join(', ');
}

function buildDescription(event, group, eventUrl, groupUrl) {
	return [
		safeTrim(event?.description),
		group?.name ? `Meetup group: ${group.name}` : '',
		eventUrl ? `Meetup event: ${eventUrl}` : '',
		groupUrl ? `Meetup group page: ${groupUrl}` : ''
	]
		.filter(Boolean)
		.join('\n\n');
}

function mapGroupEventToSeedEvent(group, event) {
	const groupUrl = toMeetupGroupUrl(group?.urlname);
	const eventUrl = normalizeMeetupUrl(event?.eventUrl);
	const sourceEventId = safeTrim(
		eventUrl || `meetup:${safeTrim(group?.urlname)}:${safeTrim(event?.id)}`
	);
	const title = safeTrim(event?.title);
	if (!sourceEventId || !title) return null;

	const startParts = parseDateAndTime(event?.dateTime);
	if (!startParts) return null;
	const fallbackEndIso = fallbackEndDateTime(event?.dateTime);
	const endParts = parseDateAndTime(event?.endTime) || parseDateAndTime(fallbackEndIso);
	if (!endParts) return null;

	const isOnline =
		Boolean(event?.isOnline) || safeTrim(event?.eventType).toUpperCase() === 'ONLINE';
	const location = isOnline ? 'Online event' : formatLocation(event?.venue, group);
	const venueCountry = safeTrim(event?.venue?.country || group?.country).toLowerCase();
	const geocodeCountryCodes = /^[a-z]{2}$/i.test(venueCountry) ? venueCountry : '';
	const startLatitude = isOnline ? null : toFiniteNumber(event?.venue?.lat);
	const startLongitude = isOnline ? null : toFiniteNumber(event?.venue?.lon);

	return {
		id: sourceEventId,
		title,
		description: buildDescription(event, group, eventUrl, groupUrl),
		location,
		timezone: safeTrim(group?.timezone) || 'America/Phoenix',
		startDate: startParts.dateOnly,
		endDate: endParts.dateOnly,
		startHour: startParts.hour,
		startMinutes: startParts.minute,
		endHour: endParts.hour,
		endMinutes: endParts.minute,
		links: [
			eventUrl ? { url: eventUrl, text: 'Meetup event' } : null,
			groupUrl ? { url: groupUrl, text: safeTrim(group?.name) || 'Meetup group' } : null
		].filter(Boolean),
		categories: {
			cat_L7VpwwziHgCs0DV1r7T6p: [ROAD_BIKE_CATEGORY_OPTION_ID]
		},
		image:
			safeTrim(event?.displayPhoto?.highResUrl) || safeTrim(event?.displayPhoto?.baseUrl)
				? {
						url: safeTrim(event?.displayPhoto?.highResUrl) || safeTrim(event?.displayPhoto?.baseUrl)
					}
				: null,
		geocodeCountryCodes,
		startLatitude,
		startLongitude
	};
}

async function fetchTopicGroups(topicUrlkey) {
	let cursor = null;
	const groupsByUrlname = new Map();
	const topicPageUrl = `${MEETUP_ORIGIN}/topics/${topicUrlkey}/all/`;

	while (true) {
		const payload = await fetchMeetupGraphql({
			operationName: 'getAllTopicGroupsByUrlkey',
			query: GET_TOPIC_GROUPS_QUERY,
			variables: {
				first: MEETUP_GROUPS_PAGE_SIZE,
				urlkey: topicUrlkey,
				after: cursor
			},
			referer: topicPageUrl
		});

		const groupsConnection = payload?.topicByUrlkey?.groups;
		const edges = Array.isArray(groupsConnection?.edges) ? groupsConnection.edges : [];
		for (const edge of edges) {
			const node = edge?.node;
			const urlname = safeTrim(node?.urlname).toLowerCase();
			if (!urlname) continue;
			groupsByUrlname.set(urlname, {
				id: safeTrim(node?.id),
				name: safeTrim(node?.name),
				city: safeTrim(node?.city),
				state: safeTrim(node?.state),
				country: safeTrim(node?.country),
				urlname
			});
		}

		const pageInfo = groupsConnection?.pageInfo;
		if (!pageInfo?.hasNextPage || !safeTrim(pageInfo?.endCursor)) break;
		cursor = safeTrim(pageInfo.endCursor);
	}

	return Array.from(groupsByUrlname.values());
}

async function fetchGroupActiveEvents({ urlname, eventsPerGroup, maxPagesPerGroup, horizonDate }) {
	const normalizedUrlname = safeTrim(urlname).toLowerCase();
	if (!normalizedUrlname) return { group: null, events: [] };

	const referer = toMeetupGroupUrl(normalizedUrlname);
	let cursor = null;
	let page = 0;
	let group = null;
	const events = [];

	while (page < maxPagesPerGroup) {
		page += 1;
		const payload = await fetchMeetupGraphql({
			operationName: 'getGroupUpcomingEvents',
			query: GET_GROUP_ACTIVE_EVENTS_QUERY,
			variables: {
				urlname: normalizedUrlname,
				first: eventsPerGroup,
				after: cursor
			},
			referer
		});

		const groupNode = payload?.groupByUrlname;
		if (!groupNode) break;
		if (!group) {
			group = {
				id: safeTrim(groupNode?.id),
				name: safeTrim(groupNode?.name),
				urlname: safeTrim(groupNode?.urlname || normalizedUrlname),
				city: safeTrim(groupNode?.city),
				state: safeTrim(groupNode?.state),
				country: safeTrim(groupNode?.country),
				timezone: safeTrim(groupNode?.timezone)
			};
		}

		const eventsConnection = groupNode?.events;
		const edges = Array.isArray(eventsConnection?.edges) ? eventsConnection.edges : [];
		for (const edge of edges) {
			const event = edge?.node;
			if (!event) continue;
			if (horizonDate) {
				const startsAt = new Date(event?.dateTime);
				if (Number.isFinite(startsAt.getTime()) && startsAt > horizonDate) {
					return { group, events };
				}
			}
			events.push(event);
		}

		const pageInfo = eventsConnection?.pageInfo;
		if (!pageInfo?.hasNextPage || !safeTrim(pageInfo?.endCursor)) break;
		cursor = safeTrim(pageInfo.endCursor);
	}

	return { group, events };
}

async function mapWithConcurrency(items, concurrency, worker) {
	const cap = Math.max(1, Number.parseInt(concurrency, 10) || 1);
	const queue = [...items];
	const results = [];

	async function runWorker() {
		while (queue.length) {
			const item = queue.shift();
			if (item === undefined) return;
			results.push(await worker(item));
		}
	}

	await Promise.all(Array.from({ length: Math.min(cap, items.length || 1) }, () => runWorker()));
	return results;
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

export async function importMeetupRoadCyclingTopic(
	supabase,
	{
		topicUrlkey = MEETUP_TOPIC_URLKEY,
		createdByUserId = DEFAULT_CREATED_BY_USER_ID,
		publish = true,
		dryRun = false,
		onlyNew = true,
		slugPrefix = 'meetup-',
		requireGeocoding = false,
		skipGeocoding = false,
		skipImageUpload = true,
		groupLimit = null,
		groupFetchConcurrency = 10,
		eventsPerGroup = 20,
		maxEventPagesPerGroup = 3,
		horizonDays = 365
	} = {}
) {
	const normalizedTopicUrlkey = safeTrim(topicUrlkey) || MEETUP_TOPIC_URLKEY;
	let groups = await fetchTopicGroups(normalizedTopicUrlkey);
	if (Number.isInteger(groupLimit) && groupLimit > 0) {
		groups = groups.slice(0, groupLimit);
	}

	const horizonDate =
		Number.isFinite(Number(horizonDays)) && Number(horizonDays) > 0
			? new Date(Date.now() + Number(horizonDays) * 86_400_000)
			: null;

	const groupErrors = [];
	const groupEventCollections = await mapWithConcurrency(
		groups,
		groupFetchConcurrency,
		async (group) => {
			try {
				const payload = await fetchGroupActiveEvents({
					urlname: group.urlname,
					eventsPerGroup: clampPositiveInteger(eventsPerGroup, 20),
					maxPagesPerGroup: clampPositiveInteger(maxEventPagesPerGroup, 3),
					horizonDate
				});
				const activeGroup = payload.group || group;
				const mappedEvents = (payload.events || [])
					.map((event) => mapGroupEventToSeedEvent(activeGroup, event))
					.filter(Boolean);
				return {
					group: activeGroup,
					events: mappedEvents
				};
			} catch (error) {
				groupErrors.push({
					urlname: group.urlname,
					message: error?.message || 'Unknown Meetup fetch error.'
				});
				return {
					group,
					events: []
				};
			}
		}
	);

	const sourceEventsById = new Map();
	for (const collection of groupEventCollections) {
		for (const event of collection.events) {
			const sourceEventId = safeTrim(event?.id);
			if (!sourceEventId || sourceEventsById.has(sourceEventId)) continue;
			sourceEventsById.set(sourceEventId, event);
		}
	}
	const sourceEvents = Array.from(sourceEventsById.values());

	if (!sourceEvents.length) {
		return {
			topicUrlkey: normalizedTopicUrlkey,
			groupCount: groups.length,
			groupErrorCount: groupErrors.length,
			groupErrors: groupErrors.slice(0, 25),
			feedEventCount: 0,
			candidateEventCount: 0,
			inserted: [],
			skipped: 0,
			skippedExisting: [],
			skippedGeocoding: [],
			skippedInvalid: [],
			skippedEquivalent: [],
			reason: 'No Meetup events were collected from topic groups.'
		};
	}

	let candidateEvents = sourceEvents;
	let preSkippedExisting = [];
	if (onlyNew) {
		const existingBySourceId = await fetchExistingEventsBySourceId(
			supabase,
			sourceEvents.map((event) => event.id)
		);
		preSkippedExisting = sourceEvents
			.map((event) => existingBySourceId.get(event.id))
			.filter(Boolean);
		candidateEvents = sourceEvents.filter((event) => !existingBySourceId.has(event.id));
	}

	if (!candidateEvents.length) {
		return {
			topicUrlkey: normalizedTopicUrlkey,
			groupCount: groups.length,
			groupErrorCount: groupErrors.length,
			groupErrors: groupErrors.slice(0, 25),
			feedEventCount: sourceEvents.length,
			candidateEventCount: 0,
			inserted: [],
			skipped: 0,
			skippedExisting: preSkippedExisting,
			skippedGeocoding: [],
			skippedInvalid: [],
			skippedEquivalent: [],
			reason: 'No new Meetup events to import.'
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
		topicUrlkey: normalizedTopicUrlkey,
		groupCount: groups.length,
		groupErrorCount: groupErrors.length,
		groupErrors: groupErrors.slice(0, 25),
		feedEventCount: sourceEvents.length,
		candidateEventCount: candidateEvents.length,
		skippedExisting: [...preSkippedExisting, ...existingFromImport]
	};
}
