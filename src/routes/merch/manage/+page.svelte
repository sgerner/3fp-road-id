<script>
	import { enhance } from '$app/forms';
	import { fade, fly, scale } from 'svelte/transition';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import IconSettings from '@lucide/svelte/icons/settings';
	import IconPackage from '@lucide/svelte/icons/package';
	import IconTruck from '@lucide/svelte/icons/truck';
	import IconReceiptText from '@lucide/svelte/icons/receipt-text';
	import IconCircleCheck from '@lucide/svelte/icons/circle-check';
	import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
	import IconLoaderCircle from '@lucide/svelte/icons/loader-circle';
	import IconStore from '@lucide/svelte/icons/store';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconPencil from '@lucide/svelte/icons/pencil';
	import IconX from '@lucide/svelte/icons/x';
	import IconTag from '@lucide/svelte/icons/tag';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';

	let { data, form } = $props();
	let printfulActionState = $state('');
	let productQuery = $state('');
	let productSourceFilter = $state('all');
	let productStatusFilter = $state('all');
	let productTypeFilter = $state('all');
	let productModalId = $state('');
	let productModalOpen = $state(false);
	let manageTab = $state('orders');
	let settingsPrintfulOpen = $state(false);
	let settingsTaxOpen = $state(false);
	let settingsFulfillmentOpen = $state(false);

	const updateMessages = {
		tax: 'Tax settings saved.',
		printful: 'Printful store settings saved.',
		printful_sync: 'Printful catalog synced.',
		fulfillment: 'Fulfillment methods updated.',
		products: 'Product changes saved.',
		variants: 'Variant changes saved.',
		orders: 'Order updated.',
		refund: 'Refund submitted.'
	};

	function formatCurrency(cents) {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
			Number(cents || 0) / 100
		);
	}

	function formatDate(value) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
			date
		);
	}

	function flatRatePercentFromBps(bps) {
		return Number(bps || 0) / 100;
	}

	function metricValueLabel(rule) {
		if (!rule) return '';
		if (rule.metric_type === 'subtotal') {
			return `${formatCurrency(rule.min_value)}${rule.max_value === null ? '+' : ` - ${formatCurrency(rule.max_value)}`}`;
		}
		return `${rule.min_value}${rule.max_value === null ? '+' : ` - ${rule.max_value}`} items`;
	}

	function getOrderItems(orderId) {
		return data?.orderItemsByOrderId?.get?.(orderId) || [];
	}

	function enhancePrintfulSettings({ submitter }) {
		const formAction = submitter?.getAttribute('formaction') || '';
		printfulActionState = formAction.includes('syncPrintfulCatalog') ? 'sync' : 'save';

		return async ({ update }) => {
			try {
				await update();
			} finally {
				printfulActionState = '';
			}
		};
	}

	function cleanText(value) {
		return String(value || '').trim();
	}

	function normalizeKey(value) {
		return cleanText(value).toLowerCase();
	}

	function getProductItemType(product) {
		return (
			cleanText(product?.metadata?.printful_product?.type) ||
			cleanText(product?.metadata?.item_type) ||
			'General'
		);
	}

	function productPreviewImage(product) {
		return (
			cleanText(product?.featured_image_url) ||
			cleanText(product?.image_url) ||
			(Array.isArray(product?.images) && product.images.length ? cleanText(product.images[0]) : '')
		);
	}

	function openProductModal(productId) {
		productModalId = cleanText(productId);
		productModalOpen = true;
	}

	function closeProductModal() {
		productModalOpen = false;
		productModalId = '';
	}

	function onManageKeydown(event) {
		if (!productModalOpen) return;
		if (event.key === 'Escape') closeProductModal();
	}

	const productTypeOptions = $derived(
		Array.from(new Set((data.products ?? []).map((product) => getProductItemType(product))))
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b))
	);

	const filteredProducts = $derived(
		(data.products ?? []).filter((product) => {
			const name = normalizeKey(product?.name);
			const description = normalizeKey(product?.description);
			const query = normalizeKey(productQuery);
			const source = product?.source_of_truth === 'printful' ? 'printful' : 'local';
			const status = cleanText(product?.status || 'active').toLowerCase();
			const type = normalizeKey(getProductItemType(product));

			if (query && !name.includes(query) && !description.includes(query)) return false;
			if (productSourceFilter !== 'all' && source !== productSourceFilter) return false;
			if (productStatusFilter !== 'all' && status !== productStatusFilter) return false;
			if (productTypeFilter !== 'all' && type !== normalizeKey(productTypeFilter)) return false;
			return true;
		})
	);

	const selectedProduct = $derived(
		(data.products ?? []).find((product) => product.id === productModalId) || null
	);
</script>

<svelte:window onkeydown={onManageKeydown} />

