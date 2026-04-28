const spec = {
	openapi: '3.1.0',
	info: {
		title: '3 Feet Please API',
		version: '1.0.0',
		description: 'Public discovery and utility endpoints for 3 Feet Please.'
	},
	servers: [{ url: '/' }],
	paths: {
		'/api/health': {
			get: {
				summary: 'Health check',
				responses: {
					'200': {
						description: 'Service is healthy'
					}
				}
			}
		},
		'/api/v1/groups/check-slug': {
			get: {
				summary: 'Check whether a group slug is available',
				responses: {
					'200': {
						description: 'Availability result'
					}
				}
			}
		},
		'/api/v1/groups/check-microsite-slug': {
			get: {
				summary: 'Check whether a microsite slug is available',
				responses: {
					'200': {
						description: 'Availability result'
					}
				}
			}
		},
		'/api/timezone': {
			get: {
				summary: 'Resolve a timezone from coordinates or region input',
				responses: {
					'200': {
						description: 'Timezone result'
					}
				}
			}
		},
		'/api/geocode': {
			get: {
				summary: 'Geocode a location',
				responses: {
					'200': {
						description: 'Geocoding result'
					}
				}
			}
		}
	}
};

export const GET = async () =>
	new Response(JSON.stringify(spec, null, 2), {
		status: 200,
		headers: {
			'content-type': 'application/vnd.oai.openapi+json; charset=utf-8',
			'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
		}
	});
