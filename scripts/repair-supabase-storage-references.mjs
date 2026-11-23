import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
	findStorageReferences,
	getRowKey,
	listBucketObjects,
	mapInBatches,
	mimeTypeFor,
	objectKey,
	replaceStorageValue,
	rollbackUpdates,
	sha256,
	snapshotRows,
	updateRow,
	valuesEqual
} from './lib/supabase-storage-maintenance.mjs';

const APPLY = process.argv.includes('--apply');
const REMOVE_STALE_LINKS = process.argv.includes('--remove-stale-links');
const REFERENCE_STATE_OPTIONS = {
	includeProtected: false,
	includeRegistry: false,
	includeRowRegistry: false
};
const MIME_TYPE_OPTIONS = {
	includePdf: true,
	fallback: 'application/octet-stream'
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const learnAssetRoot = path.resolve(repositoryRoot, 'docs/3ftwiki');

const { supabase, supabaseUrl } = createStorageScriptClient({
	envPath: path.join(repositoryRoot, '.env')
});

function publicUrl(bucket, name) {
	return `${supabaseUrl.replace(/\/$/, '')}${STORAGE_MARKER}public/${bucket}/${encodeObjectPath(name)}`;
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

async function fetchAllObjects() {
	return (await Promise.all(BUCKETS.map((bucket) => listBucketObjects(supabase, bucket)))).flat();
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

function buildRepairPlans(rowsByTable, objects) {
	const state = collectReferenceState(rowsByTable, REFERENCE_STATE_OPTIONS);
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
				newContentType: mimeTypeFor(optimizedName, optimized.metadata, MIME_TYPE_OPTIONS),
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
				newContentType: mimeTypeFor(name, {}, MIME_TYPE_OPTIONS),
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
	await mapInBatches(
		uniqueTargets,
		8,
		async (plan) => {
			const buffer = await downloadObject(supabase, plan.bucket, plan.newName, {
				throwOnError: true
			});
			if (!buffer.byteLength) throw new Error(`Target is empty: ${plan.bucket}/${plan.newName}`);
			const hash = sha256(buffer);
			snapshots.set(objectKey(plan.bucket, plan.newName), { bytes: buffer.byteLength, hash });
			plan.newBytes = buffer.byteLength;
			plan.newHash = hash;
		},
		{ filterTruthy: false }
	);
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
		const uploaded = await downloadObject(supabase, plan.bucket, plan.newName, {
			throwOnError: true
		});
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
	await mapInBatches(
		replacePlans,
		8,
		async (plan) => {
			const buffer = await downloadObject(supabase, plan.bucket, plan.newName, {
				throwOnError: true
			});
			const expected = snapshots.get(objectKey(plan.bucket, plan.newName));
			if (!expected || buffer.byteLength !== expected.bytes || sha256(buffer) !== expected.hash) {
				throw new Error(`Optimized target changed since planning: ${plan.bucket}/${plan.newName}`);
			}
		},
		{ filterTruthy: false }
	);
}

async function main() {
	const rowsByTable = await fetchAllRows(supabase);
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

	const freshRows = await fetchAllRows(supabase);
	assertRowsUnchanged(initialSnapshot, freshRows, 'preflight', { abortSuffix: 'aborting.' });
	await assertTargetSnapshots(plans, targetSnapshots);

	const uploaded = [];
	const applied = [];
	try {
		uploaded.push(...(await uploadSources(plans)));
		const rowsAfterUpload = await fetchAllRows(supabase);
		assertRowsUnchanged(initialSnapshot, rowsAfterUpload, 'source upload preflight', {
			abortSuffix: 'aborting.'
		});
		for (const update of updates) {
			await updateRow(supabase, update, { mutateRow: false });
			applied.push(update);
		}

		const finalRows = await fetchAllRows(supabase);
		const finalObjects = await fetchAllObjects();
		const finalState = collectReferenceState(finalRows, REFERENCE_STATE_OPTIONS);
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
				await rollbackUpdates(supabase, applied, { mutateRow: false });
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
