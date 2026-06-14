import { createSign } from 'node:crypto';
import { env } from '$env/dynamic/private';
import {
	cleanText,
	describeWorkspaceAuthError,
	exactText,
	normalizeErrorMessage
} from './googleWorkspaceRules.js';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DIRECTORY_API_BASE_URL = 'https://admin.googleapis.com/admin/directory/v1';

const USER_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user';
const USER_ALIAS_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.alias';
const ORG_UNIT_SCOPE = 'https://www.googleapis.com/auth/admin.directory.orgunit.readonly';
const USER_SECURITY_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.security';

function buildWorkspaceConfig() {
	const rawServiceAccountJson = cleanText(env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON);
	let parsedJson = null;
	if (rawServiceAccountJson) {
		try {
			parsedJson = JSON.parse(rawServiceAccountJson);
		} catch {
			parsedJson = null;
		}
	}

	const clientEmail = cleanText(
		env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL || parsedJson?.client_email
	);
	const clientId = cleanText(
		env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_CLIENT_ID || parsedJson?.client_id
	);
	const privateKeyRaw = cleanText(
		env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_PRIVATE_KEY || parsedJson?.private_key
	);
	const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
	const delegatedAdminEmail = cleanText(
		env.GOOGLE_WORKSPACE_ADMIN_EMAIL || env.GOOGLE_WORKSPACE_DELEGATED_ADMIN_EMAIL
	);
	const customer = cleanText(env.GOOGLE_WORKSPACE_CUSTOMER || 'my_customer');

	if (!clientEmail || !privateKey || !delegatedAdminEmail) {
		return null;
	}

	return { clientEmail, clientId, privateKey, delegatedAdminEmail, customer };
}

function createSignedJwt({ clientEmail, privateKey, delegatedAdminEmail, scopes }) {
	const nowSeconds = Math.floor(Date.now() / 1000);
	const header = { alg: 'RS256', typ: 'JWT' };
	const payload = {
		iss: clientEmail,
		sub: delegatedAdminEmail,
		scope: scopes.join(' '),
		aud: GOOGLE_OAUTH_TOKEN_URL,
		iat: nowSeconds,
		exp: nowSeconds + 3600
	};

	const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const data = `${encodedHeader}.${encodedPayload}`;
	const signer = createSign('RSA-SHA256');
	signer.update(data);
	signer.end();
	const signature = signer.sign(privateKey).toString('base64url');
	return `${data}.${signature}`;
}

async function exchangeJwtForToken(jwtAssertion) {
	const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: jwtAssertion
		})
	});

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(
			payload?.error_description || payload?.error || 'Failed to authenticate to Google.'
		);
	}

	return cleanText(payload?.access_token);
}

export function workspaceConfigured() {
	return Boolean(buildWorkspaceConfig());
}

export function getDelegatedAdminEmail() {
	return buildWorkspaceConfig()?.delegatedAdminEmail || '';
}

async function callDirectoryApi(
	pathname,
	{ method = 'GET', query = null, body = null, scopes = [USER_SCOPE] } = {}
) {
	const config = buildWorkspaceConfig();
	if (!config) {
		throw new Error(
			'Google Workspace is not configured. Set GOOGLE_WORKSPACE_ADMIN_EMAIL and service account credentials.'
		);
	}

	const jwt = createSignedJwt({
		clientEmail: config.clientEmail,
		privateKey: config.privateKey,
		delegatedAdminEmail: config.delegatedAdminEmail,
		scopes
	});
	let accessToken;
	try {
		accessToken = await exchangeJwtForToken(jwt);
	} catch (error) {
		throw new Error(describeWorkspaceAuthError(error, config.clientId));
	}
	const url = new URL(`${DIRECTORY_API_BASE_URL}${pathname}`);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value == null || value === '') continue;
			url.searchParams.set(key, String(value));
		}
	}

	const response = await fetch(url.toString(), {
		method,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const apiError =
			normalizeErrorMessage(payload?.error?.message) ||
			normalizeErrorMessage(payload?.message) ||
			'Google Directory API request failed.';
		throw new Error(apiError);
	}
	return payload;
}

