<script>
	let { data } = $props();
	const donation = $derived(data?.donation ?? null);
</script>

<svelte:head>
	<title>Donation Status • 3 Feet Please</title>
</svelte:head>

<div class="mx-auto w-full max-w-2xl space-y-5 pb-10">
	{#if !data?.ok}
		<section class="rounded-2xl border border-red-500/35 bg-red-500/10 p-6">
			<h1 class="text-2xl font-bold">We could not confirm this donation yet</h1>
			<p class="mt-2 text-sm opacity-80">{data?.error || 'Please check back in a moment.'}</p>
			<a class="btn preset-filled-primary-500 mt-4" href="/donate">Back to Donate</a>
		</section>
	{:else if !data?.paid}
		<section class="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-6">
			<h1 class="text-2xl font-bold">Payment is not complete yet</h1>
			<p class="mt-2 text-sm opacity-80">
				If you just completed checkout, refresh this page in a few seconds.
			</p>
			<a class="btn preset-filled-primary-500 mt-4" href="/donate">Back to Donate</a>
		</section>
	{:else}
		<section class="rounded-2xl border border-green-500/35 bg-green-500/10 p-6">
			<h1 class="text-2xl font-bold">Thank you for your donation</h1>
			{#if donation}
				<p class="mt-2 text-sm opacity-90">
					<strong>{donation.amount}</strong> was donated to
					<strong>{donation.recipientDisplayName}</strong>.
				</p>
			{/if}
			<p class="mt-3 text-sm opacity-80">
				We sent a confirmation to the donor (when an email was provided) and notified the recipient.
			</p>
			{#if donation?.donorRequestedAnonymity}
				<p class="mt-2 text-sm opacity-80">
					An anonymity request was included and shared with the recipient.
				</p>
			{/if}
			<div class="mt-4 flex flex-wrap gap-2">
				<a class="btn preset-filled-primary-500" href="/donate">Donate Again</a>
				<a class="btn preset-outlined-primary-500" href="/">Return Home</a>
			</div>
		</section>
	{/if}
</div>
