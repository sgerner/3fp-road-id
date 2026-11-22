import assert from 'node:assert/strict';
import test from 'node:test';
import {
	PUBLIC_MEMBERSHIP_FORM_FIELD_COLUMNS,
	PUBLIC_MEMBERSHIP_GROUP_COLUMNS,
	PUBLIC_MEMBERSHIP_PROGRAM_COLUMNS,
	PUBLIC_MEMBERSHIP_TIER_COLUMNS,
	getPublicMembershipProgram,
	resolveMembershipProgramForViewer,
	resolveViewerIncludeInactive
} from './groupMembershipPublic.js';

function createSupabaseStub(handlers = {}) {
	const queries = [];

	function createBuilder(table) {
		const record = { table, operations: [] };
		queries.push(record);
		const handler = handlers[table] ?? (() => ({ data: null, error: null }));

		return {
			select(columns, options) {
				record.operations.push({ method: 'select', columns, ...(options ? { options } : {}) });
				return this;
			},
			eq(column, value) {
				record.operations.push({ method: 'eq', column, value });
				return this;
			},
			order(column, options) {
				record.operations.push({ method: 'order', column, options });
				return this;
			},
			maybeSingle() {
				record.operations.push({ method: 'maybeSingle' });
				return Promise.resolve(handler(record));
			},
			then(resolve, reject) {
				return Promise.resolve(handler(record)).then(resolve, reject);
			}
		};
	}

	return {
		queries,
		from(table) {
			return createBuilder(table);
		}
	};
}

test('getPublicMembershipProgram enforces visibility predicates, public projections, and Stripe redaction', async () => {
	const serviceSupabase = createSupabaseStub({
		groups: () => ({
			data: {
				id: 'group_tbag',
				slug: 'tempe-bicycle-action-group',
				name: 'Tempe Bicycle Action Group',
				website_url: 'https://biketempe.org',
				social_links: { instagram: 'https://instagram.com/biketempe' },
				public_contact_email: 'info@biketempe.org',
				is_published: true,
				private_internal_col: 'secret'
			},
			error: null
		}),
		donation_accounts: () => ({
			data: {
				id: 'acct_row_1',
				stripe_account_id: 'acct_123456789',
				charges_enabled: true
			},
			error: null
		}),
		group_membership_programs: () => ({
			data: {
				id: 'prog_tbag',
				group_id: 'group_tbag',
				enabled: true,
				access_mode: 'public',
				cta_label: 'Follow',
				contribution_mode: 'donation',
				default_tier_id: 'tier_active',
				policy_markdown: 'Be kind.',
				policy_version: 2,
				policy_updated_at: '2026-06-01T00:00:00Z',
				created_at: '2026-03-01T00:00:00Z',
				updated_at: '2026-06-01T00:00:00Z'
			},
			error: null
		}),
		group_membership_tiers: () => ({
			data: [
				{
					id: 'tier_active',
					program_id: 'prog_tbag',
					name: 'Neighbor',
					description: 'Free follow tier',
					amount_cents: 0,
					monthly_amount_cents: 0,
					annual_amount_cents: null,
					currency: 'usd',
					billing_type: 'one_time',
					interval_unit: null,
					interval_count: null,
					is_default: true,
					is_active: true,
					sort_order: 0,
					allow_custom_amount: false,
					min_amount_cents: null,
					stripe_price_id: 'price_secret',
					stripe_product_id: 'prod_secret',
					stripe_monthly_price_id: 'price_month_secret',
					stripe_annual_price_id: 'price_year_secret',
					stripe_account_id: 'acct_123456789',
					created_at: '2026-03-01T00:00:00Z',
					updated_at: '2026-03-01T00:00:00Z'
				},
				{
					id: 'tier_inactive',
					program_id: 'prog_tbag',
					name: 'Legacy Tier',
					is_active: false
				}
			],
			error: null
		}),
		group_membership_form_fields: () => ({
			data: [
				{
					id: 'field_active',
					program_id: 'prog_tbag',
					field_type: 'textarea',
					label: 'Why join?',
					help_text: 'Optional',
					required: false,
					options_json: [],
					sort_order: 10,
					active: true,
					created_at: '2026-03-01T00:00:00Z',
					updated_at: '2026-03-01T00:00:00Z'
				},
				{
					id: 'field_inactive',
					program_id: 'prog_tbag',
					field_type: 'text',
					label: 'Archived field',
					active: false
				}
			],
			error: null
		})
	});

	const result = await getPublicMembershipProgram(serviceSupabase, 'tempe-bicycle-action-group');

	assert.equal(result.ok, true);
	assert.equal(result.data.can_manage, false);
	assert.deepEqual(result.data.stripe_connection, {
		connected: true,
		charges_enabled: true,
		stripe_account_id: null
	});
	assert.equal(result.data.tiers.length, 1);
	assert.equal(result.data.tiers[0].id, 'tier_active');
	assert.equal('stripe_account_id' in result.data.tiers[0], false);
	assert.equal('stripe_price_id' in result.data.tiers[0], false);
	assert.equal('stripe_product_id' in result.data.tiers[0], false);
	assert.equal('stripe_monthly_price_id' in result.data.tiers[0], false);
	assert.equal('stripe_annual_price_id' in result.data.tiers[0], false);
	assert.equal('private_internal_col' in result.data.group, false);
	assert.equal(result.data.form_fields.length, 1);
	assert.equal(result.data.form_fields[0].id, 'field_active');

	const byTable = Object.fromEntries(serviceSupabase.queries.map((q) => [q.table, q.operations]));
	assert.deepEqual(byTable.groups, [
		{ method: 'select', columns: PUBLIC_MEMBERSHIP_GROUP_COLUMNS },
		{ method: 'eq', column: 'slug', value: 'tempe-bicycle-action-group' },
		{ method: 'eq', column: 'is_published', value: true },
		{ method: 'maybeSingle' }
	]);
	assert.deepEqual(byTable.group_membership_programs, [
		{ method: 'select', columns: PUBLIC_MEMBERSHIP_PROGRAM_COLUMNS },
		{ method: 'eq', column: 'group_id', value: 'group_tbag' },
		{ method: 'eq', column: 'enabled', value: true },
		{ method: 'eq', column: 'access_mode', value: 'public' },
		{ method: 'maybeSingle' }
	]);
	assert.deepEqual(byTable.group_membership_tiers, [
		{ method: 'select', columns: PUBLIC_MEMBERSHIP_TIER_COLUMNS },
		{ method: 'eq', column: 'program_id', value: 'prog_tbag' },
		{ method: 'eq', column: 'is_active', value: true },
		{ method: 'order', column: 'sort_order', options: { ascending: true } },
		{ method: 'order', column: 'created_at', options: { ascending: true } }
	]);
	assert.deepEqual(byTable.group_membership_form_fields, [
		{ method: 'select', columns: PUBLIC_MEMBERSHIP_FORM_FIELD_COLUMNS },
		{ method: 'eq', column: 'program_id', value: 'prog_tbag' },
		{ method: 'eq', column: 'active', value: true },
		{ method: 'order', column: 'sort_order', options: { ascending: true } },
		{ method: 'order', column: 'created_at', options: { ascending: true } }
	]);

	assert.equal(PUBLIC_MEMBERSHIP_TIER_COLUMNS.includes('stripe_'), false);
	assert.equal(PUBLIC_MEMBERSHIP_PROGRAM_COLUMNS.includes('*'), false);
});

