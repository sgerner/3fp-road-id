import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const REMOVE_STALE_LINKS = process.argv.includes('--remove-stale-links');
const PAGE_SIZE = 1000;
const STORAGE_MARKER = '/storage/v1/object/';
const STORAGE_ROUTES = new Set(['public', 'sign', 'authenticated']);
const BUCKETS = [
	'storage',
	'learn-media',
	'ride-media',
	'group-social-media',
	'group-assets',
	'merch-media',
	'group-accounting-receipts'
];

const TABLES = [
	{ name: 'groups', keyColumns: ['id'] },
	{ name: 'profiles', keyColumns: ['user_id'] },
	{ name: 'ride_details', keyColumns: ['activity_event_id'] },
	{ name: 'group_events', keyColumns: ['id'] },
	{ name: 'group_gallery_images', keyColumns: ['id'] },
	{ name: 'group_announcements', keyColumns: ['id'] },
	{ name: 'group_resources', keyColumns: ['id'] },
	{ name: 'group_faqs', keyColumns: ['id'] },
	{ name: 'group_asset_sections', keyColumns: ['id'] },
	{ name: 'group_assets', keyColumns: ['id'] },
	{ name: 'learn_assets', keyColumns: ['id'] },
	{ name: 'media_assets', keyColumns: ['id'] },
	{ name: 'group_social_accounts', keyColumns: ['id'] },
	{ name: 'group_social_posts', keyColumns: ['id'] },
	{ name: 'group_social_comments', keyColumns: ['id'] },
	{ name: 'group_social_comment_replies', keyColumns: ['id'] },
	{ name: 'group_social_content_library', keyColumns: ['id'] },
	{ name: 'group_site_configs', keyColumns: ['id'] },
	{ name: 'learn_articles', keyColumns: ['id'] },
	{ name: 'learn_article_revisions', keyColumns: ['id'] },
	{ name: 'learn_comments', keyColumns: ['id'] },
	{ name: 'learn_categories', keyColumns: ['slug'] },
	{ name: 'learn_subcategories', keyColumns: ['slug'] },
	{ name: 'group_news_posts', keyColumns: ['id'] },
	{ name: 'group_outreach', keyColumns: ['id'] },
	{ name: 'group_enrichment', keyColumns: ['group_id'] },
	{ name: 'merch_products', keyColumns: ['id'] },
	{ name: 'merch_partner_accounts', keyColumns: ['id'] },
	{ name: 'volunteer_event_emails', keyColumns: ['id'] },
	{ name: 'group_accounting_entries', keyColumns: ['id'] },
	{ name: 'group_accounting_audit_events', keyColumns: ['id'] },
	{ name: 'group_accounting_receipts', keyColumns: ['id'] }
];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const learnAssetRoot = path.resolve(repositoryRoot, 'docs/3ftwiki');

function loadLocalEnv() {
	const values = { ...process.env };
	if (values.PUBLIC_SUPABASE_URL && values.SUPABASE_SERVICE_ROLE_KEY) return values;
	try {
		for (const line of fs.readFileSync(path.join(repositoryRoot, '.env'), 'utf8').split(/\r?\n/)) {
			const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
			if (!match || values[match[1]]) continue;
			values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
		}
	} catch {
		// The caller may provide both variables directly.
	}
	return values;
}

const env = loadLocalEnv();
const supabaseUrl = env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
	throw new Error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { autoRefreshToken: false, persistSession: false }
});

function objectKey(bucket, name) {
	return `${bucket}:${name}`;
}

function encodeObjectPath(objectPath) {
	return objectPath
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/');
}

function publicUrl(bucket, name) {
	return `${supabaseUrl.replace(/\/$/, '')}${STORAGE_MARKER}public/${bucket}/${encodeObjectPath(name)}`;
}

function decodePart(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

const PATH_DELIMITERS = new Set(['?', '#', '"', '`', '<', '>', ',', '}', ' ', '\t', '\n', '\r']);

function isPathDelimiter(value, index) {
	const character = value[index];
	if (PATH_DELIMITERS.has(character)) return true;
	if (character !== "'") return false;
	const next = value[index + 1];
	if (next === "'") return false;
	return next == null || /[\s)\]}>,:;?'"`<]/.test(next) || /\d/.test(next);
}

