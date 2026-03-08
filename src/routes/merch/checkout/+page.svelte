<script>
	import { onMount } from 'svelte';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconLoaderCircle from '@lucide/svelte/icons/loader-circle';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconTruck from '@lucide/svelte/icons/truck';
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
	let submitting = $state(false);
	let quoteTimer = 0;

	let line1 = $state('');
	let line2 = $state('');
	let city = $state('');
	let stateRegion = $state('');
	let postalCode = $state('');
	const country = 'US';

	const manualMethods = $derived(data?.fulfillmentMethods ?? []);
	const cartItems = $derived($merchCart ?? []);
	const hasManualItems = $derived(cartItems.some((line) => line.partnerProvider !== 'printful'));
	const hasPrintfulItems = $derived(cartItems.some((line) => line.partnerProvider === 'printful'));
	const selectedManualMethod = $derived(
		manualMethods.find((method) => method.id === manualFulfillmentMethodId) || null
	);
	const needsAddress = $derived(Boolean(hasPrintfulItems || selectedManualMethod?.requires_address));

	onMount(() => {
		if (!customerEmail && data?.user?.email) {
			customerEmail = data.user.email;
		}
		if (!manualFulfillmentMethodId && manualMethods[0]?.id) {
			manualFulfillmentMethodId = manualMethods[0].id;
		}
		merchCart.load();
		void refreshQuote();
		return () => {
			if (quoteTimer) clearTimeout(quoteTimer);
		};
	});

	function formatCurrency(cents) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
			Number(cents || 0) / 100
		);
	}

	function formatRule(rule, metricType) {
		if (!rule) return '';
		const min = Number(rule.min_value || 0);
		const max = rule.max_value === null || rule.max_value === undefined ? null : Number(rule.max_value);
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
			state: stateRegion,
			postalCode,
			country
		};
	}

	function scheduleQuote() {
		if (quoteTimer) clearTimeout(quoteTimer);
		quoteTimer = setTimeout(() => {
			void refreshQuote();
		}, 220);
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

	async function startCheckout(event) {
		event?.preventDefault?.();
		submitError = '';
		if (!data.canCheckout) {
			submitError = 'Checkout is currently unavailable.';
			return;
		}
		if (cartItems.length === 0) {
			submitError = 'Your cart is empty.';
			return;
		}
		if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
			submitError = 'A valid email is required.';
			return;
		}
		if (hasManualItems && !manualFulfillmentMethodId) {
			submitError = 'Select a fulfillment method for manual items.';
			return;
		}
		if (needsAddress && (!line1 || !city || !stateRegion || !postalCode)) {
			submitError = 'Complete the United States shipping address.';
			return;
		}
		if (hasPrintfulItems && !printfulShippingOptionId) {
			submitError = 'Select a shipping option for Printful items.';
			return;
		}

		submitting = true;
		try {
			const response = await fetch('/api/merch/create-checkout-session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
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
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error || 'Unable to create checkout session.');
			if (!payload?.url) throw new Error('Checkout URL was not returned.');
			window.location.href = payload.url;
		} catch (error) {
			submitError = error?.message || 'Unable to start checkout.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Checkout • 3 Feet Please Merch</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl space-y-5 pb-10">
	<section class="rounded-2xl border border-white/10 bg-black/20 p-5">
		<a href="/merch" class="text-sm opacity-85 hover:opacity-100">
			<IconArrowLeft class="mr-1 inline h-4 w-4" />
			Back to Merch
		</a>
		<h1 class="mt-2 text-3xl font-bold">Checkout</h1>
		<p class="mt-2 max-w-2xl text-sm opacity-75">
			One checkout, split the right way. Printful items ship from Printful, manual items use the
			fulfillment method you choose below.
		</p>
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
	</section>

	<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
		<form class="space-y-4" onsubmit={startCheckout}>
			<section class="rounded-2xl border border-white/10 bg-black/20 p-4">
				<h2 class="text-lg font-semibold">Contact</h2>
				<div class="mt-3 grid gap-3 md:grid-cols-2">
					<div>
						<label class="label" for="customer_name">Full Name</label>
						<input id="customer_name" class="input w-full" bind:value={customerName} maxlength="140" />
					</div>
					<div>
						<label class="label" for="customer_email">Email</label>
						<input id="customer_email" type="email" class="input w-full" bind:value={customerEmail} required />
					</div>
					<div>
						<label class="label" for="customer_phone">Phone (optional)</label>
						<input id="customer_phone" class="input w-full" bind:value={customerPhone} maxlength="40" />
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
								class="select w-full"
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
									Flat rate based on {formatRule(quote.manual.matchedRule, quote.manual.matchedRule.metric_type)}.
								</p>
							{/if}
						</div>
					</div>
				</section>
			{/if}

			{#if needsAddress}
				<section class="rounded-2xl border border-white/10 bg-black/20 p-4">
					<h2 class="text-lg font-semibold">Shipping Address</h2>
					<p class="mt-2 text-sm opacity-75">Merch shipping is currently limited to the United States.</p>
					<div class="mt-3 grid gap-3 md:grid-cols-2">
						<div class="md:col-span-2">
							<label class="label" for="line1">Address Line 1</label>
							<input id="line1" class="input w-full" bind:value={line1} required={needsAddress} oninput={scheduleQuote} />
						</div>
						<div class="md:col-span-2">
							<label class="label" for="line2">Address Line 2</label>
							<input id="line2" class="input w-full" bind:value={line2} oninput={scheduleQuote} />
						</div>
						<div>
							<label class="label" for="city">City</label>
							<input id="city" class="input w-full" bind:value={city} required={needsAddress} oninput={scheduleQuote} />
						</div>
						<div>
							<label class="label" for="state">State</label>
							<input id="state" class="input w-full" bind:value={stateRegion} required={needsAddress} oninput={scheduleQuote} />
						</div>
						<div>
							<label class="label" for="postal">ZIP Code</label>
							<input id="postal" class="input w-full" bind:value={postalCode} required={needsAddress} oninput={scheduleQuote} />
						</div>
						<div>
							<label class="label" for="country">Country</label>
							<input id="country" class="input w-full" value="United States" disabled />
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
								<label class="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm">
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
						<div class="mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm opacity-75">
							Enter a full United States shipping address to load live Printful shipping options.
						</div>
					{/if}
				</section>
			{/if}

			<section class="rounded-2xl border border-white/10 bg-black/20 p-4">
				<h2 class="text-lg font-semibold">Support 3FP</h2>
				<div class="mt-3 grid gap-3 md:grid-cols-2">
					<div>
						<label class="label" for="donation">Extra Donation (USD)</label>
						<input
							id="donation"
							type="number"
							min="0"
							step="1"
							class="input w-full"
							bind:value={donationAmount}
							oninput={scheduleQuote}
						/>
					</div>
					<div class="md:col-span-2">
						<label class="label" for="notes">Order Notes (optional)</label>
						<textarea id="notes" class="textarea w-full" rows="3" bind:value={notes}></textarea>
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
								<p class="text-xs opacity-75">{line.quantity} × {formatCurrency(line.priceCents)}</p>
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
						<div class="mt-1 flex items-center justify-between border-t border-white/12 pt-2 text-base font-bold">
							<span>Total</span>
							<span>{formatCurrency(quote.totalCents)}</span>
						</div>
					</div>
				{/if}

				{#if !data.canCheckout}
					<div class="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs">
						Checkout is disabled until Stripe is connected for this store.
					</div>
				{/if}
				<button
					type="submit"
					class="btn preset-filled-primary-500 mt-4 flex w-full items-center justify-center gap-2"
					disabled={submitting || !data.canCheckout || cartItems.length === 0}
					onclick={startCheckout}
				>
					<IconCreditCard class="h-4 w-4" />
					{submitting ? 'Redirecting to Stripe…' : 'Continue to Secure Payment'}
				</button>
			</section>
		</aside>
	</div>
</div>
