import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { normalizeDomain } from '$lib/server/vercelDomains';
import { enforceRateLimit, readRawBody, verifyWebhookRequest } from '$lib/server/security';

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function extractDomain(payload = {}) {
	const candidates = [
		payload?.domain,
		payload?.name,
		payload?.data?.domain,
		payload?.data?.name,
		payload?.payload?.domain,
		payload?.payload?.name
	];
	for (const candidate of candidates) {
		const normalized = normalizeDomain(candidate);
		if (normalized) return normalized;
	}
	return '';
}

export async function POST(event) {
	const { request } = event;
	const limited = enforceRateLimit(event, {
		name: 'vercel-webhook',
		limit: 120,
		windowMs: 60_000
	});
	if (limited) return limited;

	const webhookSecret = cleanText(env.VERCEL_WEBHOOK_SECRET);
	if (!webhookSecret) {
		console.error('VERCEL_WEBHOOK_SECRET is not configured.');
		return json({ error: 'Webhook authentication is not configured.' }, { status: 503 });
	}

	const rawResult = await readRawBody(request, { maxBytes: 256 * 1024 });
	if (!rawResult.ok) {
		return json({ error: rawResult.error }, { status: rawResult.status });
	}
	if (
		!verifyWebhookRequest(request, rawResult.value, webhookSecret, {
			directHeaders: ['x-vercel-webhook-secret'],
			signatureHeaders: ['x-vercel-signature', 'x-webhook-signature']
		})
	) {
		return json({ error: 'Unauthorized webhook request.' }, { status: 401 });
	}

	let body;
	try {
		body = rawResult.value ? JSON.parse(rawResult.value) : {};
	} catch {
		return json({ error: 'Invalid webhook payload.' }, { status: 400 });
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: 'Invalid webhook payload.' }, { status: 400 });
	}

	const eventType = cleanText(body?.type || body?.event || body?.name || 'unknown');
	const externalEventId = cleanText(body?.id || body?.eventId || body?.uid || '').slice(0, 200);
	const domain = extractDomain(body);
	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 500 });
	}

	let domainRow = null;
	if (domain) {
		const lookup = await serviceSupabase
			.from('group_site_domains')
			.select('*')
			.eq('domain', domain)
			.maybeSingle();
		if (lookup.error) {
			console.error('Unable to look up Vercel webhook domain', lookup.error);
			return json({ error: 'Unable to process webhook.' }, { status: 500 });
		}
		domainRow = lookup.data || null;
	}

	const nextStatus = (() => {
		const lowerType = eventType.toLowerCase();
		if (lowerType.includes('certificate') && lowerType.includes('ready')) return 'active';
		if (lowerType.includes('verification') && lowerType.includes('failed')) return 'failed';
		if (lowerType.includes('verification') && lowerType.includes('succeeded')) return 'active';
		if (lowerType.includes('provision') && lowerType.includes('failed')) return 'failed';
		return '';
	})();

	if (domainRow && nextStatus) {
		const update = await serviceSupabase
			.from('group_site_domains')
			.update({
				status: nextStatus,
				last_error: nextStatus === 'failed' ? eventType : null,
				updated_at: new Date().toISOString()
			})
			.eq('id', domainRow.id);
		if (update.error) {
			console.error('Unable to update domain from Vercel webhook', update.error);
			return json({ error: 'Unable to process webhook.' }, { status: 500 });
		}
	}

	const insert = await serviceSupabase.from('group_site_domain_events').insert({
		group_id: domainRow?.group_id || null,
		domain_id: domainRow?.id || null,
		provider: 'vercel',
		event_type: eventType || 'unknown',
		external_event_id: externalEventId || null,
		payload: body,
		processing_status: 'processed'
	});
	if (insert.error) {
		console.error('Unable to record Vercel webhook event', insert.error);
		return json({ error: 'Unable to process webhook.' }, { status: 500 });
	}

	return json({ ok: true });
}
