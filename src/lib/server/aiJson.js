export function safeParseJson(text) {
	if (!text) return null;
	const first = text.indexOf('{');
	const last = text.lastIndexOf('}');
	if (first === -1 || last === -1 || last <= first) return null;
	try {
		return JSON.parse(text.slice(first, last + 1));
	} catch {
		return null;
	}
}

export function isSchemaUnsupportedError(error) {
	if (!error) return false;
	const raw = error?.message;
	if (typeof raw !== 'string') return false;
	try {
		const parsed = JSON.parse(raw);
		const message = parsed?.error?.message || '';
		return /response_schema/i.test(message) || /Invalid JSON payload/i.test(message);
	} catch {
		return /response_schema/i.test(raw) || /Invalid JSON payload/i.test(raw);
	}
}
