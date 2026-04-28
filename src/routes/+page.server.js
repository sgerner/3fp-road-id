export const load = async ({ fetch, setHeaders, url }) => {
	setHeaders({
		'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
		link: [
			`<${url.origin}/.well-known/api-catalog>; rel="api-catalog"`,
			`<${url.origin}/api>; rel="service-doc"`,
			`<${url.origin}/api/openapi.json>; rel="describedby"; type="application/vnd.oai.openapi+json"`,
			`<${url.origin}/api/health>; rel="status"`
		].join(', ')
	});

	const cols = [
		'id',
		'slug',
		'name',
		'tagline',
		'city',
		'state_region',
		'country',
		'logo_url',
		'cover_photo_url'
	];
	const resp = await fetch(
		`/api/v1/groups?select=${cols.join(
			','
		)}&cover_photo_url=not.is.null&logo_url=not.is.null&limit=64`
	);

	if (!resp.ok) {
		return { highlights: [], error: 'Failed to load groups' };
	}

	const { data, error } = await resp.json();

	const rows = Array.isArray(data) ? data.slice() : [];
	// Fisher-Yates shuffle
	for (let i = rows.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[rows[i], rows[j]] = [rows[j], rows[i]];
	}
	const highlights = rows.slice(0, 2);

	return { highlights, error: error?.message || null };
};
