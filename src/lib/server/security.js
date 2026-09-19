import { createHmac, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { json } from '@sveltejs/kit';
export { isSafeInternalPath } from '../security/navigation.js';

const rateLimitBuckets = new Map();
const MAX_RATE_LIMIT_BUCKETS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
let nextRateLimitSweepAt = 0;

function cleanText(value) {
	return value === null || value === undefined ? '' : String(value).trim();
}

function requestAddress(event) {
	try {
		const address = event?.getClientAddress?.();
		if (address) return cleanText(address).slice(0, 128);
	} catch {
		// Fall through to a shared bucket when the adapter cannot expose the
		// socket address. Forwarded headers are client-controlled on deployments
		// that do not explicitly strip them at the edge.
	}
	return 'unknown';
}

function evictExpiredRateLimitBuckets(now) {
	if (now >= nextRateLimitSweepAt) {
		nextRateLimitSweepAt = now + 30_000;
		for (const [key, bucket] of rateLimitBuckets) {
			if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
		}
	}
	while (rateLimitBuckets.size > MAX_RATE_LIMIT_BUCKETS) {
		const oldestKey = rateLimitBuckets.keys().next().value;
		if (oldestKey === undefined) break;
		rateLimitBuckets.delete(oldestKey);
	}
}

/**
 * Best-effort per-instance rate limiting for public endpoints. Production
 * deployments should also enforce a distributed limit at the edge, but this
 * prevents a single instance from being trivially exhausted.
 */
export function enforceRateLimit(
	event,
	{ name = 'request', limit = 30, windowMs = 60_000, key = '' } = {}
) {
	const now = Date.now();
	const identifier = `${name}:${key || requestAddress(event)}`;
	const current = rateLimitBuckets.get(identifier);
	const bucket =
		current && current.resetAt > now
			? current
			: { count: 0, resetAt: now + Math.max(1_000, windowMs) };
	bucket.count += 1;
	if (current) rateLimitBuckets.delete(identifier);
	rateLimitBuckets.set(identifier, bucket);
	evictExpiredRateLimitBuckets(now);

	if (bucket.count <= Math.max(1, limit)) return null;

	const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
	return json(
		{ error: 'Too many requests. Please try again later.' },
		{
			status: 429,
			headers: {
				'cache-control': 'no-store',
				'retry-after': String(retryAfter)
			}
		}
	);
}

async function readRequestBytes(request, maxBytes) {
	const declaredLength = Number(request?.headers?.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		return { ok: false, status: 413, error: 'Request body is too large.' };
	}

	const readerFactory = request?.body?.getReader;
	if (typeof readerFactory === 'function') {
		const reader = request.body.getReader();
		const chunks = [];
		let total = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const chunk = Buffer.from(value || []);
				total += chunk.byteLength;
				if (total > maxBytes) {
					await reader.cancel().catch(() => {});
					return { ok: false, status: 413, error: 'Request body is too large.' };
				}
				chunks.push(chunk);
			}
			return { ok: true, value: Buffer.concat(chunks, total) };
		} catch {
			return { ok: false, status: 400, error: 'Unable to read request body.' };
		} finally {
			reader.releaseLock?.();
		}
	}

	let buffer;
	try {
		buffer = Buffer.from(await request.arrayBuffer());
	} catch {
		return { ok: false, status: 400, error: 'Unable to read request body.' };
	}
	if (buffer.byteLength > maxBytes) {
		return { ok: false, status: 413, error: 'Request body is too large.' };
	}
	return { ok: true, value: buffer };
}

/** @returns {Promise<{ok: true, value: string} | {ok: false, status: number, error: string}>} */
export async function readRawBody(request, { maxBytes = 256 * 1024 } = {}) {
	const result = await readRequestBytes(request, maxBytes);
	if (!result.ok) return result;
	return { ok: true, value: result.value.toString('utf8') };
}

/** @returns {Promise<{ok: true, value: unknown} | {ok: false, status: number, error: string}>} */
export async function readJsonBody(request, { maxBytes = 256 * 1024 } = {}) {
	const result = await readRawBody(request, { maxBytes });
	if (!result.ok) return result;

	try {
		return { ok: true, value: result.value ? JSON.parse(result.value) : null };
	} catch {
		return { ok: false, status: 400, error: 'Invalid JSON request body.' };
	}
}

