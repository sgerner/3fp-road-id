import { safeParseJson, isSchemaUnsupportedError } from '#lib/server/aiJson.js';
import { runBoundedToolLoop } from '#lib/server/ai/toolLoop.js';
import {
	buildHybridArticleCandidates,
	inferArticleIntent,
	isPlaceholderLearnArticle
} from '#lib/server/learnRecommendations.js';
import { getUsStateName, normalizeUsStateCode, US_STATE_OPTIONS } from '#lib/geo/usStates.js';
import { isSafeInternalPath } from '#lib/security/navigation.js';
import { normalizeAssistantHref, normalizeNavigationTarget } from '#lib/ai/assistantMessage.js';

export const MAX_MESSAGE_COUNT = 24;
export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_RECOMMENDATIONS = 6;
export const DEFAULT_TURN_TIMEOUT_MS = 5200;

const FOCUS_ALLOWED = new Set(['groups', 'rides', 'volunteer']);

const LOCATION_HEADERS = {
	city: ['cf-ipcity', 'x-vercel-ip-city', 'x-azure-clientip-city'],
	region: ['cf-region-code', 'x-vercel-ip-country-region', 'x-azure-clientip-region'],
	country: ['cf-ipcountry', 'x-vercel-ip-country', 'x-azure-clientip-country']
};

const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'but',
	'by',
	'can',
	'could',
	'did',
	'do',
	'does',
	'done',
	'find',
	'for',
	'from',
	'get',
	'help',
	'how',
	'i',
	'if',
	'in',
	'into',
	'is',
	'it',
	'looking',
	'me',
	'my',
	'near',
	'nearby',
	'of',
	'on',
	'or',
	'our',
	'please',
	'should',
	'show',
	'so',
	'some',
	'that',
	'the',
	'them',
	'there',
	'they',
	'this',
	'to',
	'us',
	'want',
	'we',
	'what',
	'when',
	'where',
	'who',
	'why',
	'with',
	'would',
	'you',
	'your'
]);

const GENERIC_SEARCH_QUERY_WORDS = new Set([
	'bike',
	'bikes',
	'bicycle',
	'bicycles',
	'biking',
	'cycling',
	'cyclist',
	'cyclists',
	'ride',
	'rides',
	'riding',
	'group',
	'groups',
	'club',
	'clubs',
	'team',
	'teams',
	'chapter',
	'chapters',
	'community',
	'volunteer',
	'volunteering',
	'shift',
	'shifts',
	'event',
	'events',
	'opportunity',
	'opportunities',
	'article',
	'articles',
	'guide',
	'guides',
	'learn',
	'resource',
	'resources',
	'local',
	'around',
	'area',
	'city',
	'state',
	'meet',
	'meets',
	'meeting',
	'upcoming',
	'any'
]);

export const ASSISTANT_ROUTES = {
	roadid: {
		key: 'roadid',
		url: '/roadid',
		label: 'Open Road ID',
		reason:
			'Claim or manage your 3 Feet Please In Case emergency QR bracelet profile and crash checklist.'
	},
	donate: {
		key: 'donate',
		url: '/donate',
		label: 'Donate To 3 Feet Please',
		reason: 'Support safer streets and 3-foot passing advocacy at 3fp.org/donate.'
	},
	volunteer: {
		key: 'volunteer',
		url: '/volunteer',
		label: 'Browse Volunteer Events',
		reason: 'Explore upcoming volunteer shifts and community events.'
	},
	volunteer_new: {
		key: 'volunteer_new',
		url: '/volunteer/new',
		label: 'Host A Volunteer Event',
		reason: 'Set up a volunteer event with shifts and signups.'
	},
	get_involved: {
		key: 'get_involved',
		url: '/get-involved',
		label: 'Get Involved',
		reason: 'See ways to advocate, volunteer, partner, or post on 3 Feet Please.'
	},
	learn: {
		key: 'learn',
		url: '/learn',
		label: 'Browse Safety Guides',
		reason: 'Read cycling safety guides, policy resources, and advocacy toolkits.'
	},
	learn_new: {
		key: 'learn_new',
		url: '/learn/new',
		label: 'Write A Safety Guide',
		reason: 'Draft and publish a new safety guide or article in Learn.'
	},
	ride: {
		key: 'ride',
		url: '/ride',
		label: 'Browse Rides',
		reason: 'Explore upcoming published bike rides.'
	},
	ride_new: {
		key: 'ride_new',
		url: '/ride/new',
		label: 'Post A Ride',
		reason: 'Create a new public ride listing.'
	},
	groups: {
		key: 'groups',
		url: '/groups',
		label: 'Browse Cycling Groups',
		reason: 'Find local cycling groups, clubs, and advocacy organizations.'
	},
	groups_new: {
		key: 'groups_new',
		url: '/groups/new',
		label: 'Create A Group',
		reason: 'Create a new cycling group profile and publish it.'
	},
	merch: {
		key: 'merch',
		url: '/merch',
		label: 'Shop 3FP Merch',
		reason: 'Browse official 3 Feet Please apparel and cycling gear.'
	},
	profile: {
		key: 'profile',
		url: '/profile',
		label: 'Open Profile',
		reason: 'Manage your rider profile and saved preferences.'
	}
};

const ROUTE_KEY_ALIASES = {
	'/roadid': 'roadid',
	'road-id': 'roadid',
	road_id: 'roadid',
	'/donate': 'donate',
	donations: 'donate',
	'/volunteer': 'volunteer',
	'/volunteer/new': 'volunteer_new',
	host_volunteer: 'volunteer_new',
	create_volunteer: 'volunteer_new',
	'/get-involved': 'get_involved',
	'get-involved': 'get_involved',
	involvement: 'get_involved',
	'/learn': 'learn',
	guides: 'learn',
	articles: 'learn',
	'/learn/new': 'learn_new',
	'learn-new': 'learn_new',
	write_guide: 'learn_new',
	write_article: 'learn_new',
	article_new: 'learn_new',
	'/ride': 'ride',
	rides: 'ride',
	'/ride/new': 'ride_new',
	post_ride: 'ride_new',
	create_ride: 'ride_new',
	'/groups': 'groups',
	group: 'groups',
	'/groups/new': 'groups_new',
	group_new: 'groups_new',
	create_group: 'groups_new',
	'/merch': 'merch',
	shop: 'merch',
	store: 'merch',
	'/profile': 'profile'
};

export const CHAT_RESPONSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['reply'],
	properties: {
		reply: { type: 'string' },
		follow_up_question: { type: 'string', nullable: true },
		learned_context: {
			type: 'object',
			nullable: true,
			additionalProperties: false,
			properties: {
				location: { type: 'string', nullable: true },
				interests: {
					type: 'array',
					nullable: true,
					items: { type: 'string' }
				},
				recommendation_focus: {
					type: 'array',
					nullable: true,
					items: { type: 'string' }
				}
			}
		}
	}
};

export const ASSISTANT_TOOLS = [
	{
		functionDeclarations: [
			{
				name: 'select_route',
				description:
					'Select the primary 3 Feet Please destination page or creation form action button for the user.',
				parameters: {
					type: 'object',
					additionalProperties: false,
					required: ['route_key'],
					properties: {
						route_key: {
							type: 'string',
							enum: Object.keys(ASSISTANT_ROUTES),
							description:
								'Destination key: roadid, donate, volunteer, volunteer_new, get_involved, learn, learn_new, ride, ride_new, groups, groups_new, merch, or profile.'
						},
						reason: {
							type: 'string',
							nullable: true,
							description: 'Optional short explanation shown beneath the action button.'
						}
					}
				}
			},
			{
				name: 'search_rides',
				description:
					'Search published upcoming bike rides on 3 Feet Please, optionally filtered by keyword, city, and US state.',
				parameters: {
					type: 'object',
					additionalProperties: false,
					properties: {
						query: {
							type: 'string',
							nullable: true,
							description: 'Optional ride keyword (e.g. gravel, social, morning, no-drop).'
						},
						city: {
							type: 'string',
							nullable: true,
							description: 'Optional city name (e.g. Phoenix, Madison).'
						},
						state: {
							type: 'string',
							nullable: true,
							description: 'Optional US state code or full name (e.g. AZ, Arizona, WI, Wisconsin).'
						},
						limit: {
							type: 'integer',
							nullable: true,
							description: 'Maximum rides to return (1 to 6).'
						}
					}
				}
			},
			{
				name: 'search_groups',
				description:
					'Search published cycling groups, clubs, and advocacy organizations on 3 Feet Please by keyword, city, and US state.',
				parameters: {
					type: 'object',
					additionalProperties: false,
					properties: {
						query: {
							type: 'string',
							nullable: true,
							description: 'Optional group name or topic keyword (e.g. advocacy, MTB, women).'
						},
						city: {
							type: 'string',
							nullable: true,
							description: 'Optional city name (e.g. Madison, Phoenix).'
						},
						state: {
							type: 'string',
							nullable: true,
							description: 'Optional US state code or full name (e.g. WI, Wisconsin, AZ, Arizona).'
						},
						limit: {
							type: 'integer',
							nullable: true,
							description: 'Maximum groups to return (1 to 6).'
						}
					}
				}
			},
			{
				name: 'search_volunteer_events',
				description:
					'Search published upcoming volunteer events and shifts on 3 Feet Please by keyword, city, and US state.',
				parameters: {
					type: 'object',
					additionalProperties: false,
					properties: {
						query: {
							type: 'string',
							nullable: true,
							description: 'Optional volunteer event keyword (e.g. valet, marshal, wrench).'
						},
						city: {
							type: 'string',
							nullable: true,
							description: 'Optional city name.'
						},
						state: {
							type: 'string',
							nullable: true,
							description: 'Optional US state code or full name.'
						},
						limit: {
							type: 'integer',
							nullable: true,
							description: 'Maximum volunteer events to return (1 to 6).'
						}
					}
				}
			},
			{
				name: 'search_guides',
				description:
					'Search published Learn safety guides, advocacy toolkits, and cycling articles on 3 Feet Please.',
				parameters: {
					type: 'object',
					additionalProperties: false,
					properties: {
						query: {
							type: 'string',
							nullable: true,
							description: 'Topic or question for Learn guides.'
						},
						city: {
							type: 'string',
							nullable: true,
							description: 'Optional city context.'
						},
						state: {
							type: 'string',
							nullable: true,
							description: 'Optional US state code or name.'
						},
						limit: {
							type: 'integer',
							nullable: true,
							description: 'Maximum guides to return (1 to 6).'
						}
					}
				}
			}
		]
	}
];

