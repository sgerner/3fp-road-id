import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

const PRINTFUL_API_BASE_URL = 'https://api.printful.com';
const PRINTFUL_V2_BASE_URL = `${PRINTFUL_API_BASE_URL}/v2`;
const PRINTFUL_OAUTH_BASE_URL = 'https://www.printful.com';
const PRINTFUL_STATE_TTL_MS = 10 * 60 * 1000;

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	return maxLength > 0 ? cleaned.slice(0, maxLength) : cleaned;
}

function normalizePositiveInt(value) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toIsoFromUnix(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) return null;
	const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
	return new Date(millis).toISOString();
}

function toScopeList(value) {
	if (Array.isArray(value)) return value.map((entry) => cleanText(entry, 120)).filter(Boolean);
	const cleaned = cleanText(value, 4000);
	if (!cleaned) return [];
	return cleaned
		.split(/[\s,]+/)
		.map((entry) => cleanText(entry, 120))
		.filter(Boolean);
}

function getPrintfulClientId() {
	const clientId = cleanText(env.PRINTFUL_CLIENT_ID, 200);
	if (!clientId) throw new Error('PRINTFUL_CLIENT_ID is not configured.');
	return clientId;
}

function getPrintfulClientSecret() {
	const clientSecret = cleanText(env.PRINTFUL_CLIENT_SECRET, 400);
	if (!clientSecret) throw new Error('PRINTFUL_CLIENT_SECRET is not configured.');
	return clientSecret;
}

function getStateSecret() {
	return (
		cleanText(env.PRINTFUL_OAUTH_STATE_SECRET, 400) ||
		cleanText(env.PRINTFUL_CLIENT_SECRET, 400)
	);
}

