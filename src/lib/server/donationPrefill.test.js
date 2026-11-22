import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_DONATION_AMOUNT, resolveDonationPrefillAmount } from '../donations/constants.js';

test('resolveDonationPrefillAmount defaults missing, blank, non-positive, and non-numeric inputs to 25', () => {
	assert.equal(DEFAULT_DONATION_AMOUNT, 25);
	assert.equal(resolveDonationPrefillAmount(null), 25);
	assert.equal(resolveDonationPrefillAmount(undefined), 25);
	assert.equal(resolveDonationPrefillAmount(''), 25);
	assert.equal(resolveDonationPrefillAmount('   '), 25);
	assert.equal(resolveDonationPrefillAmount('0'), 25);
	assert.equal(resolveDonationPrefillAmount(0), 25);
	assert.equal(resolveDonationPrefillAmount('-1'), 25);
	assert.equal(resolveDonationPrefillAmount(-25), 25);
	assert.equal(resolveDonationPrefillAmount('abc'), 25);
	assert.equal(resolveDonationPrefillAmount('NaN'), 25);
	assert.equal(resolveDonationPrefillAmount('Infinity'), 25);
	assert.equal(resolveDonationPrefillAmount(Number.NaN), 25);
	assert.equal(resolveDonationPrefillAmount(Number.POSITIVE_INFINITY), 25);
});

test('resolveDonationPrefillAmount rounds and clamps positive amounts between 1 and 25000', () => {
	assert.equal(resolveDonationPrefillAmount('1'), 1);
	assert.equal(resolveDonationPrefillAmount(1), 1);
	assert.equal(resolveDonationPrefillAmount('50'), 50);
	assert.equal(resolveDonationPrefillAmount(' 75 '), 75);
	assert.equal(resolveDonationPrefillAmount('0.25'), 1);
	assert.equal(resolveDonationPrefillAmount('12.4'), 12);
	assert.equal(resolveDonationPrefillAmount('12.6'), 13);
	assert.equal(resolveDonationPrefillAmount('25000'), 25000);
	assert.equal(resolveDonationPrefillAmount('30000'), 25000);
	assert.equal(resolveDonationPrefillAmount(100000), 25000);
});
