import { env } from '$env/dynamic/private';
import {
	callInstagramApi,
	callMetaApi,
	requireMetaAppCredentials
} from '$lib/server/social/meta/client';
import {
	normalizeConnectedAccountSummary,
	normalizeMetaError,
	normalizeMetaScopes
} from '$lib/server/social/meta/normalize';

const FACEBOOK_OAUTH_BASE = 'https://www.facebook.com';
const INSTAGRAM_OAUTH_BASE = 'https://www.instagram.com';
const INSTAGRAM_OAUTH_TOKEN_ENDPOINT = 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_GRAPH_HOST = 'https://graph.instagram.com';
const OAUTH_DEFAULT_VERSION = 'v21.0';
const OAUTH_CALLBACK_URI = 'https://3fp.org/api/groups/social/callback';

const FACEBOOK_SCOPES = [
	'pages_show_list',
	'pages_read_engagement',
	'pages_manage_engagement',
	'pages_manage_posts',
	'pages_manage_metadata',
	'pages_read_user_content'
];

const INSTAGRAM_SCOPES = [
	'instagram_business_basic',
	'instagram_business_manage_messages',
	'instagram_business_manage_comments',
	'instagram_business_content_publish',
	'instagram_business_manage_insights'
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

function resolveProviderAppCredentials(provider) {
	const normalized = cleanText(provider, 40).toLowerCase();
	if (normalized === 'instagram') {
		const appId = cleanText(env.META_INSTAGRAM_APP_ID, 200) || cleanText(env.META_APP_ID, 200);
		const appSecret =
			cleanText(env.META_INSTAGRAM_APP_SECRET, 400) || cleanText(env.META_APP_SECRET, 400);
		if (!appId || !appSecret) {
			throw new Error(
				'META_INSTAGRAM_APP_ID/META_INSTAGRAM_APP_SECRET (or META_APP_ID/META_APP_SECRET fallback) must be configured.'
			);
		}
		return { appId, appSecret };
	}
	return requireMetaAppCredentials();
}

export function resolveMetaOAuthRedirectUri(url, provider = 'facebook') {
	void url;
	void provider;
	return OAUTH_CALLBACK_URI;
}

export function getMetaOAuthScopes(provider) {
	const normalized = cleanText(provider, 40).toLowerCase();
	if (normalized === 'instagram') return INSTAGRAM_SCOPES;
	return FACEBOOK_SCOPES;
}

export function buildMetaOAuthAuthorizeUrl({ provider, state, redirectUri }) {
	const normalizedProvider = cleanText(provider, 40).toLowerCase();
	const { appId } = resolveProviderAppCredentials(normalizedProvider);
	const scopes = getMetaOAuthScopes(provider);
	const params = new URLSearchParams({
		client_id: appId,
		redirect_uri: redirectUri,
		state: cleanText(state, 300),
		response_type: 'code',
		scope: scopes.join(',')
	});
	if (normalizedProvider === 'instagram') {
		params.set('force_reauth', 'true');
		return `${INSTAGRAM_OAUTH_BASE}/oauth/authorize?${params.toString()}`;
	}
	return `${FACEBOOK_OAUTH_BASE}/${resolveMetaOAuthVersion()}/dialog/oauth?${params.toString()}`;
}

async function callMetaOauthEndpoint(provider, params) {
	const normalizedProvider = cleanText(provider, 40).toLowerCase();
	const { appId, appSecret } = resolveProviderAppCredentials(normalizedProvider);
	let response = null;

	if (normalizedProvider === 'instagram') {
		const form = new URLSearchParams({
			client_id: appId,
			client_secret: appSecret,
			...params
		});
		response = await fetch(INSTAGRAM_OAUTH_TOKEN_ENDPOINT, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: form.toString(),
			signal: AbortSignal.timeout(30_000)
		});
	} else {
		const query = new URLSearchParams({
			client_id: appId,
			client_secret: appSecret,
			...params
		});
		response = await fetch(
			`https://graph.facebook.com/${resolveMetaOAuthVersion()}/oauth/access_token?${query.toString()}`,
			{
				method: 'GET',
				headers: { Accept: 'application/json' },
				signal: AbortSignal.timeout(30_000)
			}
		);
	}

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

export async function exchangeMetaCodeForToken({ provider = 'facebook', code, redirectUri }) {
	const normalizedProvider = cleanText(provider, 40).toLowerCase();
	const params =
		normalizedProvider === 'instagram'
			? {
					grant_type: 'authorization_code',
					redirect_uri: redirectUri,
					code: cleanText(code, 2000)
				}
			: {
					redirect_uri: redirectUri,
					code: cleanText(code, 2000)
				};
	const payload = await callMetaOauthEndpoint(normalizedProvider, params);
	return {
		accessToken: cleanText(payload?.access_token, 5000),
		tokenType: cleanText(payload?.token_type, 80) || 'bearer',
		expiresIn: Number(payload?.expires_in || 0) || null,
		userId: cleanText(payload?.user_id || payload?.id, 120) || null
	};
}

export async function exchangeForLongLivedMetaToken(accessToken, { provider = 'facebook' } = {}) {
	const normalizedProvider = cleanText(provider, 40).toLowerCase();
	const shortToken = cleanText(accessToken, 5000);
	if (!shortToken) throw new Error('Meta access token is required.');
	let payload = null;
	if (normalizedProvider === 'instagram') {
		const { appSecret } = resolveProviderAppCredentials('instagram');
		const query = new URLSearchParams({
			grant_type: 'ig_exchange_token',
			client_secret: appSecret,
			access_token: shortToken
		});
		const response = await fetch(`${INSTAGRAM_GRAPH_HOST}/access_token?${query.toString()}`, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(30_000)
		});
		const raw = await response.text();
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
	} else {
		payload = await callMetaOauthEndpoint('facebook', {
			grant_type: 'fb_exchange_token',
			fb_exchange_token: shortToken
		});
	}
	return {
		accessToken: cleanText(payload?.access_token, 5000) || shortToken,
		tokenType: cleanText(payload?.token_type, 80) || 'bearer',
		expiresIn: Number(payload?.expires_in || 0) || null
	};
}

