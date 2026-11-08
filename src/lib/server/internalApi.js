function buildQuery(params) {
	const search = new URLSearchParams();
	if (params && typeof params === 'object') {
		for (const [key, value] of Object.entries(params)) {
			if (value === null || value === undefined) continue;
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item === null || item === undefined) continue;
					search.append(key, String(item));
				}
				continue;
			}
			search.set(key, String(value));
		}
	}
	const qs = search.toString();
	return qs ? `?${qs}` : '';
}

export async function callApi(fetchImpl, resource, params) {
	const qs = buildQuery(params);
	const response = await fetchImpl(`/api/v1/${resource}${qs}`);
	const text = await response.text();
	let payload = null;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = text;
		}
	}
	if (!response.ok) {
		const message = payload?.error || payload?.message || `Failed to load ${resource}`;
		const apiError = new Error(message);
		apiError.status = response.status;
		apiError.payload = payload;
		throw apiError;
	}
	return payload ?? {};
}

export async function fetchSingle(fetchImpl, resource, params) {
	try {
		const payload = await callApi(fetchImpl, resource, params);
		return payload?.data ?? payload ?? null;
	} catch (err) {
		if (err?.status === 404) return null;
		throw err;
	}
}

export async function fetchList(fetchImpl, resource, params) {
	try {
		const payload = await callApi(fetchImpl, resource, params);
		const data = payload?.data ?? payload;
		if (Array.isArray(data)) return data;
		if (data === null || data === undefined) return [];
		return [data];
	} catch (err) {
		if (err?.status === 403 || err?.status === 404) return [];
		throw err;
	}
}
