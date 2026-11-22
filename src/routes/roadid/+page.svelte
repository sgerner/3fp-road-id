<script>
	import IconContact from '@lucide/svelte/icons/contact';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import CrashResponse from '#lib/components/CrashResponse.svelte';
	import AlertSystem from '#lib/components/AlertSystem.svelte';
</script>

<svelte:head>
	<title>Road ID · 3 Feet Please</title>
	<meta
		name="description"
		content="Emergency medical profiles, responder QR lookups, and crash response guidance for 3 Feet Please In Case bracelets."
	/>
</svelte:head>

<div
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-hidden"
>
	<!-- HERO -->
	<section
		class="bg-surface-950 text-surface-50 border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"
		aria-labelledby="roadid-landing-heading"
	>
		<div
			class="border-primary-500 flex flex-col justify-between gap-6 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-12"
		>
			<p
				class="text-primary-500 m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
				<IconContact class="h-4 w-4" />
				<span>In Case Bracelet · Emergency ID</span>
			</p>

			<div class="flex flex-col gap-4">
				<h1
					id="roadid-landing-heading"
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
				>
					Road ID. <span class="text-primary-500">Ready when seconds count.</span>
				</h1>
				<p class="text-surface-300 m-0 max-w-2xl text-base leading-relaxed font-medium sm:text-lg">
					Emergency profiles for In Case bracelets—linking medical details, allergies, medications,
					and tap-to-call emergency contacts to a scannable roadside URL.
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-4 pt-2">
				<a
					href="/profile#road-id"
					class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 items-center gap-2.5 px-6 py-3 text-sm font-black tracking-wide uppercase transition"
				>
					<span>Manage Emergency ID</span>
					<IconArrowRight class="h-4 w-4" />
				</a>
				<a
					href="/roadid/3feetpls"
					class="border-surface-50 text-surface-50 hover:bg-secondary-500 hover:border-secondary-500 inline-flex min-h-11 items-center justify-center border-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition"
				>
					See an example profile
				</a>
			</div>
		</div>

		<!-- Production Notice Panel (orders stay paused) -->
		<aside
			class="bg-surface-900 text-surface-50 border-surface-800 border-t-tertiary-500 flex flex-col justify-between gap-4 border-t-4 px-6 py-8 sm:px-10 lg:border-l-2 lg:px-10 lg:py-10"
			aria-labelledby="roadid-update-heading"
		>
			<div class="flex flex-col gap-3">
				<span
					class="bg-tertiary-500 text-surface-950 self-start px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
				>
					Important Update
				</span>
				<h2
					id="roadid-update-heading"
					class="text-surface-50! m-0 text-2xl leading-tight font-black uppercase italic"
				>
					New wristband orders paused
				</h2>
				<ul
					class="text-surface-200 m-0 list-inside list-disc space-y-2 pl-1 text-sm leading-relaxed"
				>
					<li>
						<strong class="text-surface-50">New orders paused</strong> while we evaluate tariff impacts
					</li>
					<li>Existing bracelets &amp; profiles stay fully supported</li>
					<li>Print backup vector QR stickers anytime from your Emergency ID workspace</li>
					<li>We’ll post updates as soon as production resumes</li>
				</ul>
			</div>
		</aside>
	</section>

	<!-- ABOUT & HOW TO USE -->
	<section
		class="bg-surface-950 border-surface-800 grid border-b-2 lg:grid-cols-2"
		aria-labelledby="roadid-how-heading"
	>
		<div
			class="lg:border-surface-800 flex flex-col gap-5 px-6 py-10 sm:px-10 lg:border-r-2 lg:px-12 lg:py-14"
		>
			<div class="flex items-start gap-4">
				<span
					class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums"
					aria-hidden="true"
				>
					01
				</span>
				<div>
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">Overview</p>
					<h2 class="text-surface-50! m-0 text-3xl font-black uppercase italic">
						What is an In Case Bracelet?
					</h2>
				</div>
			</div>
			<ul
				class="border-surface-800 text-surface-200 m-0 list-inside list-disc space-y-2.5 border-t pt-5 text-base leading-relaxed"
			>
				<li>Durable silicone wristband with a unique QR code</li>
				<li>Scan with any phone camera to open your roadside responder screen</li>
				<li>Shows blood type, allergies, medications, and tap-to-call emergency contacts</li>
				<li>Enables first responders and fellow riders to act quickly and accurately</li>
			</ul>
		</div>

		<div class="flex flex-col gap-5 px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
			<div class="flex items-start gap-4">
				<span
					class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums"
					aria-hidden="true"
				>
					02
				</span>
				<div>
					<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
						Setup &amp; Management
					</p>
					<h2
						id="roadid-how-heading"
						class="text-surface-50! m-0 text-3xl font-black uppercase italic"
					>
						How to Use
					</h2>
				</div>
			</div>
			<div
				class="border-surface-800 text-surface-200 flex flex-col gap-3 border-t pt-5 text-base leading-relaxed"
			>
				<p class="m-0">
					<strong class="text-primary-500">1. Claim your bracelet:</strong> Scan a new wristband or
					enter its code directly inside
					<a href="/profile#road-id" class="text-primary-500 font-bold underline"
						>Emergency ID on your profile</a
					>.
				</p>
				<p class="m-0">
					<strong class="text-primary-500">2. Complete medical details:</strong> Update emergency overrides,
					allergies, medications, and contacts in one place—and link spare bands or print backup QR stickers.
				</p>
				<p class="m-0">
					<strong class="text-primary-500">3. Instant roadside access:</strong> Scanning your band opens
					the fast read-only responder card immediately.
				</p>
			</div>
		</div>
	</section>

	<!-- SAFETY REFERENCES -->
	<section
		class="bg-surface-950 flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-12 lg:py-14"
		aria-labelledby="roadid-resources-heading"
	>
		<h2
			id="roadid-resources-heading"
			class="text-surface-50! m-0 text-2xl font-black uppercase italic sm:text-3xl"
		>
			Roadside Safety Reference
		</h2>
		<details class="bg-surface-950 text-surface-50 border-surface-800 border-2 p-4">
			<summary class="text-surface-50 flex min-h-11 cursor-pointer items-center font-bold">
				Crash response checklist
			</summary>
			<div class="mt-4">
				<CrashResponse />
			</div>
		</details>
		<details class="bg-surface-950 text-surface-50 border-surface-800 border-2 p-4">
			<summary class="text-surface-50 flex min-h-11 cursor-pointer items-center font-bold">
				Cycling safety tips
			</summary>
			<div class="mt-4">
				<AlertSystem />
			</div>
		</details>
	</section>
</div>
