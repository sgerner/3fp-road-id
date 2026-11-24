import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;
export const STORAGE_MARKER = '/storage/v1/object/';
const STORAGE_ROUTES = new Set(['public', 'sign', 'authenticated']);

export const BUCKETS = [
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
export const TABLES = [
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

/**
 * @param {{ envPath?: string, env?: Record<string, string | undefined> }} [options]
 * @returns {Record<string, string | undefined>}
 */
export function loadLocalEnv({ envPath = '.env', env = process.env } = {}) {
	/** @type {Record<string, string | undefined>} */
	const values = { ...env };
	if (values.PUBLIC_SUPABASE_URL && values.SUPABASE_SERVICE_ROLE_KEY) return values;
	try {
		for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
			const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
			if (!match || values[match[1]]) continue;
			values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
		}
	} catch {
		// The caller may provide both variables directly.
	}
	return values;
}

/**
 * @param {{ envPath?: string, env?: Record<string, string | undefined> }} [options]
 */
export function createStorageScriptClient({ envPath = '.env', env } = {}) {
	const resolvedEnv = loadLocalEnv({ envPath, env });
	const supabaseUrl = resolvedEnv.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = resolvedEnv.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
	}

	const supabase = createClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	return { supabase, supabaseUrl, env: resolvedEnv };
}

export function objectKey(bucket, name) {
	return `${bucket}:${name}`;
}

export function encodeObjectPath(objectPath) {
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
export function findStorageReferences(value) {
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

/**
 * @typedef {{
 *   references: Set<string>,
 *   unrecognizedLocations: Set<string>,
 *   unrecognizedReferences: Map<string, Set<string>>,
 *   protectedReferences?: Set<string>,
 *   registryReferences?: Set<string>
 * }} StorageReferenceState
 */

/**
 * @param {{ includeProtected?: boolean, includeRegistry?: boolean }} [options]
 * @returns {StorageReferenceState}
 */
function createReferenceState({ includeProtected = false, includeRegistry = false } = {}) {
	/** @type {StorageReferenceState} */
	const state = {
		references: new Set(),
		unrecognizedLocations: new Set(),
		unrecognizedReferences: new Map()
	};
	if (includeProtected) state.protectedReferences = new Set();
	if (includeRegistry) state.registryReferences = new Set();
	return state;
}

/**
 * @param {StorageReferenceState} state
 * @param {string} source
 * @param {string} value
 */
function recordUnrecognizedReference(state, source, value) {
	state.unrecognizedLocations.add(source);
	let entries = state.unrecognizedReferences.get(source);
	if (!entries) {
		entries = new Set();
		state.unrecognizedReferences.set(source, entries);
	}
	entries.add(value.slice(0, 160));
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
				if (state.protectedReferences && reference.route !== 'public') {
					state.protectedReferences.add(key);
				}
			}
			for (const item of unrecognized) recordUnrecognizedReference(state, source, item);
		} else if (Array.isArray(current)) {
			stack.push(...current);
		} else if (current && typeof current === 'object') {
			if (typeof current.bucket_id === 'string' && typeof current.object_path === 'string') {
				const key = objectKey(current.bucket_id, current.object_path);
				state.references.add(key);
				if (state.registryReferences) state.registryReferences.add(key);
			}
			stack.push(...Object.values(current));
		}
	}
}

/**
 * @overload
 * @param {Map<string, any[]>} rowsByTable
 * @param {{ includeProtected: true, includeRegistry: true, includeRowRegistry?: boolean }} options
 * @returns {StorageReferenceState & { protectedReferences: Set<string>, registryReferences: Set<string> }}
 */
/**
 * @overload
 * @param {Map<string, any[]>} rowsByTable
 * @param {{ includeProtected?: boolean, includeRegistry?: boolean, includeRowRegistry?: boolean }} [options]
 * @returns {StorageReferenceState}
 */
/**
 * @param {Map<string, any[]>} rowsByTable
 * @param {{ includeProtected?: boolean, includeRegistry?: boolean, includeRowRegistry?: boolean }} [options]
 * @returns {StorageReferenceState}
 */
