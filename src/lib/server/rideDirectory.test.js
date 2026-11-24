import assert from 'node:assert/strict';
import test from 'node:test';
import { queryPublishedUpcomingRides } from './rideDirectory.js';

/**
 * @param {number} index
 * @param {Record<string, any>} [overrides]
 */
function makeActivityRow(index, overrides = {}) {
	const dayOffset = index + 1;
	const start = new Date(Date.UTC(2026, 10, 22 + dayOffset, 15, 0, 0));
	const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
	return {
		id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
		activity_type: 'ride',
		status: 'published',
		title: `Community Ride ${index + 1}`,
		slug: `community-ride-${index + 1}`,
		summary: `Summary for ride ${index + 1}`,
		description: `Description for ride ${index + 1}`,
		timezone: 'America/Phoenix',
		host_user_id: index % 3 === 0 ? null : `user-${index + 1}`,
		host_group_id: index % 3 === 0 ? null : `group-${(index % 2) + 1}`,
		start_location_name: 'Tempe Beach Park',
		start_location_address: '80 W Rio Salado Pkwy, Tempe, AZ',
		start_latitude: 33.43,
		start_longitude: -111.94,
		next_occurrence_start: start.toISOString(),
		next_occurrence_end: end.toISOString(),
		ride_details: [{ pace_notes: '14-16 mph', image_urls: [] }],
		group:
			index % 3 === 0
				? null
				: {
						id: `group-${(index % 2) + 1}`,
						slug: `group-${(index % 2) + 1}`,
						name: `Spokes Club ${(index % 2) + 1}`,
						city: 'Tempe',
						state_region: 'AZ'
					},
		difficulty_links: [
			{
				level: {
					id: index % 2 === 0 ? 1 : 2,
					name: index % 2 === 0 ? 'Casual' : 'Challenging',
					slug: index % 2 === 0 ? 'casual' : 'challenging'
				}
			}
		],
		discipline_links: [{ discipline: { id: 10, name: 'Road', slug: 'road' } }],
		...overrides
	};
}

/**
 * @param {{
 *   activities?: Array<Record<string, any>>;
 *   difficultyLevels?: Array<{ id: number; name: string; slug: string }>;
 *   disciplines?: Array<{ id: number; name: string; slug: string }>;
 *   groups?: Array<Record<string, any>>;
 *   rideDetailsMatches?: Array<Record<string, any>>;
 *   recurringIds?: Set<string>;
 * }} [options]
 */
