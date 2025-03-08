<script>
	import AlertSystem from '$lib/components/AlertSystem.svelte';
	import CrashResponse from '$lib/components/CrashResponse.svelte';
	import { goto } from '$app/navigation';
</script>

<div class="mx-auto max-w-md space-y-10">
	<!-- Header with gradient background -->
	<header>
		<h1 class="text-3xl font-bold">SafeSpokes</h1>
		<p class="mt-2 text-center text-lg">Bicycle Safety & Emergency Info</p>
	</header>

	<!-- Purpose Section -->
	<section class="card border-surface-300 bg-surface-950 card-hover border-[1px] p-2">
		<p class="mb-2 border-b pb-2 text-center text-2xl font-bold">Purpose</p>
		<p class="pl-8 indent-[-1.5rem]">
			🚑 <strong>Securely store your emergency medical information</strong>
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			💡 Get <strong>instant crash response tips</strong> at your fingertips.
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			🔑 Enable <strong>quick scan access</strong> to your vital details when it matters most.
		</p>
	</section>

	<!-- How To Use Section -->
	<section class="card border-surface-300 bg-surface-950 card-hover border-[1px] p-2">
		<p class=" mb-2 border-b pb-2 text-center text-2xl font-bold">How to Use</p>
		<p class="pl-8 indent-[-1.5rem]">
			🤳 Simply <strong>scan your Road ID bracelet</strong> to get started.
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			👤 <strong>Claim your unique profile</strong> and personalize your emergency details.
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			🚀 Now your info is <strong>instantly accessible to first responders</strong> in an emergency.
		</p>
		<button
			class="btn btn-sm preset-outlined-success-500 mt-4 w-full"
			onclick={() => goto('/3feetpls')}
		>
			See an example profile
		</button>
	</section>

	<!-- About 3 Feet Please Section -->
	<section class="card border-surface-300 bg-surface-950 card-hover border-[1px] p-2">
		<p class="mb-2 border-b pb-2 text-center text-2xl font-bold">About 3 Feet Please</p>
		<p class="pl-8 indent-[-1.5rem]">
			🚴‍♀️ We are a <strong>bicycle safety nonprofit</strong> dedicated to protecting riders.
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			❤️ We <strong>advocate for safe riding practices</strong> and share the road awareness.
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			📚 Our mission is to provide <strong>essential emergency resources</strong> for the cycling community.
		</p>
		<button
			class="btn btn-sm preset-outlined-success-500 mt-4 w-full"
			onclick={() => goto('https://3feetplease.org')}
		>
			Learn more
		</button>
	</section>

	<!-- Safety Advice Section with two cards -->
	<section class="space-y-6">
		<CrashResponse />
		<hr />
		<AlertSystem />
	</section>
</div>

<style>
	p {
		margin-bottom: 0.5rem;
	}
</style>
