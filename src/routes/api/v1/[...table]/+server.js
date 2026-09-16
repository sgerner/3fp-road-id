import { json } from '@sveltejs/kit';
import { createRequestSupabaseClient } from '$lib/server/supabaseClient';
import { resolveVerifiedSession } from '$lib/server/session';
import { ALLOWED_API_TABLES, TABLE_PRIMARY_KEYS } from '$lib/apiConfig';
import { readJsonBody } from '$lib/server/security';

const MAX_RESULT_ROWS = 500;
const MAX_OFFSET = 10_000;
const MAX_SELECT_LENGTH = 4_000;
const MAX_FILTER_LENGTH = 2_000;
const WRITE_PROTECTED_TABLES = new Set(['group_members']);
const INSERT_PROTECTED_TABLES = new Set(['group_members', 'groups']);

const FILTER_METHODS = {
	eq: 'eq',
	neq: 'neq',
	gt: 'gt',
	gte: 'gte',
	lt: 'lt',
	lte: 'lte',
	like: 'like',
	ilike: 'ilike',
	is: 'is',
	in: 'in',
	cs: 'contains',
	cd: 'containedBy',
	ov: 'overlaps'
};

function getErrorStatus(error, fallback = 400) {
	const parsedCode = Number.parseInt(error?.code, 10);
	return parsedCode >= 200 && parsedCode <= 599 ? parsedCode : fallback;
}

// Helper function to convert kebab-case to snake_case
function kebabToSnake(str) {
	return str.replace(/-/g, '_');
}

async function getSupabaseInstance(event) {
	const { accessToken, tokenPayload, verified } = await resolveVerifiedSession(event.cookies);
	let validToken = verified ? accessToken : null;

	if (accessToken && tokenPayload?.exp) {
		const now = Math.floor(Date.now() / 1000);
		// Add a 5-second buffer to prevent expiry in transit
		if (tokenPayload.exp <= now + 5) {
			validToken = null;
		}
	}

	const supabase = createRequestSupabaseClient(validToken);
	return { supabase };
}