export async function readFormData(request, { maxBytes = 256 * 1024 } = {}) {
	const result = await readRequestBytes(request, maxBytes);
	if (!result.ok) return result;

	try {
		const headers = new Headers(request.headers);
		headers.delete('content-length');
		headers.delete('transfer-encoding');
		const boundedRequest = new Request(request.url, {
			method: request.method,
			headers,
			body: result.value
		});
		return { ok: true, value: await boundedRequest.formData() };
	} catch {
		return { ok: false, status: 400, error: 'Invalid form data.' };
	}
}

export function timingSafeStringEqual(left, right) {
	const a = Buffer.from(cleanText(left));
	const b = Buffer.from(cleanText(right));
	if (!a.length || a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

function normalizeSignatureCandidates(value) {
	const raw = cleanText(value);
	if (!raw) return [];
	const candidates = new Set([raw]);
	for (const token of raw.split(/[\s,]+/)) {
		const cleaned = token.replace(/^(?:sha256|v1)=/i, '').trim();
		if (cleaned) candidates.add(cleaned);
	}
	return [...candidates];
}

/**
 * Supports a direct bearer/secret header and HMAC-SHA256 signatures. The
 * latter allows a webhook provider to sign the exact raw request body.
 */
export function verifyWebhookRequest(
	request,
	rawBody,
	secret,
	{ directHeaders = [], signatureHeaders = [] } = {}
) {
	const configuredSecret = cleanText(secret);
	if (!configuredSecret) return false;

	const authorization = cleanText(request?.headers?.get('authorization'));
	const bearer = authorization.replace(/^Bearer\s+/i, '');
	if (bearer && timingSafeStringEqual(bearer, configuredSecret)) return true;

	for (const headerName of directHeaders) {
		const supplied = request?.headers?.get(headerName);
		if (supplied && timingSafeStringEqual(supplied, configuredSecret)) return true;
	}

	const body = typeof rawBody === 'string' ? rawBody : String(rawBody ?? '');
	const expected = createHmac('sha256', configuredSecret).update(body).digest();
	const expectedHex = expected.toString('hex');
	const expectedBase64 = expected.toString('base64');
	const expectedBase64Url = expected.toString('base64url');
	for (const headerName of signatureHeaders) {
		const supplied = request?.headers?.get(headerName);
		for (const candidate of normalizeSignatureCandidates(supplied)) {
			if (
				timingSafeStringEqual(candidate, expectedHex) ||
				timingSafeStringEqual(candidate, expectedBase64) ||
				timingSafeStringEqual(candidate, expectedBase64Url)
			) {
				return true;
			}
		}
	}

	return false;
}

function isPrivateIpv4(address) {
	const octets = address.split('.').map((value) => Number.parseInt(value, 10));
	if (
		octets.length !== 4 ||
		octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
	) {
		return true;
	}
	const [first, second] = octets;
	return (
		first === 0 ||
		first === 10 ||
		(first === 100 && second >= 64 && second <= 127) ||
		first === 127 ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 0 && octets[2] === 0) ||
		(first === 192 && second === 168) ||
		(first === 192 && second === 88 && octets[2] === 99) ||
		(first === 198 && second >= 18 && second <= 19) ||
		first >= 224
	);
}

function isPrivateIp(address) {
	const normalized = cleanText(address).toLowerCase();
	if (!normalized) return true;
	if (isIP(normalized) === 4) {
		return isPrivateIpv4(normalized);
	}
	if (isIP(normalized) === 6) {
		const mapped = normalized.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
		if (mapped) return isPrivateIpv4(mapped);
		const mappedHex = normalized.match(/^(.*)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
		if (mappedHex) {
			const prefix = mappedHex[1].split(':').filter(Boolean);
			if (prefix.length <= 5 && prefix.every((part) => /^0+$/.test(part))) {
				const high = Number.parseInt(mappedHex[2], 16);
				const low = Number.parseInt(mappedHex[3], 16);
				const mappedIpv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
				return isPrivateIpv4(mappedIpv4);
			}
		}
		const [firstGroup = '', secondGroup = ''] = normalized.split(':');
		const first = Number.parseInt(firstGroup, 16);
		const second = Number.parseInt(secondGroup || '0', 16);
		const isGlobalUnicastPrefix = first >= 0x2000 && first <= 0x3fff;
		const isSpecialUse =
			(first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) ||
			first === 0x2002 ||
			(first === 0x3fff && second <= 0x0fff);
		return (
			normalized === '::' ||
			normalized === '::1' ||
			!isGlobalUnicastPrefix ||
			isSpecialUse ||
			normalized.startsWith('fc') ||
			normalized.startsWith('fd') ||
			normalized.startsWith('fe8') ||
			normalized.startsWith('fe9') ||
			normalized.startsWith('fea') ||
			normalized.startsWith('feb')
		);
	}
	return true;
}

function hostnameIsBlocked(hostname) {
	const normalized = cleanText(hostname).toLowerCase().replace(/\.$/, '');
	return (
		!normalized ||
		normalized === 'localhost' ||
		normalized.endsWith('.localhost') ||
		normalized.endsWith('.local') ||
		normalized.endsWith('.internal') ||
		normalized.endsWith('.home.arpa')
	);
}

async function resolvePublicHttpTarget(value, { allowedHosts = null } = {}) {
	let parsed;
	try {
		parsed = new URL(String(value || ''));
	} catch {
		return null;
	}

	if (!['http:', 'https:'].includes(parsed.protocol)) return null;
	const expectedPort = parsed.protocol === 'https:' ? '443' : '80';
	if (parsed.username || parsed.password || (parsed.port && parsed.port !== expectedPort)) {
		return null;
	}
	const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
	if (hostnameIsBlocked(hostname)) return null;
	if (typeof allowedHosts === 'function' && !allowedHosts(hostname, parsed)) return null;
	if (Array.isArray(allowedHosts) && !allowedHosts.includes(hostname)) return null;

	const family = isIP(hostname);
	if (family && isPrivateIp(hostname)) return null;
	let addresses;
	try {
		addresses = family
			? [{ address: hostname, family }]
			: await lookup(hostname, { all: true, verbatim: true });
	} catch {
		return null;
	}
	if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) return null;
	return { url: parsed, hostname, addresses };
}

export async function isPublicHttpUrl(value, options = {}) {
	return Boolean(await resolvePublicHttpTarget(value, options));
}

function toNodeHeaders(input) {
	const headers = new Headers(input || {});
	for (const name of [
		'authorization',
		'connection',
		'content-length',
		'cookie',
		'cookie2',
		'host',
		'proxy-authorization',
		'transfer-encoding'
	]) {
		headers.delete(name);
	}
	return Object.fromEntries(headers.entries());
}

function requestPinnedPublicTarget(target, options, signal) {
	return new Promise((resolve, reject) => {
		const addressLookup = (_hostname, lookupOptions, callback) => {
			const family = Number(lookupOptions?.family) || 0;
			const matching = family
				? target.addresses.filter((entry) => entry.family === family)
				: target.addresses;
			if (!matching.length) {
				callback(new Error('No public address matches the requested IP family.'));
				return;
			}
			if (lookupOptions?.all) {
				callback(null, matching);
				return;
			}
			callback(null, matching[0].address, matching[0].family);
		};
		const method = String(options.method || 'GET').toUpperCase();
		const requestOptions = {
			method,
			headers: toNodeHeaders(options.headers),
			signal,
			lookup: addressLookup,
			...(target.url.protocol === 'https:' && isIP(target.hostname) === 0
				? { servername: target.hostname }
				: {})
		};
		const transport = target.url.protocol === 'https:' ? https : http;
		const request = transport.request(target.url, requestOptions, (upstream) => {
			const headers = new Headers();
			for (const [name, value] of Object.entries(upstream.headers)) {
				if (value === undefined || name === 'set-cookie') continue;
				headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
			}
			const status = Number(upstream.statusCode) || 502;
			const noBody = method === 'HEAD' || [204, 205, 304].includes(status);
			const body = noBody ? null : Readable.toWeb(upstream);
			try {
				resolve(
					new Response(body, {
						status,
						statusText: upstream.statusMessage,
						headers
					})
				);
			} catch (error) {
				upstream.destroy();
				reject(error);
			}
		});

		request.once('error', reject);
		const body = options.body;
		if (body === undefined || body === null) {
			request.end();
		} else if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
			request.end(body);
		} else if (body instanceof URLSearchParams) {
			request.end(body.toString());
		} else {
			request.destroy(new Error('Unsupported request body type.'));
		}
	});
}

