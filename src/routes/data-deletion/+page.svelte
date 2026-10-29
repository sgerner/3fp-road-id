<svelte:head>
	<title>Data Deletion Instructions | 3 Feet Please</title>
	<meta
		name="description"
		content="Instructions for requesting deletion of your 3 Feet Please account and connected social data."
	/>
</svelte:head>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<header
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1fr)_auto]"
		aria-labelledby="data-deletion-heading"
	>
		<div
			class="flex flex-col justify-between gap-6 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<p class="m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase">
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<span>Legal</span>
			</p>
			<div class="flex flex-col gap-4">
				<h1
					id="data-deletion-heading"
					class="text-surface-950! m-0 text-[clamp(2.6rem,6.4vw,5.75rem)] leading-[0.86] font-black tracking-[-0.04em] uppercase italic"
				>
					Data Deletion <span class="text-secondary-500">Instructions</span>
				</h1>
				<p class="m-0 max-w-2xl text-lg leading-snug font-medium sm:text-xl">
					You can request deletion of your data from 3 Feet Please at any time. This page satisfies
					Meta's requirement for Facebook/Instagram-connected apps to provide data deletion
					instructions.
				</p>
			</div>
			<p class="m-0 text-xs font-black tracking-[0.22em] uppercase">Last updated: March 14, 2026</p>
		</div>

		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 hidden w-24 flex-col items-center justify-between border-l-[3px] py-6 lg:flex"
			aria-hidden="true"
		>
			<span class="text-2xl leading-none font-black italic">3FT</span>
			<span
				class="my-4 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
			></span>
			<span class="text-2xl leading-none font-black italic">0</span>
		</div>
	</header>

	<!-- LEGAL SUB-NAV -->
	<nav
		aria-label="Legal documents"
		class="bg-secondary-500 text-surface-50 border-surface-950 flex flex-wrap items-center gap-3 border-y-[3px] px-6 py-4 sm:px-10 lg:px-14"
	>
		<a
			href="/privacy"
			class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-secondary-500 border-2 px-4 py-2 text-xs font-black tracking-[0.18em] uppercase transition hover:no-underline"
		>
			Privacy Policy
		</a>
		<a
			href="/terms"
			class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-secondary-500 border-2 px-4 py-2 text-xs font-black tracking-[0.18em] uppercase transition hover:no-underline"
		>
			Terms of Service
		</a>
		<a
			href="/data-deletion"
			aria-current="page"
			class="bg-primary-500 text-surface-950 px-4 py-2 text-xs font-black tracking-[0.18em] uppercase hover:no-underline"
		>
			Data Deletion
		</a>
	</nav>

	<!-- CLAUSES -->
	<section class="bg-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
		<div class="border-surface-50 flex flex-col border-t-2">
			<div
				class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
			>
				<span
					class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
					aria-hidden="true">01</span
				>
				<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">
					Option 1: Disconnect Connected Social Accounts
				</h2>
				<p class="text-surface-200 m-0 text-base leading-relaxed">
					If you only want to stop Facebook/Instagram publishing access, disconnect your social
					accounts from the Group Social Manager on your claimed group page.
				</p>
			</div>

			<div
				class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
			>
				<span
					class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
					aria-hidden="true">02</span
				>
				<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">
					Option 2: Request Full Data Deletion
				</h2>
				<ol class="text-surface-200 m-0 list-decimal space-y-2 pl-5 text-base leading-relaxed">
					<li>
						Email <a href="mailto:hi@3fp.org" class="text-primary-500 font-bold underline"
							>hi@3fp.org</a
						> from your account email.
					</li>
					<li>Use subject line: "Data Deletion Request".</li>
					<li>
						Include your 3FP account email and, if relevant, the group slug(s) tied to the connected
						social accounts.
					</li>
				</ol>
			</div>

			<div
				class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
			>
				<span
					class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
					aria-hidden="true">03</span
				>
				<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">What We Delete</h2>
				<ul class="text-surface-200 m-0 list-disc space-y-2 pl-5 text-base leading-relaxed">
					<li>
						Stored social access tokens and account connection records for the requested scope.
					</li>
					<li>
						Cached social comments and locally tracked replies associated with those connections.
					</li>
					<li>
						Social post drafts/scheduling history and uploaded social media assets where applicable.
					</li>
					<li>Account/profile data as part of full account deletion requests.</li>
				</ul>
			</div>

			<div
				class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
			>
				<span
					class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
					aria-hidden="true">04</span
				>
				<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">Processing Time</h2>
				<p class="text-surface-200 m-0 text-base leading-relaxed">
					We typically process deletion requests within 30 days and will confirm completion by
					email.
				</p>
			</div>
		</div>
	</section>

	<!-- Ruler band: 0 → 3 ft -->
	<div
		class="bg-tertiary-500 text-surface-950 border-surface-950 grid grid-cols-3 border-t-[3px]"
		aria-hidden="true"
	>
		{#each ['0', '1 ft', '2 ft'] as mark, i (mark)}
			<div class="border-surface-950 relative h-14 border-l-[3px] first:border-l-0">
				<span
					class="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(90deg,var(--color-surface-950)_0_2px,transparent_2px_calc(100%/12))]"
				></span>
				<span class="absolute bottom-2 left-3 text-sm font-black uppercase">{mark}</span>
				{#if i === 2}
					<span class="absolute right-3 bottom-2 text-sm font-black uppercase">3 ft</span>
				{/if}
			</div>
		{/each}
	</div>
</div>
