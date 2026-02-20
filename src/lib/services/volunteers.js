import { browser } from '$app/environment';
import { supabase } from '$lib/supabaseClient';

const VOLUNTEER_TABLES = {
	events: 'volunteer_events',
	opportunities: 'volunteer_opportunities',
	shifts: 'volunteer_opportunity_shifts',
	signups: 'volunteer_signups',
	signupShifts: 'volunteer_signup_shifts',
	customQuestions: 'volunteer_custom_questions',
	signupResponses: 'volunteer_signup_responses',
	eventEmails: 'volunteer_event_emails'
};

function tableToSegment(table) {
	return table.replace(/_/g, '-');
}

function buildQueryString(query) {
	if (!query) return '';
	if (typeof query === 'string') return query;
	if (query instanceof URLSearchParams) return query.toString();

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === null || value === undefined) continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item === null || item === undefined) continue;
				params.append(key, String(item));
			}
			continue;
		}
		if (typeof value === 'object') {
			params.set(key, JSON.stringify(value));
			continue;
		}
		params.set(key, String(value));
	}
	return params.toString();
}

const SESSION_COOKIE = 'sb_session';
const SESSION_MAX_AGE = 60 * 24 * 60 * 60;
let refreshPromise = null;

function persistSession(session) {
	if (!browser) return;
	try {
		if (session) {
			const payload = JSON.stringify(session);
			document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(payload)}; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`;
		} else {
			document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
		}
	} catch {
		// ignore cookie errors in non-browser environments
	}
}

async function refreshSessionIfNeeded() {
	if (!browser || typeof supabase?.auth?.refreshSession !== 'function') return null;
	if (!refreshPromise) {
		refreshPromise = (async () => {
			try {
				const { data, error } = await supabase.auth.refreshSession();
				if (error) {
					console.warn('Unable to refresh Supabase session', error);
					return null;
				}
				const session = data?.session ?? null;
				persistSession(session);
				return session;
			} catch (error) {
				console.warn('Unexpected error refreshing Supabase session', error);
				return null;
			} finally {
				refreshPromise = null;
			}
		})();
	}
	return refreshPromise;
}

function isExpiredTokenError(message) {
	if (!message || typeof message !== 'string') return false;
	return message.toLowerCase().includes('jwt expired');
}

async function callVolunteerApi(
	{ fetch: fetchImpl = globalThis.fetch, table, method = 'GET', id, query, body, headers = {} },
	attempt = 0
) {
	if (!table) throw new Error('Table name is required for volunteer API requests.');
	if (typeof fetchImpl !== 'function') {
		throw new Error('A fetch implementation must be provided to call the volunteer API.');
	}

	const tableSegment = tableToSegment(table);
	const queryString = buildQueryString(query);
	const url = `/api/v1/${tableSegment}${id ? `/${id}` : ''}${queryString ? `?${queryString}` : ''}`;

	const requestInit = {
		method,
		headers: { ...headers }
	};

	if (body !== undefined) {
		requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
		if (!requestInit.headers['Content-Type']) {
			requestInit.headers['Content-Type'] = 'application/json';
		}
	}

	const response = await fetchImpl(url, requestInit);
	let payload;
	const raw = await response.text();
	if (raw) {
		try {
			payload = JSON.parse(raw);
		} catch (err) {
			payload = raw;
		}
	}

	if (!response.ok) {
		const message = payload?.error || response.statusText || 'Volunteer API request failed';

		if (attempt === 0 && isExpiredTokenError(message)) {
			const session = await refreshSessionIfNeeded();
			if (session) {
				return callVolunteerApi(
					{ fetch: fetchImpl, table, method, id, query, body, headers },
					attempt + 1
				);
			}
		}

		const error = new Error(
			isExpiredTokenError(message) ? 'Your session has expired. Please log in again.' : message
		);
		error.status = response.status;
		error.payload = payload;
		throw error;
	}

	return payload ?? null;
}

function createTableService(table) {
	return {
		list: (options = {}) => callVolunteerApi({ ...options, table }),
		get: (id, options = {}) => callVolunteerApi({ ...options, table, id }),
		create: (body, options = {}) => callVolunteerApi({ ...options, table, method: 'POST', body }),
		update: (id, body, options = {}) =>
			callVolunteerApi({ ...options, table, method: 'PUT', id, body }),
		remove: (id, options = {}) => callVolunteerApi({ ...options, table, method: 'DELETE', id })
	};
}

const volunteerEventsApi = createTableService(VOLUNTEER_TABLES.events);
const volunteerOpportunitiesApi = createTableService(VOLUNTEER_TABLES.opportunities);
const volunteerShiftsApi = createTableService(VOLUNTEER_TABLES.shifts);
const volunteerSignupsApi = createTableService(VOLUNTEER_TABLES.signups);
const volunteerSignupShiftsApi = createTableService(VOLUNTEER_TABLES.signupShifts);
const volunteerCustomQuestionsApi = createTableService(VOLUNTEER_TABLES.customQuestions);
const volunteerSignupResponsesApi = createTableService(VOLUNTEER_TABLES.signupResponses);
const volunteerEventEmailsApi = createTableService(VOLUNTEER_TABLES.eventEmails);

export {
	VOLUNTEER_TABLES,
	callVolunteerApi,
	volunteerEventsApi,
	volunteerOpportunitiesApi,
	volunteerShiftsApi,
	volunteerSignupsApi,
	volunteerSignupShiftsApi,
	volunteerCustomQuestionsApi,
	volunteerSignupResponsesApi,
	volunteerEventEmailsApi
};

export const listVolunteerEvents = (options) => volunteerEventsApi.list(options);
export const getVolunteerEvent = (id, options) => volunteerEventsApi.get(id, options);
export const createVolunteerEvent = (body, options) => volunteerEventsApi.create(body, options);
export const updateVolunteerEvent = (id, body, options) =>
	volunteerEventsApi.update(id, body, options);
export const deleteVolunteerEvent = (id, options) => volunteerEventsApi.remove(id, options);

export const listVolunteerOpportunities = (options) => volunteerOpportunitiesApi.list(options);
export const getVolunteerOpportunity = (id, options) => volunteerOpportunitiesApi.get(id, options);
export const createVolunteerOpportunity = (body, options) =>
	volunteerOpportunitiesApi.create(body, options);
export const updateVolunteerOpportunity = (id, body, options) =>
	volunteerOpportunitiesApi.update(id, body, options);
export const deleteVolunteerOpportunity = (id, options) =>
	volunteerOpportunitiesApi.remove(id, options);

export const listVolunteerShifts = (options) => volunteerShiftsApi.list(options);
export const getVolunteerShift = (id, options) => volunteerShiftsApi.get(id, options);
export const createVolunteerShift = (body, options) => volunteerShiftsApi.create(body, options);
export const updateVolunteerShift = (id, body, options) =>
	volunteerShiftsApi.update(id, body, options);
export const deleteVolunteerShift = (id, options) => volunteerShiftsApi.remove(id, options);

export const listVolunteerSignups = (options) => volunteerSignupsApi.list(options);
export const getVolunteerSignup = (id, options) => volunteerSignupsApi.get(id, options);
export const createVolunteerSignup = (body, options) => volunteerSignupsApi.create(body, options);
export const updateVolunteerSignup = (id, body, options) =>
	volunteerSignupsApi.update(id, body, options);
export const deleteVolunteerSignup = (id, options) => volunteerSignupsApi.remove(id, options);

export const listVolunteerSignupShifts = (options) => volunteerSignupShiftsApi.list(options);
export const getVolunteerSignupShift = (id, options) => volunteerSignupShiftsApi.get(id, options);
export const createVolunteerSignupShift = (body, options) =>
	volunteerSignupShiftsApi.create(body, options);
export const updateVolunteerSignupShift = (id, body, options) =>
	volunteerSignupShiftsApi.update(id, body, options);
export const deleteVolunteerSignupShift = (id, options) =>
	volunteerSignupShiftsApi.remove(id, options);

export const listVolunteerCustomQuestions = (options) => volunteerCustomQuestionsApi.list(options);
export const getVolunteerCustomQuestion = (id, options) =>
	volunteerCustomQuestionsApi.get(id, options);
export const createVolunteerCustomQuestion = (body, options) =>
	volunteerCustomQuestionsApi.create(body, options);
export const updateVolunteerCustomQuestion = (id, body, options) =>
	volunteerCustomQuestionsApi.update(id, body, options);
export const deleteVolunteerCustomQuestion = (id, options) =>
	volunteerCustomQuestionsApi.remove(id, options);

export const listVolunteerSignupResponses = (options) => volunteerSignupResponsesApi.list(options);
export const getVolunteerSignupResponse = (id, options) =>
	volunteerSignupResponsesApi.get(id, options);
export const createVolunteerSignupResponse = (body, options) =>
	volunteerSignupResponsesApi.create(body, options);
export const updateVolunteerSignupResponse = (id, body, options) =>
	volunteerSignupResponsesApi.update(id, body, options);
export const deleteVolunteerSignupResponse = (id, options) =>
	volunteerSignupResponsesApi.remove(id, options);

export const listVolunteerEventEmails = (options) => volunteerEventEmailsApi.list(options);
export const getVolunteerEventEmail = (id, options) => volunteerEventEmailsApi.get(id, options);
export const createVolunteerEventEmail = (body, options) =>
	volunteerEventEmailsApi.create(body, options);
export const updateVolunteerEventEmail = (id, body, options) =>
	volunteerEventEmailsApi.update(id, body, options);
export const deleteVolunteerEventEmail = (id, options) =>
	volunteerEventEmailsApi.remove(id, options);

export const volunteerApi = {
	tables: VOLUNTEER_TABLES,
	events: volunteerEventsApi,
	opportunities: volunteerOpportunitiesApi,
	shifts: volunteerShiftsApi,
	signups: volunteerSignupsApi,
	signupShifts: volunteerSignupShiftsApi,
	customQuestions: volunteerCustomQuestionsApi,
	signupResponses: volunteerSignupResponsesApi,
	eventEmails: volunteerEventEmailsApi,
	call: callVolunteerApi
};
