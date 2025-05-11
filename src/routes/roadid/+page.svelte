<script>
	import { goto } from '$app/navigation';
</script>

<div class="mx-auto max-w-md space-y-10">
	<header>
		<h1 class="text-3xl font-bold">Road ID Bracelet</h1>
		<p class="mt-2 text-center text-lg">Bicycle Safety & Emergency Info</p>
	</header>

	<!-- About Section -->
	<section class="card border-surface-300 bg-surface-950 card-hover border-[1px] p-2">
		<p class="mb-2 border-b pb-2 text-center text-2xl font-bold">
			What is a Road&nbsp;ID Bracelet?
		</p>
		<ul class="mx-4 my-2 list-inside list-disc space-y-1">
			<li>Durable silicone wristband with a unique QR code</li>
			<li>Scan with a tphone to open your profile</li>
			<li>Shows emergency contacts & critical medical info</li>
			<li>Enables first responders to act quickly and accurately</li>
		</ul>
	</section>

	<!-- Production Notice Section -->
	<section class="card border-warning-300 bg-error-800 card-hover border-[1px] p-2">
		<p class="mb-2 border-b pb-2 text-center text-2xl font-bold">Important&nbsp;Update</p>
		<ul class="mx-4 my-2 list-inside list-disc space-y-1">
			<li><span class="font-semibold">New orders paused</span> while we evaluate tariff impacts</li>
			<li>Existing bracelets &amp; profiles stay fully supported</li>
			<li>We’ll post updates as soon as production resumes</li>
		</ul>
	</section>

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
			onclick={() => goto('/roadid/3feetpls')}
		>
			See an example profile
		</button>
	</section>
</div>
