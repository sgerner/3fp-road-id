import assert from 'node:assert/strict';
import test from 'node:test';
import {
	ASSISTANT_TOOLS,
	persistLearnedAssistantContext,
	runAssistantTurn,
	searchRidesSql,
	searchVolunteerEventsSql
} from './assistantCore.js';
import { isPlaceholderLearnArticle } from './learnRecommendations.js';
import {
	normalizeAssistantHref,
	normalizeNavigationTarget,
	renderAssistantMessageHtml
} from '../ai/assistantMessage.js';

function parseIlikePattern(pattern) {
	const clean = String(pattern || '')
		.replace(/^%+|%+$/g, '')
		.toLowerCase();
	const exact = !String(pattern || '').includes('%');
	return { clean, exact };
}

function matchesSingleClause(row, clause) {
	const inMatch = clause.match(/^([a-z0-9_]+)\.in\.\(([^)]*)\)$/i);
	if (inMatch) {
		const [, col, listRaw] = inMatch;
		const allowed = listRaw
			.split(',')
			.map((v) => v.trim())
			.filter(Boolean);
		return allowed.includes(String(row?.[col] ?? ''));
	}

	const ilikeMatch = clause.match(/^([a-z0-9_]+)\.ilike\.(.+)$/i);
	if (ilikeMatch) {
		const [, col, rawPat] = ilikeMatch;
		const cell = String(row?.[col] ?? '').toLowerCase();
		const { clean, exact } = parseIlikePattern(rawPat);
		if (!clean) return true;
		return exact ? cell === clean : cell.includes(clean);
	}

	const eqMatch = clause.match(/^([a-z0-9_]+)\.eq\.(.+)$/i);
	if (eqMatch) {
		const [, col, val] = eqMatch;
		return String(row?.[col] ?? '') === val;
	}

	return true;
}

function createMockSupabase(fixtures = {}) {
	const tables = {
		groups: fixtures.groups || [],
		activity_events: fixtures.activity_events || [],
		volunteer_events: fixtures.volunteer_events || [],
		learn_articles: fixtures.learn_articles || [],
		learn_article_chunks: fixtures.learn_article_chunks || [],
		profiles: fixtures.profiles || []
	};
	const writes = {
		profileUpdates: [],
		profileUpserts: []
	};
	const queryLog = [];

	function buildQuery(tableName) {
		const state = {
			table: tableName,
			filters: [],
			orGroups: [],
			orderCol: null,
			orderAsc: true,
			limitCount: null
		};
		queryLog.push(state);

		const evaluate = () => {
			let rows = [...(tables[tableName] || [])];
			for (const fn of state.filters) {
				rows = rows.filter(fn);
			}
			for (const orExpr of state.orGroups) {
				const clauses = String(orExpr)
					.split(',')
					.map((c) => c.trim())
					.filter(Boolean);
				if (clauses.length > 0) {
					rows = rows.filter((row) => clauses.some((clause) => matchesSingleClause(row, clause)));
				}
			}
			if (state.orderCol) {
				const col = state.orderCol;
				const dir = state.orderAsc ? 1 : -1;
				rows.sort((a, b) => String(a?.[col] ?? '').localeCompare(String(b?.[col] ?? '')) * dir);
			}
			if (Number.isFinite(state.limitCount)) {
				rows = rows.slice(0, state.limitCount);
			}
			return rows;
		};

		const builder = {
			select() {
				return builder;
			},
			eq(col, val) {
				state.filters.push((row) => row?.[col] === val);
				return builder;
			},
			neq(col, val) {
				state.filters.push((row) => row?.[col] !== val);
				return builder;
			},
			gte(col, val) {
				state.filters.push((row) => String(row?.[col] ?? '') >= String(val));
				return builder;
			},
			in(col, values) {
				const set = new Set((values || []).map((v) => String(v)));
				state.filters.push((row) => set.has(String(row?.[col] ?? '')));
				return builder;
			},
			or(expr) {
				state.orGroups.push(expr);
				return builder;
			},
			order(col, { ascending = true } = {}) {
				state.orderCol = col;
				state.orderAsc = ascending;
				return builder;
			},
			limit(n) {
				state.limitCount = n;
				return builder;
			},
			maybeSingle() {
				const rows = evaluate();
				return Promise.resolve({ data: rows[0] || null, error: null });
			},
			update(payload) {
				return {
					eq(col1, val1) {
						return {
							eq(col2, val2) {
								writes.profileUpdates.push({ payload, [col1]: val1, [col2]: val2 });
								return Promise.resolve({ data: null, error: null });
							}
						};
					}
				};
			},
			upsert(payload, options) {
				writes.profileUpserts.push({ payload, options });
				return Promise.resolve({ data: null, error: null });
			},
			then(onFulfilled, onRejected) {
				return Promise.resolve({ data: evaluate(), error: null }).then(onFulfilled, onRejected);
			}
		};

		return builder;
	}

	return {
		from(tableName) {
			return buildQuery(tableName);
		},
		writes,
		queryLog
	};
}

