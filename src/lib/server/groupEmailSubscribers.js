const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, limit = 320) {
	return String(value ?? '')
		.trim()
		.slice(0, limit);
}

export function normalizeGroupEmailSignup(payload = {}) {
	if (clean(payload.company, 200)) return { ok: true, honeypot: true };
	if (payload.consent !== true) {
		return { ok: false, error: 'Please agree to receive emails from this group.' };
	}
	const email = clean(payload.email).toLowerCase();
	if (!EMAIL_PATTERN.test(email)) {
		return { ok: false, error: 'Enter a valid email address.' };
	}
	return {
		ok: true,
		honeypot: false,
		email,
		firstName: clean(payload.first_name, 120)
	};
}
