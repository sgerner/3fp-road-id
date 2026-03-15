import { json, redirect } from '@sveltejs/kit';
import {
	buildSocialReturnPath,
	createGroupSocialOauthState,
	purgeExpiredGroupSocialOauthStates
} from '$lib/server/social/auth';
import { requireGroupSocialManager } from '$lib/server/social/permissions';
import { normalizePlatform } from '$lib/server/social/types';
import {
	buildMetaOAuthAuthorizeUrl,
	resolveMetaOAuthRedirectUri
} from '$lib/server/social/meta/oauth';

export async function GET({ cookies, params, url }) {
	const platform = normalizePlatform(params.platform);
	if (!platform) {
		return json({ error: 'Unsupported social platform.' }, { status: 400 });
	}

	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const redirectTo =
			url.searchParams.get('redirect_to') || buildSocialReturnPath(auth.group.slug, 'connected');
		const redirectUri = resolveMetaOAuthRedirectUri(url, platform);
		await purgeExpiredGroupSocialOauthStates(auth.serviceSupabase);
		const stateRecord = await createGroupSocialOauthState(auth.serviceSupabase, {
			groupId: auth.group.id,
			userId: auth.userId,
			provider: platform,
			redirectTo,
			oauthRedirectUri: redirectUri
		});
		const authorizeUrl = buildMetaOAuthAuthorizeUrl({
			provider: platform,
			state: stateRecord.state_token,
			redirectUri
		});
		throw redirect(303, authorizeUrl);
	} catch (error) {
		if (error?.status === 303) throw error;
		console.error('Unable to start Meta OAuth connect', error);
		return json(
			{ error: error?.message || 'Unable to start social account connection.' },
			{ status: 500 }
		);
	}
}