const SAMPLE_FIXTURES = {
	groups: [
		{
			id: 'grp-madison',
			slug: 'madison-bikes-inc-madison-wi',
			name: 'Madison Bikes, Inc.',
			tagline: 'Making biking better in Madison for everyone.',
			description: 'Community bicycle advocacy organization in Madison, Wisconsin.',
			city: 'Madison',
			state_region: 'WI',
			country: 'US',
			is_published: true
		},
		{
			id: 'grp-phx',
			slug: 'phoenix-spokes-people',
			name: 'Phoenix Spokes People',
			tagline: 'Everyday biking in Phoenix.',
			description: 'Advocacy and social rides across central Phoenix.',
			city: 'Phoenix',
			state_region: 'Arizona',
			country: 'US',
			is_published: true
		},
		{
			id: 'grp-tucson',
			slug: 'tucson-velo-club',
			name: 'Tucson Velo Club',
			tagline: 'Southern Arizona road riders.',
			description: 'Weekly rides in Tucson.',
			city: 'Tucson',
			state_region: 'AZ',
			country: 'US',
			is_published: true
		},
		{
			id: 'grp-austin',
			slug: 'austin-yellow-bike',
			name: 'Austin Yellow Bike Project',
			tagline: 'Community bike shop in Texas.',
			description: 'Austin cycling hub.',
			city: 'Austin',
			state_region: 'TX',
			country: 'US',
			is_published: true
		}
	],
	activity_events: [
		{
			id: 'ride-tucson-1',
			slug: 'mount-lemmon-climb',
			title: 'Mount Lemmon Dawn Climb',
			summary: 'Early climb in Tucson.',
			description: 'Road climb.',
			activity_type: 'ride',
			status: 'published',
			start_location_name: 'Le Buzz Caffe',
			start_location_address: '8969 E Tanque Verde Rd, Tucson, AZ 85749',
			next_occurrence_start: '2026-11-25T14:00:00Z',
			host_group_id: 'grp-tucson'
		},
		{
			id: 'ride-phx-1',
			slug: 'downtown-phoenix-social-roll',
			title: 'Downtown Phoenix Social Roll',
			summary: 'Casual evening group ride through Phoenix.',
			description: 'No-drop social ride.',
			activity_type: 'ride',
			status: 'published',
			start_location_name: 'Civic Space Park',
			start_location_address: '424 N Central Ave, Phoenix, AZ 85004',
			next_occurrence_start: '2026-11-28T02:00:00Z',
			host_group_id: 'grp-phx'
		},
		{
			id: 'ride-austin-1',
			slug: 'austin-shoal-creek-cruise',
			title: 'Austin Shoal Creek Cruise',
			summary: 'Texas loop.',
			description: 'Cruiser ride.',
			activity_type: 'ride',
			status: 'published',
			start_location_name: 'Pease Park',
			start_location_address: '1100 Kingsbury St, Austin, TX 78703',
			next_occurrence_start: '2026-11-23T15:00:00Z',
			host_group_id: 'grp-austin'
		}
	],
	volunteer_events: [
		{
			id: 'vol-phx-1',
			slug: 'phoenix-bike-valet',
			title: 'Downtown Phoenix Bike Valet',
			summary: 'Park bikes safely at the market.',
			description: 'Volunteer shift.',
			status: 'published',
			event_start: '2026-11-29T16:00:00Z',
			location_name: 'Downtown Farmers Market',
			location_address: '720 N 5th St, Phoenix, AZ 85004',
			host_group_id: 'grp-phx',
			event_type_slug: 'bike-valet'
		}
	],
	learn_articles: [
		{
			id: 'art-todo',
			slug: 'to-do',
			title: 'To Do',
			summary: 'Placeholder article.',
			category_name: 'General',
			content_type: 'reference',
			is_published: true,
			updated_at: '2026-11-20T00:00:00Z'
		},
		{
			id: 'art-safety-1',
			slug: 'three-foot-passing-safety-guide',
			title: '3-Foot Safe Passing & Lane Positioning Guide',
			summary: 'Practical lane positioning and crash-response steps for cyclists.',
			category_name: 'Safety',
			content_type: 'safety',
			geo_scope: 'global',
			is_published: true,
			is_evergreen: true,
			metadata_confidence: 0.9,
			updated_at: '2026-11-18T00:00:00Z'
		}
	]
};

