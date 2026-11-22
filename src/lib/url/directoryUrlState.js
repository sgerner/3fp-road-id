const VALID_DIRECTORY_VIEWS = new Set(['list', 'calendar', 'map']);
const TRUTHY_PARAM_VALUES = new Set(['1', 'true', 'yes', 'on']);

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function coerceTruthyParam(value) {
	if (typeof value === 'boolean') return value;
	const normalized = safeTrim(value).toLowerCase();
	return TRUTHY_PARAM_VALUES.has(normalized);
}

export function parsePositiveIntParam(value, fallback = 1) {
	const parsed = Number.parseInt(safeTrim(value), 10);
	return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

export function formatMonthParam(date) {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function parseMonthParam(value) {
	const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(safeTrim(value));
	if (!match) return null;
	const year = Number(match[1]);
	const monthIndex = Number(match[2]) - 1;
	const date = new Date(year, monthIndex, 1);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeDirectoryView(value, fallback = 'list') {
	const normalized = safeTrim(value).toLowerCase();
	return VALID_DIRECTORY_VIEWS.has(normalized) ? normalized : fallback;
}

/**
 * @typedef {{ get(name: string): string | null } | URLSearchParams | URL | string | null | undefined} SearchParamsInput
 */

/**
 * @param {SearchParamsInput} input
 * @returns {{ get(name: string): string | null }}
 */
function asSearchParams(input) {
	if (input instanceof URLSearchParams) return input;
	if (input instanceof URL) return input.searchParams;
	if (input && typeof input === 'object' && typeof input.get === 'function') return input;
	return new URLSearchParams(typeof input === 'string' ? input : '');
}

/**
 * @param {URL | string} urlInput
 */
function cloneUrl(urlInput) {
	return urlInput instanceof URL ? new URL(urlInput.toString()) : new URL(String(urlInput));
}

/**
 * @param {SearchParamsInput} searchParamsInput
 */
export function hasServerRideFilterParams(searchParamsInput) {
	const sp = asSearchParams(searchParamsInput);
	const q = safeTrim(sp.get('q') ?? sp.get('search'));
	const difficulty = safeTrim(sp.get('difficulty'));
	const needsHost = coerceTruthyParam(sp.get('needsHost') ?? sp.get('needs_host'));
	const hostGroupId = safeTrim(sp.get('host_group_id') ?? sp.get('hostGroupId'));
	return Boolean(
		q || (difficulty && difficulty.toLowerCase() !== 'all') || needsHost || hostGroupId
	);
}

/**
 * @param {SearchParamsInput} searchParamsInput
 */
export function buildRideApiSearchParams(searchParamsInput) {
	const sp = asSearchParams(searchParamsInput);
	const out = new URLSearchParams();
	const q = safeTrim(sp.get('search') ?? sp.get('q'));
	const difficulty = safeTrim(sp.get('difficulty'));
	const needsHost = coerceTruthyParam(sp.get('needs_host') ?? sp.get('needsHost'));
	const hostGroupId = safeTrim(sp.get('host_group_id') ?? sp.get('hostGroupId'));

	if (q) out.set('search', q);
	if (difficulty && difficulty.toLowerCase() !== 'all') out.set('difficulty', difficulty);
	if (needsHost) out.set('needs_host', '1');
	if (hostGroupId) out.set('host_group_id', hostGroupId);
	return out;
}

/**
 * @param {SearchParamsInput} searchParamsInput
 * @param {{ difficultyOptions?: string[] }} [options]
 */
export function parseRideUrlState(searchParamsInput, { difficultyOptions = [] } = {}) {
	const sp = asSearchParams(searchParamsInput);
	const q = sp.get('q') ?? sp.get('search') ?? '';
	const rawDifficulty = safeTrim(sp.get('difficulty'));
	let difficulty = 'all';
	if (rawDifficulty && rawDifficulty.toLowerCase() !== 'all') {
		const matched = difficultyOptions.find(
			(option) => safeTrim(option).toLowerCase() === rawDifficulty.toLowerCase()
		);
		difficulty = matched ?? rawDifficulty;
	}

	const needsHost = coerceTruthyParam(sp.get('needsHost') ?? sp.get('needs_host'));
	const view = normalizeDirectoryView(sp.get('view'), 'list');
	const page = parsePositiveIntParam(sp.get('page'), 1);
	const monthDate = parseMonthParam(sp.get('month'));

	return {
		q,
		difficulty,
		needsHost,
		view,
		page,
		monthDate,
		month: monthDate ? formatMonthParam(monthDate) : ''
	};
}

/**
 * @param {URL | string} urlInput
 * @param {{
 *   q?: string;
 *   difficulty?: string;
 *   needsHost?: boolean;
 *   view?: string;
 *   page?: number;
 *   monthDate?: Date | null;
 *   defaultMonthDate?: Date | null;
 *   monthTouched?: boolean;
 * }} [options]
 */
export function applyRideUrlState(
	urlInput,
	{
		q = '',
		difficulty = 'all',
		needsHost = false,
		view = 'list',
		page = 1,
		monthDate = null,
		defaultMonthDate = null,
		monthTouched = false
	} = {}
) {
	const url = cloneUrl(urlInput);
	const sp = url.searchParams;

	sp.delete('search');
	sp.delete('needs_host');

	const trimmedQ = safeTrim(q);
	if (trimmedQ) sp.set('q', trimmedQ);
	else sp.delete('q');

	const trimmedDifficulty = safeTrim(difficulty);
	if (trimmedDifficulty && trimmedDifficulty.toLowerCase() !== 'all') {
		sp.set('difficulty', trimmedDifficulty);
	} else {
		sp.delete('difficulty');
	}

	if (needsHost) sp.set('needsHost', '1');
	else sp.delete('needsHost');

	const normalizedView = normalizeDirectoryView(view, 'list');
	if (normalizedView !== 'list') sp.set('view', normalizedView);
	else sp.delete('view');

	const normalizedPage = parsePositiveIntParam(page, 1);
	if (normalizedPage > 1) sp.set('page', String(normalizedPage));
	else sp.delete('page');

	const monthKey = formatMonthParam(monthDate);
	const defaultMonthKey = formatMonthParam(defaultMonthDate);
	if (monthKey && monthTouched && monthKey !== defaultMonthKey) {
		sp.set('month', monthKey);
	} else {
		sp.delete('month');
	}

	return url;
}

/**
 * @param {SearchParamsInput} searchParamsInput
 */
export function parseVolunteerUrlState(searchParamsInput) {
	const sp = asSearchParams(searchParamsInput);
	const search = sp.get('search') ?? sp.get('q') ?? '';
	const location = sp.get('location') ?? '';
	const hostGroupId = safeTrim(sp.get('hostGroupId'));
	const eventType = safeTrim(sp.get('eventType'));
	const view = normalizeDirectoryView(sp.get('view'), 'list');
	const monthDate = parseMonthParam(sp.get('month'));

	return {
		search,
		location,
		hostGroupId,
		eventType,
		view,
		monthDate,
		month: monthDate ? formatMonthParam(monthDate) : ''
	};
}

/**
 * @param {URL | string} urlInput
 * @param {{
 *   search?: string;
 *   location?: string;
 *   hostGroupId?: string;
 *   eventType?: string;
 *   view?: string;
 *   monthDate?: Date | null;
 *   defaultMonthDate?: Date | null;
 *   monthTouched?: boolean;
 * }} [options]
 */
export function applyVolunteerUrlState(
	urlInput,
	{
		search = '',
		location = '',
		hostGroupId = '',
		eventType = '',
		view = 'list',
		monthDate = null,
		defaultMonthDate = null,
		monthTouched = false
	} = {}
) {
	const url = cloneUrl(urlInput);
	const sp = url.searchParams;

	sp.delete('q');

	const trimmedSearch = safeTrim(search);
	if (trimmedSearch) sp.set('search', trimmedSearch);
	else sp.delete('search');

	const trimmedLocation = safeTrim(location);
	if (trimmedLocation) sp.set('location', trimmedLocation);
	else sp.delete('location');

	const trimmedHostGroupId = safeTrim(hostGroupId);
	if (trimmedHostGroupId) sp.set('hostGroupId', trimmedHostGroupId);
	else sp.delete('hostGroupId');

	const trimmedEventType = safeTrim(eventType);
	if (trimmedEventType) sp.set('eventType', trimmedEventType);
	else sp.delete('eventType');

	const normalizedView = normalizeDirectoryView(view, 'list');
	if (normalizedView !== 'list') sp.set('view', normalizedView);
	else sp.delete('view');

	const monthKey = formatMonthParam(monthDate);
	const defaultMonthKey = formatMonthParam(defaultMonthDate);
	if (monthKey && monthTouched && monthKey !== defaultMonthKey) {
		sp.set('month', monthKey);
	} else {
		sp.delete('month');
	}

	return url;
}

/**
 * @param {SearchParamsInput} searchParamsInput
 * @param {{
 *   pageSize?: number;
 *   categoryPairs?: Array<[string, string]>;
 *   categories?: string[];
 * }} [options]
 */
export function parseLearnUrlState(
	searchParamsInput,
	{ pageSize = 12, categoryPairs = [], categories = [] } = {}
) {
	const sp = asSearchParams(searchParamsInput);
	const search = sp.get('q') ?? sp.get('search') ?? '';
	const rawCategory = safeTrim(sp.get('category'));
	let category = 'all';
	if (rawCategory && rawCategory.toLowerCase() !== 'all') {
		const lower = rawCategory.toLowerCase();
		const fromPair = categoryPairs.find(
			([catName, catSlug]) =>
				safeTrim(catName).toLowerCase() === lower || safeTrim(catSlug).toLowerCase() === lower
		);
		const fromList = categories.find((catName) => safeTrim(catName).toLowerCase() === lower);
		category = fromPair?.[0] ?? fromList ?? rawCategory;
	}

	const rawVisible = parsePositiveIntParam(sp.get('visible') ?? sp.get('count'), 0);
	const page = parsePositiveIntParam(sp.get('page'), 1);
	const visibleCount =
		rawVisible > pageSize ? Math.ceil(rawVisible / pageSize) * pageSize : page * pageSize;

	return {
		search,
		category,
		page: Math.max(1, Math.ceil(visibleCount / pageSize)),
		visibleCount
	};
}

/**
 * @param {URL | string} urlInput
 * @param {{
 *   search?: string;
 *   category?: string;
 *   visibleCount?: number;
 *   pageSize?: number;
 * }} [options]
 */
export function applyLearnUrlState(
	urlInput,
	{ search = '', category = 'all', visibleCount = 12, pageSize = 12 } = {}
) {
	const url = cloneUrl(urlInput);
	const sp = url.searchParams;

	sp.delete('search');
	sp.delete('visible');
	sp.delete('count');

	const trimmedSearch = safeTrim(search);
	if (trimmedSearch) sp.set('q', trimmedSearch);
	else sp.delete('q');

	const trimmedCategory = safeTrim(category);
	if (trimmedCategory && trimmedCategory.toLowerCase() !== 'all') {
		sp.set('category', trimmedCategory);
	} else {
		sp.delete('category');
	}

	const safePageSize = Math.max(1, pageSize);
	const page = Math.max(1, Math.ceil(Math.max(safePageSize, visibleCount) / safePageSize));
	if (page > 1) sp.set('page', String(page));
	else sp.delete('page');

	return url;
}
