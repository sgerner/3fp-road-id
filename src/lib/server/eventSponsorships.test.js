import assert from 'node:assert/strict';
import test from 'node:test';
import {
	cancelEventSponsorshipRequestCore,
	createOrUpdateEventSponsorshipRequestCore,
	listGroupSponsorshipRequestsCore,
	resolveUpdatedRideHostUserId,
	reviewEventSponsorshipRequestCore,
	shouldAuthorizeRideHostGroupChange
} from './eventSponsorshipsCore.js';

function createInMemorySponsorshipDb() {
	const state = {
		groups: [
			{
				id: 'group-claimed',
				name: 'Desert Wheelmen',
				slug: 'desert-wheelmen',
				city: 'Phoenix',
				state_region: 'AZ',
				public_contact_email: 'board@desertwheelmen.example'
			},
			{
				id: 'group-unclaimed',
				name: 'Tempe Pedalers',
				slug: 'tempe-pedalers',
				city: 'Tempe',
				state_region: 'AZ',
				public_contact_email: null
			},
			{
				id: 'group-managed',
				name: 'Organizer Own Club',
				slug: 'organizer-own-club',
				city: 'Mesa',
				state_region: 'AZ',
				public_contact_email: null
			}
		],
		group_members: [
			{ group_id: 'group-claimed', user_id: 'club-owner-1', role: 'owner' },
			{ group_id: 'group-managed', user_id: 'organizer-1', role: 'owner' }
		],
		profiles: [
			{
				user_id: 'organizer-1',
				full_name: 'Alex Rider',
				email: 'alex@organizer.example',
				admin: false
			},
			{
				user_id: 'club-owner-1',
				full_name: 'Jordan Board',
				email: 'jordan@club.example',
				admin: false
			}
		],
		activity_events: [
			{
				id: 'ride-1',
				activity_type: 'ride',
				title: 'Sunrise Canal Roll',
				slug: 'sunrise-canal-roll',
				status: 'published',
				starts_at: '2026-12-05T14:00:00.000Z',
				ends_at: '2026-12-05T16:00:00.000Z',
				timezone: 'America/Phoenix',
				host_user_id: 'organizer-1',
				created_by_user_id: 'organizer-1',
				host_group_id: null,
				contact_email: 'alex@organizer.example'
			}
		],
		volunteer_events: [],
		activity_hosts: [],
		volunteer_event_hosts: [],
		event_sponsorship_requests: []
	};

	let seq = 1;

	function makeQuery(table) {
		const filters = [];
		let pendingUpdate = null;
		let pendingInsert = null;
		let headOptions = null;

		const applyFilters = (rows) =>
			rows.filter((row) => filters.every((predicate) => predicate(row)));

		const execute = () => {
			const tableRows = state[table];
			if (!tableRows) throw new Error(`Unknown table: ${table}`);

			if (pendingInsert) {
				const inserted = {
					id: pendingInsert.id || `req-${seq++}`,
					...pendingInsert
				};
				tableRows.push(inserted);
				return { data: [inserted], count: 1, error: null };
			}

			const matched = applyFilters(tableRows);

			if (pendingUpdate) {
				for (const row of matched) {
					Object.assign(row, pendingUpdate);
				}
				return { data: matched.map((r) => ({ ...r })), count: matched.length, error: null };
			}

			if (headOptions?.head) {
				return { data: null, count: matched.length, error: null };
			}

			return { data: matched.map((r) => ({ ...r })), count: matched.length, error: null };
		};

		return {
			select(_cols, options) {
				headOptions = options || null;
				return this;
			},
			insert(payload) {
				pendingInsert = payload;
				return this;
			},
			update(patch) {
				pendingUpdate = patch;
				return this;
			},
			eq(col, val) {
				filters.push((row) => String(row[col] ?? '') === String(val ?? ''));
				return this;
			},
			in(col, vals) {
				const allowed = new Set((vals ?? []).map((v) => String(v)));
				filters.push((row) => allowed.has(String(row[col] ?? '')));
				return this;
			},
			order() {
				return this;
			},
			limit() {
				return this;
			},
			maybeSingle() {
				const res = execute();
				return Promise.resolve({ data: res.data?.[0] ?? null, error: res.error });
			},
			single() {
				const res = execute();
				return Promise.resolve({ data: res.data?.[0] ?? null, error: res.error });
			},
			then(resolve, reject) {
				return Promise.resolve(execute()).then(resolve, reject);
			}
		};
	}

	return {
		state,
		client: {
			from(table) {
				return makeQuery(table);
			}
		}
	};
}

