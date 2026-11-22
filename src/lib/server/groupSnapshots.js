import { error, redirect } from '@sveltejs/kit';
import { groupGroupAssetsByBucket } from '#lib/groups/assets.js';
import { normalizeMicrositeSlug } from '#lib/microsites/host.js';
import { publicAccountingReport } from '#lib/server/groupAccountingPublic.js';
import { getGroupClaimStatus } from '#lib/server/groupClaimStatus.js';
import {
	buildGroupPath,
	buildGroupRedirectLocation,
	cleanGroupSlug
} from '#lib/server/groupRouting.js';

export const GROUP_SNAPSHOT_CACHE_TTL_MS = 60_000;
export const GROUP_SNAPSHOT_CACHE_MAX_ENTRIES = 256;
export const GROUP_PUBLIC_CACHE_CONTROL =
	'public, max-age=60, s-maxage=60, stale-while-revalidate=300';
export const GROUP_PRIVATE_CACHE_CONTROL = 'private, no-store';

const GROUP_TAXONOMY_CACHE_TTL_MS = 5 * 60_000;

const ACTION_QUERY_PARAMS = new Set([
	'auth',
	'returnTo',
	'follow',
	'follow_msg',
	'auto_follow',
	'auto_follow_tier',
	'auto_claim_group'
]);

const GROUP_SNAPSHOT_CACHE = new Map();

let taxonomyCacheEntry = null;

function cleanText(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

export function normalizeGroupSlug(value) {
	return cleanText(value).toLowerCase();
}

function stripGroupNewsMarkdownPreview(markdown) {
	return cleanText(markdown)
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^>\s?/gm, '')
		.replace(/^[-*+]\s+/gm, '')
		.replace(/^\d+\.\s+/gm, '')
		.replace(/(\*\*|__|\*|_|~~)/g, '')
		.replace(/\n{2,}/g, '\n')
		.trim();
}

function buildPublicNewsPreviewText(post, maxLength = 180) {
	const summary = cleanText(post?.summary);
	const source = summary || stripGroupNewsMarkdownPreview(post?.body_markdown || '');
	if (!source) return '';
	return source.length > maxLength ? `${source.slice(0, maxLength - 1).trimEnd()}…` : source;
}