<svelte:head>
	<title>Merch Manager • 3 Feet Please</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-6 pb-12" in:fade={{ duration: 180 }}>
	<section class="manage-hero relative overflow-hidden rounded-3xl p-6 md:p-8">
		<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
		<div class="hero-orb hero-orb-3" aria-hidden="true"></div>
		<div class="relative z-10 flex flex-wrap items-start justify-between gap-4">
			<div>
				<h1 class="mt-2 text-3xl leading-tight font-black md:text-4xl">Manage Merch Store</h1>
				<p class="mt-2 max-w-2xl text-sm opacity-80">
					Create products, configure fulfillment, control tax collection, and process refunds.
				</p>
			</div>
			<div class="grid min-w-[15rem] gap-2 text-sm sm:grid-cols-3 sm:text-right">
				<div class="hero-pill rounded-xl px-3 py-2">
					<div class="opacity-70">Products</div>
					<div class="text-xl font-bold">{data.products?.length ?? 0}</div>
				</div>
				<div class="hero-pill rounded-xl px-3 py-2">
					<div class="opacity-70">Fulfillment</div>
					<div class="text-xl font-bold">{data.fulfillmentMethods?.length ?? 0}</div>
				</div>
				<div class="hero-pill rounded-xl px-3 py-2">
					<div class="opacity-70">Orders</div>
					<div class="text-xl font-bold">{data.orders?.length ?? 0}</div>
				</div>
			</div>
		</div>
	</section>

	{#if data.updated && updateMessages[data.updated]}
		<div
			class="rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm"
			transition:fade={{ duration: 150 }}
		>
			<div class="flex items-center gap-2">
				<IconCircleCheck class="h-4 w-4" />
				{updateMessages[data.updated]}
			</div>
		</div>
	{/if}
	{#if form?.error}
		<div
			class="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm"
			transition:fade={{ duration: 150 }}
		>
			<div class="flex items-center gap-2">
				<IconCircleAlert class="h-4 w-4" />
				{form.error}
			</div>
		</div>
	{/if}
	{#if data.printfulStatus === 'connected'}
		<div
			class="rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm"
			transition:fade={{ duration: 150 }}
		>
			<div class="flex items-center gap-2">
				<IconCircleCheck class="h-4 w-4" />
				Printful connected successfully.
			</div>
		</div>
	{:else if data.printfulStatus === 'disconnected'}
		<div
			class="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm"
			transition:fade={{ duration: 150 }}
		>
			<div class="flex items-center gap-2">
				<IconCircleAlert class="h-4 w-4" />
				Printful disconnected.
			</div>
		</div>
	{:else if data.printfulStatus === 'error'}
		<div
			class="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm"
			transition:fade={{ duration: 150 }}
		>
			<div class="flex items-center gap-2">
				<IconCircleAlert class="h-4 w-4" />
				Printful connection failed{data.printfulReason ? `: ${data.printfulReason}` : '.'}
			</div>
		</div>
	{/if}

	<Tabs
		value={manageTab}
		onValueChange={(details) => (manageTab = details.value)}
		class="space-y-4"
	>
		<div class="manage-tabs-rail">
			<Tabs.List class="manage-tabs-list">
				<Tabs.Trigger class="manage-tab-trigger" value="orders">Orders</Tabs.Trigger>
				<Tabs.Trigger class="manage-tab-trigger" value="catalog">Catalog</Tabs.Trigger>
				<Tabs.Trigger class="manage-tab-trigger" value="settings">Settings</Tabs.Trigger>
				<Tabs.Indicator class="hidden" />
			</Tabs.List>
		</div>

		<Tabs.Content value="settings">
			<div in:fly={{ y: 12, duration: 170 }} out:fade={{ duration: 110 }}>
				<div class="space-y-4">
					<div class="settings-accordion rounded-2xl">
						<button
							type="button"
							class="settings-accordion-trigger"
							aria-expanded={settingsPrintfulOpen}
							onclick={() => (settingsPrintfulOpen = !settingsPrintfulOpen)}
						>
							<span class="flex items-center gap-2">
								<IconStore class="h-4 w-4" />
								Printful
							</span>
							<IconChevronDown
								class={`h-4 w-4 transition-transform ${settingsPrintfulOpen ? 'rotate-180' : ''}`}
							/>
						</button>
						{#if settingsPrintfulOpen}
							<div in:fly={{ y: 8, duration: 160 }} out:fade={{ duration: 100 }}>
								<section class="panel mt-2 rounded-2xl p-5">
									<div class="mb-3 flex items-center gap-2">
										<IconStore class="h-4 w-4" />
										<h2 class="text-lg font-semibold">Printful</h2>
									</div>
									<p class="text-sm opacity-75">
										Authorize Printful with OAuth, choose the connected Printful store to mirror
										into 3FP, and keep imported products synced from Printful as the source of
										truth.
									</p>
									<hr class="my-4" />
									<div class="flex flex-wrap items-start justify-between gap-4">
										<div class="min-w-[16rem] flex-1 text-sm">
											<div class="font-semibold">
												{data.printfulAccount?.connected_at
													? 'Printful connected'
													: 'Printful not connected'}
											</div>
											{#if data.printfulAccount?.connected_at}
												<div class="mt-0.5 opacity-70">
													Connected {formatDate(data.printfulAccount.connected_at)}
												</div>
											{/if}
											{#if data.printfulAccount?.last_refreshed_at}
												<div class="mt-0.5 opacity-70">
													Last token refresh {formatDate(data.printfulAccount.last_refreshed_at)}
												</div>
											{/if}
											{#if data.printfulAccount?.last_error}
												<div class="mt-2 text-red-300">{data.printfulAccount.last_error}</div>
											{/if}
											{#if data.store?.printful_last_synced_at}
												<div class="mt-0.5 opacity-70">
													Last catalog sync {formatDate(data.store.printful_last_synced_at)}
												</div>
											{/if}
											{#if data.store?.printful_last_sync_error}
												<div class="mt-2 text-red-300">{data.store.printful_last_sync_error}</div>
											{/if}
										</div>
										<div class="flex flex-wrap gap-2">
											<a
												class="btn btn-sm preset-filled-primary-500"
												href="/api/merch/partners/printful/start?recipient=main"
											>
												{data.printfulAccount?.connected_at
													? 'Reconnect Printful'
													: 'Connect Printful'}
											</a>
											{#if data.printfulAccount?.connected_at}
												<form method="POST" action="?/disconnectPrintful">
													<button class="btn preset-outlined-error-500 btn-sm" type="submit"
														>Disconnect</button
													>
												</form>
											{/if}
										</div>
									</div>
									{#if data.printfulAccount?.connected_at}
										<form
											method="POST"
											action="?/savePrintfulSettings"
											use:enhance={enhancePrintfulSettings}
											class="mt-4 grid gap-3 md:grid-cols-2"
											in:fade={{ duration: 150 }}
											out:fade={{ duration: 100 }}
										>
											<div class="md:col-span-2">
												<label class="label" for="printful_store_id">Connected Printful Store</label
												>
												<select
													id="printful_store_id"
													name="printful_store_id"
													class="select w-full"
													required
												>
													<option value="" disabled selected={!data.store?.printful_store_id}
														>Choose a Printful store</option
													>
													{#each data.printfulStores ?? [] as storeChoice (storeChoice.id)}
														<option
															value={storeChoice.id}
															selected={Number(data.store?.printful_store_id || 0) ===
																Number(storeChoice.id)}
														>
															{storeChoice.name}
														</option>
													{/each}
												</select>
											</div>
											<div class="flex items-center gap-2 text-sm md:col-span-2">
												<input
													id="printful_sync_enabled"
													type="checkbox"
													name="printful_sync_enabled"
													value="1"
													checked={data.store?.printful_sync_enabled === true}
												/>
												<label for="printful_sync_enabled">
													Keep imported products synced automatically from Printful
												</label>
											</div>
											<div class="flex flex-wrap gap-2 md:col-span-2">
												<button
													class="btn preset-filled-primary-500"
													type="submit"
													disabled={printfulActionState !== ''}
												>
													{#if printfulActionState === 'save'}
														<IconLoaderCircle class="mr-2 inline h-4 w-4 animate-spin" />
														Saving...
													{:else}
														Save Printful Store
													{/if}
												</button>
												<button
													class="btn preset-outlined-primary-500"
													type="submit"
													formaction="?/syncPrintfulCatalog"
													disabled={printfulActionState !== ''}
												>
													{#if printfulActionState === 'sync'}
														<IconLoaderCircle class="mr-2 inline h-4 w-4 animate-spin" />
														Importing / Syncing...
													{:else}
														Import / Sync Catalog
													{/if}
												</button>
											</div>
											{#if printfulActionState === 'sync'}
												<div
													class="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-sm opacity-80 md:col-span-2"
													in:fade={{ duration: 120 }}
													out:fade={{ duration: 90 }}
												>
													<div class="flex items-center gap-2">
														<IconLoaderCircle class="h-4 w-4 animate-spin" />
														Syncing products from Printful. This can take a moment.
													</div>
												</div>
											{/if}
										</form>
									{/if}
								</section>
							</div>
						{/if}
					</div>

					<div class="settings-accordion rounded-2xl">
						<button
							type="button"
							class="settings-accordion-trigger"
							aria-expanded={settingsTaxOpen}
							onclick={() => (settingsTaxOpen = !settingsTaxOpen)}
						>
							<span class="flex items-center gap-2">
								<IconSettings class="h-4 w-4" />
								Sales Tax Settings
							</span>
							<IconChevronDown
								class={`h-4 w-4 transition-transform ${settingsTaxOpen ? 'rotate-180' : ''}`}
							/>
						</button>
						{#if settingsTaxOpen}
							<div in:fly={{ y: 8, duration: 160 }} out:fade={{ duration: 100 }}>
								<section class="panel mt-2 rounded-2xl p-5">
									<div class="mb-3 flex items-center gap-2">
										<IconSettings class="h-4 w-4" />
										<h2 class="text-lg font-semibold">Sales Tax Settings</h2>
									</div>
									<form method="POST" action="?/saveTax" class="space-y-3">
										<input type="hidden" name="store_id" value={data.store.id} />
										<div>
											<label class="label" for="tax_mode">Mode</label>
											<select id="tax_mode" name="mode" class="select w-full">
												<option value="none" selected={data.taxSettings?.mode !== 'flat_rate'}
													>Do Not Collect</option
												>
												<option value="flat_rate" selected={data.taxSettings?.mode === 'flat_rate'}
													>Collect Flat Rate</option
												>
											</select>
										</div>
										<div>
											<label class="label" for="flat_rate_percent">Flat Rate Percent</label>
											<input
												id="flat_rate_percent"
												name="flat_rate_percent"
												type="number"
												step="0.01"
												min="0"
												max="25"
												class="input w-full"
												value={flatRatePercentFromBps(data.taxSettings?.flat_rate_bps)}
											/>
										</div>
										<div>
											<label class="label" for="tax_notes">Notes</label>
											<textarea id="tax_notes" name="notes" class="textarea w-full" rows="3"
												>{data.taxSettings?.notes || ''}</textarea
											>
										</div>
										<button class="btn preset-filled-primary-500" type="submit"
											>Save Tax Settings</button
										>
									</form>
								</section>
							</div>
						{/if}
					</div>

					<div class="settings-accordion rounded-2xl">
						<button
							type="button"
							class="settings-accordion-trigger"
							aria-expanded={settingsFulfillmentOpen}
							onclick={() => (settingsFulfillmentOpen = !settingsFulfillmentOpen)}
						>
							<span class="flex items-center gap-2">
								<IconTruck class="h-4 w-4" />
								Fulfillment Methods
							</span>
							<IconChevronDown
								class={`h-4 w-4 transition-transform ${settingsFulfillmentOpen ? 'rotate-180' : ''}`}
							/>
						</button>
						{#if settingsFulfillmentOpen}
							<div in:fly={{ y: 8, duration: 160 }} out:fade={{ duration: 100 }}>
								<section class="panel mt-2 rounded-2xl p-5">
									<div class="mb-3 flex items-center gap-2">
										<IconTruck class="h-4 w-4" />
										<h2 class="text-lg font-semibold">Fulfillment Methods</h2>
									</div>
									<p class="text-sm opacity-75">
										For shipping methods, define United States flat rates and optionally vary them
										by item count or cart value.
									</p>

									{#if (data.fulfillmentMethods?.length ?? 0) === 0}
										<p
											class="text-sm opacity-70"
											in:fade={{ duration: 140 }}
											out:fade={{ duration: 90 }}
										>
											No fulfillment methods configured yet.
										</p>
									{:else}
										<div class="space-y-2">
											{#each data.fulfillmentMethods as method (method.id)}
												<div
													class="rounded-xl border border-white/10 bg-black/15 p-3"
													in:fade={{ duration: 150 }}
													out:fade={{ duration: 90 }}
												>
													<form
														method="POST"
														action="?/saveFulfillment"
														class="grid gap-3 md:grid-cols-2"
													>
														<input type="hidden" name="method_id" value={method.id} />
														<div>
															<label class="label" for={`method-name-${method.id}`}>Name</label>
															<input
																id={`method-name-${method.id}`}
																name="name"
																class="input w-full"
																value={method.name}
																required
															/>
														</div>
														<div>
															<label class="label" for={`method-type-${method.id}`}>Type</label>
															<select
																id={`method-type-${method.id}`}
																name="method_type"
																class="select w-full"
															>
																<option value="pickup" selected={method.method_type === 'pickup'}
																	>Pickup</option
																>
																<option
																	value="delivery"
																	selected={method.method_type === 'delivery'}>Delivery</option
																>
																<option
																	value="shipping"
																	selected={method.method_type === 'shipping'}>Shipping</option
																>
															</select>
														</div>
														<div>
															<label class="label" for={`method-fee-${method.id}`}
																>Base Fee (USD)</label
															>
															<input
																id={`method-fee-${method.id}`}
																name="base_fee_dollars"
																type="number"
																min="0"
																step="0.01"
																class="input w-full"
																value={Number(method.base_fee_cents || 0) / 100}
															/>
														</div>
														<div>
															<label class="label" for={`method-speed-${method.id}`}
																>Shipping Speed Label</label
															>
															<input
																id={`method-speed-${method.id}`}
																name="shipping_speed_label"
																class="input w-full"
																value={method.shipping_speed_label || ''}
																placeholder="Standard (3-5 business days)"
															/>
														</div>
														<div>
															<label class="label" for={`method-rule-mode-${method.id}`}
																>Shipping Rule Mode</label
															>
															<select
																id={`method-rule-mode-${method.id}`}
																name="rate_rule_mode"
																class="select w-full"
															>
																<option value="flat" selected={method.rate_rule_mode === 'flat'}
																	>Flat Rate</option
																>
																<option
																	value="quantity"
																	selected={method.rate_rule_mode === 'quantity'}
																	>By Item Count</option
																>
																<option
																	value="subtotal"
																	selected={method.rate_rule_mode === 'subtotal'}
																	>By Cart Value</option
																>
															</select>
														</div>
														<div class="grid grid-cols-2 gap-2">
															<label class="flex items-center gap-2 text-sm">
																<input
																	type="checkbox"
																	name="requires_address"
																	value="1"
																	checked={method.requires_address === true}
																/>
																Requires address
															</label>
															<label class="flex items-center gap-2 text-sm">
																<input
																	type="checkbox"
																	name="is_active"
																	value="1"
																	checked={method.is_active === true}
																/>
																Active
															</label>
														</div>
														<div class="md:col-span-2">
															<label class="label" for={`method-desc-${method.id}`}
																>Description</label
															>
															<textarea
																id={`method-desc-${method.id}`}
																name="description"
																class="textarea w-full"
																rows="2">{method.description || ''}</textarea
															>
														</div>
														<div class="flex flex-wrap gap-2 md:col-span-2">
															<button class="btn btn-sm preset-outlined-primary-500" type="submit"
																>Save Method</button
															>
															<button
																class="btn btn-sm preset-outlined-primary-500"
																type="submit"
																formaction="?/toggleFulfillment"
																name="is_active"
																value={method.is_active ? '0' : '1'}
															>
																{method.is_active ? 'Disable' : 'Enable'}
															</button>
															<button
																class="btn btn-sm preset-filled-error-500"
																type="submit"
																formaction="?/deleteFulfillment"
															>
																Delete
															</button>
														</div>
													</form>

													{#if method.method_type === 'shipping'}
														<div
															class="mt-4 rounded-xl border border-white/10 bg-black/10 p-3"
															in:fade={{ duration: 140 }}
															out:fade={{ duration: 90 }}
														>
															<div class="text-sm font-semibold">Shipping Rules</div>
															{#if (method.shipping_rules?.length ?? 0) > 0}
																<div class="mt-2 space-y-2">
																	{#each method.shipping_rules as rule (rule.id)}
																		<div
																			class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm"
																		>
																			<div>
																				<div class="font-semibold">{metricValueLabel(rule)}</div>
																				<div class="text-xs opacity-65">
																					{rule.metric_type === 'subtotal'
																						? 'Cart value'
																						: 'Quantity'} · {formatCurrency(rule.rate_cents)}
																				</div>
																			</div>
																			<form method="POST" action="?/deleteShippingRule">
																				<input type="hidden" name="rule_id" value={rule.id} />
																				<button
																					class="btn btn-xs preset-filled-error-500"
																					type="submit">Delete</button
																				>
																			</form>
																		</div>
																	{/each}
																</div>
															{:else}
																<p class="mt-2 text-xs opacity-70">
																	No shipping rules yet. Base fee will be used.
																</p>
															{/if}
															<form
																method="POST"
																action="?/saveShippingRule"
																class="mt-3 grid gap-2 md:grid-cols-4"
															>
																<input
																	type="hidden"
																	name="fulfillment_method_id"
																	value={method.id}
																/>
																<input
																	type="hidden"
																	name="metric_type"
																	value={method.rate_rule_mode || 'quantity'}
																/>
																<div>
																	<label class="label" for={`rule-min-${method.id}`}>
																		{method.rate_rule_mode === 'subtotal'
																			? 'Min Order Value (USD)'
																			: 'Min Items'}
																	</label>
																	<input
																		id={`rule-min-${method.id}`}
																		name="min_value"
																		class="input w-full"
																		type="number"
																		min="0"
																		step={method.rate_rule_mode === 'subtotal' ? '0.01' : '1'}
																		required
																	/>
																</div>
																<div>
																	<label class="label" for={`rule-max-${method.id}`}>
																		{method.rate_rule_mode === 'subtotal'
																			? 'Max Order Value (USD)'
																			: 'Max Items'}
																	</label>
																	<input
																		id={`rule-max-${method.id}`}
																		name="max_value"
																		class="input w-full"
																		type="number"
																		min="0"
																		step={method.rate_rule_mode === 'subtotal' ? '0.01' : '1'}
																		placeholder="Leave blank for no max"
																	/>
																</div>
																<div>
																	<label class="label" for={`rule-rate-${method.id}`}
																		>Rate (USD)</label
																	>
																	<input
																		id={`rule-rate-${method.id}`}
																		name="rate_dollars"
																		class="input w-full"
																		type="number"
																		min="0"
																		step="0.01"
																		required
																	/>
																</div>
																<div>
																	<label class="label" for={`rule-order-${method.id}`}
																		>Sort Order</label
																	>
																	<input
																		id={`rule-order-${method.id}`}
																		name="sort_order"
																		class="input w-full"
																		type="number"
																		min="0"
																		step="1"
																		value="0"
																	/>
																</div>
																<div class="md:col-span-4">
																	<button class="btn btn-sm preset-filled-primary-500" type="submit"
																		>Add Shipping Rule</button
																	>
																</div>
															</form>
														</div>
													{/if}
												</div>
											{/each}
										</div>
									{/if}

									<form
										method="POST"
										action="?/createFulfillment"
										class="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/10 p-3 md:grid-cols-2"
									>
										<input type="hidden" name="store_id" value={data.store.id} />
										<div>
											<label class="label" for="fulfillment_name">Name</label>
											<input id="fulfillment_name" name="name" class="input w-full" required />
										</div>
										<div>
											<label class="label" for="fulfillment_type">Type</label>
											<select id="fulfillment_type" name="method_type" class="select w-full">
												<option value="pickup">Pickup</option>
												<option value="delivery">Delivery</option>
												<option value="shipping">Shipping</option>
											</select>
										</div>
										<div>
											<label class="label" for="fulfillment_fee">Base Fee (USD)</label>
											<input
												id="fulfillment_fee"
												name="base_fee_dollars"
												type="number"
												min="0"
												step="0.01"
												class="input w-full"
												value="0"
											/>
										</div>
										<div class="flex items-end">
											<label class="flex items-center gap-2 text-sm">
												<input type="checkbox" name="requires_address" value="1" />
												Requires shipping address
											</label>
										</div>
										<div>
											<label class="label" for="fulfillment_speed">Shipping Speed Label</label>
											<input
												id="fulfillment_speed"
												name="shipping_speed_label"
												class="input w-full"
												placeholder="Standard (3-5 business days)"
											/>
										</div>
										<div>
											<label class="label" for="fulfillment_rule_mode">Shipping Rule Mode</label>
											<select
												id="fulfillment_rule_mode"
												name="rate_rule_mode"
												class="select w-full"
											>
												<option value="flat">Flat Rate</option>
												<option value="quantity">By Item Count</option>
												<option value="subtotal">By Cart Value</option>
											</select>
										</div>
										<div class="md:col-span-2">
											<label class="label" for="fulfillment_desc">Description</label>
											<textarea
												id="fulfillment_desc"
												name="description"
												class="textarea w-full"
												rows="2"
											></textarea>
										</div>
										<div class="md:col-span-2">
											<button class="btn preset-filled-primary-500" type="submit"
												>Add Fulfillment Method</button
											>
										</div>
									</form>
								</section>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</Tabs.Content>

		<Tabs.Content value="catalog">
			{#if manageTab === 'catalog'}
				<div in:fly={{ y: 12, duration: 170 }} out:fade={{ duration: 110 }}>
					<section class="panel rounded-2xl p-5">
						<div class="mb-3 flex items-center gap-2">
							<IconPackage class="h-4 w-4" />
							<h2 class="text-lg font-semibold">Products & Variants</h2>
						</div>

						<form
							method="POST"
							action="?/saveProduct"
							enctype="multipart/form-data"
							class="rounded-xl border border-white/10 bg-black/12 p-4"
						>
							<input type="hidden" name="store_id" value={data.store.id} />
							<div class="grid gap-3 md:grid-cols-2">
								<div>
									<label class="label" for="new_product_name">New Product Name</label>
									<input id="new_product_name" name="name" class="input w-full" required />
								</div>
								<div>
									<label class="label" for="new_product_image">Product Image</label>
									<input
										id="new_product_image"
										name="image_file"
										type="file"
										accept="image/jpeg,image/png,image/webp,image/gif"
										class="input w-full"
									/>
								</div>
								<div>
									<label class="label" for="new_product_partner">Default Partner</label>
									<select id="new_product_partner" name="default_partner" class="select w-full">
										<option value="manual">Manual / Internal</option>
										<option value="printful">Printful</option>
									</select>
								</div>
								<div>
									<label class="label" for="new_product_status">Status</label>
									<select id="new_product_status" name="status" class="select w-full">
										<option value="active">Active</option>
										<option value="draft">Draft</option>
										<option value="archived">Archived</option>
									</select>
								</div>
								<div class="md:col-span-2">
									<label class="label" for="new_product_desc">Description</label>
									<textarea
										id="new_product_desc"
										name="description"
										class="textarea w-full"
										rows="2"
									></textarea>
								</div>
								<div class="md:col-span-2">
									<button class="btn preset-filled-primary-500" type="submit">Create Product</button
									>
								</div>
							</div>
						</form>

						{#if (data.products?.length ?? 0) === 0}
							<p
								class="mt-4 text-sm opacity-75"
								in:fade={{ duration: 150 }}
								out:fade={{ duration: 100 }}
							>
								No products created yet.
							</p>
						{:else}
							<div class="mt-4 rounded-xl border border-white/10 bg-black/12 p-3">
								<div class="grid gap-3 md:grid-cols-4">
									<label class="md:col-span-2">
										<span class="label">Search by Name</span>
										<div class="relative">
											<IconSearch
												class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-60"
											/>
											<input
												class="input w-full pl-9"
												placeholder="Search products..."
												bind:value={productQuery}
											/>
										</div>
									</label>
									<label>
										<span class="label">Source</span>
										<select class="select w-full" bind:value={productSourceFilter}>
											<option value="all">All sources</option>
											<option value="local">Local</option>
											<option value="printful">Printful</option>
										</select>
									</label>
									<label>
										<span class="label">Status</span>
										<select class="select w-full" bind:value={productStatusFilter}>
											<option value="all">All statuses</option>
											<option value="active">Active</option>
											<option value="draft">Draft</option>
											<option value="archived">Archived</option>
										</select>
									</label>
									<label class="md:col-span-2">
										<span class="label">Item Type</span>
										<select class="select w-full" bind:value={productTypeFilter}>
											<option value="all">All item types</option>
											{#each productTypeOptions as option (option)}
												<option value={option}>{option}</option>
											{/each}
										</select>
									</label>
									<div class="flex items-end justify-end text-xs opacity-70 md:col-span-2">
										{filteredProducts.length} of {data.products.length} products
									</div>
								</div>
							</div>

							{#if filteredProducts.length === 0}
								<p
									class="mt-4 text-sm opacity-75"
									in:fade={{ duration: 140 }}
									out:fade={{ duration: 90 }}
								>
									No products match the current filters.
								</p>
							{:else}
								<div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
									{#each filteredProducts as product (product.id)}
										<article
											class="product-card overflow-hidden rounded-2xl"
											in:scale={{ duration: 160, start: 0.96 }}
											out:fade={{ duration: 100 }}
										>
											<div class="product-card-media">
												{#if productPreviewImage(product)}
													<img
														src={productPreviewImage(product)}
														alt={product.name}
														class="h-full w-full object-cover"
													/>
												{:else}
													<div class="grid h-full w-full place-items-center opacity-70">
														<IconPackage class="h-6 w-6" />
													</div>
												{/if}
											</div>
											<div class="p-3">
												<h3 class="truncate text-sm font-semibold">{product.name}</h3>
												<div class="mt-2 flex flex-wrap gap-1 text-[11px]">
													<span class="chip preset-tonal-surface">
														{product.source_of_truth === 'printful' ? 'Printful' : 'Local'}
													</span>
													<span class="chip preset-tonal-surface"
														>{getProductItemType(product)}</span
													>
													<span class="chip preset-tonal-surface"
														>{product.variants?.length ?? 0} variants</span
													>
													<span class="chip preset-tonal-surface">{product.status || 'active'}</span
													>
												</div>
												<div class="mt-3 flex items-center justify-between gap-2">
													<button
														type="button"
														class="btn btn-sm preset-outlined-primary-500"
														onclick={() => openProductModal(product.id)}
													>
														<IconPencil class="mr-1 h-3.5 w-3.5" />
														Edit
													</button>
													<form method="POST" action="?/deleteProduct">
														<input type="hidden" name="product_id" value={product.id} />
														<button class="btn btn-sm preset-filled-error-500" type="submit">
															Delete
														</button>
													</form>
												</div>
											</div>
										</article>
									{/each}
								</div>
							{/if}
						{/if}
					</section>

					{#if productModalOpen && selectedProduct}
						<div
							class="manage-modal-backdrop"
							role="button"
							tabindex="0"
							aria-label="Close product editor"
							onclick={closeProductModal}
							onkeydown={(event) => event.key === 'Escape' && closeProductModal()}
							in:fade={{ duration: 140 }}
							out:fade={{ duration: 110 }}
						>
							<div
								class="manage-modal-panel"
								role="dialog"
								aria-modal="true"
								aria-label={`Edit ${selectedProduct.name}`}
								tabindex="-1"
								onclick={(event) => event.stopPropagation()}
								onkeydown={(event) => event.stopPropagation()}
								in:scale={{ duration: 170, start: 0.97 }}
								out:fade={{ duration: 100 }}
							>
								<div class="flex items-center justify-between gap-3">
									<div>
										<div class="text-xs tracking-[0.2em] uppercase opacity-65">Product Editor</div>
										<h3 class="text-lg font-semibold">{selectedProduct.name}</h3>
									</div>
									<button
										type="button"
										class="btn btn-sm preset-tonal-surface"
										onclick={closeProductModal}
									>
										<IconX class="h-4 w-4" />
									</button>
								</div>

								<div class="mt-3 space-y-4">
									<form
										method="POST"
										action="?/saveProduct"
										enctype="multipart/form-data"
										class="grid gap-3 md:grid-cols-2"
									>
										<input type="hidden" name="store_id" value={data.store.id} />
										<input type="hidden" name="product_id" value={selectedProduct.id} />
										<div>
											<label class="label" for={`modal-product-name-${selectedProduct.id}`}
												>Name</label
											>
											<input
												id={`modal-product-name-${selectedProduct.id}`}
												name="name"
												class="input w-full"
												value={selectedProduct.name}
												required
											/>
										</div>
										<div>
											<label class="label" for={`modal-product-image-${selectedProduct.id}`}
												>Replace Image</label
											>
											<input
												id={`modal-product-image-${selectedProduct.id}`}
												name="image_file"
												type="file"
												accept="image/jpeg,image/png,image/webp,image/gif"
												class="input w-full"
											/>
										</div>
										<div>
											<label class="label" for={`modal-product-status-${selectedProduct.id}`}
												>Status</label
											>
											<select
												id={`modal-product-status-${selectedProduct.id}`}
												name="status"
												class="select w-full"
											>
												<option value="active" selected={selectedProduct.status === 'active'}
													>Active</option
												>
												<option value="draft" selected={selectedProduct.status === 'draft'}
													>Draft</option
												>
												<option value="archived" selected={selectedProduct.status === 'archived'}
													>Archived</option
												>
											</select>
										</div>
										<div>
											<label class="label" for={`modal-product-partner-${selectedProduct.id}`}
												>Default Partner</label
											>
											<select
												id={`modal-product-partner-${selectedProduct.id}`}
												name="default_partner"
												class="select w-full"
											>
												<option
													value="manual"
													selected={selectedProduct.default_partner !== 'printful'}
												>
													Manual / Internal
												</option>
												<option
													value="printful"
													selected={selectedProduct.default_partner === 'printful'}
												>
													Printful
												</option>
											</select>
										</div>
										<div class="md:col-span-2">
											<div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
												<span class="chip preset-tonal-surface">
													Source: {selectedProduct.source_of_truth === 'printful'
														? 'Printful'
														: 'Local'}
												</span>
												<span class="chip preset-tonal-surface">
													<IconTag class="mr-1 inline h-3 w-3" />
													{getProductItemType(selectedProduct)}
												</span>
												{#if selectedProduct.external_product_id}
													<span class="chip preset-tonal-primary">
														Printful Product {selectedProduct.external_product_id}
													</span>
												{/if}
											</div>
											<label class="label" for={`modal-product-desc-${selectedProduct.id}`}
												>Description</label
											>
											<textarea
												id={`modal-product-desc-${selectedProduct.id}`}
												name="description"
												class="textarea w-full"
												rows="3">{selectedProduct.description || ''}</textarea
											>
										</div>
										<div class="md:col-span-2">
											{#if productPreviewImage(selectedProduct)}
												<div
													class="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/10 p-2 text-xs"
												>
													<img
														src={productPreviewImage(selectedProduct)}
														alt={selectedProduct.name}
														class="h-12 w-12 rounded object-cover"
													/>
													<a
														href={productPreviewImage(selectedProduct)}
														target="_blank"
														rel="noopener noreferrer"
														class="opacity-80 hover:opacity-100"
													>
														Current image
													</a>
													<label class="ml-auto flex items-center gap-1.5">
														<input type="checkbox" name="clear_image" value="1" />
														Clear image
													</label>
												</div>
											{/if}
											<div class="flex flex-wrap gap-2">
												<button class="btn btn-sm preset-outlined-primary-500" type="submit"
													>Save Product</button
												>
												<button
													class="btn btn-sm preset-filled-error-500"
													type="submit"
													formaction="?/deleteProduct"
													formnovalidate
												>
													Delete Product
												</button>
											</div>
										</div>
									</form>

									<div class="rounded-xl border border-white/10 bg-black/15 p-3">
										<h4 class="text-sm font-semibold uppercase opacity-80">Variants</h4>
										{#if (selectedProduct.variants?.length ?? 0) === 0}
											<p class="mt-2 text-xs opacity-75">No variants yet.</p>
										{:else}
											<div class="mt-2 space-y-2">
												{#each selectedProduct.variants as variant (variant.id)}
													<div class="rounded-lg border border-white/10 bg-black/10 p-3">
														<form
															method="POST"
															action="?/saveVariant"
															class="grid gap-2 md:grid-cols-4"
														>
															<input type="hidden" name="product_id" value={selectedProduct.id} />
															<input type="hidden" name="variant_id" value={variant.id} />
															<div class="md:col-span-2">
																<label class="label" for={`modal-variant-name-${variant.id}`}
																	>Name</label
																>
																<input
																	id={`modal-variant-name-${variant.id}`}
																	class="input w-full"
																	name="name"
																	value={variant.name}
																	required
																/>
															</div>
															<div>
																<label class="label" for={`modal-variant-price-${variant.id}`}
																	>Price (USD)</label
																>
																<input
																	id={`modal-variant-price-${variant.id}`}
																	class="input w-full"
																	name="price_dollars"
																	type="number"
																	min="0.5"
																	step="0.01"
																	value={Number(variant.price_cents || 0) / 100}
																	required
																/>
															</div>
															<div>
																<label class="label" for={`modal-variant-sku-${variant.id}`}
																	>SKU</label
																>
																<input
																	id={`modal-variant-sku-${variant.id}`}
																	class="input w-full"
																	name="sku"
																	value={variant.sku || ''}
																/>
															</div>
															<div>
																<label class="label" for={`modal-variant-size-${variant.id}`}
																	>Size</label
																>
																<input
																	id={`modal-variant-size-${variant.id}`}
																	class="input w-full"
																	name="size"
																	value={variant.option_values?.size || ''}
																/>
															</div>
															<div>
																<label class="label" for={`modal-variant-color-${variant.id}`}
																	>Color</label
																>
																<input
																	id={`modal-variant-color-${variant.id}`}
																	class="input w-full"
																	name="color"
																	value={variant.option_values?.color || ''}
																/>
															</div>
															<div>
																<label class="label" for={`modal-variant-provider-${variant.id}`}
																	>Provider</label
																>
																<select
																	id={`modal-variant-provider-${variant.id}`}
																	name="partner_provider"
																	class="select w-full"
																>
																	<option
																		value="manual"
																		selected={variant.partner_provider !== 'printful'}
																	>
																		Manual
																	</option>
																	<option
																		value="printful"
																		selected={variant.partner_provider === 'printful'}
																	>
																		Printful
																	</option>
																</select>
															</div>
															<div>
																<label class="label" for={`modal-variant-ref-${variant.id}`}
																	>Printful Item Ref</label
																>
																<input
																	id={`modal-variant-ref-${variant.id}`}
																	class="input w-full"
																	name="partner_variant_ref"
																	value={variant.partner_variant_ref || ''}
																/>
															</div>
															<div class="flex flex-wrap items-center gap-2 md:col-span-4">
																<select class="select w-auto" name="is_active">
																	<option value="1" selected={variant.is_active === true}
																		>Active</option
																	>
																	<option value="0" selected={variant.is_active !== true}
																		>Inactive</option
																	>
																</select>
																<button class="btn btn-xs preset-outlined-primary-500" type="submit"
																	>Save Variant</button
																>
															</div>
														</form>
														<form method="POST" action="?/deleteVariant" class="mt-2 inline-block">
															<input type="hidden" name="variant_id" value={variant.id} />
															<button class="btn btn-xs preset-filled-error-500" type="submit"
																>Delete Variant</button
															>
														</form>
													</div>
												{/each}
											</div>
										{/if}

										<form
											method="POST"
											action="?/saveVariant"
											class="mt-3 grid gap-2 border-t border-white/10 pt-3 md:grid-cols-4"
										>
											<input type="hidden" name="product_id" value={selectedProduct.id} />
											<div class="md:col-span-2">
												<label class="label" for={`modal-new-variant-name-${selectedProduct.id}`}
													>New Variant Name</label
												>
												<input
													id={`modal-new-variant-name-${selectedProduct.id}`}
													class="input w-full"
													name="name"
													required
												/>
											</div>
											<div>
												<label class="label" for={`modal-new-variant-price-${selectedProduct.id}`}
													>Price (USD)</label
												>
												<input
													id={`modal-new-variant-price-${selectedProduct.id}`}
													class="input w-full"
													name="price_dollars"
													type="number"
													min="0.5"
													step="0.01"
													required
												/>
											</div>
											<div>
												<label class="label" for={`modal-new-variant-sku-${selectedProduct.id}`}
													>SKU</label
												>
												<input
													id={`modal-new-variant-sku-${selectedProduct.id}`}
													class="input w-full"
													name="sku"
												/>
											</div>
											<div>
												<label class="label" for={`modal-new-variant-size-${selectedProduct.id}`}
													>Size</label
												>
												<input
													id={`modal-new-variant-size-${selectedProduct.id}`}
													class="input w-full"
													name="size"
												/>
											</div>
											<div>
												<label class="label" for={`modal-new-variant-color-${selectedProduct.id}`}
													>Color</label
												>
												<input
													id={`modal-new-variant-color-${selectedProduct.id}`}
													class="input w-full"
													name="color"
												/>
											</div>
											<div>
												<label
													class="label"
													for={`modal-new-variant-provider-${selectedProduct.id}`}>Provider</label
												>
												<select
													id={`modal-new-variant-provider-${selectedProduct.id}`}
													name="partner_provider"
													class="select w-full"
												>
													<option value="manual">Manual</option>
													<option value="printful">Printful</option>
												</select>
											</div>
											<div>
												<label class="label" for={`modal-new-variant-ref-${selectedProduct.id}`}
													>Printful Item Ref</label
												>
												<input
													id={`modal-new-variant-ref-${selectedProduct.id}`}
													class="input w-full"
													name="partner_variant_ref"
												/>
												<p class="mt-1 text-xs opacity-60">
													For Printful v2, enter `productId:variantId` or JSON with optional
													placements.
												</p>
											</div>
											<div class="md:col-span-4">
												<button class="btn btn-sm preset-filled-primary-500" type="submit"
													>Add Variant</button
												>
											</div>
										</form>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="orders">
			{#if manageTab === 'orders'}
				<div in:fly={{ y: 12, duration: 170 }} out:fade={{ duration: 110 }}>
					<section class="panel rounded-2xl p-5">
						<div class="mb-3 flex items-center gap-2">
							<IconReceiptText class="h-4 w-4" />
							<h2 class="text-lg font-semibold">Recent Orders</h2>
						</div>

						{#if (data.orders?.length ?? 0) === 0}
							<p class="text-sm opacity-70" in:fade={{ duration: 140 }} out:fade={{ duration: 90 }}>
								No orders yet.
							</p>
						{:else}
							<div class="space-y-3">
								{#each data.orders as order (order.id)}
									<article
										class="rounded-xl border border-white/10 bg-black/12 p-3"
										in:fade={{ duration: 150 }}
										out:fade={{ duration: 90 }}
									>
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div>
												<h3 class="font-semibold">{order.order_number}</h3>
												<p class="text-xs opacity-70">
													{formatDate(order.created_at)} · {order.customer_email}
												</p>
												<p class="mt-1 text-xs opacity-70">
													{order.status} · {order.payment_status} · {order.fulfillment_status}
												</p>
											</div>
											<div class="text-right">
												<div class="font-bold">{formatCurrency(order.total_cents)}</div>
												{#if order.paid_at}
													<p class="text-xs opacity-70">Paid {formatDate(order.paid_at)}</p>
												{/if}
											</div>
										</div>
										<ul class="mt-2 space-y-1 text-xs opacity-80">
											{#each getOrderItems(order.id) as item (item.id)}
												<li>{item.quantity} × {item.product_name} — {item.variant_name}</li>
											{/each}
										</ul>
										<div class="mt-3 flex flex-wrap gap-2">
											<form method="POST" action="?/markFulfilled" class="flex items-center gap-2">
												<input type="hidden" name="order_id" value={order.id} />
												<button class="btn btn-xs preset-outlined-primary-500" type="submit"
													>Mark Fulfilled</button
												>
											</form>
											<form
												method="POST"
												action="?/refundOrder"
												class="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5"
											>
												<input type="hidden" name="order_id" value={order.id} />
												<input
													name="amount_dollars"
													type="number"
													step="0.01"
													min="0.5"
													max={Number(order.total_cents || 0) / 100}
													placeholder="Amount"
													class="input h-8 w-24"
												/>
												<select class="select h-8 w-44" name="reason">
													<option value="">Reason (optional)</option>
													<option value="requested_by_customer">Requested by customer</option>
													<option value="duplicate">Duplicate</option>
													<option value="fraudulent">Fraudulent</option>
												</select>
												<button class="btn btn-xs preset-filled-warning-500" type="submit"
													>Refund</button
												>
											</form>
										</div>
									</article>
								{/each}
							</div>
						{/if}
					</section>
				</div>
			{/if}
		</Tabs.Content>
	</Tabs>
</div>

<style>
	.manage-hero {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}
	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(72px);
		pointer-events: none;
	}
	.hero-orb-1 {
		width: 55%;
		height: 200%;
		top: -50%;
		left: -10%;
		background: color-mix(in oklab, var(--color-primary-500) 22%, transparent);
		animation: orb-drift 18s ease-in-out infinite alternate;
	}
	.hero-orb-2 {
		width: 40%;
		height: 160%;
		top: -38%;
		right: -8%;
		background: color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation: orb-drift 24s ease-in-out infinite alternate-reverse;
	}
	.hero-orb-3 {
		width: 45%;
		height: 150%;
		bottom: -72%;
		left: 24%;
		background: color-mix(in oklab, var(--color-tertiary-500) 15%, transparent);
		animation: orb-drift 20s ease-in-out infinite alternate;
	}
	@keyframes orb-drift {
		0% {
			transform: translate3d(0, 0, 0) scale(1);
		}
		100% {
			transform: translate3d(2.5%, -2.5%, 0) scale(1.08);
		}
	}
	.hero-pill {
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}
	.settings-accordion {
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		background: color-mix(in oklab, var(--color-surface-950) 45%, transparent);
	}
	.settings-accordion-trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.9rem 1rem;
		font-weight: 700;
		border-radius: 0.9rem;
	}
	.settings-accordion-trigger:hover {
		background: color-mix(in oklab, var(--color-surface-800) 62%, transparent);
	}
	.manage-tabs-rail {
		display: flex;
		align-items: center;
	}
	.manage-tabs-rail :global([role='tablist']) {
		display: flex;
		gap: 0.35rem;
		padding: 0.35rem;
		border-radius: 0.9rem;
		background: color-mix(in oklab, var(--color-surface-950) 55%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
		width: fit-content;
		max-width: 100%;
		overflow-x: auto;
	}
	.manage-tabs-rail :global([role='tab']) {
		border: 1px solid transparent;
		border-radius: 0.65rem;
		padding: 0.45rem 0.9rem;
		font-size: 0.92rem;
		font-weight: 700;
		line-height: 1;
		color: color-mix(in oklab, white 84%, var(--color-surface-300) 16%);
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			color 140ms ease,
			box-shadow 140ms ease;
	}
	.manage-tabs-rail :global([role='tab']:hover) {
		background: color-mix(in oklab, var(--color-surface-800) 68%, transparent);
		border-color: color-mix(in oklab, var(--color-surface-500) 22%, transparent);
	}
	.manage-tabs-rail :global([role='tab'][data-state='active']),
	.manage-tabs-rail :global([role='tab'][aria-selected='true']) {
		background: color-mix(in oklab, var(--color-primary-500) 20%, var(--color-surface-900) 80%);
		border-color: color-mix(in oklab, var(--color-primary-500) 42%, transparent);
		color: white;
		box-shadow: 0 8px 20px -14px color-mix(in oklab, var(--color-primary-500) 75%, transparent);
	}
	.manage-tabs-rail :global([role='tab']:focus-visible) {
		outline: 2px solid color-mix(in oklab, var(--color-primary-500) 80%, white 20%);
		outline-offset: 1px;
	}
	.panel {
		background: linear-gradient(
			140deg,
			color-mix(in oklab, var(--color-surface-900) 94%, var(--color-primary-500) 6%),
			color-mix(in oklab, var(--color-surface-900) 90%, var(--color-secondary-500) 10%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}
	.product-card {
		background: linear-gradient(
			150deg,
			color-mix(in oklab, var(--color-surface-900) 94%, var(--color-primary-500) 6%),
			color-mix(in oklab, var(--color-surface-900) 90%, var(--color-tertiary-500) 10%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 22%, transparent);
		transition:
			transform 160ms ease,
			box-shadow 160ms ease;
	}
	.product-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 16px 28px -20px color-mix(in oklab, var(--color-primary-500) 55%, transparent);
	}
	.product-card-media {
		aspect-ratio: 1 / 1;
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}
	.manage-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 70;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(8, 9, 12, 0.82);
		backdrop-filter: blur(6px);
	}
	.manage-modal-panel {
		width: min(100%, 76rem);
		max-height: 94vh;
		overflow: auto;
		border-radius: 1rem;
		padding: 1rem;
		background: linear-gradient(
			140deg,
			color-mix(in oklab, var(--color-surface-900) 95%, var(--color-primary-500) 5%),
			color-mix(in oklab, var(--color-surface-900) 92%, var(--color-secondary-500) 8%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 24%, transparent);
	}
</style>