export async function listWorkspaceUsers({ query = '', pageToken = '', maxResults = 50 } = {}) {
	const config = buildWorkspaceConfig();
	const payload = await callDirectoryApi('/users', {
		query: {
			customer: config.customer,
			maxResults: Math.max(1, Math.min(Number(maxResults) || 50, 500)),
			orderBy: 'email',
			projection: 'full',
			query: cleanText(query) || undefined,
			pageToken: cleanText(pageToken) || undefined
		}
	});

	return {
		users: Array.isArray(payload?.users) ? payload.users : [],
		nextPageToken: cleanText(payload?.nextPageToken),
		etag: cleanText(payload?.etag)
	};
}

export async function listWorkspaceOrgUnits({ orgUnitPath = '/', type = 'ALL' } = {}) {
	const config = buildWorkspaceConfig();
	const payload = await callDirectoryApi(
		`/customer/${encodeURIComponent(config.customer)}/orgunits`,
		{
			scopes: [ORG_UNIT_SCOPE],
			query: {
				orgUnitPath: cleanText(orgUnitPath) || '/',
				type: cleanText(type) || 'ALL'
			}
		}
	);

	const orgUnits = Array.isArray(payload?.organizationUnits) ? payload.organizationUnits : [];
	return orgUnits
		.map((item) => ({
			name: cleanText(item?.name),
			orgUnitPath: cleanText(item?.orgUnitPath),
			description: cleanText(item?.description)
		}))
		.filter((item) => item.orgUnitPath);
}

export async function getWorkspaceUser(userKey) {
	return callDirectoryApi(`/users/${encodeURIComponent(cleanText(userKey))}`);
}

export async function createWorkspaceUser({
	primaryEmail,
	givenName,
	familyName,
	password,
	changePasswordAtNextLogin = true,
	orgUnitPath = '/'
}) {
	return callDirectoryApi('/users', {
		method: 'POST',
		body: {
			primaryEmail: cleanText(primaryEmail),
			name: {
				givenName: cleanText(givenName),
				familyName: cleanText(familyName)
			},
			password: exactText(password),
			changePasswordAtNextLogin: Boolean(changePasswordAtNextLogin),
			orgUnitPath: cleanText(orgUnitPath) || '/'
		}
	});
}

export async function updateWorkspaceUser(userKey, updates) {
	return callDirectoryApi(`/users/${encodeURIComponent(cleanText(userKey))}`, {
		method: 'PATCH',
		body: updates
	});
}

export async function deleteWorkspaceUser(userKey) {
	return callDirectoryApi(`/users/${encodeURIComponent(cleanText(userKey))}`, {
		method: 'DELETE'
	});
}

export async function setWorkspaceUserPassword(
	userKey,
	password,
	{ changePasswordAtNextLogin = true } = {}
) {
	return updateWorkspaceUser(userKey, {
		password: exactText(password),
		changePasswordAtNextLogin: Boolean(changePasswordAtNextLogin)
	});
}

export async function setWorkspaceUserSuspended(userKey, suspended) {
	return updateWorkspaceUser(userKey, {
		suspended: Boolean(suspended)
	});
}

export async function signOutWorkspaceUser(userKey) {
	return callDirectoryApi(`/users/${encodeURIComponent(cleanText(userKey))}/signOut`, {
		method: 'POST',
		scopes: [USER_SECURITY_SCOPE]
	});
}

export async function addWorkspaceUserAlias(userKey, alias) {
	return callDirectoryApi(`/users/${encodeURIComponent(cleanText(userKey))}/aliases`, {
		method: 'POST',
		scopes: [USER_ALIAS_SCOPE],
		body: { alias: cleanText(alias) }
	});
}

export async function deleteWorkspaceUserAlias(userKey, alias) {
	return callDirectoryApi(
		`/users/${encodeURIComponent(cleanText(userKey))}/aliases/${encodeURIComponent(cleanText(alias))}`,
		{
			method: 'DELETE',
			scopes: [USER_ALIAS_SCOPE]
		}
	);
}
