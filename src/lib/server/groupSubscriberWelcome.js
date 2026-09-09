import { sendEmail } from '$lib/services/email';
import {
	buildGroupSubscriberWelcomeEmail,
	GROUP_SUBSCRIBER_WELCOME_CLAIM_TIMEOUT_MS,
	GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES,
	isGroupSubscriberWelcomeClaimable
} from '$lib/server/groupEmailSubscribers';
import {
	getGroupEmailSenderConfig,
	requireGroupEmailManager,
	sendGroupManagedEmail
} from '$lib/server/groupEmailDomains';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBSCRIBER_SELECT =
	'id,group_id,email,first_name,status,unsubscribe_token,welcome_email_sent_at,welcome_email_status,welcome_email_error,welcome_email_attempts,welcome_email_last_attempt_at,welcome_email_claimed_at,created_at';

function normalizeReplyTo(value) {
	const cleaned = String(value ?? '')
		.trim()
		.toLowerCase();
	return EMAIL_PATTERN.test(cleaned) ? cleaned : null;
}

function cleanError(value, maxLength = 2000) {
	return String(value?.message || value || 'Unable to deliver welcome email.')
		.trim()
		.slice(0, maxLength);
}

function deliveryStatus(subscriber) {
	return subscriber?.welcome_email_status || GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.PENDING;
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

export async function deliverGroupSubscriberWelcome({
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
		origin,
		unsubscribeToken: subscriber.unsubscribe_token
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

async function loadSubscriber(serviceSupabase, groupId, subscriberId) {
	const { data, error } = await serviceSupabase
		.from('group_email_subscribers')
		.select(SUBSCRIBER_SELECT)
		.eq('group_id', groupId)
		.eq('id', subscriberId)
		.maybeSingle();
	if (error) return { error };
	return { subscriber: data || null };
}

async function claimSubscriberWelcome({
	serviceSupabase,
	groupId,
	subscriberId,
	now = new Date()
}) {
	const { subscriber, error: loadError } = await loadSubscriber(
		serviceSupabase,
		groupId,
		subscriberId
	);
	if (loadError) return { ok: false, error: loadError };
	if (!subscriber) return { ok: false, status: 'not_found' };

	const nowMs = now.getTime();
	if (!isGroupSubscriberWelcomeClaimable(subscriber, nowMs)) {
		return {
			ok: true,
			claimed: false,
			status: deliveryStatus(subscriber),
			subscriber
		};
	}

	const nowIso = now.toISOString();
	const nextAttempts = Math.max(0, Number(subscriber.welcome_email_attempts || 0)) + 1;
	let claimQuery = serviceSupabase
		.from('group_email_subscribers')
		.update({
			welcome_email_status: GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENDING,
			welcome_email_error: null,
			welcome_email_attempts: nextAttempts,
			welcome_email_last_attempt_at: nowIso,
			welcome_email_claimed_at: nowIso,
			updated_at: nowIso
		})
		.eq('id', subscriberId)
		.eq('group_id', groupId)
		.eq('status', 'subscribed');

	if (deliveryStatus(subscriber) === GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENDING) {
		claimQuery = claimQuery.eq(
			'welcome_email_status',
			GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENDING
		);
		if (subscriber.welcome_email_claimed_at) {
			claimQuery = claimQuery.lt(
				'welcome_email_claimed_at',
				new Date(nowMs - GROUP_SUBSCRIBER_WELCOME_CLAIM_TIMEOUT_MS).toISOString()
			);
		} else {
			claimQuery = claimQuery.is('welcome_email_claimed_at', null);
		}
	} else {
		claimQuery = claimQuery.in('welcome_email_status', [
			GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.PENDING,
			GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.FAILED
		]);
	}

	const { data: claimedSubscriber, error: claimError } = await claimQuery
		.select(SUBSCRIBER_SELECT)
		.maybeSingle();
	if (claimError) return { ok: false, error: claimError };

	return {
		ok: true,
		claimed: Boolean(claimedSubscriber),
		status: claimedSubscriber
			? GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENDING
			: deliveryStatus(subscriber),
		subscriber: claimedSubscriber || subscriber
	};
}

export async function attemptGroupSubscriberWelcome({
	serviceSupabase,
	group,
	subscriberId,
	origin,
	fetchImpl,
	now = new Date()
}) {
	if (!serviceSupabase || !group?.id || !subscriberId) {
		return { ok: false, error: 'Subscriber welcome delivery is not configured.' };
	}

	const claim = await claimSubscriberWelcome({
		serviceSupabase,
		groupId: group.id,
		subscriberId,
		now
	});
	if (!claim.ok) {
		return {
			ok: false,
			status: claim.status || 'claim_failed',
			error: cleanError(claim.error || 'Unable to claim welcome delivery.')
		};
	}
	if (!claim.claimed) {
		return {
			ok: true,
			attempted: false,
			sent: claim.status === GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENT,
			status: claim.status,
			subscriber: claim.subscriber
		};
	}

	const claimedSubscriber = claim.subscriber;
	try {
		await deliverGroupSubscriberWelcome({
			serviceSupabase,
			group,
			subscriber: claimedSubscriber,
			firstName: claimedSubscriber.first_name,
			origin,
			fetchImpl
		});

		const sentAt = new Date().toISOString();
		const { data: sentSubscriber, error: sentError } = await serviceSupabase
			.from('group_email_subscribers')
			.update({
				welcome_email_status: GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENT,
				welcome_email_sent_at: sentAt,
				welcome_email_error: null,
				welcome_email_claimed_at: null,
				updated_at: sentAt
			})
			.eq('id', subscriberId)
			.eq('group_id', group.id)
			.eq('welcome_email_status', GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENDING)
			.select(SUBSCRIBER_SELECT)
			.maybeSingle();

		if (sentError || !sentSubscriber) {
			console.error('Unable to record group subscriber welcome delivery', sentError);
			return {
				ok: false,
				attempted: true,
				sent: true,
				status: 'delivery_record_failed',
				error: 'Welcome email was accepted, but its delivery status could not be recorded.',
				subscriber: claimedSubscriber
			};
		}

		return {
			ok: true,
			attempted: true,
			sent: true,
			status: GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENT,
			subscriber: sentSubscriber
		};
	} catch (deliveryError) {
		const errorText = cleanError(deliveryError);
		const failedAt = new Date().toISOString();
		const { data: failedSubscriber, error: trackingError } = await serviceSupabase
			.from('group_email_subscribers')
			.update({
				welcome_email_status: GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.FAILED,
				welcome_email_error: errorText,
				welcome_email_claimed_at: null,
				updated_at: failedAt
			})
			.eq('id', subscriberId)
			.eq('group_id', group.id)
			.eq('welcome_email_status', GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENDING)
			.select(SUBSCRIBER_SELECT)
			.maybeSingle();

		if (trackingError) {
			console.error('Unable to record group subscriber welcome failure', trackingError);
		}

		return {
			ok: !trackingError,
			attempted: true,
			sent: false,
			status: GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.FAILED,
			error: errorText,
			subscriber: failedSubscriber || claimedSubscriber
		};
	}
}

const FAILURE_SELECT =
	'id,email,first_name,status,welcome_email_status,welcome_email_error,welcome_email_attempts,welcome_email_last_attempt_at,welcome_email_claimed_at,created_at';

export async function listGroupSubscriberWelcomeFailures({ cookies, groupSlug }) {
	const auth = await requireGroupEmailManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const { data, error } = await auth.serviceSupabase
		.from('group_email_subscribers')
		.select(FAILURE_SELECT)
		.eq('group_id', auth.group.id)
		.eq('status', 'subscribed')
		.in('welcome_email_status', [
			GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.FAILED,
			GROUP_SUBSCRIBER_WELCOME_DELIVERY_STATUSES.SENDING
		])
		.order('welcome_email_last_attempt_at', { ascending: false })
		.order('created_at', { ascending: false });
	if (error) return { ok: false, status: 400, error: error.message };

	return { ok: true, data: data || [] };
}

export async function retryGroupSubscriberWelcome({
	cookies,
	groupSlug,
	subscriberId,
	origin,
	fetchImpl
}) {
	const auth = await requireGroupEmailManager(cookies, groupSlug);
	if (!auth.ok) return auth;

	const { data: subscriber, error: subscriberError } = await auth.serviceSupabase
		.from('group_email_subscribers')
		.select(SUBSCRIBER_SELECT)
		.eq('group_id', auth.group.id)
		.eq('id', subscriberId)
		.maybeSingle();
	if (subscriberError) return { ok: false, status: 400, error: subscriberError.message };
	if (!subscriber) return { ok: false, status: 404, error: 'Subscriber not found.' };

	const result = await attemptGroupSubscriberWelcome({
		serviceSupabase: auth.serviceSupabase,
		group: auth.group,
		subscriberId: subscriber.id,
		origin,
		fetchImpl
	});
	if (!result.ok) {
		return { ok: false, status: 502, error: result.error || 'Unable to retry welcome email.' };
	}

	return {
		ok: true,
		data: {
			id: subscriber.id,
			status: result.status,
			attempted: result.attempted === true,
			sent: result.sent === true,
			error: result.error || null
		}
	};
}
