import { env } from '$env/dynamic/private';
import { PUBLIC_URL_BASE } from '$env/static/public';
import { callMetaApi, requireMetaAppCredentials } from '$lib/server/social/meta/client';
import {
	normalizeConnectedAccountSummary,
	normalizeMetaError,
	normalizeMetaScopes
} from '$lib/server/social/meta/normalize';

const FACEBOOK_OAUTH_BASE = 'https://www.facebook.com';
const OAUTH_DEFAULT_VERSION = 'v21.0';

const FACEBOOK_SCOPES = [
	'pages_show_list',
	'pages_read_engagement',
	'pages_manage_posts',
	'pages_manage_metadata',
	'pages_read_user_content'
];

const INSTAGRAM_SCOPES = [
	...FACEBOOK_SCOPES,
	'instagram_basic',
	'instagram_content_publish',
	'instagram_manage_comments'
];

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function resolveMetaOAuthVersion() {
	return (
		cleanText(env.META_OAUTH_VERSION || env.META_GRAPH_API_VERSION, 32) || OAUTH_DEFAULT_VERSION
	);
}

function resolveBaseUrlFromRequest(url) {
	if (PUBLIC_URL_BASE && PUBLIC_URL_BASE.trim()) {
		return PUBLIC_URL_BASE.trim().replace(/\/+$/, '');
	}
	if (url?.origin) return String(url.origin).replace(/\/+$/, '');
	return '';
}

export function resolveMetaOAuthRedirectUri(url) {
	const configured = cleanText(env.META_OAUTH_REDIRECT_URI, 2000);
	if (configured) return configured;
	const baseUrl = resolveBaseUrlFromRequest(url);
	if (!baseUrl) {
		throw new Error('META_OAUTH_REDIRECT_URI or PUBLIC_URL_BASE must be configured.');
	}
	return `${baseUrl}/api/groups/social/callback`;
}

export function getMetaOAuthScopes(provider) {
	const normalized = cleanText(provider, 40).toLowerCase();
	if (normalized === 'instagram') return INSTAGRAM_SCOPES;
	return FACEBOOK_SCOPES;
}

export function buildMetaOAuthAuthorizeUrl({ provider, state, redirectUri }) {
	const { appId } = requireMetaAppCredentials();
	const scopes = getMetaOAuthScopes(provider);
	const params = new URLSearchParams({
		client_id: appId,
		redirect_uri: redirectUri,
		state: cleanText(state, 300),
		response_type: 'code',
		scope: scopes.join(',')
	});
	return `${FACEBOOK_OAUTH_BASE}/${resolveMetaOAuthVersion()}/dialog/oauth?${params.toString()}`;
}

async function callMetaOauthEndpoint(params) {
	const { appId, appSecret } = requireMetaAppCredentials();
	const query = new URLSearchParams({
		client_id: appId,
		client_secret: appSecret,
		...params
	});
	const response = await fetch(
		`https://graph.facebook.com/${resolveMetaOAuthVersion()}/oauth/access_token?${query.toString()}`,
		{
			method: 'GET',
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(30_000)
		}
	);
	const raw = await response.text();
	let payload = null;
	if (raw) {
		try {
			payload = JSON.parse(raw);
		} catch {
			payload = { raw };
		}
	}
	if (!response.ok) {
		throw new Error(
			normalizeMetaError(payload, `Meta OAuth exchange failed (${response.status}).`)
		);
	}
	return payload ?? {};
}

export async function exchangeMetaCodeForToken({ code, redirectUri }) {
	const payload = await callMetaOauthEndpoint({
		redirect_uri: redirectUri,
		code: cleanText(code, 2000)
	});
	return {
		accessToken: cleanText(payload?.access_token, 5000),
		tokenType: cleanText(payload?.token_type, 80) || 'bearer',
		expiresIn: Number(payload?.expires_in || 0) || null
	};
}

export async function exchangeForLongLivedMetaToken(accessToken) {
	const shortToken = cleanText(accessToken, 5000);
	if (!shortToken) throw new Error('Meta access token is required.');
	const payload = await callMetaOauthEndpoint({
		grant_type: 'fb_exchange_token',
		fb_exchange_token: shortToken
	});
	return {
		accessToken: cleanText(payload?.access_token, 5000) || shortToken,
		tokenType: cleanText(payload?.token_type, 80) || 'bearer',
		expiresIn: Number(payload?.expires_in || 0) || null
	};
}

export async function fetchMetaUserProfile(userAccessToken) {
	const profile = await callMetaApi({
		path: '/me',
		accessToken: userAccessToken,
		query: { fields: 'id,name' }
	});
	return {
		id: cleanText(profile?.id, 120) || null,
		name: cleanText(profile?.name, 240) || null
	};
}

export async function fetchManagedFacebookPages(userAccessToken) {
	const response = await callMetaApi({
		path: '/me/accounts',
		accessToken: userAccessToken,
		query: {
			fields: 'id,name,access_token,instagram_business_account{id,username}',
			limit: 50
		}
	});
	return Array.isArray(response?.data) ? response.data : [];
}

