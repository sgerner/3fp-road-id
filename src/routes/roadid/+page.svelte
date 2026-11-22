<script>
	import CrashResponse from '#lib/components/CrashResponse.svelte';
	import AlertSystem from '#lib/components/AlertSystem.svelte';
</script>

<div class="mx-auto max-w-md space-y-10">
	<header>
		<h1 class="text-3xl font-bold">Road ID</h1>
		<p class="mt-2 text-center text-lg">Emergency profiles for In Case bracelets</p>
	</header>

	<!-- About Section -->
	<section class="card border-surface-700-300 bg-surface-50-950 card-hover border-[1px] p-2">
		<p class="mb-2 border-b pb-2 text-center text-2xl font-bold">What is an In Case Bracelet?</p>
		<ul class="mx-4 my-2 list-inside list-disc space-y-1">
			<li>Durable silicone wristband with a unique QR code</li>
			<li>Scan with a phone to open your profile</li>
			<li>Shows emergency contacts & critical medical info</li>
			<li>Enables first responders to act quickly and accurately</li>
		</ul>
	</section>

	<!-- Production Notice Section -->
	<section class="card border-warning-700-300 bg-error-200-800 card-hover border-[1px] p-2">
		<p class="mb-2 border-b pb-2 text-center text-2xl font-bold">Important&nbsp;Update</p>
		<ul class="mx-4 my-2 list-inside list-disc space-y-1">
			<li><span class="font-semibold">New orders paused</span> while we evaluate tariff impacts</li>
			<li>Existing bracelets &amp; profiles stay fully supported</li>
			<li>We’ll post updates as soon as production resumes</li>
		</ul>
	</section>

	<!-- How To Use Section -->
	<section class="card border-surface-700-300 bg-surface-50-950 card-hover border-[1px] p-2">
		<p class=" mb-2 border-b pb-2 text-center text-2xl font-bold">How to Use</p>
		<p class="pl-8 indent-[-1.5rem]">
			🤳 Scan your In Case bracelet to open your profile. New bracelets can be claimed from the scan
			page. Sign in there to update an existing profile.
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			👤 <strong>Claim your unique profile</strong> and personalize your emergency details.
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			🚀 Now your info is <strong>instantly accessible to first responders</strong> in an emergency.
		</p>
		<a class="btn btn-sm preset-outlined-success-500 mt-4 w-full" href="/roadid/3feetpls">
			See an example profile
		</a>
	</section>
	<details class="border-surface-500 border">
		<summary class="cursor-pointer px-4 py-2 font-bold pointer-coarse:py-3">
			Crash response checklist
		</summary>
		<div class="px-4 pb-4">
			<CrashResponse />
		</div>
	</details>
	<details class="border-surface-500 border">
		<summary class="cursor-pointer px-4 py-2 font-bold pointer-coarse:py-3">
			Cycling safety tips
		</summary>
		<div class="px-4 pb-4">
			<AlertSystem />
		</div>
	</details>
</div>
