<script>
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
</svelte:head>

<div class="mx-auto w-full max-w-4xl space-y-5 pb-10">
	<section class="rounded-2xl border border-white/10 bg-black/20 p-6">
		<h1 class="text-3xl font-bold">Order History</h1>
		<p class="mt-2 text-sm opacity-80">
			Review your merch purchases and current fulfillment status.
		</p>
	</section>

	{#if data.authRequired}
		<section class="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5 text-sm">
			Please log in to view your order history.
		</section>
	{:else if data.error}
		<section class="rounded-2xl border border-red-500/35 bg-red-500/10 p-5 text-sm">
			{data.error}
		</section>
	{:else if (data.orders?.length ?? 0) === 0}
		<section class="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm">
			No merch orders found yet.
		</section>
	{:else}
		<div class="space-y-3">
			{#each data.orders as order (order.id)}
				<article class="rounded-2xl border border-white/10 bg-black/20 p-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<h2 class="text-lg font-semibold">Order {order.orderNumber}</h2>
							<p class="mt-0.5 text-xs opacity-70">{formatDate(order.createdAt)}</p>
						</div>
						<div class="text-right">
							<div class="text-base font-bold">{order.total}</div>
							<div class="mt-1 text-xs opacity-75">
								<span class="chip preset-tonal-surface text-[11px]">{order.status}</span>
								<span class="chip preset-tonal-primary ml-1 text-[11px]">{order.paymentStatus}</span
								>
								<span class="chip preset-tonal-tertiary ml-1 text-[11px]"
									>{order.fulfillmentStatus}</span
								>
							</div>
						</div>
					</div>
					<ul class="mt-3 space-y-1">
						{#each order.items as item (item.id)}
							<li class="text-sm opacity-85">
								{item.quantity} × {item.productName} — {item.variantName}
							</li>
						{/each}
					</ul>
				</article>
			{/each}
		</div>
	{/if}
</div>
