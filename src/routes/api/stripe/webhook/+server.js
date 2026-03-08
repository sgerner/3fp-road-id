import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	finalizeDonationByPaymentIntentId,
	finalizeDonationBySessionId
} from '$lib/server/donations';
import { finalizeMerchOrderByPaymentIntentId, finalizeMerchOrderBySessionId } from '$lib/server/merch';
import { getStripeClient } from '$lib/server/stripe';

async function safelyFinalizeSession(sessionId, fetchImpl) {
	let donationResult = null;
	let merchResult = null;
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
	return {
		donationMatched: donationResult?.ok === true,
		merchMatched: merchResult?.ok === true
	};
}

async function safelyFinalizePaymentIntent(paymentIntentId, fetchImpl) {
	let donationMatched = false;
	let merchMatched = false;
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
	return { donationMatched, merchMatched };
}

export const POST = async ({ request, fetch }) => {
	const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';
	if (!webhookSecret) {
		return json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' }, { status: 500 });
	}

	const signature = request.headers.get('stripe-signature') || '';
	if (!signature) {
		return json({ error: 'Missing Stripe signature header.' }, { status: 400 });
	}

	const rawBody = await request.text();
	const stripe = getStripeClient();

	let event = null;
	try {
		event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
	} catch (error) {
		return json(
			{ error: `Invalid webhook signature: ${error?.message || 'unknown error'}` },
			{ status: 400 }
		);
	}

	if (
		event.type === 'checkout.session.completed' ||
		event.type === 'checkout.session.async_payment_succeeded' ||
		event.type === 'checkout.session.expired'
	) {
		const sessionId = event?.data?.object?.id;
		if (sessionId) {
			const matchResult = await safelyFinalizeSession(sessionId, fetch);
			if (!matchResult.donationMatched && !matchResult.merchMatched) {
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
			if (!matchResult.donationMatched && !matchResult.merchMatched) {
				console.warn('Stripe webhook payment intent did not match donation or merch records', {
					paymentIntentId,
					eventType: event.type
				});
			}
		}
	}

	return json({ received: true });
};