export function deepFreezePlainData(value) {
	if (value === null || value === undefined || typeof value !== 'object') {
		return value;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (Array.isArray(value)) {
		return Object.freeze(value.map((item) => deepFreezePlainData(item)));
	}
	const plain = {};
	for (const [key, entryValue] of Object.entries(value)) {
		if (entryValue === undefined || typeof entryValue === 'function') continue;
		plain[key] = deepFreezePlainData(entryValue);
	}
	return Object.freeze(plain);
}

export function resolveGroupPageCacheControl({ isAuthenticated = false, url = null } = {}) {
	if (isAuthenticated) {
		return GROUP_PRIVATE_CACHE_CONTROL;
	}
	const searchParams = url?.searchParams;
	if (searchParams) {
		for (const param of ACTION_QUERY_PARAMS) {
			if (searchParams.has(param)) {
				return GROUP_PRIVATE_CACHE_CONTROL;
			}
		}
	}
	return GROUP_PUBLIC_CACHE_CONTROL;
}

export function getGroupSnapshotCacheSize() {
	return GROUP_SNAPSHOT_CACHE.size;
}

export function clearGroupSnapshotCache() {
	GROUP_SNAPSHOT_CACHE.clear();
	taxonomyCacheEntry = null;
}

export function invalidateGroupSnapshotCache(target, maybeSlug = null) {
	if (!target && !maybeSlug) return 0;

	let groupId = '';
	let slug = '';

	if (typeof target === 'object' && target !== null) {
		groupId = cleanText(target.groupId ?? target.id);
		slug = normalizeGroupSlug(target.slug ?? maybeSlug);
	} else {
		const rawTarget = cleanText(target);
		const normalizedTarget = normalizeGroupSlug(target);
		groupId = rawTarget;
		slug = normalizeGroupSlug(maybeSlug) || normalizedTarget;
	}

	let evicted = 0;
	for (const [key, entry] of GROUP_SNAPSHOT_CACHE) {
		const matchesGroupId = Boolean(groupId && entry.groupId && entry.groupId === groupId);
		const matchesSlug = Boolean(slug && (key === slug || entry.slug === slug));
		if (matchesGroupId || matchesSlug) {
			entry.invalidated = true;
			GROUP_SNAPSHOT_CACHE.delete(key);
			evicted += 1;
		}
	}
	return evicted;
}

function pruneAndBoundSnapshotCache(now, maxEntries) {
	for (const [key, entry] of GROUP_SNAPSHOT_CACHE) {
		if (entry.invalidated || entry.expiresAt <= now) {
			GROUP_SNAPSHOT_CACHE.delete(key);
		}
	}
	const cap = Math.max(1, Number(maxEntries) || GROUP_SNAPSHOT_CACHE_MAX_ENTRIES);
	while (GROUP_SNAPSHOT_CACHE.size >= cap) {
		const oldestKey = GROUP_SNAPSHOT_CACHE.keys().next().value;
		if (oldestKey === undefined) break;
		GROUP_SNAPSHOT_CACHE.delete(oldestKey);
	}
}

async function resolveDefaultSupabaseClients({
	publicSupabase,
	serviceSupabase,
	getPublicSupabase,
	getServiceSupabase
}) {
	let resolvedPublic = publicSupabase ?? getPublicSupabase?.() ?? null;
	let resolvedService =
		serviceSupabase !== undefined
			? serviceSupabase
			: getServiceSupabase
				? getServiceSupabase()
				: undefined;

	if (!resolvedPublic || resolvedService === undefined) {
		const clientMod = await import('#lib/server/supabaseClient.js');
		if (!resolvedPublic) {
			resolvedPublic = clientMod.createRequestSupabaseClient(null);
		}
		if (resolvedService === undefined) {
			resolvedService = clientMod.createServiceSupabaseClient();
		}
	}

	return {
		publicSupabase: resolvedPublic,
		serviceSupabase: resolvedService ?? null
	};
}

async function loadPublishedGroupBySlug(publicSupabase, normalizedSlug) {
	if (!publicSupabase) {
		const err = new Error('Supabase client is unavailable');
		err.status = 500;
		throw err;
	}

	const { data, error } = await publicSupabase
		.from('groups')
		.select('*')
		.eq('slug', normalizedSlug)
		.eq('is_published', true)
		.maybeSingle();

	if (error) {
		const lookupError = new Error(error.message || 'Failed to load group');
		lookupError.status = 500;
		lookupError.cause = error;
		throw lookupError;
	}

	return data ?? null;
}

async function loadTaxonomyTable(publicSupabase, table, label) {
	try {
		const { data, error } = await publicSupabase
			.from(table)
			.select('id,name')
			.order('name', { ascending: true });
		if (error) {
			console.warn(`Failed to load ${label}`, error);
			return [];
		}
		return Array.isArray(data) ? data : [];
	} catch (err) {
		console.warn(`Failed to load ${label}`, err);
		return [];
	}
}

async function loadGroupTaxonomyCatalog(publicSupabase, now, { useCache = true } = {}) {
	if (useCache && taxonomyCacheEntry && taxonomyCacheEntry.expiresAt > now) {
		return taxonomyCacheEntry.promise;
	}

	const promise = Promise.all([
		loadTaxonomyTable(publicSupabase, 'group_types', 'group types'),
		loadTaxonomyTable(publicSupabase, 'audience_focuses', 'audience focuses'),
		loadTaxonomyTable(publicSupabase, 'riding_disciplines', 'riding disciplines'),
		loadTaxonomyTable(publicSupabase, 'skill_levels', 'skill levels')
	]).then(([groupTypes, audienceFocuses, ridingDisciplines, skillLevels]) =>
		deepFreezePlainData({
			groupTypes,
			audienceFocuses,
			ridingDisciplines,
			skillLevels
		})
	);

	if (useCache) {
		const entry = {
			expiresAt: now + GROUP_TAXONOMY_CACHE_TTL_MS,
			promise
		};
		promise.catch(() => {
			if (taxonomyCacheEntry === entry) taxonomyCacheEntry = null;
		});
		taxonomyCacheEntry = entry;
	}

	return promise;
}

async function loadPublicMembershipProgramBySlug(serviceSupabase, normalizedSlug) {
	if (!serviceSupabase) return null;
	try {
		const { data, error } = await serviceSupabase
			.from('group_membership_programs')
			.select('*, groups!inner(slug,is_published)')
			.eq('groups.slug', normalizedSlug)
			.eq('groups.is_published', true)
			.eq('enabled', true)
			.maybeSingle();
		if (error) {
			console.warn('Failed to load public membership program for group snapshot', error);
			return null;
		}
		return data ?? null;
	} catch (err) {
		console.warn('Failed to load public membership program for group snapshot', err);
		return null;
	}
}

function sanitizePublicMembershipProgram(program) {
	if (!program) return null;
	const isPublicAccess = program.access_mode === 'public';
	return {
		id: program.id ?? null,
		group_id: program.group_id ?? null,
		enabled: program.enabled === true,
		access_mode: program.access_mode ?? 'public',
		cta_label: program.cta_label ?? null,
		contribution_mode: program.contribution_mode ?? 'donation',
		default_tier_id: program.default_tier_id ?? null,
		policy_markdown: isPublicAccess ? (program.policy_markdown ?? null) : null,
		policy_version: program.policy_version ?? 1,
		policy_updated_at: program.policy_updated_at ?? null,
		created_at: program.created_at ?? null,
		updated_at: program.updated_at ?? null
	};
}

function sanitizePublicMembershipTier(tier) {
	if (!tier) return null;
	const sanitized = { ...tier };
	delete sanitized.stripe_account_id;
	return sanitized;
}

async function loadPublicMembershipTiers(serviceSupabase, program) {
	if (!serviceSupabase || !program?.id || program.access_mode !== 'public') {
		return [];
	}
	try {
		const { data, error } = await serviceSupabase
			.from('group_membership_tiers')
			.select('*')
			.eq('program_id', program.id)
			.eq('is_active', true)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true });
		if (error) {
			console.warn('Failed to load public membership tiers for group snapshot', error);
			return [];
		}
		return (data ?? [])
			.filter((tier) => tier?.is_active !== false)
			.map(sanitizePublicMembershipTier)
			.filter(Boolean);
	} catch (err) {
		console.warn('Failed to load public membership tiers for group snapshot', err);
		return [];
	}
}