test('route selection covers Road ID, donate, volunteer, get-involved, learn, learn/new, ride, groups, and merch without unnecessary searches', async () => {
	const cases = [
		{ message: 'How do I set up Road ID for my emergency bracelet?', expectedUrl: '/roadid' },
		{ message: 'Where can I donate to 3 Feet Please?', expectedUrl: '/donate' },
		{ message: 'How can I get involved with advocacy?', expectedUrl: '/get-involved' },
		{ message: 'I want to write a safety guide', expectedUrl: '/learn/new' },
		{ message: 'Do you sell 3 Feet Please jerseys or merch?', expectedUrl: '/merch' },
		{ message: 'I want to post a group ride', expectedUrl: '/ride/new' }
	];

	for (const { message, expectedUrl } of cases) {
		const supabase = createMockSupabase(SAMPLE_FIXTURES);
		const result = await runAssistantTurn({
			supabase,
			messages: [{ role: 'user', content: message }],
			aiModelOverride: null,
			now: new Date('2026-11-22T00:00:00Z')
		});

		assert.ok(result.navigationTarget, `Expected navigationTarget for "${message}"`);
		assert.equal(result.navigationTarget.url, expectedUrl);
		// Direct route & form requests should not eagerly query listings tables
		assert.equal(
			supabase.queryLog.length,
			0,
			`Expected zero listing SQL queries for direct route "${message}"`
		);
		assert.ok(!result.reply.includes('/learn/to-do'));
	}

	// Search-backed destinations also return their matching action buttons
	const searchCases = [
		{ message: 'Show volunteer shifts in Phoenix, AZ', expectedUrl: '/volunteer' },
		{ message: 'Do you have cycling safety guides?', expectedUrl: '/learn' },
		{ message: 'Find bike rides in Phoenix, AZ', expectedUrl: '/ride' },
		{ message: 'Where do cycling groups meet in Madison, WI?', expectedUrl: '/groups' }
	];

	for (const { message, expectedUrl } of searchCases) {
		const supabase = createMockSupabase(SAMPLE_FIXTURES);
		const result = await runAssistantTurn({
			supabase,
			messages: [{ role: 'user', content: message }],
			aiModelOverride: null,
			now: new Date('2026-11-22T00:00:00Z')
		});
		assert.equal(result.navigationTarget?.url, expectedUrl);
	}
});

