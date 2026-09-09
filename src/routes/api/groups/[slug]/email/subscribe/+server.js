import { json } from '@sveltejs/kit';
import {
	GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES,
	normalizeGroupEmailSignup,
	shouldSendGroupSubscriberWelcome
} from '$lib/server/groupEmailSubscribers';
import { attemptGroupSubscriberWelcome } from '$lib/server/groupSubscriberWelcome';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

export async function POST({ params, request, url, fetch: fetchImpl }) {
	const payload = await request.json().catch(() => ({}));
	const signup = normalizeGroupEmailSignup(payload);
	if (!signup.ok) return json({ error: signup.error }, { status: 400 });
	if (signup.honeypot) return json({ ok: true });

	const serviceSupabase = createServiceSupabaseClient();
	if (!serviceSupabase) return json({ error: 'Email signup is unavailable.' }, { status: 503 });

	let { data: group, error: groupError } = await serviceSupabase
		.from('groups')
		.select('id,slug,microsite_slug,name,logo_url,public_contact_email')
		.eq('slug', params.slug)
		.maybeSingle();
	if (!group && !groupError) {
		const fallback = await serviceSupabase
			.from('groups')
			.select('id,slug,microsite_slug,name,logo_url,public_contact_email')
			.eq('microsite_slug', params.slug)
			.maybeSingle();
		group = fallback.data;
		groupError = fallback.error;
	}
	if (groupError || !group) return json({ error: 'Group not found.' }, { status: 404 });

	const { data: existingSubscriber, error: existingError } = await serviceSupabase
		.from('group_email_subscribers')
		.select('id,status,first_name,unsubscribe_token,welcome_email_sent_at,welcome_email_status')
		.eq('group_id', group.id)
		.eq('email', signup.email)
		.maybeSingle();
	if (existingError) {
		return json(
			{ error: 'Unable to check your existing signup. Please try again.' },
			{ status: 500 }
		);
	}

	const now = new Date().toISOString();
	const isResubscribe = existingSubscriber?.status === 'unsubscribed';
	const subscriberPayload = {
		group_id: group.id,
		email: signup.email,
		first_name: signup.firstName || null,
		status: 'subscribed',
		consent_at: now,
		unsubscribed_at: null,
		source: 'website',
		updated_at: now
	};
	if (isResubscribe) {
		Object.assign(subscriberPayload, {
			welcome_email_status: GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.PENDING,
			welcome_email_sent_at: null,
			welcome_email_error: null,
			welcome_email_attempts: 0,
			welcome_email_last_attempt_at: null,
			welcome_email_claimed_at: null
		});
	}

	const { data: subscriber, error } = await serviceSupabase
		.from('group_email_subscribers')
		.upsert(subscriberPayload, { onConflict: 'group_id,email' })
		.select(
			'id,email,first_name,status,unsubscribe_token,welcome_email_sent_at,welcome_email_status'
		)
		.single();
	if (error)
		return json({ error: 'Unable to save your signup. Please try again.' }, { status: 500 });

	if (subscriber?.id && shouldSendGroupSubscriberWelcome(existingSubscriber)) {
		try {
			const welcomeResult = await attemptGroupSubscriberWelcome({
				serviceSupabase,
				group,
				subscriberId: subscriber.id,
				origin: url?.origin || new URL(request.url).origin,
				fetchImpl
			});
			if (!welcomeResult.ok || (welcomeResult.attempted && !welcomeResult.sent)) {
				console.warn('Unable to deliver group subscriber welcome email', welcomeResult.error);
			}
		} catch (welcomeError) {
			// The opt-in is already saved. A transient mail-provider failure should
			// not make the visitor submit the form again or create a false failure.
			console.warn('Unable to deliver group subscriber welcome email', welcomeError);
		}
	}

	return json({ ok: true, message: `You're signed up for updates from ${group.name}.` });
}
