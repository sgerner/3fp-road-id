import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createSafeEmailHtmlContext,
	escapeEmailHtmlValue,
	safeEmailHref
} from './emailTemplate.js';

test('email template values escape profile content while preserving explicitly trusted blocks', () => {
	assert.equal(
		escapeEmailHtmlValue('<img src=x onerror=alert(1)>'),
		'&lt;img src=x onerror=alert(1)&gt;'
	);
	assert.deepEqual(
		createSafeEmailHtmlContext(
			{
				first_name: '<b>Alex</b>',
				'block.upcoming_rides': '<ul><li>Ride</li></ul>'
			},
			{ trustedHtmlPrefixes: ['block.'] }
		),
		{
			first_name: '&lt;b&gt;Alex&lt;/b&gt;',
			'block.upcoming_rides': '<ul><li>Ride</li></ul>'
		}
	);
});

test('email links only allow complete web URLs or local absolute paths', () => {
	assert.equal(safeEmailHref('https://example.com/news'), 'https://example.com/news');
	assert.equal(safeEmailHref('/groups/example'), '/groups/example');
	assert.equal(safeEmailHref('https://'), '');
	assert.equal(safeEmailHref('javascript:alert(1)'), '');
});
