<script>
	import RideEditor from '#lib/components/ride/RideEditor.svelte';

	const { data } = $props();
	const isLoggedIn = $derived(Boolean(data?.currentUser?.id));
</script>

<svelte:head>
	<title>Create Ride</title>
	<meta name="robots" content="noindex,nofollow" />
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
	<div class="-m-4">
		<section
			class="bg-surface-900 border-surface-700 border-primary-500 relative overflow-hidden border-t-4 px-6 py-16 text-center sm:px-10 lg:py-24"
		>
			<div class="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6">
				<h1
					class="text-[clamp(2.9rem,7.4vw,5rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					Log in to create a ride
					<span class="text-primary-500">event</span>
				</h1>
				<p class="max-w-xl text-lg leading-relaxed text-balance">
					Use the button below to sign in or create an account. You can publish your ride as soon as
					you're signed in.
				</p>
				<div class="mt-4 pt-2">
					<button
						class="btn preset-filled-primary-500 mr-3 px-8 py-3 font-black transition"
						type="button"
						onclick={() => window.dispatchEvent(new Event('open-login'))}
					>
						Log in / Register
					</button>
					<a class="btn preset-outlined-primary-500 px-8 py-3 font-black transition" href="/ride"
						>Back to rides</a
					>
				</div>
			</div>
		</section>
	</div>
{/if}
