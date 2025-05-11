// src/routes/[code]/+page.js
export async function load({ params, fetch }) {
	const { code } = params;
	const response = await fetch(`/api/v1/code/${code}`);
	const res = await response.json();

	// If the code isn't found, return a flag for the page to render a message.
	if (res.error) {
		return { notFound: true, code };
	}

	return { qrData: res, code: code };
}
