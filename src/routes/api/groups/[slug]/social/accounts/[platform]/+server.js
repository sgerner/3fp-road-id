import { json } from '@sveltejs/kit';
import { requireGroupSocialManager } from '$lib/server/social/permissions';
import { normalizePlatform } from '$lib/server/social/types';

export async function DELETE({ cookies, params }) {
	const platform = normalizePlatform(params.platform);
	if (!platform) {
		return json({ error: 'Unsupported social platform.' }, { status: 400 });
	}

	try {
		const auth = await requireGroupSocialManager(cookies, params.slug || '');
		if (!auth?.ok) {
			return json({ error: auth?.error || 'Forbidden' }, { status: auth?.status || 403 });
		}

		const { data, error } = await auth.serviceSupabase
			.from('group_social_accounts')
			.update({
				status: 'revoked',
				last_error: null,
				updated_at: new Date().toISOString(),
				metadata: {
					disconnected_at: new Date().toISOString(),
					disconnected_by: auth.userId,
					disconnect_mode: 'soft'
				}
			})
			.eq('group_id', auth.group.id)
			.eq('platform', platform)
			.select('id,platform,status,updated_at')
			.maybeSingle();

		if (error) throw new Error(error.message);
		if (!data) {
			return json({ error: 'Connected account not found.' }, { status: 404 });
		}

		return json({ data });
	} catch (error) {
		console.error('Unable to disconnect social account', error);
		return json({ error: error?.message || 'Unable to disconnect account.' }, { status: 500 });
	}
}
