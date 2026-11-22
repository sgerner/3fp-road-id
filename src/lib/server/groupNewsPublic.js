function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

const PUBLIC_GROUP_NEWS_GROUP_FIELD_LIST = [
	'id',
	'slug',
	'name',
	'tagline',
	'description',
	'logo_url',
	'cover_photo_url',
	'is_published'
];

const PUBLIC_GROUP_NEWS_POST_FIELD_LIST = [
	'id',
	'group_id',
	'created_by_user_id',
	'updated_by_user_id',
	'title',
	'slug',
	'summary',
	'body_markdown',
	'published_at',
	'created_at',
	'updated_at',
	'source_url',
	'source_name',
	'source_published_at',
	'cover_image_url'
];

const PUBLIC_GROUP_NEWS_PROFILE_FIELD_LIST = ['user_id', 'full_name', 'avatar_url'];

export const PUBLIC_GROUP_NEWS_GROUP_COLUMNS = PUBLIC_GROUP_NEWS_GROUP_FIELD_LIST.join(',');
export const PUBLIC_GROUP_NEWS_POST_COLUMNS = PUBLIC_GROUP_NEWS_POST_FIELD_LIST.join(',');
export const PUBLIC_GROUP_NEWS_PROFILE_COLUMNS = PUBLIC_GROUP_NEWS_PROFILE_FIELD_LIST.join(',');

function pickFields(row, keys) {
	if (!row || typeof row !== 'object') return null;
	return Object.fromEntries(
		keys.filter((key) => row[key] !== undefined).map((key) => [key, row[key]])
	);
}

export function stripGroupNewsMarkdown(markdown) {
	return safeTrim(markdown)
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

export function buildGroupNewsPreviewText(post, maxLength = 180) {
	const summary = safeTrim(post?.summary);
	const source = summary || stripGroupNewsMarkdown(post?.body_markdown || '');
	if (!source) return '';
	return source.length > maxLength ? `${source.slice(0, maxLength - 1).trimEnd()}…` : source;
}

export async function getPublicGroupBySlug(serviceSupabase, slug) {
	const normalizedSlug = safeTrim(slug);
	if (!serviceSupabase || !normalizedSlug) return null;

	const { data, error: queryError } = await serviceSupabase
		.from('groups')
		.select(PUBLIC_GROUP_NEWS_GROUP_COLUMNS)
		.eq('slug', normalizedSlug)
		.eq('is_published', true)
		.maybeSingle();

	if (queryError) throw queryError;
	if (!data || data.is_published !== true) return null;

	return pickFields(data, PUBLIC_GROUP_NEWS_GROUP_FIELD_LIST);
}

async function isPublishedPublicGroup(serviceSupabase, groupId) {
	const normalizedGroupId = safeTrim(groupId);
	if (!serviceSupabase || !normalizedGroupId) return false;

	const { data, error: queryError } = await serviceSupabase
		.from('groups')
		.select('id,is_published')
		.eq('id', normalizedGroupId)
		.eq('is_published', true)
		.maybeSingle();

	if (queryError) throw queryError;
	return Boolean(data?.id && data.is_published === true);
}

export async function listPublicGroupNewsPosts(serviceSupabase, groupId, { limit = null } = {}) {
	const normalizedGroupId = safeTrim(groupId);
	if (!serviceSupabase || !normalizedGroupId) return [];

	const groupPublished = await isPublishedPublicGroup(serviceSupabase, normalizedGroupId);
	if (!groupPublished) return [];

	let query = serviceSupabase
		.from('group_news_posts')
		.select(PUBLIC_GROUP_NEWS_POST_COLUMNS)
		.eq('group_id', normalizedGroupId)
		.not('published_at', 'is', null)
		.eq('is_private', false)
		.order('published_at', { ascending: false, nullsFirst: false })
		.order('created_at', { ascending: false });

	if (typeof limit === 'number' && limit > 0) {
		query = query.limit(limit);
	}

	const { data, error: queryError } = await query;
	if (queryError) throw queryError;

	return (data ?? [])
		.filter((post) => Boolean(post?.published_at) && post?.is_private !== true)
		.map((post) => {
			const projected = pickFields(post, PUBLIC_GROUP_NEWS_POST_FIELD_LIST);
			return {
				...projected,
				preview_text: buildGroupNewsPreviewText(projected)
			};
		});
}

export async function getGroupNewsProfilesMap(supabase, userIds) {
	const uniqueIds = Array.from(new Set((userIds || []).filter(Boolean)));
	if (!supabase || !uniqueIds.length) return new Map();

	const { data, error: queryError } = await supabase
		.from('public_profiles')
		.select(PUBLIC_GROUP_NEWS_PROFILE_COLUMNS)
		.in('user_id', uniqueIds);

	if (queryError) throw queryError;
	return new Map(
		(data ?? [])
			.filter((profile) => Boolean(profile?.user_id))
			.map((profile) => [
				profile.user_id,
				pickFields(profile, PUBLIC_GROUP_NEWS_PROFILE_FIELD_LIST)
			])
	);
}
