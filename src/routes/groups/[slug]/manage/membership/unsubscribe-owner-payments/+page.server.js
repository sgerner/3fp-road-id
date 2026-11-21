import { fail } from '@sveltejs/kit';
import { resolveVerifiedSession } from '#lib/server/session';
import { createServiceSupabaseClient } from '#lib/server/supabaseClient';

function normalizeMetadata(existing) {
	if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return {};
	return { ...existing };
}

async function unsubscribe({ params, cookies }) {
	const { accessToken, user } = await resolveVerifiedSession(cookies);
	if (!accessToken || !user?.id) {
		return fail(401, { error: 'Sign in to change your email preferences.' });
	}

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		return fail(503, { error: 'Email preferences are temporarily unavailable.' });
	}

	const { data: group } = await serviceSupabase
		.from('groups')
		.select('id,slug')
		.eq('slug', params.slug)
		.maybeSingle();
	if (!group?.id) {
		return fail(404, { error: 'Group not found.' });
	}

	const { data: membership } = await serviceSupabase
		.from('group_members')
		.select('user_id,role')
		.eq('group_id', group.id)
		.eq('user_id', user.id)
		.eq('role', 'owner')
		.maybeSingle();
	if (!membership?.user_id) {
		return fail(403, { error: 'Only group owners can change this email preference.' });
	}

	const { data: profile, error: profileError } = await serviceSupabase
		.from('profiles')
		.select('user_id,metadata')
		.eq('user_id', user.id)
		.maybeSingle();
	if (profileError) {
		return fail(503, { error: 'Email preferences are temporarily unavailable.' });
	}

	const metadata = normalizeMetadata(profile?.metadata);
	if (!metadata.notification_preferences || typeof metadata.notification_preferences !== 'object') {
		metadata.notification_preferences = {};
	}
	const notificationPrefs = metadata.notification_preferences;
	if (
		!notificationPrefs.membership_owner_payment_emails ||
		typeof notificationPrefs.membership_owner_payment_emails !== 'object'
	) {
		notificationPrefs.membership_owner_payment_emails = {};
	}
	notificationPrefs.membership_owner_payment_emails[group.id] = false;

	const { error: updateError } = await serviceSupabase.from('profiles').upsert(
		{
			user_id: user.id,
			metadata
		},
		{ onConflict: 'user_id' }
	);
	if (updateError) {
		return fail(503, { error: 'Unable to update your email preferences.' });
	}
	return { unsubscribed: true };
}

export const actions = { default: unsubscribe };
