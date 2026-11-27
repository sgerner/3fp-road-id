import { error } from '@sveltejs/kit';
import { finalizeMembershipPaymentIntent } from '#lib/server/memberships';
import { resolveVerifiedSession } from '#lib/server/session';
import {
	createRequestSupabaseClient,
	createServiceSupabaseClient
} from '#lib/server/supabaseClient';
import { isTurnstileEnabled } from '#lib/server/turnstile';

async function safeJson(fetchPromise, fallback = null) {
	try {
		const response = await fetchPromise;
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) return fallback;
		return payload?.data ?? fallback;
	} catch {
		return fallback;
	}
}

export const load = async ({ params, url, fetch, cookies }) => {
	const slug = params.slug;
	const paymentIntentId = (url.searchParams.get('payment_intent') || '').trim();
	const subscriptionId = (url.searchParams.get('subscription_id') || '').trim();
	const redirectStatus = (url.searchParams.get('redirect_status') || '').trim().toLowerCase();

	const group = await safeJson(
		fetch(`/api/v1/groups?slug=eq.${encodeURIComponent(slug)}&single=true`),
		null
	);
	if (!group) {
		throw error(404, 'Group not found.');
	}

	const programData = await safeJson(
		fetch(`/api/groups/${encodeURIComponent(slug)}/membership/program?include_inactive=false`),
		null
	);

	let paymentRedirect = null;
	if (redirectStatus === 'failed') {
		paymentRedirect = {
			status: 'failed',
			completed: false,
			payment_intent_id: paymentIntentId || null,
			subscription_id: subscriptionId || null,
			payment_status: 'failed',
			error: 'Your payment was not completed. Please check your payment details and try again.'
		};
	} else if (paymentIntentId || subscriptionId) {
		const finalizeResult = await finalizeMembershipPaymentIntent({
			cookies,
			groupSlug: slug,
			payload: {
				payment_intent_id: paymentIntentId || null,
				subscription_id: subscriptionId || null
			},
			fetchImpl: fetch
		});
		if (!finalizeResult?.ok) {
			paymentRedirect = {
				status: 'failed',
				completed: false,
				payment_intent_id: paymentIntentId || null,
				subscription_id: subscriptionId || null,
				payment_status: 'failed',
				error: finalizeResult?.error || 'Unable to verify membership payment.'
			};
		} else if (finalizeResult.data?.completed === true) {
			paymentRedirect = {
				status: 'succeeded',
				completed: true,
				membership_id: finalizeResult.data.membership_id || null,
				payment_intent_id: paymentIntentId || null,
				subscription_id: subscriptionId || null,
				payment_status: finalizeResult.data.payment_status || 'succeeded',
				error: null
			};
		} else {
			const verifiedPaymentStatus = String(finalizeResult.data?.payment_status || 'processing')
				.trim()
				.toLowerCase();
			const isFailed = ['failed', 'requires_payment_method', 'canceled'].includes(
				verifiedPaymentStatus
			);
			paymentRedirect = {
				status: isFailed ? 'failed' : 'processing',
				completed: false,
				payment_intent_id: paymentIntentId || null,
				subscription_id: subscriptionId || null,
				payment_status: verifiedPaymentStatus,
				error: isFailed
					? 'Your payment could not be completed. Please try another payment method.'
					: null
			};
		}
	}

	const { accessToken, user } = await resolveVerifiedSession(cookies);
	let myApplications = [];
	let myMemberships = [];
	let myTierChangeRequests = [];
	let currentUserProfile = null;
	let hasStripeSubscription = false;

	if (accessToken && user?.id) {
		const requestSupabase = createRequestSupabaseClient(accessToken);
		const [appsRes, membershipsRes, profileRes] = await Promise.all([
			requestSupabase
				.from('group_membership_applications')
				.select('*')
				.eq('group_id', group.id)
				.eq('user_id', user.id)
				.order('submitted_at', { ascending: false })
				.limit(20),
			requestSupabase
				.from('group_memberships')
				.select('*')
				.eq('group_id', group.id)
				.eq('user_id', user.id)
				.order('created_at', { ascending: false })
				.limit(20),
			requestSupabase
				.from('profiles')
				.select('full_name,email,phone')
				.eq('user_id', user.id)
				.maybeSingle()
		]);

		myApplications = appsRes.data || [];
		myMemberships = membershipsRes.data || [];
		const latestScoped =
			myMemberships.find(
				(row) => row?.contact_full_name || row?.contact_email || row?.contact_phone
			) ||
			myApplications.find(
				(row) => row?.contact_full_name || row?.contact_email || row?.contact_phone
			) ||
			null;
		currentUserProfile = {
			full_name: latestScoped?.contact_full_name || profileRes.data?.full_name || null,
			email: latestScoped?.contact_email || profileRes.data?.email || user.email || null,
			phone: latestScoped?.contact_phone || profileRes.data?.phone || null
		};

		const membershipIds = myMemberships.map((row) => row?.id).filter(Boolean);
		if (membershipIds.length) {
			const { data: tierChangeRows } = await requestSupabase
				.from('group_membership_tier_change_requests')
				.select('*')
				.in('membership_id', membershipIds)
				.eq('status', 'pending')
				.order('updated_at', { ascending: false })
				.limit(20);
			myTierChangeRequests = tierChangeRows || [];
		}

		const activeMembership =
			myMemberships.find((row) => ['active', 'past_due', 'paused'].includes(row?.status)) || null;
		if (activeMembership?.id) {
			const serviceSupabase = createServiceSupabaseClient();
			if (serviceSupabase) {
				const { data: billingRow } = await serviceSupabase
					.from('group_membership_billing')
					.select('stripe_subscription_id')
					.eq('membership_id', activeMembership.id)
					.maybeSingle();
				hasStripeSubscription = Boolean(billingRow?.stripe_subscription_id);
			}
		}
	}

	return {
		group,
		program_data: programData,
		my_applications: myApplications,
		my_memberships: myMemberships,
		my_tier_change_requests: myTierChangeRequests,
		current_user_profile: currentUserProfile,
		current_user_id: user?.id || null,
		has_stripe_subscription: hasStripeSubscription,
		payment_redirect: paymentRedirect,
		turnstile_enabled: isTurnstileEnabled()
	};
};
