import { TURNSTILE_ENABLED } from '$env/static/private';

const FALSEY_VALUES = new Set(['0', 'false', 'no', 'off']);

export function isTurnstileEnabled() {
	if (typeof TURNSTILE_ENABLED !== 'string') return true;

	const normalized = TURNSTILE_ENABLED.trim().toLowerCase();
	if (!normalized) return true;

	return !FALSEY_VALUES.has(normalized);
}