export async function GET(event) {
	const { params, url } = event;
	const { supabase: sbInstance, error: authError } = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	const pathParts = params.table.split('/');
	const urlTableNameKebab = pathParts[0];
	const tableName = kebabToSnake(urlTableNameKebab); // Convert kebab-case from URL to snake_case for DB
	const recordId = pathParts[1];
	const selectColumns = url.searchParams.get('select') || '*';
	const countOption = url.searchParams.get('count');
	const singleParam = url.searchParams.get('single');

	if (!ALLOWED_API_TABLES.includes(tableName)) {
		return json(
			{ error: `Table '${tableName}' (from URL '${urlTableNameKebab}') not accessible.` },
			{ status: 403 }
		);
	}
	if (selectColumns.length > MAX_SELECT_LENGTH) {
		return json({ error: 'The select expression is too long.' }, { status: 400 });
	}

	let query = sbInstance
		.from(tableName)
		.select(selectColumns, countOption ? { count: countOption } : undefined);
	if (recordId) {
		const pkConfig = TABLE_PRIMARY_KEYS[tableName];
		const primaryKeyColumn = Array.isArray(pkConfig) ? pkConfig[0] : pkConfig || 'id';
		query = query.eq(primaryKeyColumn, recordId);

		if (singleParam === 'true') {
			query = query.single();
		} else {
			query = query.maybeSingle();
		}
	} else {
		for (const [key, value] of url.searchParams) {
			if (
				key === 'select' ||
				key === 'order' ||
				key === 'limit' ||
				key === 'offset' ||
				key === 'single' ||
				key === 'count'
			)
				continue;

			if (key === 'or') {
				let orValue = value;
				if (orValue.startsWith('(') && orValue.endsWith(')')) {
					orValue = orValue.substring(1, orValue.length - 1);
				}
				if (!orValue || orValue.length > MAX_FILTER_LENGTH) {
					return json({ error: 'Invalid filter.' }, { status: 400 });
				}
				query = query.or(orValue);
				continue;
			}

			// Assuming query param keys (column names) are still snake_case
			const columnName = key; // No conversion for query param keys in this option

			const dotIndex = value.indexOf('.');
			if (dotIndex > 0) {
				const operator = value.substring(0, dotIndex);
				const filterValue = value.substring(dotIndex + 1);
				if (value.length > MAX_FILTER_LENGTH) {
					return json({ error: 'Filter value is too long.' }, { status: 400 });
				}

				if (operator === 'in') {
					if (filterValue.startsWith('(') && filterValue.endsWith(')')) {
						const inValuesRaw = filterValue.substring(1, filterValue.length - 1);
						if (inValuesRaw) {
							const inValues = inValuesRaw.split(',').slice(0, 100);
							query = query.in(columnName, inValues);
						}
					}
				} else if (FILTER_METHODS[operator]) {
					query = query[FILTER_METHODS[operator]](columnName, filterValue);
				} else {
					query = query.eq(columnName, value);
				}
			} else {
				query = query.eq(columnName, value);
			}
		}

		const orderParams = url.searchParams.getAll('order');
		for (const clause of orderParams) {
			if (!clause) continue;
			if (clause.length > MAX_FILTER_LENGTH) {
				return json({ error: 'Invalid order expression.' }, { status: 400 });
			}
			const [column, ...modifiers] = clause.split('.');
			if (!column) continue;
			let ascending = true;
			let nullsFirst;
			let nullsLast;
			for (const modifier of modifiers) {
				if (modifier === 'desc') ascending = false;
				if (modifier === 'asc') ascending = true;
				if (modifier === 'nullsfirst') nullsFirst = true;
				if (modifier === 'nullslast') nullsLast = true;
			}
			query = query.order(column, {
				ascending,
				nullsFirst,
				nullsLast
			});
		}

		const limitParam = url.searchParams.get('limit');
		const offsetParam = url.searchParams.get('offset');
		const limitValue = limitParam ? Number.parseInt(limitParam, 10) : MAX_RESULT_ROWS;
		const offsetValue = offsetParam ? Number.parseInt(offsetParam, 10) : 0;
		if (
			!Number.isInteger(limitValue) ||
			!Number.isInteger(offsetValue) ||
			limitValue < 0 ||
			offsetValue < 0
		) {
			return json({ error: 'Invalid pagination.' }, { status: 400 });
		}
		const safeLimit = Math.min(limitValue, MAX_RESULT_ROWS);
		const safeOffset = Math.min(offsetValue, MAX_OFFSET);
		if (safeLimit > 0) {
			query = query.range(safeOffset, safeOffset + safeLimit - 1);
		} else {
			query = query.limit(0);
		}

		if (singleParam === 'true') {
			query = query.single();
		} else if (singleParam === 'maybe') {
			query = query.maybeSingle();
		}
	}

	const { data, error, count } = await query;

	if (error) {
		console.error('Supabase GET error:', error);
		let statusCode = 400;
		if (error.code === 'PGRST116') {
			statusCode = 404;
		}
		return json({ error: 'Unable to complete request.' }, { status: statusCode });
	}
	return json({ data, count });
}

export async function POST(event) {
	const { request, params } = event;
	const { supabase: sbInstance, error: authError } = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	const urlTableNameKebab = params.table.split('/')[0];
	const tableName = kebabToSnake(urlTableNameKebab); // Convert

	if (!ALLOWED_API_TABLES.includes(tableName)) {
		return json(
			{ error: `Table '${tableName}' (from URL '${urlTableNameKebab}') not accessible.` },
			{ status: 403 }
		);
	}
	if (INSERT_PROTECTED_TABLES.has(tableName)) {
		return json(
			{ error: 'This table must be changed through its dedicated workflow.' },
			{ status: 403 }
		);
	}

	try {
		const parsedBody = await readJsonBody(request, { maxBytes: 256 * 1024 });
		if (!parsedBody.ok) {
			return json({ error: parsedBody.error }, { status: parsedBody.status });
		}
		const body = parsedBody.value; // Expects snake_case keys in the body
		if (!body || (typeof body !== 'object' && !Array.isArray(body))) {
			return json({ error: 'JSON object or array is required.' }, { status: 400 });
		}
		const { data, error } = await sbInstance.from(tableName).insert(body).select();

		if (error) {
			console.error('Supabase POST error:', error);
			return json({ error: 'Unable to complete request.' }, { status: getErrorStatus(error) });
		}
		return json({ data: data?.[0] || data }, { status: 201 });
	} catch (e) {
		console.error('Unexpected Supabase POST error:', e);
		return json({ error: 'Unable to complete request.' }, { status: 400 });
	}
}

