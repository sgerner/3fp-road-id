<script>
	import { onDestroy, onMount, tick } from 'svelte';
	import { loadStripe } from '@stripe/stripe-js';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconLoaderCircle from '@lucide/svelte/icons/loader-circle';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconTruck from '@lucide/svelte/icons/truck';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconCheck from '@lucide/svelte/icons/check';
	import { Combobox, Portal, useListCollection } from '@skeletonlabs/skeleton-svelte';
	import { merchCart } from '$lib/merch/cart';

	let { data } = $props();

	let customerName = $state('');
	let customerEmail = $state('');
	let customerPhone = $state('');
	let donationAmount = $state(0);
	let notes = $state('');
	let manualFulfillmentMethodId = $state('');
	let printfulShippingOptionId = $state('');
	let quote = $state(null);
	let quoteLoading = $state(false);
	let quoteError = $state('');
	let submitError = $state('');
	let submitSuccess = $state('');
	let submitting = $state(false);
	let preparingPayment = $state(false);
	let paymentFormReady = $state(false);
	let paymentElementHost = $state(null);
	let paymentIntentId = $state('');
	let paymentReturnUrl = $state('');
	let preparedSignature = $state('');
	let quoteTimer = 0;

	let line1 = $state('');
	let line2 = $state('');
	let city = $state('');
	let stateRegion = $state('');
	let postalCode = $state('');
	const country = 'US';

	const donationPresets = [10, 25, 50, 100, 250];
	const usStates = [
		{ code: 'AL', name: 'Alabama' },
		{ code: 'AK', name: 'Alaska' },
		{ code: 'AZ', name: 'Arizona' },
		{ code: 'AR', name: 'Arkansas' },
		{ code: 'CA', name: 'California' },
		{ code: 'CO', name: 'Colorado' },
		{ code: 'CT', name: 'Connecticut' },
		{ code: 'DE', name: 'Delaware' },
		{ code: 'FL', name: 'Florida' },
		{ code: 'GA', name: 'Georgia' },
		{ code: 'HI', name: 'Hawaii' },
		{ code: 'ID', name: 'Idaho' },
		{ code: 'IL', name: 'Illinois' },
		{ code: 'IN', name: 'Indiana' },
		{ code: 'IA', name: 'Iowa' },
		{ code: 'KS', name: 'Kansas' },
		{ code: 'KY', name: 'Kentucky' },
		{ code: 'LA', name: 'Louisiana' },
		{ code: 'ME', name: 'Maine' },
		{ code: 'MD', name: 'Maryland' },
		{ code: 'MA', name: 'Massachusetts' },
		{ code: 'MI', name: 'Michigan' },
		{ code: 'MN', name: 'Minnesota' },
		{ code: 'MS', name: 'Mississippi' },
		{ code: 'MO', name: 'Missouri' },
		{ code: 'MT', name: 'Montana' },
		{ code: 'NE', name: 'Nebraska' },
		{ code: 'NV', name: 'Nevada' },
		{ code: 'NH', name: 'New Hampshire' },
		{ code: 'NJ', name: 'New Jersey' },
		{ code: 'NM', name: 'New Mexico' },
		{ code: 'NY', name: 'New York' },
		{ code: 'NC', name: 'North Carolina' },
		{ code: 'ND', name: 'North Dakota' },
		{ code: 'OH', name: 'Ohio' },
		{ code: 'OK', name: 'Oklahoma' },
		{ code: 'OR', name: 'Oregon' },
		{ code: 'PA', name: 'Pennsylvania' },
		{ code: 'RI', name: 'Rhode Island' },
		{ code: 'SC', name: 'South Carolina' },
		{ code: 'SD', name: 'South Dakota' },
		{ code: 'TN', name: 'Tennessee' },
		{ code: 'TX', name: 'Texas' },
		{ code: 'UT', name: 'Utah' },
		{ code: 'VT', name: 'Vermont' },
		{ code: 'VA', name: 'Virginia' },
		{ code: 'WA', name: 'Washington' },
		{ code: 'WV', name: 'West Virginia' },
		{ code: 'WI', name: 'Wisconsin' },
		{ code: 'WY', name: 'Wyoming' }
	];
	let stateItems = $state(usStates);
	const stateCollection = $derived(
		useListCollection({
			items: stateItems,
			itemToString: (item) => item.code,
			itemToValue: (item) => item.code
		})
	);

	const manualMethods = $derived(data?.fulfillmentMethods ?? []);
	const cartItems = $derived($merchCart ?? []);
	const hasManualItems = $derived(cartItems.some((line) => line.partnerProvider !== 'printful'));
	const hasPrintfulItems = $derived(cartItems.some((line) => line.partnerProvider === 'printful'));
	const selectedManualMethod = $derived(
		manualMethods.find((method) => method.id === manualFulfillmentMethodId) || null
	);
	const needsAddress = $derived(
		Boolean(hasPrintfulItems || selectedManualMethod?.requires_address)
	);
	const checkoutDetailsComplete = $derived(
		validateCheckoutForm() === '' && Boolean(quote) && !quoteLoading && !quoteError
	);
	const payButtonDisabled = $derived(
		submitting || preparingPayment || !checkoutDetailsComplete || !paymentFormReady
	);

	const onStateOpenChange = () => {
		stateItems = usStates;
	};

	const onStateInputValueChange = (event) => {
		const inputValue = String(event?.inputValue || '')
			.toLowerCase()
			.trim();
		if (!inputValue) {
			stateItems = usStates;
			return;
		}
		const filtered = usStates.filter((region) =>
			`${region.code} ${region.name}`.toLowerCase().includes(inputValue)
		);
		stateItems = filtered.length ? filtered : usStates;
	};

	const onStateValueChange = (event) => {
		const next = Array.isArray(event?.value) ? String(event.value[0] || '') : '';
		stateRegion = next.toUpperCase();
		scheduleQuote();
	};

	let stripe = null;
	let elements = null;
	let paymentElement = null;

	onMount(async () => {
		if (!customerEmail && data?.user?.email) {
			customerEmail = data.user.email;
		}
		if (!manualFulfillmentMethodId && manualMethods[0]?.id) {
			manualFulfillmentMethodId = manualMethods[0].id;
		}
		merchCart.load();
		await tick();
		await refreshQuote();
		return () => {
			if (quoteTimer) clearTimeout(quoteTimer);
		};
	});

	onDestroy(() => {
		teardownPaymentElement();
	});

	$effect(() => {
		if (
			!paymentElementHost ||
			paymentFormReady ||
			preparingPayment ||
			paymentIntentId ||
			!checkoutDetailsComplete
		) {
			return;
		}
		void preparePaymentElement({ quiet: true });
	});

	function formatCurrency(cents) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
			Number(cents || 0) / 100
		);
	}

	function formatRule(rule, metricType) {
		if (!rule) return '';
		const min = Number(rule.min_value || 0);
		const max =
			rule.max_value === null || rule.max_value === undefined ? null : Number(rule.max_value);
		if (metricType === 'subtotal') {
			const minLabel = formatCurrency(min);
			const maxLabel = max === null ? '' : formatCurrency(max);
			if (max === null) return `${minLabel}+ order value`;
			return `${minLabel} to ${maxLabel} order value`;
		}
		if (max === null) return `${min}+ items`;
		return `${min}-${max} items`;
	}

	function cartItemsPayload() {
		return cartItems.map((line) => ({
			variantId: line.variantId,
			quantity: Number(line.quantity || 0)
		}));
	}

	function shippingAddressPayload() {
		return {
			line1,
			line2,
			city,
			state: String(stateRegion || '')
				.trim()
				.toUpperCase(),
			postalCode,
			country
		};
	}

	function buildCheckoutPayload() {
		return {
			storeSlug: 'main',
			items: cartItemsPayload(),
			manualFulfillmentMethodId: hasManualItems ? manualFulfillmentMethodId || null : null,
			printfulShippingOptionId: hasPrintfulItems ? printfulShippingOptionId || null : null,
			donationAmount: Number(donationAmount || 0),
			customer: {
				name: customerName,
				email: customerEmail,
				phone: customerPhone
			},
			shippingAddress: shippingAddressPayload(),
			notes
		};
	}

	function buildPaymentSignature() {
		const sortedItems = cartItemsPayload()
			.slice()
			.sort((a, b) => String(a.variantId).localeCompare(String(b.variantId)));
		return JSON.stringify({
			...buildCheckoutPayload(),
			items: sortedItems
		});
	}

	function validateCheckoutForm() {
		if (!data.canCheckout) return 'Checkout is currently unavailable.';
		if (cartItems.length === 0) return 'Your cart is empty.';
		if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
			return 'A valid email is required.';
		}
		if (hasManualItems && !manualFulfillmentMethodId) {
			return 'Select a fulfillment method for manual items.';
		}
		if (needsAddress && (!line1 || !city || !stateRegion || !postalCode)) {
			return 'Complete the United States shipping address.';
		}
		if (hasPrintfulItems && !printfulShippingOptionId) {
			return 'Select a shipping option for Printful items.';
		}
		return '';
	}

	function scheduleQuote() {
		if (quoteTimer) clearTimeout(quoteTimer);
		quoteTimer = setTimeout(() => {
			void refreshQuote();
		}, 220);
	}

	function teardownPaymentElement() {
		if (paymentElement) {
			paymentElement.destroy();
			paymentElement = null;
		}
		elements = null;
		stripe = null;
		paymentFormReady = false;
		paymentIntentId = '';
		paymentReturnUrl = '';
		preparedSignature = '';
	}

	async function refreshQuote() {
		quoteError = '';
		const items = cartItemsPayload();
		if (!items.length) {
			quote = null;
			return;
		}

		quoteLoading = true;
		try {
			const response = await fetch('/api/merch/quote', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					storeSlug: 'main',
					items,
					manualFulfillmentMethodId: hasManualItems ? manualFulfillmentMethodId || null : null,
					printfulShippingOptionId: hasPrintfulItems ? printfulShippingOptionId || null : null,
					shippingAddress: shippingAddressPayload(),
					donationAmount: Number(donationAmount || 0)
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error || 'Failed to calculate totals.');
			quote = payload?.quote || null;

			if (!manualFulfillmentMethodId && payload?.quote?.manual?.selectedMethod?.id) {
				manualFulfillmentMethodId = payload.quote.manual.selectedMethod.id;
			}
			if (payload?.quote?.printful?.selectedOption?.id) {
				printfulShippingOptionId = payload.quote.printful.selectedOption.id;
			} else if (!payload?.quote?.printful?.present) {
				printfulShippingOptionId = '';
			}
		} catch (error) {
			quoteError = error?.message || 'Failed to calculate totals.';
			quote = null;
		} finally {
			quoteLoading = false;
		}
	}

	async function preparePaymentElement(options = {}) {
		const { quiet = false } = options;
		if (!quiet) {
			submitError = '';
			submitSuccess = '';
		}

		const validationError = validateCheckoutForm();
		if (validationError) {
			if (!quiet) submitError = validationError;
			return false;
		}

		preparingPayment = true;
		try {
			teardownPaymentElement();
			const response = await fetch('/api/merch/create-payment-intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(buildCheckoutPayload())
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to prepare payment form.');
			}
			if (
				!payload?.clientSecret ||
				!payload?.publishableKey ||
				!payload?.connectedAccountId ||
				!payload?.returnUrl
			) {
				throw new Error('Stripe payment form could not be initialized.');
			}

			stripe = await loadStripe(payload.publishableKey, {
				stripeAccount: payload.connectedAccountId
			});
			if (!stripe) {
				throw new Error('Stripe.js failed to load.');
			}

			paymentIntentId = payload.paymentIntentId || '';
			paymentReturnUrl = payload.returnUrl;
			preparedSignature = buildPaymentSignature();

			await tick();
			elements = stripe.elements({
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
			paymentElement = elements.create('payment', {
				layout: {
					type: 'tabs',
					defaultCollapsed: false
				}
			});
			paymentElement.mount(paymentElementHost);
			paymentFormReady = true;
			if (!quiet) submitSuccess = 'Secure payment form loaded below.';
			return true;
		} catch (error) {
			teardownPaymentElement();
			if (!quiet) submitError = error?.message || 'Unable to prepare payment form.';
			return false;
		} finally {
			preparingPayment = false;
		}
	}

	async function syncPaymentIntentDetails() {
		if (!paymentIntentId) {
			return preparePaymentElement({ quiet: true });
		}

		const response = await fetch('/api/merch/update-payment-intent', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				paymentIntentId,
				...buildCheckoutPayload()
			})
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload?.error || 'Unable to update payment details.');
		}

		preparedSignature = buildPaymentSignature();
		if (elements?.fetchUpdates) {
			await elements.fetchUpdates();
		}
	}

	async function startCheckout(event) {
		event?.preventDefault?.();
		submitError = '';
		submitSuccess = '';

		const validationError = validateCheckoutForm();
		if (validationError) {
			submitError = validationError;
			return;
		}

		if (!paymentFormReady) {
			await preparePaymentElement({ quiet: false });
		}
		if (!paymentFormReady) return;

		if (preparedSignature !== buildPaymentSignature()) {
			try {
				await syncPaymentIntentDetails();
			} catch (error) {
				submitError = error?.message || 'Unable to update payment details.';
				return;
			}
		}

		if (!stripe || !elements || !paymentReturnUrl) {
			submitError = 'Stripe payment form is not ready yet.';
			return;
		}

		submitting = true;
		try {
			const { error: stripeError } = await stripe.confirmPayment({
				elements,
				confirmParams: {
					return_url: paymentReturnUrl
				}
			});
			if (stripeError) {
				throw new Error(stripeError.message || 'Unable to confirm payment.');
			}
		} catch (error) {
			submitError = error?.message || 'Unable to confirm payment.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Checkout • 3 Feet Please Merch</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl space-y-5 pb-10">
	<section class="hero-section relative overflow-hidden rounded-3xl p-5 lg:p-6">
		<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-3" aria-hidden="true"></div>

		<div class="relative z-10">
			<h1 class="mt-2 text-3xl font-bold">Checkout</h1>
			{#if data.canceled}
				<div class="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm">
					Checkout was canceled. Your cart is still here.
				</div>
			{/if}
			{#if data.loadError}
				<div class="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm">
					{data.loadError}
				</div>
			{/if}
		</div>
	</section>

	<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
		<form id="merch-checkout-form" class="space-y-4" onsubmit={startCheckout}>
			<section class="rounded-2xl border border-white/10 bg-black/20 p-4">
				<h2 class="text-lg font-semibold">Contact</h2>
				<div class="mt-3 grid gap-3 md:grid-cols-2">
					<div>
						<label class="label" for="customer_name">Full Name</label>
						<input
							id="customer_name"
							class="input preset-tonal-surface w-full"
							bind:value={customerName}
							maxlength="140"
						/>
					</div>
					<div>
						<label class="label" for="customer_email">Email</label>
						<input
							id="customer_email"
							type="email"
							class="input preset-tonal-surface w-full"
							bind:value={customerEmail}
							required
						/>
					</div>
					<div>
						<label class="label" for="customer_phone">Phone (optional)</label>
						<input
							id="customer_phone"
							class="input preset-tonal-surface w-full"
							bind:value={customerPhone}
							maxlength="40"
						/>
					</div>
				</div>
			</section>

			{#if hasManualItems}
				<section class="rounded-2xl border border-white/10 bg-black/20 p-4">
					<div class="flex items-center gap-2">
						<IconTruck class="h-4 w-4" />
						<h2 class="text-lg font-semibold">Manual Item Fulfillment</h2>
					</div>
					<p class="mt-2 text-sm opacity-75">
						Choose how 3 Feet Please should handle the items fulfilled directly by the organization.
					</p>
					<div class="mt-3 grid gap-3 md:grid-cols-2">
						<div class="md:col-span-2">
							<label class="label" for="manual_method">Method</label>
							<select
								id="manual_method"
								class="select preset-tonal-surface w-full"
								bind:value={manualFulfillmentMethodId}
								onchange={scheduleQuote}
								required
							>
								<option value="" disabled>Select a method</option>
								{#each manualMethods as method (method.id)}
									<option value={method.id}>
										{method.name}
										{method.shipping_speed_label ? ` · ${method.shipping_speed_label}` : ''}
									</option>
								{/each}
							</select>
							{#if selectedManualMethod?.description}
								<p class="mt-1 text-xs opacity-70">{selectedManualMethod.description}</p>
							{/if}
							{#if quote?.manual?.matchedRule}
								<p class="mt-1 text-xs opacity-60">
									Flat rate based on {formatRule(
										quote.manual.matchedRule,
										quote.manual.matchedRule.metric_type
									)}.
								</p>
							{/if}
						</div>
					</div>
				</section>
			{/if}

			{#if needsAddress}
				<section class="rounded-2xl border border-white/10 bg-black/20 p-4">
					<h2 class="text-lg font-semibold">Shipping Address</h2>
					<p class="mt-2 text-sm opacity-75">
						Merch shipping is currently limited to the United States.
					</p>
					<div class="mt-3 grid gap-3 md:grid-cols-2">
						<div class="md:col-span-2">
							<label class="label" for="line1">Address Line 1</label>
							<input
								id="line1"
								class="input preset-tonal-surface w-full"
								bind:value={line1}
								required={needsAddress}
								oninput={scheduleQuote}
							/>
						</div>
						<div class="md:col-span-2">
							<label class="label" for="line2">Address Line 2</label>
							<input
								id="line2"
								class="input preset-tonal-surface w-full"
								bind:value={line2}
								oninput={scheduleQuote}
							/>
						</div>
						<div>
							<label class="label" for="city">City</label>
							<input
								id="city"
								class="input preset-tonal-surface w-full"
								bind:value={city}
								required={needsAddress}
								oninput={scheduleQuote}
							/>
						</div>
						<div>
							<label class="label" for="state">State</label>
							<Combobox
								collection={stateCollection}
								value={stateRegion ? [stateRegion] : []}
								onOpenChange={onStateOpenChange}
								onInputValueChange={onStateInputValueChange}
								onValueChange={onStateValueChange}
								inputBehavior="autohighlight"
								placeholder="Type to search (e.g. AZ)"
								openOnClick
								class="w-full"
							>
								<Combobox.Control class="w-full">
									<Combobox.Input id="state" class="input preset-tonal-surface w-full" />
								</Combobox.Control>
								<Portal>
									<Combobox.Positioner>
										<Combobox.Content class="preset-tonal-surface z-50 max-h-64 overflow-auto p-1">
											{#each stateItems as region (region.code)}
												<Combobox.Item item={region} class="hover:preset-tonal-tertiary p-2">
													<Combobox.ItemText>{region.code} - {region.name}</Combobox.ItemText>
													<Combobox.ItemIndicator />
												</Combobox.Item>
											{/each}
										</Combobox.Content>
									</Combobox.Positioner>
								</Portal>
							</Combobox>
							<input
								class="sr-only"
								required={needsAddress}
								value={stateRegion}
								tabindex="-1"
								aria-hidden="true"
								readonly
							/>
						</div>
						<div>
							<label class="label" for="postal">ZIP Code</label>
							<input
								id="postal"
								class="input preset-tonal-surface w-full"
								bind:value={postalCode}
								required={needsAddress}
								oninput={scheduleQuote}
							/>
						</div>
						<div>
							<label class="label" for="country">Country</label>
							<input
								id="country"
								class="input preset-tonal-surface w-full"
								value="United States"
								disabled
							/>
						</div>
					</div>
				</section>
			{/if}

			{#if hasPrintfulItems}
				<section class="rounded-2xl border border-white/10 bg-black/20 p-4">
					<h2 class="text-lg font-semibold">Printful Shipping</h2>
					<p class="mt-2 text-sm opacity-75">
						These rates come directly from Printful for the items they will fulfill.
					</p>
					{#if quote?.printful?.addressReady && (quote?.printful?.options?.length ?? 0) > 0}
						<div class="mt-3 space-y-2">
							{#each quote.printful.options as option (option.id)}
								<label
									class="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm"
								>
									<input
										type="radio"
										name="printful_shipping_option"
										value={option.id}
										checked={printfulShippingOptionId === option.id}
										onchange={() => {
											printfulShippingOptionId = option.id;
											scheduleQuote();
										}}
									/>
									<div class="flex-1">
										<div class="flex items-center justify-between gap-3">
											<span class="font-semibold">{option.name}</span>
											<span>{formatCurrency(option.amountCents)}</span>
										</div>
										{#if option.minDeliveryDays || option.maxDeliveryDays}
											<div class="mt-1 text-xs opacity-65">
												Estimated delivery
												{option.minDeliveryDays || option.maxDeliveryDays}
												{#if option.maxDeliveryDays && option.minDeliveryDays !== option.maxDeliveryDays}
													-{option.maxDeliveryDays}
												{/if}
												days
											</div>
										{/if}
									</div>
								</label>
							{/each}
						</div>
					{:else}
						<div
							class="mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm opacity-75"
						>
							Enter a full United States shipping address to load live Printful shipping options.
						</div>
					{/if}
				</section>
			{/if}

			<section class="rounded-2xl border border-white/10 bg-black/20 p-4">
				<h2 class="text-lg font-semibold">Support 3FP</h2>
				<div class="mt-3 space-y-3">
					<label class="label" for="donation">Add an extra donation</label>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="btn px-4 py-2 {Number(donationAmount) === 0
								? 'preset-filled-primary-500'
								: 'preset-outlined-primary-500'}"
							onclick={() => {
								donationAmount = 0;
								scheduleQuote();
							}}
						>
							No thanks
						</button>
						{#each donationPresets as preset (preset)}
							<button
								type="button"
								class="btn px-4 py-2 {Number(donationAmount) === preset
									? 'preset-filled-primary-500'
									: 'preset-outlined-primary-500'}"
								onclick={() => {
									donationAmount = preset;
									scheduleQuote();
								}}
							>
								${preset}
							</button>
						{/each}
					</div>
					<input
						id="donation"
						type="number"
						min="0"
						step="1"
						class="input preset-tonal-surface w-full md:w-56"
						bind:value={donationAmount}
						oninput={scheduleQuote}
					/>
					<div>
						<label class="label" for="notes">Order Notes (optional)</label>
						<textarea
							id="notes"
							class="textarea preset-tonal-surface w-full"
							rows="3"
							bind:value={notes}
						></textarea>
					</div>
				</div>
			</section>
		</form>

		<aside class="space-y-3">
			<section class="rounded-2xl border border-white/10 bg-black/20 p-4">
				<h2 class="text-sm font-semibold uppercase">Order Summary</h2>
				{#if cartItems.length === 0}
					<p class="mt-3 text-sm opacity-70">Your cart is empty.</p>
				{:else}
					<ul class="mt-3 space-y-2">
						{#each cartItems as line (line.variantId)}
							<li class="rounded-lg border border-white/10 bg-black/15 px-2.5 py-2">
								<p class="truncate text-sm font-semibold">{line.productName}</p>
								<p class="truncate text-xs opacity-70">{line.variantName}</p>
								<p class="text-xs opacity-75">
									{line.quantity} × {formatCurrency(line.priceCents)}
								</p>
							</li>
						{/each}
					</ul>
				{/if}

				{#if quoteLoading}
					<div class="mt-4 flex items-center gap-2 text-sm opacity-75">
						<IconLoaderCircle class="h-4 w-4 animate-spin" />
						Updating totals…
					</div>
				{/if}
				{#if quoteError}
					<div class="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm">
						{quoteError}
					</div>
				{/if}
				{#if submitError}
					<div class="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm">
						{submitError}
					</div>
				{/if}
				{#if submitSuccess}
					<div
						class="mt-3 flex items-center gap-2 rounded-lg border border-green-500/35 bg-green-500/10 px-3 py-2 text-sm"
					>
						<IconCheck class="h-4 w-4 shrink-0 text-green-400" />
						{submitSuccess}
					</div>
				{/if}

				{#if quote}
					<div class="mt-4 space-y-1.5 text-sm">
						<div class="flex items-center justify-between opacity-80">
							<span>Subtotal</span>
							<span>{formatCurrency(quote.subtotalCents)}</span>
						</div>
						{#if quote.manual?.present}
							<div class="flex items-center justify-between opacity-80">
								<span>{quote.manual?.selectedMethod?.name || 'Manual fulfillment'}</span>
								<span>{formatCurrency(quote.manualShippingFeeCents)}</span>
							</div>
						{/if}
						{#if quote.printful?.present}
							<div class="flex items-center justify-between opacity-80">
								<span>{quote.printful?.selectedOption?.name || 'Printful shipping'}</span>
								<span>{formatCurrency(quote.printfulShippingFeeCents)}</span>
							</div>
						{/if}
						<div class="flex items-center justify-between opacity-80">
							<span>Tax</span>
							<span>{formatCurrency(quote.taxCents)}</span>
						</div>
						{#if quote.donationCents > 0}
							<div class="flex items-center justify-between opacity-80">
								<span>Donation</span>
								<span>{formatCurrency(quote.donationCents)}</span>
							</div>
						{/if}
						<div
							class="mt-1 flex items-center justify-between border-t border-white/12 pt-2 text-base font-bold"
						>
							<span>Total</span>
							<span>{formatCurrency(quote.totalCents)}</span>
						</div>
					</div>
				{/if}

				<div class="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3">
					<div class="mb-2 flex items-center gap-2 text-xs font-semibold uppercase opacity-75">
						<IconCreditCard class="h-4 w-4" />
						Card Details
					</div>
					<div bind:this={paymentElementHost}></div>
					{#if !paymentFormReady}
						<p class="text-xs opacity-60">
							Card form appears automatically after required checkout details are complete.
						</p>
					{/if}
				</div>

				{#if !data.canCheckout}
					<div class="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs">
						Checkout is disabled until Stripe is connected for this store.
					</div>
				{/if}
				<button
					type="submit"
					form="merch-checkout-form"
					class="btn preset-filled-primary-500 mt-4 flex w-full items-center justify-center gap-2"
					disabled={payButtonDisabled}
				>
					<IconHeart class="h-4 w-4" />
					{#if preparingPayment}
						Loading secure payment form…
					{:else if submitting}
						Confirming payment…
					{:else}
						Pay
					{/if}
				</button>
			</section>
		</aside>
	</div>
</div>

<style>
	.hero-section {
		background: color-mix(in oklab, var(--color-primary-500) 14%, var(--color-surface-950) 86%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 28%, transparent);
	}

	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(72px);
		pointer-events: none;
	}

	.hero-orb-1 {
		width: 60%;
		height: 220%;
		top: -60%;
		left: -12%;
		background: color-mix(in oklab, var(--color-primary-500) 24%, transparent);
		animation: orb-drift 20s ease-in-out infinite alternate;
	}

	.hero-orb-2 {
		width: 40%;
		height: 180%;
		top: -40%;
		right: 2%;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation: orb-drift 26s ease-in-out infinite alternate-reverse;
	}

	.hero-orb-3 {
		width: 30%;
		height: 160%;
		bottom: -50%;
		left: 28%;
		background: color-mix(in oklab, var(--color-tertiary-500) 14%, transparent);
		animation: orb-drift 30s ease-in-out infinite alternate;
	}

	@keyframes orb-drift {
		0% {
			transform: translate3d(0, 0, 0) scale(1);
		}
		100% {
			transform: translate3d(3%, -2%, 0) scale(1.05);
		}
	}
</style>
