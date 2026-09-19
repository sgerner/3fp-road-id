#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { prepareRemoteImage } from '../src/lib/server/remoteImages.js';

const BUCKET = 'storage';
const GROUP_PAGE_SIZE = 500;
const DEFAULT_CONCURRENCY = 6;
const IMAGE_FIELDS = ['logo_url', 'cover_photo_url'];

function loadLocalEnv() {
	const values = { ...process.env };
	try {
		for (const line of fs.readFileSync(path.resolve('.env'), 'utf8').split(/\r?\n/)) {
			const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
			if (!match || values[match[1]]) continue;
			values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
		}
	} catch {
		// The caller may provide both variables directly.
	}
	return values;
}

function parsePositiveInteger(value, fallback) {
	const parsed = Number.parseInt(String(value || ''), 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArguments(args) {
	const options = {
		apply: false,
		concurrency: DEFAULT_CONCURRENCY,
		limit: null,
		slug: null
	};
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--apply') {
			options.apply = true;
		} else if (argument === '--dry-run') {
			options.apply = false;
		} else if (argument === '--limit') {
			options.limit = parsePositiveInteger(args[++index], null);
		} else if (argument.startsWith('--limit=')) {
			options.limit = parsePositiveInteger(argument.slice('--limit='.length), null);
		} else if (argument === '--concurrency') {
			options.concurrency = Math.min(16, parsePositiveInteger(args[++index], DEFAULT_CONCURRENCY));
		} else if (argument.startsWith('--concurrency=')) {
			options.concurrency = Math.min(
				16,
				parsePositiveInteger(argument.slice('--concurrency='.length), DEFAULT_CONCURRENCY)
			);
		} else if (argument === '--slug') {
			options.slug = args[++index] || null;
		} else if (argument.startsWith('--slug=')) {
			options.slug = argument.slice('--slug='.length) || null;
		} else if (argument === '--help' || argument === '-h') {
			console.log(`Usage: node scripts/backfill-group-external-images.mjs [options]

Defaults to a read-only dry run. Use --apply to upload images and update groups.

Options:
  --apply                  Upload normalized images and rewrite group URLs.
  --dry-run                Explicitly select the default read-only mode.
  --limit N                Only inspect the first N groups.
  --slug SLUG              Only inspect one group slug.
  --concurrency N          Concurrent remote fetches (1-16, default ${DEFAULT_CONCURRENCY}).`);
			process.exit(0);
		}
	}
	return options;
}

function storageBucketFromUrl(value, supabaseOrigin) {
	try {
		const parsed = new URL(value);
		if (parsed.origin !== supabaseOrigin) return null;
		const marker = '/storage/v1/object/';
		const markerIndex = parsed.pathname.indexOf(marker);
		if (markerIndex < 0) return null;
		const segments = parsed.pathname.slice(markerIndex + marker.length).split('/');
		return segments.length >= 2 ? decodeURIComponent(segments[1]) : null;
	} catch {
		return null;
	}
}

function isLocalStorageUrl(value, supabaseOrigin) {
	return Boolean(storageBucketFromUrl(value, supabaseOrigin));
}

function isHttpUrl(value) {
	return /^https?:\/\//i.test(String(value || '').trim());
}

function sha256(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

function safeExtension(extension) {
	const normalized = String(extension || 'bin')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
	return normalized || 'bin';
}

function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

async function loadGroups(supabase, { slug, limit }) {
	if (slug) {
		const { data, error } = await supabase
			.from('groups')
			.select('id,slug,name,logo_url,cover_photo_url')
			.eq('slug', slug)
			.limit(1);
		if (error) throw error;
		return data || [];
	}

	const groups = [];
	for (let offset = 0; ; offset += GROUP_PAGE_SIZE) {
		const { data, error } = await supabase
			.from('groups')
			.select('id,slug,name,logo_url,cover_photo_url')
			.order('id')
			.range(offset, offset + GROUP_PAGE_SIZE - 1);
		if (error) throw error;
		groups.push(...(data || []));
		if (!data || data.length < GROUP_PAGE_SIZE || (limit && groups.length >= limit)) break;
	}
	return limit ? groups.slice(0, limit) : groups;
}

async function mapWithConcurrency(items, concurrency, worker, onProgress) {
	const results = new Array(items.length);
	let nextIndex = 0;
	let completed = 0;
	const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, items.length));

	async function consume() {
		while (true) {
			const index = nextIndex++;
			if (index >= items.length) return;
			results[index] = await worker(items[index], index);
			completed += 1;
			if (onProgress) onProgress(completed, items.length);
		}
	}

	await Promise.all(Array.from({ length: workerCount }, () => consume()));
	return results;
}

async function updateGroup(supabase, group, updates) {
	let query = supabase.from('groups').update(updates).eq('id', group.id);
	for (const field of Object.keys(updates)) {
		query = group[field] === null ? query.is(field, null) : query.eq(field, group[field]);
	}
	const { data, error } = await query.select('id');
	if (error) throw error;
	return Boolean(data?.length);
}

const options = parseArguments(process.argv.slice(2));
const env = loadLocalEnv();
const supabaseUrl = env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
	throw new Error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { autoRefreshToken: false, persistSession: false }
});
const supabaseOrigin = new URL(supabaseUrl).origin;
const groups = await loadGroups(supabase, options);
const sourceUsage = new Map();
let localFields = 0;
let emptyFields = 0;
let invalidFields = 0;

