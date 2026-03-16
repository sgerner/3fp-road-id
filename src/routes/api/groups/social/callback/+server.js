import { redirect } from '@sveltejs/kit';
import { buildSocialReturnPath, consumeGroupSocialOauthState } from '$lib/server/social/auth';
import {
	createGroupSocialOauthPendingConnection,
	purgeExpiredGroupSocialOauthPendingConnections,
	upsertGroupSocialAccount
} from '$lib/server/social/db';
import { canManageGroupSocial, getSocialAuthContext } from '$lib/server/social/permissions';
import { encryptSocialToken } from '$lib/server/social/crypto';
import {
	computeTokenExpiryFromSeconds,
	exchangeForLongLivedMetaToken,
	exchangeMetaCodeForToken,
	listFacebookConnectionOptions,
	listInstagramConnectionOptions,
	normalizeGrantedScopes,
	resolveMetaConnectionFromOption,
	resolveMetaOAuthRedirectUri
} from '$lib/server/social/meta/oauth';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function resolveStoredOauthRedirectUri(stateRecord) {
	const stored = cleanText(stateRecord?.code_verifier, 2000);
	if (!stored) return null;
	try {
		const parsed = new URL(stored);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
		return parsed.toString().replace(/\/+$/, '');
	} catch {
		return null;
	}
}

async function loadGroupById(supabase, groupId) {
	const { data, error } = await supabase
		.from('groups')
		.select('id,slug,name')
		.eq('id', groupId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

function buildReturnPath(groupSlug, status, reason = null) {
	return buildSocialReturnPath(groupSlug, status, reason);
}

function withQuery(path, values = {}) {
	const base = new URL(path, 'http://local.test');
	for (const [key, value] of Object.entries(values || {})) {
		if (value === null || value === undefined || value === '') continue;
		base.searchParams.set(key, String(value));
	}
	return `${base.pathname}${base.search}${base.hash}`;
}

export async function GET({ cookies, url }) {
	const stateToken = cleanText(url.searchParams.get('state'), 300);
	const code = cleanText(url.searchParams.get('code'), 4000);
	const oauthError = cleanText(url.searchParams.get('error'), 200);
	const oauthErrorDescription = cleanText(url.searchParams.get('error_description'), 400);

	let auth = null;
	try {
		auth = await getSocialAuthContext(cookies);
	} catch (error) {
		console.error('Unable to resolve social auth context in callback', error);
	}

	if (!auth?.serviceSupabase) {
		throw redirect(303, '/groups?social=error&social_reason=auth_required');
	}

	let stateRecord = null;
	let group = null;
	try {
		stateRecord = await consumeGroupSocialOauthState(auth.serviceSupabase, stateToken);
		if (!stateRecord) {
			throw redirect(303, '/groups?social=error&social_reason=invalid_state');
		}
		group = await loadGroupById(auth.serviceSupabase, stateRecord.group_id);
		if (!group?.slug) {
			throw redirect(303, '/groups?social=error&social_reason=missing_group');
		}

		if (!auth?.userId) {
			throw redirect(303, buildReturnPath(group.slug, 'error', 'auth_required'));
		}
		if (stateRecord.user_id && stateRecord.user_id !== auth.userId) {
			throw redirect(303, buildReturnPath(group.slug, 'error', 'session_mismatch'));
		}

		const canManage = await canManageGroupSocial(auth.requestSupabase, auth.userId, group.id);
		if (!canManage) {
			throw redirect(303, buildReturnPath(group.slug, 'error', 'forbidden'));
		}

		if (oauthError) {
			const reason = oauthErrorDescription ? `${oauthError}:${oauthErrorDescription}` : oauthError;
			throw redirect(303, buildReturnPath(group.slug, 'error', reason));
		}
		if (!code) {
			throw redirect(303, buildReturnPath(group.slug, 'error', 'missing_code'));
		}

		const redirectUri =
			resolveStoredOauthRedirectUri(stateRecord) ||
			resolveMetaOAuthRedirectUri(url, stateRecord.provider);
		const provider = stateRecord.provider === 'instagram' ? 'instagram' : 'facebook';
		const token = await exchangeMetaCodeForToken({ provider, code, redirectUri });
		const longLivedToken = await exchangeForLongLivedMetaToken(token.accessToken, {
			provider
		}).catch(() => token);
		const tokenExpiry = computeTokenExpiryFromSeconds(longLivedToken.expiresIn);
		const scopes = normalizeGrantedScopes(
			url.searchParams.get('granted_scopes') || url.searchParams.get('scope')
		);

		let options = [];
		if (stateRecord.provider === 'instagram') {
			options = await listInstagramConnectionOptions({
				userAccessToken: longLivedToken.accessToken,
				scopes
			});
		} else {
			options = await listFacebookConnectionOptions({
				userAccessToken: longLivedToken.accessToken,
				scopes
			});
		}
		if (!options.length) {
			throw new Error('No manageable social assets were found for this Meta account.');
		}

		const selectedOption = options.length === 1 ? options[0] : null;
		let connectedAccount = null;
		if (selectedOption) {
			connectedAccount = await resolveMetaConnectionFromOption({
				provider: stateRecord.provider,
				option: selectedOption,
				accessToken: longLivedToken.accessToken
			});
		} else {
			await purgeExpiredGroupSocialOauthPendingConnections(auth.serviceSupabase);
			await auth.serviceSupabase
				.from('group_social_oauth_pending_connections')
				.delete()
				.eq('group_id', group.id)
				.eq('user_id', auth.userId)
				.eq('provider', stateRecord.provider);
			const pending = await createGroupSocialOauthPendingConnection(auth.serviceSupabase, {
				group_id: group.id,
				user_id: auth.userId,
				provider: stateRecord.provider,
				access_token_encrypted: encryptSocialToken(longLivedToken.accessToken),
				token_expires_at: tokenExpiry,
				scopes,
				options: options.map((option) => ({
					option_id: option.option_id,
					label: option.label,
					description: option.description || null,
					account: option.account
				})),
				expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
			});
			const redirectPath = stateRecord.redirect_to || `/groups/${group.slug}`;
			throw redirect(
				303,
				withQuery(redirectPath, {
					social: 'pick_account',
					social_provider: stateRecord.provider,
					social_pending: pending.id
				})
			);
		}

		await upsertGroupSocialAccount(auth.serviceSupabase, {
			group_id: group.id,
			platform: stateRecord.provider,
			meta_user_id: connectedAccount.meta_user_id,
			meta_page_id: connectedAccount.meta_page_id,
			meta_instagram_account_id: connectedAccount.meta_instagram_account_id,
			account_name: connectedAccount.account_name,
			username: connectedAccount.username,
			access_token_encrypted: encryptSocialToken(connectedAccount.accessToken),
			refresh_token_encrypted: null,
			token_expires_at: tokenExpiry,
			scopes: scopes,
			status: 'active',
			metadata: {
				...(connectedAccount.metadata || {}),
				oauth_connected_at: new Date().toISOString()
			},
			created_by: auth.userId,
			last_error: null
		});

		throw redirect(303, buildReturnPath(group.slug, 'connected', stateRecord.provider));
	} catch (error) {
		if (error?.status === 303) throw error;
		console.error('Meta social OAuth callback failed', error);

		if (group?.slug) {
			throw redirect(
				303,
				buildReturnPath(group.slug, 'error', cleanText(error?.message, 180) || 'oauth_failed')
			);
		}
		throw redirect(303, '/groups?social=error&social_reason=oauth_failed');
	}
}
