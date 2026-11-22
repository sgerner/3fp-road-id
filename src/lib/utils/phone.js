export function normalizePhoneNumber(phone) {
	// Handle null/undefined or non-string inputs
	if (!phone || typeof phone !== 'string') {
		return '';
	}

	// Remove everything that's not a digit
	return phone.replace(/\D/g, '');
}

/**
 * Normalize a phone number to the E.164 format accepted by SMS providers.
 * The application currently collects North American numbers, while retaining
 * support for already-qualified international numbers.
 */
export function normalizeE164PhoneNumber(phone, defaultCountryCode = '+1') {
	const raw = phone === null || phone === undefined ? '' : String(phone).trim();
	if (!raw) return '';

	const digits = raw.replace(/\D/g, '');
	if (raw.startsWith('+')) {
		if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return '';
		return `+${digits}`;
	}

	if (defaultCountryCode === '+1' && digits.length === 10) return `+1${digits}`;
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
	return '';
}

export function formatPhoneNumber(phone) {
	if (!phone || typeof phone !== 'string') {
		return '';
	}
	const trimmed = phone.trim();
	const digits = normalizePhoneNumber(trimmed);

	if (digits.length === 11 && digits.startsWith('1')) {
		const usDigits = digits.slice(1);
		return `(${usDigits.slice(0, 3)}) ${usDigits.slice(3, 6)}-${usDigits.slice(6, 10)}`;
	}

	if (trimmed.startsWith('+') && digits.length !== 10) {
		return `+${digits}`;
	}

	if (digits.length < 10) {
		return digits;
	}

	if (digits.length > 10) {
		return trimmed;
	}

	const areaCode = digits.slice(0, 3);
	const firstPart = digits.slice(3, 6);
	const secondPart = digits.slice(6, 10);

	return `(${areaCode}) ${firstPart}-${secondPart}`;
}
