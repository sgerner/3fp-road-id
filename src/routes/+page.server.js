import { createRequestSupabaseClient } from '#lib/server/supabaseClient';
import { loadHomepageDiscoveryData } from '#lib/server/proximity';
import { resolveVisitorLocation } from '#lib/server/visitorLocation';

export const load = async (event) => {
	const { locals, setHeaders, url } = event;
	const visitorLocation =
		locals?.visitorLocation !== undefined
			? locals.visitorLocation
			: await resolveVisitorLocation(event);

	// This response varies by coarse request-region headers or profile preferences.
	// Do not cache a visitor's local feed.
	setHeaders({
		'cache-control': 'private, no-store',
		link: [
			`<${url.origin}/.well-known/api-catalog>; rel="api-catalog"`,
			`<${url.origin}/api>; rel="service-doc"`,
			`<${url.origin}/api/openapi.json>; rel="describedby"; type="application/vnd.oai.openapi+json"`,
			`<${url.origin}/api/health>; rel="status"`
		].join(', ')
	});

	const supabase = createRequestSupabaseClient(null);
	return loadHomepageDiscoveryData({
		supabase,
		visitorLocation,
		siteOrigin: url.origin
	});
};
