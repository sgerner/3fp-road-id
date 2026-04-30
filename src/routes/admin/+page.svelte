<script>
	import IconActivity from '@lucide/svelte/icons/activity';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
</script>

<svelte:head>
	<title>Admin Dashboard | 3FP</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:py-12">
	<header class="space-y-1">
		<h1 class="h1">Admin Dashboard</h1>
		<p class="text-surface-600-400">Select an admin tool to manage the platform.</p>
	</header>

	<div class="grid gap-4 sm:grid-cols-2">
		<a
			href="/admin/groups/health"
			class="card preset-tonal-surface hover:preset-tonal-primary group flex items-start gap-4 p-5 transition-all duration-500"
		>
			<div
				class="preset-filled-primary-500 rounded-token flex h-11 w-11 shrink-0 items-center justify-center"
			>
				<IconActivity class="h-5 w-5" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-lg font-bold">Group Health</h2>
					<IconChevronRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
				</div>
				<p class="mt-1 text-sm">Monitor claimed groups, track activity, and platform engagement.</p>
			</div>
		</a>

		<a
			href="/admin/rides/import"
			class="card preset-tonal-surface hover:preset-tonal-secondary group flex items-start gap-4 p-5 transition-all duration-500"
		>
			<div
				class="preset-filled-secondary-500 rounded-token flex h-11 w-11 shrink-0 items-center justify-center"
			>
				<IconUpload class="h-5 w-5" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-lg font-bold">Ride Import</h2>
					<IconChevronRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
				</div>
				<p class="mt-1 text-sm">Batch import rides from external JSON sources.</p>
			</div>
		</a>

		<a
			href="/admin/outreach/unclaimed"
			class="card preset-tonal-surface hover:preset-tonal-tertiary group flex flex-col gap-4 p-5 transition-all duration-500 sm:col-span-2 md:flex-row md:items-start"
		>
			<div
				class="preset-filled-tertiary-500 rounded-token flex h-11 w-11 shrink-0 items-center justify-center"
			>
				<IconSparkles class="h-5 w-5" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-lg font-bold">Outreach &amp; Enrichment</h2>
					<IconChevronRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
				</div>
				<p class="mt-1 text-sm">
					Reach out to unclaimed groups and enrich profiles to find contact details.
				</p>
			</div>
		</a>
	</div>
</div>