export function collectReferenceState(
	rowsByTable,
	{ includeProtected = false, includeRegistry = false, includeRowRegistry = false } = {}
) {
	const state = createReferenceState({ includeProtected, includeRegistry });
	for (const table of TABLES) {
		for (const row of rowsByTable.get(table.name) || []) {
			for (const [column, value] of Object.entries(row)) {
				collectStorageState(value, state, `${table.name}.${column}`);
			}
			if (includeRowRegistry && row.bucket_id != null && row.object_path != null) {
				const key = objectKey(row.bucket_id, row.object_path);
				state.references.add(key);
				if (state.registryReferences) state.registryReferences.add(key);
			}
		}
	}
	return state;
}

export function replaceStorageValue(value, target) {
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

export function valuesEqual(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

const IMAGE_MIME_TYPES = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.avif': 'image/avif'
};

/**
 * @param {string} name
 * @param {Record<string, any> | null} [metadata={}]
 * @param {{ includePdf?: boolean, fallback?: string }} [options]
 * @returns {string}
 */
export function mimeTypeFor(name, metadata = {}, { includePdf = false, fallback = '' } = {}) {
	const metadataType = metadata?.mimetype || metadata?.contentType || '';
	if (metadataType) return metadataType.toLowerCase();
	const extension = path.extname(name).toLowerCase();
	if (includePdf && extension === '.pdf') return 'application/pdf';
	return IMAGE_MIME_TYPES[extension] || fallback;
}

export async function listBucketObjects(supabase, bucket) {
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

export async function fetchRows(supabase, table) {
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

export async function fetchAllRows(supabase) {
	const entries = await Promise.all(
		TABLES.map(
			async (table) =>
				/** @type {[string, any[]]} */ ([table.name, await fetchRows(supabase, table)])
		)
	);
	return new Map(entries);
}

export function rowsFingerprint(rows) {
	return createHash('sha256')
		.update(
			rows
				.map((row) => JSON.stringify(row))
				.sort()
				.join('\n')
		)
		.digest('hex');
}

export function snapshotRows(rowsByTable) {
	return new Map(
		TABLES.map(
			(table) =>
				/** @type {[string, string]} */ ([
					table.name,
					rowsFingerprint(rowsByTable.get(table.name) || [])
				])
		)
	);
}

export function assertRowsUnchanged(expected, actual, label, { abortSuffix = 'aborting.' } = {}) {
	for (const table of TABLES) {
		const expectedFingerprint = expected.get(table.name);
		const actualFingerprint = rowsFingerprint(actual.get(table.name) || []);
		if (expectedFingerprint !== actualFingerprint) {
			throw new Error(`Reference rows changed during ${label}; ${abortSuffix}`);
		}
	}
}

export async function mapInBatches(items, concurrency, worker, { filterTruthy = false } = {}) {
	const results = [];
	for (let index = 0; index < items.length; index += concurrency) {
		const batch = items.slice(index, index + concurrency);
		const batchResults = await Promise.all(batch.map(worker));
		results.push(...(filterTruthy ? batchResults.filter(Boolean) : batchResults));
	}
	return results;
}

export function getRowKey(table, row) {
	if (table.keyColumns.some((column) => row[column] == null)) return null;
	return table.keyColumns.map((column) => `${column}=${row[column]}`).join(', ');
}

export function sha256(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

/**
 * @param {any} supabase
 * @param {string} bucket
 * @param {string} name
 * @param {{ throwOnError?: boolean }} [options]
 * @returns {Promise<any>}
 */
export async function downloadObject(supabase, bucket, name, { throwOnError = false } = {}) {
	const { data, error } = await supabase.storage.from(bucket).download(name);
	if (error || !data) {
		if (throwOnError) {
			throw new Error(`${bucket}/${name}: ${error?.message || 'download returned no data'}`);
		}
		return { buffer: null, error: error || new Error(`${bucket}/${name} returned no data`) };
	}
	const buffer = Buffer.from(await data.arrayBuffer());
	return throwOnError ? buffer : { buffer, error: null };
}

export async function updateRow(supabase, update, { mutateRow = false } = {}) {
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
	if (mutateRow) Object.assign(row, changes);
}

export async function rollbackUpdates(supabase, updates, { mutateRow = false } = {}) {
	for (const update of updates.slice().reverse()) {
		await updateRow(supabase, { ...update, changes: update.rollback }, { mutateRow });
	}
}
