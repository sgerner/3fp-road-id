<script>
	import { onDestroy, onMount, tick } from 'svelte';
	import { loadStripe } from '@stripe/stripe-js';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';

	let {
		groupSlug,
		initialSearchQuery = '',
		defaultContact = {},
		returnPath = '',
		title = 'Buy Domain'
	} = $props();

	let domainSearchQuery = $state('');
	let domainSearchBusy = $state(false);
	let domainSearchResults = $state([]);
	let selectedDomainQuote = $state(null);
	let domainCheckoutBusy = $state(false);
	let domainPreparingPayment = $state(false);
	let domainPaymentFormReady = $state(false);
	let domainPaymentElementHost = $state(null);
	let domainPaymentReturnUrl = $state('');
	let domainPreparedSignature = $state('');
	let domainMessage = $state('');
	let domainError = $state('');
	let registrarContact = $state({
		firstName: '',
		lastName: '',
		email: '',
		phone: '',
		address1: '',
		address2: '',
		city: '',
		state: '',
		zip: '',
		country: 'US',
		companyName: ''
	});

	let domainStripe = null;
	let domainElements = null;
	let domainPaymentElement = null;

	function asText(value) {
		if (value === null || value === undefined) return '';
		return String(value).trim();
	}

	function setMessage(nextMessage = '', nextError = '') {
		domainMessage = nextMessage;
		domainError = nextError;
	}

	function formatUsd(cents) {
		const amount = Number(cents);
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: 'USD'
		}).format((Number.isFinite(amount) ? amount : 0) / 100);
	}

	function buildDomainCheckoutPayload() {
		const payload = {
			domain: asText(selectedDomainQuote?.domain).toLowerCase(),
			contactInformation: registrarContact
		};
		const normalizedReturnPath = asText(returnPath);
		if (normalizedReturnPath.startsWith('/')) {
			payload.returnPath = normalizedReturnPath;
		}
		return payload;
	}

	function buildDomainPaymentSignature() {
		return JSON.stringify(buildDomainCheckoutPayload());
	}

	function teardownDomainPaymentElement() {
		try {
			domainPaymentElement?.destroy?.();
		} catch {
			// ignore teardown issues
		}
		domainPaymentElement = null;
		domainElements = null;
		domainStripe = null;
		domainPaymentFormReady = false;
		domainPaymentReturnUrl = '';
		domainPreparedSignature = '';
	}

	async function searchDomains() {
		setMessage('', '');
		domainSearchBusy = true;
		try {
			const response = await fetch(`/api/groups/${encodeURIComponent(groupSlug)}/domains/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: domainSearchQuery })
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to search domains.');
			}
			domainSearchResults = Array.isArray(payload?.data?.results) ? payload.data.results : [];
			if (
				!selectedDomainQuote ||
				!domainSearchResults.some((row) => row?.domain === selectedDomainQuote?.domain)
			) {
				selectedDomainQuote = null;
			}
			if (!domainSearchResults.length) {
				setMessage('No available domains found for this search right now.', '');
			}
		} catch (error) {
			setMessage('', error?.message || 'Unable to search domains.');
		} finally {
			domainSearchBusy = false;
		}
	}

	function selectDomainQuote(row) {
		const nextDomain = asText(row?.domain).toLowerCase();
		const previousDomain = asText(selectedDomainQuote?.domain).toLowerCase();
		selectedDomainQuote = row || null;
		if (nextDomain !== previousDomain) {
			teardownDomainPaymentElement();
		}
		setMessage('', '');
	}

	async function prepareDomainPaymentElement({ quiet = false } = {}) {
		const domain = asText(selectedDomainQuote?.domain).toLowerCase();
		if (!domain) {
			if (!quiet) setMessage('', 'Select a domain first.');
			return false;
		}
		if (!domainPaymentElementHost) {
			if (!quiet) setMessage('', 'Payment form is not ready yet.');
			return false;
		}

		domainPreparingPayment = true;
		if (!quiet) setMessage('', '');
		try {
			teardownDomainPaymentElement();
			const response = await fetch(
				`/api/groups/${encodeURIComponent(groupSlug)}/domains/create-payment-intent`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(buildDomainCheckoutPayload())
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to prepare domain payment.');
			}
			if (
				!payload?.clientSecret ||
				!payload?.publishableKey ||
				!payload?.connectedAccountId ||
				!payload?.returnUrl
			) {
				throw new Error('Stripe payment form could not be initialized.');
			}

			domainStripe = await loadStripe(payload.publishableKey, {
				stripeAccount: payload.connectedAccountId
			});
			if (!domainStripe) throw new Error('Stripe.js failed to load.');

			domainPaymentReturnUrl = asText(payload.returnUrl);
			domainPreparedSignature = buildDomainPaymentSignature();

			await tick();
			domainElements = domainStripe.elements({
				clientSecret: payload.clientSecret,
				appearance: {
					theme: 'night',
					variables: {
						colorPrimary: '#f4ff00',
						colorBackground: 'rgba(10, 15, 20, 0.55)',
						colorText: '#f8f5dd',
						colorDanger: '#ff6b6b',
						fontFamily: 'inherit',
						borderRadius: '16px'
					}
				}
			});
			domainPaymentElement = domainElements.create('payment', {
				layout: {
					type: 'tabs',
					defaultCollapsed: false
				}
			});
			domainPaymentElement.mount(domainPaymentElementHost);
			domainPaymentFormReady = true;
			return true;
		} catch (error) {
			teardownDomainPaymentElement();
			if (!quiet) setMessage('', error?.message || 'Unable to prepare payment form.');
			return false;
		} finally {
			domainPreparingPayment = false;
		}
	}

	async function startDomainCheckout() {
		const domain = asText(selectedDomainQuote?.domain).toLowerCase();
		if (!domain) {
			setMessage('', 'Select a domain first.');
			return;
		}

		domainCheckoutBusy = true;
		setMessage('', '');
		try {
			if (!domainPaymentFormReady || domainPreparedSignature !== buildDomainPaymentSignature()) {
				const prepared = await prepareDomainPaymentElement({ quiet: false });
				if (!prepared) return;
			}
			if (!domainStripe || !domainElements || !domainPaymentReturnUrl) {
				throw new Error('Stripe payment form is not ready yet.');
			}

			const { error: stripeError } = await domainStripe.confirmPayment({
				elements: domainElements,
				confirmParams: {
					return_url: domainPaymentReturnUrl
				}
			});
			if (stripeError) {
				throw new Error(stripeError.message || 'Unable to confirm payment.');
			}
		} catch (error) {
			setMessage('', error?.message || 'Unable to start domain checkout.');
		} finally {
			domainCheckoutBusy = false;
		}
	}

	onMount(() => {
		if (!domainSearchQuery.trim()) {
			domainSearchQuery = asText(initialSearchQuery);
		}
		registrarContact = {
			...registrarContact,
			firstName: asText(defaultContact?.firstName),
			lastName: asText(defaultContact?.lastName),
			email: asText(defaultContact?.email),
			phone: asText(defaultContact?.phone),
			address1: asText(defaultContact?.address1),
			address2: asText(defaultContact?.address2),
			city: asText(defaultContact?.city),
			state: asText(defaultContact?.state),
			zip: asText(defaultContact?.zip),
			country: asText(defaultContact?.country || 'US')
				.toUpperCase()
				.slice(0, 2),
			companyName: asText(defaultContact?.companyName)
		};
	});

	onDestroy(() => {
		teardownDomainPaymentElement();
	});
</script>

<div class="domain-purchase-panel">
	<p class="domain-title">{title}</p>
	<div class="domain-search-row">
		<input
			class="input flex-1"
			bind:value={domainSearchQuery}
			placeholder="biketempe"
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					void searchDomains();
				}
			}}
		/>
		<button
			type="button"
			class="btn preset-filled-primary-500"
			disabled={domainSearchBusy}
			onclick={() => void searchDomains()}
		>
			{#if domainSearchBusy}
				<IconRefreshCw class="h-4 w-4 animate-spin" />
			{/if}
			Search
		</button>
	</div>

	{#if domainSearchResults.length}
		<div class="domain-results mt-4">
			{#each domainSearchResults as row}
				<div
					class="domain-result {selectedDomainQuote?.domain === row.domain ? 'is-selected' : ''}"
					role="button"
					tabindex="0"
					aria-pressed={selectedDomainQuote?.domain === row.domain}
					onclick={() => selectDomainQuote(row)}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							selectDomainQuote(row);
						}
					}}
				>
					<div class="domain-result-info">
						<div class="domain-result-name">{row.domain}</div>
						<div class="domain-result-price">{formatUsd(row.pricing.purchase.totalCents)}</div>
						<div class="domain-result-meta">
							Renews about {formatUsd(row.pricing.renewal.totalCents)} / year
						</div>
					</div>
					<button
						type="button"
						class="btn btn-sm preset-tonal-primary"
						onclick={(event) => {
							event.stopPropagation();
							selectDomainQuote(row);
						}}
					>
						{selectedDomainQuote?.domain === row.domain ? 'Selected' : 'Select'}
					</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if selectedDomainQuote}
		<div class="domain-checkout-panel mt-4">
			<div class="domain-checkout-header">
				<div>
					<p class="domain-checkout-title">Selected domain</p>
					<p class="domain-checkout-domain">{selectedDomainQuote.domain}</p>
				</div>
				<div class="domain-checkout-total">
					{formatUsd(selectedDomainQuote.pricing.purchase.totalCents)}
				</div>
			</div>
			<p class="domain-checkout-fee-note">
				Includes domain registration plus combined payment/service fee.
			</p>
			<div class="domain-checkout-fields mt-3">
				<input class="input" bind:value={registrarContact.firstName} placeholder="First name" />
				<input class="input" bind:value={registrarContact.lastName} placeholder="Last name" />
				<input class="input" bind:value={registrarContact.email} placeholder="Email" />
				<input class="input" bind:value={registrarContact.phone} placeholder="Phone" />
				<input class="input" bind:value={registrarContact.address1} placeholder="Address line 1" />
				<input
					class="input"
					bind:value={registrarContact.address2}
					placeholder="Address line 2 (optional)"
				/>
				<input class="input" bind:value={registrarContact.city} placeholder="City" />
				<input class="input" bind:value={registrarContact.state} placeholder="State / Province" />
				<input class="input" bind:value={registrarContact.zip} placeholder="Postal code" />
				<input
					class="input"
					bind:value={registrarContact.country}
					placeholder="Country code (US)"
					maxlength="2"
				/>
			</div>
			<div class="domain-payment-element mt-3" bind:this={domainPaymentElementHost}></div>
			<div class="mt-3">
				<button
					type="button"
					class="btn preset-filled-primary-500"
					disabled={domainCheckoutBusy || domainPreparingPayment}
					onclick={() => void startDomainCheckout()}
				>
					{#if domainCheckoutBusy || domainPreparingPayment}
						<IconRefreshCw class="h-4 w-4 animate-spin" />
					{:else}
						<IconCreditCard class="h-4 w-4" />
					{/if}
					Pay {formatUsd(selectedDomainQuote.pricing.purchase.totalCents)}
				</button>
			</div>
		</div>
	{/if}

	{#if domainMessage}
		<div class="banner success mt-4">
			<p>{domainMessage}</p>
		</div>
	{/if}
	{#if domainError}
		<div class="banner error mt-4">
			<p>{domainError}</p>
		</div>
	{/if}
</div>

<style>
	.domain-purchase-panel {
		display: grid;
		gap: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-950, #0f172a) 50%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500, #64748b) 20%, transparent);
		border-radius: 0.75rem;
		padding: 0.9rem;
	}

	.domain-title {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.domain-search-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.domain-results {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.625rem;
	}

	.domain-result {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.875rem;
		background: color-mix(in oklab, var(--color-surface-900, #111827) 80%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500, #64748b) 20%, transparent);
		border-radius: 0.625rem;
	}

	.domain-result.is-selected {
		border-color: color-mix(in oklab, var(--color-primary-500, #f59e0b) 45%, transparent);
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-primary-500, #f59e0b) 20%, transparent);
	}

	.domain-result-info {
		min-width: 0;
	}

	.domain-result-name {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.domain-result-price {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-primary-400, #fbbf24);
		margin-top: 0.125rem;
	}

	.domain-result-meta {
		font-size: 0.72rem;
		opacity: 0.72;
		margin-top: 0.2rem;
	}

	.domain-checkout-panel {
		border: 1px solid color-mix(in oklab, var(--color-primary-500, #f59e0b) 30%, transparent);
		background: color-mix(in oklab, var(--color-surface-950, #0f172a) 70%, transparent);
		border-radius: 0.75rem;
		padding: 0.875rem;
	}

	.domain-checkout-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.domain-checkout-title {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.75;
	}

	.domain-checkout-domain {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.domain-checkout-total {
		font-weight: 700;
		color: var(--color-primary-400, #fbbf24);
	}

	.domain-checkout-fee-note {
		font-size: 0.72rem;
		opacity: 0.75;
		margin-top: 0.4rem;
	}

	.domain-checkout-fields {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.5rem;
	}

	.domain-payment-element {
		border: 1px solid color-mix(in oklab, var(--color-surface-500, #64748b) 25%, transparent);
		border-radius: 0.6rem;
		background: color-mix(in oklab, var(--color-surface-950, #0f172a) 65%, transparent);
		padding: 0.6rem;
		min-height: 3.25rem;
	}

	@media (max-width: 640px) {
		.domain-search-row {
			flex-direction: column;
			align-items: stretch;
		}
	}

	@media (min-width: 900px) {
		.domain-results {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.domain-checkout-fields {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
