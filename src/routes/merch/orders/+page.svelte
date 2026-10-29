<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconReceiptText from '@lucide/svelte/icons/receipt-text';
	import IconShoppingBag from '@lucide/svelte/icons/shopping-bag';

	let { data } = $props();

	function formatDate(value) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
			date
		);
	}
</script>

<svelte:head>
	<title>Order History • 3 Feet Please Merch</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="text-surface-50 flex flex-col overflow-hidden">
	<!-- ═══ HERO ══════════════════════════════════════════════════ -->
	<section
		class="bg-tertiary-500 text-surface-950 border-surface-950 grid items-end gap-8 border-b-[3px] px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-14 lg:py-14"
		aria-labelledby="orders-heading"
	>
		<div class="flex flex-col gap-4">
			<p class="m-0 flex items-center gap-2.5 text-xs font-black tracking-[0.22em] uppercase">
				<span class="bg-surface-950 h-3 w-3 shrink-0" aria-hidden="true"></span>
				<IconReceiptText class="h-4 w-4 shrink-0" />
				<span>Merch Receipts & Fulfillment</span>
			</p>
			<h1
				id="orders-heading"
				class="text-surface-950! m-0 text-4xl leading-[0.88] font-black tracking-[-0.04em] uppercase italic sm:text-6xl"
			>
				Order History.
			</h1>
			<p class="m-0 max-w-xl text-base leading-snug font-medium sm:text-xl">
				Review your merch purchases and current fulfillment status.
			</p>
		</div>

		<a
			href="/merch"
			class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-3 self-start px-6 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline lg:self-end"
		>
			<IconShoppingBag class="h-4 w-4" />
			<span>Back to Store</span>
			<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
		</a>
	</section>

	<!-- ═══ CONTENT ═══════════════════════════════════════════════ -->
	<section
		class="bg-surface-950 text-surface-50 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
		aria-label="Order list"
	>
		{#if data.authRequired}
			<div class="border-primary-500 flex max-w-2xl flex-col gap-6 border-t-[3px] pt-8">
				<span
					class="bg-primary-500 text-surface-950 self-start px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
				>
					Sign-in required
				</span>
				<p
					class="text-surface-50 m-0 text-2xl leading-tight font-black uppercase italic sm:text-3xl"
				>
					Please log in to view your order history.
				</p>
				<p class="text-surface-300 m-0 text-base leading-relaxed">
					Use the Sign In button in the top bar with the email address you used at checkout to look
					up past orders and fulfillment updates.
				</p>
				<div class="flex flex-wrap gap-3">
					<a
						href="/merch"
						class="group bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex items-center gap-2 px-6 py-3.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					>
						<span>Browse Merch Store</span>
						<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
					</a>
				</div>
			</div>
		{:else if data.error}
			<div class="bg-tertiary-500 text-surface-950 p-6 text-base font-black uppercase">
				{data.error}
			</div>
		{:else if (data.orders?.length ?? 0) === 0}
			<div class="border-surface-50 flex max-w-2xl flex-col gap-6 border-t-2 pt-8">
				<p class="text-surface-50 m-0 text-2xl font-black uppercase italic sm:text-3xl">
					No merch orders found yet.
				</p>
				<p class="text-surface-300 m-0 text-base leading-relaxed">
					Every piece of 3FP gear funds safer streets. Grab your first drop in the store.
				</p>
				<div>
					<a
						href="/merch"
						class="group bg-primary-500 text-surface-950 hover:bg-tertiary-500 inline-flex items-center gap-2 px-6 py-3.5 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					>
						<span>Shop the Drop</span>
						<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
					</a>
				</div>
			</div>
		{:else}
			<ol class="border-surface-50 m-0 list-none border-t-2 p-0">
				{#each data.orders as order, index (order.id)}
					<li class="border-surface-800 border-b py-8">
						<article class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
							<div class="flex items-start gap-4 sm:gap-6">
								<span
									class="text-tertiary-500 w-10 shrink-0 text-3xl leading-none font-black italic tabular-nums sm:w-14 sm:text-4xl"
								>
									{String(index + 1).padStart(2, '0')}
								</span>
								<div class="flex flex-col gap-4">
									<div>
										<h2 class="text-surface-50! m-0 text-2xl font-black uppercase sm:text-3xl">
											Order {order.orderNumber}
										</h2>
										<p
											class="text-surface-300 m-0 mt-1 text-xs font-bold tracking-[0.18em] uppercase"
										>
											{formatDate(order.createdAt)}
										</p>
									</div>

									<ul
										class="border-primary-500 m-0 flex list-none flex-col gap-1.5 border-l-[3px] py-0.5 pl-4"
									>
										{#each order.items as item (item.id)}
											<li class="text-surface-50 text-sm font-bold">
												<span class="text-primary-500 font-black tabular-nums"
													>{item.quantity} ×</span
												>
												{item.productName} —
												<span class="text-surface-300 font-medium">{item.variantName}</span>
											</li>
										{/each}
									</ul>
								</div>
							</div>

							<div class="flex flex-col items-start gap-3 pl-14 lg:items-end lg:pl-0">
								<div class="text-primary-500 text-3xl font-black italic tabular-nums">
									{order.total}
								</div>
								<div class="flex flex-wrap gap-1.5">
									<span
										class="border-surface-700 bg-surface-900 text-surface-50 border-2 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
									>
										{order.status}
									</span>
									<span
										class="bg-primary-500 text-surface-950 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
									>
										{order.paymentStatus}
									</span>
									<span
										class="bg-secondary-500 text-surface-50 px-3 py-1 text-xs font-black tracking-[0.16em] uppercase"
									>
										{order.fulfillmentStatus}
									</span>
								</div>
							</div>
						</article>
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</div>