function limitResponseBody(response, maxBytes, onDone) {
	if (!response.body) {
		onDone();
		return response;
	}
	const reader = response.body.getReader();
	let total = 0;
	let finished = false;
	const finish = () => {
		if (finished) return;
		finished = true;
		onDone();
	};
	const body = new ReadableStream({
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					controller.close();
					finish();
					return;
				}
				total += value.byteLength;
				if (total > maxBytes) {
					const error = new Error('Response body is too large.');
					await reader.cancel(error).catch(() => {});
					controller.error(error);
					finish();
					return;
				}
				controller.enqueue(value);
			} catch (error) {
				controller.error(error);
				finish();
			}
		},
		async cancel(reason) {
			try {
				await reader.cancel(reason);
			} finally {
				finish();
			}
		}
	});
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers
	});
}

export async function fetchPublicHttp(
	value,
	options = {},
	{
		timeoutMs = 8_000,
		maxRedirects = 3,
		maxResponseBytes = 16 * 1024 * 1024,
		allowedHosts = null
	} = {}
) {
	const controller = new AbortController();
	let timer;
	let cleaned = false;
	const cleanup = () => {
		if (cleaned) return;
		cleaned = true;
		if (timer) clearTimeout(timer);
		options.signal?.removeEventListener('abort', abortFromCaller);
	};
	const abortFromCaller = () => controller.abort(options.signal?.reason);
	if (options.signal?.aborted) return null;
	options.signal?.addEventListener('abort', abortFromCaller, { once: true });
	timer = setTimeout(
		() => {
			controller.abort(new Error('Request timed out.'));
			cleanup();
		},
		Math.max(1_000, timeoutMs)
	);
	let current = String(value || '');
	let responseBodyPending = false;
	try {
		for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
			if (controller.signal.aborted) return null;
			const target = await resolvePublicHttpTarget(current, { allowedHosts });
			if (!target || controller.signal.aborted) return null;
			const response = await requestPinnedPublicTarget(target, options, controller.signal);
			if (!REDIRECT_STATUSES.has(response.status)) {
				const responseLimit = Number.isFinite(Number(maxResponseBytes))
					? Math.min(64 * 1024 * 1024, Math.max(1024, Number(maxResponseBytes)))
					: 16 * 1024 * 1024;
				const limitedResponse = limitResponseBody(response, responseLimit, cleanup);
				responseBodyPending = Boolean(limitedResponse.body);
				return limitedResponse;
			}
			const location = response.headers.get('location');
			if (!location || attempt >= maxRedirects) {
				await response.body?.cancel().catch(() => {});
				return null;
			}
			await response.body?.cancel().catch(() => {});
			current = new URL(location, current).toString();
		}
	} catch {
		return null;
	} finally {
		if (!responseBodyPending) cleanup();
	}
	return null;
}

export async function readResponseBuffer(response, maxBytes, { timeoutMs = 15_000 } = {}) {
	if (!response?.ok) return null;
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;

	let reader = null;
	let timer = null;
	let timedOut = false;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(
			() => {
				timedOut = true;
				reader?.cancel().catch(() => {});
				reject(new Error('Response body timed out.'));
			},
			Math.max(1_000, timeoutMs)
		);
	});

	const readBody = async () => {
		if (!response.body?.getReader) {
			const buffer = Buffer.from(await response.arrayBuffer());
			return buffer.byteLength <= maxBytes ? buffer : null;
		}

		reader = response.body.getReader();
		const chunks = [];
		let total = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = Buffer.from(value);
			total += chunk.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				return null;
			}
			chunks.push(chunk);
		}
		return Buffer.concat(chunks, total);
	};

	try {
		return await Promise.race([readBody().catch(() => null), timeout]);
	} catch {
		return null;
	} finally {
		if (timer) clearTimeout(timer);
		if (timedOut) reader?.cancel().catch(() => {});
		reader?.releaseLock?.();
	}
}