const US_STATE_NAME_PATTERNS = US_STATE_OPTIONS.map((entry) => ({
	code: entry.code,
	name: entry.name,
	regex: new RegExp(`\\b${escapeRegExp(entry.name)}\\b`, 'i')
})).sort((a, b) => b.name.length - a.name.length);

function escapeRegExp(value) {
	return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function normalizeObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return value;
}

export function uniqStrings(values, limit = 24) {
	const next = [];
	for (const value of values || []) {
		const cleaned = safeTrim(value);
		if (!cleaned) continue;
		if (next.some((entry) => entry.toLowerCase() === cleaned.toLowerCase())) continue;
		next.push(cleaned);
		if (next.length >= limit) break;
	}
	return next;
}

export function tokenize(value) {
	return safeTrim(value)
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function tokenizeSpecificSearchTerms(value, { city = '', state = '', stateName = '' } = {}) {
	const excluded = new Set(
		[city, state, stateName]
			.flatMap((entry) =>
				safeTrim(entry)
					.toLowerCase()
					.split(/[^a-z0-9]+/)
			)
			.filter(Boolean)
	);
	return tokenize(value).filter(
		(token) => !GENERIC_SEARCH_QUERY_WORDS.has(token) && !excluded.has(token)
	);
}

export function sanitizePostgrestTerm(value) {
	return safeTrim(value)
		.replace(/[,()*%\\]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
}

export function normalizeMessages(messages) {
	if (!Array.isArray(messages)) return [];
	const rows = [];
	for (const raw of messages) {
		if (!raw || typeof raw !== 'object') continue;
		const role = raw.role === 'assistant' ? 'assistant' : raw.role === 'user' ? 'user' : null;
		if (!role) continue;
		const content = safeTrim(raw.content).slice(0, MAX_MESSAGE_LENGTH);
		if (!content) continue;
		rows.push({ role, content });
		if (rows.length >= MAX_MESSAGE_COUNT) break;
	}
	return rows;
}

export function extractLatestUserMessage(messages) {
	for (let index = (messages?.length || 0) - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === 'user') return messages[index].content;
	}
	return '';
}

export function resolveRouteTarget(routeKeyOrUrl, overrides = {}) {
	const rawKey = safeTrim(routeKeyOrUrl).toLowerCase();
	if (!rawKey) return null;

	const canonicalKey = Object.hasOwn(ASSISTANT_ROUTES, rawKey)
		? rawKey
		: ROUTE_KEY_ALIASES[rawKey] || null;
	const entry = canonicalKey ? ASSISTANT_ROUTES[canonicalKey] : null;
	if (!entry || !isSafeInternalPath(entry.url)) return null;

	return normalizeNavigationTarget({
		url: entry.url,
		label: safeTrim(overrides.label) || entry.label,
		reason: safeTrim(overrides.reason) || entry.reason
	});
}

function readHeader(headers, names) {
	if (!headers || typeof headers.get !== 'function') return '';
	for (const name of names) {
		const value = headers.get(name);
		if (!value) continue;
		try {
			return decodeURIComponent(value).trim();
		} catch {
			return String(value).trim();
		}
	}
	return '';
}

export function formatLocationLabel({ city = '', state = '', region = '', country = '' } = {}) {
	const cleanCity = safeTrim(city);
	const stateCode = normalizeUsStateCode(state || region);
	const cleanRegion = stateCode || safeTrim(state || region);
	if (cleanCity && cleanRegion) return `${cleanCity}, ${cleanRegion}`;
	if (cleanCity) return cleanCity;
	if (cleanRegion) return stateCode ? getUsStateName(stateCode) || stateCode : cleanRegion;
	const cleanCountry = safeTrim(country).toUpperCase();
	if (cleanCountry && cleanCountry !== 'US') return cleanCountry;
	return '';
}

export function extractRequestGeoLocation(headers) {
	const city = readHeader(headers, LOCATION_HEADERS.city);
	const rawRegion = readHeader(headers, LOCATION_HEADERS.region);
	const country = readHeader(headers, LOCATION_HEADERS.country).toUpperCase();
	const isUsOrUnknown = !country || country === 'US' || country === 'USA';
	const stateCode = isUsOrUnknown ? normalizeUsStateCode(rawRegion) : '';
	const state = stateCode || rawRegion;
	const stateName = stateCode ? getUsStateName(stateCode) : '';
	const label = formatLocationLabel({ city, state, country });
	if (!label) return null;
	return {
		city,
		state,
		stateCode,
		stateName,
		country,
		label,
		source: 'geo_ip'
	};
}

function isVagueLocationPlaceholder(value) {
	const normalized = safeTrim(value).toLowerCase();
	if (!normalized) return true;
	return /^(?:near\s+me|nearby|around\s+me|around\s+here|here|my\s+area|my\s+city|my\s+location|current\s+location|local)$/.test(
		normalized
	);
}

function cleanExtractedCityCandidate(rawCity) {
	let cleaned = safeTrim(rawCity)
		.replace(/^[,.\s]+|[,.\s]+$/g, '')
		.replace(/\s+/g, ' ');
	if (!cleaned) return '';

	const prepMatch = cleaned.match(
		/\b(?:in|near|around|at|from|for|to|visiting)\s+([A-Za-z][A-Za-z .'-]{1,42})$/i
	);
	if (prepMatch) {
		cleaned = prepMatch[1].trim();
	}

	const words = cleaned.split(' ');
	if (words.length > 4) {
		cleaned = words.slice(-3).join(' ');
	}

	const lower = cleaned.toLowerCase();
	if (
		isVagueLocationPlaceholder(lower) ||
		/^(?:find|where|what|when|how|show|rides|groups|cycling|bike|volunteer|guides|learn)$/.test(
			lower
		)
	) {
		return '';
	}
	return cleaned;
}

export function parseLocationInput({ city = '', state = '', raw = '' } = {}) {
	let resolvedCity = isVagueLocationPlaceholder(city) ? '' : safeTrim(city);
	let resolvedStateRaw = isVagueLocationPlaceholder(state) ? '' : safeTrim(state);

	if (resolvedCity.includes(',') && !resolvedStateRaw) {
		const [firstPart, ...restParts] = resolvedCity.split(',');
		const maybeState = restParts.join(',').trim();
		const maybeCode = normalizeUsStateCode(maybeState);
		if (maybeCode || maybeState.length <= 20) {
			resolvedCity = firstPart.trim();
			resolvedStateRaw = maybeState;
		}
	}

	const rawText = isVagueLocationPlaceholder(raw) ? '' : safeTrim(raw);
	if (!resolvedCity && !resolvedStateRaw && rawText) {
		const parsedFromRaw = extractLocationFromSingleText(rawText, { allowBareCity: true });
		if (parsedFromRaw) return parsedFromRaw;
	}

	const stateCode = normalizeUsStateCode(resolvedStateRaw);
	const stateName = stateCode ? getUsStateName(stateCode) : '';
	const finalState = stateCode || resolvedStateRaw;
	const finalCity = cleanExtractedCityCandidate(resolvedCity);
	const label = formatLocationLabel({ city: finalCity, state: finalState });
	if (!finalCity && !finalState) return null;

	return {
		city: finalCity,
		state: finalState,
		stateCode,
		stateName,
		label
	};
}

export function extractLocationFromSingleText(text, { allowBareCity = false } = {}) {
	const source = safeTrim(text);
	if (!source || isVagueLocationPlaceholder(source)) return null;

	// 1. Preposition + "City, State": e.g., "Where do cycling groups meet in Madison, WI?"
	const prepCommaRegex =
		/\b(?:in|near|around|from|at|for|around|visiting)\s+([A-Za-z][A-Za-z .'-]{1,36}?)\s*,\s*([A-Za-z .]{2,22})(?=$|[?!.,;:\s])/gi;
	let match;
	let bestMatch = null;
	while ((match = prepCommaRegex.exec(source)) !== null) {
		const stateCode = normalizeUsStateCode(match[2]);
		const city = cleanExtractedCityCandidate(match[1]);
		if (stateCode && city) {
			bestMatch = {
				city,
				state: stateCode,
				stateCode,
				stateName: getUsStateName(stateCode),
				label: `${city}, ${stateCode}`
			};
		}
	}
	if (bestMatch) return bestMatch;

	// 2. General "City, ST" or "City, StateName": e.g., "Phoenix, AZ"
	const commaRegex = /([A-Za-z][A-Za-z .'-]{1,36}?)\s*,\s*([A-Za-z .]{2,22})(?=$|[?!.,;:\s])/g;
	while ((match = commaRegex.exec(source)) !== null) {
		const stateCandidate = match[2].replace(/[?!.,;:]+$/, '').trim();
		const stateCode = normalizeUsStateCode(stateCandidate);
		const city = cleanExtractedCityCandidate(match[1]);
		if (stateCode && city) {
			bestMatch = {
				city,
				state: stateCode,
				stateCode,
				stateName: getUsStateName(stateCode),
				label: `${city}, ${stateCode}`
			};
		}
	}
	if (bestMatch) return bestMatch;

	// 3. "City ST" where ST is an explicit UPPERCASE 2-letter US state code (e.g., "Phoenix AZ", "in Madison WI")
	const upperCodeRegex =
		/(?:^|\b(?:in|near|around|at|for)\s+)([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,2})\s+([A-Z]{2})(?=$|[?!.,;:\s])/g;
	while ((match = upperCodeRegex.exec(source)) !== null) {
		const stateCode = normalizeUsStateCode(match[2]);
		const city = cleanExtractedCityCandidate(match[1]);
		if (stateCode && city) {
			return {
				city,
				state: stateCode,
				stateCode,
				stateName: getUsStateName(stateCode),
				label: `${city}, ${stateCode}`
			};
		}
	}

	// 4. Full US state name with optional preceding city (e.g., "Madison Wisconsin" or "in Arizona")
	for (const entry of US_STATE_NAME_PATTERNS) {
		const stateMatch = entry.regex.exec(source);
		if (!stateMatch) continue;
		const before = source.slice(0, stateMatch.index).trim();
		const beforeCityMatch = before.match(
			/(?:^|\b(?:in|near|around|at|for)\s+)([A-Z][a-z.'-]*(?:\s+[A-Z][a-z.'-]*){0,2})\s*,?$/
		);
		const city = beforeCityMatch ? cleanExtractedCityCandidate(beforeCityMatch[1]) : '';
		return {
			city,
			state: entry.code,
			stateCode: entry.code,
			stateName: entry.name,
			label: city ? `${city}, ${entry.code}` : entry.name
		};
	}

	// 5. Short standalone reply when prompted for a city (e.g. "Phoenix" or "Tempe")
	if (
		allowBareCity &&
		/^[A-Za-z][A-Za-z .'-]{1,34}$/.test(source) &&
		source.split(/\s+/).length <= 3
	) {
		const maybeStateCode = source.length > 2 ? normalizeUsStateCode(source) : '';
		if (maybeStateCode) {
			return {
				city: '',
				state: maybeStateCode,
				stateCode: maybeStateCode,
				stateName: getUsStateName(maybeStateCode),
				label: getUsStateName(maybeStateCode)
			};
		}
		const city = cleanExtractedCityCandidate(source);
		if (city) {
			return {
				city,
				state: '',
				stateCode: '',
				stateName: '',
				label: city
			};
		}
	}

	return null;
}

export function extractChatStatedLocation(messages = []) {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const entry = messages[index];
		if (entry?.role !== 'user') continue;
		const prevAssistant =
			index > 0 && messages[index - 1]?.role === 'assistant' ? messages[index - 1].content : '';
		const assistantAskedLocation = /\b(city|state|area|where|location|zip)\b/i.test(prevAssistant);
		const isShortReply = safeTrim(entry.content).split(/\s+/).length <= 4;
		const extracted = extractLocationFromSingleText(entry.content, {
			allowBareCity: assistantAskedLocation && isShortReply
		});
		if (extracted) {
			return { ...extracted, source: 'chat' };
		}
	}
	return null;
}

export function resolveTurnLocationContext({
	messages = [],
	recommendationContext = {},
	assistantMemory = {},
	requestHeaders = null
} = {}) {
	const chatLocation = extractChatStatedLocation(messages);
	const savedRaw =
		safeTrim(recommendationContext?.home_location?.label) ||
		safeTrim(recommendationContext?.location) ||
		safeTrim(assistantMemory?.learned_location);
	const savedParsed = savedRaw ? parseLocationInput({ raw: savedRaw }) : null;
	const profileLocation = savedParsed
		? { ...savedParsed, label: savedParsed.label || savedRaw, source: 'profile' }
		: savedRaw
			? {
					city: '',
					state: '',
					stateCode: '',
					stateName: '',
					label: savedRaw,
					source: 'profile'
				}
			: null;
	const geoLocation = extractRequestGeoLocation(requestHeaders);

	const activeLocation = chatLocation || profileLocation || geoLocation || null;
	return {
		activeLocation,
		chatLocation,
		profileLocation,
		geoLocation,
		locationHint: activeLocation?.label || ''
	};
}

export function matchesUsStateInText(text, stateInput) {
	const source = safeTrim(text);
	if (!source) return false;

	const stateCode = normalizeUsStateCode(stateInput);
	if (!stateCode) {
		const fallback = safeTrim(stateInput).toLowerCase();
		return Boolean(fallback && source.toLowerCase().includes(fallback));
	}

	const stateName = getUsStateName(stateCode);
	if (source.trim().toUpperCase() === stateCode) return true;
	if (stateName && new RegExp(`\\b${escapeRegExp(stateName)}\\b`, 'i').test(source)) {
		return true;
	}
	// Comma + 2-letter code (case-insensitive, e.g. "Madison, WI" or "Phoenix, az 85004")
	if (new RegExp(`,\\s*${stateCode}(?:\\s+\\d{5}(?:-\\d{4})?|\\b|$)`, 'i').test(source)) {
		return true;
	}
	// Uppercase 2-letter token with word boundaries (avoids matching lowercase "in" inside "Main St")
	if (new RegExp(`(?:^|\\s)${stateCode}(?:\\s+\\d{5}(?:-\\d{4})?|\\b|$)`).test(source)) {
		return true;
	}
	return false;
}

function matchesCityInText(text, city) {
	const cleanCity = safeTrim(city).toLowerCase();
	if (!cleanCity) return false;
	return new RegExp(`\\b${escapeRegExp(cleanCity)}\\b`, 'i').test(safeTrim(text));
}

async function safeSelect(queryPromise, label) {
	try {
		const { data, error } = await queryPromise;
		if (error) {
			console.warn(`assistant query failed for ${label}`, error);
			return [];
		}
		return Array.isArray(data) ? data : [];
	} catch (error) {
		console.warn(`assistant query threw for ${label}`, error);
		return [];
	}
}

function normalizeGroupRow(row) {
	return {
		id: row?.id ?? null,
		slug: row?.slug ?? null,
		name: row?.name ?? 'Untitled group',
		tagline: row?.tagline ?? '',
		description: row?.description ?? '',
		city: row?.city ?? '',
		state_region: row?.state_region ?? '',
		country: row?.country ?? '',
		membership_info: row?.membership_info ?? '',
		service_area_description: row?.service_area_description ?? '',
		activity_frequency: row?.activity_frequency ?? '',
		typical_activity_day_time: row?.typical_activity_day_time ?? ''
	};
}

function normalizeRideRow(row) {
	const joinedGroup = Array.isArray(row?.group) ? row.group[0] : row?.group;
	return {
		id: row?.id ?? null,
		slug: row?.slug ?? null,
		title: row?.title ?? 'Ride',
		summary: row?.summary ?? '',
		description: row?.description ?? '',
		start_location_name: row?.start_location_name ?? '',
		start_location_address: row?.start_location_address ?? '',
		next_occurrence_start: row?.next_occurrence_start ?? null,
		host_group_id: row?.host_group_id ?? null,
		joinedGroup: joinedGroup ? normalizeGroupRow(joinedGroup) : null
	};
}

function normalizeVolunteerRow(row) {
	return {
		id: row?.id ?? null,
		slug: row?.slug ?? null,
		title: row?.title ?? 'Volunteer event',
		summary: row?.summary ?? '',
		description: row?.description ?? '',
		event_start: row?.event_start ?? null,
		location_name: row?.location_name ?? '',
		location_address: row?.location_address ?? '',
		host_group_id: row?.host_group_id ?? null,
		event_type_slug: row?.event_type_slug ?? ''
	};
}

function buildStatePostgrestOr(column, stateInput) {
	const stateCode = normalizeUsStateCode(stateInput);
	if (stateCode) {
		const stateName = sanitizePostgrestTerm(getUsStateName(stateCode));
		const parts = [`${column}.ilike.${stateCode}`];
		if (stateName) parts.push(`${column}.ilike.%${stateName}%`);
		return parts.join(',');
	}
	const sanitized = sanitizePostgrestTerm(stateInput);
	return sanitized ? `${column}.ilike.%${sanitized}%` : '';
}

async function queryGroupsForLocation(supabase, { city = '', state = '', limit = 80 } = {}) {
	let query = supabase
		.from('groups')
		.select(
			'id,slug,name,tagline,description,city,state_region,country,membership_info,service_area_description,activity_frequency,typical_activity_day_time'
		);
	if (typeof query.eq === 'function') {
		query = query.eq('is_published', true);
	}
	const stateOr = state ? buildStatePostgrestOr('state_region', state) : '';
	if (stateOr && typeof query.or === 'function') {
		query = query.or(stateOr);
	} else if (city) {
		const sanitizedCity = sanitizePostgrestTerm(city);
		if (sanitizedCity && typeof query.or === 'function') {
			query = query.or(
				`city.ilike.%${sanitizedCity}%,service_area_description.ilike.%${sanitizedCity}%`
			);
		}
	}
	if (typeof query.limit === 'function') {
		query = query.limit(limit);
	}
	const rows = await safeSelect(query, 'location groups');
	return rows.map(normalizeGroupRow).filter((row) => row.id && row.slug);
}

export async function searchGroupsSql(
	supabase,
	{ query = '', city = '', state = '', limit = 6, affinityGroupIds = new Set() } = {}
) {
	const parsedLoc = parseLocationInput({ city, state });
	const resolvedCity = parsedLoc?.city || '';
	const resolvedState = parsedLoc?.state || '';
	const stateCode = parsedLoc?.stateCode || normalizeUsStateCode(resolvedState);
	const stateName = parsedLoc?.stateName || getUsStateName(stateCode);
	const cappedLimit = Math.max(1, Math.min(Number(limit) || 6, MAX_RECOMMENDATIONS));
	const specificTerms = tokenizeSpecificSearchTerms(query, {
		city: resolvedCity,
		state: resolvedState,
		stateName
	});

	const selectCols =
		'id,slug,name,tagline,description,city,state_region,country,membership_info,service_area_description,activity_frequency,typical_activity_day_time';

	const runGroupQuery = async ({ useCityFilter = false, useKeywordFilter = false } = {}) => {
		let q = supabase.from('groups').select(selectCols);
		if (typeof q.eq === 'function') {
			q = q.eq('is_published', true);
		}
		const stateOr = resolvedState ? buildStatePostgrestOr('state_region', resolvedState) : '';
		if (stateOr && typeof q.or === 'function') {
			q = q.or(stateOr);
		}
		if (useCityFilter && resolvedCity) {
			const cleanCity = sanitizePostgrestTerm(resolvedCity);
			if (cleanCity && typeof q.or === 'function') {
				q = q.or(
					`city.ilike.%${cleanCity}%,service_area_description.ilike.%${cleanCity}%,name.ilike.%${cleanCity}%`
				);
			}
		}
		if (useKeywordFilter && specificTerms.length > 0) {
			const termClauses = specificTerms.slice(0, 4).flatMap((term) => {
				const clean = sanitizePostgrestTerm(term);
				if (!clean) return [];
				return [
					`name.ilike.%${clean}%`,
					`tagline.ilike.%${clean}%`,
					`description.ilike.%${clean}%`,
					`city.ilike.%${clean}%`
				];
			});
			if (termClauses.length && typeof q.or === 'function') {
				q = q.or(termClauses.join(','));
			}
		}
		if (typeof q.order === 'function') {
			q = q.order('name', { ascending: true });
		}
		if (typeof q.limit === 'function') {
			q = q.limit(60);
		}
		return safeSelect(q, 'search_groups');
	};

	const candidateRows = [];
	if (resolvedCity) {
		const cityRows = await runGroupQuery({
			useCityFilter: true,
			useKeywordFilter: false
		});
		candidateRows.push(...cityRows);
		if (candidateRows.length < cappedLimit && resolvedState) {
			const stateRows = await runGroupQuery({
				useCityFilter: false,
				useKeywordFilter: specificTerms.length > 0
			});
			candidateRows.push(...stateRows);
		}
	} else if (resolvedState) {
		const stateRows = await runGroupQuery({
			useCityFilter: false,
			useKeywordFilter: specificTerms.length > 0
		});
		candidateRows.push(...stateRows);
		if (!candidateRows.length && specificTerms.length > 0) {
			candidateRows.push(
				...(await runGroupQuery({ useCityFilter: false, useKeywordFilter: false }))
			);
		}
	} else {
		const keywordRows = await runGroupQuery({
			useCityFilter: false,
			useKeywordFilter: specificTerms.length > 0
		});
		candidateRows.push(...keywordRows);
	}

	const deduped = new Map();
	for (const raw of candidateRows) {
		const group = normalizeGroupRow(raw);
		if (!group.id || !group.slug) continue;
		const url = normalizeAssistantHref(`/groups/${group.slug}`);
		if (!url) continue;
		if (!deduped.has(url)) {
			deduped.set(url, { group, url });
		}
	}

	const locationLabel = formatLocationLabel({ city: resolvedCity, state: resolvedState });
	const scored = [];
	for (const { group, url } of deduped.values()) {
		if (resolvedState) {
			const stateText = `${group.state_region} ${group.city}, ${group.state_region}`;
			if (!matchesUsStateInText(stateText, resolvedState)) {
				continue;
			}
		}

		let score = 10;
		const exactCity = resolvedCity && matchesCityInText(group.city, resolvedCity);
		const serviceAreaCity =
			resolvedCity &&
			!exactCity &&
			matchesCityInText(`${group.service_area_description} ${group.name}`, resolvedCity);
		const stateMatched = resolvedState
			? matchesUsStateInText(`${group.state_region}`, resolvedState)
			: false;

		if (exactCity) score += 25;
		else if (serviceAreaCity) score += 14;
		if (stateMatched) score += 12;

		const blob = [
			group.name,
			group.tagline,
			group.description,
			group.city,
			group.state_region,
			group.service_area_description,
			group.membership_info
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();

		const matchedTerms = [];
		for (const term of specificTerms) {
			if (blob.includes(term)) {
				score += group.name.toLowerCase().includes(term) ? 10 : 5;
				matchedTerms.push(term);
			}
		}

		if (affinityGroupIds.has(String(group.id))) {
			score += 6;
		}

		const subtitle = [group.city, group.state_region].filter(Boolean).join(', ') || null;
		let reason = 'Local cycling group on 3 Feet Please.';
		if (exactCity && locationLabel) {
			reason = `Based in ${subtitle || locationLabel}.`;
		} else if ((serviceAreaCity || stateMatched) && locationLabel) {
			reason = `Active near ${locationLabel}.`;
		} else if (matchedTerms.length) {
			reason = `Matches ${matchedTerms.slice(0, 2).join(', ')}.`;
		}

		scored.push({
			score,
			recommendation: {
				id: String(group.id),
				type: 'group',
				title: group.name,
				subtitle,
				summary: group.tagline || group.description || group.membership_info || null,
				url,
				reason
			}
		});
	}

	scored.sort(
		(a, b) => b.score - a.score || a.recommendation.title.localeCompare(b.recommendation.title)
	);
	return scored.slice(0, cappedLimit).map((entry) => entry.recommendation);
}

export async function searchRidesSql(
	supabase,
	{
		query = '',
		city = '',
		state = '',
		limit = 6,
		affinityGroupIds = new Set(),
		now = new Date()
	} = {}
) {
	const parsedLoc = parseLocationInput({ city, state });
	const resolvedCity = parsedLoc?.city || '';
	const resolvedState = parsedLoc?.state || '';
	const stateCode = parsedLoc?.stateCode || normalizeUsStateCode(resolvedState);
	const stateName = parsedLoc?.stateName || getUsStateName(stateCode);
	const cappedLimit = Math.max(1, Math.min(Number(limit) || 6, MAX_RECOMMENDATIONS));
	const specificTerms = tokenizeSpecificSearchTerms(query, {
		city: resolvedCity,
		state: resolvedState,
		stateName
	});
	const nowIso = now.toISOString();

	const locationGroups =
		resolvedCity || resolvedState
			? await queryGroupsForLocation(supabase, {
					city: resolvedCity,
					state: resolvedState,
					limit: 120
				})
			: [];
	const groupMap = new Map(locationGroups.map((group) => [String(group.id), group]));
	const matchingGroupIds = locationGroups
		.map((group) => sanitizePostgrestTerm(group.id))
		.filter(Boolean)
		.slice(0, 80);

	const runRideQuery = async ({ applyLocationOr = true, applyKeywords = false } = {}) => {
		let q = supabase
			.from('activity_events')
			.select(
				'id,slug,title,summary,description,start_location_name,start_location_address,next_occurrence_start,host_group_id'
			);
		if (typeof q.eq === 'function') {
			q = q.eq('activity_type', 'ride').eq('status', 'published');
		}
		if (typeof q.gte === 'function') {
			q = q.gte('next_occurrence_start', nowIso);
		}

		if (applyLocationOr && (resolvedCity || resolvedState)) {
			const locClauses = [];
			if (resolvedCity) {
				const cleanCity = sanitizePostgrestTerm(resolvedCity);
				if (cleanCity) {
					locClauses.push(`start_location_address.ilike.%${cleanCity}%`);
					locClauses.push(`start_location_name.ilike.%${cleanCity}%`);
				}
			}
			if (resolvedState) {
				const cleanStateName = sanitizePostgrestTerm(stateName || resolvedState);
				if (cleanStateName) {
					locClauses.push(`start_location_address.ilike.%${cleanStateName}%`);
				}
				if (stateCode) {
					locClauses.push(`start_location_address.ilike.% ${stateCode}%`);
				}
			}
			if (matchingGroupIds.length > 0) {
				locClauses.push(`host_group_id.in.(${matchingGroupIds.join(',')})`);
			}
			if (locClauses.length > 0 && typeof q.or === 'function') {
				q = q.or(locClauses.join(','));
			}
		} else if (applyKeywords && specificTerms.length > 0) {
			const kwClauses = specificTerms.slice(0, 4).flatMap((term) => {
				const clean = sanitizePostgrestTerm(term);
				if (!clean) return [];
				return [
					`title.ilike.%${clean}%`,
					`summary.ilike.%${clean}%`,
					`description.ilike.%${clean}%`,
					`start_location_name.ilike.%${clean}%`,
					`start_location_address.ilike.%${clean}%`
				];
			});
			if (kwClauses.length > 0 && typeof q.or === 'function') {
				q = q.or(kwClauses.join(','));
			}
		}

		if (typeof q.order === 'function') {
			q = q.order('next_occurrence_start', { ascending: true });
		}
		if (typeof q.limit === 'function') {
			q = q.limit(80);
		}
		return safeSelect(q, 'search_rides');
	};

	const rawRides = await runRideQuery({
		applyLocationOr: Boolean(resolvedCity || resolvedState),
		applyKeywords: !resolvedCity && !resolvedState && specificTerms.length > 0
	});

	const rides = rawRides.map(normalizeRideRow).filter((row) => row.id && row.slug);
	const unresolvedGroupIds = uniqStrings(
		rides.map((row) => row.host_group_id).filter((id) => id && !groupMap.has(String(id))),
		80
	);
	if (unresolvedGroupIds.length > 0) {
		let hostQuery = supabase.from('groups').select('id,slug,name,city,state_region,country');
		if (typeof hostQuery.in === 'function') {
			hostQuery = hostQuery.in('id', unresolvedGroupIds);
		}
		const hostGroups = await safeSelect(hostQuery, 'ride host groups');
		for (const rawGroup of hostGroups) {
			const group = normalizeGroupRow(rawGroup);
			if (group.id) groupMap.set(String(group.id), group);
		}
	}

	const locationLabel = formatLocationLabel({ city: resolvedCity, state: resolvedState });
	const scored = [];
	for (const ride of rides) {
		const url = normalizeAssistantHref(`/ride/${ride.slug}`);
		if (!url) continue;
		const hostGroup = ride.joinedGroup || groupMap.get(String(ride.host_group_id)) || null;
		const addressText = [ride.start_location_name, ride.start_location_address]
			.filter(Boolean)
			.join(', ');
		const groupLocationText = [hostGroup?.city, hostGroup?.state_region].filter(Boolean).join(', ');
		const combinedLocationText = [addressText, groupLocationText].filter(Boolean).join(' · ');

		const stateMatched = resolvedState
			? matchesUsStateInText(addressText, resolvedState) ||
				matchesUsStateInText(hostGroup?.state_region || '', resolvedState) ||
				matchesUsStateInText(groupLocationText, resolvedState)
			: false;
		const cityMatched = resolvedCity
			? matchesCityInText(addressText, resolvedCity) ||
				matchesCityInText(hostGroup?.city || '', resolvedCity)
			: false;

		// Exclude out-of-state rides when a state filter is active.
		if (resolvedState && !stateMatched && !cityMatched) {
			continue;
		}
		if (resolvedCity && !resolvedState && !cityMatched) {
			continue;
		}

		let score = 10;
		if (cityMatched) score += 28;
		if (stateMatched) score += 14;

		const blob = [
			ride.title,
			ride.summary,
			ride.description,
			ride.start_location_name,
			ride.start_location_address,
			hostGroup?.name,
			hostGroup?.city,
			hostGroup?.state_region
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();

		const matchedTerms = [];
		for (const term of specificTerms) {
			if (blob.includes(term)) {
				score += ride.title.toLowerCase().includes(term) ? 9 : 4;
				matchedTerms.push(term);
			}
		}

		if (ride.host_group_id && affinityGroupIds.has(String(ride.host_group_id))) {
			score += 5;
		}

		if (ride.next_occurrence_start) {
			const startTs = new Date(ride.next_occurrence_start).getTime();
			if (Number.isFinite(startTs)) {
				const daysOut = (startTs - now.getTime()) / 86400000;
				if (daysOut >= -1 && daysOut <= 14) score += 4;
				else if (daysOut > 14 && daysOut <= 45) score += 2;
			}
		}

		let reason = 'Upcoming published group ride.';
		if (cityMatched && locationLabel) {
			reason = `Starts in ${locationLabel}.`;
		} else if (stateMatched && locationLabel) {
			reason = `Upcoming ride near ${locationLabel}.`;
		} else if (matchedTerms.length) {
			reason = `Matches ${matchedTerms.slice(0, 2).join(', ')}.`;
		}

		scored.push({
			score,
			startAt: ride.next_occurrence_start || '',
			recommendation: {
				id: String(ride.id),
				type: 'ride',
				title: ride.title,
				subtitle: combinedLocationText || null,
				summary: ride.summary || ride.description || null,
				url,
				reason
			}
		});
	}

	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return String(a.startAt).localeCompare(String(b.startAt));
	});
	return scored.slice(0, cappedLimit).map((entry) => entry.recommendation);
}

export async function searchVolunteerEventsSql(
	supabase,
	{
		query = '',
		city = '',
		state = '',
		limit = 6,
		affinityGroupIds = new Set(),
		now = new Date()
	} = {}
) {
	const parsedLoc = parseLocationInput({ city, state });
	const resolvedCity = parsedLoc?.city || '';
	const resolvedState = parsedLoc?.state || '';
	const stateCode = parsedLoc?.stateCode || normalizeUsStateCode(resolvedState);
	const stateName = parsedLoc?.stateName || getUsStateName(stateCode);
	const cappedLimit = Math.max(1, Math.min(Number(limit) || 6, MAX_RECOMMENDATIONS));
	const specificTerms = tokenizeSpecificSearchTerms(query, {
		city: resolvedCity,
		state: resolvedState,
		stateName
	});

	const volunteerFloor = new Date(now);
	volunteerFloor.setDate(volunteerFloor.getDate() - 3);

	const locationGroups =
		resolvedCity || resolvedState
			? await queryGroupsForLocation(supabase, {
					city: resolvedCity,
					state: resolvedState,
					limit: 120
				})
			: [];
	const groupMap = new Map(locationGroups.map((group) => [String(group.id), group]));
	const matchingGroupIds = locationGroups
		.map((group) => sanitizePostgrestTerm(group.id))
		.filter(Boolean)
		.slice(0, 80);

	let q = supabase
		.from('volunteer_events')
		.select(
			'id,slug,title,summary,description,event_start,location_name,location_address,host_group_id,event_type_slug'
		);
	if (typeof q.eq === 'function') {
		q = q.eq('status', 'published');
	}
	if (typeof q.gte === 'function') {
		q = q.gte('event_start', volunteerFloor.toISOString());
	}

	if (resolvedCity || resolvedState) {
		const locClauses = [];
		if (resolvedCity) {
			const cleanCity = sanitizePostgrestTerm(resolvedCity);
			if (cleanCity) {
				locClauses.push(`location_address.ilike.%${cleanCity}%`);
				locClauses.push(`location_name.ilike.%${cleanCity}%`);
			}
		}
		if (resolvedState) {
			const cleanStateName = sanitizePostgrestTerm(stateName || resolvedState);
			if (cleanStateName) {
				locClauses.push(`location_address.ilike.%${cleanStateName}%`);
			}
			if (stateCode) {
				locClauses.push(`location_address.ilike.% ${stateCode}%`);
			}
		}
		if (matchingGroupIds.length > 0) {
			locClauses.push(`host_group_id.in.(${matchingGroupIds.join(',')})`);
		}
		if (locClauses.length > 0 && typeof q.or === 'function') {
			q = q.or(locClauses.join(','));
		}
	} else if (specificTerms.length > 0) {
		const kwClauses = specificTerms.slice(0, 4).flatMap((term) => {
			const clean = sanitizePostgrestTerm(term);
			if (!clean) return [];
			return [
				`title.ilike.%${clean}%`,
				`summary.ilike.%${clean}%`,
				`description.ilike.%${clean}%`,
				`location_name.ilike.%${clean}%`,
				`location_address.ilike.%${clean}%`
			];
		});
		if (kwClauses.length > 0 && typeof q.or === 'function') {
			q = q.or(kwClauses.join(','));
		}
	}

	if (typeof q.order === 'function') {
		q = q.order('event_start', { ascending: true });
	}
	if (typeof q.limit === 'function') {
		q = q.limit(60);
	}

	const rawEvents = await safeSelect(q, 'search_volunteer_events');
	const events = rawEvents.map(normalizeVolunteerRow).filter((row) => row.id && row.slug);

	const unresolvedGroupIds = uniqStrings(
		events.map((row) => row.host_group_id).filter((id) => id && !groupMap.has(String(id))),
		60
	);
	if (unresolvedGroupIds.length > 0) {
		let hostQuery = supabase.from('groups').select('id,slug,name,city,state_region,country');
		if (typeof hostQuery.in === 'function') {
			hostQuery = hostQuery.in('id', unresolvedGroupIds);
		}
		const hostGroups = await safeSelect(hostQuery, 'volunteer host groups');
		for (const rawGroup of hostGroups) {
			const group = normalizeGroupRow(rawGroup);
			if (group.id) groupMap.set(String(group.id), group);
		}
	}

	const locationLabel = formatLocationLabel({ city: resolvedCity, state: resolvedState });
	const scored = [];
	for (const event of events) {
		const url = normalizeAssistantHref(`/volunteer/${event.slug}`);
		if (!url) continue;
		const hostGroup = groupMap.get(String(event.host_group_id)) || null;
		const addressText = [event.location_name, event.location_address].filter(Boolean).join(', ');
		const groupLocText = [hostGroup?.city, hostGroup?.state_region].filter(Boolean).join(', ');
		const combinedLocationText = [addressText, groupLocText].filter(Boolean).join(' · ');

		const stateMatched = resolvedState
			? matchesUsStateInText(addressText, resolvedState) ||
				matchesUsStateInText(hostGroup?.state_region || '', resolvedState) ||
				matchesUsStateInText(groupLocText, resolvedState)
			: false;
		const cityMatched = resolvedCity
			? matchesCityInText(addressText, resolvedCity) ||
				matchesCityInText(hostGroup?.city || '', resolvedCity)
			: false;

		if (resolvedState && !stateMatched && !cityMatched) continue;
		if (resolvedCity && !resolvedState && !cityMatched) continue;

		let score = 10;
		if (cityMatched) score += 26;
		if (stateMatched) score += 12;

		const blob = [
			event.title,
			event.summary,
			event.description,
			event.location_name,
			event.location_address,
			event.event_type_slug,
			hostGroup?.name
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase();

		for (const term of specificTerms) {
			if (blob.includes(term)) score += 6;
		}
		if (event.host_group_id && affinityGroupIds.has(String(event.host_group_id))) {
			score += 5;
		}

		let reason = 'Upcoming volunteer shift on 3 Feet Please.';
		if ((cityMatched || stateMatched) && locationLabel) {
			reason = `Volunteer event near ${locationLabel}.`;
		}

		scored.push({
			score,
			startAt: event.event_start || '',
			recommendation: {
				id: String(event.id),
				type: 'volunteer',
				title: event.title,
				subtitle: combinedLocationText || null,
				summary: event.summary || event.description || null,
				url,
				reason
			}
		});
	}

	scored.sort((a, b) => b.score - a.score || String(a.startAt).localeCompare(String(b.startAt)));
	return scored.slice(0, cappedLimit).map((entry) => entry.recommendation);
}

export async function searchGuidesSql(
	supabase,
	{
		query = '',
		city = '',
		state = '',
		limit = 4,
		locationHint = '',
		profileContext = {},
		historyTerms = [],
		feedbackEvents = [],
		userWeights = null
	} = {}
) {
	const cappedLimit = Math.max(1, Math.min(Number(limit) || 4, MAX_RECOMMENDATIONS));
	const parsedLoc = parseLocationInput({ city, state, raw: locationHint });
	const resolvedHint = parsedLoc?.label || locationHint || '';
	const retrieval = await buildHybridArticleCandidates({
		supabase,
		queryText: safeTrim(query) || 'cycling safety guide',
		profileContext: {
			location: resolvedHint,
			interests: profileContext?.interests || []
		},
		locationHint: resolvedHint,
		historyTerms,
		feedbackEvents,
		userWeights,
		limit: Math.max(cappedLimit * 2, 8)
	});

	const recommendations = [];
	for (const candidate of retrieval?.candidates || []) {
		const article = candidate?.article || {};
		if (isPlaceholderLearnArticle(article)) continue;
		const url = normalizeAssistantHref(article.slug ? `/learn/${article.slug}` : '');
		if (!url) continue;

		const features = normalizeObject(candidate?.features);
		let reason = 'Published guide in 3 Feet Please Learn.';
		if (Number(features.location) >= 0.35 && resolvedHint) {
			reason = `Relevant near ${resolvedHint}.`;
		} else if (Number(features.chunk_lexical) >= 0.45 && safeTrim(candidate?.best_chunk_heading)) {
			reason = `Matches the "${safeTrim(candidate.best_chunk_heading)}" section.`;
		} else if (safeTrim(article.content_type) && safeTrim(article.content_type) !== 'reference') {
			reason = `${safeTrim(article.content_type)} resource for your question.`;
		}

		recommendations.push({
			id: article.id ? String(article.id) : null,
			type: 'article',
			title: article.title,
			subtitle: article.category_name || null,
			summary: article.summary || null,
			url,
			reason,
			articleId: article.id ? String(article.id) : null,
			chunkId: candidate?.best_chunk_id || null,
			contentType: article.content_type || null
		});
		if (recommendations.length >= cappedLimit) break;
	}

	return {
		recommendations,
		intent: retrieval?.intent || inferArticleIntent(query),
		weights: retrieval?.weights || null
	};
}

export function inferDeterministicPlan(messages = []) {
	const latest = safeTrim(extractLatestUserMessage(messages));
	const lower = latest.toLowerCase();

	const classifySingleMessage = (msg) => {
		const text = safeTrim(msg).toLowerCase();
		if (!text) return null;

		if (
			/\b(road\s*id|roadid|in\s+case\s+bracelet|emergency\s+(?:qr|bracelet|wristband|id|contact\s+card))\b/.test(
				text
			)
		) {
			return { routeKey: 'roadid', searchTools: [] };
		}

		if (
			/\b(donate|donation|donations|contribute\s+money|give\s+money|tax[- ]deductible)\b/.test(text)
		) {
			return { routeKey: 'donate', searchTools: [] };
		}

		if (
			/\b(merch|merchandise|shirt|t-shirt|tee|jersey|apparel|gear\s+shop|swag|store)\b/.test(text)
		) {
			return { routeKey: 'merch', searchTools: [] };
		}

		const wantsAuthorOrCreate =
			/\b(post|create|start|host|publish|add|submit|list|share|make|write|draft|author|contribute)\b/.test(
				text
			);
		if (wantsAuthorOrCreate) {
			if (/\b(article|learn|guide|safety\s+guide|resource|blog|story)\b/.test(text)) {
				return { routeKey: 'learn_new', searchTools: [] };
			}
			if (/\b(ride|bike\s+ride|group\s+ride|route)\b/.test(text)) {
				return { routeKey: 'ride_new', searchTools: [] };
			}
			if (/\b(group|club|team|chapter)\b/.test(text)) {
				return { routeKey: 'groups_new', searchTools: [] };
			}
			if (
				/\b(volunteer|shift|event)\b/.test(text) &&
				/\b(host|create|post|start|add)\b/.test(text)
			) {
				return { routeKey: 'volunteer_new', searchTools: [] };
			}
		}

		if (
			/\b(get\s+involved|how\s+can\s+i\s+help|ways\s+to\s+help|advocacy\s+opportunities|join\s+the\s+board|partner\s+with)\b/.test(
				text
			)
		) {
			return { routeKey: 'get_involved', searchTools: [] };
		}

		const searches = [];
		if (
			/\b(group|groups|club|clubs|team|teams|chapter|chapters|organization|organizations)\b/.test(
				text
			)
		) {
			searches.push('search_groups');
		}
		if (/\b(ride|rides|riding|peloton|gravel|mtb|no-drop)\b/.test(text)) {
			searches.push('search_rides');
		}
		if (/\b(volunteer|volunteering|shift|shifts|help\s+out|bike\s+valet)\b/.test(text)) {
			searches.push('search_volunteer_events');
		}
		if (
			/\b(guide|guides|article|articles|learn|how\s+to|checklist|laws?|passing\s+law|safety\s+tips)\b/.test(
				text
			)
		) {
			searches.push('search_guides');
		}

		if (searches.length > 0) {
			const primaryRouteByTool = {
				search_groups: 'groups',
				search_rides: 'ride',
				search_volunteer_events: 'volunteer',
				search_guides: 'learn'
			};
			return {
				routeKey: primaryRouteByTool[searches[0]] || 'get_involved',
				searchTools: searches
			};
		}

		return null;
	};

	const directPlan = classifySingleMessage(latest);
	if (directPlan) return directPlan;

	// Multi-turn inheritance: if the latest message is a follow-up (e.g. "Phoenix, AZ"),
	// keep the active search/route intent from prior user turns!
	for (let index = messages.length - 2; index >= 0; index -= 1) {
		if (messages[index]?.role !== 'user') continue;
		const priorPlan = classifySingleMessage(messages[index].content);
		if (priorPlan) return priorPlan;
	}

	if (inferArticleIntent(latest) !== 'general') {
		return { routeKey: 'learn', searchTools: ['search_guides'] };
	}

	return {
		routeKey: 'get_involved',
		searchTools: []
	};
}

export function normalizeLearnedContext(raw) {
	const source = normalizeObject(raw);
	const location = safeTrim(source.location).slice(0, 120);
	const interests = uniqStrings(source.interests, 8).map((item) => item.slice(0, 40));
	const recommendationFocus = uniqStrings(source.recommendation_focus, 3)
		.map((item) => item.toLowerCase())
		.filter((item) => FOCUS_ALLOWED.has(item));
	if (!location && !interests.length && !recommendationFocus.length) return null;
	return {
		location: location || null,
		interests,
		recommendation_focus: recommendationFocus
	};
}

export function sanitizeAssistantReplyText(replyText, { navigationTarget = null } = {}) {
	let cleaned = safeTrim(replyText);
	if (!cleaned) return '';

	// Strip placeholder /learn/to-do references.
	cleaned = cleaned
		.replace(/\[([^\]]+)\]\((?:https?:\/\/[^)\s]*)?\/learn\/to-?do[^)\s]*\)/gi, '$1')
		.replace(/(?:https?:\/\/(?:www\.)?3fp\.org)?\/learn\/to-?do\b[^\s,.!?;)]*/gi, '/learn');

	// Prevent commercial Road iD hallucinations when referring to Road ID.
	if (/\broad\s*id\.com\b/i.test(cleaned) || /\bcommercial\s+road\s*id\b/i.test(cleaned)) {
		cleaned = cleaned.replace(
			/https?:\/\/(?:www\.)?roadid\.com[^\s)]*/gi,
			'https://3fp.org/roadid'
		);
	}
	if (
		navigationTarget?.url === '/roadid' &&
		/\broad\s*id\s+app\b/i.test(cleaned) &&
		!/3fp\.org\/roadid|\/roadid/i.test(cleaned)
	) {
		cleaned =
			'Set up or claim your 3 Feet Please emergency QR profile at [3fp.org/roadid](/roadid). Scan an In Case bracelet QR code to manage emergency contacts and medical info for first responders.';
	}

	return cleaned.replace(/\s{3,}/g, ' ').trim();
}

export function buildDeterministicReply({
	navigationTarget,
	recommendations = [],
	locationHint = '',
	latestUserMessage = ''
} = {}) {
	const routeUrl = navigationTarget?.url || '';

	if (routeUrl === '/roadid') {
		return {
			reply:
				'3 Feet Please includes a built-in **Road ID** emergency QR profile system at [3fp.org/roadid](/roadid). Scan your **In Case** silicone wristband to claim or update emergency contacts and medical details for first responders, or preview an example profile on `/roadid/3feetpls`.',
			follow_up_question: 'Want to open Road ID or look up cycling safety guides next?',
			learnedContext: null
		};
	}

	if (routeUrl === '/donate') {
		return {
			reply:
				'You can support safer streets and 3-foot passing advocacy directly at [3fp.org/donate](/donate). Donations can go to **3 Feet Please** or a participating local group with Stripe enabled.',
			follow_up_question: 'Would you also like to see volunteer events or ways to get involved?',
			learnedContext: null
		};
	}

	if (routeUrl === '/merch') {
		return {
			reply:
				'Browse official **3 Feet Please** cycling apparel and high-visibility gear in the shop at [3fp.org/merch](/merch).',
			follow_up_question: 'Looking for a specific item or local rides as well?',
			learnedContext: null
		};
	}

	if (routeUrl === '/learn/new') {
		return {
			reply:
				'You can write and publish a new safety guide or advocacy resource directly in the Learn editor at `/learn/new`.',
			follow_up_question: 'Want me to search existing safety guides on `/learn` before you start?',
			learnedContext: null
		};
	}

	if (
		(routeUrl === '/ride/new' || routeUrl === '/groups/new' || routeUrl === '/volunteer/new') &&
		recommendations.length === 0
	) {
		return {
			reply: `Head straight to \`${routeUrl}\` (${navigationTarget.label}) to fill out and publish your listing on **3 Feet Please**.`,
			follow_up_question: 'Need help finding existing groups or events in your city first?',
			learnedContext: null
		};
	}

	if (routeUrl === '/get-involved' && recommendations.length === 0) {
		return {
			reply:
				'Explore advocacy roles, community partnerships, volunteering, and posting options at [3fp.org/get-involved](/get-involved), or jump directly to `/volunteer` and `/donate`.',
			follow_up_question: 'What city and state are you connecting from?',
			learnedContext: null
		};
	}

	if (recommendations.length > 0) {
		const topLinks = recommendations
			.slice(0, 3)
			.map((rec) => `[${rec.title}](${rec.url})`)
			.join(', ');
		const locationClause = locationHint ? ` near **${locationHint}**` : '';
		const browseClause = navigationTarget
			? ` Open \`${navigationTarget.url}\` to browse more.`
			: '';
		return {
			reply: `Here ${recommendations.length === 1 ? 'is a match' : 'are top matches'}${locationClause}: ${topLinks}.${browseClause}`,
			follow_up_question: locationHint
				? 'Want to narrow by day, pace, or another nearby city?'
				: 'Share your city and state if you want local matches.',
			learnedContext: null
		};
	}

	if (routeUrl === '/ride' || routeUrl === '/groups' || routeUrl === '/volunteer') {
		const noun =
			routeUrl === '/groups'
				? 'cycling groups'
				: routeUrl === '/volunteer'
					? 'volunteer events'
					: 'upcoming rides';
		if (locationHint) {
			return {
				reply: `I didn't find published ${noun} matching **${locationHint}** right now. You can browse all listings or post one from \`${routeUrl}\`.`,
				follow_up_question: 'Want me to check a nearby city or statewide listings?',
				learnedContext: null
			};
		}
		return {
			reply: `Share your city and state (for example, **Phoenix, AZ** or **Madison, WI**) so I can search ${noun} near you, or browse all listings at \`${routeUrl}\`.`,
			follow_up_question: 'What city and state should I search?',
			learnedContext: null
		};
	}

	if (routeUrl === '/learn') {
		return {
			reply: `Browse published safety guides and cycling resources at [3fp.org/learn](/learn), or write a new guide at \`/learn/new\`.`,
			follow_up_question: safeTrim(latestUserMessage)
				? 'Want me to search rides or cycling groups in your area too?'
				: 'What cycling topic are you looking for?',
			learnedContext: null
		};
	}

	return {
		reply:
			'I can connect you with local rides (`/ride`), cycling groups (`/groups`), volunteer shifts (`/volunteer`), safety guides (`/learn`), emergency QR profiles (`/roadid`), merch (`/merch`), or donations (`/donate`).',
		follow_up_question: 'What city and state are you riding in, or which page do you need?',
		learnedContext: null
	};
}

async function resolveAssistantModel() {
	let aiModelsModule = null;
	try {
		aiModelsModule = await import('./ai/models.js');
	} catch {
		return null;
	}
	const { AI_CAPABILITIES, getAiModel } = aiModelsModule;
	try {
		const toolModel = getAiModel('tool_augmented_text');
		if (toolModel) return toolModel;
	} catch {
		// Fall through to structured_text check if overridden with unknown env
	}
	try {
		const fallback = getAiModel('structured_text');
		if (fallback && fallback.model?.capabilities?.includes(AI_CAPABILITIES.TOOL_USE)) {
			return fallback;
		}
	} catch {
		// Ignore unconfigured model error and rely on deterministic fallback
	}
	return null;
}

function buildAssistantSystemPrompt({ messages, profileContext, historyContext, turnLocation }) {
	const conversation = messages
		.map((entry) => `${entry.role === 'assistant' ? 'Assistant' : 'User'}: ${entry.content}`)
		.join('\n');

	const locationSummary = {
		active_location_hint: turnLocation.locationHint || null,
		chat_stated_location: turnLocation.chatLocation?.label || null,
		saved_profile_location: turnLocation.profileLocation?.label || null,
		request_geo_ip_location: turnLocation.geoLocation?.label || null
	};

	return `You are the 3 Feet Please (3fp.org) assistant helping visitors find rides, cycling groups, volunteer events, safety guides, and support tools in one clear step.

Built-in 3 Feet Please routes (ONLY link to real 3fp.org routes and tool results; NEVER mention /learn/to-do and NEVER claim Road ID is an external commercial Road iD app):
- /roadid (https://3fp.org/roadid): Built-in 3 Feet Please Road ID emergency QR profile system for In Case silicone wristbands. Riders scan a bracelet QR code to claim or update emergency contacts and medical info for first responders, view an example profile (/roadid/3feetpls), and read the crash checklist. (New physical wristband orders are temporarily paused while existing bracelets & profiles remain fully supported.)
- /donate (https://3fp.org/donate): Official online donation page supporting 3 Feet Please and participating local cycling groups.
- /volunteer (https://3fp.org/volunteer): Browse published volunteer events and shifts (/volunteer/new to host a volunteer event).
- /get-involved (https://3fp.org/get-involved): Advocacy roles, partnerships, board/volunteer interest form, and posting hub.
- /learn (https://3fp.org/learn): Cycling safety guides, 3-foot passing resources, and toolkits (/learn/new to write and publish a guide).
- /ride (https://3fp.org/ride): Upcoming published bike rides (/ride/new to post a ride).
- /groups (https://3fp.org/groups): Cycling clubs, advocacy groups, and local chapters (/groups/new to create a group).
- /merch (https://3fp.org/merch): Official 3 Feet Please cycling apparel and gear shop.
- /profile (https://3fp.org/profile): Rider profile and saved preferences.

Tool-calling rules:
1. Always call select_route when a destination page or creation form matches the user's goal (for example roadid, donate, volunteer, get_involved, learn, learn_new, ride, ride_new, groups, groups_new, merch).
2. For direct page or creation requests (Road ID, donating, merch, getting involved, writing a guide, posting a ride/group/volunteer event), call select_route WITHOUT running unnecessary listing searches.
3. For rides, groups, volunteer shifts, or safety guides, call the matching search tool (search_rides, search_groups, search_volunteer_events, or search_guides) AND select_route.
4. Maintain multi-turn context! If an earlier turn asked for rides/groups/volunteering and the latest turn supplies a city/state (such as "Phoenix, AZ"), search that entity type using city="Phoenix", state="AZ".
5. When the user says "near me" without naming a city, use active_location_hint (from saved_profile_location or request_geo_ip_location) if available; if none is available, ask for their city and state.

Location context:
${JSON.stringify(locationSummary, null, 2)}

Saved profile preferences:
${JSON.stringify(profileContext, null, 2)}

User activity summary:
${JSON.stringify(historyContext, null, 2)}

Conversation:
${conversation}`;
}

const FINAL_JSON_INSTRUCTIONS = `Return JSON with keys:
- reply (string, concise markdown up to 110 words using clean internal paths like /roadid, /donate, /groups/... or [Title](/path) links; mention top tool results when present; never invent listings, never mention commercial Road iD, and never output /learn/to-do)
- follow_up_question (string or null)
- learned_context (object with location, interests, recommendation_focus ONLY when explicitly stated by the user in chat messages; NEVER copy request_geo_ip_location into learned_context; use null if nothing explicit was stated).`;

function withDeadline(promise, timeoutMs, label = 'assistant timeout') {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		return Promise.reject(new Error(label));
	}
	let timer = null;
	const timeoutPromise = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(label)), timeoutMs);
	});
	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}

