import { json } from '@sveltejs/kit';
import { sendEmail } from '$lib/services/email';
import {
	buildGroupSubscriberWelcomeEmail,
	normalizeGroupEmailSignup,
	shouldSendGroupSubscriberWelcome
} from '$lib/server/groupEmailSubscribers';
import { getGroupEmailSenderConfig, sendGroupManagedEmail } from '$lib/server/groupEmailDomains';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeReplyTo(value) {
	const cleaned = String(value ?? '')
		.trim()
		.toLowerCase();
	return EMAIL_PATTERN.test(cleaned) ? cleaned : null;
}

async function loadWelcomeSiteConfig(serviceSupabase, groupId) {
	const { data, error } = await serviceSupabase
		.from('group_site_configs')
		.select('site_variant,site_title,site_tagline,home_intro,theme_colors')
		.eq('group_id', groupId)
		.maybeSingle();
	if (error) {
		console.warn('Unable to load group microsite branding for subscriber welcome', error);
		return {};
	}
	return data || {};
}

async function deliverSubscriberWelcome({
	serviceSupabase,
	group,
	subscriber,
	firstName,
	origin,
	fetchImpl
}) {
	const siteConfig = await loadWelcomeSiteConfig(serviceSupabase, group.id);
	const welcome = buildGroupSubscriberWelcomeEmail({
		group,
		siteConfig,
		subscriber,
		firstName,
		origin
	});
	const senderConfig = await getGroupEmailSenderConfig(serviceSupabase, group.id);
	const replyTo = senderConfig?.replyToEmail || normalizeReplyTo(group.public_contact_email);

	if (senderConfig?.fromEmailAddress) {
		return sendGroupManagedEmail({
			to: subscriber.email,
			subject: welcome.subject,
			html: welcome.html,
			text: welcome.text,
			fromAddress: senderConfig.fromEmailAddress,
			replyTo: senderConfig.replyToEmail || null,
			tags: welcome.tags,
			originBaseUrl: origin,
			branding: welcome.branding
		});
	}

	return sendEmail(
		{
			to: subscriber.email,
			subject: welcome.subject,
			html: welcome.html,
			text: welcome.text,
			replyTo,
			tags: welcome.tags,
			branding: welcome.branding
		},
		{ fetch: fetchImpl }
	);
}

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
		.select('id,status,first_name,unsubscribe_token,welcome_email_sent_at')
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
	const { data: subscriber, error } = await serviceSupabase
		.from('group_email_subscribers')
		.upsert(
			{
				group_id: group.id,
				email: signup.email,
				first_name: signup.firstName || null,
				status: 'subscribed',
				consent_at: now,
				unsubscribed_at: null,
				source: 'website',
				updated_at: now
			},
			{ onConflict: 'group_id,email' }
		)
		.select('id,email,first_name,status,unsubscribe_token,welcome_email_sent_at')
		.single();
	if (error)
		return json({ error: 'Unable to save your signup. Please try again.' }, { status: 500 });

	if (shouldSendGroupSubscriberWelcome(existingSubscriber)) {
		try {
			await deliverSubscriberWelcome({
				serviceSupabase,
				group,
				subscriber: subscriber || {
					email: signup.email,
					first_name: signup.firstName || null,
					unsubscribe_token: existingSubscriber?.unsubscribe_token
				},
				firstName: signup.firstName,
				origin: url?.origin || new URL(request.url).origin,
				fetchImpl
			});
			if (subscriber?.id) {
				const { error: trackingError } = await serviceSupabase
					.from('group_email_subscribers')
					.update({ welcome_email_sent_at: new Date().toISOString() })
					.eq('id', subscriber.id)
					.eq('group_id', group.id);
				if (trackingError) {
					console.warn('Unable to record group subscriber welcome delivery', trackingError);
				}
			}
		} catch (welcomeError) {
			// The opt-in is already saved. A transient mail-provider failure should
			// not make the visitor submit the form again or create a false failure.
			console.warn('Unable to deliver group subscriber welcome email', welcomeError);
		}
	}

	return json({ ok: true, message: `You're signed up for updates from ${group.name}.` });
}
