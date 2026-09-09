import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const MIN_BYTES = 256 * 1024;
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

// Keep this list aligned with every table that can persist a media URL or a
// bucket/path registry reference. keyColumns are used for fail-closed updates.
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

function loadLocalEnv() {
	const values = { ...process.env };
	if (values.PUBLIC_SUPABASE_URL && values.SUPABASE_SERVICE_ROLE_KEY) return values;
	try {
		for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
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

	// Apostrophes are valid object-name characters. Treat one as a closing
	// quote only when it is followed by punctuation, whitespace, a tsvector
	// position, or the end of the containing value.
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
	// PostgreSQL's tsvector text format escapes an apostrophe as two
	// apostrophes inside a lexeme.
	name = name.replaceAll("''", "'");
	// A URL embedded in prose can be followed by sentence punctuation. Do not
	// turn that punctuation into part of the Storage object name.
	if (/\.(?:avif|gif|jpe?g|png|svg|webp|pdf|csv|docx?|xlsx?|pptx?)\.$/i.test(name)) {
		name = name.slice(0, -1);
	}
	return name;
}

/**
 * Find Storage object paths anywhere inside a string. The old implementation
 * only accepted a string that was itself a complete public URL, which missed
 * Markdown, tsvector, JSON, signed, and authenticated references.
 */
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
		while (nameEnd < value.length && !isPathDelimiter(value, nameEnd)) {
			nameEnd += 1;
		}

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
		protectedReferences: new Set(),
		registryReferences: new Set(),
		unrecognizedLocations: new Set(),
		unrecognizedReferences: new Map()
	};
}

function recordUnrecognizedReference(state, source, value) {
	state.unrecognizedLocations.add(source);
	if (!state.unrecognizedReferences.has(source)) {
		state.unrecognizedReferences.set(source, new Set());
	}
	state.unrecognizedReferences.get(source).add(value.slice(0, 160));
}

function collectStorageState(value, state, source) {
	const stack = [value];
	while (stack.length) {
		const current = stack.pop();
		if (typeof current === 'string') {
			const { references, unrecognized } = findStorageReferences(current);
			for (const reference of references) {
				const key = objectKey(reference.bucket, reference.name);
				state.references.add(key);
				if (reference.route !== 'public') state.protectedReferences.add(key);
			}
			for (const value of unrecognized) recordUnrecognizedReference(state, source, value);
		} else if (Array.isArray(current)) {
			stack.push(...current);
		} else if (current && typeof current === 'object') {
			if (typeof current.bucket_id === 'string' && typeof current.object_path === 'string') {
				const key = objectKey(current.bucket_id, current.object_path);
				state.references.add(key);
				state.registryReferences.add(key);
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
			if (row.bucket_id != null && row.object_path != null) {
				const key = objectKey(row.bucket_id, row.object_path);
				state.references.add(key);
				state.registryReferences.add(key);
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
	if (Array.isArray(value)) {
		return value.map((entry) => replaceStorageValue(entry, target));
	}
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
			'.avif': 'image/avif'
		}[extension] || ''
	);
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
			throw new Error(`Reference rows changed during ${label}; aborting before Storage mutation.`);
		}
	}
}

async function optimizeBuffer(buffer, contentType) {
	if (!contentType.startsWith('image/') || ['image/gif', 'image/svg+xml'].includes(contentType)) {
		return null;
	}
	try {
		const output = await sharp(buffer, { failOn: 'none' })
			.rotate()
			.resize({ width: 2400, height: 1800, fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 82, effort: 4, alphaQuality: 90 })
			.toBuffer();
		return output.byteLength < buffer.byteLength ? output : null;
	} catch {
		return null;
	}
}

async function mapInBatches(items, concurrency, worker) {
	const results = [];
	for (let index = 0; index < items.length; index += concurrency) {
		const batch = items.slice(index, index + concurrency);
		results.push(...(await Promise.all(batch.map(worker))).filter(Boolean));
	}
	return results;
}

function getRowKey(table, row) {
	if (table.keyColumns.some((column) => row[column] == null)) return null;
	return table.keyColumns.map((column) => `${column}=${row[column]}`).join(', ');
}