function createRidesSupabaseMock({
	activities = [],
	difficultyLevels = [
		{ id: 1, name: 'Casual', slug: 'casual' },
		{ id: 2, name: 'Challenging', slug: 'challenging' }
	],
	disciplines = [{ id: 10, name: 'Road', slug: 'road' }],
	groups = [],
	rideDetailsMatches = [],
	recurringIds = new Set()
} = {}) {
	/**
	 * @type {{
	 *   activityRanges: Array<[number, number]>;
	 *   activityCalls: Array<Record<string, any>>;
	 *   recurrenceBatches: number[];
	 *   relatedLimits: Array<[string, number]>;
	 * }}
	 */
	const recorded = {
		activityRanges: [],
		activityCalls: [],
		recurrenceBatches: [],
		relatedLimits: []
	};

	return {
		recorded,
		/** @param {string} table */
		from(table) {
			/**
			 * @type {{
			 *   table: string;
			 *   columns?: string;
			 *   selectOptions?: { count?: string };
			 *   limit?: number;
			 *   eqs: Array<[string, any]>;
			 *   nullChecks: Array<[string, any]>;
			 *   ins: Array<[string, any[]]>;
			 *   ilikes: Array<[string, string]>;
			 *   ors: string[];
			 *   gte: [string, any] | null;
			 *   orders: Array<[string, any]>;
			 *   range: [number, number] | null;
			 * }}
			 */
			const state = {
				table,
				selectOptions: undefined,
				eqs: [],
				nullChecks: [],
				ins: [],
				ilikes: [],
				ors: [],
				gte: null,
				orders: [],
				range: null
			};

			const builder = {
				select(columns, options) {
					state.columns = columns;
					state.selectOptions = options;
					return this;
				},
				eq(col, val) {
					state.eqs.push([col, val]);
					return this;
				},
				is(col, val) {
					state.nullChecks.push([col, val]);
					return this;
				},
				in(col, vals) {
					state.ins.push([col, vals]);
					return this;
				},
				ilike(col, val) {
					state.ilikes.push([col, val]);
					return this;
				},
				or(expr) {
					state.ors.push(expr);
					return this;
				},
				gte(col, val) {
					state.gte = [col, val];
					return this;
				},
				order(col, opts) {
					state.orders.push([col, opts]);
					return this;
				},
				limit(n) {
					state.limit = n;
					recorded.relatedLimits.push([table, n]);
					return this;
				},
				range(from, to) {
					state.range = [from, to];
					return this;
				},
				then(resolve, reject) {
					return Promise.resolve()
						.then(() => {
							if (table === 'ride_difficulty_levels') {
								return { data: difficultyLevels, error: null };
							}
							if (table === 'riding_disciplines') {
								return { data: disciplines, error: null };
							}
							if (table === 'groups') {
								return { data: groups, error: null };
							}
							if (table === 'ride_details') {
								return { data: rideDetailsMatches, error: null };
							}
							if (
								table === 'activity_x_ride_difficulty_levels' ||
								table === 'activity_x_riding_disciplines'
							) {
								return { data: [], error: null };
							}
							if (table === 'activity_recurrence_rules') {
								const ids = state.ins.find(([col]) => col === 'activity_event_id')?.[1] ?? [];
								recorded.recurrenceBatches.push(ids.length);
								return {
									data: ids
										.filter((id) => recurringIds.has(id))
										.map((id) => ({ activity_event_id: id })),
									error: null
								};
							}
							if (table === 'activity_events') {
								recorded.activityCalls.push({ ...state });
								let filtered = [...activities];

								for (const [col, val] of state.eqs) {
									filtered = filtered.filter((row) => row[col] === val);
								}
								for (const [col, val] of state.nullChecks) {
									if (val === null) filtered = filtered.filter((row) => row[col] === null);
								}
								if (state.gte) {
									const [col, minVal] = state.gte;
									filtered = filtered.filter((row) => row[col] >= minVal);
								}
								const diffIn = state.ins.find(
									([col]) => col === 'difficulty_filter.difficulty_level_id'
								);
								if (diffIn) {
									const allowed = new Set(diffIn[1]);
									filtered = filtered.filter((row) =>
										(row.difficulty_links ?? []).some((d) => allowed.has(d?.level?.id))
									);
								}
								if (state.ors.length) {
									const expr = state.ors[0];
									const match = /title\.ilike\."%(.+?)%"/.exec(expr);
									const term = (match?.[1] ?? '').toLowerCase();
									filtered = filtered.filter((row) =>
										[
											row.title,
											row.summary,
											row.description,
											row.start_location_name,
											row.start_location_address,
											row.group?.name
										]
											.filter(Boolean)
											.join(' ')
											.toLowerCase()
											.includes(term)
									);
								}

								filtered.sort(
									(a, b) =>
										a.next_occurrence_start.localeCompare(b.next_occurrence_start) ||
										a.id.localeCompare(b.id)
								);
								const totalCount = filtered.length;
								const [from, to] = state.range ?? [0, filtered.length - 1];
								recorded.activityRanges.push([from, to]);
								const sliced = filtered.slice(from, to + 1);
								return {
									data: sliced,
									count: state.selectOptions?.count === 'exact' ? totalCount : null,
									error: null
								};
							}
							return { data: [], error: null };
						})
						.then(resolve, reject);
				}
			};

			return builder;
		}
	};
}

