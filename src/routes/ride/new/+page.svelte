<script>
	import RideEditor from '$lib/components/ride/RideEditor.svelte';

	const { data } = $props();
	const isLoggedIn = $derived(Boolean(data?.currentUser?.id));
</script>

<svelte:head>
	<title>Create Ride</title>
</svelte:head>

{#if isLoggedIn}
	<RideEditor
		pageTitle="Create a Ride"
		pageDescription="Build a public ride page with RSVP, recurring schedules, reminder emails, and the ride details."
		difficultyLevels={data.difficultyLevels}
		disciplines={data.disciplines}
		hostGroups={data.hostGroups}
		currentUser={data.currentUser}
		currentProfile={data.currentProfile}
	/>
{:else}
	<main class="mx-auto w-full max-w-4xl px-4 py-12 lg:py-24">
		<section
			class="hero-section preset-outlined-surface-500 relative overflow-hidden rounded-3xl p-8 py-16 text-center shadow-2xl lg:p-16"
		>
			<div class="hero-orb hero-orb-1 opacity-60" aria-hidden="true"></div>
			<div class="hero-orb hero-orb-2 opacity-60" aria-hidden="true"></div>
			<div class="hero-orb hero-orb-3 opacity-60" aria-hidden="true"></div>

			<div class="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-6">
				<h1 class="text-4xl font-extrabold tracking-tight text-balance md:text-5xl lg:text-6xl">
					Log in to create a <br class="hidden sm:block" /><span
						class="text-primary-500 drop-shadow-sm">ride event</span
					>
				</h1>
				<p class="max-w-xl text-lg leading-relaxed text-balance opacity-80">
					Please log in or register first using the <strong class="text-white"
						>Log in / Register</strong
					> button in the header before creating a new event.
				</p>
				<div class="mt-4 pt-2">
					<a
						class="btn preset-filled-primary-500 shadow-primary-500/20 px-8 py-2.5 font-semibold shadow-xl transition hover:-translate-y-1"
						href="/ride">Back to rides</a
					>
				</div>
			</div>
		</section>
	</main>
{/if}
