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

export function normalizeErrorMessage(value, fallback = '') {
	if (Array.isArray(value)) {
		return (
			value
				.map((item) => normalizeErrorMessage(item, ''))
				.filter(Boolean)
				.join(' ')
				.trim() || fallback
		);
	}

	if (value && typeof value === 'object') {
		if (typeof value.message === 'string' || Array.isArray(value.message)) {
			return normalizeErrorMessage(value.message, fallback);
		}
		if (typeof value.reason === 'string' || Array.isArray(value.reason)) {
			return normalizeErrorMessage(value.reason, fallback);
		}
		if (typeof value.error === 'string' || Array.isArray(value.error)) {
			return normalizeErrorMessage(value.error, fallback);
		}
		return fallback;
	}

	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return fallback;
	}

	const message = cleanText(value);
	return message || fallback;
}

export function describeWorkspaceAuthError(error, clientId = '') {
	const message = cleanText(error?.message || error);
	if (!message) return 'Google authentication failed.';

	if (message.includes('unauthorized_client')) {
		return clientId
			? `Google rejected domain-wide delegation for service account client ID ${clientId}. In Google Admin console, authorize that client ID under Security > API controls > Domain-wide delegation and add the required Workspace Directory scopes.`
			: 'Google rejected domain-wide delegation. Authorize the service account client ID under Security > API controls > Domain-wide delegation and add the required Workspace Directory scopes.';
	}

	if (message.includes('invalid_grant')) {
		return 'Google rejected the JWT/private key exchange. Verify the service account JSON, private key, delegated admin email, and server clock.';
	}

	return message;
}
