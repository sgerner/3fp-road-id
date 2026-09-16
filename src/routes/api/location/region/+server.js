import { json } from '@sveltejs/kit';
import { normalizeUsStateCode } from '$lib/geo/usStates';
import { enforceRateLimit } from '$lib/server/security';

const COUNTRY_HEADERS = ['x-vercel-ip-country', 'cf-ipcountry', 'x-country-code'];
const REGION_HEADERS = ['x-vercel-ip-country-region', 'cf-region-code', 'x-region-code'];

function readHeader(request, keys = []) {
	for (const key of keys) {
		const value = request.headers.get(key);
		if (value) return value.trim();
	}
	return '';
}

async function lookupRegionByIp(ipAddress, fetchImpl) {
	const url = new URL(
		ipAddress ? `https://ipapi.co/${encodeURIComponent(ipAddress)}/json/` : 'https://ipapi.co/json/'
	);
	const response = await fetchImpl(url, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(2500)
	});
	if (!response.ok) return null;
	const payload = await response.json().catch(() => null);
	if (!payload || typeof payload !== 'object') return null;
	return {
		country: String(payload.country_code || '').toUpperCase(),
		region: normalizeUsStateCode(payload.region_code || payload.region || '')
	};
}

export async function GET(event) {
	const { request, fetch } = event;
	const limited = enforceRateLimit(event, {
		name: 'location-region',
		limit: 30,
		windowMs: 10 * 60 * 1000
	});
	if (limited) return limited;

	const headerCountry = readHeader(request, COUNTRY_HEADERS).toUpperCase();
	const headerRegion = normalizeUsStateCode(readHeader(request, REGION_HEADERS));

	if ((!headerCountry || headerCountry === 'US') && headerRegion) {
		return json({ stateCode: headerRegion, source: 'request_header' });
	}

	try {
		let ip = '';
		try {
			ip = event.getClientAddress?.() || '';
		} catch {
			ip = '';
		}
		const ipResult = await lookupRegionByIp(ip, fetch);
		if (ipResult?.region && (!ipResult.country || ipResult.country === 'US')) {
			return json({ stateCode: ipResult.region, source: 'ip_lookup' });
		}
	} catch {
		// Best effort only.
	}

	return json({ stateCode: null, source: null });
}
