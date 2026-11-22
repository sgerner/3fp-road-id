import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildMembershipReturnPath,
	normalizeMembershipManageViewParam,
	parseMembershipHandoffParams,
	resolveInitialMembershipManageView
} from '../groups/membershipHandoff.js';
import { isSafeInternalPath } from '../security/navigation.js';
import {
	buildProgramAndTiersPath,
	evaluateStripeBillingGuard,
	getGroupStripeBillingGuard
} from './groupStripeConnection.js';
import {
	computeGlobalProfileBackfill,
	ensureUserGlobalProfileDefaults,
	executeUnifiedProgramAndTiersSave,
	extractScopedContactColumns,
	mergeScopedMemberContact
} from './membershipProgramAndContacts.js';

function createMembershipSupabaseMock({
	programs = [],
	tiers = [],
	memberships = [],
	billings = [],
	profiles = []
} = {}) {
	const tables = {
		group_membership_programs: programs.map((row) => ({ ...row })),
		group_membership_tiers: tiers.map((row) => ({ ...row })),
		group_memberships: memberships.map((row) => ({ ...row })),
		group_membership_billing: billings.map((row) => ({ ...row })),
		profiles: profiles.map((row) => ({ ...row }))
	};
	const profileUpserts = [];

	function matchesFilters(row, filters) {
		return filters.every((filter) => {
			if (filter.type === 'eq') return row[filter.key] === filter.value;
			if (filter.type === 'neq') return row[filter.key] !== filter.value;
			if (filter.type === 'in') return filter.values.includes(row[filter.key]);
			return true;
		});
	}

	return {
		tables,
		profileUpserts,
		from(tableName) {
			const rows = tables[tableName];
			assert.ok(rows, `Unexpected table ${tableName}`);
			const filters = [];
			let pendingUpdate = null;

			const execute = () => {
				const matched = rows.filter((row) => matchesFilters(row, filters));
				if (pendingUpdate) {
					for (const row of matched) {
						Object.assign(row, pendingUpdate);
					}
				}
				return {
					data: matched.map((row) => ({ ...row })),
					error: null
				};
			};

			const builder = {
				select() {
					return builder;
				},
				update(values) {
					pendingUpdate = { ...values };
					return builder;
				},
				upsert(payload, options = {}) {
					const conflictKey = options.onConflict || 'id';
					if (tableName === 'profiles') {
						profileUpserts.push({ ...payload });
					}
					const existing = rows.find((row) => row[conflictKey] === payload[conflictKey]);
					if (existing) {
						Object.assign(existing, payload);
					} else {
						rows.push({ ...payload });
					}
					return Promise.resolve({ data: { ...payload }, error: null });
				},
				eq(key, value) {
					filters.push({ type: 'eq', key, value });
					return builder;
				},
				neq(key, value) {
					filters.push({ type: 'neq', key, value });
					return builder;
				},
				in(key, values) {
					filters.push({ type: 'in', key, values });
					return builder;
				},
				async maybeSingle() {
					const { data, error } = execute();
					return { data: data[0] ?? null, error };
				},
				async single() {
					const { data, error } = execute();
					if (!data.length) {
						return { data: null, error: { message: `No ${tableName} row matched` } };
					}
					return { data: data[0], error };
				},
				then(resolve, reject) {
					return Promise.resolve(execute()).then(resolve, reject);
				}
			};

			return builder;
		}
	};
}

test('split management views open Program and Tiers automatically when zero active tiers exist', () => {
	assert.equal(resolveInitialMembershipManageView({ tiers: [] }), 'program');
	assert.equal(
		resolveInitialMembershipManageView({
			tiers: [{ id: 'tier-archived', is_active: false }]
		}),
		'program'
	);
	assert.equal(
		resolveInitialMembershipManageView({
			tiers: [{ id: 'tier-1', is_active: true }]
		}),
		'members'
	);
	assert.equal(
		resolveInitialMembershipManageView({
			requestedView: 'program',
			tiers: [{ id: 'tier-1', is_active: true }]
		}),
		'program'
	);
	assert.equal(
		resolveInitialMembershipManageView({
			requestedView: 'members',
			tiers: []
		}),
		'members'
	);
	assert.equal(normalizeMembershipManageViewParam('program-and-tiers'), 'program');
	assert.equal(normalizeMembershipManageViewParam('roster'), 'members');
	assert.equal(normalizeMembershipManageViewParam('unknown'), '');
});