function buildCandidateUpdates(candidate, rowsByTable) {
	const updates = [];
	for (const table of TABLES) {
		for (const row of rowsByTable.get(table.name) || []) {
			const changes = {};
			for (const [column, value] of Object.entries(row)) {
				if (table.keyColumns.includes(column) || ['created_at', 'updated_at'].includes(column)) {
					continue;
				}
				const replaced = replaceStorageValue(value, candidate);
				if (!valuesEqual(value, replaced)) changes[column] = replaced;
			}

			if (row.bucket_id === candidate.bucket && row.object_path === candidate.name) {
				changes.object_path = candidate.newName;
				if ('mime_type' in row) changes.mime_type = candidate.newContentType;
				if ('size_bytes' in row) changes.size_bytes = candidate.newBytes;
				if (table.name === 'media_assets' && 'content_hash' in row) {
					changes.content_hash = candidate.newHash;
				}
			}

			if (!Object.keys(changes).length) continue;
			const rowKey = getRowKey(table, row);
			if (!rowKey) {
				throw new Error(
					`${table.name} has a Storage reference but no complete primary-key mapping; refusing to apply ${candidate.bucket}/${candidate.name}.`
				);
			}
			updates.push({
				table,
				row,
				changes,
				rollback: Object.fromEntries(Object.keys(changes).map((column) => [column, row[column]]))
			});
		}
	}
	if (!updates.length) {
		throw new Error(
			`No database update plan was generated for referenced object ${candidate.bucket}/${candidate.name}; refusing to delete it.`
		);
	}
	return updates;
}

async function updateRow(update) {
	const { table, row, changes } = update;
	let query = supabase.from(table.name).update(changes);
	for (const column of table.keyColumns) query = query.eq(column, row[column]);
	const { data, error } = await query.select(table.keyColumns.join(','));
	if (error) throw new Error(`${table.name}/${getRowKey(table, row)}: ${error.message}`);
	if (!Array.isArray(data) || data.length !== 1) {
		throw new Error(
			`${table.name}/${getRowKey(table, row)} updated ${data?.length || 0} rows; refusing to continue.`
		);
	}
	Object.assign(row, changes);
}