async function loadPublicMembershipFormFields(serviceSupabase, program) {
	if (!serviceSupabase || !program?.id || program.access_mode !== 'public') {
		return [];
	}
	try {
		const { data, error } = await serviceSupabase
			.from('group_membership_form_fields')
			.select('*')
			.eq('program_id', program.id)
			.eq('active', true)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true });
		if (error) {
			console.warn('Failed to load public membership form fields for group snapshot', error);
			return [];
		}
		return (data ?? []).filter((field) => field?.active !== false);
	} catch (err) {
		console.warn('Failed to load public membership form fields for group snapshot', err);
		return [];
	}
}

async function loadGroupSelectionIds(publicSupabase, table, column, groupId, label) {
	try {
		const { data, error } = await publicSupabase.from(table).select(column).eq('group_id', groupId);
		if (error) {
			console.warn(`Failed to load ${label}`, error);
			return [];
		}
		return (data ?? [])
			.map((row) => row?.[column])
			.filter((value) => value !== null && value !== undefined);
	} catch (err) {
		console.warn(`Failed to load ${label}`, err);
		return [];
	}
}

async function loadPublicDonationEnabled(publicSupabase, groupId) {
	try {
		const { data, error } = await publicSupabase
			.from('donation_accounts_public')
			.select('is_connected')
			.eq('group_id', groupId)
			.maybeSingle();
		if (error) {
			console.warn('Failed to load donation account for group snapshot', error);
			return false;
		}
		return Boolean(data?.is_connected);
	} catch (err) {
		console.warn('Failed to load donation account for group snapshot', err);
		return false;
	}
}

async function loadPublicGroupAssetBuckets(assetSupabase, groupId) {
	if (!assetSupabase || !groupId) return [];
	try {
		const { data, error } = await assetSupabase
			.from('group_assets')
			.select(
				'id, group_id, section_id, asset_kind, title, description, file_url, bucket_id, object_path, file_name, mime_type, size_bytes, external_url, metadata, sort_order, created_at, updated_at'
			)
			.eq('group_id', groupId)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: false });
		if (error) {
			console.warn('Failed to load group asset buckets for group snapshot', error);
			return [];
		}
		return groupGroupAssetsByBucket(data ?? [], { includeEmpty: false });
	} catch (err) {
		console.warn('Failed to load group asset buckets for group snapshot', err);
		return [];
	}
}

async function loadPublicGroupNews(publicSupabase, groupId) {
	try {
		const { data, error } = await publicSupabase
			.from('group_news_posts')
			.select(
				'id, group_id, title, slug, summary, body_markdown, published_at, created_at, updated_at, source_url, source_name, source_published_at, cover_image_url'
			)
			.eq('group_id', groupId)
			.not('published_at', 'is', null)
			.eq('is_private', false)
			.order('published_at', { ascending: false, nullsFirst: false })
			.order('created_at', { ascending: false })
			.limit(3);
		if (error) {
			console.warn('Failed to load group news for group snapshot', error);
			return [];
		}
		return (data ?? []).map((post) => ({
			id: post.id,
			group_id: post.group_id,
			title: post.title,
			slug: post.slug,
			summary: post.summary ?? null,
			published_at: post.published_at ?? null,
			created_at: post.created_at ?? null,
			updated_at: post.updated_at ?? null,
			source_url: post.source_url ?? null,
			source_name: post.source_name ?? null,
			source_published_at: post.source_published_at ?? null,
			cover_image_url: post.cover_image_url ?? null,
			preview_text: buildPublicNewsPreviewText(post)
		}));
	} catch (err) {
		console.warn('Failed to load group news for group snapshot', err);
		return [];
	}
}

async function loadPublicGroupAccountingReports(supabaseClient, groupId) {
	if (!supabaseClient || !groupId) return [];
	try {
		const { data, error } = await supabaseClient
			.from('group_accounting_public_reports')
			.select(
				'id,slug,title,report_period_start,report_period_end,visibility,snapshot,notes,published_at'
			)
			.eq('group_id', groupId)
			.eq('published', true)
			.order('published_at', { ascending: false })
			.limit(3);
		if (error) {
			console.warn('Failed to load public accounting snapshots for group snapshot', error);
			return [];
		}
		return (data ?? []).map(publicAccountingReport);
	} catch (err) {
		console.warn('Failed to load public accounting snapshots for group snapshot', err);
		return [];
	}
}

