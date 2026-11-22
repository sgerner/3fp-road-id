<script>
	import IconContact from '@lucide/svelte/icons/contact';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconHeartPulse from '@lucide/svelte/icons/heart-pulse';
	import IconUserCircle2 from '@lucide/svelte/icons/user-circle-2';
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
		content="Emergency Road ID bracelets, crash response checklists, cycling safety tips, and rider safety profile links."
	/>
</svelte:head>

<div
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-x-clip"
>
	<!-- HERO -->
	<section
		class="bg-surface-950 text-surface-50 border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"
		aria-labelledby="roadid-landing-heading"
	>
		<div
			class="border-primary-500 flex min-w-0 flex-col justify-between gap-5 border-l-4 px-6 py-8 sm:px-10 lg:px-12 lg:py-10"
		>
			<p
				class="text-primary-500 m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
				<IconContact class="h-4 w-4" />
				<span>Road ID · Emergency Tools</span>
			</p>

			<div class="flex flex-col gap-3">
				<h1
					id="roadid-landing-heading"
					class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
				>
					Emergency profiles for <span class="text-primary-500">In Case bracelets.</span>
				</h1>
				<p class="text-surface-300 m-0 max-w-2xl text-base leading-snug font-medium">
					Fast roadside medical summaries, emergency contacts, crash response steps, and everyday
					cycling safety habits.
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-3">
				<a
					class="border-surface-500 text-surface-50 hover:border-primary-500 hover:text-primary-500 inline-flex min-h-11 items-center gap-2 border-2 px-4 py-2.5 text-xs font-black tracking-[0.18em] uppercase transition"
					href="/roadid/3feetpls"
				>
					See an example profile
					<IconExternalLink class="h-3.5 w-3.5" />
				</a>
			</div>
		</div>

		<div
			class="bg-surface-900 text-surface-50 border-surface-800 border-t-secondary-500 flex min-w-0 flex-col justify-between gap-5 border-t-4 px-6 py-7 sm:px-10 lg:border-l-2 lg:px-10 lg:py-8"
		>
			{#if currentUser}
				<div class="flex flex-col gap-3">
					<span
						class="bg-primary-500 text-surface-950 self-start px-2.5 py-0.5 text-xs font-black tracking-[0.2em] uppercase"
					>
						Rider Safety Workspace
					</span>
					<h2 class="text-surface-50! m-0 text-2xl leading-none font-black uppercase italic">
						Your Road ID &amp; Safety Settings
					</h2>
					<p class="text-surface-300 m-0 text-sm leading-relaxed">
						Edit your blood type, allergies, medications, and emergency contacts in your unified
						profile.
						{#if safetySummary}
							Currently saved:
							<strong class="text-surface-50">
								{safetySummary.emergency_contact_count}
								{safetySummary.emergency_contact_count === 1 ? 'contact' : 'contacts'}
							</strong>{safetySummary.blood_type
								? ` · Blood type ${safetySummary.blood_type}`
								: ''}.
						{/if}
					</p>

					{#if claimedCodes.length > 0}
						<div class="flex flex-col gap-2 pt-1">
							<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.2em] uppercase">
								Claimed bracelet previews ({claimedCodes.length})
							</p>
							<div class="flex flex-wrap gap-2">
								{#each claimedCodes as code (code)}
									<a
										href={`/roadid/${encodeURIComponent(code)}`}
										class="border-primary-500 bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-11 items-center gap-2 border-2 px-3.5 py-2 text-xs font-black tracking-wider uppercase transition"
									>
										<span>Preview /roadid/{code}</span>
										<IconExternalLink class="h-3.5 w-3.5 shrink-0" />
									</a>
								{/each}
							</div>
						</div>
					{:else}
						<p class="text-surface-300 m-0 text-xs leading-relaxed">
							No claimed bracelets yet. Save your safety details in Profile now, or scan an
							unclaimed In Case bracelet QR code to link it.
						</p>
					{/if}
				</div>

				<a
					href="/profile#safety"
					class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center justify-center gap-2 self-start px-5 py-2.5 text-sm font-black tracking-wide uppercase transition"
				>
					<IconHeartPulse class="h-4 w-4" />
					Edit Safety &amp; Road ID in Profile
				</a>
			{:else}
				<div class="flex flex-col gap-3">
					<span
						class="bg-primary-500 text-surface-950 self-start px-2.5 py-0.5 text-xs font-black tracking-[0.2em] uppercase"
					>
						Rider Access
					</span>
					<h2 class="text-surface-50! m-0 text-2xl leading-none font-black uppercase italic">
						Manage your safety profile &amp; bracelets
					</h2>
					<p class="text-surface-300 m-0 text-sm leading-relaxed">
						Sign in right here to view your claimed bracelet previews and update your medical notes
						and emergency contacts.
					</p>
				</div>
				<button
					type="button"
					class="bg-primary-500 text-surface-950 hover:bg-secondary-500 hover:text-surface-50 inline-flex min-h-11 items-center justify-center gap-2 self-start px-5 py-2.5 text-sm font-black tracking-wide uppercase transition"
					onclick={(event) => {
						event.stopPropagation();
						window.dispatchEvent(
							new CustomEvent('open-login', {
								detail: {
									returnTo: '/roadid',
									message: 'Sign in to view your claimed bracelets and manage your safety details.'
								}
							})
						);
					}}
				>
					<IconUserCircle2 class="h-4 w-4" />
					Log in / Register
				</button>
			{/if}
		</div>
	</section>

	<!-- INFO BANDS -->
	<section class="bg-surface-950 border-surface-800 grid border-b-2 lg:grid-cols-3">
		<div
			class="border-surface-800 flex flex-col gap-4 border-b p-6 sm:px-10 sm:py-8 lg:border-r lg:border-b-0"
		>
			<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
				01 · Overview
			</p>
			<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">
				What is an In Case Bracelet?
			</h2>
			<ul class="text-surface-200 m-0 list-inside list-disc space-y-2 text-sm leading-relaxed">
				<li>Durable silicone wristband with a unique QR code</li>
				<li>Scan with a phone camera to open the emergency summary</li>
				<li>Shows emergency contacts and critical medical notes</li>
				<li>Enables first responders to act quickly and accurately</li>
			</ul>
		</div>

		<div
			class="border-surface-800 bg-surface-900 border-t-tertiary-500 flex flex-col gap-4 border-t-4 border-b p-6 sm:px-10 sm:py-8 lg:border-r lg:border-b-0"
		>
			<p class="text-tertiary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
				02 · Production Notice
			</p>
			<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">Important Update</h2>
			<ul class="text-surface-200 m-0 list-inside list-disc space-y-2 text-sm leading-relaxed">
				<li>
					<strong class="text-surface-50">New orders paused</strong> while we evaluate tariff impacts
				</li>
				<li>Existing bracelets and rider safety profiles stay fully supported</li>
				<li>We’ll post updates as soon as production resumes</li>
			</ul>
		</div>

		<div class="flex flex-col gap-4 p-6 sm:px-10 sm:py-8">
			<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
				03 · How to Use
			</p>
			<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">Scan, Claim, Ride</h2>
			<div class="text-surface-200 flex flex-col gap-2.5 text-sm leading-relaxed">
				<p class="m-0">
					<strong>1. Scan:</strong> Scan an In Case bracelet QR code to open its roadside emergency page
					or claim an unclaimed code.
				</p>
				<p class="m-0">
					<strong>2. Edit in Profile:</strong> Save your name, phone, blood type, allergies, medications,
					and emergency contacts in your profile safety section.
				</p>
				<p class="m-0">
					<strong>3. Ready:</strong> Your read-only summary is immediately available to first responders
					on scan.
				</p>
			</div>
		</div>
	</section>

	<!-- RESPONDER TOOLS -->
	<section
		class="bg-surface-950 flex flex-col gap-6 px-6 py-10 sm:px-10 lg:px-14 lg:py-14"
		aria-labelledby="responder-tools-heading"
	>
		<div class="flex flex-col gap-1">
			<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
				Roadside Responder Resources
			</p>
			<h2
				id="responder-tools-heading"
				class="text-surface-50! m-0 text-3xl leading-[0.94] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
			>
				Checklists &amp; safety tips
			</h2>
		</div>

		<details class="border-surface-500 bg-surface-900 border-2 p-4 sm:p-6">
			<summary class="flex min-h-11 cursor-pointer items-center text-base font-black uppercase">
				Crash response checklist
			</summary>
			<div class="mt-4">
				<CrashResponse />
			</div>
		</details>

		<details class="border-surface-500 bg-surface-900 border-2 p-4 sm:p-6">
			<summary class="flex min-h-11 cursor-pointer items-center text-base font-black uppercase">
				Cycling safety tips
			</summary>
			<div class="mt-4">
				<AlertSystem />
			</div>
		</details>
	</section>
</div>
