import { createHmac, timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import { PUBLIC_STRIPE_PUBLISHABLE_KEY, PUBLIC_URL_BASE } from '$env/static/public';

const CONNECT_STATE_TTL_MS = 10 * 60 * 1000;

let stripeClient = null;

function cleanBaseUrl(value) {
	if (!value) return '';
	return String(value).trim().replace(/\/+$/, '');
}

function getConnectStateSecret() {
	return env.STRIPE_CONNECT_STATE_SECRET || env.STRIPE_SECRET_KEY || '';
}

export function getStripeClient() {
	if (stripeClient) return stripeClient;
	const secretKey = env.STRIPE_SECRET_KEY;
	if (!secretKey) {
		throw new Error('STRIPE_SECRET_KEY is not configured.');
	}
	stripeClient = new Stripe(secretKey);
	return stripeClient;
}

export function getStripeConnectClientId() {
	const clientId = env.STRIPE_CONNECT_CLIENT_ID;
	if (!clientId) {
		throw new Error('STRIPE_CONNECT_CLIENT_ID is not configured.');
	}
	return clientId;
}

export function getStripePublishableKey() {
	const publishableKey = (PUBLIC_STRIPE_PUBLISHABLE_KEY || '').trim();
	if (!publishableKey) {
		throw new Error('PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured.');
	}
	return publishableKey;
}

export function resolvePublicBaseUrl(url) {
	const configured = cleanBaseUrl(PUBLIC_URL_BASE);
	if (configured) return configured;
	if (url?.origin) return cleanBaseUrl(url.origin);
	return '';
}

export function createSignedConnectState(payload = {}) {
	const secret = getConnectStateSecret();
	if (!secret) {
		throw new Error('STRIPE_CONNECT_STATE_SECRET (or STRIPE_SECRET_KEY) is not configured.');
	}

	const now = Date.now();
	const body = {
		...payload,
		iat: now,
		exp: now + CONNECT_STATE_TTL_MS
	};

	const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
	const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
	return `${encoded}.${signature}`;
}

export function verifySignedConnectState(stateToken) {
	if (!stateToken || typeof stateToken !== 'string') return null;
	const [encoded, receivedSignature] = stateToken.split('.');
	if (!encoded || !receivedSignature) return null;

	const secret = getConnectStateSecret();
	if (!secret) return null;

	const expectedSignature = createHmac('sha256', secret).update(encoded).digest('base64url');
	const received = Buffer.from(receivedSignature);
	const expected = Buffer.from(expectedSignature);
	if (received.length !== expected.length) return null;
	if (!timingSafeEqual(received, expected)) return null;

	let parsed = null;
	try {
		parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
	} catch {
		return null;
	}

	if (!parsed?.exp || parsed.exp < Date.now()) return null;
	return parsed;
}
