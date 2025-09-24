import { redirect } from '@sveltejs/kit';
import { load as loadVolunteerEvent } from '../+page.server.js';

function encodeReturnTo(pathname = '', search = '') {
	const value = `${pathname}${search}`;
	return encodeURIComponent(value);
}

function buildQuery(params) {
	const search = new URLSearchParams();
	if (params && typeof params === 'object') {
		for (const [key, value] of Object.entries(params)) {
			if (value === null || value === undefined) continue;
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item === null || item === undefined) continue;
					search.append(key, String(item));
				}
				continue;
			}
			search.set(key, String(value));
		}
	}
	const qs = search.toString();
	return qs ? `?${qs}` : '';
}

async function callVolunteerApi(fetchImpl, resource, params) {
	const qs = buildQuery(params);
	const response = await fetchImpl(`/api/v1/${resource}${qs}`);
	const text = await response.text();
	let payload = null;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = text;
		}
	}
	if (!response.ok) {
		const error = new Error(payload?.error || payload?.message || `Failed to load ${resource}`);
		error.status = response.status;
		error.payload = payload;
		throw error;
	}
	return payload ?? {};
}

async function fetchList(fetchImpl, resource, params) {
	try {
		const payload = await callVolunteerApi(fetchImpl, resource, params);
		const data = payload?.data ?? payload;
		if (Array.isArray(data)) return data;
		if (data === null || data === undefined) return [];
		return [data];
	} catch (err) {
		if (err?.status === 403 || err?.status === 404) {
			return [];
		}
		throw err;
	}
}

async function fetchSingle(fetchImpl, resource, params) {
	try {
		const payload = await callVolunteerApi(fetchImpl, resource, params);
		return payload?.data ?? payload ?? null;
	} catch (err) {
		if (err?.status === 404) return null;
		throw err;
	}
}

function chunk(array, size) {
	if (!Array.isArray(array) || size <= 0) return [array];
	const result = [];
	for (let index = 0; index < array.length; index += size) {
		result.push(array.slice(index, index + size));
	}
	return result;
}