export async function runAssistantTurn({
	supabase,
	messages,
	user = null,
	userData = {},
	requestHeaders = null,
	aiModelOverride = undefined,
	turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
	now = new Date()
}) {
	const normalizedMessages = normalizeMessages(messages);
	const latestUserMessage = extractLatestUserMessage(normalizedMessages);

	const recommendationContext = userData.recommendationContext || {
		location: '',
		interests: [],
		recommendation_focus: []
	};
	const assistantMemory = userData.assistantMemory || {
		learned_location: '',
		learned_interests: [],
		recent_topics: []
	};

	const turnLocation = resolveTurnLocationContext({
		messages: normalizedMessages,
		recommendationContext,
		assistantMemory,
		requestHeaders
	});

	let activeLocationHint = turnLocation.locationHint;
	let chatGroundedLocation = turnLocation.chatLocation?.label || '';

	const affinityGroupIds = new Set((userData.historyGroupIds || []).map((id) => String(id)));
	const interestTerms = uniqStrings(
		[
			...(recommendationContext.interests || []),
			...(assistantMemory.learned_interests || []),
			...tokenize((assistantMemory.recent_topics || []).join(' '))
		],
		24
	).map((term) => term.toLowerCase());

	const historyTerms = uniqStrings(
		[
			...(userData.rideHistory || []).flatMap((entry) => tokenize(entry?.activity?.title || '')),
			...(userData.volunteerHistory || []).flatMap((entry) => tokenize(entry?.event?.title || '')),
			...(userData.groupNames || []).flatMap((name) => tokenize(name))
		],
		36
	);

	const historyContext = {
		ride_titles: (userData.rideHistory || [])
			.slice(0, 6)
			.map((entry) => entry?.activity?.title)
			.filter(Boolean),
		volunteer_titles: (userData.volunteerHistory || [])
			.slice(0, 6)
			.map((entry) => entry?.event?.title)
			.filter(Boolean),
		groups: (userData.groupNames || []).slice(0, 6),
		recommendation_focus: recommendationContext.recommendation_focus || [],
		interests: recommendationContext.interests || [],
		counts: {
			ride_rsvps: (userData.rideHistory || []).length,
			volunteer_signups: (userData.volunteerHistory || []).length,
			group_memberships: (userData.groupMemberships || []).length
		}
	};

	let selectedNavigationTarget = null;
	const collectedRecommendations = [];
	const invokedSearchTools = new Set();
	let guideSignals = {
		intent: inferArticleIntent(latestUserMessage),
		retrievalIntent: null,
		forceArticlePrimary: false,
		userWeights: null
	};

	const resolveSearchLocationArgs = (args = {}) => {
		const explicitParsed = parseLocationInput({
			city: args.city,
			state: args.state
		});
		if (explicitParsed) {
			if (explicitParsed.label) {
				activeLocationHint = explicitParsed.label;
				// Check whether the user stated this city/state in chat
				const chatText = normalizedMessages
					.filter((m) => m.role === 'user')
					.map((m) => m.content)
					.join(' ');
				if (
					(explicitParsed.city && matchesCityInText(chatText, explicitParsed.city)) ||
					(explicitParsed.state && matchesUsStateInText(chatText, explicitParsed.state))
				) {
					chatGroundedLocation = explicitParsed.label;
				}
			}
			return {
				city: explicitParsed.city,
				state: explicitParsed.state
			};
		}
		return {
			city: turnLocation.activeLocation?.city || '',
			state: turnLocation.activeLocation?.state || ''
		};
	};

	const pushRecommendations = (items = []) => {
		const seenUrls = new Set(collectedRecommendations.map((item) => item.url));
		for (const item of items) {
			if (!item?.url || !item?.title) continue;
			const safeUrl = normalizeAssistantHref(item.url);
			if (!safeUrl || seenUrls.has(safeUrl)) continue;
			seenUrls.add(safeUrl);
			collectedRecommendations.push({ ...item, url: safeUrl });
			if (collectedRecommendations.length >= MAX_RECOMMENDATIONS) break;
		}
	};

	const executeTool = async (toolCall) => {
		const name = safeTrim(toolCall?.name);
		const args = normalizeObject(toolCall?.args);

		if (name === 'select_route') {
			const target = resolveRouteTarget(args.route_key, { reason: args.reason });
			if (target) {
				selectedNavigationTarget = target;
				return { selected: target };
			}
			return { error: 'Unknown route_key.' };
		}

		if (name === 'search_rides') {
			invokedSearchTools.add('search_rides');
			const loc = resolveSearchLocationArgs(args);
			const items = await searchRidesSql(supabase, {
				query: safeTrim(args.query),
				city: loc.city,
				state: loc.state,
				limit: args.limit,
				affinityGroupIds,
				now
			});
			pushRecommendations(items);
			return {
				location_used: formatLocationLabel(loc) || null,
				count: items.length,
				rides: items.map((item) => ({
					title: item.title,
					subtitle: item.subtitle,
					url: item.url,
					reason: item.reason
				}))
			};
		}

		if (name === 'search_groups') {
			invokedSearchTools.add('search_groups');
			const loc = resolveSearchLocationArgs(args);
			const items = await searchGroupsSql(supabase, {
				query: safeTrim(args.query),
				city: loc.city,
				state: loc.state,
				limit: args.limit,
				affinityGroupIds
			});
			pushRecommendations(items);
			return {
				location_used: formatLocationLabel(loc) || null,
				count: items.length,
				groups: items.map((item) => ({
					title: item.title,
					subtitle: item.subtitle,
					url: item.url,
					reason: item.reason
				}))
			};
		}

		if (name === 'search_volunteer_events') {
			invokedSearchTools.add('search_volunteer_events');
			const loc = resolveSearchLocationArgs(args);
			const items = await searchVolunteerEventsSql(supabase, {
				query: safeTrim(args.query),
				city: loc.city,
				state: loc.state,
				limit: args.limit,
				affinityGroupIds,
				now
			});
			pushRecommendations(items);
			return {
				location_used: formatLocationLabel(loc) || null,
				count: items.length,
				volunteer_events: items.map((item) => ({
					title: item.title,
					subtitle: item.subtitle,
					url: item.url,
					reason: item.reason
				}))
			};
		}

		if (name === 'search_guides') {
			invokedSearchTools.add('search_guides');
			const loc = resolveSearchLocationArgs(args);
			const result = await searchGuidesSql(supabase, {
				query: safeTrim(args.query) || latestUserMessage,
				city: loc.city,
				state: loc.state,
				limit: args.limit,
				locationHint: activeLocationHint,
				profileContext: {
					location: activeLocationHint,
					interests: interestTerms
				},
				historyTerms,
				feedbackEvents: userData.feedbackEvents || [],
				userWeights: userData.articleUserWeights || null
			});
			guideSignals = {
				intent: guideSignals.intent,
				retrievalIntent: result.intent,
				forceArticlePrimary: true,
				userWeights: result.weights
			};
			pushRecommendations(result.recommendations);
			return {
				count: result.recommendations.length,
				guides: result.recommendations.map((item) => ({
					title: item.title,
					subtitle: item.subtitle,
					url: item.url,
					reason: item.reason
				}))
			};
		}

		return { error: `Unknown tool "${name}".` };
	};

	const executeFallbackToolsIfNeeded = async () => {
		const plan = inferDeterministicPlan(normalizedMessages);
		if (!selectedNavigationTarget && plan.routeKey) {
			selectedNavigationTarget = resolveRouteTarget(plan.routeKey);
		}
		if (invokedSearchTools.size === 0 && plan.searchTools.length > 0) {
			const asksNearMeWithoutLocation =
				!turnLocation.activeLocation &&
				/\b(near\s+me|nearby|around\s+me|around\s+here|in\s+my\s+area|my\s+city)\b/i.test(
					latestUserMessage
				);
			const toolsToRun = asksNearMeWithoutLocation
				? plan.searchTools.filter((toolName) => toolName === 'search_guides')
				: plan.searchTools;
			await Promise.all(
				toolsToRun.map((toolName) =>
					executeTool({
						name: toolName,
						args: {
							query: latestUserMessage,
							city: turnLocation.activeLocation?.city || null,
							state: turnLocation.activeLocation?.state || null,
							limit: 4
						}
					})
				)
			);
		}
	};

	const ensureNavigationTargetFromSearch = () => {
		if (selectedNavigationTarget) return;
		if (invokedSearchTools.has('search_groups')) {
			selectedNavigationTarget = resolveRouteTarget('groups');
		} else if (invokedSearchTools.has('search_rides')) {
			selectedNavigationTarget = resolveRouteTarget('ride');
		} else if (invokedSearchTools.has('search_volunteer_events')) {
			selectedNavigationTarget = resolveRouteTarget('volunteer');
		} else if (invokedSearchTools.has('search_guides')) {
			selectedNavigationTarget = resolveRouteTarget('learn');
		} else {
			const plan = inferDeterministicPlan(normalizedMessages);
			if (plan?.routeKey) {
				selectedNavigationTarget = resolveRouteTarget(plan.routeKey);
			}
		}
	};

	const resolvedAi =
		aiModelOverride !== undefined ? aiModelOverride : await resolveAssistantModel();

	let replyText = '';
	let followUpQuestion = null;
	let learnedContext = null;

	if (resolvedAi?.client && resolvedAi?.model) {
		const abortController = new AbortController();
		const prompt = buildAssistantSystemPrompt({
			messages: normalizedMessages,
			profileContext: recommendationContext,
			historyContext,
			turnLocation
		});

		const runAi = async (useSchema = true) =>
			runBoundedToolLoop({
				client: resolvedAi.client,
				model: resolvedAi.model,
				prompt: `${prompt}\n\n${FINAL_JSON_INSTRUCTIONS}`,
				tools: ASSISTANT_TOOLS,
				executeTool,
				maxToolRounds: 1,
				maxCallsPerRound: 4,
				reasoningEffort: 'low',
				responseMimeType: 'application/json',
				responseSchema: useSchema ? CHAT_RESPONSE_SCHEMA : null,
				schemaName: 'assistant_turn_response',
				finalInstructions: FINAL_JSON_INSTRUCTIONS,
				signal: abortController.signal
			});

		try {
			let aiResult;
			try {
				aiResult = await withDeadline(runAi(true), turnTimeoutMs, 'Assistant AI turn timed out.');
			} catch (error) {
				if (isSchemaUnsupportedError(error)) {
					aiResult = await withDeadline(
						runAi(false),
						Math.max(1500, Math.floor(turnTimeoutMs * 0.6)),
						'Assistant AI schema fallback timed out.'
					);
				} else {
					throw error;
				}
			}

			// If the model returned direct text in 1 round without calling tools, ensure matching action button / search
			if ((aiResult?.toolCalls?.length || 0) === 0) {
				await executeFallbackToolsIfNeeded();
			} else {
				ensureNavigationTargetFromSearch();
			}

			const parsed = safeParseJson(aiResult?.text ?? '');
			replyText = safeTrim(parsed?.reply || aiResult?.text || '');
			followUpQuestion = safeTrim(parsed?.follow_up_question) || null;
			learnedContext = normalizeLearnedContext(parsed?.learned_context);
		} catch (error) {
			abortController.abort();
			console.warn(
				'assistant tool turn fell back to deterministic response',
				error?.message || error
			);
			await executeFallbackToolsIfNeeded();
			ensureNavigationTargetFromSearch();
		}
	} else {
		await executeFallbackToolsIfNeeded();
		ensureNavigationTargetFromSearch();
	}

	const finalRecommendations = collectedRecommendations
		.filter((rec) => rec && rec.url && !/^\/learn\/to-?do(?:[/?#]|$)/i.test(rec.url))
		.slice(0, MAX_RECOMMENDATIONS);

	const finalNavigationTarget = normalizeNavigationTarget(selectedNavigationTarget);

	if (!replyText) {
		const deterministic = buildDeterministicReply({
			navigationTarget: finalNavigationTarget,
			recommendations: finalRecommendations,
			locationHint: activeLocationHint,
			latestUserMessage
		});
		replyText = deterministic.reply;
		followUpQuestion = deterministic.follow_up_question;
	}

	replyText = sanitizeAssistantReplyText(replyText, {
		navigationTarget: finalNavigationTarget
	});

	// Enforce Constraint 5: Never persist request geo-IP location unless an authenticated user stated a location in chat.
	let sanitizedLearnedContext = learnedContext;
	if (sanitizedLearnedContext?.location) {
		const candidateLoc = safeTrim(sanitizedLearnedContext.location);
		const userChatBlob = normalizedMessages
			.filter((m) => m.role === 'user')
			.map((m) => m.content)
			.join(' ');
		const parsedCandidate = parseLocationInput({ raw: candidateLoc });
		const statedInChat =
			Boolean(chatGroundedLocation) ||
			(parsedCandidate?.city && matchesCityInText(userChatBlob, parsedCandidate.city)) ||
			(parsedCandidate?.state && matchesUsStateInText(userChatBlob, parsedCandidate.state)) ||
			userChatBlob.toLowerCase().includes(candidateLoc.toLowerCase());

		if (!statedInChat) {
			sanitizedLearnedContext = normalizeLearnedContext({
				...sanitizedLearnedContext,
				location: null
			});
		}
	} else if (chatGroundedLocation && user?.id) {
		sanitizedLearnedContext = normalizeLearnedContext({
			...(sanitizedLearnedContext || {}),
			location: chatGroundedLocation
		});
	}

	return {
		reply: replyText,
		followUpQuestion,
		recommendations: finalRecommendations,
		navigationTarget: finalNavigationTarget,
		learnedContext: sanitizedLearnedContext,
		chatGroundedLocation: chatGroundedLocation || null,
		context: {
			locationHint: activeLocationHint || null,
			locationSource: chatGroundedLocation ? 'chat' : turnLocation.activeLocation?.source || null,
			articleSignals: guideSignals,
			profileSignals: {
				interests: recommendationContext.interests || [],
				recommendationFocus: recommendationContext.recommendation_focus || []
			},
			historySignals: historyContext.counts
		},
		historyContext
	};
}

export async function persistLearnedAssistantContext({
	supabase,
	user,
	profile,
	recommendationContext,
	assistantMemory,
	learnedContext,
	chatStatedLocation = '',
	latestUserMessage,
	navigationTarget,
	historyContext
}) {
	if (!user?.id) return;
	if (!learnedContext && !chatStatedLocation && !latestUserMessage) return;

	const existingMetadata = normalizeObject(profile?.metadata);
	const existingRecommendation = normalizeObject(existingMetadata.recommendation_context);
	const existingAssistant = normalizeObject(existingMetadata.ai_assistant);

	const mergedInterests = uniqStrings(
		[
			...(recommendationContext?.interests || []),
			...(assistantMemory?.learned_interests || []),
			...(learnedContext?.interests || []),
			...(existingRecommendation.interests || []),
			...(existingAssistant.learned_interests || [])
		],
		12
	);
	const mergedFocus = uniqStrings(
		[
			...(recommendationContext?.recommendation_focus || []),
			...(learnedContext?.recommendation_focus || []),
			...(existingRecommendation.recommendation_focus || [])
		],
		3
	)
		.map((value) => value.toLowerCase())
		.filter((value) => FOCUS_ALLOWED.has(value));

	// Only persist locations stated in chat by the authenticated user or already saved on the profile.
	// Request geo-IP locations are strictly excluded.
	const persistedLocation =
		safeTrim(chatStatedLocation) ||
		safeTrim(learnedContext?.location) ||
		safeTrim(recommendationContext?.location) ||
		safeTrim(assistantMemory?.learned_location) ||
		safeTrim(existingRecommendation.location) ||
		safeTrim(existingAssistant.learned_location);

	const nextRecommendation = {
		...existingRecommendation,
		location: persistedLocation || null,
		interests: mergedInterests,
		recommendation_focus: mergedFocus,
		updated_at: new Date().toISOString()
	};

	const nextAssistant = {
		...existingAssistant,
		learned_location: persistedLocation || null,
		learned_interests: mergedInterests,
		recent_topics: uniqStrings(
			[
				...(existingAssistant.recent_topics || []),
				...tokenize(latestUserMessage).slice(0, 8),
				...(historyContext?.assistant_topics || [])
			],
			18
		),
		last_navigation_url: navigationTarget?.url || existingAssistant.last_navigation_url || null,
		last_user_message: safeTrim(latestUserMessage).slice(0, 240),
		last_message_at: new Date().toISOString()
	};

	const nextMetadata = {
		...existingMetadata,
		recommendation_context: nextRecommendation,
		ai_assistant: nextAssistant
	};

	if (profile?.id) {
		const { error } = await supabase
			.from('profiles')
			.update({ metadata: nextMetadata })
			.eq('id', profile.id)
			.eq('user_id', user.id);
		if (error) console.warn('assistant context update failed', error);
		return;
	}

	const { error } = await supabase.from('profiles').upsert(
		{
			user_id: user.id,
			metadata: nextMetadata
		},
		{ onConflict: 'user_id' }
	);
	if (error) console.warn('assistant context upsert failed', error);
}
