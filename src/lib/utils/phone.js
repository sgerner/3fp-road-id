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
	// Ensure we only have digits (in case it’s not already stripped)
	let digits = normalizePhoneNumber(phone);

	// If we have fewer than 10 digits, we could return it as-is or handle accordingly
	if (digits.length < 10) {
		return digits;
	}

	// Slice the parts we need
	const areaCode = digits.slice(0, 3);
	const firstPart = digits.slice(3, 6);
	const secondPart = digits.slice(6, 10);

	// Construct the formatted string
	return `(${areaCode}) ${firstPart}-${secondPart}`;
}
