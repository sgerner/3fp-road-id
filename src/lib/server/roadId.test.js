import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
	claimRoadIdCodeForUser,
	formatPublicResponderProfile,
	normalizeRoadIdCodeInput,
	pickRoadIdProfileFields,
	resolveConfirmRedirectDestination,
	unlinkRoadIdCodeForUser
} from './roadId.js';
import { encodeQrMatrix, renderPrintableQrSheetSvg, renderQrSvg } from '../utils/qr.js';
import {
	ROAD_ID_STRING_FIELDS,
	hasBloodTypeChanged,
	isValidRoadIdEmail,
	normalizeRoadIdProfile
} from '../utils/roadId.js';

const readSource = (relativePath) =>
	fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('normalizeRoadIdCodeInput accepts raw codes and /roadid/[code] URLs while rejecting invalid inputs', () => {
	assert.equal(normalizeRoadIdCodeInput('3feetpls'), '3feetpls');
	assert.equal(normalizeRoadIdCodeInput('  BAND_2026-01  '), 'BAND_2026-01');
	assert.equal(normalizeRoadIdCodeInput('https://3fp.org/roadid/3feetpls?scan=1'), '3feetpls');
	assert.equal(normalizeRoadIdCodeInput('/roadid/SpareBand99#top'), 'SpareBand99');
	assert.equal(normalizeRoadIdCodeInput('abc'), '');
	assert.equal(normalizeRoadIdCodeInput('bad code with spaces'), '');
	assert.equal(normalizeRoadIdCodeInput('https://3fp.org/groups/tempe'), '');
	assert.equal(normalizeRoadIdCodeInput('<script>alert(1)</script>'), '');
});

test('resolveConfirmRedirectDestination prioritizes /profile#road-id when claiming a bracelet', () => {
	assert.equal(
		resolveConfirmRedirectDestination({ rid: '3feetpls', returnTo: '/' }),
		'/profile#road-id'
	);
	assert.equal(
		resolveConfirmRedirectDestination({ rid: '3feetpls', returnTo: '/roadid/3feetpls' }),
		'/profile#road-id'
	);
	assert.equal(
		resolveConfirmRedirectDestination({ rid: '3feetpls', returnTo: '/profile' }),
		'/profile#road-id'
	);
	assert.equal(
		resolveConfirmRedirectDestination({
			rid: '3feetpls',
			returnTo: '/groups/tempe?auto_claim_group=tempe'
		}),
		'/groups/tempe?auto_claim_group=tempe'
	);
	assert.equal(
		resolveConfirmRedirectDestination({ rid: '', returnTo: '/volunteer/shifts' }),
		'/volunteer/shifts'
	);
	assert.equal(
		resolveConfirmRedirectDestination({ rid: '', returnTo: 'https://evil.example/phish' }),
		'/'
	);
});

test('pickRoadIdProfileFields trims allowed strings and rejects invalid payloads', () => {
	assert.deepEqual(
		pickRoadIdProfileFields({
			full_name: '  Maya Chen ',
			phone: ' (480) 555-0101 ',
			blood_type: ' O+ ',
			allergies: ' Penicillin ',
			medication: null,
			ignored_extra: 'nope'
		}),
		{
			full_name: 'Maya Chen',
			phone: '(480) 555-0101',
			blood_type: 'O+',
			allergies: 'Penicillin',
			medication: ''
		}
	);
	assert.equal(pickRoadIdProfileFields(null), null);
	assert.equal(pickRoadIdProfileFields([]), null);
	assert.equal(pickRoadIdProfileFields({ full_name: 123 }), null);
	assert.equal(pickRoadIdProfileFields({ full_name: 'x'.repeat(201) }), null);
});

test('formatPublicResponderProfile omits user_id while preserving responder fields and ownership', () => {
	const raw = {
		user_id: '00000000-0000-0000-0000-000000000099',
		full_name: 'Maya Chen',
		phone: '4805550101',
		blood_type: 'A+',
		allergies: 'Latex',
		medication: 'Albuterol',
		emergency_contacts: [
			{
				id: 7,
				profile_id: '00000000-0000-0000-0000-000000000099',
				contact_name: 'Jordan Chen',
				contact_phone: '4805550199',
				contact_relationship: 'Spouse'
			}
		]
	};

	const publicView = formatPublicResponderProfile(raw, false);
	assert.equal('user_id' in publicView, false);
	assert.equal('profile_id' in publicView.emergency_contacts[0], false);
	assert.equal(publicView.claimed, true);
	assert.equal(publicView.is_owner, false);

	const ownerView = formatPublicResponderProfile(raw, true);
	assert.equal('user_id' in ownerView, false);
	assert.equal(ownerView.claimed, true);
	assert.equal(ownerView.is_owner, true);
});

