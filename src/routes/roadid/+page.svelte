<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconContact from '@lucide/svelte/icons/contact';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconUserCircle2 from '@lucide/svelte/icons/circle-user-round';
	import CrashResponse from '#lib/components/CrashResponse.svelte';
	import AlertSystem from '#lib/components/AlertSystem.svelte';

	let { data } = $props();
	const currentUser = $derived(data?.currentUser ?? data?.user ?? null);
	const claimedCodes = $derived(
		Array.isArray(data?.claimedCodes) ? data.claimedCodes.filter(Boolean) : []
	);
	const safetySummary = $derived(data?.safetySummary ?? null);
</script>

<svelte:head>
	<title>Road ID · 3 Feet Please</title>
	<meta
		name="description"
		content="Emergency medical profiles, responder QR lookups, and crash response guidance for 3 Feet Please In Case bracelets."
	/>
</svelte:head>

<div
	class="bg-surface-50-950 text-surface-950-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-x-clip"
>
	<!-- HERO -->
	<section
		class="bg-surface-50-950 text-surface-950-50 border-surface-200-800 grid border-b-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"
		aria-labelledby="roadid-landing-heading"
	>
		<div
			class="border-primary-500 flex min-w-0 flex-col justify-between gap-6 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-12"
		>
			<p
				class="text-secondary-700 dark:text-primary-500 m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
				<IconContact class="h-4 w-4" />
				<span>In Case Bracelet · Emergency ID</span>
			</p>

			<div class="flex flex-col gap-4">
				<h1
					id="roadid-landing-heading"
					class="text-surface-950-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-6xl"
				>
					Road ID. <span class="text-secondary-700 dark:text-primary-500"
						>Ready when seconds count.</span
					>
				</h1>
				<p
					class="text-surface-700-300 m-0 max-w-2xl text-base leading-relaxed font-medium sm:text-lg"
				>
					Emergency profiles for In Case bracelets—linking medical details, allergies, medications,
					and tap-to-call emergency contacts to a scannable roadside URL.
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-4 pt-2">
				<a
					href="/profile#road-id"
					class="bg-primary-500 text-surface-950 hover:bg-secondary-700 hover:text-surface-50 dark:hover:bg-surface-50 dark:hover:text-surface-950 inline-flex min-h-11 items-center gap-2.5 px-6 py-3 text-sm font-black tracking-wide uppercase transition"
				>
					<span>Manage Emergency ID</span>
					<IconArrowRight class="h-4 w-4" />
				</a>
				<a
					href="/roadid/3feetpls"
					class="border-surface-950-50 text-surface-950-50 hover:bg-secondary-500 hover:border-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center justify-center border-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition"
				>
					See an example profile
				</a>
			</div>
		</div>

		<aside
			class="bg-surface-100-900 text-surface-950-50 border-surface-200-800 border-t-tertiary-500 flex min-w-0 flex-col justify-between gap-5 border-t-4 px-6 py-8 sm:px-10 lg:border-l-2 lg:px-10 lg:py-10"
			aria-labelledby="roadid-update-heading"
		>
			{#if currentUser}
				<div class="flex flex-col gap-3">
					<span
						class="bg-primary-500 text-surface-950 self-start px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
					>
						Your Emergency ID
					</span>
					<h2
						id="roadid-update-heading"
						class="text-surface-950-50! m-0 text-2xl leading-tight font-black uppercase italic"
					>
						Rider Safety &amp; Linked Bracelets
					</h2>
					<p class="text-surface-800-200 m-0 text-sm leading-relaxed">
						Edit your blood type, allergies, medications, emergency contacts, and backup vector QR
						stickers in your unified profile.
						{#if safetySummary}
							Currently saved:
							<strong class="text-surface-950-50">
								{safetySummary.emergency_contact_count}
								{safetySummary.emergency_contact_count === 1 ? 'contact' : 'contacts'}
							</strong>{safetySummary.blood_type
								? ` · Blood type ${safetySummary.blood_type}`
								: ''}.
						{/if}
					</p>

					{#if claimedCodes.length > 0}
						<div class="flex flex-col gap-2 pt-1">
							<p
								class="text-secondary-700 dark:text-primary-500 m-0 text-xs font-bold tracking-[0.2em] uppercase"
							>
								Linked bracelet previews ({claimedCodes.length})
							</p>
							<div class="flex flex-wrap gap-2">
								{#each claimedCodes as code (code)}
									<a
										href={`/roadid/${encodeURIComponent(code)}`}
										class="border-surface-950-50 bg-surface-50-950 text-surface-950-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center gap-2 border-2 px-3.5 py-2 text-xs font-black tracking-wider uppercase transition"
									>
										<span>Preview /roadid/{code}</span>
										<IconExternalLink class="h-3.5 w-3.5 shrink-0" />
									</a>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<p
					class="border-surface-200-800 text-surface-700-300 m-0 border-t pt-3 text-xs leading-relaxed"
				>
					<strong class="text-tertiary-700 dark:text-tertiary-500 uppercase"
						>Production Update:</strong
					>
					New wristband orders are paused while we evaluate tariff impacts. Existing bracelets and printable
					QR stickers stay fully supported.
				</p>
			{:else}
				<div class="flex flex-col gap-3">
					<span
						class="bg-tertiary-500 text-surface-950 self-start px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
					>
						Important Update
					</span>
					<h2
						id="roadid-update-heading"
						class="text-surface-950-50! m-0 text-2xl leading-tight font-black uppercase italic"
					>
						New wristband orders paused
					</h2>
					<ul
						class="text-surface-800-200 m-0 list-inside list-disc space-y-2 pl-1 text-sm leading-relaxed"
					>
						<li>
							<strong class="text-surface-950-50">New orders paused</strong> while we evaluate tariff
							impacts
						</li>
						<li>Existing bracelets &amp; profiles stay fully supported</li>
						<li>Print backup vector QR stickers anytime from your Emergency ID workspace</li>
						<li>We’ll post updates as soon as production resumes</li>
					</ul>
				</div>

				<button
					type="button"
					class="border-surface-950-50 text-surface-950-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center justify-center gap-2 self-start border-2 px-5 py-2.5 text-xs font-black tracking-wider uppercase transition"
					onclick={(event) => {
						event.stopPropagation();
						window.dispatchEvent(
							new CustomEvent('open-login', {
								detail: {
									returnTo: '/roadid',
									message: 'Sign in to view your linked bracelets and manage your Emergency ID.'
								}
							})
						);
					}}
				>
					<IconUserCircle2 class="h-4 w-4" />
					Rider Sign In
				</button>
			{/if}
		</aside>
	</section>

	<!-- ABOUT & HOW TO USE -->
	<section
		class="bg-surface-50-950 border-surface-200-800 grid border-b-2 lg:grid-cols-2"
		aria-labelledby="roadid-how-heading"
	>
		<div
			class="lg:border-surface-200-800 flex min-w-0 flex-col gap-5 px-6 py-10 sm:px-10 lg:border-r-2 lg:px-12 lg:py-14"
		>
			<div class="flex items-start gap-4">
				<span
					class="text-tertiary-700 dark:text-tertiary-500 text-4xl leading-none font-black italic tabular-nums"
					aria-hidden="true"
				>
					01
				</span>
				<div>
					<p
						class="text-secondary-700 dark:text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
					>
						Overview
					</p>
					<h2 class="text-surface-950-50! m-0 text-3xl font-black uppercase italic">
						What is an In Case Bracelet?
					</h2>
				</div>
			</div>
			<ul
				class="border-surface-200-800 text-surface-800-200 m-0 list-inside list-disc space-y-2.5 border-t pt-5 text-base leading-relaxed"
			>
				<li>Durable silicone wristband with a unique QR code</li>
				<li>Scan with any phone camera to open your roadside responder screen</li>
				<li>Shows blood type, allergies, medications, and tap-to-call emergency contacts</li>
				<li>Enables first responders and fellow riders to act quickly and accurately</li>
			</ul>
		</div>

		<div class="flex min-w-0 flex-col gap-5 px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
			<div class="flex items-start gap-4">
				<span
					class="text-tertiary-700 dark:text-tertiary-500 text-4xl leading-none font-black italic tabular-nums"
					aria-hidden="true"
				>
					02
				</span>
				<div>
					<p
						class="text-secondary-700 dark:text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase"
					>
						Setup &amp; Management
					</p>
					<h2
						id="roadid-how-heading"
						class="text-surface-950-50! m-0 text-3xl font-black uppercase italic"
					>
						How to Use
					</h2>
				</div>
			</div>
			<div
				class="border-surface-200-800 text-surface-800-200 flex flex-col gap-3 border-t pt-5 text-base leading-relaxed"
			>
				<p class="m-0">
					<strong class="text-secondary-700 dark:text-primary-500">1. Claim your bracelet:</strong>
					Scan a new wristband or enter its code directly inside
					<a
						href="/profile#road-id"
						class="text-secondary-700 dark:text-primary-500 font-bold underline"
						>Emergency ID on your profile</a
					>.
				</p>
				<p class="m-0">
					<strong class="text-secondary-700 dark:text-primary-500"
						>2. Complete medical details:</strong
					>
					Update emergency overrides, allergies, medications, and contacts in one place—and link spare
					bands or print backup QR stickers.
				</p>
				<p class="m-0">
					<strong class="text-secondary-700 dark:text-primary-500"
						>3. Instant roadside access:</strong
					>
					Scanning your band opens the fast read-only responder card immediately.
				</p>
			</div>
		</div>
	</section>

	<!-- SAFETY REFERENCES -->
	<section
		class="bg-surface-50-950 flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-12 lg:py-14"
		aria-labelledby="roadid-resources-heading"
	>
		<h2
			id="roadid-resources-heading"
			class="text-surface-950-50! m-0 text-2xl font-black uppercase italic sm:text-3xl"
		>
			Roadside Safety Reference
		</h2>
		<details class="border-surface-700-300 bg-surface-50-950 text-surface-950-50 border-2">
			<summary class="text-surface-950-50 cursor-pointer px-4 py-2 font-bold pointer-coarse:py-3">
				Crash response checklist
			</summary>
			<div class="px-4 pb-4">
				<div class="mt-4">
					<CrashResponse />
				</div>
			</div>
		</details>
		<details class="border-surface-700-300 bg-surface-50-950 text-surface-950-50 border-2">
			<summary class="text-surface-950-50 cursor-pointer px-4 py-2 font-bold pointer-coarse:py-3">
				Cycling safety tips
			</summary>
			<div class="px-4 pb-4">
				<div class="mt-4">
					<AlertSystem />
				</div>
			</div>
		</details>
	</section>
</div>
