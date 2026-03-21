async function safeJson(fetchPromise, fallback) {
	try {
		const response = await fetchPromise;
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			return fallback;
		}
		return payload?.data ?? fallback;
	} catch {
		return fallback;
	}
}

export const load = async ({ params, fetch }) => {
	const slug = params.slug;

	const [programData, applications, members, emailHistory] = await Promise.all([
		safeJson(fetch(`/api/groups/${slug}/membership/program?include_inactive=true`), null),
		safeJson(fetch(`/api/groups/${slug}/membership/applications`), []),
		safeJson(fetch(`/api/groups/${slug}/membership/members`), []),
		safeJson(fetch(`/api/groups/${slug}/membership/emails/history`), [])
	]);

	return {
		slug,
		program_data: programData,
		applications,
		members,
		email_history: emailHistory
	};
};
