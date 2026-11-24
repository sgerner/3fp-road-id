import { canManageActivity } from '#lib/server/activities.js';
import { sendServerEmail } from '#lib/server/email.js';
import {
	canUserManageGroupCore,
	canUserManageVolunteerEventCore,
	cancelEventSponsorshipRequestCore,
	cancelPendingSponsorshipRequestsForEventCore,
	createOrUpdateEventSponsorshipRequestCore,
	listGroupSponsorshipRequestsCore,
	loadActiveEventSponsorshipRequestCore,
	resolveUpdatedRideHostUserId,
	reviewEventSponsorshipRequestCore,
	shouldAuthorizeRideHostGroupChange
} from '#lib/server/eventSponsorshipsCore.js';
import { getConfiguredPublicOrigin } from '#lib/server/publicOrigin.js';
import { createServiceSupabaseClient } from '#lib/server/supabaseClient.js';

export {
	canUserManageGroupCore as canUserManageGroup,
	canUserManageVolunteerEventCore as canUserManageVolunteerEvent,
	resolveUpdatedRideHostUserId,
	shouldAuthorizeRideHostGroupChange
};

/** @param {Parameters<typeof loadActiveEventSponsorshipRequestCore>[0]} [options] */
export function loadActiveEventSponsorshipRequest(options = {}) {
	const { serviceSupabase = createServiceSupabaseClient(), ...rest } = options;
	return loadActiveEventSponsorshipRequestCore({ ...rest, serviceSupabase });
}

/** @param {Parameters<typeof cancelPendingSponsorshipRequestsForEventCore>[0]} [options] */
export function cancelPendingSponsorshipRequestsForEvent(options = {}) {
	const { serviceSupabase = createServiceSupabaseClient(), ...rest } = options;
	return cancelPendingSponsorshipRequestsForEventCore({ ...rest, serviceSupabase });
}

/** @param {Parameters<typeof createOrUpdateEventSponsorshipRequestCore>[0]} [options] */
export function createOrUpdateEventSponsorshipRequest(options = {}) {
	const {
		serviceSupabase = createServiceSupabaseClient(),
		canManageRideFn = canManageActivity,
		sendEmailFn = sendServerEmail,
		publicOrigin = getConfiguredPublicOrigin(),
		...rest
	} = options;
	return createOrUpdateEventSponsorshipRequestCore({
		...rest,
		serviceSupabase,
		canManageRideFn,
		sendEmailFn,
		publicOrigin
	});
}

/** @param {Parameters<typeof cancelEventSponsorshipRequestCore>[0]} [options] */
export function cancelEventSponsorshipRequest(options = {}) {
	const {
		serviceSupabase = createServiceSupabaseClient(),
		canManageRideFn = canManageActivity,
		...rest
	} = options;
	return cancelEventSponsorshipRequestCore({
		...rest,
		serviceSupabase,
		canManageRideFn
	});
}

/** @param {Parameters<typeof listGroupSponsorshipRequestsCore>[0]} [options] */
export function listGroupSponsorshipRequests(options = {}) {
	const { serviceSupabase = createServiceSupabaseClient(), ...rest } = options;
	return listGroupSponsorshipRequestsCore({ ...rest, serviceSupabase });
}

/** @param {Parameters<typeof reviewEventSponsorshipRequestCore>[0]} [options] */
export function reviewEventSponsorshipRequest(options = {}) {
	const {
		serviceSupabase = createServiceSupabaseClient(),
		sendEmailFn = sendServerEmail,
		publicOrigin = getConfiguredPublicOrigin(),
		...rest
	} = options;
	return reviewEventSponsorshipRequestCore({
		...rest,
		serviceSupabase,
		sendEmailFn,
		publicOrigin
	});
}
