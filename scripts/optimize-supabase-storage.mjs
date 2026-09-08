import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const MIN_BYTES = 256 * 1024;
const BUCKETS = ['storage', 'learn-media', 'ride-media', 'group-social-media', 'group-assets'];
const TABLES = [
	'groups',
	'profiles',
	'ride_details',
	'group_assets',
	'learn_assets',
	'media_assets',
	'group_social_posts',
	'group_social_content_library',
	'group_site_configs',
	'learn_articles',
	'learn_categories',
	'learn_subcategories'
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

function publicUrl(bucket, objectPath) {
	return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${objectPath
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/')}`;
}

function parseStorageUrl(value) {
	if (typeof value !== 'string' || !value.includes('/storage/v1/object/')) return null;
	try {
		const parsed = new URL(value);
		const marker = '/storage/v1/object/';
		const markerIndex = parsed.pathname.indexOf(marker);
		if (markerIndex === -1) return null;
		const parts = parsed.pathname.slice(markerIndex + marker.length).split('/');
		if (parts.length < 3 || parts[0] !== 'public') return null;
		return {
			bucket: decodeURIComponent(parts[1]),
			name: parts
				.slice(2)
				.map((part) => decodeURIComponent(part))
				.join('/')
		};
	} catch {
		return null;
	}
}

function replaceStorageValue(value, target, replacement) {
	if (typeof value === 'string') {
		const parsed = parseStorageUrl(value);
		if (parsed?.bucket === target.bucket && parsed.name === target.name) return replacement;
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((entry) => replaceStorageValue(entry, target, replacement));
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				replaceStorageValue(entry, target, replacement)
			])
		);
	}
	return value;
}

function valuesEqual(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function objectKey(bucket, name) {
	return `${bucket}:${name}`;
}

function mimeTypeFor(name, metadata = {}) {
	const metadataType = metadata.mimetype || metadata.contentType || '';
	if (metadataType) return metadataType;
	const extension = path.extname(name).toLowerCase();
	return (
		{
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.webp': 'image/webp',
			'.gif': 'image/gif',
			'.svg': 'image/svg+xml'
		}[extension] || ''
	);
}

async function listBucketObjects(bucket) {
	const objects = [];
	async function walk(prefix = '') {
		let offset = 0;
		while (true) {
			const { data, error } = await supabase.storage.from(bucket).list(prefix, {
				limit: 1000,
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
			if (data.length < 1000) break;
			offset += data.length;
		}
	}
	await walk();
	return objects;
}

async function fetchRows(table) {
	const { data, error } = await supabase.from(table).select('*').limit(10000);
	if (error) {
		if (error.code === '42P01' || error.code === 'PGRST205') return [];
		throw new Error(`${table}: ${error.message}`);
	}
	return data || [];
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

async function updateRow(table, row, changes) {
	if (!Object.keys(changes).length) return false;
	let query = supabase.from(table).update(changes);
	if (row.id != null) query = query.eq('id', row.id);
	else if (row.user_id != null) query = query.eq('user_id', row.user_id);
	else return false;
	const { error } = await query;
	if (error) throw new Error(`${table}/${row.id || row.user_id}: ${error.message}`);
	Object.assign(row, changes);
	return true;
}

async function main() {
	const rowsByTable = new Map();
	for (const table of TABLES) rowsByTable.set(table, await fetchRows(table));

	const objects = (await Promise.all(BUCKETS.map(listBucketObjects))).flat();
	const referenced = new Set();
	for (const rows of rowsByTable.values()) {
		for (const row of rows) {
			for (const value of Object.values(row)) {
				const stack = [value];
				while (stack.length) {
					const current = stack.pop();
					if (typeof current === 'string') {
						const parsed = parseStorageUrl(current);
						if (parsed) referenced.add(objectKey(parsed.bucket, parsed.name));
					} else if (Array.isArray(current)) stack.push(...current);
					else if (current && typeof current === 'object') stack.push(...Object.values(current));
				}
			}
		}
	}

	const eligibleObjects = objects.filter((object) => {
		if (!referenced.has(objectKey(object.bucket, object.name))) return false;
		if (object.name.startsWith('optimized/')) return false;
		const contentType = mimeTypeFor(object.name, object.metadata);
		const sizeBytes = Number(object.metadata?.size || object.metadata?.contentLength || 0);
		return contentType.startsWith('image/') && sizeBytes >= MIN_BYTES;
	});
	const candidates = await mapInBatches(eligibleObjects, 8, async (object) => {
		const contentType = mimeTypeFor(object.name, object.metadata);
		const { data, error } = await supabase.storage.from(object.bucket).download(object.name);
		if (error || !data) return null;
		const source = Buffer.from(await data.arrayBuffer());
		const optimized = await optimizeBuffer(source, contentType);
		if (!optimized) return null;
		return {
			...object,
			contentType,
			newContentType: 'image/webp',
			newName: `optimized/${object.name}.webp`,
			newHash: createHash('sha256').update(optimized).digest('hex'),
			oldBytes: source.byteLength,
			newBytes: optimized.byteLength,
			buffer: optimized
		};
	});

	const totalOld = candidates.reduce((sum, item) => sum + item.oldBytes, 0);
	const totalNew = candidates.reduce((sum, item) => sum + item.newBytes, 0);
	console.log(
		JSON.stringify(
			{
				mode: APPLY ? 'apply' : 'dry-run',
				objects_scanned: objects.length,
				referenced_objects: referenced.size,
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

	let applied = 0;
	let reclaimed = 0;
	for (const candidate of candidates) {
		const replacementUrl = publicUrl(candidate.bucket, candidate.newName);
		const { error: uploadError } = await supabase.storage
			.from(candidate.bucket)
			.upload(candidate.newName, candidate.buffer, {
				contentType: candidate.newContentType,
				upsert: false
			});
		if (uploadError && !/already exists/i.test(uploadError.message || '')) {
			throw new Error(`${candidate.bucket}/${candidate.name}: ${uploadError.message}`);
		}

		for (const [table, rows] of rowsByTable) {
			for (const row of rows) {
				const changes = {};
				for (const [column, value] of Object.entries(row)) {
					if (['id', 'created_at', 'updated_at'].includes(column)) continue;
					const replaced = replaceStorageValue(value, candidate, replacementUrl);
					if (!valuesEqual(value, replaced)) changes[column] = replaced;
				}
				for (const column of ['object_path']) {
					if (row[column] === candidate.name) changes[column] = candidate.newName;
				}
				if (row.bucket_id === candidate.bucket && row.object_path === candidate.name) {
					changes.mime_type = candidate.newContentType;
					changes.size_bytes = candidate.newBytes;
					if (table === 'media_assets') changes.content_hash = candidate.newHash;
				}
				await updateRow(table, row, changes);
			}
		}

		const { error: removeError } = await supabase.storage
			.from(candidate.bucket)
			.remove([candidate.name]);
		if (removeError)
			throw new Error(`${candidate.bucket}/${candidate.name}: ${removeError.message}`);
		applied += 1;
		reclaimed += candidate.oldBytes - candidate.newBytes;
	}

	console.log(JSON.stringify({ applied, reclaimed_bytes: reclaimed }));
}

main().catch((error) => {
	console.error(error?.stack || error?.message || error);
	process.exitCode = 1;
});
