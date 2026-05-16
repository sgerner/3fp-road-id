function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function normalizeDomainLike(value) {
	return cleanText(value).toLowerCase().replace(/\.+$/, '');
}

export function domainMatchesManagedZone(domain, managedDomain) {
	const normalizedDomain = normalizeDomainLike(domain);
	const normalizedManagedDomain = normalizeDomainLike(managedDomain);
	if (!normalizedDomain || !normalizedManagedDomain) return false;
	return (
		normalizedDomain === normalizedManagedDomain ||
		normalizedDomain.endsWith(`.${normalizedManagedDomain}`)
	);
}

export function resolveSenderSelection(rows = [], preferredDomainId = null) {
	const list = Array.isArray(rows) ? rows : [];
	const preferredId = cleanText(preferredDomainId);
	const verifiedRows = list.filter((row) => row?.ses_verified_for_sending === true);

	if (preferredId) {
		const preferred = list.find((row) => cleanText(row?.id) === preferredId) || null;
		if (!preferred) {
			return {
				status: 'missing',
				selected: null,
				preferred: null
			};
		}
		if (preferred.ses_verified_for_sending === true) {
			return {
				status: 'verified',
				selected: preferred,
				preferred
			};
		}
		return {
			status: 'unverified',
			selected: null,
			preferred
		};
	}

	const selected = verifiedRows.find((row) => row?.is_default) || verifiedRows[0] || null;
	return {
		status: selected ? 'verified' : 'none',
		selected,
		preferred: null
	};
}

export function shouldAutoUpdateExistingDnsRecord(record, existingRecord) {
	if (!existingRecord) return false;
	return record?.required !== false;
}
