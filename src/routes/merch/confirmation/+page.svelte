<script>
	import { onMount } from 'svelte';
	import { merchCart } from '#lib/merch/cart';

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

<div class="text-surface-50 flex flex-col overflow-hidden">
	{#if !data.ok}
		<section class="bg-tertiary-500 text-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
			<p class="m-0 text-xs font-black tracking-[0.22em] uppercase">Order Status</p>
			<h1
				class="text-surface-950! m-0 mt-3 text-4xl leading-[0.9] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
			>
				We could not confirm your order yet
			</h1>
			<p class="m-0 mt-4 max-w-xl text-base font-medium">{data.error}</p>
			<div class="mt-8">
				<a
					class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center px-7 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					href="/merch"
				>
					Back to Merch
				</a>
			</div>
		</section>
	{:else if !data.paid}
		<section class="bg-secondary-500 text-surface-50 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
			<p class="text-primary-500 m-0 text-xs font-black tracking-[0.22em] uppercase">
				Order Status
			</p>
			<h1
				class="text-surface-50! m-0 mt-3 text-4xl leading-[0.9] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
			>
				Payment is still processing
			</h1>
			<p class="m-0 mt-4 max-w-xl text-base font-medium">
				If you just checked out, refresh this page in a few seconds.
			</p>
			<div class="mt-8">
				<a
					class="bg-primary-500 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center px-7 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					href="/merch/orders"
				>
					View Order History
				</a>
			</div>
		</section>
	{:else}
		<section class="bg-primary-500 text-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
			<p class="m-0 text-xs font-black tracking-[0.22em] uppercase">Thank you for riding loud</p>
			<h1
				class="text-surface-950! m-0 mt-3 text-4xl leading-[0.9] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
			>
				Order Confirmed
			</h1>
			{#if data.order}
				<p class="m-0 mt-4 text-lg font-medium">
					Order <strong class="font-black">{data.order.orderNumber}</strong> has been paid. Total:
					<strong class="font-black">{data.order.total}</strong>.
				</p>
				<p class="m-0 mt-2 text-xs font-black tracking-[0.18em] uppercase">
					Status: {data.order.status} · Fulfillment: {data.order.fulfillmentStatus}
				</p>
			{/if}
			<div class="mt-8 flex flex-wrap gap-3">
				<a
					class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center px-7 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					href="/merch/orders"
				>
					Order History
				</a>
				<a
					class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center border-[3px] px-7 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline"
					href="/merch"
				>
					Continue Shopping
				</a>
			</div>
		</section>

		{#if (data.items?.length ?? 0) > 0}
			<section class="bg-surface-950 text-surface-50 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
				<h2 class="text-surface-50! m-0 text-3xl font-black uppercase italic">Items</h2>
				<ul class="border-surface-50 m-0 mt-6 list-none border-t-2 p-0">
					{#each data.items as item (item.id)}
						<li class="border-surface-800 border-b py-4">
							<div class="flex items-center justify-between gap-4">
								<div>
									<p class="m-0 text-base font-black uppercase">{item.productName}</p>
									<p class="text-surface-300 m-0 text-sm">{item.variantName}</p>
									<p class="text-primary-500 m-0 mt-1 text-xs font-black uppercase">
										Qty: {item.quantity}
									</p>
								</div>
								<div class="text-primary-500 text-xl font-black italic tabular-nums">
									{item.lineTotal}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