export async function PUT(event) {
	const { request, params } = event;
	const { supabase: sbInstance, error: authError } = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	const pathParts = params.table.split('/');
	const urlTableNameKebab = pathParts[0];
	const tableName = kebabToSnake(urlTableNameKebab); // Convert
	const recordId = pathParts[1];

	if (!ALLOWED_API_TABLES.includes(tableName)) {
		return json(
			{ error: `Table '${tableName}' (from URL '${urlTableNameKebab}') not accessible.` },
			{ status: 403 }
		);
	}
	if (WRITE_PROTECTED_TABLES.has(tableName)) {
		return json(
			{ error: 'This table must be changed through its dedicated workflow.' },
			{ status: 403 }
		);
	}

	if (!recordId) {
		return json(
			{ error: 'Record ID must be provided in the URL path for PUT operations.' },
			{ status: 400 }
		);
	}
	try {
		const parsedBody = await readJsonBody(request, { maxBytes: 256 * 1024 });
		if (!parsedBody.ok) {
			return json({ error: parsedBody.error }, { status: parsedBody.status });
		}
		const body = parsedBody.value; // Expects snake_case keys in the body
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return json({ error: 'JSON object is required.' }, { status: 400 });
		}
		const pkConfig = TABLE_PRIMARY_KEYS[tableName];
		const primaryKeyColumn = Array.isArray(pkConfig) ? pkConfig[0] : pkConfig || 'id';
		if (body[primaryKeyColumn]) {
			delete body[primaryKeyColumn];
		}

		const { data, error } = await sbInstance
			.from(tableName)
			.update(body)
			.eq(primaryKeyColumn, recordId)
			.select();

		if (error) {
			console.error('Supabase PUT error:', error);
			return json({ error: 'Unable to complete request.' }, { status: getErrorStatus(error) });
		}
		if (!data || data.length === 0) {
			return json({ error: 'Record not found or user lacks permission.' }, { status: 404 });
		}
		return json({ data: data[0] });
	} catch (e) {
		console.error('Unexpected Supabase PUT error:', e);
		return json({ error: 'Unable to complete request.' }, { status: 400 });
	}
}

export async function DELETE(event) {
	const { params, url } = event;
	const { supabase: sbInstance, error: authError } = await getSupabaseInstance(event);
	if (authError) return authError;
	if (!sbInstance) return json({ error: 'Supabase client not available' }, { status: 500 });

	const pathParts = params.table.split('/');
	const urlTableNameKebab = pathParts[0];
	const tableName = kebabToSnake(urlTableNameKebab); // Convert
	const recordId = pathParts[1];

	if (!ALLOWED_API_TABLES.includes(tableName)) {
		return json(
			{ error: `Table '${tableName}' (from URL '${urlTableNameKebab}') not accessible.` },
			{ status: 403 }
		);
	}
	if (WRITE_PROTECTED_TABLES.has(tableName)) {
		return json(
			{ error: 'This table must be changed through its dedicated workflow.' },
			{ status: 403 }
		);
	}

	let query = sbInstance.from(tableName).delete();

	if (recordId) {
		const pkConfig = TABLE_PRIMARY_KEYS[tableName];
		const primaryKeyColumn = Array.isArray(pkConfig) ? pkConfig[0] : pkConfig || 'id';
		query = query.eq(primaryKeyColumn, recordId);
	} else {
		const matchConditions = {};
		let conditionsFound = 0;
		for (const [key, value] of url.searchParams) {
			// Assuming query param keys (column names) are still snake_case
			const columnName = key;

			const parts = value.split('.');
			if (parts.length === 2 && parts[0] === 'eq') {
				matchConditions[columnName] = parts[1];
				conditionsFound++;
			} else if (parts.length === 1) {
				matchConditions[columnName] = value;
				conditionsFound++;
			}
		}
		if (conditionsFound > 0) {
			query = query.match(matchConditions);
		} else {
			return json(
				{
					error:
						'Record ID in path or match conditions in query parameters are required for DELETE.'
				},
				{ status: 400 }
			);
		}
	}

	const { data, error } = await query.select();

	if (error) {
		console.error('Supabase DELETE error:', error);
		return json({ error: 'Unable to complete request.' }, { status: getErrorStatus(error) });
	}
	return json(
		{ message: 'Delete successful or record not found/no permission.', deleted: data },
		{ status: 200 }
	);
}