export const load = async (event) => {
	const baseData = await loadVolunteerEvent(event);
	const slug = event.params.slug ?? '';
	const returnTo = `${event.url.pathname}${event.url.search}`;

	if (!baseData?.user?.id) {
		throw redirect(
			303,
			`/volunteer/${slug}?auth=required&returnTo=${encodeReturnTo(event.url.pathname, event.url.search)}`
		);
	}

	if (!baseData?.canManageEvent) {
		throw redirect(303, `/volunteer/${slug}?auth=forbidden`);
	}

	let eventEmails = [];
	const eventId = baseData?.event?.id;
	let eventDetails = baseData?.event ?? null;
	let opportunities = baseData?.opportunities ?? [];
	let customQuestions = baseData?.customQuestions ?? [];
	let signups = baseData?.signups ?? [];
	let signupShifts = baseData?.signupShifts ?? [];
	let signupResponses = baseData?.signupResponses ?? [];
	let volunteerProfiles = [];

	if (!eventDetails && slug) {
		eventDetails = await fetchSingle(event.fetch, 'volunteer-events', {
			slug: `eq.${slug}`,
			single: 'true'
		});
	}

	if (eventId) {
		try {
			eventEmails = await fetchList(event.fetch, 'volunteer-event-emails', {
				event_id: `eq.${eventId}`,
				order: 'created_at.desc'
			});
		} catch (err) {
			console.warn('Failed to load volunteer event emails', err);
			eventEmails = [];
		}
	}

	if (eventId) {
		try {
			opportunities = await fetchList(event.fetch, 'volunteer-opportunities', {
				event_id: `eq.${eventId}`,
				order: 'title.asc'
			});
		} catch (err) {
			console.warn('Unable to load volunteer opportunities', err);
			opportunities = [];
		}

		const opportunityIds = opportunities
			.map((opportunity) => opportunity?.id)
			.filter((value) => value !== null && value !== undefined);

		let shifts = [];
		if (opportunityIds.length) {
			try {
				const batches = chunk(opportunityIds, 20);
				const responses = await Promise.all(
					batches.map((batch) =>
						fetchList(event.fetch, 'volunteer-opportunity-shifts', {
							opportunity_id: `in.(${batch.join(',')})`,
							order: 'starts_at.asc'
						})
					)
				);
				shifts = responses.flat();
			} catch (err) {
				console.warn('Unable to load volunteer opportunity shifts', err);
				shifts = [];
			}
		}

		const shiftsByOpportunity = new Map();
		for (const shift of shifts) {
			const opportunityId = shift?.opportunity_id ?? shift?.volunteer_opportunity_id;
			if (!opportunityId) continue;
			const key = String(opportunityId);
			if (!shiftsByOpportunity.has(key)) shiftsByOpportunity.set(key, []);
			shiftsByOpportunity.get(key)?.push(shift);
		}

		for (const bucket of shiftsByOpportunity.values()) {
			bucket.sort((a, b) => {
				const startA = new Date(a?.starts_at ?? a?.startsAt ?? 0).getTime();
				const startB = new Date(b?.starts_at ?? b?.startsAt ?? 0).getTime();
				return startA - startB;
			});
		}

		opportunities = opportunities.map((opportunity) => {
			const key = String(opportunity?.id);
			return {
				...opportunity,
				shifts: shiftsByOpportunity.get(key) ?? []
			};
		});

		try {
			customQuestions = await fetchList(event.fetch, 'volunteer-custom-questions', {
				event_id: `eq.${eventId}`,
				order: 'position.asc'
			});
		} catch (err) {
			console.warn('Unable to load volunteer custom questions', err);
			customQuestions = [];
		}

		try {
			signups = await fetchList(event.fetch, 'volunteer-signups', {
				event_id: `eq.${eventId}`,
				order: 'created_at.asc'
			});
		} catch (err) {
			if (err?.status === 403) {
				signups = [];
			} else {
				console.warn('Unable to load volunteer signups', err);
				signups = [];
			}
		}

		const signupIds = signups
			.map((signup) => signup?.id)
			.filter((value) => value !== null && value !== undefined);

		if (signupIds.length) {
			try {
				const batches = chunk(signupIds, 20);
				const shiftResponses = await Promise.all(
					batches.map((batch) =>
						fetchList(event.fetch, 'volunteer-signup-shifts', {
							signup_id: `in.(${batch.join(',')})`
						})
					)
				);
				signupShifts = shiftResponses.flat();
			} catch (err) {
				console.warn('Unable to load volunteer signup shifts', err);
				signupShifts = [];
			}

			try {
				const batches = chunk(signupIds, 20);
				const responseBuckets = await Promise.all(
					batches.map((batch) =>
						fetchList(event.fetch, 'volunteer-signup-responses', {
							signup_id: `in.(${batch.join(',')})`,
							order: 'created_at.asc'
						})
					)
				);
				signupResponses = responseBuckets.flat();
			} catch (err) {
				console.warn('Unable to load volunteer signup responses', err);
				signupResponses = [];
			}
		} else {
			signupShifts = [];
			signupResponses = [];
		}

		const volunteerUserIds = signups
			.map(
				(signup) =>
					signup?.volunteer_user_id ?? signup?.volunteerUserId ?? signup?.user_id ?? signup?.userId
			)
			.filter((value) => value !== null && value !== undefined);

		const volunteerProfileIds = signups
			.map(
				(signup) =>
					signup?.volunteer_profile_id ??
					signup?.volunteerProfileId ??
					signup?.profile_id ??
					signup?.profileId
			)
			.filter((value) => value !== null && value !== undefined);

		const uniqueProfileFilters = new Set([
			...volunteerUserIds.map((value) => String(value)),
			...volunteerProfileIds.map((value) => String(value))
		]);

		const formatInFilter = (values) =>
			values
				.map((value) => {
					const safe = String(value).replace(/"/g, '""');
					return `"${safe}"`;
				})
				.join(',');

		if (uniqueProfileFilters.size) {
			const idValues = Array.from(uniqueProfileFilters);
			const batches = chunk(idValues, 20);
			try {
				const responses = await Promise.all(
					batches.map((batch) =>
						fetchList(event.fetch, 'profiles', {
							select: [
								'id',
								'user_id',
								'full_name',
								'email',
								'phone',
								'emergency_contact_name',
								'emergency_contact_phone'
							].join(','),
							or: `user_id.in.(${formatInFilter(batch)}),id.in.(${formatInFilter(batch)})`
						})
					)
				);
				volunteerProfiles = responses.flat();
			} catch (err) {
				console.warn('Unable to load volunteer profiles', err);
				volunteerProfiles = [];
			}
		}
	}

	return {
		...baseData,
		event: eventDetails ?? baseData?.event ?? null,
		opportunities,
		customQuestions,
		signups,
		signupShifts,
		signupResponses,
		profiles: volunteerProfiles,
		eventEmails,
		returnTo
	};
};