function encodeBase64Url(input) {
	return Buffer.from(input)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

function decodeBase64Url(input) {
	const normalized = String(input || '')
		.replace(/-/g, '+')
		.replace(/_/g, '/');
	const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
	return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function signState(payload) {
	const secret = getStateSecret();
	if (!secret) throw new Error('PRINTFUL_OAUTH_STATE_SECRET is not configured.');
	return createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqualHex(a, b) {
	const left = cleanText(a, 256);
	const right = cleanText(b, 256);
	if (!left || !right || left.length !== right.length) return false;
	return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function extractPayloadData(payload) {
	if (payload?.data !== undefined) return payload.data;
	if (payload?.result !== undefined) return payload.result;
	return payload;
}

function normalizeResultList(payload) {
	const data = extractPayloadData(payload);
	if (Array.isArray(data)) return data;
	if (Array.isArray(payload?.data)) return payload.data;
	if (Array.isArray(payload?.result)) return payload.result;
	return [];
}

function resolveNextHref(payload) {
	const href =
		cleanText(payload?._links?.next?.href, 4000) ||
		cleanText(payload?.links?.next?.href, 4000) ||
		cleanText(payload?.paging?.next, 4000) ||
		cleanText(payload?.result?.paging?.next, 4000);
	if (!href) return '';
	if (href.startsWith(PRINTFUL_V2_BASE_URL)) return href.slice(PRINTFUL_V2_BASE_URL.length);
	if (href.startsWith(PRINTFUL_API_BASE_URL)) return href.slice(PRINTFUL_API_BASE_URL.length);
	return href;
}

function resolveErrorMessage(payload, status) {
	if (typeof payload?.error?.message === 'string' && payload.error.message) {
		return payload.error.message;
	}
	if (typeof payload?.message === 'string' && payload.message) return payload.message;
	if (typeof payload?.error === 'string' && payload.error) return payload.error;
	if (typeof payload?.result === 'string' && payload.result) return payload.result;
	if (Array.isArray(payload?.errors) && payload.errors.length) {
		return payload.errors
			.map((entry) => entry?.message || entry?.detail || JSON.stringify(entry))
			.filter(Boolean)
			.join('; ');
	}
	return `Printful API request failed (${status})`;
}

function normalizeTokenSet(payload) {
	return {
		accessToken: cleanText(payload?.access_token, 4000),
		refreshToken: cleanText(payload?.refresh_token, 4000),
		tokenType: cleanText(payload?.token_type, 40) || 'Bearer',
		scopes: toScopeList(payload?.scope || payload?.scopes),
		accessTokenExpiresAt: toIsoFromUnix(payload?.expires_at),
		refreshTokenExpiresAt: toIsoFromUnix(payload?.refresh_token_expires_at)
	};
}

async function sendPrintfulTokenRequest(params) {
	const clientId = getPrintfulClientId();
	const clientSecret = getPrintfulClientSecret();
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(params || {})) {
		const cleaned = cleanText(value, 4000);
		if (cleaned) body.set(key, cleaned);
	}
	body.set('client_id', clientId);
	body.set('client_secret', clientSecret);

	const response = await fetch(`${PRINTFUL_OAUTH_BASE_URL}/oauth/token`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: body.toString()
	});

	let payload = {};
	const raw = await response.text();
	if (raw) {
		try {
			payload = JSON.parse(raw);
		} catch {
			payload = { raw };
		}
	}

	if (!response.ok) {
		throw new Error(resolveErrorMessage(payload, response.status));
	}

	return normalizeTokenSet(payload);
}

export function createPrintfulStateToken({ type = 'main', slug = null, userId = null } = {}) {
	const payload = {
		v: 1,
		type: type === 'group' ? 'group' : 'main',
		slug: cleanText(slug, 120) || null,
		userId: cleanText(userId, 120) || null,
		expiresAt: Date.now() + PRINTFUL_STATE_TTL_MS
	};
	const encodedPayload = encodeBase64Url(JSON.stringify(payload));
	const signature = signState(encodedPayload);
	return `${encodedPayload}.${signature}`;
}

export function parsePrintfulStateToken(token) {
	const cleaned = cleanText(token, 4000);
	const [encodedPayload, signature] = cleaned.split('.');
	if (!encodedPayload || !signature) return null;
	const expectedSignature = signState(encodedPayload);
	if (!safeEqualHex(signature, expectedSignature)) return null;

	try {
		const parsed = JSON.parse(decodeBase64Url(encodedPayload));
		if (!parsed || parsed.v !== 1) return null;
		if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt < Date.now()) return null;
		return {
			type: parsed.type === 'group' ? 'group' : 'main',
			slug: cleanText(parsed.slug, 120) || null,
			userId: cleanText(parsed.userId, 120) || null,
			expiresAt: parsed.expiresAt
		};
	} catch {
		return null;
	}
}

export function buildPrintfulAuthorizeUrl({ redirectUrl, state } = {}) {
	const clientId = getPrintfulClientId();
	const cleanRedirectUrl = cleanText(redirectUrl, 2000);
	const cleanState = cleanText(state, 4000);
	if (!cleanRedirectUrl) throw new Error('Printful redirect URL is required.');
	if (!cleanState) throw new Error('Printful OAuth state is required.');

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_url: cleanRedirectUrl,
		response_type: 'code',
		state: cleanState
	});
	const scopes = cleanText(env.PRINTFUL_OAUTH_SCOPE, 2000);
	if (scopes) params.set('scope', scopes);
	return `${PRINTFUL_OAUTH_BASE_URL}/oauth/authorize?${params.toString()}`;
}

export async function exchangePrintfulAuthorizationCode({ code }) {
	const cleanCode = cleanText(code, 4000);
	if (!cleanCode) throw new Error('Missing Printful authorization code.');
	return sendPrintfulTokenRequest({
		grant_type: 'authorization_code',
		code: cleanCode
	});
}

export async function refreshPrintfulAccessToken({ refreshToken }) {
	const cleanRefreshToken = cleanText(refreshToken, 4000);
	if (!cleanRefreshToken) throw new Error('Missing Printful refresh token.');
	return sendPrintfulTokenRequest({
		grant_type: 'refresh_token',
		refresh_token: cleanRefreshToken
	});
}

