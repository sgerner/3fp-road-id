import { HOST_GROUP_STATUS } from '#lib/groups/hostGroupDirectory.js';
import { getClaimedGroupIdSet } from '#lib/server/groupClaimStatus.js';

const DEFAULT_PAGE_SIZE = 500;
const MAX_DIRECTORY_PAGES = 50;

/**
 * @param {any} supabase
 * @param {{ pageSize?: number, maxPages?: number }} [options]
 */
export async function fetchAllGroupDirectoryRows(
	supabase,
	{ pageSize = DEFAULT_PAGE_SIZE, maxPages = MAX_DIRECTORY_PAGES } = {}
) {
	if (!supabase) return [];

	const safePageSize = Math.max(1, Math.min(1000, Number(pageSize) || DEFAULT_PAGE_SIZE));
	const allGroups = [];
	const seenIds = new Set();

	for (let page = 0; page < maxPages; page += 1) {
		const offset = page * safePageSize;
		const { data, error } = await supabase
			.from('groups')
			.select('id, name, slug, city, state_region, country')
			.order('name', { ascending: true })
			.order('id', { ascending: true })
			.range(offset, offset + safePageSize - 1);

		if (error) throw error;

		const rows = Array.isArray(data) ? data : [];
		for (const row of rows) {
			if (!row?.id) continue;
			const id = String(row.id);
			if (seenIds.has(id)) continue;
			seenIds.add(id);
			allGroups.push(row);
		}

		if (rows.length < safePageSize) {
			break;
		}
	}

	return allGroups;
}

/**
 * @param {any} supabase
 * @param {string | null | undefined} userId
 * @param {{ pageSize?: number, maxPages?: number }} [options]
 */
export async function fetchUserManagedGroupIds(
	supabase,
	userId,
	{ pageSize = DEFAULT_PAGE_SIZE, maxPages = MAX_DIRECTORY_PAGES } = {}
) {
	const managedIds = new Set();
	if (!supabase || !userId) return managedIds;

	const safePageSize = Math.max(1, Math.min(1000, Number(pageSize) || DEFAULT_PAGE_SIZE));
	for (let page = 0; page < maxPages; page += 1) {
		const offset = page * safePageSize;
		const { data, error } = await supabase
			.from('group_members')
			.select('group_id, role')
			.eq('user_id', userId)
			.in('role', ['owner', 'admin'])
			.order('group_id', { ascending: true })
			.range(offset, offset + safePageSize - 1);

		if (error) throw error;

		const rows = Array.isArray(data) ? data : [];
		for (const row of rows) {
			if (row?.group_id) {
				managedIds.add(String(row.group_id));
			}
		}

		if (rows.length < safePageSize) {
			break;
		}
	}

	return managedIds;
}

/**
 * @param {{
 *   supabase?: any,
 *   serviceSupabase?: any,
 *   userId?: string | null,
 *   isAdmin?: boolean | null,
 *   allowSiteAdmin?: boolean,
 *   pageSize?: number
 * }} [options]
 */
export async function loadHostGroupDirectoryCore({
	supabase = null,
	serviceSupabase = null,
	userId = null,
	isAdmin = null,
	allowSiteAdmin = false,
	pageSize = DEFAULT_PAGE_SIZE
} = {}) {
	if (!supabase) {
		return {
			hostGroups: [],
			managedGroupIds: [],
			isAdmin: Boolean(isAdmin)
		};
	}

	const [groups, claimedGroupIds, userManagedGroupIds, resolvedAdmin] = await Promise.all([
		fetchAllGroupDirectoryRows(supabase, { pageSize }).catch((error) => {
			console.warn('Unable to load paginated host group directory', error);
			return [];
		}),
		getClaimedGroupIdSet(serviceSupabase, { pageSize }).catch((error) => {
			console.warn('Unable to resolve group claim statuses for directory', error);
			return null;
		}),
		userId
			? fetchUserManagedGroupIds(supabase, userId, { pageSize }).catch((error) => {
					console.warn('Unable to resolve user managed groups for directory', error);
					return new Set();
				})
			: Promise.resolve(new Set()),
		typeof isAdmin === 'boolean'
			? Promise.resolve(isAdmin)
			: userId
				? Promise.resolve(
						supabase.from('profiles').select('admin').eq('user_id', userId).maybeSingle()
					)
						.then(({ data }) => Boolean(data?.admin))
						.catch(() => false)
				: Promise.resolve(false)
	]);

	const siteAdminCanManageAll = Boolean(userId && allowSiteAdmin && resolvedAdmin);

	const hostGroups = groups.map((group) => {
		const id = String(group.id);
		const isDirectManager = userManagedGroupIds.has(id);
		const canManage = Boolean(userId && (isDirectManager || siteAdminCanManageAll));
		const isClaimed =
			claimedGroupIds === null ? isDirectManager : claimedGroupIds.has(id) || isDirectManager;

		/** @type {string} */
		let status = HOST_GROUP_STATUS.EXTERNAL;
		if (canManage) {
			status = HOST_GROUP_STATUS.MANAGED;
		} else if (claimedGroupIds !== null && !isClaimed) {
			status = HOST_GROUP_STATUS.UNCLAIMED;
		}

		return {
			id,
			name: group.name ?? '',
			slug: group.slug ?? '',
			city: group.city ?? null,
			state_region: group.state_region ?? null,
			country: group.country ?? null,
			status,
			isClaimed: claimedGroupIds === null ? true : isClaimed,
			canManage
		};
	});

	const managedGroupIds = hostGroups.filter((group) => group.canManage).map((group) => group.id);

	return {
		hostGroups,
		managedGroupIds,
		isAdmin: resolvedAdmin
	};
}
