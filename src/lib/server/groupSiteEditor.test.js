import assert from 'node:assert/strict';
import test from 'node:test';
import {
	mergeGroupSiteEditorConfig,
	siteEditorConfigFingerprint,
	toIsoDateTimeValue,
	toLocalDateTimeValue
} from '../groups/siteEditor.js';

test('site editor config preserves nested defaults when saved settings are partial', () => {
	const merged = mergeGroupSiteEditorConfig(
		{
			theme_colors: { primary: '#111111', secondary: '#222222' },
			sections: { story: true, contact: true },
			ride_widget_config: { theme: 'auto', showUserFilters: true }
		},
		{
			theme_colors: { primary: '#abcdef' },
			sections: { story: false },
			ride_widget_config: { theme: 'dark' }
		}
	);
	assert.deepEqual(merged.theme_colors, { primary: '#abcdef', secondary: '#222222' });
	assert.deepEqual(merged.sections, { story: false, contact: true });
	assert.deepEqual(merged.ride_widget_config, { theme: 'dark', showUserFilters: true });
});

test('site editor fingerprints ignore object key order but detect newer nested edits', () => {
	const first = { sections: { story: true, contact: false }, title: 'Hello' };
	const reordered = { title: 'Hello', sections: { contact: false, story: true } };
	assert.equal(siteEditorConfigFingerprint(first), siteEditorConfigFingerprint(reordered));
	assert.notEqual(
		siteEditorConfigFingerprint(first),
		siteEditorConfigFingerprint({ ...reordered, sections: { ...reordered.sections, story: false } })
	);
});

test('site editor converts stored timestamps into a datetime-local value without changing the instant', () => {
	const instant = '2026-01-15T18:30:00.000Z';
	const localValue = toLocalDateTimeValue(instant);
	assert.match(localValue, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
	assert.equal(new Date(localValue).toISOString(), instant);
	assert.equal(toIsoDateTimeValue(localValue), instant);
	assert.equal(toLocalDateTimeValue('not-a-date'), '');
	assert.equal(toIsoDateTimeValue('not-a-date'), '');
});

test('a partial AI proposal preserves unrelated local edits', () => {
	const merged = mergeGroupSiteEditorConfig(
		{
			home_intro: 'Keep this unpublished local copy',
			sponsor_items: [{ name: 'Local sponsor' }],
			sections: { story: true, contact: false }
		},
		{
			hero_style: 'bold',
			sections: { contact: true }
		}
	);
	assert.equal(merged.home_intro, 'Keep this unpublished local copy');
	assert.deepEqual(merged.sponsor_items, [{ name: 'Local sponsor' }]);
	assert.deepEqual(merged.sections, { story: true, contact: true });
	assert.equal(merged.hero_style, 'bold');
});
