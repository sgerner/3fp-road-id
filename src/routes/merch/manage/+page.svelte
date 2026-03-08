<script>
	import IconSettings from '@lucide/svelte/icons/settings';
	import IconPackage from '@lucide/svelte/icons/package';
	import IconTruck from '@lucide/svelte/icons/truck';
	import IconReceiptText from '@lucide/svelte/icons/receipt-text';
	import IconCircleCheck from '@lucide/svelte/icons/circle-check';
	import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
	import IconStore from '@lucide/svelte/icons/store';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';

	let { data, form } = $props();

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
</script>

<svelte:head>
	<title>Merch Manager • 3 Feet Please</title>
</svelte:head>

<div class="mx-auto w-full max-w-7xl space-y-6 pb-12">
	<section class="manage-hero relative overflow-hidden rounded-3xl p-6 md:p-8">
		<div class="manage-orb orb-a" aria-hidden="true"></div>
		<div class="manage-orb orb-b" aria-hidden="true"></div>
		<div class="relative z-10 flex flex-wrap items-start justify-between gap-4">
			<div>
				<a href="/merch" class="text-sm opacity-80 hover:opacity-100">
					<IconArrowLeft class="mr-1 inline h-4 w-4" />
					Back to Storefront
				</a>
				<div class="mt-2 flex items-center gap-2 text-xs tracking-[0.2em] uppercase opacity-65">
					<IconStore class="h-4 w-4" />
					Merch Administration
				</div>
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
		<div class="rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm">
			<div class="flex items-center gap-2">
				<IconCircleCheck class="h-4 w-4" />
				{updateMessages[data.updated]}
			</div>
		</div>
	{/if}
	{#if form?.error}
		<div class="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm">
			<div class="flex items-center gap-2">
				<IconCircleAlert class="h-4 w-4" />
				{form.error}
			</div>
		</div>
	{/if}
	{#if data.printfulStatus === 'connected'}
		<div class="rounded-xl border border-green-500/35 bg-green-500/10 px-4 py-3 text-sm">
			<div class="flex items-center gap-2">
				<IconCircleCheck class="h-4 w-4" />
				Printful connected successfully.
			</div>
		</div>
	{:else if data.printfulStatus === 'disconnected'}
		<div class="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm">
			<div class="flex items-center gap-2">
				<IconCircleAlert class="h-4 w-4" />
				Printful disconnected.
			</div>
		</div>
	{:else if data.printfulStatus === 'error'}
		<div class="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm">
			<div class="flex items-center gap-2">
				<IconCircleAlert class="h-4 w-4" />
				Printful connection failed{data.printfulReason ? `: ${data.printfulReason}` : '.'}
			</div>
		</div>
	{/if}

	<div class="grid gap-5 xl:grid-cols-2">
		<section class="panel rounded-2xl p-5">
			<div class="mb-3 flex items-center gap-2">
				<IconStore class="h-4 w-4" />
				<h2 class="text-lg font-semibold">Printful</h2>
			</div>
			<p class="text-sm opacity-75">
				Authorize Printful with OAuth, choose the connected Printful store to mirror into 3FP, and
				keep imported products synced from Printful as the source of truth.
			</p>
			<hr class="my-4" />
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-[16rem] flex-1 text-sm">
					<div class="font-semibold">
						{data.printfulAccount?.connected_at ? 'Printful connected' : 'Printful not connected'}
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
						{data.printfulAccount?.connected_at ? 'Reconnect Printful' : 'Connect Printful'}
					</a>
					{#if data.printfulAccount?.connected_at}
						<form method="POST" action="?/disconnectPrintful">
							<button class="btn preset-outlined-error-500 btn-sm" type="submit">Disconnect</button>
						</form>
					{/if}
				</div>
			</div>
			{#if data.printfulAccount?.connected_at}
				<form method="POST" action="?/savePrintfulSettings" class="mt-4 grid gap-3 md:grid-cols-2">
					<div class="md:col-span-2">
						<label class="label" for="printful_store_id">Connected Printful Store</label>
						<select id="printful_store_id" name="printful_store_id" class="select w-full" required>
							<option value="" disabled selected={!data.store?.printful_store_id}
								>Choose a Printful store</option
							>
							{#each data.printfulStores ?? [] as storeChoice (storeChoice.id)}
								<option
									value={storeChoice.id}
									selected={Number(data.store?.printful_store_id || 0) === Number(storeChoice.id)}
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
						<button class="btn preset-filled-primary-500" type="submit">Save Printful Store</button>
						<button
							class="btn preset-outlined-primary-500"
							type="submit"
							formaction="?/syncPrintfulCatalog"
						>
							Import / Sync Catalog
						</button>
					</div>
				</form>
			{/if}
		</section>

		<section class="panel rounded-2xl p-5">
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
				<button class="btn preset-filled-primary-500" type="submit">Save Tax Settings</button>
			</form>
		</section>

		<section class="panel rounded-2xl p-5">
			<div class="mb-3 flex items-center gap-2">
				<IconTruck class="h-4 w-4" />
				<h2 class="text-lg font-semibold">Fulfillment Methods</h2>
			</div>
			<p class="text-sm opacity-75">
				For shipping methods, define United States flat rates and optionally vary them by item count
				or cart value.
			</p>

			{#if (data.fulfillmentMethods?.length ?? 0) === 0}
				<p class="text-sm opacity-70">No fulfillment methods configured yet.</p>
			{:else}
				<div class="space-y-2">
					{#each data.fulfillmentMethods as method (method.id)}
						<div class="rounded-xl border border-white/10 bg-black/15 p-3">
							<form method="POST" action="?/saveFulfillment" class="grid gap-3 md:grid-cols-2">
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
									<select id={`method-type-${method.id}`} name="method_type" class="select w-full">
										<option value="pickup" selected={method.method_type === 'pickup'}>Pickup</option
										>
										<option value="delivery" selected={method.method_type === 'delivery'}
											>Delivery</option
										>
										<option value="shipping" selected={method.method_type === 'shipping'}
											>Shipping</option
										>
									</select>
								</div>
								<div>
									<label class="label" for={`method-fee-${method.id}`}>Base Fee (USD)</label>
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
									<label class="label" for={`method-speed-${method.id}`}>Shipping Speed Label</label
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
										<option value="quantity" selected={method.rate_rule_mode === 'quantity'}
											>By Item Count</option
										>
										<option value="subtotal" selected={method.rate_rule_mode === 'subtotal'}
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
									<label class="label" for={`method-desc-${method.id}`}>Description</label>
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
								<div class="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
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
															{rule.metric_type === 'subtotal' ? 'Cart value' : 'Quantity'} · {formatCurrency(
																rule.rate_cents
															)}
														</div>
													</div>
													<form method="POST" action="?/deleteShippingRule">
														<input type="hidden" name="rule_id" value={rule.id} />
														<button class="btn btn-xs preset-filled-error-500" type="submit"
															>Delete</button
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
										<input type="hidden" name="fulfillment_method_id" value={method.id} />
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
											<label class="label" for={`rule-rate-${method.id}`}>Rate (USD)</label>
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
											<label class="label" for={`rule-order-${method.id}`}>Sort Order</label>
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
					<select id="fulfillment_rule_mode" name="rate_rule_mode" class="select w-full">
						<option value="flat">Flat Rate</option>
						<option value="quantity">By Item Count</option>
						<option value="subtotal">By Cart Value</option>
					</select>
				</div>
				<div class="md:col-span-2">
					<label class="label" for="fulfillment_desc">Description</label>
					<textarea id="fulfillment_desc" name="description" class="textarea w-full" rows="2"
					></textarea>
				</div>
				<div class="md:col-span-2">
					<button class="btn preset-filled-primary-500" type="submit">Add Fulfillment Method</button
					>
				</div>
			</form>
		</section>
	</div>

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
					<textarea id="new_product_desc" name="description" class="textarea w-full" rows="2"
					></textarea>
				</div>
				<div class="md:col-span-2">
					<button class="btn preset-filled-primary-500" type="submit">Create Product</button>
				</div>
			</div>
		</form>

		{#if (data.products?.length ?? 0) === 0}
			<p class="mt-4 text-sm opacity-75">No products created yet.</p>
		{:else}
			<div class="mt-4 space-y-4">
				{#each data.products as product (product.id)}
					<article class="rounded-2xl border border-white/10 bg-black/10 p-4">
						<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem]">
							<form
								method="POST"
								action="?/saveProduct"
								enctype="multipart/form-data"
								class="grid gap-3 md:grid-cols-2"
							>
								<input type="hidden" name="store_id" value={data.store.id} />
								<input type="hidden" name="product_id" value={product.id} />
								<div>
									<label class="label" for={`product-name-${product.id}`}>Name</label>
									<input
										id={`product-name-${product.id}`}
										name="name"
										class="input w-full"
										value={product.name}
										required
									/>
								</div>
								<div>
									<label class="label" for={`product-image-${product.id}`}>Replace Image</label>
									<input
										id={`product-image-${product.id}`}
										name="image_file"
										type="file"
										accept="image/jpeg,image/png,image/webp,image/gif"
										class="input w-full"
									/>
								</div>
								<div>
									<label class="label" for={`product-status-${product.id}`}>Status</label>
									<select id={`product-status-${product.id}`} name="status" class="select w-full">
										<option value="active" selected={product.status === 'active'}>Active</option>
										<option value="draft" selected={product.status === 'draft'}>Draft</option>
										<option value="archived" selected={product.status === 'archived'}
											>Archived</option
										>
									</select>
								</div>
								<div>
									<label class="label" for={`product-partner-${product.id}`}>Default Partner</label>
									<select
										id={`product-partner-${product.id}`}
										name="default_partner"
										class="select w-full"
									>
										<option value="manual" selected={product.default_partner !== 'printful'}
											>Manual / Internal</option
										>
										<option value="printful" selected={product.default_partner === 'printful'}
											>Printful</option
										>
									</select>
								</div>
								<div class="md:col-span-2">
									<div class="mb-2 flex flex-wrap gap-2 text-xs">
										<span class="chip preset-tonal-surface">
											Source: {product.source_of_truth === 'printful' ? 'Printful' : 'Local'}
										</span>
										{#if product.external_product_id}
											<span class="chip preset-tonal-primary">
												Printful Product {product.external_product_id}
											</span>
										{/if}
									</div>
									<label class="label" for={`product-desc-${product.id}`}>Description</label>
									<textarea
										id={`product-desc-${product.id}`}
										name="description"
										class="textarea w-full"
										rows="2">{product.description || ''}</textarea
									>
								</div>
								<div class="md:col-span-2">
									{#if product.image_url}
										<div
											class="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/10 p-2 text-xs"
										>
											<img
												src={product.image_url}
												alt={product.name}
												class="h-12 w-12 rounded object-cover"
											/>
											<a
												href={product.image_url}
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
									<button class="btn btn-sm preset-outlined-primary-500" type="submit"
										>Save Product</button
									>
								</div>
							</form>
							<form method="POST" action="?/deleteProduct" class="flex items-start justify-end">
								<input type="hidden" name="product_id" value={product.id} />
								<button class="btn btn-sm preset-filled-error-500" type="submit"
									>Delete Product</button
								>
							</form>
						</div>

						<div class="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
							<h3 class="text-sm font-semibold uppercase opacity-80">Variants</h3>
							{#if (product.variants?.length ?? 0) === 0}
								<p class="mt-2 text-xs opacity-75">No variants yet.</p>
							{:else}
								<div class="mt-2 space-y-2">
									{#each product.variants as variant (variant.id)}
										<div class="rounded-lg border border-white/10 bg-black/10 p-3">
											<form method="POST" action="?/saveVariant" class="grid gap-2 md:grid-cols-4">
												<input type="hidden" name="product_id" value={product.id} />
												<input type="hidden" name="variant_id" value={variant.id} />
												<div class="md:col-span-2">
													<label class="label" for={`variant-name-${variant.id}`}>Name</label>
													<input
														id={`variant-name-${variant.id}`}
														class="input w-full"
														name="name"
														value={variant.name}
														required
													/>
												</div>
												<div>
													<label class="label" for={`variant-price-${variant.id}`}
														>Price (USD)</label
													>
													<input
														id={`variant-price-${variant.id}`}
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
													<label class="label" for={`variant-sku-${variant.id}`}>SKU</label>
													<input
														id={`variant-sku-${variant.id}`}
														class="input w-full"
														name="sku"
														value={variant.sku || ''}
													/>
												</div>
												<div>
													<label class="label" for={`variant-size-${variant.id}`}>Size</label>
													<input
														id={`variant-size-${variant.id}`}
														class="input w-full"
														name="size"
														value={variant.option_values?.size || ''}
													/>
												</div>
												<div>
													<label class="label" for={`variant-color-${variant.id}`}>Color</label>
													<input
														id={`variant-color-${variant.id}`}
														class="input w-full"
														name="color"
														value={variant.option_values?.color || ''}
													/>
												</div>
												<div>
													<label class="label" for={`variant-provider-${variant.id}`}
														>Provider</label
													>
													<select
														id={`variant-provider-${variant.id}`}
														name="partner_provider"
														class="select w-full"
													>
														<option
															value="manual"
															selected={variant.partner_provider !== 'printful'}>Manual</option
														>
														<option
															value="printful"
															selected={variant.partner_provider === 'printful'}>Printful</option
														>
													</select>
												</div>
												<div>
													<label class="label" for={`variant-ref-${variant.id}`}
														>Printful Item Ref</label
													>
													<input
														id={`variant-ref-${variant.id}`}
														class="input w-full"
														name="partner_variant_ref"
														value={variant.partner_variant_ref || ''}
													/>
													<p class="mt-1 text-xs opacity-60">
														Use `productId:variantId` or JSON with `product_id`, `variant_id`, and
														optional `placements`.
													</p>
												</div>
												<div class="flex flex-wrap items-center gap-2 md:col-span-4">
													<select class="select w-auto" name="is_active">
														<option value="1" selected={variant.is_active === true}>Active</option>
														<option value="0" selected={variant.is_active !== true}>Inactive</option
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
								<input type="hidden" name="product_id" value={product.id} />
								<div class="md:col-span-2">
									<label class="label" for={`new-variant-name-${product.id}`}
										>New Variant Name</label
									>
									<input
										id={`new-variant-name-${product.id}`}
										class="input w-full"
										name="name"
										required
									/>
								</div>
								<div>
									<label class="label" for={`new-variant-price-${product.id}`}>Price (USD)</label>
									<input
										id={`new-variant-price-${product.id}`}
										class="input w-full"
										name="price_dollars"
										type="number"
										min="0.5"
										step="0.01"
										required
									/>
								</div>
								<div>
									<label class="label" for={`new-variant-sku-${product.id}`}>SKU</label>
									<input id={`new-variant-sku-${product.id}`} class="input w-full" name="sku" />
								</div>
								<div>
									<label class="label" for={`new-variant-size-${product.id}`}>Size</label>
									<input id={`new-variant-size-${product.id}`} class="input w-full" name="size" />
								</div>
								<div>
									<label class="label" for={`new-variant-color-${product.id}`}>Color</label>
									<input id={`new-variant-color-${product.id}`} class="input w-full" name="color" />
								</div>
								<div>
									<label class="label" for={`new-variant-provider-${product.id}`}>Provider</label>
									<select
										id={`new-variant-provider-${product.id}`}
										name="partner_provider"
										class="select w-full"
									>
										<option value="manual">Manual</option>
										<option value="printful">Printful</option>
									</select>
								</div>
								<div>
									<label class="label" for={`new-variant-ref-${product.id}`}
										>Printful Item Ref</label
									>
									<input
										id={`new-variant-ref-${product.id}`}
										class="input w-full"
										name="partner_variant_ref"
									/>
									<p class="mt-1 text-xs opacity-60">
										For Printful v2, enter `productId:variantId` or JSON with optional placements.
									</p>
								</div>
								<div class="md:col-span-4">
									<button class="btn btn-sm preset-filled-primary-500" type="submit"
										>Add Variant</button
									>
								</div>
							</form>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<section class="panel rounded-2xl p-5">
		<div class="mb-3 flex items-center gap-2">
			<IconReceiptText class="h-4 w-4" />
			<h2 class="text-lg font-semibold">Recent Orders</h2>
		</div>

		{#if (data.orders?.length ?? 0) === 0}
			<p class="text-sm opacity-70">No orders yet.</p>
		{:else}
			<div class="space-y-3">
				{#each data.orders as order (order.id)}
					<article class="rounded-xl border border-white/10 bg-black/12 p-3">
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
								<button class="btn btn-xs preset-filled-warning-500" type="submit">Refund</button>
							</form>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.manage-hero {
		background:
			radial-gradient(
				circle at 5% 12%,
				color-mix(in oklab, var(--color-primary-500) 38%, transparent),
				transparent 38%
			),
			radial-gradient(
				circle at 94% 8%,
				color-mix(in oklab, var(--color-secondary-500) 34%, transparent),
				transparent 38%
			),
			linear-gradient(
				145deg,
				color-mix(in oklab, var(--color-surface-900) 89%, var(--color-primary-500) 11%),
				color-mix(in oklab, var(--color-surface-900) 82%, var(--color-tertiary-500) 18%)
			);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 26%, transparent);
	}
	.manage-orb {
		position: absolute;
		border-radius: 999px;
		filter: blur(80px);
		opacity: 0.7;
		pointer-events: none;
	}
	.orb-a {
		width: 18rem;
		height: 18rem;
		left: -7rem;
		top: -8rem;
		background: color-mix(in oklab, var(--color-primary-500) 46%, transparent);
	}
	.orb-b {
		width: 15rem;
		height: 15rem;
		right: -4rem;
		bottom: -8rem;
		background: color-mix(in oklab, var(--color-secondary-500) 42%, transparent);
	}
	.hero-pill {
		background: color-mix(in oklab, var(--color-surface-950) 60%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}
	.panel {
		background: linear-gradient(
			140deg,
			color-mix(in oklab, var(--color-surface-900) 94%, var(--color-primary-500) 6%),
			color-mix(in oklab, var(--color-surface-900) 90%, var(--color-secondary-500) 10%)
		);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}
</style>