test('unified Program and Tiers save updates rules, policy_version, in-place tier edits, and synchronized default tier in one operation', async () => {
	const store = createMembershipSupabaseMock({
		programs: [
			{
				id: 'prog-1',
				group_id: 'group-1',
				enabled: true,
				access_mode: 'public',
				contribution_mode: 'donation',
				cta_label: 'Follow',
				policy_markdown: 'Original policy v1',
				policy_version: 1,
				policy_updated_at: null,
				default_tier_id: 'tier-1'
			}
		],
		tiers: [
			{
				id: 'tier-1',
				program_id: 'prog-1',
				name: 'Neighbor',
				description: 'Free tier',
				amount_cents: 0,
				monthly_amount_cents: 0,
				annual_amount_cents: null,
				currency: 'usd',
				billing_type: 'recurring',
				interval_unit: 'month',
				interval_count: 1,
				is_default: true,
				is_active: true,
				sort_order: 0,
				allow_custom_amount: false,
				min_amount_cents: null,
				stripe_price_id: null,
				stripe_product_id: null,
				stripe_monthly_price_id: null,
				stripe_annual_price_id: null,
				stripe_account_id: null
			},
			{
				id: 'tier-2',
				program_id: 'prog-1',
				name: 'Supporter',
				description: 'Monthly supporter',
				amount_cents: 1000,
				monthly_amount_cents: 1000,
				annual_amount_cents: 10000,
				currency: 'usd',
				billing_type: 'recurring',
				interval_unit: 'month',
				interval_count: 1,
				is_default: false,
				is_active: true,
				sort_order: 1,
				allow_custom_amount: false,
				min_amount_cents: null,
				stripe_price_id: 'price_old_month',
				stripe_product_id: 'prod_existing',
				stripe_monthly_price_id: 'price_old_month',
				stripe_annual_price_id: 'price_old_year',
				stripe_account_id: 'acct_123'
			}
		]
	});

	const auditedTierIds = [];
	const result = await executeUnifiedProgramAndTiersSave({
		serviceSupabase: store,
		before: store.tables.group_membership_programs[0],
		existingTiers: store.tables.group_membership_tiers,
		now: '2026-11-21T20:00:00.000Z',
		payload: {
			enabled: true,
			access_mode: 'private_request',
			contribution_mode: 'paid',
			cta_label: 'Join the Club',
			policy_markdown: 'Updated club policy v2 with annual terms.',
			default_tier_id: 'tier-2',
			tiers: [
				{
					id: 'tier-1',
					name: 'Community Rider',
					monthly_amount_cents: 500,
					annual_amount_cents: 5000,
					is_active: true
				},
				{
					id: 'tier-2',
					name: 'Advocate Plus',
					monthly_amount_cents: 1500,
					annual_amount_cents: 15000,
					is_active: true
				}
			]
		},
		onTierUpdated: async (_before, updated) => {
			auditedTierIds.push(updated.id);
		}
	});

	assert.equal(result.ok, true);
	assert.equal(result.policyChanged, true);
	assert.equal(result.shouldBumpPolicyVersion, true);
	assert.deepEqual(auditedTierIds, ['tier-1', 'tier-2']);

	const savedProgram = store.tables.group_membership_programs[0];
	assert.equal(savedProgram.access_mode, 'private_request');
	assert.equal(savedProgram.contribution_mode, 'paid');
	assert.equal(savedProgram.cta_label, 'Join the Club');
	assert.equal(savedProgram.policy_markdown, 'Updated club policy v2 with annual terms.');
	assert.equal(savedProgram.policy_version, 2);
	assert.equal(savedProgram.policy_updated_at, '2026-11-21T20:00:00.000Z');
	assert.equal(savedProgram.default_tier_id, 'tier-2');

	const tier1 = store.tables.group_membership_tiers.find((row) => row.id === 'tier-1');
	const tier2 = store.tables.group_membership_tiers.find((row) => row.id === 'tier-2');
	assert.equal(tier1.name, 'Community Rider');
	assert.equal(tier1.monthly_amount_cents, 500);
	assert.equal(tier1.is_default, false);
	assert.equal(tier2.name, 'Advocate Plus');
	assert.equal(tier2.monthly_amount_cents, 1500);
	assert.equal(tier2.annual_amount_cents, 15000);
	assert.equal(tier2.is_default, true);
	assert.equal(tier2.stripe_monthly_price_id, null);
	assert.equal(tier2.stripe_annual_price_id, null);
});