test('Road ID and donation replies describe 3fp.org/roadid and 3fp.org/donate, omit commercial Road iD hallucinations, and exclude /learn/to-do', async () => {
	assert.equal(isPlaceholderLearnArticle({ slug: 'to-do', title: 'Safety Guide' }), true);
	assert.equal(
		isPlaceholderLearnArticle({ slug: 'three-foot-passing', title: '3-Foot Passing' }),
		false
	);

	const supabase = createMockSupabase(SAMPLE_FIXTURES);

	const roadIdTurn = await runAssistantTurn({
		supabase,
		messages: [{ role: 'user', content: 'Tell me about Road ID on 3 Feet Please' }],
		aiModelOverride: {
			model: { provider: 'openai', model: 'gpt-6-luna' },
			client: {
				async generateContent({ config }) {
					assert.equal(config.reasoningEffort, 'low');
					if (config.tools) {
						return {
							text: '',
							toolCalls: [
								{
									id: 'call_route',
									callId: 'call_route',
									name: 'select_route',
									args: { route_key: 'roadid', reason: null }
								},
								{
									id: 'call_guides',
									callId: 'call_guides',
									name: 'search_guides',
									args: { query: 'safety', city: null, state: null, limit: 4 }
								}
							]
						};
					}
					return {
						text: JSON.stringify({
							reply:
								'Set up your built-in emergency QR profile at [3fp.org/roadid](/roadid) for your In Case wristband.',
							follow_up_question: null,
							learned_context: null
						}),
						toolCalls: []
					};
				}
			}
		},
		now: new Date('2026-11-22T00:00:00Z')
	});

	assert.equal(roadIdTurn.navigationTarget?.url, '/roadid');
	assert.match(roadIdTurn.reply, /3fp\.org\/roadid|\/roadid/i);
	assert.doesNotMatch(roadIdTurn.reply, /roadid\.com|road id app/i);
	assert.ok(roadIdTurn.recommendations.every((rec) => rec.url !== '/learn/to-do'));

	const donateTurn = await runAssistantTurn({
		supabase,
		messages: [{ role: 'user', content: 'How can I donate?' }],
		aiModelOverride: null,
		now: new Date('2026-11-22T00:00:00Z')
	});
	assert.equal(donateTurn.navigationTarget?.url, '/donate');
	assert.match(donateTurn.reply, /3fp\.org\/donate|\/donate/i);
	assert.ok(donateTurn.recommendations.every((rec) => rec.url !== '/learn/to-do'));
});

test('two-turn guest ride search checks geo-IP on turn 1, then searches and ranks Phoenix, AZ rides first on turn 2', async () => {
	const supabase = createMockSupabase(SAMPLE_FIXTURES);
	const turn1Headers = new Headers({
		'x-vercel-ip-city': 'Tucson',
		'x-vercel-ip-country-region': 'AZ',
		'x-vercel-ip-country': 'US'
	});

	// Turn 1: Guest asks for rides near them -> uses geo-IP header (Tucson, AZ)
	const turn1 = await runAssistantTurn({
		supabase,
		messages: [{ role: 'user', content: 'Find bike rides near me' }],
		requestHeaders: turn1Headers,
		aiModelOverride: null,
		now: new Date('2026-11-22T00:00:00Z')
	});

	assert.equal(turn1.context.locationHint, 'Tucson, AZ');
	assert.equal(turn1.context.locationSource, 'geo_ip');
	assert.equal(turn1.navigationTarget?.url, '/ride');
	assert.equal(turn1.recommendations[0]?.url, '/ride/mount-lemmon-climb');
	assert.ok(turn1.recommendations.every((rec) => !rec.url.includes('austin')));

	// Turn 2: Guest replies "Phoenix, AZ" -> keeps ride context, updates locationHint, ranks Phoenix rides first
	const turn2 = await runAssistantTurn({
		supabase,
		messages: [
			{ role: 'user', content: 'Find bike rides near me' },
			{ role: 'assistant', content: turn1.reply },
			{ role: 'user', content: 'Phoenix, AZ' }
		],
		requestHeaders: turn1Headers,
		aiModelOverride: null,
		now: new Date('2026-11-22T00:00:00Z')
	});

	assert.equal(turn2.context.locationHint, 'Phoenix, AZ');
	assert.equal(turn2.context.locationSource, 'chat');
	assert.equal(turn2.navigationTarget?.url, '/ride');
	assert.ok(turn2.recommendations.length >= 1);
	assert.equal(turn2.recommendations[0].url, '/ride/downtown-phoenix-social-roll');
	assert.ok(
		turn2.recommendations.every((rec) => rec.url !== '/ride/austin-shoal-creek-cruise'),
		'Expected out-of-state Texas rides to be excluded'
	);

	// Also verify when geo-IP headers are absent on turn 1: prompts for city/state without out-of-state rides, then resolves Phoenix on turn 2
	const noGeoTurn1 = await runAssistantTurn({
		supabase,
		messages: [{ role: 'user', content: 'Find bike rides near me' }],
		requestHeaders: new Headers(),
		aiModelOverride: null,
		now: new Date('2026-11-22T00:00:00Z')
	});
	assert.equal(noGeoTurn1.context.locationHint, null);
	assert.equal(noGeoTurn1.navigationTarget?.url, '/ride');
	assert.equal(noGeoTurn1.recommendations.length, 0);

	const noGeoTurn2 = await runAssistantTurn({
		supabase,
		messages: [
			{ role: 'user', content: 'Find bike rides near me' },
			{ role: 'assistant', content: noGeoTurn1.reply },
			{ role: 'user', content: 'Phoenix, AZ' }
		],
		requestHeaders: new Headers(),
		aiModelOverride: null,
		now: new Date('2026-11-22T00:00:00Z')
	});
	assert.equal(noGeoTurn2.context.locationHint, 'Phoenix, AZ');
	assert.equal(noGeoTurn2.recommendations[0]?.url, '/ride/downtown-phoenix-social-roll');
});