export async function resolveFacebookAccountConnection({ userAccessToken, scopes = [] } = {}) {
	const userProfile = await fetchMetaUserProfile(userAccessToken);
	const pages = await fetchManagedFacebookPages(userAccessToken);
	if (!pages.length) {
		throw new Error('No manageable Facebook Pages were found for this Meta account.');
	}

	const page = pages[0];
	const pageToken = cleanText(page?.access_token, 5000) || userAccessToken;
	const connected = normalizeConnectedAccountSummary(
		{
			meta_user_id: userProfile.id,
			meta_page_id: cleanText(page?.id, 120) || null,
			account_name: cleanText(page?.name, 240) || 'Facebook Page',
			token_expires_at: null,
			scopes,
			metadata: {
				meta_user_name: userProfile.name,
				connected_via: 'facebook_page',
				available_page_count: pages.length
			}
		},
		'facebook'
	);

	return {
		...connected,
		accessToken: pageToken
	};
}

export async function resolveInstagramAccountConnection({ userAccessToken, scopes = [] } = {}) {
	const userProfile = await fetchMetaUserProfile(userAccessToken);
	const pages = await fetchManagedFacebookPages(userAccessToken);
	const pageWithInstagram = pages.find((entry) => entry?.instagram_business_account?.id);
	if (!pageWithInstagram) {
		throw new Error(
			'No Instagram professional account was found. Connect a Facebook Page linked to an Instagram professional account.'
		);
	}

	const igAccount = pageWithInstagram.instagram_business_account;
	const pageToken = cleanText(pageWithInstagram?.access_token, 5000) || userAccessToken;
	const connected = normalizeConnectedAccountSummary(
		{
			meta_user_id: userProfile.id,
			meta_page_id: cleanText(pageWithInstagram?.id, 120) || null,
			meta_instagram_account_id: cleanText(igAccount?.id, 120) || null,
			account_name: cleanText(pageWithInstagram?.name, 240) || 'Instagram account',
			username: cleanText(igAccount?.username, 120) || null,
			token_expires_at: null,
			scopes,
			metadata: {
				meta_user_name: userProfile.name,
				connected_via: 'instagram_business_account',
				meta_page_name: cleanText(pageWithInstagram?.name, 240) || null
			}
		},
		'instagram'
	);

	return {
		...connected,
		accessToken: pageToken
	};
}

export async function listFacebookConnectionOptions({ userAccessToken, scopes = [] } = {}) {
	const userProfile = await fetchMetaUserProfile(userAccessToken);
	const pages = await fetchManagedFacebookPages(userAccessToken);
	return pages
		.map((page) => ({
			option_id: cleanText(page?.id, 120),
			label: cleanText(page?.name, 240) || 'Facebook Page',
			description: 'Facebook Page',
			account: normalizeConnectedAccountSummary(
				{
					meta_user_id: userProfile.id,
					meta_page_id: cleanText(page?.id, 120) || null,
					account_name: cleanText(page?.name, 240) || 'Facebook Page',
					token_expires_at: null,
					scopes,
					metadata: {
						meta_user_name: userProfile.name,
						connected_via: 'facebook_page'
					}
				},
				'facebook'
			)
		}))
		.filter((entry) => entry.option_id);
}

export async function listInstagramConnectionOptions({ userAccessToken, scopes = [] } = {}) {
	const userProfile = await fetchMetaUserProfile(userAccessToken);
	const pages = await fetchManagedFacebookPages(userAccessToken);
	return pages
		.map((page) => {
			const igAccount = page?.instagram_business_account;
			const igAccountId = cleanText(igAccount?.id, 120);
			if (!igAccountId) return null;
			const pageName = cleanText(page?.name, 240) || 'Facebook Page';
			const igUsername = cleanText(igAccount?.username, 120) || null;
			return {
				option_id: igAccountId,
				label: igUsername ? `@${igUsername}` : `${pageName} Instagram`,
				description: `${pageName} linked professional account`,
				account: normalizeConnectedAccountSummary(
					{
						meta_user_id: userProfile.id,
						meta_page_id: cleanText(page?.id, 120) || null,
						meta_instagram_account_id: igAccountId,
						account_name: pageName,
						username: igUsername,
						token_expires_at: null,
						scopes,
						metadata: {
							meta_user_name: userProfile.name,
							connected_via: 'instagram_business_account',
							meta_page_name: pageName
						}
					},
					'instagram'
				)
			};
		})
		.filter(Boolean);
}

export function resolveMetaConnectionFromOption({ provider, option, accessToken }) {
	if (!option || typeof option !== 'object') {
		throw new Error('Invalid connection option selected.');
	}
	const account = option.account || {};
	const normalizedProvider = cleanText(provider, 40).toLowerCase();
	if (normalizedProvider === 'instagram' && !account.meta_instagram_account_id) {
		throw new Error('Selected option does not include an Instagram professional account.');
	}
	if (normalizedProvider === 'facebook' && !account.meta_page_id) {
		throw new Error('Selected option does not include a Facebook Page.');
	}
	return {
		...account,
		accessToken
	};
}

export function computeTokenExpiryFromSeconds(expiresInSeconds) {
	const seconds = Number(expiresInSeconds);
	if (!Number.isFinite(seconds) || seconds <= 0) return null;
	return new Date(Date.now() + seconds * 1000).toISOString();
}

export function normalizeGrantedScopes(scopeStringOrList) {
	return normalizeMetaScopes(scopeStringOrList);
}
