import {
	normalizePlatforms,
	normalizePostStatus,
	normalizePostTarget,
	safeCaption,
	safeErrorMessage,
	safePrompt,
	safeTitle
} from '$lib/server/social/types';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

function normalizeJsonObject(value, fallback = {}) {
	if (value && typeof value === 'object' && !Array.isArray(value)) return value;
	return fallback;
}

function normalizeJsonArray(value) {
	if (Array.isArray(value)) return value;
	return [];
}

function toIso(value) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function summarizeSocialAccount(account) {
	if (!account) return null;
	return {
		id: account.id,
		group_id: account.group_id,
		platform: account.platform,
		account_name: account.account_name || null,
		username: account.username || null,
		meta_user_id: account.meta_user_id || null,
		meta_page_id: account.meta_page_id || null,
		meta_instagram_account_id: account.meta_instagram_account_id || null,
		token_expires_at: account.token_expires_at || null,
		scopes: normalizeJsonArray(account.scopes),
		status: account.status || 'active',
		metadata: normalizeJsonObject(account.metadata),
		created_at: account.created_at || null,
		updated_at: account.updated_at || null,
		last_sync_at: account.last_sync_at || null,
		last_error: account.last_error || null,
		connected: account.status === 'active'
	};
}

export async function listGroupSocialAccounts(supabase, groupId, { includeTokens = false } = {}) {
	let select =
		'id,group_id,platform,meta_user_id,meta_page_id,meta_instagram_account_id,account_name,username,token_expires_at,scopes,status,metadata,created_by,created_at,updated_at,last_sync_at,last_error';
	if (includeTokens) {
		select += ',access_token_encrypted,refresh_token_encrypted';
	}
	const { data, error, count } = await supabase
		.from('group_social_accounts')
		.select(select)
		.eq('group_id', groupId)
		.order('created_at', { ascending: true });
	if (error) throw new Error(error.message);
	return Array.isArray(data) ? data : [];
}