for (const scenario of [
	{
		name: 'disabled program',
		programRow: {
			id: 'prog_disabled',
			group_id: 'group_1',
			enabled: false,
			access_mode: 'public'
		}
	},
	{
		name: 'private_request program',
		programRow: {
			id: 'prog_private',
			group_id: 'group_1',
			enabled: true,
			access_mode: 'private_request'
		}
	}
]) {
	test(`getPublicMembershipProgram returns null program and empty arrays for ${scenario.name}`, async () => {
		const serviceSupabase = createSupabaseStub({
			groups: () => ({
				data: { id: 'group_1', slug: 'club', name: 'Club', is_published: true },
				error: null
			}),
			donation_accounts: () => ({ data: null, error: null }),
			group_membership_programs: () => ({
				data: scenario.programRow,
				error: null
			}),
			group_membership_tiers: () => {
				assert.fail('tiers should not be queried for non-public or disabled programs');
			},
			group_membership_form_fields: () => {
				assert.fail('form_fields should not be queried for non-public or disabled programs');
			}
		});

		const result = await getPublicMembershipProgram(serviceSupabase, 'club');
		assert.equal(result.ok, true);
		assert.equal(result.data.program, null);
		assert.deepEqual(result.data.tiers, []);
		assert.deepEqual(result.data.form_fields, []);
		assert.equal(result.data.can_manage, false);
	});
}

test('getPublicMembershipProgram returns 404 when group is unpublished or missing', async () => {
	const serviceSupabase = createSupabaseStub({
		groups: () => ({ data: null, error: null })
	});

	const result = await getPublicMembershipProgram(serviceSupabase, 'unpublished-group');
	assert.deepEqual(result, { ok: false, status: 404, error: 'Group not found.' });
});

test('resolveMembershipProgramForViewer routes anonymous callers to public service and ignores includeInactive', async () => {
	assert.equal(resolveViewerIncludeInactive(true, { canManage: false }), false);
	assert.equal(resolveViewerIncludeInactive(true, { canManage: true }), true);

	const serviceSupabase = createSupabaseStub({
		groups: () => ({
			data: { id: 'group_1', slug: 'public-club', name: 'Public Club', is_published: true },
			error: null
		}),
		donation_accounts: () => ({ data: null, error: null }),
		group_membership_programs: () => ({ data: null, error: null })
	});

	const requestSupabase = {
		from() {
			assert.fail('anonymous viewer should not query requestSupabase');
		}
	};

	const result = await resolveMembershipProgramForViewer({
		viewer: { userId: null, isAdmin: false, requestSupabase },
		serviceSupabase,
		groupSlug: 'public-club',
		includeInactive: true,
		loadGroupBySlugFn: () => assert.fail('loadGroupBySlugFn should not run for anonymous viewer')
	});

	assert.equal(result.ok, true);
	assert.equal(result.data.program, null);
	assert.equal(result.data.can_manage, false);
});

