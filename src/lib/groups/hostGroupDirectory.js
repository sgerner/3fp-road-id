export const HOST_GROUP_STATUS = Object.freeze({
	MANAGED: 'managed',
	UNCLAIMED: 'unclaimed',
	EXTERNAL: 'external'
});

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function formatHostGroupLocation(group) {
	if (!group || typeof group !== 'object') return '';
	const cityState = [safeTrim(group.city), safeTrim(group.state_region)].filter(Boolean).join(', ');
	if (cityState) return cityState;
	return safeTrim(group.country);
}

export function getHostGroupStatus(group) {
	const raw = safeTrim(group?.status).toLowerCase();
	if (raw === HOST_GROUP_STATUS.MANAGED || group?.canManage === true) {
		return HOST_GROUP_STATUS.MANAGED;
	}
	if (raw === HOST_GROUP_STATUS.UNCLAIMED || group?.isClaimed === false) {
		return HOST_GROUP_STATUS.UNCLAIMED;
	}
	return HOST_GROUP_STATUS.EXTERNAL;
}

export function getHostGroupBadgeMeta(status) {
	const normalized = safeTrim(status).toLowerCase();
	if (normalized === HOST_GROUP_STATUS.MANAGED) {
		return {
			status: HOST_GROUP_STATUS.MANAGED,
			label: 'Managed',
			actionHint: 'Attaches directly',
			badgeClass: 'bg-success-500 text-surface-950'
		};
	}
	if (normalized === HOST_GROUP_STATUS.UNCLAIMED) {
		return {
			status: HOST_GROUP_STATUS.UNCLAIMED,
			label: 'Unclaimed',
			actionHint: 'Claim to host',
			badgeClass: 'bg-warning-500 text-surface-950'
		};
	}
	return {
		status: HOST_GROUP_STATUS.EXTERNAL,
		label: 'Requires approval',
		actionHint: 'Request sponsorship',
		badgeClass: 'bg-secondary-500 text-surface-50'
	};
}

function statusSortRank(status) {
	if (status === HOST_GROUP_STATUS.MANAGED) return 0;
	return 1;
}

export function filterHostGroups(groups = [], query = '', { limit = 60 } = {}) {
	const list = Array.isArray(groups) ? groups : [];
	const normalizedQuery = safeTrim(query).toLowerCase();
	const safeLimit = Math.max(1, Number(limit) || 60);

	if (!normalizedQuery) {
		const sorted = [...list].sort((a, b) => {
			const rankDiff =
				statusSortRank(getHostGroupStatus(a)) - statusSortRank(getHostGroupStatus(b));
			if (rankDiff !== 0) return rankDiff;
			return safeTrim(a?.name).localeCompare(safeTrim(b?.name));
		});
		return {
			items: sorted.slice(0, safeLimit),
			totalMatches: sorted.length,
			totalGroups: list.length
		};
	}

	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const scored = [];

	for (const group of list) {
		const name = safeTrim(group?.name);
		const nameLower = name.toLowerCase();
		const slugLower = safeTrim(group?.slug).toLowerCase();
		const locationLower = formatHostGroupLocation(group).toLowerCase();
		const haystack = `${nameLower} ${slugLower} ${locationLower}`;

		if (!tokens.every((token) => haystack.includes(token))) {
			continue;
		}

		let matchScore = 2;
		if (nameLower === normalizedQuery || slugLower === normalizedQuery) {
			matchScore = 0;
		} else if (nameLower.startsWith(normalizedQuery)) {
			matchScore = 1;
		}

		scored.push({
			group,
			matchScore,
			statusRank: statusSortRank(getHostGroupStatus(group)),
			name
		});
	}

	scored.sort((a, b) => {
		if (a.matchScore !== b.matchScore) return a.matchScore - b.matchScore;
		if (a.statusRank !== b.statusRank) return a.statusRank - b.statusRank;
		return a.name.localeCompare(b.name);
	});

	return {
		items: scored.slice(0, safeLimit).map((entry) => entry.group),
		totalMatches: scored.length,
		totalGroups: list.length
	};
}
