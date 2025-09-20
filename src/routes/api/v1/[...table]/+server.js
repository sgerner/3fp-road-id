import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient'; // Your Supabase client
import { ALLOWED_API_TABLES, TABLE_PRIMARY_KEYS } from '$lib/apiConfig';

// Helper function to convert kebab-case to snake_case
function kebabToSnake(str) {
	return str.replace(/-/g, '_');
}

async function getSupabaseInstance(event) {
	// If using SvelteKit Supabase Auth Helpers, you'd get the session-specific client
	// const { supabase, session } = await event.locals.safeGetSession()
	// if (!session) return { supabase: null, error: json({ error: 'Unauthorized' }, { status: 401 })};
	// return { supabase };

	// Using the global client from $lib/supabaseClient as per your example
	// Ensure RLS is fully utilized for security.
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

	let query = sbInstance
		.from(tableName)
		.select(selectColumns, countOption ? { count: countOption } : undefined);
	if (recordId) {
		const primaryKeyColumn =
			TABLE_PRIMARY_KEYS[tableName]?.[0] || TABLE_PRIMARY_KEYS[tableName] || 'id';
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

			// Assuming query param keys (column names) are still snake_case
			const columnName = key; // No conversion for query param keys in this option

			const parts = value.split('.');
			if (parts.length === 2) {
				const [operator, filterValue] = parts;
				if (operator === 'in') {
					if (filterValue.startsWith('(') && filterValue.endsWith(')')) {
						const inValuesRaw = filterValue.substring(1, filterValue.length - 1);
						if (inValuesRaw) {
							const inValues = inValuesRaw.split(',');
							query = query.in(columnName, inValues);
						}
					}
				} else if (typeof query[operator] === 'function') {
					query = query[operator](columnName, filterValue);
				} else {
					console.warn(`Unsupported operator or format: ${operator} for key ${columnName}`);
					query = query.eq(columnName, value);
				}
			} else {
				query = query.eq(columnName, value);
			}
		}

		const orderParams = url.searchParams.getAll('order');
		for (const clause of orderParams) {
			if (!clause) continue;
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
		const limitValue = limitParam ? parseInt(limitParam, 10) : undefined;
		const offsetValue = offsetParam ? parseInt(offsetParam, 10) : undefined;
		if (typeof limitValue === 'number' && !Number.isNaN(limitValue)) {
			const safeLimit = Math.max(limitValue, 0);
			const safeOffset =
				typeof offsetValue === 'number' && !Number.isNaN(offsetValue)
					? Math.max(offsetValue, 0)
					: 0;
			if (safeLimit > 0) {
				query = query.range(safeOffset, safeOffset + safeLimit - 1);
			}
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
		if (error.code) {
			const parsedCode = parseInt(error.code, 10);
			if (parsedCode >= 200 && parsedCode <= 599) {
				statusCode = parsedCode;
			}
		}
		return json({ error: error.message }, { status: statusCode });
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

	// ... (rest of POST method body processing logic remains the same, assumes body keys are snake_case)
	try {
		const body = await request.json(); // Expects snake_case keys in the body
		const { data, error } = await sbInstance.from(tableName).insert(body).select();

		if (error) {
			console.error('Supabase POST error:', error);
			let statusCode = 400;
			if (error.code) {
				const parsedCode = parseInt(error.code, 10);
				if (parsedCode >= 200 && parsedCode <= 599) {
					statusCode = parsedCode;
				}
			}
			return json({ error: error.message }, { status: statusCode });
		}
		return json({ data: data?.[0] || data }, { status: 201 });
	} catch (e) {
		return json(
			{ error: 'Invalid JSON body or server error.', details: e.message },
			{ status: 400 }
		);
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

	if (!recordId) {
		return json(
			{ error: 'Record ID must be provided in the URL path for PUT operations.' },
			{ status: 400 }
		);
	}
	// ... (rest of PUT method body processing logic remains the same, assumes body keys are snake_case)
	try {
		const body = await request.json(); // Expects snake_case keys in the body
		const primaryKeyColumn =
			TABLE_PRIMARY_KEYS[tableName]?.[0] || TABLE_PRIMARY_KEYS[tableName] || 'id';
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
			let statusCode = 400;
			if (error.code) {
				const parsedCode = parseInt(error.code, 10);
				if (parsedCode >= 200 && parsedCode <= 599) {
					statusCode = parsedCode;
				}
			}
			return json({ error: error.message }, { status: statusCode });
		}
		if (!data || data.length === 0) {
			return json({ error: 'Record not found or user lacks permission.' }, { status: 404 });
		}
		return json({ data: data[0] });
	} catch (e) {
		return json(
			{ error: 'Invalid JSON body or server error.', details: e.message },
			{ status: 400 }
		);
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

	let query = sbInstance.from(tableName).delete();

	if (recordId) {
		const primaryKeyColumn =
			TABLE_PRIMARY_KEYS[tableName]?.[0] || TABLE_PRIMARY_KEYS[tableName] || 'id';
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
		let statusCode = 400;
		if (error.code) {
			const parsedCode = parseInt(error.code, 10);
			if (parsedCode >= 200 && parsedCode <= 599) {
				statusCode = parsedCode;
			}
		}
		return json({ error: error.message }, { status: statusCode });
	}
	return json(
		{ message: 'Delete successful or record not found/no permission.', deleted: data },
		{ status: 200 }
	);
}
