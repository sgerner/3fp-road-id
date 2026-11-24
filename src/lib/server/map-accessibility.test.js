import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
	buildUniqueMarkerLabels,
	clampCoordinate,
	formatClusterAriaLabel,
	formatCoordinate,
	isValidLatLng,
	parseCoordinate
} from '../map/leaflet.js';

const REPO_ROOT = process.cwd();

function collectSourceFiles(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectSourceFiles(fullPath, out);
		} else if (/\.(svelte|js|ts)$/.test(entry.name)) {
			out.push(fullPath);
		}
	}
	return out;
}

test('parseCoordinate and isValidLatLng reject empty, null, boolean, and out-of-bounds values', () => {
	assert.equal(parseCoordinate(''), null);
	assert.equal(parseCoordinate('   '), null);
	assert.equal(parseCoordinate(null), null);
	assert.equal(parseCoordinate(undefined), null);
	assert.equal(parseCoordinate(false), null);
	assert.equal(parseCoordinate('33.4255'), 33.4255);
	assert.equal(parseCoordinate(-111.94), -111.94);

	assert.equal(isValidLatLng('', ''), false);
	assert.equal(isValidLatLng(null, null), false);
	assert.equal(isValidLatLng(0, 0), true);
	assert.equal(isValidLatLng(33.4255, -111.94), true);
	assert.equal(isValidLatLng(91, -111.94), false);
	assert.equal(isValidLatLng(33.4255, -181), false);

	assert.equal(clampCoordinate(95, -90, 90), 90);
	assert.equal(clampCoordinate(-195, -180, 180), -180);
	assert.equal(formatCoordinate('33.4255'), '33.425500');
	assert.equal(formatCoordinate(''), '');
});

test('formatClusterAriaLabel includes count, noun, and zoom action', () => {
	assert.equal(
		formatClusterAriaLabel(1, 'ride', 'rides'),
		'Cluster of 1 ride — activate to zoom in and expand'
	);
	assert.equal(
		formatClusterAriaLabel(12, 'group', 'groups'),
		'Cluster of 12 groups — activate to zoom in and expand'
	);
});

test('buildUniqueMarkerLabels produces descriptive and strictly unique marker labels', () => {
	const labels = buildUniqueMarkerLabels(
		[
			{
				id: 'a',
				title: 'Tuesday Social Roll',
				subtitle: 'Tue · 6:00 PM',
				meta: 'Tempe Beach Park'
			},
			{ id: 'b', title: 'Tuesday Social Roll', subtitle: 'Tue · 6:00 PM', meta: 'Papago Park' },
			{ id: 'c', title: 'Tuesday Social Roll', subtitle: 'Tue · 6:00 PM', meta: 'Tempe Beach Park' }
		],
		'ride'
	);

	const values = Array.from(labels.values());
	assert.equal(values.length, 3);
	assert.equal(new Set(values).size, 3);
	assert.match(labels.get('a'), /Tuesday Social Roll/);
	assert.match(labels.get('a'), /Tempe Beach Park/);
	assert.match(labels.get('b'), /Papago Park/);
});

test('all nine map surfaces use shared accessible Svelte 5 map components with zero direct Leaflet map/marker calls', () => {
	const expectedSurfaces = [
		['src/routes/ride/[slug]/+page.svelte', 'AccessibleMapShell'],
		['src/routes/volunteer/[slug]/+page.svelte', 'AccessibleMapShell'],
		['src/routes/groups/[slug]/+page.svelte', 'AccessibleMapShell'],
		['src/routes/ride/+page.svelte', 'DirectoryMapExplorer'],
		['src/routes/groups/+page.svelte', 'DirectoryMapExplorer'],
		['src/lib/components/volunteer/VolunteerEventsExplorer.svelte', 'DirectoryMapExplorer'],
		['src/routes/ride/widget/frame/+page.svelte', 'DirectoryMapExplorer'],
		['src/lib/components/volunteer/ScheduleStep.svelte', 'CoordinatePinPicker'],
		['src/routes/groups/[slug]/manage/presence/+page.svelte', 'CoordinatePinPicker']
	];

	for (const [relPath, componentName] of expectedSurfaces) {
		const source = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
		assert.match(
			source,
			new RegExp(`<${componentName}[\\s>]`),
			`${relPath} must render <${componentName}>`
		);
		assert.match(
			source,
			/(regionLabel|labelledBy)=/,
			`${relPath} must provide regionLabel or labelledBy`
		);
		assert.doesNotMatch(source, /\.bindPopup\s*\(/, `${relPath} must not use detached bindPopup()`);
	}

	const allowedDirs = [
		path.join(REPO_ROOT, 'src/lib/components/map'),
		path.join(REPO_ROOT, 'src/lib/map')
	];
	const allFiles = collectSourceFiles(path.join(REPO_ROOT, 'src')).filter(
		(filePath) =>
			!filePath.endsWith('.test.js') &&
			!allowedDirs.some((allowed) => filePath.startsWith(allowed + path.sep))
	);

	for (const filePath of allFiles) {
		const content = fs.readFileSync(filePath, 'utf8');
		const rel = path.relative(REPO_ROOT, filePath);
		assert.doesNotMatch(
			content,
			/\b(?:L|leafletModule)\.(?:map|marker|circleMarker|markerClusterGroup)\s*\(/,
			`${rel} must not contain direct Leaflet map/marker calls`
		);
	}
});

test('shared map components comply with Lane Lines square borders and accessible controls', () => {
	const mapComponentFiles = [
		'src/lib/components/map/AccessibleMapShell.svelte',
		'src/lib/components/map/DirectoryMapExplorer.svelte',
		'src/lib/components/map/CoordinatePinPicker.svelte',
		'src/lib/components/volunteer/ScheduleStep.svelte'
	];

	for (const relPath of mapComponentFiles) {
		const content = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
		assert.doesNotMatch(
			content,
			/\brounded(?:-[a-z0-9[\]]+)?\b/,
			`${relPath} must not use rounded-* classes`
		);
		assert.doesNotMatch(
			content,
			/\bbackdrop-blur(?:-[a-z0-9[\]]+)?\b/,
			`${relPath} must not use backdrop-blur classes`
		);
	}

	const groupEditSource = fs.readFileSync(
		path.join(REPO_ROOT, 'src/routes/groups/[slug]/manage/presence/+page.svelte'),
		'utf8'
	);
	assert.doesNotMatch(
		groupEditSource,
		/name="latitude"[^>]*hidden/s,
		'presence/+page.svelte must not hide the latitude input'
	);
	assert.doesNotMatch(
		groupEditSource,
		/name="longitude"[^>]*hidden/s,
		'presence/+page.svelte must not hide the longitude input'
	);
});
