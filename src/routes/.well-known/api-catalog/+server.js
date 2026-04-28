export const GET = async ({ url }) => {
	const origin = url.origin;
	const payload = {
		linkset: [
			{
				anchor: `${origin}/api`,
				item: [
					{
						href: `${origin}/api/openapi.json`,
						rel: ['service-desc'],
						type: 'application/vnd.oai.openapi+json',
						title: 'OpenAPI specification'
					},
					{
						href: `${origin}/api`,
						rel: ['service-doc'],
						type: 'text/html',
						title: 'API documentation'
					},
					{
						href: `${origin}/api/health`,
						rel: ['status'],
						type: 'application/json',
						title: 'Health check'
					}
				]
			}
		]
	};

	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			'content-type': 'application/linkset+json; charset=utf-8',
			'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
		}
	});
};
