import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
	ROAD_ID_STRING_FIELDS,
	hasBloodTypeChanged,
	isValidRoadIdEmail,
	normalizeRoadIdProfile
} from '../utils/roadId.js';

const readSource = (relativePath) =>
	fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

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

test('Consolidated Road ID routes bind blood_type in /profile and share email helper in read-only /roadid/[code]', () => {
	const codePage = readSource('../../routes/roadid/[code]/+page.svelte');
	const profilePage = readSource('../../routes/profile/+page.svelte');

	assert.match(codePage, /normalizeRoadIdProfile\(data\.qrData\.profile,\s*user\)/);
	assert.match(codePage, /isValidRoadIdEmail\(newProfile\.email\)/);
	assert.match(codePage, /href="\/profile#safety"/);
	assert.doesNotMatch(codePage, /id="blood_type"/);
	assert.doesNotMatch(codePage, /\bonblur=/);

	assert.match(
		profilePage,
		/<select[\s\S]*?id="profile-blood-type"[\s\S]*?bind:value=\{bloodType\}/
	);
});

test('Road ID checklists pair light text with dark asphalt surfaces', () => {
	const roadIdLanding = readSource('../../routes/roadid/+page.svelte');
	const crashResponse = readSource('../components/CrashResponse.svelte');
	const alertSystem = readSource('../components/AlertSystem.svelte');

	const detailsMatches = [
		...roadIdLanding.matchAll(/<details\s+class="([^"]+)">\s*<summary\s+class="([^"]+)">/g)
	];
	assert.equal(detailsMatches.length, 2);
	for (const [, detailsClass, summaryClass] of detailsMatches) {
		assert.match(detailsClass, /\bbg-surface-950\b/);
		assert.match(detailsClass, /\btext-surface-50\b/);
		assert.match(detailsClass, /\bborder-surface-800\b/);
		assert.match(summaryClass, /\btext-surface-50\b/);
	}
	assert.match(roadIdLanding, /<div class="mt-4">\s*<CrashResponse \/>\s*<\/div>/);
	assert.match(roadIdLanding, /<div class="mt-4">\s*<AlertSystem \/>\s*<\/div>/);

	assert.match(crashResponse, /<div class="[^"]*\bbg-surface-950\b[^"]*\btext-surface-50\b[^"]*">/);
	assert.match(alertSystem, /<div class="[^"]*\bbg-surface-950\b[^"]*\btext-surface-50\b[^"]*">/);
});
