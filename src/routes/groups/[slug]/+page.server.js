import { resolveSession } from '$lib/server/session';
import { callInstagramApi, callMetaApi } from '$lib/server/social/meta/client';
import { resolveMetaAccountAccessToken } from '$lib/server/social/meta/tokens';
import { getGroupAssetsReadClient, listGroupAssetBuckets } from '$lib/server/groupAssets';
import { listPublishedGroupNewsPosts } from '$lib/server/groupNews';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { supabase } from '$lib/supabaseClient';

const INSTAGRAM_POST_LIMIT = 3;
const INSTAGRAM_WEB_APP_ID = '936619743392459';
const BROWSER_LIKE_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
	Accept: 'application/json,text/plain,*/*',
	'Accept-Language': 'en-US,en;q=0.9'
};

function buildQuery(params) {
	const search = new URLSearchParams();
	if (params && typeof params === 'object') {
		for (const [key, value] of Object.entries(params)) {
			if (value === null || value === undefined) continue;
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item === null || item === undefined) continue;
					search.append(key, String(item));
				}
				continue;
			}
			search.set(key, String(value));
		}
	}
	const qs = search.toString();
	return qs ? `?${qs}` : '';
}

async function callApi(fetchImpl, resource, params) {
	const qs = buildQuery(params);
	const response = await fetchImpl(`/api/v1/${resource}${qs}`);
	const text = await response.text();
	let payload = null;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = text;
		}
	}
	if (!response.ok) {
		const message = payload?.error || payload?.message || `Failed to load ${resource}`;
		const apiError = new Error(message);
		apiError.status = response.status;
		apiError.payload = payload;
		throw apiError;
	}
	return payload ?? {};
}

async function fetchSingle(fetchImpl, resource, params) {
	try {
		const payload = await callApi(fetchImpl, resource, params);
		return payload?.data ?? payload ?? null;
	} catch (err) {
		if (err?.status === 404) return null;
		throw err;
	}
}

