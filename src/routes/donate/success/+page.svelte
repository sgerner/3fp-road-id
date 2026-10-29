<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconShieldAlert from '@lucide/svelte/icons/shield-alert';

	let { data } = $props();
	const donation = $derived(data?.donation ?? null);
</script>

<svelte:head>
	<title>Donation Status • 3 Feet Please</title>
</svelte:head>

<div
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden"
>
	{#if !data?.ok}
		<section
			class="bg-tertiary-500 text-surface-950 flex flex-1 flex-col justify-center px-6 py-14 sm:px-10 lg:px-14 lg:py-20"
			aria-labelledby="donation-status-heading"
		>
			<div class="flex max-w-3xl flex-col gap-6">
				<p class="m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
					<IconShieldAlert class="h-4 w-4" />
					Donation Status
				</p>
				<h1
					id="donation-status-heading"
					class="text-surface-950! m-0 text-[clamp(2.6rem,6.8vw,6rem)] leading-[0.88] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					We could not confirm this donation yet
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium sm:text-2xl">
					{data?.error || 'Please check back in a moment.'}
				</p>
				<div class="flex flex-wrap gap-3 pt-2">
					<a
						class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
						href={data?.donateAgainHref || '/donate'}
					>
						Back to Donate
						<IconArrowRight class="h-5 w-5 transition group-hover:translate-x-1" />
					</a>
				</div>
			</div>
		</section>
	{:else if !data?.paid}
		<section
			class="bg-secondary-500 text-surface-50 flex flex-1 flex-col justify-center px-6 py-14 sm:px-10 lg:px-14 lg:py-20"
			aria-labelledby="donation-status-heading"
		>
			<div class="flex max-w-3xl flex-col gap-6">
				<p
					class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconClock class="h-4 w-4" />
					Payment Status
				</p>
				<h1
					id="donation-status-heading"
					class="text-surface-50! m-0 text-[clamp(2.6rem,6.8vw,6rem)] leading-[0.88] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					Payment is not complete yet
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium sm:text-2xl">
					If you just submitted payment, refresh this page in a few seconds.
				</p>
				<div class="flex flex-wrap gap-3 pt-2">
					<a
						class="group bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
						href={data?.donateAgainHref || '/donate'}
					>
						Back to Donate
						<IconArrowRight class="h-5 w-5 transition group-hover:translate-x-1" />
					</a>
				</div>
			</div>
		</section>
	{:else}
		<section
			class="bg-primary-500 text-surface-950 flex flex-1 flex-col justify-center px-6 py-14 sm:px-10 lg:px-14 lg:py-20"
			aria-labelledby="donation-status-heading"
		>
			<div class="flex max-w-3xl flex-col gap-6">
				<p class="m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
					<span class="bg-surface-950 text-primary-500 inline-flex items-center gap-1.5 px-3 py-1">
						<IconCheck class="h-3.5 w-3.5" />
						Confirmed
					</span>
					<span>3 Feet Please</span>
				</p>
				<h1
					id="donation-status-heading"
					class="text-surface-950! m-0 text-[clamp(2.9rem,7.4vw,6.8rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					Thank you for your <span class="text-secondary-500">donation</span>
				</h1>
				{#if donation}
					<p class="m-0 max-w-xl text-xl leading-snug font-bold sm:text-2xl">
						<strong>{donation.amount}</strong> was donated to
						<strong>{donation.recipientDisplayName}</strong>.
					</p>
				{/if}
				<p class="m-0 max-w-xl text-base leading-relaxed font-medium sm:text-lg">
					We sent a confirmation to the donor (when an email was provided) and notified the
					recipient.
				</p>
				{#if donation?.donorRequestedAnonymity}
					<p
						class="border-surface-950 m-0 max-w-xl border-l-[3px] pl-4 text-sm font-bold uppercase"
					>
						An anonymity request was included and shared with the recipient.
					</p>
				{/if}
				<div class="flex flex-wrap gap-3 pt-2">
					<a
						class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
						href={data?.donateAgainHref || '/donate'}
					>
						<IconHeart class="h-5 w-5" />
						Donate Again
						<IconArrowRight class="h-5 w-5 transition group-hover:translate-x-1" />
					</a>
					<a
						class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center gap-3 border-[3px] px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
						href="/"
					>
						Return Home
					</a>
				</div>
			</div>
		</section>
	{/if}

	<!-- Ruler band: 0 → 3 ft -->
	<div
		class="bg-surface-950 text-surface-50 border-surface-800 grid grid-cols-3 border-t-[3px]"
		aria-hidden="true"
	>
		{#each ['0', '1 ft', '2 ft'] as mark, i (mark)}
			<div class="border-surface-800 relative h-14 border-l-[3px] first:border-l-0">
				<span
					class="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_2px,transparent_2px_calc(100%/12))]"
				></span>
				<span class="text-primary-500 absolute bottom-2 left-3 text-sm font-black uppercase">
					{mark}
				</span>
				{#if i === 2}
					<span class="text-primary-500 absolute right-3 bottom-2 text-sm font-black uppercase">
						3 ft
					</span>
				{/if}
			</div>
		{/each}
	</div>
</div>
