<script>
	import IconActivity from '@lucide/svelte/icons/activity';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconUsers from '@lucide/svelte/icons/users';

	const sections = [
		{
			title: 'Groups',
			description: 'Group health, curation, and outreach tools.',
			accent: 'primary',
			tools: [
				{
					label: 'Group Health',
					href: '/admin/groups/health',
					description:
						'Monitor claimed groups, track activity, and spot groups that need attention.',
					icon: IconActivity,
					accent: 'primary'
				},
				{
					label: 'Outreach & Enrichment',
					href: '/admin/groups/outreach',
					description: 'Reach out to unclaimed groups and enrich profiles to find contact details.',
					icon: IconSparkles,
					accent: 'tertiary'
				}
			]
		},
		{
			title: 'Rides',
			description: 'Ride import and ride operations tools.',
			accent: 'secondary',
			tools: [
				{
					label: 'Ride Import',
					href: '/admin/rides/import',
					description:
						'Batch import rides from external JSON sources and clean them up before publishing.',
					icon: IconUpload,
					accent: 'secondary'
				}
			]
		}
	];

	const accentStyles = {
		primary: 'preset-filled-primary-500',
		secondary: 'preset-filled-secondary-500',
		tertiary: 'preset-filled-tertiary-500'
	};
</script>

<svelte:head>
	<title>Admin Dashboard | 3FP</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:py-12">
	<header class="space-y-1">
		<div class="flex items-center gap-2">
			<IconUsers class="text-primary-500 h-6 w-6" />
			<h1 class="h1">Admin Dashboard</h1>
		</div>
		<p class="text-surface-700-300">
			Everything is grouped on one page so you can see the full admin surface at a glance.
		</p>
	</header>

	{#each sections as section}
		<section class="space-y-3">
			<div class="flex items-end justify-between gap-4">
				<div>
					<h2 class="h4">{section.title}</h2>
					<p class="text-surface-700-300 text-sm">{section.description}</p>
				</div>
				<span
					class={'rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase ' +
						accentStyles[section.accent]}
				>
					{section.tools.length} tool{section.tools.length === 1 ? '' : 's'}
				</span>
			</div>

			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each section.tools as tool}
					{@const Icon = tool.icon}
					<a
						href={tool.href}
						class="card preset-tonal-surface hover:preset-tonal-surface group flex items-start gap-4 p-5 transition-all duration-500"
					>
						<div
							class={'rounded-token flex h-11 w-11 shrink-0 items-center justify-center ' +
								accentStyles[tool.accent]}
						>
							<Icon class="h-5 w-5" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center justify-between gap-2">
								<h3 class="text-lg font-bold">{tool.label}</h3>
								<IconChevronRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
							</div>
							<p class="text-surface-700-300 mt-1 text-sm">{tool.description}</p>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>
