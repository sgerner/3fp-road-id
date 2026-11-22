import assert from 'node:assert/strict';
import test from 'node:test';
import {
	HOST_GROUP_STATUS,
	filterHostGroups,
	getHostGroupBadgeMeta
} from '../groups/hostGroupDirectory.js';
import { getClaimedGroupIdSet } from './groupClaimStatus.js';
import { loadHostGroupDirectoryCore } from './hostGroupDirectoryCore.js';

function createPaginatedSupabaseMock({
	groups = [],
	ownerMemberships = [],
	userMemberships = [],
	isAdmin = false
} = {}) {
	const selectedColumnsByTable = new Map();

	function makeRangeQuery(table, rows, extraFilter = null) {
		let filtered = [...rows];
		const state = { orders: [] };
		const builder = {
			select(columns) {
				selectedColumnsByTable.set(table, columns);
				return this;
			},
			eq(col, val) {
				filtered = filtered.filter((row) => String(row[col] ?? '') === String(val));
				if (extraFilter) extraFilter({ op: 'eq', col, val });
				return this;
			},
			in(col, vals) {
				const allowed = new Set(vals.map(String));
				filtered = filtered.filter((row) => allowed.has(String(row[col] ?? '')));
				return this;
			},
			order(col) {
				state.orders.push(col);
				return this;
			},
			range(from, to) {
				const slice = filtered.slice(from, to + 1);
				return Promise.resolve({ data: slice, error: null });
			},
			maybeSingle() {
				return Promise.resolve({ data: filtered[0] ?? null, error: null });
			}
		};
		return builder;
	}

	const requestSupabase = {
		selectedColumnsByTable,
		from(table) {
			if (table === 'groups') return makeRangeQuery('groups', groups);
			if (table === 'group_members') return makeRangeQuery('group_members', userMemberships);
			if (table === 'profiles') {
				return makeRangeQuery('profiles', [{ user_id: 'user-1', admin: isAdmin }]);
			}
			throw new Error(`Unexpected request table: ${table}`);
		}
	};

	const serviceSupabase = {
		selectedColumnsByTable,
		from(table) {
			assert.equal(table, 'group_members');
			return makeRangeQuery('service:group_members', ownerMemberships);
		}
	};

	return { requestSupabase, serviceSupabase };
}

test('loadHostGroupDirectoryCore paginates across 1,055+ groups and labels managed, unclaimed, and external groups without leaking owners', async () => {
	const totalGroups = 1055;
	const groups = Array.from({ length: totalGroups }, (_, idx) => {
		const num = String(idx + 1).padStart(4, '0');
		return {
			id: `group-${num}`,
			name: `Club ${num}`,
			slug: `club-${num}`,
			city: idx % 2 === 0 ? 'Phoenix' : 'Tucson',
			state_region: 'AZ',
			country: 'US'
		};
	});

	// 620 claimed groups across multiple pages, including group-0001 owned by user-1
	const ownerMemberships = Array.from({ length: 620 }, (_, idx) => {
		const num = String(idx + 1).padStart(4, '0');
		return {
			group_id: `group-${num}`,
			user_id: idx === 0 ? 'user-1' : `secret-owner-${num}`,
			role: 'owner'
		};
	});

	const userMemberships = [
		{ group_id: 'group-0001', user_id: 'user-1', role: 'owner' },
		{ group_id: 'group-0002', user_id: 'user-1', role: 'admin' }
	];

	const { requestSupabase, serviceSupabase } = createPaginatedSupabaseMock({
		groups,
		ownerMemberships,
		userMemberships,
		isAdmin: false
	});

	const claimedSet = await getClaimedGroupIdSet(serviceSupabase, { pageSize: 500 });
	assert.equal(claimedSet.size, 620);
	assert.equal(serviceSupabase.selectedColumnsByTable.get('service:group_members'), 'group_id');

	const result = await loadHostGroupDirectoryCore({
		supabase: requestSupabase,
		serviceSupabase,
		userId: 'user-1',
		allowSiteAdmin: false,
		pageSize: 500
	});

	assert.equal(result.hostGroups.length, 1055);
	assert.deepEqual(result.managedGroupIds, ['group-0001', 'group-0002']);

	const group1 = result.hostGroups.find((g) => g.id === 'group-0001');
	const group2 = result.hostGroups.find((g) => g.id === 'group-0002');
	const group3 = result.hostGroups.find((g) => g.id === 'group-0003');
	const group1055 = result.hostGroups.find((g) => g.id === 'group-1055');

	assert.equal(group1.status, HOST_GROUP_STATUS.MANAGED);
	assert.equal(group2.status, HOST_GROUP_STATUS.MANAGED);
	assert.equal(group3.status, HOST_GROUP_STATUS.EXTERNAL);
	assert.equal(group1055.status, HOST_GROUP_STATUS.UNCLAIMED);

	// Guardrail: never leak owner user IDs or membership rows
	for (const entry of result.hostGroups) {
		assert.equal('user_id' in entry, false);
		assert.equal('owner_id' in entry, false);
		assert.equal('owners' in entry, false);
	}

	// Search across the tail of the 1,055-organization directory
	const tailSearch = filterHostGroups(result.hostGroups, 'Club 1055');
	assert.equal(tailSearch.totalMatches, 1);
	assert.equal(tailSearch.items[0].id, 'group-1055');
	assert.equal(getHostGroupBadgeMeta(tailSearch.items[0].status).label, 'Unclaimed');
	assert.equal(getHostGroupBadgeMeta(HOST_GROUP_STATUS.EXTERNAL).label, 'Requires approval');
});

test('loadHostGroupDirectoryCore grants site admin management only when allowSiteAdmin is enabled', async () => {
	const groups = [{ id: 'group-ext', name: 'External Club', slug: 'external-club' }];
	const ownerMemberships = [{ group_id: 'group-ext', user_id: 'other-owner', role: 'owner' }];

	const { requestSupabase, serviceSupabase } = createPaginatedSupabaseMock({
		groups,
		ownerMemberships,
		userMemberships: [],
		isAdmin: true
	});

	const rideDirectory = await loadHostGroupDirectoryCore({
		supabase: requestSupabase,
		serviceSupabase,
		userId: 'user-1',
		allowSiteAdmin: false
	});
	assert.equal(rideDirectory.hostGroups[0].status, HOST_GROUP_STATUS.EXTERNAL);

	const volunteerDirectory = await loadHostGroupDirectoryCore({
		supabase: requestSupabase,
		serviceSupabase,
		userId: 'user-1',
		allowSiteAdmin: true
	});
	assert.equal(volunteerDirectory.hostGroups[0].status, HOST_GROUP_STATUS.MANAGED);
});