export async function refreshLongLivedInstagramToken(accessToken) {
	const token = cleanText(accessToken, 5000);
	if (!token) throw new Error('Instagram access token is required.');
	const query = new URLSearchParams({
		grant_type: 'ig_refresh_token',
		access_token: token
	});
	const response = await fetch(`${INSTAGRAM_GRAPH_HOST}/refresh_access_token?${query.toString()}`, {
		method: 'GET',
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(30_000)
	});
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
			normalizeMetaError(payload, `Instagram token refresh failed (${response.status}).`)
		);
	}
	return {
		accessToken: cleanText(payload?.access_token, 5000) || token,
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

export async function fetchInstagramLoginProfile(userAccessToken) {
	const profile = await callInstagramApi({
		path: '/me',
		accessToken: userAccessToken,
		query: { fields: 'user_id,username,name' }
	});
	return {
		id: cleanText(profile?.id || profile?.user_id, 120) || null,
		userId: cleanText(profile?.user_id || profile?.id, 120) || null,
		name: cleanText(profile?.name, 240) || null,
		username: cleanText(profile?.username, 120) || null
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
	const profile = await fetchInstagramLoginProfile(userAccessToken);
	const igAccountId = cleanText(profile?.id || profile?.userId, 120);
	if (!igAccountId) {
		throw new Error('No Instagram professional account was found for this login.');
	}
	const connected = normalizeConnectedAccountSummary(
		{
			meta_user_id: igAccountId,
			meta_page_id: null,
			meta_instagram_account_id: igAccountId,
			account_name:
				cleanText(profile?.name, 240) || cleanText(profile?.username, 120) || 'Instagram account',
			username: cleanText(profile?.username, 120) || null,
			token_expires_at: null,
			scopes,
			metadata: {
				meta_user_name: cleanText(profile?.name, 240) || null,
				connected_via: 'instagram_login'
			}
		},
		'instagram'
	);
	return {
		...connected,
		accessToken: userAccessToken
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
	const profile = await fetchInstagramLoginProfile(userAccessToken);
	const igAccountId = cleanText(profile?.id || profile?.userId, 120);
	if (!igAccountId) return [];

	const username = cleanText(profile?.username, 120) || null;
	const accountName = cleanText(profile?.name, 240) || username || 'Instagram account';
	return [
		{
			option_id: igAccountId,
			label: username ? `@${username}` : accountName,
			description: 'Instagram professional account',
			account: normalizeConnectedAccountSummary(
				{
					meta_user_id: igAccountId,
					meta_page_id: null,
					meta_instagram_account_id: igAccountId,
					account_name: accountName,
					username,
					token_expires_at: null,
					scopes,
					metadata: {
						meta_user_name: cleanText(profile?.name, 240) || null,
						connected_via: 'instagram_login'
					}
				},
				'instagram'
			)
		}
	];
}

export async function resolveMetaConnectionFromOption({ provider, option, accessToken }) {
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
	let resolvedToken = accessToken;
	if (normalizedProvider === 'facebook') {
		const selectedPageId =
			cleanText(account?.meta_page_id, 120) || cleanText(option?.option_id, 120);
		if (selectedPageId) {
			const pages = await fetchManagedFacebookPages(accessToken).catch(() => []);
			const selectedPage = pages.find((entry) => cleanText(entry?.id, 120) === selectedPageId);
			const pageAccessToken = cleanText(selectedPage?.access_token, 5000);
			if (pageAccessToken) resolvedToken = pageAccessToken;
		}
	}
	return {
		...account,
		accessToken: resolvedToken
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