async function loadPublicVolunteerEvents(publicSupabase, groupId, nowIso) {
	try {
		const { data, error } = await publicSupabase
			.from('volunteer_events')
			.select(
				'id,slug,title,summary,event_start,event_end,timezone,location_name,location_address,host_group_id'
			)
			.eq('host_group_id', groupId)
			.eq('status', 'published')
			.gte('event_start', nowIso)
			.order('event_start', { ascending: true })
			.limit(3);
		if (error) {
			console.warn('Failed to load volunteer events for group snapshot', error);
			return [];
		}
		return (data ?? []).map((row) => ({
			id: row.id,
			slug: row.slug,
			title: row.title,
			summary: row.summary,
			event_start: row.event_start,
			event_end: row.event_end,
			timezone: row.timezone,
			location_name: row.location_name,
			location_address: row.location_address,
			host_group_id: row.host_group_id,
			can_manage: false
		}));
	} catch (err) {
		console.warn('Failed to load volunteer events for group snapshot', err);
		return [];
	}
}

function hasEmbeddedRecurrenceRule(recurrenceRules) {
	if (Array.isArray(recurrenceRules)) {
		return recurrenceRules.length > 0;
	}
	return Boolean(recurrenceRules?.activity_event_id);
}

async function loadPublicGroupRides(publicSupabase, groupId, nowIso) {
	try {
		const { data: activities, error } = await publicSupabase
			.from('activity_events')
			.select(
				`
					id,
					title,
					slug,
					summary,
					description,
					timezone,
					status,
					host_group_id,
					start_location_name,
					start_location_address,
					start_latitude,
					start_longitude,
					next_occurrence_start,
					next_occurrence_end,
					ride_details(*),
					group:groups(id,slug,name,city,state_region),
					difficulty_links:activity_x_ride_difficulty_levels(level:ride_difficulty_levels(*)),
					discipline_links:activity_x_riding_disciplines(discipline:riding_disciplines(*)),
					recurrence_rules:activity_recurrence_rules(activity_event_id)
				`
			)
			.eq('activity_type', 'ride')
			.eq('status', 'published')
			.eq('host_group_id', groupId)
			.gte('next_occurrence_start', nowIso)
			.order('next_occurrence_start', { ascending: true })
			.limit(200);

		if (error) {
			console.warn('Failed to load rides for group snapshot', error);
			return [];
		}

		return (activities ?? []).map((activity) => ({
			id: activity.id,
			title: activity.title,
			slug: activity.slug,
			summary: activity.summary,
			description: activity.description,
			timezone: activity.timezone,
			hostGroupId: activity.host_group_id,
			startLocationName: activity.start_location_name,
			startLocationAddress: activity.start_location_address,
			startLatitude: activity.start_latitude,
			startLongitude: activity.start_longitude,
			nextOccurrenceStart: activity.next_occurrence_start,
			nextOccurrenceEnd: activity.next_occurrence_end,
			recurrenceEnabled: hasEmbeddedRecurrenceRule(activity.recurrence_rules),
			group: activity.group ?? null,
			rideDetails: Array.isArray(activity.ride_details)
				? (activity.ride_details[0] ?? null)
				: (activity.ride_details ?? null),
			imageUrls: Array.isArray(activity.ride_details)
				? (activity.ride_details[0]?.image_urls ?? [])
				: (activity.ride_details?.image_urls ?? []),
			difficultyLevels: (activity.difficulty_links ?? [])
				.map((entry) => entry?.level)
				.filter(Boolean),
			ridingDisciplines: (activity.discipline_links ?? [])
				.map((entry) => entry?.discipline)
				.filter(Boolean)
		}));
	} catch (err) {
		console.warn('Failed to load rides for group snapshot', err);
		return [];
	}
}