test('ride and volunteer searches reject same-city results in a different requested state', async () => {
	const supabase = createMockSupabase({
		groups: [
			{
				id: 'grp-phoenix-tx',
				slug: 'phoenix-tx-cycling',
				name: 'Phoenix Texas Cycling',
				city: 'Phoenix',
				state_region: 'TX',
				country: 'US',
				is_published: true
			}
		],
		activity_events: [
			{
				id: 'ride-phoenix-tx',
				slug: 'phoenix-texas-ride',
				title: 'Phoenix Texas Ride',
				activity_type: 'ride',
				status: 'published',
				start_location_name: 'Phoenix Park',
				start_location_address: 'Phoenix, TX',
				next_occurrence_start: '2026-11-24T18:00:00Z',
				host_group_id: 'grp-phoenix-tx'
			}
		],
		volunteer_events: [
			{
				id: 'volunteer-phoenix-tx',
				slug: 'phoenix-texas-volunteer',
				title: 'Phoenix Texas Bike Valet',
				status: 'published',
				event_start: '2026-11-24T18:00:00Z',
				location_name: 'Phoenix Park',
				location_address: 'Phoenix, TX',
				host_group_id: 'grp-phoenix-tx'
			}
		]
	});
	const location = { city: 'Phoenix', state: 'AZ', now: new Date('2026-11-22T00:00:00Z') };

	assert.deepEqual(await searchRidesSql(supabase, location), []);
	assert.deepEqual(await searchVolunteerEventsSql(supabase, location), []);
});