function sha256(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

async function downloadObject(bucket, name) {
	const { data, error } = await supabase.storage.from(bucket).download(name);
	if (error || !data)
		return { buffer: null, error: error || new Error(`${bucket}/${name} returned no data`) };
	return { buffer: Buffer.from(await data.arrayBuffer()), error: null };
}

function isMissingStorageError(error) {
	return (
		Number(error?.statusCode || error?.status) === 404 ||
		/not[ _-]?found|does not exist|404/i.test(error?.message || '')
	);
}

function isAlreadyExistsError(error) {
	return /already exists|duplicate|409/i.test(error?.message || '');
}

async function inspectTarget(candidate) {
	const { buffer, error } = await downloadObject(candidate.bucket, candidate.newName);
	if (error) {
		if (isMissingStorageError(error)) return { exists: false };
		throw new Error(`Unable to verify ${candidate.bucket}/${candidate.newName}: ${error.message}`);
	}
	if (sha256(buffer) !== candidate.newHash || buffer.byteLength !== candidate.newBytes) {
		throw new Error(
			`Existing optimized target differs from the planned bytes: ${candidate.bucket}/${candidate.newName}.`
		);
	}
	return { exists: true };
}

async function ensureTargetObject(candidate) {
	const before = await inspectTarget(candidate);
	if (before.exists) return false;

	let uploaded = false;
	try {
		const { error } = await supabase.storage
			.from(candidate.bucket)
			.upload(candidate.newName, candidate.buffer, {
				contentType: candidate.newContentType,
				upsert: false
			});
		if (error) {
			if (!isAlreadyExistsError(error)) throw error;
			const existing = await inspectTarget(candidate);
			if (!existing.exists) throw error;
			return false;
		}
		uploaded = true;
		const after = await inspectTarget(candidate);
		if (!after.exists) throw new Error(`Uploaded target is not readable: ${candidate.newName}`);
		return true;
	} catch (error) {
		if (uploaded) {
			await supabase.storage
				.from(candidate.bucket)
				.remove([candidate.newName])
				.catch(() => null);
		}
		throw new Error(`${candidate.bucket}/${candidate.name}: ${error.message}`);
	}
}

async function removeObject(bucket, name) {
	const { error } = await supabase.storage.from(bucket).remove([name]);
	if (error) throw new Error(`${bucket}/${name}: ${error.message}`);
}

async function verifySourceSnapshot(candidate) {
	const { buffer, error } = await downloadObject(candidate.bucket, candidate.name);
	if (error)
		throw new Error(`Source changed or disappeared: ${candidate.bucket}/${candidate.name}`);
	if (buffer.byteLength !== candidate.oldBytes || sha256(buffer) !== candidate.sourceHash) {
		throw new Error(
			`Source changed since the dry-run snapshot: ${candidate.bucket}/${candidate.name}`
		);
	}
}

function assertNoOldReferences(candidate, rowsByTable) {
	const state = collectReferenceState(rowsByTable);
	if (state.unrecognizedLocations.size) {
		throw new Error(
			`Unrecognized Storage references remain in ${[...state.unrecognizedLocations].join(', ')}; refusing to delete.`
		);
	}
	if (state.references.has(objectKey(candidate.bucket, candidate.name))) {
		throw new Error(
			`References to ${candidate.bucket}/${candidate.name} remain after updates; refusing to delete.`
		);
	}
}

async function rollbackUpdates(updates) {
	for (const update of updates.slice().reverse()) {
		await updateRow({ ...update, changes: update.rollback });
	}
}

async function applyCandidate(candidate, rowsByTable) {
	const updates = buildCandidateUpdates(candidate, rowsByTable);
	await verifySourceSnapshot(candidate);
	let createdTarget = false;
	let referencesVerified = false;
	const appliedUpdates = [];
	try {
		createdTarget = await ensureTargetObject(candidate);
		for (const update of updates) {
			await updateRow(update);
			appliedUpdates.push(update);
		}

		const refreshedRows = await fetchAllRows();
		assertNoOldReferences(candidate, refreshedRows);
		referencesVerified = true;
		await removeObject(candidate.bucket, candidate.name);
		return refreshedRows;
	} catch (error) {
		// If the old object could not be removed, keeping verified new references
		// is safer than restoring references to an object that may be gone.
		if (!referencesVerified && appliedUpdates.length) {
			try {
				await rollbackUpdates(appliedUpdates);
			} catch (rollbackError) {
				throw new Error(`${error.message}; rollback failed: ${rollbackError.message}`);
			}
		}
		if (createdTarget && !referencesVerified) {
			await supabase.storage
				.from(candidate.bucket)
				.remove([candidate.newName])
				.catch(() => null);
		}
		throw error;
	}
}

async function main() {
	let rowsByTable = await fetchAllRows();
	const initialSnapshot = snapshotRows(rowsByTable);
	const objects = (await Promise.all(BUCKETS.map(listBucketObjects))).flat();
	const referenceState = collectReferenceState(rowsByTable);

	const eligibleObjects = objects.filter((object) => {
		const key = objectKey(object.bucket, object.name);
		if (!referenceState.references.has(key)) return false;
		if (referenceState.protectedReferences.has(key)) return false;
		if (object.name.startsWith('optimized/')) return false;
		const contentType = mimeTypeFor(object.name, object.metadata);
		const sizeBytes = Number(object.metadata?.size || object.metadata?.contentLength || 0);
		return contentType.startsWith('image/') && sizeBytes >= MIN_BYTES;
	});
	const objectKeys = new Set(objects.map((object) => objectKey(object.bucket, object.name)));
	const missingReferences = [...referenceState.references]
		.filter((key) => !objectKeys.has(key))
		.sort();
	const unrecognizedReferences = [...referenceState.unrecognizedReferences.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([source, values]) => {
			const references = [...values].sort();
			return {
				source,
				count: references.length,
				samples: references.slice(0, 10)
			};
		});
	const unrecognizedReferenceCount = unrecognizedReferences.reduce(
		(sum, item) => sum + item.count,
		0
	);

	const candidates = await mapInBatches(eligibleObjects, 8, async (object) => {
		const contentType = mimeTypeFor(object.name, object.metadata);
		const { buffer: source, error } = await downloadObject(object.bucket, object.name);
		if (error || !source) return null;
		const optimized = await optimizeBuffer(source, contentType);
		if (!optimized) return null;
		return {
			...object,
			contentType,
			newContentType: 'image/webp',
			newName: `optimized/${object.name}.webp`,
			newHash: sha256(optimized),
			sourceHash: sha256(source),
			oldBytes: source.byteLength,
			newBytes: optimized.byteLength,
			buffer: optimized
		};
	});

	const totalOld = candidates.reduce((sum, item) => sum + item.oldBytes, 0);
	const totalNew = candidates.reduce((sum, item) => sum + item.newBytes, 0);
	const candidateSafetyIssues = [];
	for (const candidate of candidates) {
		try {
			buildCandidateUpdates(candidate, rowsByTable);
		} catch (error) {
			candidateSafetyIssues.push({
				bucket: candidate.bucket,
				name: candidate.name,
				error: error.message
			});
		}
	}
	console.log(
		JSON.stringify(
			{
				mode: APPLY ? 'apply' : 'dry-run',
				tables_scanned: TABLES.length,
				rows_scanned: [...rowsByTable.values()].reduce((sum, rows) => sum + rows.length, 0),
				objects_scanned: objects.length,
				referenced_objects: referenceState.references.size,
				protected_references: referenceState.protectedReferences.size,
				registry_references: referenceState.registryReferences.size,
				unrecognized_reference_locations: referenceState.unrecognizedLocations.size,
				unrecognized_reference_count: unrecognizedReferenceCount,
				unrecognized_references: unrecognizedReferences,
				missing_reference_count: missingReferences.length,
				missing_references: missingReferences.slice(0, 50),
				candidate_safety_issues: candidateSafetyIssues,
				candidates: candidates.length,
				candidate_bytes: totalOld,
				estimated_new_bytes: totalNew,
				estimated_reclaimed_bytes: totalOld - totalNew,
				top_candidates: candidates
					.slice()
					.sort((a, b) => b.oldBytes - a.oldBytes)
					.slice(0, 20)
					.map(({ bucket, name, oldBytes, newBytes }) => ({
						bucket,
						name,
						oldBytes,
						newBytes,
						reclaimedBytes: oldBytes - newBytes
					}))
			},
			null,
			2
		)
	);

	if (!APPLY) return;
	if (referenceState.unrecognizedLocations.size) {
		throw new Error(
			`Unrecognized Storage references found in ${[...referenceState.unrecognizedLocations].join(', ')}; fix the inventory before --apply.`
		);
	}
	if (missingReferences.length) {
		throw new Error(
			`${missingReferences.length} Storage references point to missing or unlisted objects; repair the reference inventory before --apply.`
		);
	}
	if (candidateSafetyIssues.length) {
		throw new Error(
			'One or more candidates have no safe database update plan; fix the inventory before --apply.'
		);
	}
	if (!candidates.length) return;

	// Validate every row plan and every target before the first mutation.
	for (const candidate of candidates) buildCandidateUpdates(candidate, rowsByTable);
	for (const candidate of candidates) {
		await verifySourceSnapshot(candidate);
		await inspectTarget(candidate);
	}
	const beforeApplyRows = await fetchAllRows();
	assertRowsUnchanged(initialSnapshot, beforeApplyRows, 'preflight');
	rowsByTable = beforeApplyRows;
	let expectedSnapshot = snapshotRows(rowsByTable);

	let applied = 0;
	let reclaimed = 0;
	for (const candidate of candidates) {
		const latestRows = await fetchAllRows();
		assertRowsUnchanged(expectedSnapshot, latestRows, 'candidate apply');
		rowsByTable = await applyCandidate(candidate, latestRows);
		expectedSnapshot = snapshotRows(rowsByTable);
		applied += 1;
		reclaimed += candidate.oldBytes - candidate.newBytes;
	}

	console.log(JSON.stringify({ applied, reclaimed_bytes: reclaimed }));
}

main().catch((error) => {
	console.error(error?.stack || error?.message || error);
	process.exitCode = 1;
});