async function loadPublicGroupSnapshotUncached({
	normalizedSlug,
	publicSupabase,
	serviceSupabase,
	getPublicSupabase,
	getServiceSupabase,
	now,
	cacheTaxonomy = true
}) {
	const clients = await resolveDefaultSupabaseClients({
		publicSupabase,
		serviceSupabase,
		getPublicSupabase,
		getServiceSupabase
	});

	// Wave 1: Resolve published group, optional membership program header, and taxonomy catalog in parallel.
	const [group, rawMembershipProgram, taxonomyCatalog] = await Promise.all([
		loadPublishedGroupBySlug(clients.publicSupabase, normalizedSlug),
		loadPublicMembershipProgramBySlug(clients.serviceSupabase, normalizedSlug),
		loadGroupTaxonomyCatalog(clients.publicSupabase, now, { useCache: cacheTaxonomy })
	]);

	if (!group) {
		return null;
	}

	const matchedProgram =
		rawMembershipProgram && rawMembershipProgram.group_id === group.id
			? rawMembershipProgram
			: null;
	const nowIso = new Date(now).toISOString();
	const assetClient = clients.serviceSupabase ?? clients.publicSupabase;
	const accountingClient = clients.serviceSupabase ?? clients.publicSupabase;

	// Wave 2: Load all public group sections in parallel without self-fetching internal routes or querying group_members as anon.
	const [
		groupTypeIds,
		audienceFocusIds,
		ridingDisciplineIds,
		skillLevelIds,
		claimStatus,
		donationEnabled,
		membershipTiers,
		membershipFormFields,
		assetBuckets,
		groupNewsPosts,
		accountingPublicReports,
		volunteerEvents,
		rides
	] = await Promise.all([
		loadGroupSelectionIds(
			clients.publicSupabase,
			'group_x_group_types',
			'group_type_id',
			group.id,
			'group type selections'
		),
		loadGroupSelectionIds(
			clients.publicSupabase,
			'group_x_audience_focuses',
			'audience_focus_id',
			group.id,
			'audience focus selections'
		),
		loadGroupSelectionIds(
			clients.publicSupabase,
			'group_x_riding_disciplines',
			'riding_discipline_id',
			group.id,
			'riding discipline selections'
		),
		loadGroupSelectionIds(
			clients.publicSupabase,
			'group_x_skill_levels',
			'skill_level_id',
			group.id,
			'skill level selections'
		),
		getGroupClaimStatus(clients.serviceSupabase, group.id).catch((err) => {
			console.warn('Failed to load public group claim status', err);
			return null;
		}),
		loadPublicDonationEnabled(clients.publicSupabase, group.id),
		loadPublicMembershipTiers(clients.serviceSupabase, matchedProgram),
		loadPublicMembershipFormFields(clients.serviceSupabase, matchedProgram),
		loadPublicGroupAssetBuckets(assetClient, group.id),
		loadPublicGroupNews(clients.publicSupabase, group.id),
		loadPublicGroupAccountingReports(accountingClient, group.id),
		loadPublicVolunteerEvents(clients.publicSupabase, group.id, nowIso),
		loadPublicGroupRides(clients.publicSupabase, group.id, nowIso)
	]);

	return deepFreezePlainData({
		group,
		group_types: taxonomyCatalog.groupTypes,
		audience_focuses: taxonomyCatalog.audienceFocuses,
		riding_disciplines: taxonomyCatalog.ridingDisciplines,
		skill_levels: taxonomyCatalog.skillLevels,
		selected: {
			group_type_ids: groupTypeIds,
			audience_focus_ids: audienceFocusIds,
			riding_discipline_ids: ridingDisciplineIds,
			skill_level_ids: skillLevelIds
		},
		is_claimed: claimStatus,
		asset_buckets: assetBuckets,
		donation_enabled: donationEnabled,
		membership_program: sanitizePublicMembershipProgram(matchedProgram),
		membership_tiers: membershipTiers,
		membership_form_fields: membershipFormFields,
		group_news_posts: groupNewsPosts,
		accounting_public_reports: accountingPublicReports,
		volunteer_events: volunteerEvents,
		rides
	});
}

export async function loadPublicGroupSnapshot({
	slug,
	publicSupabase,
	serviceSupabase,
	getPublicSupabase,
	getServiceSupabase,
	now = Date.now(),
	ttlMs = GROUP_SNAPSHOT_CACHE_TTL_MS,
	maxEntries = GROUP_SNAPSHOT_CACHE_MAX_ENTRIES,
	cacheTaxonomy = true
} = {}) {
	const normalizedSlug = normalizeGroupSlug(slug);
	if (!normalizedSlug) {
		return null;
	}

	const currentNow = Number.isFinite(now) ? now : Date.now();
	const cached = GROUP_SNAPSHOT_CACHE.get(normalizedSlug);
	if (cached && !cached.invalidated && cached.expiresAt > currentNow) {
		GROUP_SNAPSHOT_CACHE.delete(normalizedSlug);
		GROUP_SNAPSHOT_CACHE.set(normalizedSlug, cached);
		return cached.promise;
	}
	if (cached) {
		GROUP_SNAPSHOT_CACHE.delete(normalizedSlug);
	}

	pruneAndBoundSnapshotCache(currentNow, maxEntries);

	const effectiveTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : GROUP_SNAPSHOT_CACHE_TTL_MS;
	const entry = {
		groupId: null,
		slug: normalizedSlug,
		expiresAt: currentNow + effectiveTtlMs,
		invalidated: false,
		promise: null
	};

	entry.promise = loadPublicGroupSnapshotUncached({
		normalizedSlug,
		publicSupabase,
		serviceSupabase,
		getPublicSupabase,
		getServiceSupabase,
		now: currentNow,
		cacheTaxonomy
	})
		.then((snapshot) => {
			if (!snapshot || entry.invalidated) {
				if (GROUP_SNAPSHOT_CACHE.get(normalizedSlug) === entry) {
					GROUP_SNAPSHOT_CACHE.delete(normalizedSlug);
				}
				return snapshot;
			}
			entry.groupId = cleanText(snapshot.group?.id) || null;
			entry.slug = normalizeGroupSlug(snapshot.group?.slug) || normalizedSlug;
			return snapshot;
		})
		.catch((loadError) => {
			if (GROUP_SNAPSHOT_CACHE.get(normalizedSlug) === entry) {
				GROUP_SNAPSHOT_CACHE.delete(normalizedSlug);
			}
			throw loadError;
		});

	GROUP_SNAPSHOT_CACHE.set(normalizedSlug, entry);
	return entry.promise;
}