test('group search in Madison, WI returns Madison Bikes, Inc. and /groups action button without out-of-state rides', async () => {
	const supabase = createMockSupabase(SAMPLE_FIXTURES);
	let toolRoundCalls = 0;

	const result = await runAssistantTurn({
		supabase,
		messages: [{ role: 'user', content: 'Where do cycling groups meet in Madison, WI?' }],
		aiModelOverride: {
			model: { provider: 'google', model: 'gemini-2.5-flash' },
			client: {
				async generateContent({ config }) {
					toolRoundCalls += 1;
					assert.equal(config.reasoningEffort, 'low');
					if (config.tools) {
						assert.equal(config.tools.length, ASSISTANT_TOOLS.length);
						return {
							text: '',
							toolCalls: [
								{
									id: 'g_1',
									callId: 'g_1',
									name: 'search_groups',
									args: {
										query: 'cycling groups',
										city: 'Madison',
										state: 'Wisconsin',
										limit: 4
									}
								},
								{
									id: 'g_2',
									callId: 'g_2',
									name: 'select_route',
									args: { route_key: 'groups', reason: null }
								}
							]
						};
					}
					return {
						text: JSON.stringify({
							reply:
								'Check out **[Madison Bikes, Inc.](/groups/madison-bikes-inc-madison-wi)** in Madison, WI, or browse more clubs at `/groups`.',
							follow_up_question: 'Want to look for upcoming rides near Madison as well?',
							learned_context: {
								location: 'Madison, WI',
								interests: ['cycling groups'],
								recommendation_focus: ['groups']
							}
						}),
						toolCalls: []
					};
				}
			}
		},
		now: new Date('2026-11-22T00:00:00Z')
	});

	assert.equal(toolRoundCalls, 2, 'Expected exactly 1 tool round + 1 synthesis reply round');
	assert.equal(result.navigationTarget?.url, '/groups');
	assert.equal(result.recommendations.length, 1);
	assert.equal(result.recommendations[0].title, 'Madison Bikes, Inc.');
	assert.equal(result.recommendations[0].url, '/groups/madison-bikes-inc-madison-wi');
	assert.ok(result.recommendations.every((rec) => rec.type === 'group'));
});

test('request geo-IP locations are not persisted to user profiles unless stated in chat', async () => {
	const supabase = createMockSupabase(SAMPLE_FIXTURES);
	const user = { id: 'user-123', email: 'rider@example.com' };
	const geoHeaders = new Headers({
		'cf-ipcity': 'Tucson',
		'cf-region-code': 'AZ',
		'cf-ipcountry': 'US'
	});

	// Turn without explicit chat location -> geo-IP populates locationHint, NOT persisted
	const geoOnlyTurn = await runAssistantTurn({
		supabase,
		user,
		messages: [{ role: 'user', content: 'Find bike rides near me' }],
		requestHeaders: geoHeaders,
		aiModelOverride: {
			model: { provider: 'openai', model: 'gpt-6-luna' },
			client: {
				async generateContent({ config }) {
					if (config.tools) return { text: '', toolCalls: [] };
					// Simulate model mistakenly echoing geo-IP into learned_context.location
					return {
						text: JSON.stringify({
							reply: 'Here are rides near Tucson.',
							follow_up_question: null,
							learned_context: {
								location: 'Tucson, AZ',
								interests: [],
								recommendation_focus: ['rides']
							}
						}),
						toolCalls: []
					};
				}
			}
		},
		now: new Date('2026-11-22T00:00:00Z')
	});

	assert.equal(geoOnlyTurn.context.locationHint, 'Tucson, AZ');
	assert.equal(geoOnlyTurn.learnedContext?.location ?? null, null);

	await persistLearnedAssistantContext({
		supabase,
		user,
		profile: { id: 'prof-1', user_id: user.id, metadata: {} },
		recommendationContext: { location: '', interests: [], recommendation_focus: [] },
		assistantMemory: { learned_location: '', learned_interests: [], recent_topics: [] },
		learnedContext: geoOnlyTurn.learnedContext,
		chatStatedLocation: geoOnlyTurn.chatGroundedLocation,
		latestUserMessage: 'Find bike rides near me',
		navigationTarget: geoOnlyTurn.navigationTarget,
		historyContext: geoOnlyTurn.historyContext
	});

	assert.equal(supabase.writes.profileUpdates.length, 1);
	assert.equal(
		supabase.writes.profileUpdates[0].payload.metadata.recommendation_context.location,
		null
	);

	// Turn WITH explicit chat location -> persisted for authenticated user
	const explicitTurn = await runAssistantTurn({
		supabase,
		user,
		messages: [{ role: 'user', content: 'Find bike rides in Phoenix, AZ' }],
		requestHeaders: geoHeaders,
		aiModelOverride: null,
		now: new Date('2026-11-22T00:00:00Z')
	});

	await persistLearnedAssistantContext({
		supabase,
		user,
		profile: { id: 'prof-1', user_id: user.id, metadata: {} },
		recommendationContext: { location: '', interests: [], recommendation_focus: [] },
		assistantMemory: { learned_location: '', learned_interests: [], recent_topics: [] },
		learnedContext: explicitTurn.learnedContext,
		chatStatedLocation: explicitTurn.chatGroundedLocation,
		latestUserMessage: 'Find bike rides in Phoenix, AZ',
		navigationTarget: explicitTurn.navigationTarget,
		historyContext: explicitTurn.historyContext
	});

	assert.equal(supabase.writes.profileUpdates.length, 2);
	assert.equal(
		supabase.writes.profileUpdates[1].payload.metadata.recommendation_context.location,
		'Phoenix, AZ'
	);
});