test('Stripe disconnect guard blocks disconnects with a Program and Tiers link while active paid tiers or subscriptions exist', async () => {
	const store = createMembershipSupabaseMock({
		programs: [{ id: 'prog-1', group_id: 'group-1', enabled: true, contribution_mode: 'donation' }],
		tiers: [
			{
				id: 'tier-paid',
				program_id: 'prog-1',
				is_active: true,
				amount_cents: 1200,
				monthly_amount_cents: 1200,
				annual_amount_cents: 12000,
				allow_custom_amount: false
			}
		],
		memberships: [
			{ id: 'mem-1', group_id: 'group-1', status: 'active' },
			{ id: 'mem-2', group_id: 'group-1', status: 'past_due' }
		],
		billings: [{ membership_id: 'mem-1', stripe_subscription_id: 'sub_live_123' }]
	});

	const blocked = await getGroupStripeBillingGuard(store, 'group-1', 'metro-velo');
	assert.equal(blocked.can_disconnect, false);
	assert.equal(blocked.active_paid_tier_count, 1);
	assert.equal(blocked.active_subscription_count, 1);
	assert.equal(blocked.past_due_count, 1);
	assert.equal(blocked.manage_url, '/groups/metro-velo/manage/membership?view=program');
	assert.equal(blocked.manage_url, buildProgramAndTiersPath('metro-velo'));
	assert.match(blocked.block_reason, /1 active paid tier/);
	assert.match(blocked.block_reason, /1 active member subscription/);
	assert.match(blocked.block_reason, /Program and Tiers/);

	const allowed = evaluateStripeBillingGuard({
		program: { id: 'prog-1', enabled: true, contribution_mode: 'donation' },
		tiers: [{ id: 'tier-free', is_active: true, amount_cents: 0, monthly_amount_cents: 0 }],
		memberships: [{ id: 'mem-free', status: 'active' }],
		billings: [{ membership_id: 'mem-free', stripe_subscription_id: null }],
		groupSlug: 'metro-velo'
	});
	assert.equal(allowed.can_disconnect, true);
	assert.equal(allowed.block_reason, '');
});

test('guest magic-link return path round-trips name, email, phone, annual interval, and custom amount safely', () => {
	const returnTo = buildMembershipReturnPath({
		slug: 'metro-velo',
		tierId: 'tier-pwyw',
		billingInterval: 'year',
		customAmount: '75.50',
		fullName: 'Alex Rider',
		email: 'Alex@Example.com',
		phone: '(555) 019-2834'
	});

	assert.equal(isSafeInternalPath(returnTo), true);
	const restored = parseMembershipHandoffParams(returnTo);
	assert.deepEqual(restored, {
		tier: 'tier-pwyw',
		interval: 'year',
		amount: '75.50',
		name: 'Alex Rider',
		email: 'alex@example.com',
		phone: '(555) 019-2834'
	});

	const legacyMicrosite = parseMembershipHandoffParams(
		'/groups/metro-velo/membership?tier=tier-supporter&interval=annual&custom_amount=40'
	);
	assert.equal(legacyMicrosite.tier, 'tier-supporter');
	assert.equal(legacyMicrosite.interval, 'year');
	assert.equal(legacyMicrosite.amount, '40');

	assert.equal(buildMembershipReturnPath({ slug: '' }), '/');
	const sanitized = buildMembershipReturnPath({
		slug: 'metro-velo',
		customAmount: '-99',
		fullName: 'Safe\nHeader\\Name'
	});
	assert.equal(isSafeInternalPath(sanitized), true);
	assert.equal(parseMembershipHandoffParams(sanitized).amount, '');
	assert.equal(parseMembershipHandoffParams(sanitized).name, 'SafeHeaderName');
});