async function fetchList(fetchImpl, resource, params) {
	try {
		const payload = await callApi(fetchImpl, resource, params);
		const data = payload?.data ?? payload;
		if (Array.isArray(data)) return data;
		if (data === null || data === undefined) return [];
		return [data];
	} catch (err) {
		if (err?.status === 403 || err?.status === 404) {
			return [];
		}
		throw err;
	}
}

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function parseJsonSafe(text) {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function extractConnectedInstagramProfile(account) {
	if (!account) return null;
	const username = cleanText(account.username, 120);
	const accountName = cleanText(account.account_name, 240);
	const metadata = account.metadata && typeof account.metadata === 'object' ? account.metadata : {};
	const profileUrlRaw =
		cleanText(metadata.profile_url, 2000) ||
		cleanText(metadata.permalink, 2000) ||
		cleanText(metadata.instagram_profile_url, 2000);
	const profileUrl = profileUrlRaw || (username ? `https://www.instagram.com/${username}/` : '');
	return {
		username: username || null,
		account_name: accountName || null,
		profile_url: profileUrl || null,
		connected_at: account.updated_at || account.created_at || null
	};
}

function parseInstagramPostUrl(value) {
	const raw = cleanText(value, 2000);
	if (!raw) return null;
	let parsed = null;
	try {
		parsed = new URL(raw);
	} catch {
		return null;
	}
	if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
	const segments = parsed.pathname.split('/').filter(Boolean);
	if (segments.length < 2) return null;
	const type = cleanText(segments[0], 20).toLowerCase();
	const shortcode = cleanText(segments[1], 120);
	if (!['p', 'reel', 'tv'].includes(type) || !shortcode) return null;
	const permalink = `https://www.instagram.com/${type}/${shortcode}/`;
	return {
		type,
		shortcode,
		permalink,
		embed_url: `${permalink}embed/`,
		id: `${type}_${shortcode}`
	};
}

function extractInstagramHandle(value) {
	const raw = cleanText(value, 2000);
	if (!raw) return '';
	const lowered = raw.toLowerCase();
	const stripped = cleanText(raw.replace(/^@/, '').split(/[/?#]/)[0], 120);
	if (stripped && !/^https?:\/\//i.test(raw) && !lowered.includes('instagram.com')) {
		return stripped;
	}
	const normalized = raw.startsWith('@') ? `https://www.instagram.com/${raw.slice(1)}` : raw;
	try {
		const parsed = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
		if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return '';
		const segments = parsed.pathname.split('/').filter(Boolean);
		if (!segments.length) return '';
		const first = cleanText(segments[0], 80).toLowerCase();
		if (['p', 'reel', 'tv', 'reels', 'explore', 'accounts', 'stories', 'direct'].includes(first)) {
			return '';
		}
		return cleanText(segments[0], 120);
	} catch {
		return cleanText(raw.replace(/^@/, '').split('/')[0], 120);
	}
}

function normalizeInstagramTimestamp(unixSeconds) {
	const numeric = Number(unixSeconds);
	if (!Number.isFinite(numeric) || numeric <= 0) return null;
	const date = new Date(numeric * 1000);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePublicInstagramPost(node = null) {
	if (!node || typeof node !== 'object') return null;
	const shortcode = cleanText(node.shortcode, 120);
	if (!shortcode) return null;
	const productType = cleanText(node.product_type, 60).toUpperCase();
	const type = productType === 'CLIPS' ? 'reel' : 'p';
	const permalink = `https://www.instagram.com/${type}/${shortcode}/`;
	const caption =
		cleanText(node?.edge_media_to_caption?.edges?.[0]?.node?.text, 2200) ||
		cleanText(node?.accessibility_caption, 2200) ||
		null;
	return {
		id: `${type}_${shortcode}`,
		type,
		shortcode,
		permalink,
		embed_url: `${permalink}embed/`,
		source: 'public_profile',
		caption,
		media_type: node?.is_video ? 'VIDEO' : 'IMAGE',
		media_url: cleanText(node?.display_url || node?.thumbnail_src, 2000) || null,
		timestamp: normalizeInstagramTimestamp(node?.taken_at_timestamp)
	};
}

function resolveTimelineImageUrl(item) {
	const pickFromMedia = (media) => {
		const candidates = Array.isArray(media?.image_versions2?.candidates)
			? media.image_versions2.candidates
			: [];
		for (const candidate of candidates) {
			const url = cleanText(candidate?.url, 2000);
			if (url) return url;
		}
		return cleanText(media?.display_url, 2000) || cleanText(media?.thumbnail_url, 2000) || '';
	};
	const carousel = Array.isArray(item?.carousel_media) ? item.carousel_media : [];
	if (carousel.length) {
		const firstCarouselUrl = pickFromMedia(carousel[0]);
		if (firstCarouselUrl) return firstCarouselUrl;
	}
	return pickFromMedia(item);
}

function normalizeTimelineItem(item = null) {
	if (!item || typeof item !== 'object') return null;
	const shortcode = cleanText(item?.code, 120);
	if (!shortcode) return null;
	const mediaType = Number(item?.media_type || 0);
	const type = mediaType === 2 ? 'reel' : 'p';
	const permalink = `https://www.instagram.com/${type}/${shortcode}/`;
	const caption = cleanText(item?.caption?.text, 2200) || null;
	const mediaUrl = resolveTimelineImageUrl(item) || null;
	return {
		id: `${type}_${shortcode}`,
		type,
		shortcode,
		permalink,
		embed_url: `${permalink}embed/`,
		source: 'public_timeline',
		caption,
		media_type: mediaType === 2 ? 'VIDEO' : mediaType === 8 ? 'CAROUSEL_ALBUM' : 'IMAGE',
		media_url: mediaUrl,
		timestamp: normalizeInstagramTimestamp(item?.taken_at)
	};
}

async function fetchInstagramPublicTimelinePostsByHandle(username) {
	const timelineUrl = `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(username)}/username/?count=${INSTAGRAM_POST_LIMIT}`;
	const response = await fetch(timelineUrl, {
		headers: {
			...BROWSER_LIKE_HEADERS,
			'X-IG-App-ID': INSTAGRAM_WEB_APP_ID,
			Referer: `https://www.instagram.com/${username}/`
		},
		redirect: 'follow',
		signal: AbortSignal.timeout(12_000)
	});
	const rawBody = await response.text();
	const payload = parseJsonSafe(rawBody);
	if (!response.ok) {
		return [];
	}
	const items = Array.isArray(payload?.items) ? payload.items : [];
	const posts = items
		.map((item) => normalizeTimelineItem(item))
		.filter(Boolean)
		.slice(0, INSTAGRAM_POST_LIMIT);
	return posts;
}

async function fetchInstagramPublicPostsByHandle(handle) {
	const username = extractInstagramHandle(handle);
	if (!username) return [];
	const timelinePosts = await fetchInstagramPublicTimelinePostsByHandle(username);
	if (timelinePosts.length) return timelinePosts;

	const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
	const response = await fetch(apiUrl, {
		headers: {
			...BROWSER_LIKE_HEADERS,
			'X-IG-App-ID': INSTAGRAM_WEB_APP_ID,
			Referer: `https://www.instagram.com/${username}/`
		},
		redirect: 'follow',
		signal: AbortSignal.timeout(10_000)
	});
	const rawBody = await response.text();
	const payload = parseJsonSafe(rawBody);
	if (!response.ok) {
		throw new Error(`Instagram public profile request failed (${response.status}).`);
	}
	if (!payload?.data?.user) return [];
	const edges = Array.isArray(payload?.data?.user?.edge_owner_to_timeline_media?.edges)
		? payload.data.user.edge_owner_to_timeline_media.edges
		: [];
	const posts = edges
		.map((edge) => normalizePublicInstagramPost(edge?.node))
		.filter(Boolean)
		.slice(0, INSTAGRAM_POST_LIMIT);
	return posts;
}

function extractManualInstagramPosts(group) {
	const links =
		group?.social_links && typeof group.social_links === 'object' ? group.social_links : {};
	const list = Array.isArray(links.instagram_posts) ? links.instagram_posts : [];
	const seen = new Set();
	const posts = [];
	for (const entry of list) {
		const parsed = parseInstagramPostUrl(entry);
		if (!parsed) continue;
		if (seen.has(parsed.id)) continue;
		seen.add(parsed.id);
		posts.push({
			...parsed,
			source: 'manual',
			caption: null,
			media_type: null,
			media_url: null,
			timestamp: null
		});
	}
	return posts.slice(0, INSTAGRAM_POST_LIMIT);
}

async function fetchConnectedInstagramPosts(serviceSupabase, groupId) {
	if (!serviceSupabase || !groupId) return { profile: null, posts: [] };
	const { data: account, error } = await serviceSupabase
		.from('group_social_accounts')
		.select(
			'id,group_id,platform,status,username,account_name,metadata,token_expires_at,access_token_encrypted,meta_instagram_account_id,created_at,updated_at'
		)
		.eq('group_id', groupId)
		.eq('platform', 'instagram')
		.eq('status', 'active')
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (error) throw error;
	if (!account) return { profile: null, posts: [] };

	const profile = extractConnectedInstagramProfile(account);
	const tokenResult = await resolveMetaAccountAccessToken(serviceSupabase, account);
	const accessToken = cleanText(tokenResult?.accessToken, 5000);
	const igAccountId = cleanText(account.meta_instagram_account_id, 120);
	if (!accessToken || !igAccountId) {
		return { profile, posts: [] };
	}

	const callInstagramReadEdge = async (path, query) => {
		try {
			return await callInstagramApi({
				path,
				accessToken,
				query
			});
		} catch (primaryError) {
			return callMetaApi({
				path,
				accessToken,
				query
			}).catch(() => {
				throw primaryError;
			});
		}
	};

	const mediaPayload = await callInstagramReadEdge(`/${igAccountId}/media`, {
		fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
		limit: INSTAGRAM_POST_LIMIT
	});
	const rows = Array.isArray(mediaPayload?.data) ? mediaPayload.data : [];
	const posts = rows
		.map((entry) => {
			const parsed = parseInstagramPostUrl(entry?.permalink);
			if (!parsed) return null;
			return {
				...parsed,
				source: 'connected',
				caption: cleanText(entry?.caption, 2200) || null,
				media_type: cleanText(entry?.media_type, 80) || null,
				media_url:
					cleanText(entry?.thumbnail_url, 2000) || cleanText(entry?.media_url, 2000) || null,
				timestamp: cleanText(entry?.timestamp, 80) || null
			};
		})
		.filter(Boolean);

	return { profile, posts };
}

export const load = async ({ params, cookies, fetch }) => {
	const slug = params.slug;

	let group = null;
	try {
		group = await fetchSingle(fetch, 'groups', {
			slug: `eq.${slug}`,
			single: 'true'
		});
	} catch (err) {
		console.warn('Failed to load group details', err);
		return { error: err?.message ?? 'Failed to load group' };
	}
	if (!group) {
		return { error: 'Group not found' };
	}

	const { user: sessionUser, accessToken } = resolveSession(cookies);
	const sessionUserId = sessionUser?.id ?? null;
	const requestSupabase = createRequestSupabaseClient(accessToken);
	const serviceSupabase = createServiceSupabaseClient();
	let sessionIsAdmin = false;
	if (sessionUserId) {
		try {
			const profileRow = await fetchSingle(fetch, 'profiles', {
				user_id: `eq.${sessionUserId}`,
				select: 'admin',
				single: 'true'
			});
			sessionIsAdmin = profileRow?.admin === true;
		} catch (err) {
			console.warn('Failed to resolve session profile for group page', err);
			sessionIsAdmin = false;
		}
	}

	const [
		groupTypes,
		audienceFocuses,
		ridingDisciplines,
		skillLevels,
		groupTypeSelections,
		audienceSelections,
		disciplineSelections,
		skillSelections,
		ownerRows,
		managerRows
	] = await Promise.all([
		fetchList(fetch, 'group-types', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load group types', err);
			return [];
		}),
		fetchList(fetch, 'audience-focuses', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load audience focuses', err);
			return [];
		}),
		fetchList(fetch, 'riding-disciplines', { select: 'id,name', order: 'name.asc' }).catch(
			(err) => {
				console.warn('Failed to load riding disciplines', err);
				return [];
			}
		),
		fetchList(fetch, 'skill-levels', { select: 'id,name', order: 'name.asc' }).catch((err) => {
			console.warn('Failed to load skill levels', err);
			return [];
		}),
		fetchList(fetch, 'group-x-group-types', {
			select: 'group_type_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load group type selections', err);
			return [];
		}),
		fetchList(fetch, 'group-x-audience-focuses', {
			select: 'audience_focus_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load audience focus selections', err);
			return [];
		}),
		fetchList(fetch, 'group-x-riding-disciplines', {
			select: 'riding_discipline_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load riding discipline selections', err);
			return [];
		}),
		fetchList(fetch, 'group-x-skill-levels', {
			select: 'skill_level_id',
			group_id: `eq.${group.id}`
		}).catch((err) => {
			console.warn('Failed to load skill level selections', err);
			return [];
		}),
		fetchList(fetch, 'group-members', {
			select: 'user_id',
			group_id: `eq.${group.id}`,
			role: 'eq.owner'
		}).catch((err) => {
			console.warn('Failed to load group owners', err);
			return [];
		}),
		fetchList(fetch, 'group-members', {
			select: 'user_id,role',
			group_id: `eq.${group.id}`,
			role: 'in.(owner,admin)'
		}).catch((err) => {
			console.warn('Failed to load group social managers', err);
			return [];
		})
	]);

	const ownerIds = ownerRows.map((row) => row?.user_id).filter(Boolean);
	const managerIds = managerRows.map((row) => row?.user_id).filter(Boolean);
	const is_owner = sessionUserId ? ownerIds.includes(sessionUserId) : false;
	const is_social_manager = sessionUserId ? managerIds.includes(sessionUserId) : false;
	const can_edit = sessionIsAdmin || is_owner;
	const is_claimed = ownerIds.length > 0;
	const can_manage_social = is_claimed && is_social_manager;

	let donationEnabled = false;
	try {
		const { data } = await supabase
			.from('donation_accounts')
			.select('stripe_account_id,charges_enabled')
			.eq('group_id', group.id)
			.maybeSingle();
		donationEnabled = Boolean(data?.stripe_account_id && data?.charges_enabled);
	} catch (err) {
		console.warn('Failed to load donation account for group page', err);
	}

	let membershipProgram = null;
	let membershipTiers = [];
	let membershipFormFields = [];
	try {
		const response = await fetch(
			`/api/groups/${encodeURIComponent(slug)}/membership/program?include_inactive=false`
		);
		const payload = await response.json().catch(() => ({}));
		if (response.ok && payload?.data) {
			membershipProgram = payload.data.program ?? null;
			membershipTiers = Array.isArray(payload.data.tiers) ? payload.data.tiers : [];
			membershipFormFields = Array.isArray(payload.data.form_fields) ? payload.data.form_fields : [];
		}
	} catch (err) {
		console.warn('Failed to load membership program for group page', err);
	}

	let connectedInstagram = null;
	let instagramPosts = [];
	let instagramPostsSource = 'none';
	try {
		if (serviceSupabase) {
			const connected = await fetchConnectedInstagramPosts(serviceSupabase, group.id);
			connectedInstagram = connected.profile;
			instagramPosts = connected.posts;
			instagramPostsSource = connected.posts.length ? 'connected' : 'none';
		}
	} catch (err) {
		console.warn('Failed to load connected Instagram posts for group page', err);
		connectedInstagram = null;
		instagramPosts = [];
		instagramPostsSource = 'none';
	}

	if (!instagramPosts.length) {
		const profileHandle = extractInstagramHandle(group?.social_links?.instagram || '');
		if (profileHandle) {
			try {
				const discoveredPosts = await fetchInstagramPublicPostsByHandle(profileHandle);
				if (discoveredPosts.length) {
					instagramPosts = discoveredPosts;
					instagramPostsSource = 'public_profile';
				}
			} catch (err) {
				console.warn('Failed to load public Instagram profile posts for group page', err);
			}
		}
	}

	if (!instagramPosts.length) {
		const manualPosts = extractManualInstagramPosts(group);
		if (manualPosts.length) {
			instagramPosts = manualPosts;
			instagramPostsSource = 'manual';
		}
	}

	let assetBuckets = [];
	try {
		assetBuckets = await listGroupAssetBuckets(getGroupAssetsReadClient(), group.id);
	} catch (err) {
		console.warn('Failed to load group asset buckets for group page', err);
		assetBuckets = [];
	}

	const nowIso = new Date().toISOString();

	let groupNewsPosts = [];
	try {
		groupNewsPosts = await listPublishedGroupNewsPosts(supabase, group.id, { limit: 3 });
	} catch (err) {
		console.warn('Failed to load group news for group page', err);
		groupNewsPosts = [];
	}

	async function loadVolunteerEvents() {
		try {
			const eventRows = await fetchList(fetch, 'volunteer-events', {
				select: [
					'id',
					'slug',
					'title',
					'summary',
					'event_start',
					'event_end',
					'timezone',
					'location_name',
					'location_address',
					'host_group_id',
					'host_user_id'
				].join(','),
				host_group_id: `eq.${group.id}`,
				status: 'eq.published',
				event_start: `gte.${nowIso}`,
				order: 'event_start.asc',
				limit: '3'
			});

			let eventHostIds = new Set();
			if (sessionUserId && Array.isArray(eventRows) && eventRows.length) {
				const eventIds = eventRows
					.map((row) => row?.id)
					.filter((value) => value !== null && value !== undefined);
				if (eventIds.length) {
					try {
						const hostRows = await fetchList(fetch, 'v-volunteer-event-hosts-with-profiles', {
							event_id: `in.(${eventIds.join(',')})`,
							user_id: `eq.${sessionUserId}`
						});
						eventHostIds = new Set(hostRows.map((row) => row?.event_id).filter(Boolean));
					} catch (err) {
						console.warn('Failed to load volunteer event host assignments for group page', err);
					}
				}
			}

			return Array.isArray(eventRows)
				? eventRows.map((row) => ({
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
						can_manage:
							sessionIsAdmin ||
							is_owner ||
							(sessionUserId && row.host_user_id && row.host_user_id === sessionUserId) ||
							(sessionUserId && eventHostIds.has(row.id))
					}))
				: [];
		} catch (err) {
			console.warn('Unexpected error loading volunteer events for group page', err);
			return [];
		}
	}

	async function loadRides() {
		try {
			const qs = new URLSearchParams({ host_group_id: group.id }).toString();
			const response = await fetch(`/api/rides?${qs}`);
			if (!response.ok) throw new Error('Failed to load rides');
			const payload = await response.json();
			return Array.isArray(payload?.data) ? payload.data : [];
		} catch (err) {
			console.warn('Unexpected error loading rides for group page', err);
			return [];
		}
	}

	const [volunteerEvents, rides] = await Promise.all([loadVolunteerEvents(), loadRides()]);

	return {
		group,
		group_types: groupTypes,
		audience_focuses: audienceFocuses,
		riding_disciplines: ridingDisciplines,
		skill_levels: skillLevels,
		selected: {
			group_type_ids: groupTypeSelections
				.map((r) => r?.group_type_id)
				.filter((value) => value !== null && value !== undefined),
			audience_focus_ids: audienceSelections
				.map((r) => r?.audience_focus_id)
				.filter((value) => value !== null && value !== undefined),
			riding_discipline_ids: disciplineSelections
				.map((r) => r?.riding_discipline_id)
				.filter((value) => value !== null && value !== undefined),
			skill_level_ids: skillSelections
				.map((r) => r?.skill_level_id)
				.filter((value) => value !== null && value !== undefined)
		},
		owners_count: ownerIds.length,
		is_claimed,
		is_owner,
		is_social_manager,
		can_manage_social,
		connected_instagram: connectedInstagram,
		instagram_posts: instagramPosts,
		instagram_posts_source: instagramPostsSource,
		asset_buckets: assetBuckets,
		session_user_id: sessionUserId,
		can_edit,
		donation_enabled: donationEnabled,
		membership_program: membershipProgram,
		membership_tiers: membershipTiers,
		membership_form_fields: membershipFormFields,
		group_news_posts: groupNewsPosts,
		volunteer_events: volunteerEvents,
		rides
	};
};
