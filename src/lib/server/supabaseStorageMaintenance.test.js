import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	BUCKETS,
	STORAGE_MARKER,
	TABLES,
	assertRowsUnchanged,
	collectReferenceState,
	createStorageScriptClient,
	downloadObject,
	encodeObjectPath,
	fetchAllRows,
	fetchRows,
	findStorageReferences,
	getRowKey,
	listBucketObjects,
	loadLocalEnv,
	mapInBatches,
	mimeTypeFor,
	objectKey,
	replaceStorageValue,
	rollbackUpdates,
	rowsFingerprint,
	sha256,
	snapshotRows,
	updateRow,
	valuesEqual
} from '../../../scripts/lib/supabase-storage-maintenance.mjs';

test('loadLocalEnv and createStorageScriptClient read .env lazily without overriding explicit env', () => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-maint-env-'));
	const envPath = path.join(tempDir, '.env');
	try {
		fs.writeFileSync(
			envPath,
			[
				'PUBLIC_SUPABASE_URL="https://example.supabase.co"',
				"SUPABASE_SERVICE_ROLE_KEY='service-role-secret'",
				'EXTRA_FLAG = enabled'
			].join('\n')
		);

		const loaded = loadLocalEnv({
			envPath,
			env: { PUBLIC_SUPABASE_URL: 'https://override.supabase.co' }
		});
		assert.equal(loaded.PUBLIC_SUPABASE_URL, 'https://override.supabase.co');
		assert.equal(loaded.SUPABASE_SERVICE_ROLE_KEY, 'service-role-secret');
		assert.equal(loaded.EXTRA_FLAG, 'enabled');

		assert.throws(
			() => createStorageScriptClient({ envPath: path.join(tempDir, 'missing.env'), env: {} }),
			/PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required\./
		);

		const { supabase, supabaseUrl } = createStorageScriptClient({ envPath, env: {} });
		assert.equal(supabaseUrl, 'https://example.supabase.co');
		assert.equal(typeof supabase.from, 'function');
		assert.equal(typeof supabase.storage.from, 'function');
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test('findStorageReferences extracts public, signed, Markdown, apostrophe, and tsvector paths', () => {
	assert.ok(BUCKETS.includes('learn-media'));
	assert.ok(TABLES.some((table) => table.name === 'learn_articles'));
	assert.equal(STORAGE_MARKER, '/storage/v1/object/');
	assert.equal(objectKey('learn-media', 'guide.png'), 'learn-media:guide.png');
	assert.equal(encodeObjectPath("a b/rider's guide.png"), "a%20b/rider's%20guide.png");

	const prose = [
		'![Hero](https://example.supabase.co/storage/v1/object/public/learn-media/imports/rider%20guide.png)',
		"See https://example.supabase.co/storage/v1/object/public/group-assets/club's-flyer.pdf. ",
		"'https://example.supabase.co/storage/v1/object/public/learn-media/cyclist''s-map.webp':4",
		'https://example.supabase.co/storage/v1/object/sign/group-accounting-receipts/2026/receipt.jpg?token=abc',
		'https://example.supabase.co/storage/v1/object/unknown/learn-media/bad.png'
	].join('\n');

	const { references, unrecognized } = findStorageReferences(prose);
	assert.deepEqual(
		references.map(({ route, bucket, name }) => ({ route, bucket, name })),
		[
			{ route: 'public', bucket: 'learn-media', name: 'imports/rider guide.png' },
			{ route: 'public', bucket: 'group-assets', name: "club's-flyer.pdf" },
			{ route: 'public', bucket: 'learn-media', name: "cyclist's-map.webp" },
			{ route: 'sign', bucket: 'group-accounting-receipts', name: '2026/receipt.jpg' }
		]
	);
	assert.deepEqual(unrecognized, ['/storage/v1/object/']);
});

test('replaceStorageValue rewrites matching public URLs and registry objects without touching protected routes', () => {
	const target = {
		bucket: 'learn-media',
		name: 'imports/rider guide.png',
		newName: 'optimized/imports/rider guide.png.webp',
		newContentType: 'image/webp',
		newBytes: 4096,
		newHash: 'abc123'
	};

	const input = {
		markdown:
			'Before https://example.supabase.co/storage/v1/object/public/learn-media/imports/rider%20guide.png and signed https://example.supabase.co/storage/v1/object/sign/learn-media/imports/rider%20guide.png?token=1',
		nestedRegistry: {
			bucket_id: 'learn-media',
			object_path: 'imports/rider guide.png',
			mime_type: 'image/png',
			size_bytes: 16384,
			content_hash: 'oldhash'
		},
		untouchedRegistry: {
			bucket_id: 'ride-media',
			object_path: 'imports/rider guide.png',
			mime_type: 'image/png'
		}
	};

	const replaced = replaceStorageValue(input, target);
	assert.equal(
		replaced.markdown,
		'Before https://example.supabase.co/storage/v1/object/public/learn-media/optimized/imports/rider%20guide.png.webp and signed https://example.supabase.co/storage/v1/object/sign/learn-media/imports/rider%20guide.png?token=1'
	);
	assert.deepEqual(replaced.nestedRegistry, {
		bucket_id: 'learn-media',
		object_path: 'optimized/imports/rider guide.png.webp',
		mime_type: 'image/webp',
		size_bytes: 4096,
		content_hash: 'abc123'
	});
	assert.ok(valuesEqual(replaced.untouchedRegistry, input.untouchedRegistry));
});

test('collectReferenceState supports optimize tracking options and repair default mode', () => {
	const rowsByTable = new Map([
		[
			'learn_articles',
			[
				{
					id: 'art-1',
					body_markdown:
						'Public https://example.supabase.co/storage/v1/object/public/learn-media/hero.png and signed https://example.supabase.co/storage/v1/object/authenticated/group-accounting-receipts/r1.pdf and broken https://example.supabase.co/storage/v1/object/broken/x',
					attachments: [{ bucket_id: 'learn-media', object_path: 'nested/diagram.svg' }]
				}
			]
		],
		[
			'media_assets',
			[
				{
					id: 'asset-1',
					bucket_id: 'group-assets',
					object_path: 'logos/club.png'
				}
			]
		]
	]);

	const optimizeState = collectReferenceState(rowsByTable, {
		includeProtected: true,
		includeRegistry: true,
		includeRowRegistry: true
	});
	assert.deepEqual([...optimizeState.references].sort(), [
		'group-accounting-receipts:r1.pdf',
		'group-assets:logos/club.png',
		'learn-media:hero.png',
		'learn-media:nested/diagram.svg'
	]);
	assert.deepEqual([...optimizeState.protectedReferences], ['group-accounting-receipts:r1.pdf']);
	assert.deepEqual([...optimizeState.registryReferences].sort(), [
		'group-assets:logos/club.png',
		'learn-media:nested/diagram.svg'
	]);
	assert.deepEqual([...optimizeState.unrecognizedLocations], ['learn_articles.body_markdown']);

	const repairState = collectReferenceState(rowsByTable, {
		includeProtected: false,
		includeRegistry: false,
		includeRowRegistry: false
	});
	assert.equal('protectedReferences' in repairState, false);
	assert.equal('registryReferences' in repairState, false);
	assert.deepEqual([...repairState.references].sort(), [
		'group-accounting-receipts:r1.pdf',
		'learn-media:hero.png',
		'learn-media:nested/diagram.svg'
	]);
});

test('mimeTypeFor honors metadata, includePdf, and fallback options', () => {
	assert.equal(mimeTypeFor('photo.JPG'), 'image/jpeg');
	assert.equal(mimeTypeFor('banner.png', { mimetype: 'IMAGE/WEBP' }), 'image/webp');
	assert.equal(mimeTypeFor('guide.pdf'), '');
	assert.equal(
		mimeTypeFor('guide.pdf', {}, { includePdf: true, fallback: 'application/octet-stream' }),
		'application/pdf'
	);
	assert.equal(mimeTypeFor('archive.zip'), '');
	assert.equal(
		mimeTypeFor('archive.zip', {}, { includePdf: true, fallback: 'application/octet-stream' }),
		'application/octet-stream'
	);
});

test('snapshotRows and assertRowsUnchanged enforce caller-specific abort suffixes', () => {
	const before = new Map([
		[
			'groups',
			[
				{ id: 'g2', name: 'Two' },
				{ id: 'g1', name: 'One' }
			]
		]
	]);
	const sameReordered = new Map([
		[
			'groups',
			[
				{ id: 'g1', name: 'One' },
				{ id: 'g2', name: 'Two' }
			]
		]
	]);
	const changed = new Map([['groups', [{ id: 'g1', name: 'Mutated' }]]]);

	assert.equal(rowsFingerprint(before.get('groups')), rowsFingerprint(sameReordered.get('groups')));
	const snapshot = snapshotRows(before);
	assert.doesNotThrow(() =>
		assertRowsUnchanged(snapshot, sameReordered, 'preflight', {
			abortSuffix: 'aborting before Storage mutation.'
		})
	);
	assert.throws(
		() =>
			assertRowsUnchanged(snapshot, changed, 'preflight', {
				abortSuffix: 'aborting before Storage mutation.'
			}),
		/^Error: Reference rows changed during preflight; aborting before Storage mutation\.$/
	);
	assert.throws(
		() => assertRowsUnchanged(snapshot, changed, 'preflight', { abortSuffix: 'aborting.' }),
		/^Error: Reference rows changed during preflight; aborting\.$/
	);
});

test('mapInBatches bounds concurrency and optionally filters falsy worker results', async () => {
	let active = 0;
	let maxActive = 0;
	const items = [1, 2, 3, 4, 5];

	const unfiltered = await mapInBatches(
		items,
		2,
		async (item) => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active -= 1;
			return item % 2 === 0 ? null : item * 10;
		},
		{ filterTruthy: false }
	);
	assert.ok(maxActive <= 2);
	assert.deepEqual(unfiltered, [10, null, 30, null, 50]);

	const filtered = await mapInBatches(
		items,
		2,
		async (item) => (item % 2 === 0 ? null : item * 10),
		{ filterTruthy: true }
	);
	assert.deepEqual(filtered, [10, 30, 50]);
});

test('downloadObject supports both { buffer, error } and throwing return conventions', async () => {
	const payload = Buffer.from('storage-bytes');
	const notFoundError = Object.assign(new Error('Object not found'), { statusCode: '404' });

	const fakeSupabase = {
		storage: {
			from(bucket) {
				return {
					async download(name) {
						if (name === 'ok.webp') {
							return { data: new Blob([payload]), error: null };
						}
						if (name === 'empty.webp') {
							return { data: null, error: null };
						}
						return { data: null, error: notFoundError, bucket };
					}
				};
			}
		}
	};

	const okTuple = await downloadObject(fakeSupabase, 'learn-media', 'ok.webp', {
		throwOnError: false
	});
	assert.deepEqual(okTuple, { buffer: payload, error: null });
	assert.equal(sha256(okTuple.buffer), sha256(payload));

	const missingTuple = await downloadObject(fakeSupabase, 'learn-media', 'missing.webp', {
		throwOnError: false
	});
	assert.equal(missingTuple.buffer, null);
	assert.equal(missingTuple.error, notFoundError);

	const okBuffer = await downloadObject(fakeSupabase, 'learn-media', 'ok.webp', {
		throwOnError: true
	});
	assert.deepEqual(okBuffer, payload);

	await assert.rejects(
		downloadObject(fakeSupabase, 'learn-media', 'empty.webp', { throwOnError: true }),
		/^Error: learn-media\/empty\.webp: download returned no data$/
	);
	await assert.rejects(
		downloadObject(fakeSupabase, 'learn-media', 'missing.webp', { throwOnError: true }),
		/^Error: learn-media\/missing\.webp: Object not found$/
	);
});

test('fetchRows, fetchAllRows, and listBucketObjects handle missing tables and nested folders', async () => {
	const fakeSupabase = {
		from(tableName) {
			return {
				select() {
					return {
						order() {
							return this;
						},
						async range() {
							if (tableName === 'groups') {
								return { data: [{ id: 'g-1' }], error: null };
							}
							if (tableName === 'profiles') {
								return { data: null, error: { code: '42P01', message: 'relation does not exist' } };
							}
							return { data: null, error: { code: 'PGRST205', message: 'table not in cache' } };
						}
					};
				}
			};
		},
		storage: {
			from() {
				return {
					async list(prefix) {
						if (prefix === '') {
							return {
								data: [
									{ name: 'nested', id: null },
									{ name: 'root.png', id: 'obj-1', metadata: { size: 120 } }
								],
								error: null
							};
						}
						if (prefix === 'nested') {
							return {
								data: [{ name: 'leaf.webp', id: 'obj-2', metadata: null }],
								error: null
							};
						}
						return { data: [], error: null };
					}
				};
			}
		}
	};

	assert.deepEqual(
		await fetchRows(fakeSupabase, { name: 'profiles', keyColumns: ['user_id'] }),
		[]
	);
	const allRows = await fetchAllRows(fakeSupabase);
	assert.deepEqual(allRows.get('groups'), [{ id: 'g-1' }]);
	assert.deepEqual(allRows.get('profiles'), []);

	const objects = await listBucketObjects(fakeSupabase, 'learn-media');
	assert.deepEqual(objects, [
		{ bucket: 'learn-media', name: 'nested/leaf.webp', metadata: {} },
		{ bucket: 'learn-media', name: 'root.png', metadata: { size: 120 } }
	]);
});

test('updateRow and rollbackUpdates respect mutateRow and reverse rollback order', async () => {
	const table = { name: 'groups', keyColumns: ['id'] };
	assert.equal(getRowKey(table, {}), null);
	assert.equal(getRowKey(table, { id: 'g-1' }), 'id=g-1');

	const calls = [];
	const createFakeSupabase = (returnedRows = [{ id: 'g-1' }]) => ({
		from(tableName) {
			return {
				update(changes) {
					const filters = [];
					return {
						eq(column, value) {
							filters.push([column, value]);
							return this;
						},
						async select(columns) {
							calls.push({ tableName, changes, filters, columns });
							return { data: returnedRows, error: null };
						}
					};
				}
			};
		}
	});

	const mutableRowA = { id: 'g-1', avatar_url: 'old-a' };
	const mutableRowB = { id: 'g-2', avatar_url: 'old-b' };
	const fakeSupabase = createFakeSupabase([{ id: 'ok' }]);

	const updateA = {
		table,
		row: mutableRowA,
		changes: { avatar_url: 'new-a' },
		rollback: { avatar_url: 'old-a' }
	};
	const updateB = {
		table,
		row: mutableRowB,
		changes: { avatar_url: 'new-b' },
		rollback: { avatar_url: 'old-b' }
	};

	await updateRow(fakeSupabase, updateA, { mutateRow: true });
	await updateRow(fakeSupabase, updateB, { mutateRow: true });
	assert.equal(mutableRowA.avatar_url, 'new-a');
	assert.equal(mutableRowB.avatar_url, 'new-b');

	calls.length = 0;
	await rollbackUpdates(fakeSupabase, [updateA, updateB], { mutateRow: true });
	assert.deepEqual(
		calls.map((call) => ({ filters: call.filters, changes: call.changes })),
		[
			{ filters: [['id', 'g-2']], changes: { avatar_url: 'old-b' } },
			{ filters: [['id', 'g-1']], changes: { avatar_url: 'old-a' } }
		]
	);
	assert.equal(mutableRowA.avatar_url, 'old-a');
	assert.equal(mutableRowB.avatar_url, 'old-b');

	const immutableRow = { id: 'g-3', avatar_url: 'original' };
	await updateRow(
		fakeSupabase,
		{
			table,
			row: immutableRow,
			changes: { avatar_url: 'repaired' },
			rollback: { avatar_url: 'original' }
		},
		{ mutateRow: false }
	);
	assert.equal(immutableRow.avatar_url, 'original');

	await assert.rejects(
		updateRow(createFakeSupabase([]), updateA, { mutateRow: false }),
		/groups\/id=g-1 updated 0 rows; refusing to continue\./
	);
});
