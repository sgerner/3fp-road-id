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

export function loadActiveEventSponsorshipRequest({
	serviceSupabase = createServiceSupabaseClient(),
	...options
} = {}) {
	return loadActiveEventSponsorshipRequestCore({ ...options, serviceSupabase });
}

export function cancelPendingSponsorshipRequestsForEvent({
	serviceSupabase = createServiceSupabaseClient(),
	...options
} = {}) {
	return cancelPendingSponsorshipRequestsForEventCore({ ...options, serviceSupabase });
}

export function createOrUpdateEventSponsorshipRequest({
	serviceSupabase = createServiceSupabaseClient(),
	canManageRideFn = canManageActivity,
	sendEmailFn = sendServerEmail,
	publicOrigin = getConfiguredPublicOrigin(),
	...options
} = {}) {
	return createOrUpdateEventSponsorshipRequestCore({
		...options,
		serviceSupabase,
		canManageRideFn,
		sendEmailFn,
		publicOrigin
	});
}

export function cancelEventSponsorshipRequest({
	serviceSupabase = createServiceSupabaseClient(),
	canManageRideFn = canManageActivity,
	...options
} = {}) {
	return cancelEventSponsorshipRequestCore({
		...options,
		serviceSupabase,
		canManageRideFn
	});
}

export function listGroupSponsorshipRequests({
	serviceSupabase = createServiceSupabaseClient(),
	...options
} = {}) {
	return listGroupSponsorshipRequestsCore({ ...options, serviceSupabase });
}

export function reviewEventSponsorshipRequest({
	serviceSupabase = createServiceSupabaseClient(),
	sendEmailFn = sendServerEmail,
	publicOrigin = getConfiguredPublicOrigin(),
	...options
} = {}) {
	return reviewEventSponsorshipRequestCore({
		...options,
		serviceSupabase,
		sendEmailFn,
		publicOrigin
	});
}