function createRoadIdServiceStub({
	rpcHandler,
	profile = {
		user_id: 'user-1',
		full_name: 'Maya Chen',
		phone: '+14805550101',
		blood_type: 'O+',
		allergies: '',
		medication: ''
	},
	codes = [{ code: 'BAND0001', created_at: '2026-11-21T00:00:00Z' }]
} = {}) {
	return {
		rpc(fn, args) {
			return Promise.resolve(rpcHandler(fn, args));
		},
		from(table) {
			const chain = {
				select() {
					return this;
				},
				eq() {
					return this;
				},
				order() {
					return this;
				},
				maybeSingle() {
					if (table === 'road_id_profiles') {
						return Promise.resolve({ data: profile, error: null });
					}
					return Promise.resolve({ data: null, error: null });
				},
				then(resolve, reject) {
					if (table === 'qr_codes') {
						return Promise.resolve({ data: codes, error: null }).then(resolve, reject);
					}
					if (table === 'emergency_contacts') {
						return Promise.resolve({ data: [], error: null }).then(resolve, reject);
					}
					return Promise.resolve({ data: null, error: null }).then(resolve, reject);
				}
			};
			return chain;
		}
	};
}

test('claimRoadIdCodeForUser maps RPC outcomes to HTTP statuses and supports idempotent confirm retries', async () => {
	const claimedClient = createRoadIdServiceStub({
		rpcHandler: (fn, args) => {
			assert.equal(fn, 'claim_road_id_code');
			assert.equal(args.target_code, 'BAND0001');
			assert.equal(args.claimant_user_id, 'user-1');
			return {
				data: [{ status: 'claimed', code: 'BAND0001', profile_id: 'user-1' }],
				error: null
			};
		}
	});
	const claimed = await claimRoadIdCodeForUser({
		serviceSupabase: claimedClient,
		userId: 'user-1',
		rawCode: 'https://3fp.org/roadid/BAND0001'
	});
	assert.equal(claimed.ok, true);
	assert.equal(claimed.status, 200);
	assert.equal(claimed.code, 'BAND0001');
	assert.equal(claimed.profile?.full_name, 'Maya Chen');

	const conflictClient = createRoadIdServiceStub({
		rpcHandler: () => ({
			data: [{ status: 'conflict', code: 'BAND0001', profile_id: null }],
			error: null
		})
	});
	const conflict = await claimRoadIdCodeForUser({
		serviceSupabase: conflictClient,
		userId: 'user-2',
		rawCode: 'BAND0001'
	});
	assert.equal(conflict.ok, false);
	assert.equal(conflict.status, 409);

	const ownedClient = createRoadIdServiceStub({
		rpcHandler: () => ({
			data: [{ status: 'already_owned', code: 'BAND0001', profile_id: 'user-1' }],
			error: null
		})
	});
	const manualDuplicate = await claimRoadIdCodeForUser({
		serviceSupabase: ownedClient,
		userId: 'user-1',
		rawCode: 'BAND0001',
		allowAlreadyOwned: false
	});
	assert.equal(manualDuplicate.ok, false);
	assert.equal(manualDuplicate.status, 409);

	const confirmRetry = await claimRoadIdCodeForUser({
		serviceSupabase: ownedClient,
		userId: 'user-1',
		rawCode: 'BAND0001',
		allowAlreadyOwned: true
	});
	assert.equal(confirmRetry.ok, true);
	assert.equal(confirmRetry.status, 200);

	const missingClient = createRoadIdServiceStub({
		rpcHandler: () => ({
			data: [{ status: 'not_found', code: 'UNKNOWN1', profile_id: null }],
			error: null
		})
	});
	const missing = await claimRoadIdCodeForUser({
		serviceSupabase: missingClient,
		userId: 'user-1',
		rawCode: 'UNKNOWN1'
	});
	assert.equal(missing.ok, false);
	assert.equal(missing.status, 404);
});