export async function getGroupSocialAccountByPlatform(
	supabase,
	groupId,
	platform,
	{ includeTokens = false } = {}
) {
	let select =
		'id,group_id,platform,meta_user_id,meta_page_id,meta_instagram_account_id,account_name,username,token_expires_at,scopes,status,metadata,created_by,created_at,updated_at,last_sync_at,last_error';
	if (includeTokens) select += ',access_token_encrypted,refresh_token_encrypted';
	const { data, error } = await supabase
		.from('group_social_accounts')
		.select(select)
		.eq('group_id', groupId)
		.eq('platform', platform)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

export async function upsertGroupSocialAccount(supabase, payload) {
	const nowIso = new Date().toISOString();
	const insertPayload = {
		group_id: payload.group_id,
		platform: payload.platform,
		meta_user_id: cleanText(payload.meta_user_id, 120) || null,
		meta_page_id: cleanText(payload.meta_page_id, 120) || null,
		meta_instagram_account_id: cleanText(payload.meta_instagram_account_id, 120) || null,
		account_name: cleanText(payload.account_name, 240) || 'Connected account',
		username: cleanText(payload.username, 120) || null,
		access_token_encrypted: payload.access_token_encrypted,
		refresh_token_encrypted: payload.refresh_token_encrypted || null,
		token_expires_at: toIso(payload.token_expires_at),
		scopes: Array.isArray(payload.scopes) ? payload.scopes : [],
		status: cleanText(payload.status, 40) || 'active',
		metadata: normalizeJsonObject(payload.metadata),
		created_by: payload.created_by || null,
		updated_at: nowIso,
		last_sync_at: payload.last_sync_at ? toIso(payload.last_sync_at) : null,
		last_error: cleanText(payload.last_error, 1000) || null
	};

	const { data, error } = await supabase
		.from('group_social_accounts')
		.upsert(insertPayload, { onConflict: 'group_id,platform' })
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data;
}

export async function setGroupSocialAccountStatus(
	supabase,
	{ groupId, platform, status, lastError = null, metadataPatch = null }
) {
	const payload = {
		status: cleanText(status, 40) || 'error',
		last_error: safeErrorMessage(lastError),
		updated_at: new Date().toISOString()
	};
	if (metadataPatch && typeof metadataPatch === 'object' && !Array.isArray(metadataPatch)) {
		payload.metadata = metadataPatch;
	}
	const { data, error } = await supabase
		.from('group_social_accounts')
		.update(payload)
		.eq('group_id', groupId)
		.eq('platform', platform)
		.select('*')
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

export async function createGroupSocialPost(supabase, payload) {
	const nowIso = new Date().toISOString();
	const insertPayload = {
		group_id: payload.group_id,
		created_by: payload.created_by,
		updated_by: payload.updated_by || payload.created_by || null,
		status: normalizePostStatus(payload.status) || 'draft',
		post_target: normalizePostTarget(payload.post_target),
		platforms: normalizePlatforms(payload.platforms),
		title: safeTitle(payload.title),
		caption: safeCaption(payload.caption),
		ai_prompt: safePrompt(payload.ai_prompt),
		media: normalizeJsonArray(payload.media),
		scheduled_for: toIso(payload.scheduled_for),
		schedule_bucket: toIso(payload.schedule_bucket),
		published_at: toIso(payload.published_at),
		publish_attempts: Number.isFinite(Number(payload.publish_attempts))
			? Math.max(0, Math.floor(Number(payload.publish_attempts)))
			: 0,
		last_publish_error: safeErrorMessage(payload.last_publish_error),
		meta_publish_results: normalizeJsonObject(payload.meta_publish_results),
		created_at: nowIso,
		updated_at: nowIso
	};

	const { data, error } = await supabase
		.from('group_social_posts')
		.insert(insertPayload)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data;
}

export async function listGroupSocialPosts(supabase, groupId, { status = null, limit = 60 } = {}) {
	let query = supabase
		.from('group_social_posts')
		.select('*')
		.eq('group_id', groupId)
		.order('created_at', { ascending: false })
		.limit(Math.max(1, Math.min(200, Number.parseInt(String(limit), 10) || 60)));
	const normalizedStatus = normalizePostStatus(status);
	if (normalizedStatus) {
		query = query.eq('status', normalizedStatus);
	}
	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return Array.isArray(data) ? data : [];
}

export async function getGroupSocialPostById(supabase, groupId, postId) {
	const id = cleanText(postId, 120);
	if (!id) return null;
	const { data, error } = await supabase
		.from('group_social_posts')
		.select('*')
		.eq('group_id', groupId)
		.eq('id', id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

export async function updateGroupSocialPost(supabase, groupId, postId, patch = {}) {
	const id = cleanText(postId, 120);
	if (!id) throw new Error('Post id is required.');

	const payload = { updated_at: new Date().toISOString() };
	if (patch.updated_by) payload.updated_by = patch.updated_by;
	if (patch.status) payload.status = normalizePostStatus(patch.status) || undefined;
	if (patch.post_target !== undefined) payload.post_target = normalizePostTarget(patch.post_target);
	if (patch.platforms) payload.platforms = normalizePlatforms(patch.platforms);
	if (patch.title !== undefined) payload.title = safeTitle(patch.title);
	if (patch.caption !== undefined) payload.caption = safeCaption(patch.caption);
	if (patch.ai_prompt !== undefined) payload.ai_prompt = safePrompt(patch.ai_prompt);
	if (patch.media !== undefined) payload.media = normalizeJsonArray(patch.media);
	if (patch.scheduled_for !== undefined) payload.scheduled_for = toIso(patch.scheduled_for);
	if (patch.schedule_bucket !== undefined) payload.schedule_bucket = toIso(patch.schedule_bucket);
	if (patch.published_at !== undefined) payload.published_at = toIso(patch.published_at);
	if (patch.publish_attempts !== undefined) {
		payload.publish_attempts = Math.max(
			0,
			Math.floor(Number.parseInt(String(patch.publish_attempts), 10) || 0)
		);
	}
	if (patch.last_publish_error !== undefined) {
		payload.last_publish_error = safeErrorMessage(patch.last_publish_error);
	}
	if (patch.meta_publish_results !== undefined) {
		payload.meta_publish_results = normalizeJsonObject(patch.meta_publish_results);
	}

	const { data, error } = await supabase
		.from('group_social_posts')
		.update(payload)
		.eq('group_id', groupId)
		.eq('id', id)
		.select('*')
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

export async function deleteGroupSocialPost(supabase, groupId, postId) {
	const id = cleanText(postId, 120);
	if (!id) throw new Error('Post id is required.');
	const { error } = await supabase
		.from('group_social_posts')
		.delete()
		.eq('group_id', groupId)
		.eq('id', id);
	if (error) throw new Error(error.message);
}

export async function listGroupSocialComments(supabase, groupId, { limit = 80 } = {}) {
	const page = await listGroupSocialCommentsPage(supabase, groupId, { limit, offset: 0 });
	return page.rows;
}

export async function listGroupSocialCommentsPage(
	supabase,
	groupId,
	{ limit = 80, offset = 0 } = {}
) {
	const safeLimit = Math.max(1, Math.min(200, Number.parseInt(String(limit), 10) || 80));
	const safeOffset = Math.max(0, Number.parseInt(String(offset), 10) || 0);
	const { data, error, count } = await supabase
		.from('group_social_comments')
		.select('*', { count: 'exact' })
		.eq('group_id', groupId)
		.order('commented_at', { ascending: false })
		.range(safeOffset, safeOffset + safeLimit - 1);
	if (error) throw new Error(error.message);
	const rows = Array.isArray(data) ? data : [];
	const total = Number.isFinite(Number(count)) ? Number(count) : rows.length;
	return {
		rows,
		total,
		limit: safeLimit,
		offset: safeOffset,
		has_more: safeOffset + rows.length < total
	};
}

function buildGroupSocialCommentUpsertPayload(payload) {
	return {
		group_id: payload.group_id,
		social_account_id: payload.social_account_id,
		social_post_id: payload.social_post_id || null,
		platform: payload.platform,
		meta_comment_id: cleanText(payload.meta_comment_id, 200),
		meta_media_id: cleanText(payload.meta_media_id, 200) || null,
		meta_parent_comment_id: cleanText(payload.meta_parent_comment_id, 200) || null,
		author_name: cleanText(payload.author_name, 200) || null,
		author_username: cleanText(payload.author_username, 200) || null,
		body: cleanText(payload.body, 8000),
		is_hidden: payload.is_hidden === true,
		can_reply: payload.can_reply !== false,
		raw_payload: normalizeJsonObject(payload.raw_payload),
		commented_at: toIso(payload.commented_at) || new Date().toISOString(),
		last_synced_at: new Date().toISOString()
	};
}

export async function upsertGroupSocialCommentsBatch(supabase, payloads, { chunkSize = 150 } = {}) {
	const normalizedPayloads = Array.isArray(payloads)
		? payloads
				.map((payload) => buildGroupSocialCommentUpsertPayload(payload))
				.filter(
					(payload) =>
						payload.group_id &&
						payload.social_account_id &&
						cleanText(payload.platform, 40) &&
						cleanText(payload.meta_comment_id, 200)
				)
		: [];
	if (!normalizedPayloads.length) return 0;

	const safeChunkSize = Math.max(1, Number.parseInt(String(chunkSize), 10) || 1);
	let processed = 0;

	for (let index = 0; index < normalizedPayloads.length; index += safeChunkSize) {
		const chunk = normalizedPayloads.slice(index, index + safeChunkSize);
		const { error } = await supabase
			.from('group_social_comments')
			.upsert(chunk, { onConflict: 'platform,meta_comment_id' });
		if (error) throw new Error(error.message);
		processed += chunk.length;
	}

	return processed;
}

export async function upsertGroupSocialComment(supabase, payload) {
	const upsertPayload = buildGroupSocialCommentUpsertPayload(payload);

	const { data, error } = await supabase
		.from('group_social_comments')
		.upsert(upsertPayload, { onConflict: 'platform,meta_comment_id' })
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data;
}

export async function getGroupSocialCommentById(supabase, groupId, commentId) {
	const id = cleanText(commentId, 120);
	if (!id) return null;
	const { data, error } = await supabase
		.from('group_social_comments')
		.select('*')
		.eq('group_id', groupId)
		.eq('id', id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

export async function createGroupSocialCommentReply(supabase, payload) {
	const nowIso = new Date().toISOString();
	const insertPayload = {
		group_comment_id: payload.group_comment_id,
		group_id: payload.group_id,
		social_account_id: payload.social_account_id,
		created_by: payload.created_by,
		body: cleanText(payload.body, 5000),
		status: cleanText(payload.status, 40) || 'sent',
		meta_reply_id: cleanText(payload.meta_reply_id, 200) || null,
		error_text: safeErrorMessage(payload.error_text),
		created_at: nowIso,
		updated_at: nowIso
	};

	const { data, error } = await supabase
		.from('group_social_comment_replies')
		.insert(insertPayload)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data;
}

export async function listGroupSocialCommentReplies(supabase, groupId, { limit = 200 } = {}) {
	const safeLimit = Math.max(1, Math.min(500, Number.parseInt(String(limit), 10) || 200));
	const { data, error } = await supabase
		.from('group_social_comment_replies')
		.select('*')
		.eq('group_id', groupId)
		.order('created_at', { ascending: false })
		.limit(safeLimit);
	if (error) throw new Error(error.message);
	return Array.isArray(data) ? data : [];
}

export async function listGroupSocialCommentRepliesByCommentIds(
	supabase,
	groupId,
	commentIds = [],
	{ limit = 400 } = {}
) {
	const ids = Array.from(
		new Set((commentIds || []).map((value) => cleanText(value, 120)).filter(Boolean))
	);
	if (!ids.length) return [];
	const safeLimit = Math.max(1, Math.min(1000, Number.parseInt(String(limit), 10) || 400));
	const { data, error } = await supabase
		.from('group_social_comment_replies')
		.select('*')
		.eq('group_id', groupId)
		.in('group_comment_id', ids)
		.order('created_at', { ascending: false })
		.limit(safeLimit);
	if (error) throw new Error(error.message);
	return Array.isArray(data) ? data : [];
}

export function serializeSocialPost(post) {
	if (!post) return null;
	return {
		...post,
		post_target: normalizePostTarget(post.post_target),
		platforms: normalizePlatforms(post.platforms),
		media: normalizeJsonArray(post.media),
		meta_publish_results: normalizeJsonObject(post.meta_publish_results)
	};
}

export async function createGroupSocialOauthPendingConnection(supabase, payload) {
	const insertPayload = {
		group_id: payload.group_id,
		user_id: payload.user_id,
		provider: payload.provider,
		access_token_encrypted: payload.access_token_encrypted,
		token_expires_at: toIso(payload.token_expires_at),
		scopes: Array.isArray(payload.scopes) ? payload.scopes : [],
		options: Array.isArray(payload.options) ? payload.options : [],
		expires_at: toIso(payload.expires_at) || new Date(Date.now() + 10 * 60 * 1000).toISOString()
	};
	const { data, error } = await supabase
		.from('group_social_oauth_pending_connections')
		.insert(insertPayload)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data;
}

export async function listGroupSocialOauthPendingConnections(
	supabase,
	{ groupId, userId, provider = null } = {}
) {
	let query = supabase
		.from('group_social_oauth_pending_connections')
		.select('id,group_id,user_id,provider,token_expires_at,scopes,options,expires_at,created_at')
		.eq('group_id', groupId)
		.eq('user_id', userId)
		.gt('expires_at', new Date().toISOString())
		.order('created_at', { ascending: false });
	if (provider) query = query.eq('provider', provider);
	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return Array.isArray(data) ? data : [];
}

export async function getGroupSocialOauthPendingConnectionById(
	supabase,
	{ pendingId, groupId, userId, provider = null } = {}
) {
	let query = supabase
		.from('group_social_oauth_pending_connections')
		.select('*')
		.eq('id', cleanText(pendingId, 120))
		.eq('group_id', groupId)
		.eq('user_id', userId)
		.gt('expires_at', new Date().toISOString())
		.maybeSingle();
	if (provider) query = query.eq('provider', provider);
	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return data ?? null;
}

export async function deleteGroupSocialOauthPendingConnection(supabase, pendingId) {
	const id = cleanText(pendingId, 120);
	if (!id) return;
	const { error } = await supabase
		.from('group_social_oauth_pending_connections')
		.delete()
		.eq('id', id);
	if (error) throw new Error(error.message);
}

export async function purgeExpiredGroupSocialOauthPendingConnections(supabase) {
	const { error } = await supabase
		.from('group_social_oauth_pending_connections')
		.delete()
		.lt('expires_at', new Date().toISOString());
	if (error) {
		console.warn('Unable to purge expired social oauth pending connections', error);
	}
}
