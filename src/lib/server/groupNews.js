import { error } from '@sveltejs/kit';
import { renderLearnMarkdown } from '$lib/learn/markdown';
import { estimateReadMinutes } from '$lib/learn/readingAid';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '$lib/server/supabaseClient';
import { resolveSession } from '$lib/server/session';

function safeTrim(value) {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function trimTrailingSlash(value) {
	return safeTrim(value).replace(/\/+$/, '');
}

function isValidEmailAddress(value) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeTrim(value).toLowerCase());
}

export function slugifyGroupNews(value) {
	return safeTrim(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
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

export function isGroupNewsPublished(post) {
	return Boolean(post?.published_at);
}

export function normalizeGroupNewsPayload(formData) {
	const title = safeTrim(formData.get('title'));
	const summary = safeTrim(formData.get('summary')) || null;
	const bodyMarkdown = safeTrim(formData.get('bodyMarkdown'));
	const requestedSlug = safeTrim(formData.get('slug'));

	if (!title) {
		throw error(400, 'A title is required.');
	}

	if (!bodyMarkdown) {
		throw error(400, 'Update content is required.');
	}

	return {
		title,
		slug: requestedSlug,
		summary,
		body_markdown: bodyMarkdown
	};
}

export function getGroupNewsIntent(formData) {
	const intent = safeTrim(formData.get('intent'));
	if (['save_draft', 'publish', 'delete'].includes(intent)) {
		return intent;
	}
	return 'save_draft';
}

export function getGroupNewsPostId(formData) {
	return safeTrim(formData.get('postId')) || null;
}

export function toGroupNewsFormValues(post = null) {
	if (!post) {
		return {
			postId: '',
			title: '',
			slug: '',
			summary: '',
			bodyMarkdown: ''
		};
	}

	return {
		postId: post.id || '',
		title: post.title || '',
		slug: post.slug || '',
		summary: post.summary || '',
		bodyMarkdown: post.body_markdown || ''
	};
}

export function getGroupNewsClient(cookies) {
	const { accessToken, user } = resolveSession(cookies);
	return {
		user,
		supabase: createRequestSupabaseClient(accessToken)
	};
}

export function getGroupNewsServiceClient() {
	return createServiceSupabaseClient();
}

export async function ensureUniqueGroupNewsSlug(supabase, groupId, source, excludeId = null) {
	const base = slugifyGroupNews(source) || 'update';
	let attempt = 0;
	let candidate = base;

	while (attempt < 50) {
		let query = supabase
			.from('group_news_posts')
			.select('id', { count: 'exact', head: true })
			.eq('group_id', groupId)
			.eq('slug', candidate);
		if (excludeId) query = query.neq('id', excludeId);
		const { count, error: queryError } = await query;
		if (queryError) throw queryError;
		if (!count) return candidate;
		attempt += 1;
		candidate = `${base}-${attempt + 1}`;
	}

	return `${base}-${Date.now()}`;
}

export async function getGroupBySlug(supabase, slug) {
	const { data, error: queryError } = await supabase
		.from('groups')
		.select('*')
		.eq('slug', slug)
		.maybeSingle();

	if (queryError) throw queryError;
	return data;
}

export async function requireGroupNewsManager(cookies, groupSlug) {
	const { user, supabase } = getGroupNewsClient(cookies);
	if (!user?.id) {
		throw error(401, 'Authentication required.');
	}

	const group = await getGroupBySlug(supabase, groupSlug);
	if (!group) {
		throw error(404, 'Group not found.');
	}

	const [{ data: profile }, { data: managerRows, error: memberError }] = await Promise.all([
		supabase.from('profiles').select('admin').eq('user_id', user.id).maybeSingle(),
		supabase
			.from('group_members')
			.select('role')
			.eq('group_id', group.id)
			.eq('user_id', user.id)
			.eq('role', 'owner')
	]);

	if (memberError) throw memberError;

	const isAdmin = Boolean(profile?.admin);
	const isManager = Array.isArray(managerRows) && managerRows.length > 0;

	if (!isAdmin && !isManager) {
		throw error(403, 'You do not have permission to manage group updates.');
	}

	return {
		user,
		supabase,
		group,
		isAdmin,
		isManager
	};
}

export async function listGroupNewsPostsForManagement(supabase, groupId) {
	const { data, error: queryError } = await supabase
		.from('group_news_posts')
		.select('*')
		.eq('group_id', groupId)
		.order('published_at', { ascending: false, nullsFirst: false })
		.order('updated_at', { ascending: false });

	if (queryError) throw queryError;
	return (data ?? []).map((post) => ({
		...post,
		is_published: isGroupNewsPublished(post),
		preview_text: buildGroupNewsPreviewText(post)
	}));
}

export async function listPublishedGroupNewsPosts(supabase, groupId, { limit = null } = {}) {
	let query = supabase
		.from('group_news_posts')
		.select('*')
		.eq('group_id', groupId)
		.not('published_at', 'is', null)
		.order('published_at', { ascending: false, nullsFirst: false })
		.order('created_at', { ascending: false });

	if (typeof limit === 'number' && limit > 0) {
		query = query.limit(limit);
	}

	const { data, error: queryError } = await query;
	if (queryError) throw queryError;
	return (data ?? []).map((post) => ({
		...post,
		preview_text: buildGroupNewsPreviewText(post)
	}));
}

export async function getGroupNewsPostBySlug(
	supabase,
	groupId,
	newsSlug,
	{ includeDrafts = false } = {}
) {
	let query = supabase
		.from('group_news_posts')
		.select('*')
		.eq('group_id', groupId)
		.eq('slug', newsSlug);

	if (!includeDrafts) {
		query = query.not('published_at', 'is', null);
	}

	const { data, error: queryError } = await query.maybeSingle();
	if (queryError) throw queryError;
	if (!data) return null;
	return {
		...data,
		is_published: isGroupNewsPublished(data),
		preview_text: buildGroupNewsPreviewText(data)
	};
}

export async function getGroupNewsPostById(
	supabase,
	groupId,
	postId,
	{ includeDrafts = false } = {}
) {
	if (!postId) return null;

	let query = supabase
		.from('group_news_posts')
		.select('*')
		.eq('group_id', groupId)
		.eq('id', postId);

	if (!includeDrafts) {
		query = query.not('published_at', 'is', null);
	}

	const { data, error: queryError } = await query.maybeSingle();
	if (queryError) throw queryError;
	if (!data) return null;
	return {
		...data,
		is_published: isGroupNewsPublished(data),
		preview_text: buildGroupNewsPreviewText(data)
	};
}

export async function getGroupNewsProfilesMap(supabase, userIds) {
	const uniqueIds = Array.from(new Set((userIds || []).filter(Boolean)));
	if (!uniqueIds.length) return new Map();

	const { data, error: queryError } = await supabase
		.from('profiles')
		.select('user_id, full_name, email, avatar_url')
		.in('user_id', uniqueIds);

	if (queryError) throw queryError;
	return new Map((data ?? []).map((profile) => [profile.user_id, profile]));
}

export async function buildGroupNewsView(post, { profiles = new Map() } = {}) {
	return {
		...post,
		is_published: isGroupNewsPublished(post),
		bodyHtml: await renderLearnMarkdown(post?.body_markdown || ''),
		preview_text: buildGroupNewsPreviewText(post),
		estimatedReadMinutes: estimateReadMinutes(post?.body_markdown || ''),
		authorProfile: profiles.get(post?.created_by_user_id) ?? null,
		editorProfile: profiles.get(post?.updated_by_user_id) ?? null
	};
}

export async function listGroupUpdateEmailRecipients(supabase, groupId) {
	if (!supabase || !groupId) return [];

	const nowMs = Date.now();
	const { data: memberships, error: membershipError } = await supabase
		.from('group_memberships')
		.select('id,user_id,status,started_at,ends_at,created_at')
		.eq('group_id', groupId)
		.eq('status', 'active');

	if (membershipError) throw membershipError;

	const activeMemberships = [...(memberships ?? [])]
		.filter((row) => {
			if (!row?.user_id) return false;
			if (!row.ends_at) return true;
			const endsAtMs = new Date(row.ends_at).getTime();
			return Number.isFinite(endsAtMs) && endsAtMs > nowMs;
		})
		.sort((left, right) => {
			const leftTime = new Date(left?.started_at || left?.created_at || 0).getTime();
			const rightTime = new Date(right?.started_at || right?.created_at || 0).getTime();
			return rightTime - leftTime;
		});

	const membershipByUserId = new Map();
	for (const membership of activeMemberships) {
		if (!membershipByUserId.has(membership.user_id)) {
			membershipByUserId.set(membership.user_id, membership);
		}
	}

	const userIds = [...membershipByUserId.keys()];
	if (!userIds.length) return [];

	const { data: profiles, error: profileError } = await supabase
		.from('profiles')
		.select('user_id,email,full_name')
		.in('user_id', userIds);

	if (profileError) throw profileError;

	const profilesByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

	return userIds
		.map((userId) => {
			const membership = membershipByUserId.get(userId);
			const profile = profilesByUserId.get(userId);
			const recipientEmail = safeTrim(profile?.email).toLowerCase();
			if (!membership?.id || !isValidEmailAddress(recipientEmail)) return null;
			return {
				membership_id: membership.id,
				recipient_user_id: userId,
				recipient_email: recipientEmail,
				recipient_name: safeTrim(profile?.full_name) || null
			};
		})
		.filter(Boolean);
}

export async function countGroupUpdateEmailRecipients(supabase, groupId) {
	const recipients = await listGroupUpdateEmailRecipients(supabase, groupId);
	return recipients.length;
}

export async function buildGroupUpdateEmailSnapshot({ group, post, origin }) {
	const baseOrigin = trimTrailingSlash(origin) || 'https://3fp.org';
	const actionUrl = `${baseOrigin}/groups/${group.slug}/news/${post.slug}`;
	const subjectLine = `${group.name}: ${post.title}`;
	const textSummary = safeTrim(post.summary);
	const bodyMarkdown = [
		`**${group.name}** posted a new update on 3 Feet Please.`,
		textSummary,
		safeTrim(post.body_markdown),
		`[Read the full update on 3 Feet Please](${actionUrl})`
	]
		.filter(Boolean)
		.join('\n\n')
		.trim();

	return {
		campaignName: `Update: ${post.title}`,
		subjectLine,
		bodyMarkdown,
		audienceFilters: {
			source: 'group_update',
			group_news_post_id: post.id,
			group_news_post_slug: post.slug,
			content_format: 'markdown',
			action_url: actionUrl,
			action_label: 'Read the full update',
			recipient_reason: `You are receiving this because you have an active membership with ${group.name}.`
		}
	};
}

export async function queueGroupUpdateEmailBatch(
	serviceSupabase,
	{ group, post, requestedByUserId, origin }
) {
	if (!serviceSupabase) {
		throw error(500, 'A service client is required to queue update emails.');
	}

	const recipients = await listGroupUpdateEmailRecipients(serviceSupabase, group.id);
	if (!recipients.length) {
		return { emailId: null, queuedCount: 0 };
	}

	const snapshot = await buildGroupUpdateEmailSnapshot({ group, post, origin });
	const nowIso = new Date().toISOString();

	const { data: email, error: batchError } = await serviceSupabase
		.from('group_membership_emails')
		.insert({
			group_id: group.id,
			campaign_name: snapshot.campaignName,
			audience_filters: snapshot.audienceFilters,
			subject_template: snapshot.subjectLine,
			body_template: snapshot.bodyMarkdown,
			status: 'scheduled',
			scheduled_at: nowIso,
			sent_count: 0,
			failed_count: 0,
			created_by: requestedByUserId,
			updated_at: nowIso
		})
		.select('id')
		.single();

	if (batchError) throw batchError;

	const deliveries = recipients.map((recipient) => ({
		email_id: email.id,
		membership_id: recipient.membership_id,
		recipient_user_id: recipient.recipient_user_id,
		recipient_email: recipient.recipient_email,
		send_state: 'pending',
		updated_at: nowIso
	}));

	const { error: deliveryError } = await serviceSupabase
		.from('group_membership_email_sends')
		.insert(deliveries);

	if (deliveryError) {
		await serviceSupabase.from('group_membership_emails').delete().eq('id', email.id);
		throw deliveryError;
	}

	return { emailId: email.id, queuedCount: deliveries.length };
}

export async function renderGroupUpdateEmailContent(emailCampaign) {
	const audienceFilters =
		emailCampaign?.audience_filters && typeof emailCampaign.audience_filters === 'object'
			? emailCampaign.audience_filters
			: {};
	const bodyTemplate = safeTrim(emailCampaign?.body_template);
	const contentFormat = safeTrim(audienceFilters.content_format).toLowerCase();
	const actionUrl = safeTrim(audienceFilters.action_url) || undefined;
	const actionLabel = safeTrim(audienceFilters.action_label) || undefined;
	const recipientReason = safeTrim(audienceFilters.recipient_reason) || undefined;

	if (contentFormat === 'markdown') {
		return {
			html: await renderLearnMarkdown(bodyTemplate),
			text: stripGroupNewsMarkdown(bodyTemplate),
			branding: {
				category: 'Group update',
				recipientReason,
				actionUrl,
				actionLabel
			}
		};
	}

	const html = bodyTemplate
		.split(/\n{2,}/)
		.map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
		.join('');

	return {
		html,
		text: bodyTemplate,
		branding: {
			category: 'Group update',
			recipientReason,
			actionUrl,
			actionLabel
		}
	};
}