test('assistant turn enforces timeout and falls back deterministically', async () => {
	const supabase = createMockSupabase(SAMPLE_FIXTURES);
	const startedAt = Date.now();

	const result = await runAssistantTurn({
		supabase,
		messages: [{ role: 'user', content: 'How do I set up Road ID?' }],
		turnTimeoutMs: 60,
		aiModelOverride: {
			model: { provider: 'openai', model: 'gpt-6-luna' },
			client: {
				async generateContent({ config }) {
					return new Promise((_, reject) => {
						const timer = setTimeout(() => reject(new Error('too slow')), 5000);
						config?.signal?.addEventListener('abort', () => {
							clearTimeout(timer);
							reject(new Error('Aborted'));
						});
					});
				}
			}
		}
	});

	const elapsedMs = Date.now() - startedAt;
	assert.ok(elapsedMs < 1000, `Expected fast fallback under 1s, took ${elapsedMs}ms`);
	assert.equal(result.navigationTarget?.url, '/roadid');
	assert.match(result.reply, /3fp\.org\/roadid|\/roadid/i);
});

test('inline message formatter renders emphasis, linkifies /roadid and /merch, repairs https://.../ URLs, and blocks unsafe hrefs', () => {
	assert.equal(normalizeAssistantHref('/roadid'), '/roadid');
	assert.equal(normalizeAssistantHref('/merch'), '/merch');
	assert.equal(normalizeAssistantHref('https://.../roadid'), '/roadid');
	assert.equal(normalizeAssistantHref('https:///donate'), '/donate');
	assert.equal(normalizeAssistantHref('https://roadid/'), '/roadid');
	assert.equal(
		normalizeAssistantHref('https://groups/madison-bikes-inc-madison-wi/'),
		'/groups/madison-bikes-inc-madison-wi'
	);
	assert.equal(normalizeAssistantHref('https://3fp.org/merch'), '/merch');
	assert.equal(normalizeAssistantHref('/learn/to-do'), '');
	assert.equal(normalizeAssistantHref('//evil.example/phish'), '');
	assert.equal(normalizeAssistantHref('javascript:alert(1)'), '');
	assert.equal(normalizeNavigationTarget({ url: '//evil.example', label: 'Bad' }), null);
	assert.deepEqual(normalizeNavigationTarget({ url: 'https://.../roadid', label: 'Road ID' }), {
		url: '/roadid',
		label: 'Road ID',
		reason: ''
	});

	const rendered = renderAssistantMessageHtml(
		'Check **Road ID** at /roadid, grab gear on /merch, or open [Madison Bikes, Inc.](https://.../groups/madison-bikes-inc-madison-wi) and https://donate/. <script>alert(1)</script>'
	);

	assert.match(rendered, /<strong>Road ID<\/strong>/);
	assert.match(rendered, /<a href="\/roadid" class="assistant-link">\/roadid<\/a>,/);
	assert.match(rendered, /<a href="\/merch" class="assistant-link">\/merch<\/a>,/);
	assert.match(
		rendered,
		/<a href="\/groups\/madison-bikes-inc-madison-wi" class="assistant-link">Madison Bikes, Inc\.<\/a>/
	);
	assert.match(rendered, /<a href="\/donate" class="assistant-link">\/donate<\/a>\./);
	assert.ok(!rendered.includes('<script>'));
	assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