export function createAnonymousViewerOverlay() {
	return {
		session_user_id: null,
		session_is_admin: false,
		is_owner: false,
		is_social_manager: false,
		my_memberships: [],
		managed_volunteer_event_ids: []
	};
}

export async function loadGroupViewerOverlay({
	groupId,
	volunteerEvents = [],
	viewerUserId,
	viewerIsAdmin,
	requestSupabase,
	serviceSupabase
} = {}) {
	const normalizedUserId = cleanText(viewerUserId);
	if (!normalizedUserId || !groupId) {
		return createAnonymousViewerOverlay();
	}

	const viewerDb = requestSupabase ?? serviceSupabase ?? null;
	if (!viewerDb) {
		return {
			...createAnonymousViewerOverlay(),
			session_user_id: normalizedUserId,
			session_is_admin: Boolean(viewerIsAdmin)
		};
	}

	const eventIds = Array.isArray(volunteerEvents)
		? volunteerEvents
				.map((event) => event?.id)
				.filter((value) => value !== null && value !== undefined)
		: [];

	const loadViewerRoles = async () => {
		try {
			const { data, error } = await viewerDb
				.from('group_members')
				.select('role')
				.eq('group_id', groupId)
				.eq('user_id', normalizedUserId)
				.in('role', ['owner', 'admin']);
			if (error) {
				console.warn('Failed to load viewer group roles', error);
				return [];
			}
			return Array.isArray(data) ? data : [];
		} catch (err) {
			console.warn('Failed to load viewer group roles', err);
			return [];
		}
	};

	const loadViewerMemberships = async () => {
		try {
			const { data, error } = await viewerDb
				.from('group_memberships')
				.select('id,status,tier_id,started_at,renews_at,ends_at,created_at')
				.eq('group_id', groupId)
				.eq('user_id', normalizedUserId)
				.order('created_at', { ascending: false })
				.limit(20);
			if (error) {
				console.warn('Failed to load viewer memberships for group page', error);
				return [];
			}
			return Array.isArray(data) ? data : [];
		} catch (err) {
			console.warn('Failed to load viewer memberships for group page', err);
			return [];
		}
	};

	const loadViewerAdminFlag = async () => {
		if (typeof viewerIsAdmin === 'boolean') {
			return viewerIsAdmin;
		}
		try {
			const { data, error } = await viewerDb
				.from('profiles')
				.select('admin')
				.eq('user_id', normalizedUserId)
				.maybeSingle();
			if (error) {
				console.warn('Failed to resolve viewer admin flag for group page', error);
				return false;
			}
			return data?.admin === true;
		} catch (err) {
			console.warn('Failed to resolve viewer admin flag for group page', err);
			return false;
		}
	};

	const loadViewerHostedEventIds = async () => {
		if (!eventIds.length || viewerIsAdmin === true) {
			return [];
		}
		const [directHostRows, coHostRows] = await Promise.all([
			Promise.resolve()
				.then(() =>
					viewerDb
						.from('volunteer_events')
						.select('id')
						.in('id', eventIds)
						.eq('host_user_id', normalizedUserId)
				)
				.then(({ data, error }) => {
					if (error) {
						console.warn('Failed to load viewer direct volunteer host flags', error);
						return [];
					}
					return Array.isArray(data) ? data : [];
				})
				.catch((err) => {
					console.warn('Failed to load viewer direct volunteer host flags', err);
					return [];
				}),
			Promise.resolve()
				.then(() =>
					viewerDb
						.from('v_volunteer_event_hosts_with_profiles')
						.select('event_id')
						.in('event_id', eventIds)
						.eq('user_id', normalizedUserId)
				)
				.then(({ data, error }) => {
					if (error) {
						console.warn('Failed to load volunteer event host assignments for group page', error);
						return [];
					}
					return Array.isArray(data) ? data : [];
				})
				.catch((err) => {
					console.warn('Failed to load volunteer event host assignments for group page', err);
					return [];
				})
		]);

		return Array.from(
			new Set([
				...directHostRows.map((row) => row?.id).filter(Boolean),
				...coHostRows.map((row) => row?.event_id).filter(Boolean)
			])
		);
	};

	const [roleRows, myMemberships, resolvedAdmin, managedVolunteerEventIds] = await Promise.all([
		loadViewerRoles(),
		loadViewerMemberships(),
		loadViewerAdminFlag(),
		loadViewerHostedEventIds()
	]);

	const isOwner = roleRows.some((row) => row?.role === 'owner');
	const isSocialManager = roleRows.some((row) => row?.role === 'owner' || row?.role === 'admin');

	return {
		session_user_id: normalizedUserId,
		session_is_admin: resolvedAdmin,
		is_owner: isOwner,
		is_social_manager: isSocialManager,
		my_memberships: myMemberships,
		managed_volunteer_event_ids: managedVolunteerEventIds
	};
}

