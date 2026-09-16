import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { timingSafeStringEqual } from '$lib/server/security';

const OWNER_INVITE_TTL_MS = 15 * 60 * 1000;
const MAX_TOKEN_LENGTH = 4_096;

function getInviteSecret() {
	return String(env.OWNER_INVITE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function encode(value) {
	return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value) {
	try {
		return Buffer.from(value, 'base64url').toString('utf8');
	} catch {
		return null;
	}
}

function sign(payload, secret) {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

function normalizeEmail(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Create a short-lived, signed capability for a specific group and invited
 * email address. The capability is minted only after the current requester
 * has been authorized as a group manager.
 */
export function createOwnerInviteState({
	groupId,
	groupSlug,
	invitedEmail,
	inviterUserId,
	now = Date.now()
}) {
	const secret = getInviteSecret();
	if (!secret) throw new Error('OWNER_INVITE_SECRET is not configured.');

	const payload = encode(
		JSON.stringify({
			groupId: String(groupId || ''),
			groupSlug: String(groupSlug || ''),
			invitedEmail: normalizeEmail(invitedEmail),
			inviterUserId: String(inviterUserId || ''),
			iat: Math.floor(now / 1000),
			exp: Math.floor((now + OWNER_INVITE_TTL_MS) / 1000)
		})
	);
	return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verify the capability and bind it to the route's group and the canonical
 * email returned by Supabase Auth. No browser-supplied user id is accepted.
 */
export function verifyOwnerInviteState(
	token,
	{ groupId, groupSlug, userEmail, now = Date.now() } = {}
) {
	const secret = getInviteSecret();
	if (!secret || typeof token !== 'string' || token.length < 3 || token.length > MAX_TOKEN_LENGTH) {
		return { ok: false };
	}

	const separator = token.lastIndexOf('.');
	if (separator <= 0 || separator === token.length - 1) return { ok: false };
	const encodedPayload = token.slice(0, separator);
	const suppliedSignature = token.slice(separator + 1);
	const expectedSignature = sign(encodedPayload, secret);
	if (!timingSafeStringEqual(suppliedSignature, expectedSignature)) return { ok: false };

	const rawPayload = decode(encodedPayload);
	if (!rawPayload || rawPayload.length > 3_000) return { ok: false };

	let payload;
	try {
		payload = JSON.parse(rawPayload);
	} catch {
		return { ok: false };
	}

	const nowSeconds = Math.floor(now / 1000);
	const issuedAt = Number(payload?.iat);
	const expiresAt = Number(payload?.exp);
	const expectedEmail = normalizeEmail(userEmail);
	if (
		!payload ||
		typeof payload.groupId !== 'string' ||
		typeof payload.groupSlug !== 'string' ||
		typeof payload.invitedEmail !== 'string' ||
		typeof payload.inviterUserId !== 'string' ||
		!payload.groupId ||
		!payload.groupSlug ||
		!payload.invitedEmail ||
		!payload.inviterUserId ||
		!Number.isSafeInteger(issuedAt) ||
		!Number.isSafeInteger(expiresAt) ||
		expiresAt <= nowSeconds ||
		issuedAt > nowSeconds + 60 ||
		expiresAt - issuedAt > Math.ceil(OWNER_INVITE_TTL_MS / 1000) + 60 ||
		payload.groupId !== String(groupId || '') ||
		payload.groupSlug !== String(groupSlug || '') ||
		!expectedEmail ||
		!timingSafeStringEqual(payload.invitedEmail, expectedEmail)
	) {
		return { ok: false };
	}

	return { ok: true, payload };
}

export { OWNER_INVITE_TTL_MS };
