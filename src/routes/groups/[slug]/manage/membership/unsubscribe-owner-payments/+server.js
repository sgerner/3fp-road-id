import { redirect } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/session';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

function normalizeMetadata(existing) {
	if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return {};
	return { ...existing };
}

export async function GET({ params, cookies, url }) {
	const { accessToken, user } = resolveSession(cookies);
	if (!accessToken || !user?.id) {
		throw redirect(302, `/login?returnTo=${encodeURIComponent(url.pathname + (url.search || ''))}`);
	}

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) {
		throw redirect(302, `/groups/${params.slug}/manage/membership?ownerPaymentEmails=error`);
	}

	const { data: group } = await serviceSupabase
		.from('groups')
		.select('id,slug')
		.eq('slug', params.slug)
		.maybeSingle();
	if (!group?.id) {
		throw redirect(302, `/groups/${params.slug}/manage/membership?ownerPaymentEmails=error`);
	}

	const { data: membership } = await serviceSupabase
		.from('group_members')
		.select('user_id,role')
		.eq('group_id', group.id)
		.eq('user_id', user.id)
		.eq('role', 'owner')
		.maybeSingle();
	if (!membership?.user_id) {
		throw redirect(302, `/groups/${group.slug}/manage/membership?ownerPaymentEmails=forbidden`);
	}

	const { data: profile } = await serviceSupabase
		.from('profiles')
		.select('user_id,metadata')
		.eq('user_id', user.id)
		.maybeSingle();

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

	await serviceSupabase.from('profiles').upsert(
		{
			user_id: user.id,
			metadata
		},
		{ onConflict: 'user_id' }
	);

	throw redirect(302, `/groups/${group.slug}/manage/membership?ownerPaymentEmails=off`);
}