export function applyGroupViewerOverlay(snapshot, overlay = null) {
	const viewer = overlay ?? createAnonymousViewerOverlay();
	const sessionUserId = viewer.session_user_id ?? null;
	const sessionIsAdmin = Boolean(viewer.session_is_admin);
	const isOwner = Boolean(viewer.is_owner);
	const isSocialManager = Boolean(viewer.is_social_manager);
	const isClaimed = Boolean(snapshot.is_claimed ?? isOwner);
	const canEdit = sessionIsAdmin || isOwner;
	const canManageSocial = isClaimed && isSocialManager;
	const managedEventIds = new Set(viewer.managed_volunteer_event_ids ?? []);

	const volunteerEvents = Array.isArray(snapshot.volunteer_events)
		? snapshot.volunteer_events.map((event) => ({
				...event,
				can_manage: Boolean(canEdit || (sessionUserId && managedEventIds.has(event.id)))
			}))
		: [];

	return {
		group: snapshot.group,
		group_types: snapshot.group_types,
		audience_focuses: snapshot.audience_focuses,
		riding_disciplines: snapshot.riding_disciplines,
		skill_levels: snapshot.skill_levels,
		selected: {
			group_type_ids: [...(snapshot.selected?.group_type_ids ?? [])],
			audience_focus_ids: [...(snapshot.selected?.audience_focus_ids ?? [])],
			riding_discipline_ids: [...(snapshot.selected?.riding_discipline_ids ?? [])],
			skill_level_ids: [...(snapshot.selected?.skill_level_ids ?? [])]
		},
		is_claimed: isClaimed,
		is_owner: isOwner,
		is_social_manager: isSocialManager,
		can_manage_social: canManageSocial,
		asset_buckets: snapshot.asset_buckets,
		session_user_id: sessionUserId,
		can_edit: canEdit,
		donation_enabled: snapshot.donation_enabled,
		membership_program: snapshot.membership_program,
		membership_tiers: snapshot.membership_tiers,
		membership_form_fields: snapshot.membership_form_fields,
		my_memberships: Array.isArray(viewer.my_memberships) ? viewer.my_memberships : [],
		group_news_posts: snapshot.group_news_posts,
		accounting_public_reports: snapshot.accounting_public_reports,
		volunteer_events: volunteerEvents,
		rides: snapshot.rides
	};
}

