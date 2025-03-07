export function normalizePhoneNumber(phone) {
	// Handle null/undefined or non-string inputs
	if (!phone || typeof phone !== 'string') {
		return '';
	}

	// Remove everything that's not a digit
	return phone.replace(/\D/g, '');
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
