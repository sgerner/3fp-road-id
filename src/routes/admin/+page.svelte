<script>
	import IconUsers from '@lucide/svelte/icons/users';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';

	const categories = [
		{
			id: 'groups',
			label: 'Groups',
			description: 'Health, moderation, and group curation tools.',
			href: '/admin/groups',
			icon: IconUsers,
			accent: 'primary'
		},
		{
			id: 'rides',
			label: 'Rides',
			description: 'Ride import and ride operations tools.',
			href: '/admin/rides',
			icon: IconUpload,
			accent: 'secondary'
		},
		{
			id: 'outreach',
			label: 'Outreach',
			description: 'Unclaimed group outreach and enrichment tools.',
			href: '/admin/outreach',
			icon: IconSparkles,
			accent: 'tertiary'
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

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:py-12">
	<header class="space-y-1">
		<h1 class="h1">Admin Dashboard</h1>
		<p class="text-surface-700-300">Select a category to find the tools inside it.</p>
	</header>

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each categories as category}
			{@const Icon = category.icon}
			<a
				href={category.href}
				class="card preset-tonal-surface hover:preset-tonal-surface group flex items-start gap-4 p-5 transition-all duration-500"
			>
				<div
					class={'rounded-token flex h-11 w-11 shrink-0 items-center justify-center ' +
						accentStyles[category.accent]}
				>
					<Icon class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center justify-between gap-2">
						<h2 class="text-lg font-bold">{category.label}</h2>
						<IconChevronRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
					</div>
					<p class="text-surface-700-300 mt-1 text-sm">{category.description}</p>
				</div>
			</a>
		{/each}
	</div>
</div>