test('resolveMembershipProgramForViewer keeps signed-in riders on requestSupabase for invite-only programs while forcing includeInactive false', async () => {
	const requestSupabase = { kind: 'user-scoped' };
	const serviceSupabase = { kind: 'service-role' };
	let capturedProgramClient = null;
	let capturedBundleArgs = null;

	const result = await resolveMembershipProgramForViewer({
		viewer: { userId: 'rider_1', isAdmin: false, requestSupabase },
		serviceSupabase,
		groupSlug: 'invite-club',
		includeInactive: true,
		loadGroupBySlugFn: async (client, slug) => {
			assert.equal(client, requestSupabase);
			assert.equal(slug, 'invite-club');
			return { id: 'group_invite', slug: 'invite-club', name: 'Invite Club' };
		},
		isGroupManagerFn: async () => false,
		loadDonationAccountFn: async () => ({
			id: 'acct_1',
			stripe_account_id: 'acct_secret_999',
			charges_enabled: true
		}),
		ensureProgramFn: async () => assert.fail('non-manager must not call ensureProgram'),
		loadProgramFn: async (client) => {
			capturedProgramClient = client;
			return {
				id: 'prog_invite',
				group_id: 'group_invite',
				enabled: true,
				access_mode: 'private_request'
			};
		},
		ensureDefaultApplicationFieldsFn: async () => {},
		loadProgramBundleFn: async (client, programId, options) => {
			capturedBundleArgs = { client, programId, options };
			return {
				tiers: [
					{
						id: 'tier_1',
						program_id: 'prog_invite',
						name: 'Invite Tier',
						is_active: true,
						stripe_account_id: 'acct_secret_999',
						stripe_price_id: 'price_secret'
					}
				],
				fields: [{ id: 'field_1', label: 'Why join?', active: true }]
			};
		}
	});

	assert.equal(capturedProgramClient, requestSupabase);
	assert.deepEqual(capturedBundleArgs, {
		client: requestSupabase,
		programId: 'prog_invite',
		options: { includeInactive: false }
	});
	assert.equal(result.ok, true);
	assert.equal(result.data.program.access_mode, 'private_request');
	assert.equal(result.data.stripe_connection.stripe_account_id, null);
	assert.equal('stripe_account_id' in result.data.tiers[0], false);
	assert.equal('stripe_price_id' in result.data.tiers[0], false);
	assert.equal(result.data.can_manage, false);
});

test('resolveMembershipProgramForViewer preserves inactive tiers and stripe_account_id for managers', async () => {
	const requestSupabase = { kind: 'user-scoped' };
	const serviceSupabase = { kind: 'service-role' };
	let capturedBundleOptions = null;

	const result = await resolveMembershipProgramForViewer({
		viewer: { userId: 'manager_1', isAdmin: false, requestSupabase },
		serviceSupabase,
		groupSlug: 'managed-club',
		includeInactive: true,
		loadGroupBySlugFn: async () => ({
			id: 'group_managed',
			slug: 'managed-club',
			name: 'Managed Club'
		}),
		isGroupManagerFn: async () => true,
		loadDonationAccountFn: async () => ({
			id: 'acct_1',
			stripe_account_id: 'acct_manager_visible',
			charges_enabled: true
		}),
		ensureProgramFn: async (client) => {
			assert.equal(client, serviceSupabase);
			return {
				id: 'prog_managed',
				group_id: 'group_managed',
				enabled: false,
				access_mode: 'private_request'
			};
		},
		loadProgramFn: async () => assert.fail('manager should use ensureProgramFn'),
		loadProgramBundleFn: async (client, _programId, options) => {
			assert.equal(client, serviceSupabase);
			capturedBundleOptions = options;
			return {
				tiers: [
					{
						id: 'tier_inactive',
						name: 'Inactive Tier',
						is_active: false,
						stripe_account_id: 'acct_manager_visible'
					}
				],
				fields: [{ id: 'field_inactive', active: false }]
			};
		}
	});

	assert.deepEqual(capturedBundleOptions, { includeInactive: true });
	assert.equal(result.ok, true);
	assert.equal(result.data.can_manage, true);
	assert.equal(result.data.stripe_connection.stripe_account_id, 'acct_manager_visible');
	assert.equal(result.data.tiers[0].stripe_account_id, 'acct_manager_visible');
	assert.equal(result.data.tiers[0].is_active, false);
});