test('unlinkRoadIdCodeForUser unlinks owned codes and returns 404 for unowned codes', async () => {
	const okClient = createRoadIdServiceStub({
		codes: [{ code: 'SPARE002', created_at: '2026-11-21T01:00:00Z' }],
		rpcHandler: (fn, args) => {
			assert.equal(fn, 'unlink_road_id_code');
			assert.equal(args.target_code, 'BAND0001');
			assert.equal(args.owner_user_id, 'user-1');
			return { data: true, error: null };
		}
	});
	const unlinked = await unlinkRoadIdCodeForUser({
		serviceSupabase: okClient,
		userId: 'user-1',
		rawCode: 'BAND0001'
	});
	assert.equal(unlinked.ok, true);
	assert.deepEqual(unlinked.codes, [{ code: 'SPARE002', created_at: '2026-11-21T01:00:00Z' }]);

	const notOwnedClient = createRoadIdServiceStub({
		rpcHandler: () => ({ data: false, error: null })
	});
	const notOwned = await unlinkRoadIdCodeForUser({
		serviceSupabase: notOwnedClient,
		userId: 'user-1',
		rawCode: 'OTHER999'
	});
	assert.equal(notOwned.ok, false);
	assert.equal(notOwned.status, 404);
});

test('local vector QR generator builds valid finder/timing patterns and standalone SVG sheets without external URLs', () => {
	const matrix = encodeQrMatrix('https://3fp.org/roadid/3feetpls');
	assert.ok(matrix.size >= 25);
	// Top-left finder corners and center must be dark; separator ring must be light
	assert.equal(matrix.modules[0][0], 1);
	assert.equal(matrix.modules[0][6], 1);
	assert.equal(matrix.modules[6][0], 1);
	assert.equal(matrix.modules[3][3], 1);
	assert.equal(matrix.modules[7][7], 0);
	// Dark module is always set at (size - 8, 8)
	assert.equal(matrix.modules[matrix.size - 8][8], 1);

	const singleSvg = renderQrSvg('https://3fp.org/roadid/3feetpls', {
		label: 'Scan <Emergency> & "ID"'
	});
	assert.match(singleSvg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
	assert.match(singleSvg, /Scan &lt;Emergency&gt; &amp; &quot;ID&quot;/);
	assert.doesNotMatch(singleSvg, /<image|<script|xlink:href/i);

	const sheetSvg = renderPrintableQrSheetSvg({
		codes: ['BAND0001', 'SPARE002'],
		origin: 'https://3fp.org',
		riderName: 'Maya Chen',
		copiesPerCode: 2
	});
	assert.match(sheetSvg, /CODE: BAND0001/);
	assert.match(sheetSvg, /CODE: SPARE002/);
	assert.match(sheetSvg, /Maya Chen/);
	assert.doesNotMatch(sheetSvg, /<image|<script/i);
});

test('normalizeRoadIdProfile sets empty string defaults for missing or nullable profile fields', () => {
	const anonymousEmpty = normalizeRoadIdProfile(null, null);
	assert.deepEqual(anonymousEmpty, {
		user_id: undefined,
		claimed: false,
		is_owner: false,
		full_name: '',
		phone: '',
		blood_type: '',
		allergies: '',
		medication: ''
	});

	const signedInEmpty = normalizeRoadIdProfile(undefined, { id: 'user-123' });
	assert.equal(signedInEmpty.user_id, 'user-123');
	assert.equal(signedInEmpty.claimed, true);
	assert.equal(signedInEmpty.is_owner, true);
	for (const field of ROAD_ID_STRING_FIELDS) {
		assert.equal(signedInEmpty[field], '');
	}

	const nullableDbProfile = normalizeRoadIdProfile(
		{
			user_id: 'user-123',
			claimed: true,
			is_owner: true,
			full_name: 'Jane Rider',
			phone: null,
			blood_type: 'O+',
			allergies: null,
			medication: undefined,
			emergency_contacts: [{ id: 'c1', contact_name: 'Alex' }]
		},
		{ id: 'user-123' }
	);
	assert.equal(nullableDbProfile.full_name, 'Jane Rider');
	assert.equal(nullableDbProfile.blood_type, 'O+');
	assert.equal(nullableDbProfile.phone, '');
	assert.equal(nullableDbProfile.allergies, '');
	assert.equal(nullableDbProfile.medication, '');
	assert.deepEqual(nullableDbProfile.emergency_contacts, [{ id: 'c1', contact_name: 'Alex' }]);
	for (const field of ROAD_ID_STRING_FIELDS) {
		assert.equal(typeof nullableDbProfile[field], 'string');
	}

	const otherOwnersProfile = normalizeRoadIdProfile(
		{
			user_id: null,
			claimed: true,
			is_owner: false,
			full_name: 'Public Rider',
			phone: null,
			blood_type: 'AB-',
			allergies: null,
			medication: null
		},
		{ id: 'different-user' }
	);
	assert.equal(otherOwnersProfile.user_id, null);
	assert.equal(otherOwnersProfile.claimed, true);
	assert.equal(otherOwnersProfile.is_owner, false);
});

test('hasBloodTypeChanged skips unchanged picker blurs and detects selections or clears', () => {
	assert.equal(hasBloodTypeChanged('O+', 'O+'), false);
	assert.equal(hasBloodTypeChanged('', ''), false);
	assert.equal(hasBloodTypeChanged(null, ''), false);
	assert.equal(hasBloodTypeChanged(undefined, ''), false);

	assert.equal(hasBloodTypeChanged('O+', 'A-'), true);
	assert.equal(hasBloodTypeChanged('', 'AB+'), true);
	assert.equal(hasBloodTypeChanged(null, 'B+'), true);
	assert.equal(hasBloodTypeChanged('O+', ''), true);
});

test('isValidRoadIdEmail accepts plus-tagged and 5+ char TLD addresses and rejects malformed input', () => {
	assert.equal(isValidRoadIdEmail('jane@example.com'), true);
	assert.equal(isValidRoadIdEmail('jane+roadid@example.com'), true);
	assert.equal(isValidRoadIdEmail('rider+3fp@club.cycling'), true);
	assert.equal(isValidRoadIdEmail('member+alert@sub.domain.photography'), true);
	assert.equal(isValidRoadIdEmail('  rider+tag@velo.museum  '), true);

	assert.equal(isValidRoadIdEmail(''), false);
	assert.equal(isValidRoadIdEmail(null), false);
	assert.equal(isValidRoadIdEmail('not-an-email'), false);
	assert.equal(isValidRoadIdEmail('@example.com'), false);
	assert.equal(isValidRoadIdEmail('jane@.com'), false);
	assert.equal(isValidRoadIdEmail('jane@localhost'), false);
	assert.equal(isValidRoadIdEmail('jane @example.com'), false);
	assert.equal(isValidRoadIdEmail('jane@@example.com'), false);
	assert.equal(isValidRoadIdEmail(`${'a'.repeat(245)}@example.com`), false);
});

test('Road ID routes share email/profile helpers and bind #blood_type in unified /profile#road-id', () => {
	const codePage = readSource('../../routes/roadid/[code]/+page.svelte');
	const confirmPage = readSource('../../routes/auth/confirm/+page.svelte');
	const profilePage = readSource('../../routes/profile/+page.svelte');

	assert.match(codePage, /normalizeRoadIdProfile\(data\.qrData\.profile,\s*user\)/);
	assert.match(codePage, /isValidRoadIdEmail\(newProfile\.email\)/);
	assert.match(confirmPage, /isValidRoadIdEmail\(resendEmail\)/);
	assert.doesNotMatch(codePage, /id="blood_type"/);
	assert.match(
		profilePage,
		/let emergencyBloodType = \$state\(existingRoadId\?\.blood_type \?\? ''\);/
	);
	assert.match(
		profilePage,
		/<select[\s\S]*?id="blood_type"[\s\S]*?bind:value=\{emergencyBloodType\}/
	);
});

test('Road ID checklists pair adaptive foreground and surface tokens across color modes', () => {
	const roadIdLanding = readSource('../../routes/roadid/+page.svelte');
	const crashResponse = readSource('../components/CrashResponse.svelte');
	const alertSystem = readSource('../components/AlertSystem.svelte');

	const detailsMatches = [
		...roadIdLanding.matchAll(/<details\s+class="([^"]+)">\s*<summary\s+class="([^"]+)">/g)
	];
	assert.equal(detailsMatches.length, 2);
	for (const [, detailsClass, summaryClass] of detailsMatches) {
		assert.match(detailsClass, /\bbg-surface-50-950\b/);
		assert.match(detailsClass, /\btext-surface-950-50\b/);
		assert.match(detailsClass, /\bborder-surface-700-300\b/);
		assert.match(summaryClass, /\btext-surface-950-50\b/);
	}
	assert.match(roadIdLanding, /<div class="mt-4">\s*<CrashResponse \/>\s*<\/div>/);
	assert.match(roadIdLanding, /<div class="mt-4">\s*<AlertSystem \/>\s*<\/div>/);

	assert.match(
		crashResponse,
		/<div class="[^"]*\bbg-surface-50-950\b[^"]*\btext-surface-950-50\b[^"]*">/
	);
	assert.match(
		alertSystem,
		/<div class="[^"]*\bbg-surface-50-950\b[^"]*\btext-surface-950-50\b[^"]*">/
	);
});
