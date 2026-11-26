const EVENT_HOST_TABLES = new Set(['volunteer_events', 'activity_events']);

export const UNAUTHORIZED_HOST_GROUP_MESSAGE =
	'You do not have permission to host an event under that organization. Choose an organization you manage, claim an unclaimed organization, or save under personal hosting and request sponsorship.';

export const INSUFFICIENT_PRIVILEGE_MESSAGE = 'You do not have permission to perform this action.';

/**
 * @param {any} error
 * @param {number} [fallback]
 */
export function getApiV1ErrorStatus(error, fallback = 400) {
	const rawCode = String(error?.code ?? '').trim();
	if (rawCode === '42501') {
		return 403;
	}
	const parsedCode = Number.parseInt(rawCode, 10);
	return parsedCode >= 200 && parsedCode <= 599 ? parsedCode : fallback;
}

/**
 * @param {any} error
 * @param {{ tableName?: string, body?: Record<string, any> | null, fallbackStatus?: number }} [options]
 */
export function resolveApiV1WriteError(
	error,
	{ tableName = '', body = null, fallbackStatus = 400 } = {}
) {
	const status = getApiV1ErrorStatus(error, fallbackStatus);
	if (status === 403) {
		const rawMessage = String(error?.message ?? '');
		const touchesHostGroup =
			body && typeof body === 'object' && !Array.isArray(body) && Boolean(body.host_group_id);
		if (
			/permission to host/i.test(rawMessage) ||
			(EVENT_HOST_TABLES.has(tableName) && touchesHostGroup)
		) {
			return {
				status: 403,
				error: UNAUTHORIZED_HOST_GROUP_MESSAGE
			};
		}
		return {
			status: 403,
			error: INSUFFICIENT_PRIVILEGE_MESSAGE
		};
	}

	return {
		status,
		error: 'Unable to complete request.'
	};
}
