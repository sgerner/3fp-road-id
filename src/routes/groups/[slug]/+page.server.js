import { joinMembership } from '#lib/server/memberships';
import { loadGroupProfilePageData } from '#lib/server/groupSnapshots';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';

export const load = async ({ params, cookies, url, parent, setHeaders }) =>
	loadGroupProfilePageData({
		params,
		cookies,
		url,
		parent,
		setHeaders,
		getPublicSupabase: () => createRequestSupabaseClient(null),
		getServiceSupabase: () => createServiceSupabaseClient(),
		getRequestSupabase: (accessToken) => createRequestSupabaseClient(accessToken),
		resolveSessionImpl: resolveVerifiedSession,
		joinMembershipImpl: joinMembership
	});