for (const group of groups) {
	for (const field of IMAGE_FIELDS) {
		const value = String(group[field] || '').trim();
		if (!value) {
			emptyFields += 1;
			continue;
		}
		if (isLocalStorageUrl(value, supabaseOrigin)) {
			localFields += 1;
			continue;
		}
		if (!isHttpUrl(value)) {
			invalidFields += 1;
			continue;
		}
		const usage = sourceUsage.get(value) || { fields: 0, groups: new Set() };
		usage.fields += 1;
		usage.groups.add(group.id);
		sourceUsage.set(value, usage);
	}
}

const sources = [...sourceUsage.keys()];
const objectByHash = new Map();
const uploadByHash = new Map();
const storage = supabase.storage.from(BUCKET);

function objectDetails(asset) {
	const hash = sha256(asset.buffer);
	const extension = safeExtension(asset.extension);
	const objectPath = `groups/external/${hash}.${extension}`;
	if (!objectByHash.has(hash)) {
		objectByHash.set(hash, {
			hash,
			objectPath,
			contentType: asset.contentType,
			bytes: asset.buffer.byteLength,
			originalBytes: asset.originalBytes,
			extension
		});
	}
	return objectByHash.get(hash);
}

async function ensureStorageObject(asset, details) {
	if (!options.apply) return storage.getPublicUrl(details.objectPath).data.publicUrl;
	if (!uploadByHash.has(details.hash)) {
		const upload = (async () => {
			const { error } = await storage.upload(details.objectPath, asset.buffer, {
				cacheControl: '31536000',
				contentType: asset.contentType,
				upsert: true
			});
			if (error) throw error;
			return storage.getPublicUrl(details.objectPath).data.publicUrl;
		})();
		uploadByHash.set(details.hash, upload);
	}
	return uploadByHash.get(details.hash);
}

console.error(
	`[group-image-backfill] ${options.apply ? 'apply' : 'dry-run'}: ${groups.length} groups, ${sources.length} unique remote sources`
);

const sourceResults = await mapWithConcurrency(
	sources,
	options.concurrency,
	async (source) => {
		try {
			const asset = await prepareRemoteImage(source);
			const details = objectDetails(asset);
			const publicUrl = await ensureStorageObject(asset, details);
			return {
				ok: true,
				publicUrl,
				objectPath: details.objectPath,
				hash: details.hash,
				contentType: asset.contentType,
				originalBytes: asset.originalBytes,
				storedBytes: asset.buffer.byteLength
			};
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	},
	(completed, total) => {
		if (completed === 1 || completed % 25 === 0 || completed === total) {
			console.error(`[group-image-backfill] fetched ${completed}/${total}`);
		}
	}
);

const resultBySource = new Map(sources.map((source, index) => [source, sourceResults[index]]));
const updates = [];
let candidateFields = 0;
let resolvedFields = 0;
for (const group of groups) {
	const patch = {};
	for (const field of IMAGE_FIELDS) {
		const value = String(group[field] || '').trim();
		if (!isHttpUrl(value) || isLocalStorageUrl(value, supabaseOrigin)) continue;
		candidateFields += 1;
		const result = resultBySource.get(value);
		if (result?.ok && result.publicUrl) {
			patch[field] = result.publicUrl;
			resolvedFields += 1;
		}
	}
	if (Object.keys(patch).length) updates.push({ group, patch });
}

let updatedGroups = 0;
let changedGroups = 0;
const updateErrors = [];
if (options.apply) {
	await mapWithConcurrency(
		updates,
		Math.min(options.concurrency, 8),
		async ({ group, patch }) => {
			try {
				if (await updateGroup(supabase, group, patch)) updatedGroups += 1;
				else changedGroups += 1;
			} catch (error) {
				updateErrors.push({
					slug: group.slug,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		},
		(completed, total) => {
			if (completed === 1 || completed % 25 === 0 || completed === total) {
				console.error(`[group-image-backfill] updated ${completed}/${total} groups`);
			}
		}
	);
}

const failedSources = sources
	.map((source, index) => ({ source, result: sourceResults[index] }))
	.filter(({ result }) => !result?.ok);
const estimatedStoredBytes = [...objectByHash.values()].reduce(
	(total, object) => total + object.bytes,
	0
);
const report = {
	mode: options.apply ? 'apply' : 'dry-run',
	groups: groups.length,
	remoteFields: candidateFields,
	localStorageFields: localFields,
	emptyFields,
	invalidFields,
	uniqueRemoteSources: sources.length,
	resolvedSources: sources.length - failedSources.length,
	failedSources: failedSources.length,
	resolvedFields,
	groupsNeedingUpdates: updates.length,
	uniqueStorageObjects: objectByHash.size,
	estimatedStoredBytes,
	estimatedStoredSize: formatBytes(estimatedStoredBytes),
	updatedGroups: options.apply ? updatedGroups : 0,
	changedGroups,
	updateErrors,
	failureSamples: failedSources.slice(0, 30).map(({ source, result }) => ({
		source,
		error: result?.error || 'Unknown failure'
	}))
};

console.log(JSON.stringify(report, null, 2));

if (options.apply && (failedSources.length || updateErrors.length)) process.exitCode = 1;
