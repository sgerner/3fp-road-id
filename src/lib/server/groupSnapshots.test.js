import test from 'node:test';
import assert from 'node:assert/strict';
import {
	GROUP_PRIVATE_CACHE_CONTROL,
	GROUP_PUBLIC_CACHE_CONTROL,
	GROUP_SNAPSHOT_CACHE_TTL_MS,
	clearGroupSnapshotCache,
	getGroupSnapshotCacheSize,
	invalidateGroupSnapshotCache,
	loadGroupProfilePageData,
	loadPublicGroupSnapshot,
	resolveGroupPageCacheControl
} from './groupSnapshots.js';

function createDeferred() {
	/** @type {(value?: any) => void} */
	let resolve = () => {};
	/** @type {(reason?: any) => void} */
	let reject = () => {};
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/**
 * @param {{ role?: string, handlers?: Record<string, any>, onQuery?: ((query: any) => any) | null }} [options]
 */
function createMockSupabase({ role = 'anon', handlers = {}, onQuery = null } = {}) {
	return {
		from(table) {
			/** @type {Record<string, any>} */
			const state = {
				role,
				table,
				selectArgs: null,
				filters: [],
				orders: [],
				limitValue: null,
				mode: 'many'
			};

			const execute = async () => {
				onQuery?.({ ...state, filters: [...state.filters] });
				if (role === 'anon' && table === 'group_members') {
					return {
						data: null,
						count: null,
						error: { code: '42501', message: 'permission denied for table group_members' }
					};
				}
				const handler = handlers[table];
				if (typeof handler === 'function') {
					return await handler(state);
				}
				if (handler !== undefined) {
					return handler;
				}
				return state.mode === 'maybeSingle'
					? { data: null, error: null }
					: { data: [], count: 0, error: null };
			};

			const builder = {
				select(columns, options) {
					state.selectArgs = { columns, options };
					return builder;
				},
				eq(column, value) {
					state.filters.push({ op: 'eq', column, value });
					return builder;
				},
				in(column, values) {
					state.filters.push({ op: 'in', column, values });
					return builder;
				},
				not(column, operator, value) {
					state.filters.push({ op: 'not', column, operator, value });
					return builder;
				},
				gte(column, value) {
					state.filters.push({ op: 'gte', column, value });
					return builder;
				},
				order(column, options) {
					state.orders.push({ column, options });
					return builder;
				},
				limit(count) {
					state.limitValue = count;
					return builder;
				},
				maybeSingle() {
					state.mode = 'maybeSingle';
					return execute();
				},
				single() {
					state.mode = 'single';
					return execute();
				},
				then(onFulfilled, onRejected) {
					return execute().then(onFulfilled, onRejected);
				}
			};

			return builder;
		}
	};
}

function buildSampleGroupFixtures({
	slug = 'tempe-bike-club',
	groupId = 'group-uuid-1',
	membershipAccessMode = 'public'
} = {}) {
	const groupRow = {
		id: groupId,
		slug,
		name: 'Tempe Bike Club',
		tagline: 'Every rider welcome',
		description: 'Weekly community rides across Tempe.',
		city: 'Tempe',
		state_region: 'AZ',
		country: 'United States',
		is_published: true,
		latitude: 33.4255,
		longitude: -111.94
	};

	const publicHandlers = {
		groups: (state) => {
			const slugFilter = state.filters.find((f) => f.op === 'eq' && f.column === 'slug')?.value;
			if (slugFilter === slug) {
				return { data: { ...groupRow }, error: null };
			}
			return { data: null, error: null };
		},
		group_types: () => ({ data: [{ id: 1, name: 'Social Ride' }], error: null }),
		audience_focuses: () => ({ data: [{ id: 2, name: 'All Riders' }], error: null }),
		riding_disciplines: () => ({ data: [{ id: 3, name: 'Road' }], error: null }),
		skill_levels: () => ({ data: [{ id: 4, name: 'No-Drop' }], error: null }),
		group_x_group_types: () => ({ data: [{ group_type_id: 1 }], error: null }),
		group_x_audience_focuses: () => ({ data: [{ audience_focus_id: 2 }], error: null }),
		group_x_riding_disciplines: () => ({ data: [{ riding_discipline_id: 3 }], error: null }),
		group_x_skill_levels: () => ({ data: [{ skill_level_id: 4 }], error: null }),
		donation_accounts_public: () => ({ data: { is_connected: true }, error: null }),
		group_news_posts: () => ({
			data: [
				{
					id: 'news-1',
					group_id: groupId,
					title: 'Spring Kickoff',
					slug: 'spring-kickoff',
					summary: null,
					body_markdown: '**Meet** at 6pm at [Daley Park](https://example.com)!',
					published_at: '2026-04-01T18:00:00.000Z',
					created_at: '2026-04-01T17:00:00.000Z',
					updated_at: '2026-04-01T17:30:00.000Z',
					created_by_user_id: 'secret-author-user-id',
					updated_by_user_id: 'secret-editor-user-id'
				}
			],
			error: null
		}),
		volunteer_events: () => ({
			data: [
				{
					id: 'vol-1',
					slug: 'bike-valet-friday',
					title: 'Bike Valet Friday',
					summary: 'Help park bikes downtown',
					event_start: '2026-12-01T18:00:00.000Z',
					event_end: '2026-12-01T21:00:00.000Z',
					timezone: 'America/Phoenix',
					location_name: 'Mill Ave',
					location_address: '100 S Mill Ave',
					host_group_id: groupId,
					host_user_id: 'secret-host-user-id'
				},
				{
					id: 'vol-2',
					slug: 'trail-cleanup',
					title: 'Trail Cleanup',
					summary: 'Morning path sweep',
					event_start: '2026-12-05T15:00:00.000Z',
					event_end: '2026-12-05T17:00:00.000Z',
					timezone: 'America/Phoenix',
					location_name: 'Town Lake',
					location_address: '80 W Rio Salado Pkwy',
					host_group_id: groupId,
					host_user_id: 'other-host-user-id'
				}
			],
			error: null
		}),
		activity_events: () => ({
			data: [
				{
					id: 'ride-1',
					title: 'Tuesday Loops',
					slug: 'tuesday-loops',
					summary: 'Casual evening loop',
					description: 'Lights required.',
					timezone: 'America/Phoenix',
					status: 'published',
					host_group_id: groupId,
					host_user_id: 'secret-ride-host-id',
					start_location_name: 'Tempe Beach Park',
					start_location_address: '80 W Rio Salado Pkwy',
					start_latitude: 33.43,
					start_longitude: -111.94,
					next_occurrence_start: '2026-12-02T01:30:00.000Z',
					next_occurrence_end: '2026-12-02T03:00:00.000Z',
					ride_details: [{ distance_miles: 14, image_urls: ['https://example.com/ride.jpg'] }],
					group: { id: groupId, slug, name: 'Tempe Bike Club', city: 'Tempe', state_region: 'AZ' },
					difficulty_links: [{ level: { id: 1, name: 'Casual' } }],
					discipline_links: [{ discipline: { id: 3, name: 'Road' } }],
					recurrence_rules: [{ activity_event_id: 'ride-1' }]
				}
			],
			error: null
		})
	};

	const serviceHandlers = {
		group_members: () => ({ data: null, count: 2, error: null }),
		group_membership_programs: (state) => {
			const slugFilter = state.filters.find(
				(f) => f.op === 'eq' && f.column === 'groups.slug'
			)?.value;
			const accessModeFilter = state.filters.find(
				(f) => f.op === 'eq' && f.column === 'access_mode'
			)?.value;
			if (slugFilter !== slug || (accessModeFilter && membershipAccessMode !== accessModeFilter)) {
				return { data: null, error: null };
			}
			return {
				data: {
					id: 'prog-1',
					group_id: groupId,
					enabled: true,
					access_mode: membershipAccessMode,
					cta_label: 'Follow Club',
					contribution_mode: 'donation',
					default_tier_id: 'tier-free-1',
					policy_markdown: 'Be kind.',
					policy_version: 2
				},
				error: null
			};
		},
		group_membership_tiers: () => ({
			data: [
				{
					id: 'tier-free-1',
					program_id: 'prog-1',
					name: 'Community Follower',
					amount_cents: 0,
					monthly_amount_cents: 0,
					annual_amount_cents: 0,
					allow_custom_amount: false,
					is_active: true,
					is_default: true,
					stripe_account_id: 'acct_secret_internal',
					stripe_price_id: 'price_secret_internal',
					stripe_product_id: 'prod_secret_internal'
				}
			],
			error: null
		}),
		group_membership_form_fields: () => ({
			data: [
				{
					id: 'field-1',
					program_id: 'prog-1',
					field_type: 'text',
					label: 'Favorite bike',
					active: true,
					private_notes: 'must not be returned'
				}
			],
			error: null
		}),
		group_assets: () => ({
			data: [
				{
					id: 'asset-1',
					group_id: groupId,
					section_id: 'sec-1',
					asset_kind: 'link',
					title: 'Route Map',
					description: 'Club route archive',
					external_url: 'https://example.com/routes',
					metadata: { bucket: 'links' },
					sort_order: 0
				}
			],
			error: null
		}),
		group_accounting_public_reports: () => ({
			data: [
				{
					id: 'rep-1',
					slug: '2026-q1',
					title: 'Q1 Report',
					report_period_start: '2026-01-01',
					report_period_end: '2026-03-31',
					visibility: { cash: true, activity: true, position: false, budgets: false, notes: false },
					snapshot: {
						currency: 'usd',
						report: {
							totals: { assets_cents: 50000, liabilities_cents: 10000, income_cents: 25000 }
						}
					},
					notes: 'Private note',
					published_at: '2026-04-02T00:00:00.000Z'
				}
			],
			error: null
		})
	};

	return { groupRow, publicHandlers, serviceHandlers };
}

function assertDeeplyFrozen(value) {
	if (value === null || typeof value !== 'object') return;
	assert.equal(Object.isFrozen(value), true, 'Expected cached object/array to be frozen');
	for (const nested of Object.values(value)) {
		assertDeeplyFrozen(nested);
	}
}

test('cold snapshot assembles public sections in parallel, deep-freezes data, and excludes viewer/owner secrets', async () => {
	clearGroupSnapshotCache();
	const anonQueries = [];
	const serviceQueries = [];
	const { publicHandlers, serviceHandlers } = buildSampleGroupFixtures();

	const publicSupabase = createMockSupabase({
		role: 'anon',
		handlers: publicHandlers,
		onQuery: (q) => anonQueries.push(q)
	});
	const serviceSupabase = createMockSupabase({
		role: 'service_role',
		handlers: serviceHandlers,
		onQuery: (q) => serviceQueries.push(q)
	});

	const snapshot = await loadPublicGroupSnapshot({
		slug: '  Tempe-Bike-Club  ',
		publicSupabase,
		serviceSupabase,
		now: 1_000_000
	});

	assert.ok(snapshot);
	assert.equal(snapshot.group.slug, 'tempe-bike-club');
	assert.equal(snapshot.is_claimed, true);
	assert.equal(snapshot.donation_enabled, true);
	assert.deepEqual(snapshot.selected, {
		group_type_ids: [1],
		audience_focus_ids: [2],
		riding_discipline_ids: [3],
		skill_level_ids: [4]
	});
	assert.equal(snapshot.membership_program?.cta_label, 'Follow Club');
	assert.equal(snapshot.membership_tiers.length, 1);
	assert.equal('stripe_account_id' in snapshot.membership_tiers[0], false);
	assert.equal('stripe_price_id' in snapshot.membership_tiers[0], false);
	assert.equal('stripe_product_id' in snapshot.membership_tiers[0], false);
	assert.equal(snapshot.membership_form_fields.length, 1);
	assert.equal('private_notes' in snapshot.membership_form_fields[0], false);
	assert.equal(snapshot.group_news_posts.length, 1);
	assert.equal(snapshot.group_news_posts[0].preview_text, 'Meet at 6pm at Daley Park!');
	assert.equal('created_by_user_id' in snapshot.group_news_posts[0], false);
	assert.equal('updated_by_user_id' in snapshot.group_news_posts[0], false);
	assert.equal(snapshot.volunteer_events.length, 2);
	assert.equal(snapshot.volunteer_events[0].can_manage, false);
	assert.equal('host_user_id' in snapshot.volunteer_events[0], false);
	assert.equal(snapshot.rides.length, 1);
	assert.equal(snapshot.rides[0].recurrenceEnabled, true);
	assert.equal('hostUserId' in snapshot.rides[0], false);
	assert.equal('session_user_id' in snapshot, false);
	assert.equal('owners_count' in snapshot, false);
	assert.equal('my_memberships' in snapshot, false);

	// Zero anonymous queries against group_members or membership tables with RLS manager functions
	assert.equal(
		anonQueries.some((q) => q.table === 'group_members'),
		false
	);
	assert.equal(
		anonQueries.some((q) => q.table.startsWith('group_membership_')),
		false
	);
	assert.equal(
		serviceQueries.some((q) => q.table === 'group_members'),
		true
	);
	assert.notEqual(
		serviceQueries.find((q) => q.table === 'group_membership_tiers')?.selectArgs?.columns,
		'*'
	);
	assert.notEqual(
		serviceQueries.find((q) => q.table === 'group_membership_form_fields')?.selectArgs?.columns,
		'*'
	);

	assertDeeplyFrozen(snapshot);
	assert.throws(() => {
		snapshot.group.name = 'Mutated';
	}, TypeError);
});

test('concurrent requests for the same slug coalesce onto one in-flight snapshot build', async () => {
	clearGroupSnapshotCache();
	const gate = createDeferred();
	const queryCounts = new Map();
	const { publicHandlers, serviceHandlers } = buildSampleGroupFixtures();

	const gatedPublicHandlers = {
		...publicHandlers,
		groups: async (state) => {
			await gate.promise;
			return publicHandlers.groups(state);
		}
	};

	const recordQuery = (q) => {
		const key = `${q.role}:${q.table}`;
		queryCounts.set(key, (queryCounts.get(key) || 0) + 1);
	};

	const publicSupabase = createMockSupabase({
		role: 'anon',
		handlers: gatedPublicHandlers,
		onQuery: recordQuery
	});
	const serviceSupabase = createMockSupabase({
		role: 'service_role',
		handlers: serviceHandlers,
		onQuery: recordQuery
	});

	const urls = [
		'https://3fp.org/groups/tempe-bike-club',
		'https://3fp.org/groups/Tempe-Bike-Club?utm_source=instagram',
		'https://3fp.org/groups/tempe-bike-club?fbclid=xyz123',
		'https://3fp.org/groups/TEMPE-BIKE-CLUB?gclid=abc456'
	];

	const pending = urls.map((href, index) => {
		const headers = {};
		return loadGroupProfilePageData({
			params: { slug: index % 2 === 0 ? 'tempe-bike-club' : '  Tempe-Bike-Club ' },
			url: new URL(href),
			parent: async () => ({ groupsNavUser: null, isAdmin: false }),
			setHeaders: (next) => Object.assign(headers, next),
			publicSupabase,
			serviceSupabase,
			now: 2_000_000
		}).then((data) => ({ data, headers }));
	});

	gate.resolve();
	const results = await Promise.all(pending);

	assert.equal(getGroupSnapshotCacheSize(), 1);
	assert.equal(queryCounts.get('anon:groups'), 1);
	assert.equal(queryCounts.get('anon:activity_events'), 1);
	assert.equal(queryCounts.get('anon:volunteer_events'), 1);
	assert.equal(queryCounts.get('service_role:group_membership_programs'), 1);
	assert.equal(queryCounts.get('service_role:group_membership_tiers'), 1);
	assert.equal(queryCounts.get('anon:group_members') ?? 0, 0);

	for (const { data, headers } of results) {
		assert.equal(headers['cache-control'], GROUP_PUBLIC_CACHE_CONTROL);
		assert.equal(data.group.slug, 'tempe-bike-club');
		assert.equal(data.session_user_id, null);
		assert.equal(data.is_owner, false);
	}
});

test('warm snapshot is shared across anonymous and signed-in viewers while isolating viewer overlays', async () => {
	clearGroupSnapshotCache();
	let publicQueryCount = 0;
	let serviceQueryCount = 0;
	const { publicHandlers, serviceHandlers } = buildSampleGroupFixtures();

	const publicSupabase = createMockSupabase({
		role: 'anon',
		handlers: publicHandlers,
		onQuery: () => {
			publicQueryCount += 1;
		}
	});
	const serviceSupabase = createMockSupabase({
		role: 'service_role',
		handlers: serviceHandlers,
		onQuery: () => {
			serviceQueryCount += 1;
		}
	});

	// 1. Cold anonymous request
	const anonHeaders = {};
	const anonData = await loadGroupProfilePageData({
		params: { slug: 'tempe-bike-club' },
		url: new URL('https://3fp.org/groups/tempe-bike-club'),
		parent: async () => ({ groupsNavUser: null, isAdmin: false }),
		setHeaders: (next) => Object.assign(anonHeaders, next),
		publicSupabase,
		serviceSupabase,
		now: 5_000_000
	});

	assert.equal(anonHeaders['cache-control'], GROUP_PUBLIC_CACHE_CONTROL);
	assert.equal(anonData.is_owner, false);
	assert.equal(anonData.can_edit, false);
	assert.equal(anonData.volunteer_events[0].can_manage, false);
	const coldPublicQueries = publicQueryCount;
	const coldServiceQueries = serviceQueryCount;

	// 2. Warm signed-in owner request within 60s TTL
	const viewerQueries = [];
	const ownerRequestSupabase = createMockSupabase({
		role: 'authenticated',
		onQuery: (q) => viewerQueries.push(q),
		handlers: {
			group_members: () => ({ data: [{ role: 'owner' }], error: null }),
			group_memberships: () => ({
				data: [{ id: 'mem-1', status: 'active', tier_id: 'tier-free-1' }],
				error: null
			}),
			volunteer_events: () => ({ data: [], error: null }),
			v_volunteer_event_hosts_with_profiles: () => ({ data: [], error: null })
		}
	});

	const ownerHeaders = {};
	const ownerData = await loadGroupProfilePageData({
		params: { slug: 'tempe-bike-club' },
		cookies: {},
		url: new URL('https://3fp.org/groups/tempe-bike-club'),
		parent: async () => ({ groupsNavUser: { id: 'owner-user-1' }, isAdmin: false }),
		setHeaders: (next) => Object.assign(ownerHeaders, next),
		publicSupabase,
		serviceSupabase,
		getRequestSupabase: () => ownerRequestSupabase,
		resolveSessionImpl: async () => ({
			accessToken: 'jwt-owner-1',
			user: { id: 'owner-user-1' },
			verified: true
		}),
		now: 5_000_000 + 15_000
	});

	// Public & service snapshot queries must NOT have re-run on warm hit
	assert.equal(publicQueryCount, coldPublicQueries);
	assert.equal(serviceQueryCount, coldServiceQueries);
	assert.equal(ownerHeaders['cache-control'], GROUP_PRIVATE_CACHE_CONTROL);
	assert.equal(ownerData.session_user_id, 'owner-user-1');
	assert.equal(ownerData.is_owner, true);
	assert.equal(ownerData.is_social_manager, true);
	assert.equal(ownerData.can_manage_social, true);
	assert.equal(ownerData.can_edit, true);
	assert.equal(ownerData.my_memberships.length, 1);
	assert.equal(ownerData.volunteer_events[0].can_manage, true);
	assert.equal(ownerData.volunteer_events[1].can_manage, true);

	// Viewer queries must be strictly scoped to viewer's own user_id (and skip profiles when parent supplies isAdmin)
	assert.equal(
		viewerQueries.some((q) => q.table === 'profiles'),
		false
	);
	const memberQuery = viewerQueries.find((q) => q.table === 'group_members');
	assert.ok(memberQuery);
	assert.deepEqual(
		memberQuery.filters.find((f) => f.column === 'user_id'),
		{ op: 'eq', column: 'user_id', value: 'owner-user-1' }
	);

	// 3. Non-owner volunteer co-host viewer sees can_manage only on their hosted event
	const coHostSupabase = createMockSupabase({
		role: 'authenticated',
		handlers: {
			group_members: () => ({ data: [], error: null }),
			group_memberships: () => ({ data: [], error: null }),
			volunteer_events: () => ({ data: [], error: null }),
			v_volunteer_event_hosts_with_profiles: () => ({
				data: [{ event_id: 'vol-2' }],
				error: null
			})
		}
	});

	const coHostData = await loadGroupProfilePageData({
		params: { slug: 'tempe-bike-club' },
		cookies: {},
		url: new URL('https://3fp.org/groups/tempe-bike-club'),
		parent: async () => ({ groupsNavUser: { id: 'cohost-user-2' }, isAdmin: false }),
		publicSupabase,
		serviceSupabase,
		getRequestSupabase: () => coHostSupabase,
		resolveSessionImpl: async () => ({
			accessToken: 'jwt-cohost-2',
			user: { id: 'cohost-user-2' },
			verified: true
		}),
		now: 5_000_000 + 20_000
	});

	assert.equal(coHostData.is_owner, false);
	assert.equal(coHostData.can_edit, false);
	assert.equal(coHostData.volunteer_events[0].can_manage, false);
	assert.equal(coHostData.volunteer_events[1].can_manage, true);

	// 4. Subsequent anonymous viewer still receives clean unauthenticated state
	const secondAnonData = await loadGroupProfilePageData({
		params: { slug: 'tempe-bike-club' },
		url: new URL('https://3fp.org/groups/tempe-bike-club'),
		parent: async () => ({ groupsNavUser: null, isAdmin: false }),
		publicSupabase,
		serviceSupabase,
		now: 5_000_000 + 25_000
	});

	assert.equal(publicQueryCount, coldPublicQueries);
	assert.equal(secondAnonData.session_user_id, null);
	assert.equal(secondAnonData.is_owner, false);
	assert.equal(secondAnonData.my_memberships.length, 0);
	assert.equal(secondAnonData.volunteer_events[1].can_manage, false);
});

test('private request membership metadata is exposed only in the signed-in viewer overlay', async () => {
	clearGroupSnapshotCache();
	const { publicHandlers, serviceHandlers } = buildSampleGroupFixtures({
		slug: 'private-club',
		groupId: 'group-private',
		membershipAccessMode: 'private_request'
	});
	const publicSupabase = createMockSupabase({ role: 'anon', handlers: publicHandlers });
	const serviceSupabase = createMockSupabase({ role: 'service_role', handlers: serviceHandlers });
	const signedIn = await loadGroupProfilePageData({
		params: { slug: 'private-club' },
		cookies: {},
		url: new URL('https://3fp.org/groups/private-club'),
		parent: async () => ({ groupsNavUser: { id: 'member-1' }, isAdmin: false }),
		setHeaders: () => {},
		publicSupabase,
		serviceSupabase,
		getRequestSupabase: () => createMockSupabase({ role: 'authenticated' }),
		resolveSessionImpl: async () => ({
			user: { id: 'member-1' },
			accessToken: 'verified-token'
		}),
		getMembershipProgramImpl: async ({ includeInactive }) => {
			assert.equal(includeInactive, false);
			return {
				ok: true,
				data: {
					program: {
						id: 'private-prog',
						group_id: 'group-private',
						enabled: true,
						access_mode: 'private_request',
						cta_label: 'Request to join',
						policy_markdown: 'private policy'
					}
				}
			};
		}
	});

	assert.equal(signedIn.membership_program?.access_mode, 'private_request');
	assert.equal(signedIn.membership_program?.policy_markdown, null);

	const anonymous = await loadGroupProfilePageData({
		params: { slug: 'private-club' },
		cookies: {},
		url: new URL('https://3fp.org/groups/private-club'),
		parent: async () => ({ groupsNavUser: null, isAdmin: false }),
		setHeaders: () => {},
		publicSupabase,
		serviceSupabase,
		getMembershipProgramImpl: async () => {
			assert.fail('anonymous viewers must not load private membership metadata');
		}
	});
	assert.equal(anonymous.membership_program, null);
});

test('missing slug throws HTTP 404 and evicts null entries immediately', async () => {
	clearGroupSnapshotCache();
	const { publicHandlers, serviceHandlers } = buildSampleGroupFixtures();
	const publicSupabase = createMockSupabase({ role: 'anon', handlers: publicHandlers });
	const serviceSupabase = createMockSupabase({ role: 'service_role', handlers: serviceHandlers });

	await assert.rejects(
		() =>
			loadGroupProfilePageData({
				params: { slug: 'nonexistent-club' },
				url: new URL('https://3fp.org/groups/nonexistent-club'),
				parent: async () => ({ groupsNavUser: null }),
				publicSupabase,
				serviceSupabase,
				now: 10_000_000
			}),
		(/** @type {any} */ err) => {
			assert.equal(err?.status, 404);
			assert.equal(err?.body?.message, 'Group not found');
			return true;
		}
	);

	assert.equal(getGroupSnapshotCacheSize(), 0);
});

test('redirects stripped microsite_slug requests via 308 while preserving query parameters and skips empty microsite slugs', async () => {
	clearGroupSnapshotCache();
	const anonQueries = [];
	const { publicHandlers, serviceHandlers } = buildSampleGroupFixtures({
		slug: 'reston-bike-club-reston-va',
		groupId: 'group-reston-1'
	});
	const publicSupabase = createMockSupabase({
		role: 'anon',
		onQuery: (q) => anonQueries.push(q),
		handlers: {
			...publicHandlers,
			groups: (state) => {
				const slugFilter = state.filters.find((f) => f.op === 'eq' && f.column === 'slug')?.value;
				if (slugFilter === 'reston-bike-club-reston-va') {
					return {
						data: {
							id: 'group-reston-1',
							slug: 'reston-bike-club-reston-va',
							microsite_slug: 'restonbikeclubrestonva',
							name: 'Reston Bike Club',
							is_published: true
						},
						error: null
					};
				}
				const micrositeFilter = state.filters.find(
					(f) => f.op === 'eq' && f.column === 'microsite_slug'
				)?.value;
				if (micrositeFilter === 'restonbikeclubrestonva') {
					return {
						data: { slug: 'reston-bike-club-reston-va' },
						error: null
					};
				}
				return { data: null, error: null };
			}
		}
	});
	const serviceSupabase = createMockSupabase({ role: 'service_role', handlers: serviceHandlers });

	await assert.rejects(
		() =>
			loadGroupProfilePageData({
				params: { slug: 'restonbikeclubrestonva' },
				url: new URL(
					'https://3fp.org/groups/restonbikeclubrestonva?auto_follow=1&auto_follow_tier=tier-free-1'
				),
				parent: async () => ({ groupsNavUser: null }),
				publicSupabase,
				serviceSupabase,
				now: 11_000_000
			}),
		(/** @type {any} */ redirectErr) => {
			assert.equal(redirectErr?.status, 308);
			assert.equal(
				redirectErr?.location,
				'/groups/reston-bike-club-reston-va?auto_follow=1&auto_follow_tier=tier-free-1'
			);
			return true;
		}
	);
	assert.equal(getGroupSnapshotCacheSize(), 0);

	anonQueries.length = 0;
	await assert.rejects(
		() =>
			loadGroupProfilePageData({
				params: { slug: '---' },
				url: new URL('https://3fp.org/groups/---'),
				parent: async () => ({ groupsNavUser: null }),
				publicSupabase,
				serviceSupabase,
				now: 11_000_100
			}),
		(/** @type {any} */ err) => {
			assert.equal(err?.status, 404);
			return true;
		}
	);
	assert.equal(
		anonQueries.some((q) => q.filters.some((f) => f.op === 'eq' && f.column === 'microsite_slug')),
		false
	);
});

test('failed group lookup throws HTTP 500 and evicts rejected promises immediately so retries recover', async () => {
	clearGroupSnapshotCache();
	let shouldFail = true;
	const { publicHandlers, serviceHandlers } = buildSampleGroupFixtures();
	const flakyPublicSupabase = createMockSupabase({
		role: 'anon',
		handlers: {
			...publicHandlers,
			groups: (state) => {
				if (shouldFail) {
					return { data: null, error: { message: 'upstream connection reset' } };
				}
				return publicHandlers.groups(state);
			}
		}
	});
	const serviceSupabase = createMockSupabase({ role: 'service_role', handlers: serviceHandlers });

	await assert.rejects(
		() =>
			loadGroupProfilePageData({
				params: { slug: 'tempe-bike-club' },
				url: new URL('https://3fp.org/groups/tempe-bike-club'),
				parent: async () => ({ groupsNavUser: null }),
				publicSupabase: flakyPublicSupabase,
				serviceSupabase,
				now: 12_000_000
			}),
		(/** @type {any} */ err) => {
			assert.equal(err?.status, 500);
			assert.equal(err?.body?.message, 'Failed to load group');
			return true;
		}
	);

	assert.equal(getGroupSnapshotCacheSize(), 0);

	shouldFail = false;
	const recovered = await loadGroupProfilePageData({
		params: { slug: 'tempe-bike-club' },
		url: new URL('https://3fp.org/groups/tempe-bike-club'),
		parent: async () => ({ groupsNavUser: null }),
		publicSupabase: flakyPublicSupabase,
		serviceSupabase,
		now: 12_000_100
	});

	assert.equal(recovered.group.slug, 'tempe-bike-club');
	assert.equal(getGroupSnapshotCacheSize(), 1);
});

test('enforces 60-second TTL expiration and bounded maxEntries eviction', async () => {
	clearGroupSnapshotCache();
	let groupsLookups = 0;

	const makeClientForAnySlug = () =>
		createMockSupabase({
			role: 'anon',
			handlers: {
				groups: (state) => {
					groupsLookups += 1;
					const slug = state.filters.find((f) => f.column === 'slug')?.value;
					return {
						data: {
							id: `id-${slug}`,
							slug,
							name: `Club ${slug}`,
							is_published: true
						},
						error: null
					};
				}
			}
		});
	const serviceSupabase = createMockSupabase({ role: 'service_role' });
	const publicSupabase = makeClientForAnySlug();

	const baseNow = 20_000_000;
	await loadPublicGroupSnapshot({
		slug: 'alpha',
		publicSupabase,
		serviceSupabase,
		now: baseNow,
		maxEntries: 3
	});
	await loadPublicGroupSnapshot({
		slug: 'alpha',
		publicSupabase,
		serviceSupabase,
		now: baseNow + GROUP_SNAPSHOT_CACHE_TTL_MS - 1,
		maxEntries: 3
	});
	assert.equal(groupsLookups, 1);

	// Expired at exact 60s boundary
	await loadPublicGroupSnapshot({
		slug: 'alpha',
		publicSupabase,
		serviceSupabase,
		now: baseNow + GROUP_SNAPSHOT_CACHE_TTL_MS,
		maxEntries: 3
	});
	assert.equal(groupsLookups, 2);

	// Bounded maxEntries = 3 evicts oldest entry
	await loadPublicGroupSnapshot({
		slug: 'beta',
		publicSupabase,
		serviceSupabase,
		now: baseNow + GROUP_SNAPSHOT_CACHE_TTL_MS + 10,
		maxEntries: 3
	});
	await loadPublicGroupSnapshot({
		slug: 'gamma',
		publicSupabase,
		serviceSupabase,
		now: baseNow + GROUP_SNAPSHOT_CACHE_TTL_MS + 20,
		maxEntries: 3
	});
	await loadPublicGroupSnapshot({
		slug: 'delta',
		publicSupabase,
		serviceSupabase,
		now: baseNow + GROUP_SNAPSHOT_CACHE_TTL_MS + 30,
		maxEntries: 3
	});

	assert.equal(getGroupSnapshotCacheSize(), 3);

	// 'alpha' was oldest and should have been evicted, while 'delta' remains warm
	const lookupsBeforeDelta = groupsLookups;
	await loadPublicGroupSnapshot({
		slug: 'delta',
		publicSupabase,
		serviceSupabase,
		now: baseNow + GROUP_SNAPSHOT_CACHE_TTL_MS + 40,
		maxEntries: 3
	});
	assert.equal(groupsLookups, lookupsBeforeDelta);

	await loadPublicGroupSnapshot({
		slug: 'alpha',
		publicSupabase,
		serviceSupabase,
		now: baseNow + GROUP_SNAPSHOT_CACHE_TTL_MS + 50,
		maxEntries: 3
	});
	assert.equal(groupsLookups, lookupsBeforeDelta + 1);
});

test('invalidateGroupSnapshotCache evicts settled and in-flight entries by groupId or slug', async () => {
	clearGroupSnapshotCache();
	const { publicHandlers: firstPublic, serviceHandlers: firstService } = buildSampleGroupFixtures({
		slug: 'club-one',
		groupId: 'gid-1'
	});
	const { publicHandlers: secondPublic, serviceHandlers: secondService } = buildSampleGroupFixtures(
		{
			slug: 'club-two',
			groupId: 'gid-2'
		}
	);

	await loadPublicGroupSnapshot({
		slug: 'club-one',
		publicSupabase: createMockSupabase({ role: 'anon', handlers: firstPublic }),
		serviceSupabase: createMockSupabase({ role: 'service_role', handlers: firstService }),
		now: 30_000_000
	});
	await loadPublicGroupSnapshot({
		slug: 'club-two',
		publicSupabase: createMockSupabase({ role: 'anon', handlers: secondPublic }),
		serviceSupabase: createMockSupabase({ role: 'service_role', handlers: secondService }),
		now: 30_000_000
	});

	assert.equal(getGroupSnapshotCacheSize(), 2);
	assert.equal(invalidateGroupSnapshotCache({ groupId: 'gid-1' }), 1);
	assert.equal(getGroupSnapshotCacheSize(), 1);
	assert.equal(invalidateGroupSnapshotCache({ slug: 'CLUB-TWO' }), 1);
	assert.equal(getGroupSnapshotCacheSize(), 0);

	// In-flight invalidation prevents stale entry from persisting after settling
	const gate = createDeferred();
	const slowPublicSupabase = createMockSupabase({
		role: 'anon',
		handlers: {
			...firstPublic,
			groups: async (state) => {
				await gate.promise;
				return firstPublic.groups(state);
			}
		}
	});

	const inFlightPromise = loadPublicGroupSnapshot({
		slug: 'club-one',
		publicSupabase: slowPublicSupabase,
		serviceSupabase: createMockSupabase({ role: 'service_role', handlers: firstService }),
		now: 30_010_000
	});

	assert.equal(getGroupSnapshotCacheSize(), 1);
	assert.equal(invalidateGroupSnapshotCache({ slug: 'club-one' }), 1);
	assert.equal(getGroupSnapshotCacheSize(), 0);

	gate.resolve();
	await inFlightPromise;
	assert.equal(getGroupSnapshotCacheSize(), 0);
});

test('enforces public vs private Cache-Control rules and preserves auto_follow redirect flow', async () => {
	assert.equal(
		resolveGroupPageCacheControl({
			isAuthenticated: false,
			url: new URL('https://3fp.org/groups/tempe-bike-club?utm_source=newsletter')
		}),
		GROUP_PUBLIC_CACHE_CONTROL
	);
	assert.equal(
		resolveGroupPageCacheControl({
			isAuthenticated: false,
			url: new URL('https://3fp.org/groups/tempe-bike-club?auth=required')
		}),
		GROUP_PRIVATE_CACHE_CONTROL
	);
	assert.equal(
		resolveGroupPageCacheControl({
			isAuthenticated: false,
			url: new URL('https://3fp.org/groups/tempe-bike-club?follow=success')
		}),
		GROUP_PRIVATE_CACHE_CONTROL
	);
	assert.equal(
		resolveGroupPageCacheControl({
			isAuthenticated: true,
			url: new URL('https://3fp.org/groups/tempe-bike-club')
		}),
		GROUP_PRIVATE_CACHE_CONTROL
	);

	clearGroupSnapshotCache();
	const { publicHandlers, serviceHandlers } = buildSampleGroupFixtures();
	const headers = {};
	/** @type {any} */
	let joinedArgs = null;

	await assert.rejects(
		() =>
			loadGroupProfilePageData({
				params: { slug: 'tempe-bike-club' },
				cookies: {},
				url: new URL(
					'https://3fp.org/groups/tempe-bike-club?auto_follow=1&auto_follow_tier=tier-free-1'
				),
				parent: async () => ({ groupsNavUser: { id: 'follower-1' }, isAdmin: false }),
				setHeaders: (next) => Object.assign(headers, next),
				publicSupabase: createMockSupabase({ role: 'anon', handlers: publicHandlers }),
				serviceSupabase: createMockSupabase({ role: 'service_role', handlers: serviceHandlers }),
				joinMembershipImpl: async (args) => {
					joinedArgs = args;
					return { ok: true };
				},
				resolveSessionImpl: async () => ({
					accessToken: 'jwt-follower-1',
					user: { id: 'follower-1' },
					verified: true
				}),
				now: 40_000_000
			}),
		(/** @type {any} */ redirectErr) => {
			assert.equal(redirectErr?.status, 303);
			assert.equal(redirectErr?.location, '/groups/tempe-bike-club?follow=success');
			return true;
		}
	);

	assert.equal(headers['cache-control'], GROUP_PRIVATE_CACHE_CONTROL);
	assert.deepEqual(joinedArgs?.payload, {
		tier_id: 'tier-free-1',
		billing_interval: 'month'
	});
});
