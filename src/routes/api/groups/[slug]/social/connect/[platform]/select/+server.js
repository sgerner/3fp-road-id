import { json } from '@sveltejs/kit';
import { encryptSocialToken, decryptSocialToken } from '$lib/server/social/crypto';
import {
	deleteGroupSocialOauthPendingConnection,
	getGroupSocialOauthPendingConnectionById,
	upsertGroupSocialAccount
} from '$lib/server/social/db';
import { requireGroupSocialManager } from '$lib/server/social/permissions';
import { resolveMetaConnectionFromOption } from '$lib/server/social/meta/oauth';
import { normalizePlatform } from '$lib/server/social/types';

function cleanText(value, maxLength = 0) {
	if (value === null || value === undefined) return '';
	const cleaned = String(value).trim();
	if (!maxLength) return cleaned;
	return cleaned.slice(0, maxLength);
}

export async function POST({ cookies, params, request }) {
	const platform = normalizePlatform(params.platform);
	if (!platform) {
		return json({ error: 'Unsupported social platform.' }, { status: 400 });
	}

	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const payload = await request.json().catch(() => ({}));
		const pendingId = cleanText(payload.pending_id, 120);
		const optionId = cleanText(payload.option_id, 120);
		if (!pendingId || !optionId) {
			return json({ error: 'pending_id and option_id are required.' }, { status: 400 });
		}

		const pending = await getGroupSocialOauthPendingConnectionById(auth.serviceSupabase, {
			pendingId,
			groupId: auth.group.id,
			userId: auth.userId,
			provider: platform
		});
		if (!pending) {
			return json({ error: 'Pending social connection not found or expired.' }, { status: 404 });
		}

		const options = Array.isArray(pending.options) ? pending.options : [];
		const selectedOption = options.find((entry) => cleanText(entry?.option_id, 120) === optionId);
		if (!selectedOption) {
			return json({ error: 'Selected account option was not found.' }, { status: 400 });
		}

		const accessToken = decryptSocialToken(pending.access_token_encrypted);
		const connectedAccount = resolveMetaConnectionFromOption({
			provider: platform,
			option: selectedOption,
			accessToken
		});

		const account = await upsertGroupSocialAccount(auth.serviceSupabase, {
			group_id: auth.group.id,
			platform,
			meta_user_id: connectedAccount.meta_user_id,
			meta_page_id: connectedAccount.meta_page_id,
			meta_instagram_account_id: connectedAccount.meta_instagram_account_id,
			account_name: connectedAccount.account_name,
			username: connectedAccount.username,
			access_token_encrypted: encryptSocialToken(connectedAccount.accessToken),
			refresh_token_encrypted: null,
			token_expires_at: pending.token_expires_at,
			scopes: Array.isArray(pending.scopes) ? pending.scopes : [],
			status: 'active',
			metadata: {
				...(connectedAccount.metadata || {}),
				oauth_connected_at: new Date().toISOString(),
				selected_option_id: optionId
			},
			created_by: auth.userId,
			last_error: null
		});

		await deleteGroupSocialOauthPendingConnection(auth.serviceSupabase, pending.id);
		return json({
			data: {
				id: account.id,
				platform: account.platform,
				status: account.status,
				account_name: account.account_name,
				username: account.username
			}
		});
	} catch (error) {
		console.error('Unable to finalize selected social account connection', error);
		return json(
			{ error: error?.message || 'Unable to finalize social connection.' },
			{ status: 500 }
		);
	}
}
