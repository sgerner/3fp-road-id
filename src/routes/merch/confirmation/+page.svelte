<script>
	import { onMount } from 'svelte';
	import { merchCart } from '$lib/merch/cart';

	let { data } = $props();

	onMount(() => {
		if (data?.ok && data?.paid) {
			merchCart.clear();
		}
	});
</script>

<svelte:head>
	<title>Order Confirmation • 3 Feet Please Merch</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-5 pb-10">
	{#if !data.ok}
		<section class="rounded-2xl border border-red-500/35 bg-red-500/10 p-6">
			<h1 class="text-2xl font-bold">We could not confirm your order yet</h1>
			<p class="mt-2 text-sm opacity-80">{data.error}</p>
			<a class="btn preset-filled-primary-500 mt-4" href="/merch">Back to Merch</a>
		</section>
	{:else if !data.paid}
		<section class="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-6">
			<h1 class="text-2xl font-bold">Payment is still processing</h1>
			<p class="mt-2 text-sm opacity-80">
				If you just checked out, refresh this page in a few seconds.
			</p>
			<a class="btn preset-filled-primary-500 mt-4" href="/merch/orders">View Order History</a>
		</section>
	{:else}
		<section class="rounded-2xl border border-green-500/35 bg-green-500/10 p-6">
			<h1 class="text-2xl font-bold">Order Confirmed</h1>
			{#if data.order}
				<p class="mt-2 text-sm opacity-90">
					Order <strong>{data.order.orderNumber}</strong> has been paid. Total:
					<strong>{data.order.total}</strong>.
				</p>
				<p class="mt-1 text-xs opacity-75">
					Status: {data.order.status} · Fulfillment: {data.order.fulfillmentStatus}
				</p>
			{/if}
			<div class="mt-4 flex flex-wrap gap-2">
				<a class="btn preset-filled-primary-500" href="/merch/orders">Order History</a>
				<a class="btn preset-outlined-primary-500" href="/merch">Continue Shopping</a>
			</div>
		</section>

		{#if (data.items?.length ?? 0) > 0}
			<section class="rounded-2xl border border-white/10 bg-black/20 p-5">
				<h2 class="text-lg font-semibold">Items</h2>
				<ul class="mt-3 space-y-2">
					{#each data.items as item (item.id)}
						<li class="rounded-lg border border-white/10 bg-black/15 px-3 py-2.5">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="font-semibold">{item.productName}</p>
									<p class="text-sm opacity-75">{item.variantName}</p>
									<p class="text-xs opacity-70">Qty: {item.quantity}</p>
								</div>
								<div class="text-sm font-semibold">{item.lineTotal}</div>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
