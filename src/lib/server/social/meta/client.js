import { env } from '$env/dynamic/private';
import { normalizeMetaError } from '$lib/server/social/meta/normalize';

const DEFAULT_META_GRAPH_VERSION = 'v21.0';
const FACEBOOK_GRAPH_HOST = 'https://graph.facebook.com';
const INSTAGRAM_GRAPH_HOST = 'https://graph.instagram.com';
const META_API_TIMEOUT_MS = 30_000;

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function buildGraphBaseUrl() {
	const version = cleanText(env.META_GRAPH_API_VERSION, 32) || DEFAULT_META_GRAPH_VERSION;
	return `${FACEBOOK_GRAPH_HOST}/${version}`;
}

function buildInstagramGraphBaseUrl() {
	const version = cleanText(env.META_GRAPH_API_VERSION, 32) || DEFAULT_META_GRAPH_VERSION;
	return `${INSTAGRAM_GRAPH_HOST}/${version}`;
}

function normalizePath(path) {
	const cleaned = cleanText(path, 1000);
	if (!cleaned) return '';
	return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

function parsePayload(text) {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return { raw: text };
	}
}

export async function callMetaApi({
	path,
	method = 'GET',
	accessToken,
	query = {},
	body = null,
	timeoutMs = META_API_TIMEOUT_MS
} = {}) {
	return callGraphApi({
		baseUrl: buildGraphBaseUrl(),
		path,
		method,
		accessToken,
		query,
		body,
		timeoutMs
	});
}

export async function callInstagramApi({
	path,
	method = 'GET',
	accessToken,
	query = {},
	body = null,
	timeoutMs = META_API_TIMEOUT_MS
} = {}) {
	return callGraphApi({
		baseUrl: buildInstagramGraphBaseUrl(),
		path,
		method,
		accessToken,
		query,
		body,
		timeoutMs
	});
}

async function callGraphApi({
	baseUrl,
	path,
	method = 'GET',
	accessToken,
	query = {},
	body = null,
	timeoutMs = META_API_TIMEOUT_MS
} = {}) {
	const token = cleanText(accessToken, 5000);
	if (!token) throw new Error('Meta access token is required.');
	const normalizedPath = normalizePath(path);
	if (!normalizedPath) throw new Error('Meta API path is required.');

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query || {})) {
		if (value === null || value === undefined) continue;
		params.set(key, String(value));
	}
	params.set('access_token', token);

	const url = `${baseUrl}${normalizedPath}?${params.toString()}`;
	const response = await fetch(url, {
		method,
		headers: {
			Accept: 'application/json',
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(timeoutMs)
	});

	const raw = await response.text();
	const payload = parsePayload(raw);
	if (!response.ok) {
		const error = new Error(
			normalizeMetaError(payload, `Meta API request failed (${response.status}).`)
		);
		error.status = response.status;
		error.payload = payload;
		throw error;
	}

	return payload;
}

export function requireMetaAppCredentials() {
	const appId = cleanText(env.META_APP_ID, 200);
	const appSecret = cleanText(env.META_APP_SECRET, 400);
	if (!appId || !appSecret) {
		throw new Error('META_APP_ID and META_APP_SECRET must be configured.');
	}
	return { appId, appSecret };
}
