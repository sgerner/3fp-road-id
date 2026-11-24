import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPhoneNumber } from '../utils/phone.js';
import {
	claimBraceletForUser,
	formatMedicationList,
	isValidRoadIdCode,
	reconcileRiderSafetyData,
	saveUnifiedRiderSafety,
	syncVolunteerContactToProfile,
	validateSafetyPayload
} from './roadIdProfile.js';

function createMockSupabase(initialTables = {}) {
	const operations = [];
	const state = {
		profiles: structuredClone(initialTables.profiles ?? []),
		road_id_profiles: structuredClone(initialTables.road_id_profiles ?? []),
		emergency_contacts: structuredClone(initialTables.emergency_contacts ?? []),
		qr_codes: structuredClone(initialTables.qr_codes ?? [])
	};
	let nextContactId =
		state.emergency_contacts.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;

	function matchesFilters(row, filters) {
		return filters.every((f) => {
			if (f.type === 'eq') return row[f.column] === f.value;
			if (f.type === 'is') return row[f.column] === f.value;
			return true;
		});
	}

	return {
		state,
		operations,
		from(table) {
			const ctx = {
				table,
				action: 'select',
				payload: null,
				onConflict: null,
				filters: [],
				orderCol: null,
				orderAsc: true,
				expectSingle: false,
				expectMaybeSingle: false
			};

			const execute = async () => {
				operations.push({ table: ctx.table, action: ctx.action });
				const rows = state[ctx.table];
				if (!rows) return { data: null, error: { message: `Unknown table ${ctx.table}` } };

				if (ctx.action === 'insert') {
					const items = Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload];
					// Enforce emergency_contacts RLS/FK invariant: road_id_profiles row must exist first
					if (ctx.table === 'emergency_contacts') {
						for (const item of items) {
							const hasOwner = state.road_id_profiles.some((rp) => rp.user_id === item.profile_id);
							if (!hasOwner) {
								return {
									data: null,
									error: { message: 'RLS violation: missing road_id_profiles row' }
								};
							}
						}
					}
					const inserted = items.map((item) => {
						const copy = { ...item };
						if (ctx.table === 'emergency_contacts' && (copy.id === undefined || copy.id === null)) {
							copy.id = nextContactId++;
						}
						if (ctx.table === 'profiles' && (copy.id === undefined || copy.id === null)) {
							copy.id = state.profiles.length + 1;
						}
						rows.push(copy);
						return { ...copy };
					});
					const out = ctx.expectSingle || ctx.expectMaybeSingle ? (inserted[0] ?? null) : inserted;
					return { data: out, error: null };
				}

				if (ctx.action === 'upsert') {
					const key = ctx.onConflict || 'id';
					const existingIdx = rows.findIndex((r) => r[key] === ctx.payload[key]);
					let saved;
					if (existingIdx >= 0) {
						rows[existingIdx] = { ...rows[existingIdx], ...ctx.payload };
						saved = { ...rows[existingIdx] };
					} else {
						saved = { ...ctx.payload };
						rows.push(saved);
					}
					return {
						data: ctx.expectSingle || ctx.expectMaybeSingle ? saved : [saved],
						error: null
					};
				}

				if (ctx.action === 'update') {
					const matched = [];
					for (let i = 0; i < rows.length; i += 1) {
						if (matchesFilters(rows[i], ctx.filters)) {
							rows[i] = { ...rows[i], ...ctx.payload };
							matched.push({ ...rows[i] });
						}
					}
					if (ctx.expectSingle) {
						return matched.length === 1
							? { data: matched[0], error: null }
							: { data: null, error: { message: 'Expected single row' } };
					}
					if (ctx.expectMaybeSingle) {
						return { data: matched[0] ?? null, error: null };
					}
					return { data: matched, error: null };
				}

				if (ctx.action === 'delete') {
					const kept = [];
					const deleted = [];
					for (const row of rows) {
						if (matchesFilters(row, ctx.filters)) deleted.push(row);
						else kept.push(row);
					}
					state[ctx.table] = kept;
					return { data: deleted, error: null };
				}

				let matched = rows.filter((row) => matchesFilters(row, ctx.filters)).map((r) => ({ ...r }));
				if (ctx.orderCol) {
					matched.sort((a, b) => {
						if (a[ctx.orderCol] < b[ctx.orderCol]) return ctx.orderAsc ? -1 : 1;
						if (a[ctx.orderCol] > b[ctx.orderCol]) return ctx.orderAsc ? 1 : -1;
						return 0;
					});
				}
				if (ctx.expectSingle) {
					return matched.length === 1
						? { data: matched[0], error: null }
						: { data: null, error: { message: 'Expected single row' } };
				}
				if (ctx.expectMaybeSingle) {
					return { data: matched[0] ?? null, error: null };
				}
				return { data: matched, error: null };
			};

			const builder = {
				select() {
					return builder;
				},
				insert(payload) {
					ctx.action = 'insert';
					ctx.payload = payload;
					return builder;
				},
				upsert(payload, opts = {}) {
					ctx.action = 'upsert';
					ctx.payload = payload;
					ctx.onConflict = opts.onConflict || null;
					return builder;
				},
				update(payload) {
					ctx.action = 'update';
					ctx.payload = payload;
					return builder;
				},
				delete() {
					ctx.action = 'delete';
					return builder;
				},
				eq(column, value) {
					ctx.filters.push({ type: 'eq', column, value });
					return builder;
				},
				is(column, value) {
					ctx.filters.push({ type: 'is', column, value });
					return builder;
				},
				order(column, opts = {}) {
					ctx.orderCol = column;
					ctx.orderAsc = opts.ascending !== false;
					return builder;
				},
				single() {
					ctx.expectSingle = true;
					return execute();
				},
				maybeSingle() {
					ctx.expectMaybeSingle = true;
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

test('formatPhoneNumber handles 10-digit, +1 E.164, and international numbers', () => {
	assert.equal(formatPhoneNumber('4805550123'), '(480) 555-0123');
	assert.equal(formatPhoneNumber('+14805550123'), '(480) 555-0123');
	assert.equal(formatPhoneNumber('1-480-555-0123'), '(480) 555-0123');
	assert.equal(formatPhoneNumber('+44 20 7946 0958'), '+442079460958');
});

test('reconcileRiderSafetyData merges bracelet and profile fields without blanking medical data', () => {
	const reconciled = reconcileRiderSafetyData({
		profileRow: {
			full_name: null,
			phone: '',
			emergency_contact_name: 'Taylor Rider',
			emergency_contact_phone: '480-555-0199'
		},
		roadIdRow: {
			full_name: 'Jordan Rider',
			phone: '+14805550100',
			blood_type: 'O-',
			allergies: 'Penicillin',
			medication: 'asprin, Albuterol'
		},
		emergencyContacts: []
	});

	assert.equal(reconciled.full_name, 'Jordan Rider');
	assert.equal(reconciled.phone, '+14805550100');
	assert.equal(reconciled.blood_type, 'O-');
	assert.equal(reconciled.allergies, 'Penicillin');
	assert.equal(reconciled.medication, 'Aspirin, Albuterol');
	assert.equal(reconciled.emergency_contacts.length, 1);
	assert.equal(reconciled.primary_emergency_contact.contact_name, 'Taylor Rider');
	assert.equal(reconciled.primary_emergency_contact.contact_phone, '480-555-0199');
});

test('validateSafetyPayload validates blood types and ignores completely blank draft contacts', () => {
	const invalidBlood = validateSafetyPayload({
		safety: { blood_type: 'Z+' }
	});
	assert.equal(invalidBlood.ok, false);

	const missingPhone = validateSafetyPayload({
		safety: {
			blood_type: 'A+',
			emergency_contacts: [{ contact_name: 'Sam', contact_phone: '', contact_relationship: '' }]
		}
	});
	assert.equal(missingPhone.ok, false);

	const valid = validateSafetyPayload({
		safety: {
			blood_type: 'AB+',
			allergies: ' Latex ',
			medication: 'asprin, Insulin ',
			emergency_contacts: [
				{ contact_name: '', contact_phone: '', contact_relationship: '' },
				{
					contact_name: 'Sam Rider',
					contact_phone: '(480) 555-0199',
					contact_relationship: 'Spouse'
				}
			]
		}
	});
	assert.equal(valid.ok, true);
	assert.equal(valid.value.blood_type, 'AB+');
	assert.equal(valid.value.allergies, 'Latex');
	assert.equal(valid.value.medication, 'Aspirin, Insulin');
	assert.equal(valid.value.emergency_contacts.length, 1);
	assert.equal(valid.value.emergency_contacts[0].contact_phone, '+14805550199');
});

test('saveUnifiedRiderSafety upserts road_id_profiles before emergency_contacts for zero-bracelet riders', async () => {
	const db = createMockSupabase();
	const parsed = validateSafetyPayload({
		safety: {
			blood_type: 'O+',
			allergies: 'Sulfa',
			medication: 'Albuterol',
			emergency_contacts: [
				{
					contact_name: 'Casey Rider',
					contact_phone: '480-555-0144',
					contact_relationship: 'Partner'
				}
			]
		}
	});
	assert.equal(parsed.ok, true);

	const saved = await saveUnifiedRiderSafety(db, 'user-1', {
		fullName: 'Alex Rider',
		phone: '+14805550111',
		safety: parsed.value,
		allowBlankIdentity: true
	});

	assert.equal(saved.roadIdProfile.blood_type, 'O+');
	assert.equal(saved.emergencyContacts.length, 1);
	assert.equal(saved.emergencyContacts[0].contact_name, 'Casey Rider');
	assert.equal(db.state.qr_codes.length, 0);

	// Partial update omitting medical fields must preserve blood_type, allergies, medication
	const partial = validateSafetyPayload({});
	const afterPartial = await saveUnifiedRiderSafety(db, 'user-1', {
		fullName: 'Alex Updated',
		phone: '',
		safety: partial.value,
		allowBlankIdentity: false
	});
	assert.equal(afterPartial.roadIdProfile.full_name, 'Alex Updated');
	assert.equal(afterPartial.roadIdProfile.phone, '+14805550111');
	assert.equal(afterPartial.roadIdProfile.blood_type, 'O+');
	assert.equal(afterPartial.roadIdProfile.allergies, 'Sulfa');
	assert.equal(afterPartial.roadIdProfile.medication, 'Albuterol');
});

test('syncVolunteerContactToProfile updates primary contact without clobbering medical fields or secondary contacts', async () => {
	const db = createMockSupabase({
		profiles: [
			{
				id: 1,
				user_id: 'user-2',
				full_name: 'Rider Two',
				phone: '+14805550102',
				emergency_contact_name: 'Old Contact',
				emergency_contact_phone: '+14805550188'
			}
		],
		road_id_profiles: [
			{
				user_id: 'user-2',
				full_name: 'Rider Two',
				phone: '+14805550102',
				blood_type: 'B-',
				allergies: 'Iodine',
				medication: 'Insulin'
			}
		],
		emergency_contacts: [
			{
				id: 10,
				profile_id: 'user-2',
				contact_name: 'Old Contact',
				contact_phone: '+14805550188',
				contact_relationship: 'Parent'
			},
			{
				id: 11,
				profile_id: 'user-2',
				contact_name: 'Backup Contact',
				contact_phone: '+14805550177',
				contact_relationship: 'Sibling'
			}
		]
	});

	const synced = await syncVolunteerContactToProfile(db, 'user-2', {
		fullName: 'Rider Two',
		phone: '480-555-0102',
		emergencyContactName: 'New Primary',
		emergencyContactPhone: '480-555-0199'
	});

	assert.equal(synced.profile.emergency_contact_name, 'New Primary');
	assert.equal(synced.profile.emergency_contact_phone, '+14805550199');
	assert.equal(synced.roadIdProfile.blood_type, 'B-');
	assert.equal(synced.roadIdProfile.allergies, 'Iodine');
	assert.equal(synced.emergencyContacts.length, 2);
	assert.equal(synced.emergencyContacts[0].contact_name, 'New Primary');
	assert.equal(synced.emergencyContacts[0].contact_relationship, 'Parent');
	assert.equal(synced.emergencyContacts[1].contact_name, 'Backup Contact');
});

test('claimBraceletForUser attaches unclaimed code and preserves existing rider and medical details', async () => {
	const db = createMockSupabase({
		profiles: [
			{
				id: 1,
				user_id: 'user-3',
				full_name: 'Morgan Rider',
				phone: '+14805550133',
				emergency_contact_name: 'Robin Rider',
				emergency_contact_phone: '+14805550166'
			}
		],
		road_id_profiles: [
			{
				user_id: 'user-3',
				full_name: '',
				phone: '',
				blood_type: 'A-',
				allergies: 'Bees',
				medication: ''
			}
		],
		emergency_contacts: [],
		qr_codes: [
			{ code: '3feetnew', profile_id: null },
			{ code: 'taken123', profile_id: 'other-user' }
		]
	});

	assert.equal(isValidRoadIdCode('3feetnew'), true);
	assert.equal(isValidRoadIdCode('bad code!'), false);

	const claimed = await claimBraceletForUser({
		serviceSupabase: db,
		userSupabase: db,
		userId: 'user-3',
		code: '3feetnew'
	});
	assert.equal(claimed.ok, true);
	assert.equal(db.state.qr_codes[0].profile_id, 'user-3');
	assert.equal(db.state.road_id_profiles[0].full_name, 'Morgan Rider');
	assert.equal(db.state.road_id_profiles[0].phone, '+14805550133');
	assert.equal(db.state.road_id_profiles[0].blood_type, 'A-');
	assert.equal(db.state.road_id_profiles[0].allergies, 'Bees');
	assert.equal(db.state.emergency_contacts.length, 1);
	assert.equal(db.state.emergency_contacts[0].contact_name, 'Robin Rider');

	// Idempotent repeat claim by same owner succeeds
	const repeat = await claimBraceletForUser({
		serviceSupabase: db,
		userSupabase: db,
		userId: 'user-3',
		code: '3feetnew'
	});
	assert.equal(repeat.ok, true);
	assert.equal(repeat.alreadyOwned, true);

	// Claiming another rider's bracelet is rejected
	const conflict = await claimBraceletForUser({
		serviceSupabase: db,
		userSupabase: db,
		userId: 'user-3',
		code: 'taken123'
	});
	assert.equal(conflict.ok, false);
	assert.equal(conflict.status, 409);

	assert.equal(formatMedicationList('asprin,  Albuterol , '), 'Aspirin, Albuterol');
});

test('Road ID RLS migration scopes policies to authenticated and grants DML + sequence privileges', async () => {
	const fs = await import('node:fs');
	const migrationSql = fs.readFileSync(
		new URL(
			'../../../supabase/migrations/20261124033000_grant_authenticated_road_id_writes.sql',
			import.meta.url
		),
		'utf8'
	);

	for (const policyName of [
		'road_id_profiles_select',
		'road_id_profiles_insert',
		'road_id_profiles_update',
		'road_id_profiles_delete',
		'emergency_contacts_select',
		'emergency_contacts_insert',
		'emergency_contacts_update',
		'emergency_contacts_delete',
		'qr_codes_select'
	]) {
		assert.match(
			migrationSql,
			new RegExp(`create policy ${policyName}[\\s\\S]*?to authenticated`, 'i'),
			`Expected ${policyName} to be scoped to authenticated`
		);
	}
	assert.doesNotMatch(migrationSql, /(?<!select\s)auth\.uid\(\)/);
	assert.match(
		migrationSql,
		/grant select, insert, update, delete on table public\.road_id_profiles to authenticated;/i
	);
	assert.match(
		migrationSql,
		/grant select, insert, update, delete on table public\.emergency_contacts to authenticated;/i
	);
	assert.match(migrationSql, /grant select on table public\.qr_codes to authenticated;/i);
	assert.match(migrationSql, /grant usage, select on sequence %I\.%I to authenticated/i);

	const contactIdRoute = fs.readFileSync(
		new URL('../../routes/api/v1/emergency-contacts/[id]/+server.js', import.meta.url),
		'utf8'
	);
	assert.match(contactIdRoute, /import\s*\{\s*normalizeContactPhoneInput\s*\}\s*from/);
	assert.match(
		contactIdRoute,
		/safeFields\.contact_phone\s*=\s*normalizeContactPhoneInput\(safeFields\.contact_phone\)/
	);
});
