<script>
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';

	const tools = [
		{
			label: 'Ride Import',
			href: '/admin/rides/import',
			description:
				'Batch import rides from external JSON sources and clean them up before publishing.',
			icon: IconUpload,
			accent: 'secondary'
		}
	];

	const accentStyles = {
		primary: 'preset-filled-primary-500',
		secondary: 'preset-filled-secondary-500',
		tertiary: 'preset-filled-tertiary-500'
	};
</script>

<svelte:head>
	<title>Rides Admin | 3FP</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:py-12">
	<header class="space-y-1">
		<a href="/admin" class="text-surface-700-300 hover:text-primary-700-300 text-sm"
			>Admin Dashboard</a
		>
		<h1 class="h1">Rides</h1>
		<p class="text-surface-700-300">Tools for importing and managing ride data.</p>
	</header>

	<div class="grid gap-4 sm:grid-cols-2">
		{#each tools as tool}
			{@const Icon = tool.icon}
			<a
				href={tool.href}
				class="card preset-tonal-surface hover:preset-tonal-secondary group flex items-start gap-4 p-5 transition-all duration-500"
			>
				<div
					class={'rounded-token flex h-11 w-11 shrink-0 items-center justify-center ' +
						accentStyles[tool.accent]}
				>
					<Icon class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center justify-between gap-2">
						<h2 class="text-lg font-bold">{tool.label}</h2>
						<IconChevronRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
					</div>
					<p class="text-surface-700-300 mt-1 text-sm">{tool.description}</p>
				</div>
			</a>
		{/each}
	</div>
</div>
