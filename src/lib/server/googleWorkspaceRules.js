export function cleanText(value) {
	if (value == null) return '';
	return String(value).trim();
}

export function exactText(value) {
	if (value == null) return '';
	return String(value);
}

export function normalizeWorkspaceAliases(aliases) {
	if (!Array.isArray(aliases)) return [];
	return aliases
		.map((alias) => (typeof alias === 'string' ? cleanText(alias) : cleanText(alias?.alias)))
		.filter(Boolean);
}

export function expectedConfirmation(action, target) {
	return `${action} ${target}`;
}

export function confirmationMatches(value, action, target) {
	return cleanText(value) === expectedConfirmation(action, target);
}

export function sameEmail(left, right) {
	return cleanText(left).toLowerCase() === cleanText(right).toLowerCase();
}
