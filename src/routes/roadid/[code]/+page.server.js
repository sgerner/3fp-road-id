export async function load({ params, fetch, cookies }) {
	// Ensure SvelteKit forwards the verified session cookie to the internal lookup endpoint on SSR.
	cookies.get('sb_session');

	const { code } = params;
	const response = await fetch(`/api/v1/code/${encodeURIComponent(code)}`);
	const res = await response.json().catch(() => ({ error: 'Profile not found.' }));

	if (!response.ok || res?.error) {
		return { notFound: true, code };
	}

	return { qrData: res, code };
}
