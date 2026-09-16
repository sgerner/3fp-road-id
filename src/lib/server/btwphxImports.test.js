import assert from 'node:assert/strict';
import test from 'node:test';
import { importBtwPhxCalendar, parseBtwPhxCalendarData } from './btwphx-imports.js';

function sourceEvent(overrides = {}) {
	return {
		id: 'event-1',
		title: 'Saturday Ride',
		location: 'Phoenix, AZ',
		description: 'A no-drop ride.',
		timezone: 'America/Phoenix',
		startDate: '2026-09-19',
		endDate: '2026-09-19',
		startHour: 7,
		startMinutes: 0,
		endHour: 9,
		endMinutes: 0,
		...overrides
	};
}

test('parseBtwPhxCalendarData accepts the current Eventscalendar response envelope', () => {
	const parsed = parseBtwPhxCalendarData({ result: true, value: [sourceEvent()] });

	assert.equal(parsed.projectId, 'proj_W0ZyzxfO5LSngvzL903Xy');
	assert.equal(parsed.events.length, 1);
	assert.equal(parsed.events[0].id, 'event-1');
});

test('parseBtwPhxCalendarData keeps accepting the legacy response envelope', () => {
	const parsed = parseBtwPhxCalendarData({
		project: { id: 'legacy-project', data: { events: [sourceEvent()] } }
	});

	assert.equal(parsed.projectId, 'legacy-project');
	assert.equal(parsed.events.length, 1);
});

test('importBtwPhxCalendar requests the current Eventscalendar endpoint with GET', async () => {
	let request;
	const fetchHttp = async (url, options) => {
		request = { url, options };
		return new Response(JSON.stringify({ result: true, value: [sourceEvent()] }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	};

	const result = await importBtwPhxCalendar(
		{},
		{
			dryRun: true,
			onlyNew: false,
			skipGeocoding: true,
			skipImageUpload: true,
			fetchHttp
		}
	);

	assert.equal(request.options.method, 'GET');
	assert.match(
		request.url,
		/\/api\/v0\.1\/projects\/proj_W0ZyzxfO5LSngvzL903Xy\/data\/public\/events/
	);
	assert.equal(result.feedEventCount, 1);
	assert.equal(result.candidateEventCount, 1);
	assert.equal(result.mapped.length, 1);
});
