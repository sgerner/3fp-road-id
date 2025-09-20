<svelte:head>
	<title>Volunteer Hub</title>
</svelte:head>

<section class="mx-auto max-w-5xl space-y-12 px-4 py-12">
	<header class="space-y-4">
		<h1 class="text-secondary-100 text-3xl font-bold">Volunteer Opportunities</h1>
		<p class="text-surface-200">
			Browse, build, and rally community support for every kind of bike-powered gathering. Host
			teams can draft events, line up volunteer roles, and keep everyone in the loop from one place.
		</p>
	</header>

	<div class="grid gap-8 md:grid-cols-2">
		<article
			class="border-surface-400/20 bg-surface-900/60 space-y-3 rounded-xl border p-6 shadow-lg"
		>
			<h2 class="text-secondary-100 text-xl font-semibold">Plan a volunteer event</h2>
			<p class="text-surface-200 text-sm">
				Spin up a new ride, workshop, fundraiser, or outreach effort. Configure opportunities,
				shifts, and communications tailored to your crew.
			</p>
			<a
				href="/volunteer/new"
				class="bg-secondary-500 text-surface-900 hover:bg-secondary-400 inline-flex w-max items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition"
			>
				Start a volunteer event
			</a>
		</article>

		<article
			class="border-surface-400/20 bg-surface-900/60 space-y-3 rounded-xl border p-6 shadow-lg"
		>
			<h2 class="text-secondary-100 text-xl font-semibold">Coming soon</h2>
			<ul class="text-surface-200 list-disc space-y-2 pl-5 text-sm">
				<li>Public directory of upcoming volunteer opportunities</li>
				<li>Self-serve volunteer signups with shift confirmations</li>
				<li>Host dashboards for roster management and reminders</li>
			</ul>
		</article>
	</div>
</section>
