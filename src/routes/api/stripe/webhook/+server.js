import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	finalizeDonationByPaymentIntentId,
	finalizeDonationBySessionId
} from '$lib/server/donations';
import {
	finalizeDomainOrderByCheckoutSessionId,
	finalizeDomainOrderByPaymentIntentId
} from '$lib/server/groupSiteDomains';
import {
	finalizeMerchOrderByPaymentIntentId,
	finalizeMerchOrderBySessionId
} from '$lib/server/merch';
import { handleMembershipStripeEvent } from '$lib/server/memberships';
import { createServiceSupabaseClient } from '$lib/server/supabaseClient';
import { getStripeClient } from '$lib/server/stripe';

async function safelyFinalizeSession(sessionId, fetchImpl) {
	let donationResult = null;
	let merchResult = null;
	let domainResult = null;
	try {
		donationResult = await finalizeDonationBySessionId(sessionId, fetchImpl);
	} catch (error) {
		console.error('Donation finalize webhook error', error);
	}
	try {
		merchResult = await finalizeMerchOrderBySessionId(sessionId, fetchImpl);
	} catch (error) {
		console.error('Merch finalize webhook error', error);
	}
	try {
		const serviceSupabase = createServiceSupabaseClient();
		if (serviceSupabase) {
			domainResult = await finalizeDomainOrderByCheckoutSessionId({
				serviceSupabase,
				sessionId,
				fetch: fetchImpl
			});
		}
	} catch (error) {
		console.error('Domain order finalize webhook error', error);
	}
	return {
		donationMatched: donationResult?.ok === true,
		merchMatched: merchResult?.ok === true,
		domainMatched: domainResult?.matched === true
	};
}

async function safelyFinalizePaymentIntent(paymentIntentId, fetchImpl) {
	let donationMatched = false;
	let merchMatched = false;
	let domainMatched = false;
	try {
		const donationResult = await finalizeDonationByPaymentIntentId(paymentIntentId, fetchImpl);
		donationMatched = donationResult?.ok === true;
	} catch (error) {
		console.error('Donation finalize payment intent webhook error', error);
	}
	try {
		const merchResult = await finalizeMerchOrderByPaymentIntentId(paymentIntentId, fetchImpl);
		merchMatched = merchResult?.ok === true;
	} catch (error) {
		console.error('Merch finalize payment intent webhook error', error);
	}
	try {
		const serviceSupabase = createServiceSupabaseClient();
		if (serviceSupabase) {
			const domainResult = await finalizeDomainOrderByPaymentIntentId({
				serviceSupabase,
				paymentIntentId,
				fetch: fetchImpl
			});
			domainMatched = domainResult?.matched === true;
		}
	} catch (error) {
		console.error('Domain finalize payment intent webhook error', error);
	}
	return { donationMatched, merchMatched, domainMatched };
}

export const POST = async ({ request, fetch }) => {
	try {
		const webhookSecrets = [
			env.STRIPE_WEBHOOK_SECRET || '',
			env.STRIPE_CONNECT_WEBHOOK_SECRET || ''
		].filter(Boolean);
		if (!webhookSecrets.length) {
			return json(
				{ error: 'STRIPE_WEBHOOK_SECRET (or STRIPE_CONNECT_WEBHOOK_SECRET) is not configured.' },
				{ status: 500 }
			);
		}

		const signature = request.headers.get('stripe-signature') || '';
		if (!signature) {
			return json({ error: 'Missing Stripe signature header.' }, { status: 400 });
		}

		const rawBody = await request.text();
		const stripe = getStripeClient();

		let event = null;
		let verified = false;
		for (const candidateSecret of webhookSecrets) {
			try {
				event = stripe.webhooks.constructEvent(rawBody, signature, candidateSecret);
				verified = true;
				break;
			} catch {
				// Try next configured webhook secret.
			}
		}
		if (!verified || !event) {
			return json({ error: 'Invalid webhook signature.' }, { status: 400 });
		}

		const handledEventTypes = new Set([
			'checkout.session.completed',
			'checkout.session.async_payment_succeeded',
			'checkout.session.expired',
			'payment_intent.succeeded',
			'payment_intent.payment_failed',
			'payment_intent.canceled',
			'invoice.paid',
			'invoice.payment_failed',
			'customer.subscription.updated',
			'customer.subscription.deleted'
		]);
		if (!handledEventTypes.has(event.type)) {
			return json({ received: true, ignored: true });
		}

		if (
			event.type === 'checkout.session.completed' ||
			event.type === 'checkout.session.async_payment_succeeded' ||
			event.type === 'checkout.session.expired'
		) {
			const sessionId = event?.data?.object?.id;
			if (sessionId) {
				const matchResult = await safelyFinalizeSession(sessionId, fetch);
				let membershipMatched = false;
				try {
					const membershipResult = await handleMembershipStripeEvent(event, fetch);
					membershipMatched = membershipResult?.ok === true && membershipResult?.matched === true;
				} catch (error) {
					console.error('Membership checkout webhook error', {
						id: event.id,
						type: event.type,
						account: event.account || null,
						message: error?.message || 'Unknown error'
					});
				}

				if (
					!matchResult.donationMatched &&
					!matchResult.merchMatched &&
					!matchResult.domainMatched &&
					!membershipMatched
				) {
					console.warn('Stripe webhook session did not match donation or merch records', {
						sessionId,
						eventType: event.type
					});
				}
			}
		}

		if (
			event.type === 'payment_intent.succeeded' ||
			event.type === 'payment_intent.payment_failed' ||
			event.type === 'payment_intent.canceled'
		) {
			const paymentIntentId = event?.data?.object?.id;
			if (paymentIntentId) {
				const matchResult = await safelyFinalizePaymentIntent(paymentIntentId, fetch);
				let membershipMatched = false;
				try {
					const membershipResult = await handleMembershipStripeEvent(event, fetch);
					membershipMatched = membershipResult?.ok === true && membershipResult?.matched === true;
				} catch (error) {
					console.error('Membership payment intent webhook error', {
						id: event.id,
						type: event.type,
						account: event.account || null,
						message: error?.message || 'Unknown error'
					});
				}

				if (
					!matchResult.donationMatched &&
					!matchResult.merchMatched &&
					!matchResult.domainMatched &&
					!membershipMatched
				) {
					console.warn('Stripe webhook payment intent did not match donation or merch records', {
						paymentIntentId,
						eventType: event.type
					});
				}
			}
		}

		if (
			event.type === 'invoice.paid' ||
			event.type === 'invoice.payment_failed' ||
			event.type === 'customer.subscription.updated' ||
			event.type === 'customer.subscription.deleted'
		) {
			try {
				await handleMembershipStripeEvent(event, fetch);
			} catch (error) {
				console.error('Membership invoice/subscription webhook error', {
					id: event.id,
					type: event.type,
					account: event.account || null,
					message: error?.message || 'Unknown error'
				});
			}
		}

		return json({ received: true });
	} catch (error) {
		console.error('Stripe webhook unhandled error', error);
		return json({ error: error?.message || 'Unhandled webhook error.' }, { status: 500 });
	}
};
