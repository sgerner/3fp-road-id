import sharp from 'sharp';
import {
	BUCKETS,
	TABLES,
	assertRowsUnchanged,
	collectReferenceState,
	createStorageScriptClient,
	downloadObject,
	fetchAllRows,
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
const MIN_BYTES = 256 * 1024;
const REFERENCE_STATE_OPTIONS = {
	includeProtected: true,
	includeRegistry: true,
	includeRowRegistry: true
};

const { supabase } = createStorageScriptClient({ envPath: '.env' });

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
	const { buffer, error } = await downloadObject(supabase, candidate.bucket, candidate.newName, {
		throwOnError: false
	});
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
	const { buffer, error } = await downloadObject(supabase, candidate.bucket, candidate.name, {
		throwOnError: false
	});
	if (error)
		throw new Error(`Source changed or disappeared: ${candidate.bucket}/${candidate.name}`);
	if (buffer.byteLength !== candidate.oldBytes || sha256(buffer) !== candidate.sourceHash) {
		throw new Error(
			`Source changed since the dry-run snapshot: ${candidate.bucket}/${candidate.name}`
		);
	}
}

function assertNoOldReferences(candidate, rowsByTable) {
	const state = collectReferenceState(rowsByTable, REFERENCE_STATE_OPTIONS);
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

async function applyCandidate(candidate, rowsByTable) {
	const updates = buildCandidateUpdates(candidate, rowsByTable);
	await verifySourceSnapshot(candidate);
	let createdTarget = false;
	let referencesVerified = false;
	const appliedUpdates = [];
	try {
		createdTarget = await ensureTargetObject(candidate);
		for (const update of updates) {
			await updateRow(supabase, update, { mutateRow: true });
			appliedUpdates.push(update);
		}

		const refreshedRows = await fetchAllRows(supabase);
		assertNoOldReferences(candidate, refreshedRows);
		referencesVerified = true;
		await removeObject(candidate.bucket, candidate.name);
		return refreshedRows;
	} catch (error) {
		// If the old object could not be removed, keeping verified new references
		// is safer than restoring references to an object that may be gone.
		if (!referencesVerified && appliedUpdates.length) {
			try {
				await rollbackUpdates(supabase, appliedUpdates, { mutateRow: true });
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
	let rowsByTable = await fetchAllRows(supabase);
	const initialSnapshot = snapshotRows(rowsByTable);
	const objects = (
		await Promise.all(BUCKETS.map((bucket) => listBucketObjects(supabase, bucket)))
	).flat();
	const referenceState = collectReferenceState(rowsByTable, REFERENCE_STATE_OPTIONS);

	const eligibleObjects = objects.filter((object) => {
		const key = objectKey(object.bucket, object.name);
		if (!referenceState.references.has(key)) return false;
		if (referenceState.protectedReferences?.has(key)) return false;
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

	const candidates = await mapInBatches(
		eligibleObjects,
		8,
		async (object) => {
			const contentType = mimeTypeFor(object.name, object.metadata);
			const { buffer: source, error } = await downloadObject(supabase, object.bucket, object.name, {
				throwOnError: false
			});
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
		},
		{ filterTruthy: true }
	);

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
				protected_references: referenceState.protectedReferences?.size ?? 0,
				registry_references: referenceState.registryReferences?.size ?? 0,
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
	const beforeApplyRows = await fetchAllRows(supabase);
	assertRowsUnchanged(initialSnapshot, beforeApplyRows, 'preflight', {
		abortSuffix: 'aborting before Storage mutation.'
	});
	rowsByTable = beforeApplyRows;
	let expectedSnapshot = snapshotRows(rowsByTable);

	let applied = 0;
	let reclaimed = 0;
	for (const candidate of candidates) {
		const latestRows = await fetchAllRows(supabase);
		assertRowsUnchanged(expectedSnapshot, latestRows, 'candidate apply', {
			abortSuffix: 'aborting before Storage mutation.'
		});
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