test('submitting a club join form with alternate display name or phone leaves an existing user global profile unchanged', async () => {
	const store = createMembershipSupabaseMock({
		profiles: [
			{
				user_id: 'user-existing',
				email: 'casey@global.example',
				full_name: 'Casey Global',
				phone: '555-100-2000',
				avatar_url: 'https://example.org/avatar.png',
				bio: 'Road captain',
				metadata: { club: 'main' }
			},
			{
				user_id: 'user-new-magic-link',
				email: null,
				full_name: null,
				phone: '555-222-3333',
				avatar_url: null,
				bio: null,
				metadata: {}
			}
		]
	});

	const clubFormSubmission = {
		full_name: 'Casey Track Alias',
		email: 'alias@club.example',
		phone: '555-999-8888'
	};

	const scopedColumns = extractScopedContactColumns(clubFormSubmission);
	assert.deepEqual(scopedColumns, {
		contact_full_name: 'Casey Track Alias',
		contact_email: 'alias@club.example',
		contact_phone: '555-999-8888'
	});

	const existingResult = await ensureUserGlobalProfileDefaults({
		serviceSupabase: store,
		userId: 'user-existing',
		currentEmail: 'casey@global.example',
		profilePayload: clubFormSubmission
	});
	assert.equal(existingResult.updated, false);
	assert.equal(store.profileUpserts.length, 0);

	const untouchedGlobal = store.tables.profiles.find((row) => row.user_id === 'user-existing');
	assert.equal(untouchedGlobal.full_name, 'Casey Global');
	assert.equal(untouchedGlobal.email, 'casey@global.example');
	assert.equal(untouchedGlobal.phone, '555-100-2000');

	const mergedForClubRoster = mergeScopedMemberContact(
		{ user_id: 'user-existing', ...scopedColumns },
		untouchedGlobal
	);
	assert.equal(mergedForClubRoster.full_name, 'Casey Track Alias');
	assert.equal(mergedForClubRoster.email, 'alias@club.example');
	assert.equal(mergedForClubRoster.phone, '555-999-8888');

	const newUserResult = await ensureUserGlobalProfileDefaults({
		serviceSupabase: store,
		userId: 'user-new-magic-link',
		currentEmail: 'newrider@example.com',
		profilePayload: {
			full_name: 'New Rider',
			email: 'newrider@example.com',
			phone: '555-777-6666'
		}
	});
	assert.equal(newUserResult.updated, true);
	const backfilledProfile = store.tables.profiles.find(
		(row) => row.user_id === 'user-new-magic-link'
	);
	assert.equal(backfilledProfile.full_name, 'New Rider');
	assert.equal(backfilledProfile.email, 'newrider@example.com');
	assert.equal(backfilledProfile.phone, '555-222-3333');

	const noRowBackfill = computeGlobalProfileBackfill(null, {
		currentEmail: 'brandnew@example.com',
		profilePayload: { full_name: 'Brand New', phone: '555-444-5555' }
	});
	assert.equal(noRowBackfill.shouldUpdate, true);
	assert.deepEqual(noRowBackfill.updates, {
		email: 'brandnew@example.com',
		full_name: 'Brand New',
		phone: null
	});
});
