<script>
	import { page } from '$app/state';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconHome from '@lucide/svelte/icons/home';

	// Array of bicycle-themed puns for 404 errors
	const notFoundPuns = [
		"Looks like you've gone off the chain.",
		"We're pedaling in circles trying to find this page.",
		'Looks like you have a flat tire... or a broken link.',
		"You've hit a dead end on the trail.",
		'This page shifted into the wrong gear and disappeared.',
		'Whoops, someone forgot to true their wheels and lost this page.',
		"You're coasting down a path that doesn't exist.",
		"You've been dropped from the peloton! This page is nowhere to be found."
	];

	// Array of generic error messages for other status codes
	const genericPuns = [
		"We've hit a pothole. Something went wrong.",
		"Our chain snapped! We're working on fixing this error.",
		"A spoke broke in the server room. We'll be right back on the road."
	];

	// Determine the status code
	let status = $derived(page.status);
	let is404 = $derived(status === 404);

	// Select a random pun based on the error type
	let randomPun = $derived(
		is404
			? notFoundPuns[Math.floor(Math.random() * notFoundPuns.length)]
			: genericPuns[Math.floor(Math.random() * genericPuns.length)]
	);

	// Get the error message (if any)
	let errorMessage = $derived(page.error?.message);
</script>

<svelte:head>
	<title>{status} - 3 Feet Please</title>
</svelte:head>

<section
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh+2rem)] flex-col overflow-hidden"
	aria-label="Error"
>
	<div class="bg-primary-500 text-surface-950 grid flex-1 lg:grid-cols-[auto_minmax(0,1fr)]">
		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 flex flex-col justify-between gap-6 border-b-[3px] px-8 py-10 sm:px-12 lg:border-r-[3px] lg:border-b-0 lg:px-16 lg:py-16"
		>
			<p class="m-0 text-xs font-bold tracking-[0.22em] uppercase">Status Code</p>
			<h1
				class="text-surface-950! m-0 text-[clamp(6rem,18vw,14rem)] leading-[0.78] font-black tracking-[-0.06em] italic tabular-nums"
			>
				{status}
			</h1>
			<p class="m-0 text-xs font-black tracking-[0.22em] uppercase">3 Feet Please</p>
		</div>

		<div class="flex flex-col justify-between gap-10 px-8 py-10 sm:px-12 lg:px-16 lg:py-16">
			<p class="m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase">
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<span>Off Course</span>
			</p>

			<div class="flex flex-col gap-6">
				<h2
					class="text-surface-950! m-0 text-4xl leading-[0.88] font-black tracking-[-0.03em] uppercase italic sm:text-6xl lg:text-7xl"
				>
					{#if is404}
						Page Not <span class="text-secondary-500">Found</span>
					{:else}
						Something went <span class="text-secondary-500">wrong</span>
					{/if}
				</h2>

				<p class="m-0 max-w-xl text-xl leading-snug font-bold italic sm:text-2xl">
					"{randomPun}"
				</p>

				{#if !is404 && errorMessage}
					<div
						class="bg-surface-950 text-surface-50 max-w-2xl overflow-x-auto p-4 text-left font-mono text-sm"
					>
						Error details: {errorMessage}
					</div>
				{/if}
			</div>

			<div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				<button
					onclick={() => history.back()}
					class="group border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center justify-center gap-3 border-[3px] px-7 py-4 text-base font-black tracking-wide uppercase transition"
				>
					<IconArrowLeft class="h-5 w-5 transition group-hover:-translate-x-1" />
					Go Back
				</button>
				<a
					href="/"
					class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
				>
					<IconHome class="h-5 w-5" />
					Return Home
				</a>
			</div>
		</div>
	</div>

	<!-- Ruler band: 0 → 3 ft -->
	<div
		class="bg-surface-950 text-primary-500 border-surface-950 grid grid-cols-3 border-t-[3px]"
		aria-hidden="true"
	>
		{#each ['0', '1 ft', '2 ft'] as mark, i (mark)}
			<div class="border-surface-800 relative h-14 border-l-[3px] first:border-l-0">
				<span
					class="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_2px,transparent_2px_calc(100%/12))]"
				></span>
				<span class="absolute bottom-2 left-6 text-sm font-black uppercase">{mark}</span>
				{#if i === 2}
					<span class="absolute right-6 bottom-2 text-sm font-black uppercase">3 ft</span>
				{/if}
			</div>
		{/each}
	</div>
</section>