test('queryPublishedUpcomingRides searches related records through the ride safety ceiling', async () => {
	const supabase = createRidesSupabaseMock({
		groups: [{ id: 'group-1' }],
		rideDetailsMatches: [{ activity_event_id: 'ride-1' }]
	});

	await queryPublishedUpcomingRides(supabase, new URLSearchParams('search=community'), {
		nowIso: '2026-11-21T00:00:00.000Z'
	});

	assert.deepEqual(
		supabase.recorded.relatedLimits.filter(([table]) => ['groups', 'ride_details'].includes(table)),
		[
			['groups', 2000],
			['ride_details', 2000]
		]
	);
});

test('queryPublishedUpcomingRides fetches past 200 rows across chunks and batches recurrence lookups', async () => {
	const totalRows = 325;
	const activities = Array.from({ length: totalRows }, (_, index) => makeActivityRow(index));
	const recurringIds = new Set([activities[0].id, activities[320].id]);
	const supabase = createRidesSupabaseMock({ activities, recurringIds });

	const result = await queryPublishedUpcomingRides(supabase, new URLSearchParams(), {
		nowIso: '2026-11-21T00:00:00.000Z',
		chunkSize: 120,
		safetyCeiling: 2000,
		recurrenceBatchSize: 100
	});

	assert.equal(result.data.length, 325);
	assert.equal(result.count, 325);
	assert.equal(result.meta.total, 325);
	assert.equal(result.meta.truncated, false);
	assert.deepEqual(supabase.recorded.activityRanges, [
		[0, 119],
		[120, 239],
		[240, 359]
	]);
	assert.deepEqual(supabase.recorded.recurrenceBatches, [100, 100, 100, 25]);
	assert.equal(result.data[0].recurrenceEnabled, true);
	assert.equal(result.data[320].recurrenceEnabled, true);
	// Ride #321 is scheduled well into 2027 past the former 200-row cap
	assert.ok(result.data[320].nextOccurrenceStart > '2027-09-01T00:00:00.000Z');
});

test('queryPublishedUpcomingRides applies search, difficulty, and needs_host before range limits', async () => {
	const activities = Array.from({ length: 260 }, (_, index) => makeActivityRow(index));
	// Place a matching ride at index 252 (past the former 200-row limit, unclaimed, Casual)
	activities[252] = makeActivityRow(252, {
		title: 'Solstice Desert Century 2027',
		host_user_id: null,
		host_group_id: null,
		difficulty_links: [{ level: { id: 1, name: 'Casual', slug: 'casual' } }]
	});

	const supabase = createRidesSupabaseMock({ activities });
	const params = new URLSearchParams('q=Solstice&difficulty=casual&needsHost=1');

	const result = await queryPublishedUpcomingRides(supabase, params, {
		nowIso: '2026-11-21T00:00:00.000Z',
		chunkSize: 100,
		safetyCeiling: 500
	});

	assert.equal(result.data.length, 1);
	assert.equal(result.data[0].title, 'Solstice Desert Century 2027');
	assert.equal(result.meta.total, 1);
	assert.equal(supabase.recorded.activityCalls.length, 1);
	const call = supabase.recorded.activityCalls[0];
	assert.deepEqual(call.nullChecks, [
		['host_user_id', null],
		['host_group_id', null]
	]);
	assert.equal(call.ors.length, 1);
	assert.match(call.ors[0], /title\.ilike\."%Solstice%"/);
});

test('queryPublishedUpcomingRides enforces safety ceiling while reporting exact count metadata', async () => {
	const activities = Array.from({ length: 180 }, (_, index) => makeActivityRow(index));
	const supabase = createRidesSupabaseMock({ activities });

	const result = await queryPublishedUpcomingRides(supabase, new URLSearchParams(), {
		nowIso: '2026-11-21T00:00:00.000Z',
		chunkSize: 50,
		safetyCeiling: 120
	});

	assert.equal(result.data.length, 120);
	assert.equal(result.count, 180);
	assert.equal(result.meta.total, 180);
	assert.equal(result.meta.returned, 120);
	assert.equal(result.meta.safetyCeiling, 120);
	assert.equal(result.meta.truncated, true);
});
