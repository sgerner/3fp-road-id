export const GET = async ({ url }) =>
	new Response(
		JSON.stringify({
			ok: true,
			service: '3fp-road-id',
			origin: url.origin,
			timestamp: new Date().toISOString()
		}),
		{
			status: 200,
			headers: {
				'content-type': 'application/json; charset=utf-8',
				'cache-control': 'no-store'
			}
		}
	);
