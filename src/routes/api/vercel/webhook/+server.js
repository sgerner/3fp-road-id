import { json } from '@sveltejs/kit';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { normalizeDomain } from '$lib/server/vercelDomains';

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

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const eventType = cleanText(body?.type || body?.event || body?.name || 'unknown');
	const externalEventId = cleanText(body?.id || body?.eventId || body?.uid || '');
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
		await serviceSupabase
			.from('group_site_domains')
			.update({
				status: nextStatus,
				last_error: nextStatus === 'failed' ? eventType : null,
				updated_at: new Date().toISOString()
			})
			.eq('id', domainRow.id);
	}

	await serviceSupabase
		.from('group_site_domain_events')
		.insert({
			group_id: domainRow?.group_id || null,
			domain_id: domainRow?.id || null,
			provider: 'vercel',
			event_type: eventType || 'unknown',
			external_event_id: externalEventId || null,
			payload: body,
			processing_status: 'processed'
		})
		.catch(() => null);

	return json({ ok: true });
}