export async function sendPrintfulRequest({
	path,
	method = 'GET',
	accessToken,
	body,
	storeId,
	headers = {}
} = {}) {
	const token = cleanText(accessToken, 4000);
	if (!token) throw new Error('Printful access token is required.');
	const targetPath = cleanText(path, 4000);
	if (!targetPath) throw new Error('Printful path is required.');

	const url = targetPath.startsWith('http')
		? targetPath
		: targetPath.startsWith('/v2/')
			? `${PRINTFUL_API_BASE_URL}${targetPath}`
			: targetPath.startsWith('/v2')
				? `${PRINTFUL_API_BASE_URL}${targetPath}`
				: targetPath.startsWith('/')
					? `${PRINTFUL_API_BASE_URL}${targetPath}`
					: `${PRINTFUL_API_BASE_URL}/${targetPath}`;

	const mergedHeaders = {
		Authorization: `Bearer ${token}`,
		Accept: 'application/json',
		...headers
	};
	if (body !== undefined) mergedHeaders['Content-Type'] = 'application/json';
	const cleanStoreId = cleanText(storeId, 80);
	if (cleanStoreId) mergedHeaders['X-PF-Store-Id'] = cleanStoreId;

	const response = await fetch(url, {
		method,
		headers: mergedHeaders,
		body: body === undefined ? undefined : JSON.stringify(body)
	});

	let payload = {};
	if (response.status !== 204) {
		const raw = await response.text();
		if (raw) {
			try {
				payload = JSON.parse(raw);
			} catch {
				payload = { raw };
			}
		}
	}

	return {
		ok: response.ok,
		status: response.status,
		payload,
		headers: response.headers
	};
}

export async function printfulFetchV2(path, { accessToken, method = 'GET', body, storeId } = {}) {
	const result = await sendPrintfulRequest({
		path: path.startsWith('/v2/') ? path : `/v2${path.startsWith('/') ? path : `/${path}`}`,
		method,
		accessToken,
		body,
		storeId
	});
	if (!result.ok) {
		throw new Error(resolveErrorMessage(result.payload, result.status));
	}
	return result.payload;
}

export async function listPrintfulStoresV2({ accessToken }) {
	const stores = [];
	let nextPath = '/stores?limit=100';
	while (nextPath) {
		const payload = await printfulFetchV2(nextPath, { accessToken });
		stores.push(...normalizeResultList(payload));
		nextPath = resolveNextHref(payload);
	}
	return stores;
}

export async function listPrintfulProductsV2({ accessToken, storeId }) {
	const products = [];
	let nextPath = '/products?limit=100';
	while (nextPath) {
		const payload = await printfulFetchV2(nextPath, { accessToken, storeId });
		products.push(...normalizeResultList(payload));
		nextPath = resolveNextHref(payload);
	}
	return products;
}

export async function listPrintfulProductVariantsV2({ accessToken, storeId, productId }) {
	const cleanProductId = normalizePositiveInt(productId) || cleanText(productId, 120);
	if (!cleanProductId) return [];
	const variants = [];
	let nextPath = `/products/${encodeURIComponent(cleanProductId)}/variants?limit=100`;
	while (nextPath) {
		const payload = await printfulFetchV2(nextPath, { accessToken, storeId });
		variants.push(...normalizeResultList(payload));
		nextPath = resolveNextHref(payload);
	}
	return variants;
}

export async function listPrintfulProductsWithVariantsV2({ accessToken, storeId }) {
	const products = await listPrintfulProductsV2({ accessToken, storeId });
	const results = [];
	for (const product of products) {
		const productId = normalizePositiveInt(product?.id) || cleanText(product?.id, 120);
		if (!productId) continue;
		const variants = await listPrintfulProductVariantsV2({ accessToken, storeId, productId });
		results.push({ ...product, variants });
	}
	return results;
}

export async function calculatePrintfulShippingRatesV2({ accessToken, storeId, recipient, orderItems }) {
	const payload = await printfulFetchV2('/shipping-rates', {
		accessToken,
		method: 'POST',
		storeId,
		body: {
			recipient,
			order_items: Array.isArray(orderItems) ? orderItems : []
		}
	});
	return normalizeResultList(payload);
}

export async function createPrintfulOrderV2({
	accessToken,
	storeId,
	externalId,
	recipient,
	orderItems,
	shippingMethodId
}) {
	const body = {
		external_id: cleanText(externalId, 255) || undefined,
		recipient,
		order_items: Array.isArray(orderItems) ? orderItems : [],
		status: 'draft'
	};
	if (cleanText(shippingMethodId, 120)) body.shipping = cleanText(shippingMethodId, 120);
	return printfulFetchV2('/orders', {
		accessToken,
		method: 'POST',
		storeId,
		body
	});
}