export async function loadGroupProfilePageData({
	params,
	cookies,
	url,
	parent,
	setHeaders,
	publicSupabase,
	serviceSupabase,
	getPublicSupabase,
	getServiceSupabase,
	getRequestSupabase,
	resolveSessionImpl,
	joinMembershipImpl,
	now,
	ttlMs,
	maxEntries,
	cacheTaxonomy = true
} = {}) {
	const slug = params?.slug;
	const parentPromise =
		typeof parent === 'function' ? parent().catch(() => ({})) : Promise.resolve(null);

	let snapshot = null;
	try {
		snapshot = await loadPublicGroupSnapshot({
			slug,
			publicSupabase,
			serviceSupabase,
			getPublicSupabase,
			getServiceSupabase,
			now,
			ttlMs,
			maxEntries,
			cacheTaxonomy
		});
	} catch (err) {
		console.warn('Failed to load group details', err);
		throw error(500, 'Failed to load group');
	}

	if (!snapshot?.group?.slug) {
		const requestedSlug = cleanGroupSlug(slug);
		const micrositeCandidate = requestedSlug ? normalizeMicrositeSlug(requestedSlug) : '';
		if (micrositeCandidate) {
			let canonicalSlug = '';
			try {
				const clients = await resolveDefaultSupabaseClients({
					publicSupabase,
					serviceSupabase,
					getPublicSupabase,
					getServiceSupabase
				});
				if (!clients.publicSupabase) {
					throw new Error('Supabase client is unavailable');
				}
				const { data: micrositeGroup, error: micrositeError } = await clients.publicSupabase
					.from('groups')
					.select('slug')
					.eq('microsite_slug', micrositeCandidate)
					.eq('is_published', true)
					.maybeSingle();
				if (micrositeError) {
					throw micrositeError;
				}
				canonicalSlug = cleanGroupSlug(micrositeGroup?.slug);
			} catch (err) {
				console.warn('Failed to load group details', err);
				throw error(500, 'Failed to load group');
			}

			if (canonicalSlug && requestedSlug !== canonicalSlug) {
				throw redirect(308, buildGroupRedirectLocation(canonicalSlug, url?.search || ''));
			}
		}

		throw error(404, 'Group not found');
	}

	const parentData = await parentPromise;
	let verifiedUser =
		parentData && ('groupsNavUser' in parentData || 'user' in parentData)
			? (parentData.groupsNavUser ?? parentData.user ?? null)
			: undefined;
	let accessToken = null;

	const resolveSession =
		resolveSessionImpl ??
		(async (cookieJar) => {
			const mod = await import('#lib/server/session.js');
			return mod.resolveVerifiedSession(cookieJar);
		});

	if (verifiedUser === undefined) {
		const session = await resolveSession(cookies);
		verifiedUser = session?.user ?? null;
		accessToken = session?.accessToken ?? null;
	} else if (verifiedUser?.id) {
		const session = await resolveSession(cookies);
		if (session?.user?.id === verifiedUser.id) {
			accessToken = session.accessToken ?? null;
		}
	}

	const viewerUserId = verifiedUser?.id ?? null;
	const isAuthenticated = Boolean(viewerUserId);
	const cacheControl = resolveGroupPageCacheControl({ isAuthenticated, url });
	if (typeof setHeaders === 'function') {
		setHeaders({ 'cache-control': cacheControl });
	}

	const autoFollowRequested = (url?.searchParams?.get('auto_follow') || '').trim() === '1';
	const autoFollowTierId = (url?.searchParams?.get('auto_follow_tier') || '').trim();
	if (autoFollowRequested && viewerUserId) {
		const membershipProgram = snapshot.membership_program;
		const membershipTiers = snapshot.membership_tiers ?? [];
		const selectedTier =
			membershipTiers.find((tier) => tier.id === autoFollowTierId) ||
			(membershipTiers.length === 1 ? membershipTiers[0] : null);
		const normalizedContributionMode =
			membershipProgram?.contribution_mode === 'required_fee'
				? 'paid'
				: membershipProgram?.contribution_mode || 'donation';
		const monthlyAmount = Number(
			selectedTier?.monthly_amount_cents ?? selectedTier?.amount_cents ?? 0
		);
		const annualAmount = Number(selectedTier?.annual_amount_cents ?? 0);
		const isFreeTier =
			Boolean(selectedTier) &&
			monthlyAmount <= 0 &&
			annualAmount <= 0 &&
			selectedTier?.allow_custom_amount !== true;
		const canAutoFollow =
			membershipProgram?.enabled === true &&
			Boolean(selectedTier) &&
			membershipTiers.length === 1 &&
			isFreeTier &&
			normalizedContributionMode !== 'paid' &&
			membershipProgram?.access_mode !== 'private_request';

		const canonicalSlug = snapshot.group.slug;
		const nextUrl = new URL(
			buildGroupPath(canonicalSlug) || `/groups/${encodeURIComponent(canonicalSlug)}`,
			url?.origin || 'http://localhost'
		);
		if (canAutoFollow) {
			const joinFn =
				joinMembershipImpl ??
				(async (joinArgs) => {
					const mod = await import('#lib/server/memberships.js');
					return mod.joinMembership(joinArgs);
				});
			const followResult = await joinFn({
				cookies,
				groupSlug: canonicalSlug,
				payload: {
					tier_id: selectedTier.id,
					billing_interval: 'month'
				}
			});
			if (followResult?.ok) {
				nextUrl.searchParams.set('follow', 'success');
			} else {
				nextUrl.searchParams.set('follow', 'error');
				if (followResult?.error) {
					nextUrl.searchParams.set('follow_msg', String(followResult.error).slice(0, 140));
				}
			}
		} else {
			nextUrl.searchParams.set('follow', 'error');
			nextUrl.searchParams.set(
				'follow_msg',
				'This group requires selecting a membership option before joining.'
			);
		}
		throw redirect(303, `${nextUrl.pathname}${nextUrl.search}`);
	}

	if (!viewerUserId) {
		return applyGroupViewerOverlay(snapshot, null);
	}

	let requestSupabase = getRequestSupabase ? getRequestSupabase(accessToken) : null;
	let resolvedServiceSupabase =
		serviceSupabase !== undefined ? serviceSupabase : getServiceSupabase?.();
	if (!requestSupabase && accessToken) {
		const clientMod = await import('#lib/server/supabaseClient.js');
		requestSupabase = clientMod.createRequestSupabaseClient(accessToken);
	}
	if (resolvedServiceSupabase === undefined) {
		const clientMod = await import('#lib/server/supabaseClient.js');
		resolvedServiceSupabase = clientMod.createServiceSupabaseClient();
	}

	const viewerIsAdmin = typeof parentData?.isAdmin === 'boolean' ? parentData.isAdmin : undefined;

	const overlay = await loadGroupViewerOverlay({
		groupId: snapshot.group.id,
		volunteerEvents: snapshot.volunteer_events,
		viewerUserId,
		viewerIsAdmin,
		requestSupabase,
		serviceSupabase: resolvedServiceSupabase
	});

	return applyGroupViewerOverlay(snapshot, overlay);
}