test('sponsorship lifecycle: request under personal hosting, notify managers without spam, list, and approve in one click', async () => {
	const db = createInMemorySponsorshipDb();
	const sentEmails = [];
	const sendEmailStub = async (payload) => {
		sentEmails.push(payload);
	};

	// Unclaimed group is rejected with clear guidance to claim inline
	const unclaimedRes = await createOrUpdateEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'organizer-1', email: 'alex@organizer.example' },
		eventType: 'ride',
		eventId: 'ride-1',
		groupId: 'group-unclaimed',
		sendEmailFn: sendEmailStub
	});
	assert.equal(unclaimedRes.ok, false);
	assert.equal(unclaimedRes.status, 409);
	assert.equal(unclaimedRes.code, 'GROUP_UNCLAIMED');

	// Managed group is rejected with guidance to attach directly
	const managedRes = await createOrUpdateEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'organizer-1', email: 'alex@organizer.example' },
		eventType: 'ride',
		eventId: 'ride-1',
		groupId: 'group-managed',
		sendEmailFn: sendEmailStub
	});
	assert.equal(managedRes.ok, false);
	assert.equal(managedRes.status, 409);
	assert.equal(managedRes.code, 'GROUP_ALREADY_MANAGED');

	// Claimed external group creates pending request, keeps host_group_id null, and emails club manager
	const createdRes = await createOrUpdateEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'organizer-1', email: 'alex@organizer.example' },
		eventType: 'ride',
		eventId: 'ride-1',
		groupId: 'group-claimed',
		message: 'Happy to co-promote safety marshals!',
		sendEmailFn: sendEmailStub,
		publicOrigin: 'https://3fp.org'
	});
	assert.equal(createdRes.ok, true);
	assert.equal(createdRes.status, 201);
	assert.equal(createdRes.notified, true);
	assert.equal(createdRes.data.status, 'pending');
	assert.equal(db.state.activity_events[0].host_group_id, null);
	assert.equal(sentEmails.length, 1);
	assert.deepEqual(sentEmails[0].to, ['jordan@club.example']);
	assert.match(sentEmails[0].text, /\/groups\/desert-wheelmen\/manage#sponsorship-requests/);

	// Duplicate submission for same (event, group) updates message without re-sending email
	const duplicateRes = await createOrUpdateEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'organizer-1', email: 'alex@organizer.example' },
		eventType: 'ride',
		eventId: 'ride-1',
		groupId: 'group-claimed',
		message: 'Updated note with route link',
		sendEmailFn: sendEmailStub
	});
	assert.equal(duplicateRes.ok, true);
	assert.equal(duplicateRes.status, 200);
	assert.equal(duplicateRes.notified, false);
	assert.equal(sentEmails.length, 1);

	// Club manager lists pending requests in workspace
	const listed = await listGroupSponsorshipRequestsCore({
		serviceSupabase: db.client,
		groupId: 'group-claimed',
		group: db.state.groups[0]
	});
	assert.equal(listed.length, 1);
	assert.equal(listed[0].eventTitle, 'Sunrise Canal Roll');
	assert.equal(listed[0].message, 'Updated note with route link');

	// Non-manager cannot approve
	const unauthorizedReview = await reviewEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'organizer-1' },
		groupSlug: 'desert-wheelmen',
		requestId: createdRes.data.id,
		decision: 'approve',
		sendEmailFn: sendEmailStub
	});
	assert.equal(unauthorizedReview.ok, false);
	assert.equal(unauthorizedReview.status, 403);

	// Club owner approves in one click -> attaches host_group_id on event and emails organizer
	const approvedRes = await reviewEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'club-owner-1' },
		groupSlug: 'desert-wheelmen',
		requestId: createdRes.data.id,
		decision: 'approve',
		sendEmailFn: sendEmailStub
	});
	assert.equal(approvedRes.ok, true);
	assert.equal(approvedRes.data.status, 'approved');
	assert.equal(db.state.activity_events[0].host_group_id, 'group-claimed');
	assert.equal(sentEmails.length, 2);
	assert.deepEqual(sentEmails[1].to, ['alex@organizer.example']);
});

test('sponsorship decline and cancel keep event under personal hosting (host_group_id = null)', async () => {
	const db = createInMemorySponsorshipDb();
	const first = await createOrUpdateEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'organizer-1' },
		eventType: 'ride',
		eventId: 'ride-1',
		groupId: 'group-claimed'
	});
	assert.equal(first.ok, true);

	const declined = await reviewEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'club-owner-1' },
		groupSlug: 'desert-wheelmen',
		requestId: first.data.id,
		decision: 'decline',
		decisionNote: 'Schedule conflict this weekend'
	});
	assert.equal(declined.ok, true);
	assert.equal(declined.data.status, 'declined');
	assert.equal(db.state.activity_events[0].host_group_id, null);

	const second = await createOrUpdateEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'organizer-1' },
		eventType: 'ride',
		eventId: 'ride-1',
		groupId: 'group-claimed'
	});
	const cancelled = await cancelEventSponsorshipRequestCore({
		supabase: db.client,
		serviceSupabase: db.client,
		user: { id: 'organizer-1' },
		requestId: second.data.id
	});
	assert.equal(cancelled.ok, true);
	assert.equal(cancelled.data.cancelled, true);
});

test('co-host ride update helpers preserve unchanged host_group_id and primary host_user_id', () => {
	assert.equal(shouldAuthorizeRideHostGroupChange('group-1', 'group-1'), false);
	assert.equal(shouldAuthorizeRideHostGroupChange('group-1', null), false);
	assert.equal(shouldAuthorizeRideHostGroupChange('group-1', 'group-2'), true);
	assert.equal(shouldAuthorizeRideHostGroupChange(null, 'group-2'), true);

	// Co-host editing ride keeps original host_user_id intact
	assert.equal(
		resolveUpdatedRideHostUserId({
			existingHostUserId: 'primary-host',
			editorUserId: 'invited-cohost',
			isHost: true
		}),
		'primary-host'
	);

	// Primary host unchecking isHost clears host_user_id
	assert.equal(
		resolveUpdatedRideHostUserId({
			existingHostUserId: 'primary-host',
			editorUserId: 'primary-host',
			isHost: false
		}),
		null
	);
});
