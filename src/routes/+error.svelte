<script>
	import { page } from '$app/stores';
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
	let status = $derived($page.status);
	let is404 = $derived(status === 404);

	// Select a random pun based on the error type
	let randomPun = $derived(
		is404
			? notFoundPuns[Math.floor(Math.random() * notFoundPuns.length)]
			: genericPuns[Math.floor(Math.random() * genericPuns.length)]
	);

	// Get the error message (if any)
	let errorMessage = $derived($page.error?.message);
</script>

<svelte:head>
	<title>{status} - 3 Feet Please</title>
</svelte:head>

<!-- Cinematic Full-Page Layout -->
<section
	class="relative flex min-h-[calc(100dvh-73px)] w-full flex-col items-center justify-center overflow-hidden"
	aria-label="Error"
>
	<!-- Subtle Background Enhancements (Assuming cinematic-bg-drift from app.css is active on the body) -->

	<!-- Glow accent for depth -->
	<div
		class="bg-primary-600-400/20 pointer-events-none absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
	></div>

	<!-- Glassmorphic Card Container -->
	<div
		class="card border-surface-300-700/50 bg-surface-100-900/60 shadow-surface-950/20 relative z-10 mx-auto w-full max-w-2xl border p-8 text-center shadow-2xl backdrop-blur-md sm:rounded-3xl sm:p-12"
	>
		<!-- 404 / Error Code Header -->
		<h1
			class="from-primary-400 to-tertiary-500 mb-4 bg-linear-to-r bg-clip-text text-8xl font-black text-transparent drop-shadow-sm sm:text-9xl"
		>
			{status}
		</h1>

		<!-- Subheading / Title -->
		<h2 class="text-primary-950-50 mb-6 text-2xl font-bold sm:text-3xl">
			{#if is404}
				Page Not Found
			{:else}
				Something went wrong
			{/if}
		</h2>

		<!-- The Pun -->
		<p class="text-surface-700-300 mx-auto mb-8 max-w-md text-lg leading-relaxed italic">
			"{randomPun}"
		</p>

		<!-- Optional Error Details -->
		{#if !is404 && errorMessage}
			<div
				class="bg-surface-800/40 text-surface-200 mt-4 mb-8 max-w-full overflow-x-auto rounded-lg p-3 text-left font-mono text-sm"
			>
				Error details: {errorMessage}
			</div>
		{/if}

		<!-- CTA Buttons -->
		<div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
			<button
				onclick={() => history.back()}
				class="btn preset-outlined-primary-500 group flex w-full items-center justify-center gap-2 px-6 py-2.5 transition-transform hover:scale-105 sm:w-auto"
			>
				<IconArrowLeft class="h-4 w-4 transition-transform group-hover:-translate-x-1" />
				Go Back
			</button>
			<a
				href="/"
				class="btn preset-filled-primary-500 group shadow-primary-500/20 flex w-full items-center justify-center gap-2 px-6 py-2.5 shadow-lg transition-transform hover:scale-105 sm:w-auto"
			>
				<IconHome class="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
				Return Home
			</a>
		</div>
	</div>
</section>
