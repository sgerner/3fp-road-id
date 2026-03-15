import { randomBytes } from 'node:crypto';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

export function buildSocialReturnPath(groupSlug, status = 'ok', reason = null) {
	const slug = cleanText(groupSlug, 120);
	const query = new URLSearchParams();
	query.set('social', status || 'ok');
	if (reason) query.set('social_reason', cleanText(reason, 200));
	return `/groups/${encodeURIComponent(slug)}/manage/social?${query.toString()}`;
}

export async function createGroupSocialOauthState(
	supabase,
	{ groupId, userId, provider, redirectTo = null }
) {
	const stateToken = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
	const payload = {
		group_id: groupId,
		user_id: userId,
		provider,
		state_token: stateToken,
		redirect_to: cleanText(redirectTo, 300) || null,
		expires_at: expiresAt
	};

	const { data, error } = await supabase
		.from('group_social_oauth_states')
		.insert(payload)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	return data;
}

export async function consumeGroupSocialOauthState(supabase, stateToken, provider = null) {
	const cleanState = cleanText(stateToken, 200);
	if (!cleanState) return null;

	let query = supabase
		.from('group_social_oauth_states')
		.select('*')
		.eq('state_token', cleanState)
		.gt('expires_at', new Date().toISOString())
		.limit(1);
	if (provider) query = query.eq('provider', cleanText(provider, 40));

	const { data, error } = await query.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) return null;

	const { error: deleteError } = await supabase
		.from('group_social_oauth_states')
		.delete()
		.eq('id', data.id);
	if (deleteError) throw new Error(deleteError.message);
	return data;
}

export async function purgeExpiredGroupSocialOauthStates(supabase) {
	const { error } = await supabase
		.from('group_social_oauth_states')
		.delete()
		.lt('expires_at', new Date().toISOString());
	if (error) {
		console.warn('Unable to purge expired social oauth states', error);
	}
}