function normalizeEmbeddedName(rawName) {
	let name = rawName;
	const markdownLinkStart = name.search(/\]\(https?:\/\//i);
	if (markdownLinkStart !== -1) name = name.slice(0, markdownLinkStart);
	const textSearchSuffix = name.search(/\)(?:['"`:]|\d|$)/);
	if (textSearchSuffix !== -1) name = name.slice(0, textSearchSuffix);
	name = name.replaceAll("''", "'");
	if (/\.(?:avif|gif|jpe?g|png|svg|webp|pdf|csv|docx?|xlsx?|pptx?)\.$/i.test(name)) {
		name = name.slice(0, -1);
	}
	return name;
}

function findStorageReferences(value) {
	const references = [];
	const unrecognized = [];
	if (typeof value !== 'string' || !value.includes(STORAGE_MARKER)) {
		return { references, unrecognized };
	}

	let searchFrom = 0;
	while (searchFrom < value.length) {
		const markerIndex = value.indexOf(STORAGE_MARKER, searchFrom);
		if (markerIndex === -1) break;
		let cursor = markerIndex + STORAGE_MARKER.length;
		const routeMatch = value.slice(cursor).match(/^(public|sign|authenticated)\//);
		if (!routeMatch || !STORAGE_ROUTES.has(routeMatch[1])) {
			unrecognized.push(value.slice(markerIndex, markerIndex + STORAGE_MARKER.length));
			searchFrom = cursor;
			continue;
		}

		const route = routeMatch[1];
		cursor += route.length + 1;
		const bucketStart = cursor;
		while (
			cursor < value.length &&
			value[cursor] !== '/' &&
			!['?', '#', '"', "'", '`', '<', '>', ',', '}', ' ', '\t', '\n', '\r'].includes(value[cursor])
		) {
			cursor += 1;
		}
		if (value[cursor] !== '/') {
			unrecognized.push(value.slice(markerIndex, cursor));
			searchFrom = Math.max(cursor, markerIndex + STORAGE_MARKER.length);
			continue;
		}

		const bucketRaw = value.slice(bucketStart, cursor);
		const nameStart = cursor + 1;
		let nameEnd = nameStart;
		while (nameEnd < value.length && !isPathDelimiter(value, nameEnd)) nameEnd += 1;

		const rawName = value.slice(nameStart, nameEnd);
		const normalizedRawName = normalizeEmbeddedName(rawName);
		const bucket = decodePart(bucketRaw);
		const nameParts = normalizedRawName.split('/').map(decodePart);
		if (!bucket || !normalizedRawName || nameParts.some((part) => part === null)) {
			unrecognized.push(value.slice(markerIndex, nameEnd));
			searchFrom = Math.max(nameEnd, markerIndex + STORAGE_MARKER.length);
			continue;
		}

		references.push({
			route,
			bucket,
			name: nameParts.join('/'),
			nameStart,
			nameEnd: nameStart + normalizedRawName.length
		});
		searchFrom = Math.max(nameEnd, nameStart + normalizedRawName.length);
	}

	return { references, unrecognized };
}

function createReferenceState() {
	return {
		references: new Set(),
		unrecognizedLocations: new Set(),
		unrecognizedReferences: new Map()
	};
}

function collectStorageState(value, state, source) {
	const stack = [value];
	while (stack.length) {
		const current = stack.pop();
		if (typeof current === 'string') {
			const { references, unrecognized } = findStorageReferences(current);
			for (const reference of references) {
				state.references.add(objectKey(reference.bucket, reference.name));
			}
			for (const value of unrecognized) {
				state.unrecognizedLocations.add(source);
				if (!state.unrecognizedReferences.has(source)) {
					state.unrecognizedReferences.set(source, new Set());
				}
				state.unrecognizedReferences.get(source).add(value.slice(0, 160));
			}
		} else if (Array.isArray(current)) {
			stack.push(...current);
		} else if (current && typeof current === 'object') {
			if (typeof current.bucket_id === 'string' && typeof current.object_path === 'string') {
				state.references.add(objectKey(current.bucket_id, current.object_path));
			}
			stack.push(...Object.values(current));
		}
	}
}

function collectReferenceState(rowsByTable) {
	const state = createReferenceState();
	for (const table of TABLES) {
		for (const row of rowsByTable.get(table.name) || []) {
			for (const [column, value] of Object.entries(row)) {
				collectStorageState(value, state, `${table.name}.${column}`);
			}
		}
	}
	return state;
}

function replaceStorageValue(value, target) {
	if (typeof value === 'string') {
		const { references } = findStorageReferences(value);
		const replacementName = encodeObjectPath(target.newName);
		let result = value;
		let offset = 0;
		for (const reference of references) {
			if (
				reference.route !== 'public' ||
				reference.bucket !== target.bucket ||
				reference.name !== target.name
			) {
				continue;
			}
			const start = reference.nameStart + offset;
			const end = reference.nameEnd + offset;
			result = `${result.slice(0, start)}${replacementName}${result.slice(end)}`;
			offset += replacementName.length - (end - start);
		}
		return result;
	}
	if (Array.isArray(value)) return value.map((entry) => replaceStorageValue(entry, target));
	if (value && typeof value === 'object') {
		const result = Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, replaceStorageValue(entry, target)])
		);
		if (
			typeof value.bucket_id === 'string' &&
			typeof value.object_path === 'string' &&
			value.bucket_id === target.bucket &&
			value.object_path === target.name
		) {
			result.object_path = target.newName;
			if ('mime_type' in value) result.mime_type = target.newContentType;
			if ('size_bytes' in value) result.size_bytes = target.newBytes;
			if ('content_hash' in value) result.content_hash = target.newHash;
		}
		return result;
	}
	return value;
}

function removeRideImageReferences(value, target) {
	if (!Array.isArray(value)) return value;
	return value.filter((entry) => {
		if (typeof entry !== 'string') return true;
		return !findStorageReferences(entry).references.some(
			(reference) =>
				reference.route === 'public' &&
				reference.bucket === target.bucket &&
				reference.name === target.name
		);
	});
}

function valuesEqual(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function mimeTypeFor(name, metadata = {}) {
	const metadataType = metadata.mimetype || metadata.contentType || '';
	if (metadataType) return metadataType.toLowerCase();
	const extension = path.extname(name).toLowerCase();
	return (
		{
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.webp': 'image/webp',
			'.gif': 'image/gif',
			'.svg': 'image/svg+xml',
			'.avif': 'image/avif',
			'.pdf': 'application/pdf'
		}[extension] || 'application/octet-stream'
	);
}

function sha256(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

async function fetchRows(table) {
	const rows = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		let query = supabase.from(table.name).select('*');
		for (const column of table.keyColumns) {
			query = query.order(column, { ascending: true, nullsFirst: false });
		}
		const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
		if (error) {
			if (error.code === '42P01' || error.code === 'PGRST205') return [];
			throw new Error(`${table.name}: ${error.message}`);
		}
		rows.push(...(data || []));
		if (!data || data.length < PAGE_SIZE) break;
	}
	return rows;
}

async function fetchAllRows() {
	const entries = await Promise.all(
		TABLES.map(async (table) => [table.name, await fetchRows(table)])
	);
	return new Map(entries);
}

function rowsFingerprint(rows) {
	return createHash('sha256')
		.update(
			rows
				.map((row) => JSON.stringify(row))
				.sort()
				.join('\n')
		)
		.digest('hex');
}

function snapshotRows(rowsByTable) {
	return new Map(
		TABLES.map((table) => [table.name, rowsFingerprint(rowsByTable.get(table.name) || [])])
	);
}

function assertRowsUnchanged(expected, actual, label) {
	for (const table of TABLES) {
		const expectedFingerprint = expected.get(table.name);
		const actualFingerprint = rowsFingerprint(actual.get(table.name) || []);
		if (expectedFingerprint !== actualFingerprint) {
			throw new Error(`Reference rows changed during ${label}; aborting.`);
		}
	}
}

async function listBucketObjects(bucket) {
	const objects = [];
	async function walk(prefix = '') {
		let offset = 0;
		while (true) {
			const { data, error } = await supabase.storage.from(bucket).list(prefix, {
				limit: PAGE_SIZE,
				offset,
				sortBy: { column: 'name', order: 'asc' }
			});
			if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
			if (!data?.length) break;
			for (const item of data) {
				const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
				if (item.id === null) await walk(itemPath);
				else objects.push({ bucket, name: itemPath, metadata: item.metadata || {} });
			}
			if (data.length < PAGE_SIZE) break;
			offset += data.length;
		}
	}
	await walk();
	return objects;
}

async function fetchAllObjects() {
	return (await Promise.all(BUCKETS.map(listBucketObjects))).flat();
}

async function downloadObject(bucket, name) {
	const { data, error } = await supabase.storage.from(bucket).download(name);
	if (error || !data) {
		throw new Error(`${bucket}/${name}: ${error?.message || 'download returned no data'}`);
	}
	return Buffer.from(await data.arrayBuffer());
}

async function mapInBatches(items, concurrency, worker) {
	const results = [];
	for (let index = 0; index < items.length; index += concurrency) {
		const batch = items.slice(index, index + concurrency);
		results.push(...(await Promise.all(batch.map(worker))));
	}
	return results;
}

function localSourceFor(bucket, name) {
	if (bucket !== 'learn-media' || !name.startsWith('imports/')) return null;
	const relative = name.slice('imports/'.length);
	const candidate = path.resolve(learnAssetRoot, relative);
	if (candidate !== learnAssetRoot && !candidate.startsWith(`${learnAssetRoot}${path.sep}`)) {
		return null;
	}
	return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

function getRowKey(table, row) {
	if (table.keyColumns.some((column) => row[column] == null)) return null;
	return table.keyColumns.map((column) => `${column}=${row[column]}`).join(', ');
}

function buildRepairPlans(rowsByTable, objects) {
	const state = collectReferenceState(rowsByTable);
	const objectMap = new Map(
		objects.map((object) => [objectKey(object.bucket, object.name), object])
	);
	const missingKeys = [...state.references].filter((key) => !objectMap.has(key)).sort();
	const plans = [];
	const unresolved = [];

	for (const key of missingKeys) {
		const separator = key.indexOf(':');
		const bucket = key.slice(0, separator);
		const name = key.slice(separator + 1);
		const optimizedName = `optimized/${name}.webp`;
		const optimized = objectMap.get(objectKey(bucket, optimizedName));
		if (optimized) {
			plans.push({
				key,
				bucket,
				name,
				action: 'replace',
				newName: optimizedName,
				newContentType: mimeTypeFor(optimizedName, optimized.metadata),
				newBytes: Number(optimized.metadata?.size || optimized.metadata?.contentLength || 0),
				newHash: null
			});
			continue;
		}

		const sourcePath = localSourceFor(bucket, name);
		if (sourcePath) {
			const buffer = fs.readFileSync(sourcePath);
			plans.push({
				key,
				bucket,
				name,
				action: 'upload',
				newName: name,
				newContentType: mimeTypeFor(name),
				sourcePath,
				sourceBytes: buffer.byteLength,
				sourceHash: sha256(buffer)
			});
			continue;
		}

		if (bucket === 'ride-media' && REMOVE_STALE_LINKS) {
			plans.push({ key, bucket, name, action: 'remove' });
			continue;
		}

		unresolved.push({
			key,
			reason: bucket === 'ride-media' ? 'stale-link-removal-disabled' : 'no-safe-source'
		});
	}

	return { state, objectMap, missingKeys, plans, unresolved };
}

async function hydrateTargetSnapshots(plans, objectMap) {
	const replacePlans = plans.filter((plan) => plan.action === 'replace');
	const uniqueTargets = [...new Map(replacePlans.map((plan) => [plan.newName, plan])).values()];
	const snapshots = new Map();
	await mapInBatches(uniqueTargets, 8, async (plan) => {
		const buffer = await downloadObject(plan.bucket, plan.newName);
		if (!buffer.byteLength) throw new Error(`Target is empty: ${plan.bucket}/${plan.newName}`);
		const hash = sha256(buffer);
		snapshots.set(objectKey(plan.bucket, plan.newName), { bytes: buffer.byteLength, hash });
		plan.newBytes = buffer.byteLength;
		plan.newHash = hash;
	});
	return snapshots;
}

function buildRowUpdates(rowsByTable, plans) {
	const replacePlans = plans.filter((plan) => plan.action === 'replace');
	const removePlans = plans.filter((plan) => plan.action === 'remove');
	const updates = [];

	for (const table of TABLES) {
		for (const row of rowsByTable.get(table.name) || []) {
			let repaired = row;
			for (const plan of replacePlans) repaired = replaceStorageValue(repaired, plan);
			if (table.name === 'ride_details' && 'image_urls' in repaired) {
				for (const plan of removePlans) {
					repaired = {
						...repaired,
						image_urls: removeRideImageReferences(repaired.image_urls, plan)
					};
				}
			}

			// This is a generated tsvector. Updating body_markdown invokes its
			// existing trigger, which regenerates it from the repaired content.
			if (table.name === 'learn_articles' && 'search_document' in repaired) {
				repaired.search_document = row.search_document;
			}

			const changes = {};
			for (const [column, value] of Object.entries(repaired)) {
				if (table.keyColumns.includes(column) || ['created_at', 'updated_at'].includes(column)) {
					if (!valuesEqual(value, row[column])) {
						throw new Error(
							`${table.name}/${getRowKey(table, row)} would change its key or timestamp.`
						);
					}
					continue;
				}
				if (!valuesEqual(value, row[column])) changes[column] = value;
			}
			if (!Object.keys(changes).length) continue;
			const rowKey = getRowKey(table, row);
			if (!rowKey)
				throw new Error(`${table.name} has an incomplete primary key; refusing to repair it.`);
			updates.push({
				table,
				row,
				changes,
				rollback: Object.fromEntries(Object.keys(changes).map((column) => [column, row[column]]))
			});
		}
	}

	return updates;
}

function summarizePlans(plans, updates) {
	const byAction = Object.fromEntries(
		['replace', 'upload', 'remove'].map((action) => [
			action,
			plans.filter((plan) => plan.action === action).length
		])
	);
	const rowsByTable = {};
	for (const update of updates) {
		rowsByTable[update.table.name] = (rowsByTable[update.table.name] || 0) + 1;
	}
	const staleRows = new Set(
		updates
			.filter((update) => update.table.name === 'ride_details' && 'image_urls' in update.changes)
			.map((update) => getRowKey(update.table, update.row))
	);
	return {
		plans_by_action: byAction,
		rows_to_update: updates.length,
		rows_by_table: rowsByTable,
		ride_rows_with_changes: staleRows.size
	};
}

async function updateRow(update) {
	let query = supabase.from(update.table.name).update(update.changes);
	for (const column of update.table.keyColumns) query = query.eq(column, update.row[column]);
	const { data, error } = await query.select(update.table.keyColumns.join(','));
	if (error)
		throw new Error(
			`${update.table.name}/${getRowKey(update.table, update.row)}: ${error.message}`
		);
	if (!Array.isArray(data) || data.length !== 1) {
		throw new Error(
			`${update.table.name}/${getRowKey(update.table, update.row)} updated ${data?.length || 0} rows; refusing to continue.`
		);
	}
}

async function rollbackUpdates(updates) {
	for (const update of updates.slice().reverse()) {
		await updateRow({ ...update, changes: update.rollback });
	}
}

async function uploadSources(plans) {
	const created = [];
	for (const plan of plans.filter((item) => item.action === 'upload')) {
		const buffer = fs.readFileSync(plan.sourcePath);
		if (buffer.byteLength !== plan.sourceBytes || sha256(buffer) !== plan.sourceHash) {
			throw new Error(`Local source changed since planning: ${plan.sourcePath}`);
		}
		const { error } = await supabase.storage.from(plan.bucket).upload(plan.newName, buffer, {
			contentType: plan.newContentType,
			upsert: false
		});
		if (error) throw new Error(`${plan.bucket}/${plan.newName}: ${error.message}`);
		const uploaded = await downloadObject(plan.bucket, plan.newName);
		if (sha256(uploaded) !== plan.sourceHash || uploaded.byteLength !== plan.sourceBytes) {
			await supabase.storage
				.from(plan.bucket)
				.remove([plan.newName])
				.catch(() => null);
			throw new Error(`Uploaded source failed verification: ${plan.bucket}/${plan.newName}`);
		}
		created.push(plan);
	}
	return created;
}

async function assertTargetSnapshots(plans, snapshots) {
	const replacePlans = [
		...new Map(
			plans
				.filter((plan) => plan.action === 'replace')
				.map((plan) => [objectKey(plan.bucket, plan.newName), plan])
		).values()
	];
	await mapInBatches(replacePlans, 8, async (plan) => {
		const buffer = await downloadObject(plan.bucket, plan.newName);
		const expected = snapshots.get(objectKey(plan.bucket, plan.newName));
		if (!expected || buffer.byteLength !== expected.bytes || sha256(buffer) !== expected.hash) {
			throw new Error(`Optimized target changed since planning: ${plan.bucket}/${plan.newName}`);
		}
	});
}

async function main() {
	const rowsByTable = await fetchAllRows();
	const initialSnapshot = snapshotRows(rowsByTable);
	const objects = await fetchAllObjects();
	const { state, objectMap, missingKeys, plans, unresolved } = buildRepairPlans(
		rowsByTable,
		objects
	);
	const targetSnapshots = await hydrateTargetSnapshots(plans, objectMap);
	const updates = buildRowUpdates(rowsByTable, plans);
	const summary = summarizePlans(plans, updates);
	const unrecognized = [...state.unrecognizedReferences.entries()].map(([source, values]) => ({
		source,
		count: values.size,
		samples: [...values].slice(0, 10)
	}));

	console.log(
		JSON.stringify(
			{
				mode: APPLY ? 'apply' : 'dry-run',
				remove_stale_links_enabled: REMOVE_STALE_LINKS,
				missing_before: missingKeys.length,
				unrecognized_before: unrecognized.reduce((sum, item) => sum + item.count, 0),
				unrecognized_references: unrecognized,
				...summary,
				unresolved,
				uploads: plans
					.filter((plan) => plan.action === 'upload')
					.map(({ bucket, name, sourcePath, sourceBytes }) => ({
						bucket,
						name,
						sourcePath,
						sourceBytes
					})),
				replacement_samples: plans
					.filter((plan) => plan.action === 'replace')
					.slice(0, 12)
					.map(({ bucket, name, newName }) => ({ bucket, name, newName })),
				removal_samples: plans
					.filter((plan) => plan.action === 'remove')
					.slice(0, 12)
					.map(({ bucket, name }) => ({ bucket, name }))
			},
			null,
			2
		)
	);

	if (!APPLY) return;
	if (state.unrecognizedLocations.size) {
		throw new Error(
			`Unrecognized Storage references found in ${[...state.unrecognizedLocations].join(', ')}; refusing to apply.`
		);
	}
	if (unresolved.length) {
		throw new Error(
			`${unresolved.length} missing references have no safe repair plan; refusing to apply.`
		);
	}
	if (!REMOVE_STALE_LINKS && plans.some((plan) => plan.action === 'remove')) {
		throw new Error(
			'Stale-link removal was requested by the repair plan but --remove-stale-links was not provided.'
		);
	}

	const freshRows = await fetchAllRows();
	assertRowsUnchanged(initialSnapshot, freshRows, 'preflight');
	await assertTargetSnapshots(plans, targetSnapshots);

	const uploaded = [];
	const applied = [];
	try {
		uploaded.push(...(await uploadSources(plans)));
		const rowsAfterUpload = await fetchAllRows();
		assertRowsUnchanged(initialSnapshot, rowsAfterUpload, 'source upload preflight');
		for (const update of updates) {
			await updateRow(update);
			applied.push(update);
		}

		const finalRows = await fetchAllRows();
		const finalObjects = await fetchAllObjects();
		const finalState = collectReferenceState(finalRows);
		const finalObjectKeys = new Set(
			finalObjects.map((object) => objectKey(object.bucket, object.name))
		);
		const finalMissing = [...finalState.references]
			.filter((key) => !finalObjectKeys.has(key))
			.sort();
		if (finalState.unrecognizedLocations.size || finalMissing.length) {
			throw new Error(
				`Post-repair verification found ${finalMissing.length} missing and ${finalState.unrecognizedLocations.size} unrecognized reference locations.`
			);
		}

		console.log(
			JSON.stringify(
				{
					applied_rows: applied.length,
					uploaded_objects: uploaded.length,
					verified_missing_after: finalMissing.length,
					verified_unrecognized_after: finalState.unrecognizedLocations.size
				},
				null,
				2
			)
		);
	} catch (error) {
		if (applied.length) {
			try {
				await rollbackUpdates(applied);
			} catch (rollbackError) {
				throw new Error(`${error.message}; rollback failed: ${rollbackError.message}`);
			}
		}
		for (const plan of uploaded) {
			await supabase.storage
				.from(plan.bucket)
				.remove([plan.newName])
				.catch(() => null);
		}
		throw error;
	}
}

main().catch((error) => {
	console.error(error?.stack || error?.message || error);
	process.exitCode = 1;
});
