<script>
	import IconActivity from '@lucide/svelte/icons/activity';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconUpload from '@lucide/svelte/icons/upload';
	import IconPenTool from '@lucide/svelte/icons/pen-tool';
	import IconUserCog from '@lucide/svelte/icons/user-cog';
	import AdminHero from '#lib/components/admin/AdminHero.svelte';

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
			title: 'Branding & Workspace',
			description: 'Email identity and Google Workspace account lifecycle tools.',
			accent: 'tertiary',
			tools: [
				{
					label: 'Email Signature Builder',
					href: '/admin/signature',
					description:
						'Generate polished HTML signatures with optional contact rows and locked-in brand links.',
					icon: IconPenTool,
					accent: 'tertiary'
				},
				{
					label: 'Email User Admin',
					href: '/admin/workspace',
					description:
						'Create, update, suspend, reset passwords, and manage aliases for Workspace users.',
					icon: IconUserCog,
					accent: 'secondary'
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

	// Full class names so Tailwind can see them. Violet takes light text; lemon and magenta take dark.
	const ACCENTS = {
		primary: {
			tag: 'bg-primary-500 text-surface-950',
			tile: 'bg-primary-500 text-surface-950 group-hover:bg-surface-950 group-hover:text-primary-500 group-focus-visible:bg-surface-950 group-focus-visible:text-primary-500',
			row: 'hover:bg-primary-500 hover:text-surface-950 focus-visible:bg-primary-500 focus-visible:text-surface-950'
		},
		secondary: {
			tag: 'bg-secondary-500 text-surface-50',
			tile: 'bg-secondary-500 text-surface-50 group-hover:bg-surface-50 group-hover:text-secondary-500 group-focus-visible:bg-surface-50 group-focus-visible:text-secondary-500',
			row: 'hover:bg-secondary-500 hover:text-surface-50 focus-visible:bg-secondary-500 focus-visible:text-surface-50'
		},
		tertiary: {
			tag: 'bg-tertiary-500 text-surface-950',
			tile: 'bg-tertiary-500 text-surface-950 group-hover:bg-surface-950 group-hover:text-tertiary-500 group-focus-visible:bg-surface-950 group-focus-visible:text-tertiary-500',
			row: 'hover:bg-tertiary-500 hover:text-surface-950 focus-visible:bg-tertiary-500 focus-visible:text-surface-950'
		}
	};
</script>

<svelte:head>
	<title>Admin Dashboard | 3FP</title>
</svelte:head>

<AdminHero eyebrow="Admin" title="Admin Dashboard">
	Everything is grouped on one page so you can see the full admin surface at a glance.
</AdminHero>

{#each sections as section, index (section.title)}
	<section
		class="border-surface-800 grid border-b-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] {index %
			2 ===
		0
			? 'bg-surface-950'
			: 'bg-surface-900'}"
		aria-labelledby="admin-section-{index}"
	>
		<div class="flex flex-col gap-4 px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
			<div class="flex items-start gap-4">
				<span
					class="text-tertiary-500 text-4xl leading-none font-black italic tabular-nums sm:text-5xl"
					aria-hidden="true"
				>
					{String(index + 1).padStart(2, '0')}
				</span>
				<div class="flex flex-col items-start gap-2">
					<p
						class="{ACCENTS[section.accent]
							.tag} m-0 px-2.5 py-0.5 text-xs font-black tracking-[0.2em] uppercase"
					>
						{section.tools.length} tool{section.tools.length === 1 ? '' : 's'}
					</p>
					<h2
						id="admin-section-{index}"
						class="m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-4xl"
					>
						{section.title}
					</h2>
				</div>
			</div>
			<p class="text-surface-300 m-0 max-w-md text-base leading-snug font-medium">
				{section.description}
			</p>
		</div>

		<ul
			class="border-surface-800 m-0 flex list-none flex-col border-t-2 p-0 lg:border-t-0 lg:border-l-2"
		>
			{#each section.tools as tool (tool.href)}
				{@const Icon = tool.icon}
				<li class="border-surface-800 border-b last:border-b-0">
					<a
						href={tool.href}
						class="group flex items-center gap-4 px-6 py-6 transition sm:px-10 lg:px-12 {ACCENTS[
							tool.accent
						].row}"
					>
						<span
							class="{ACCENTS[tool.accent]
								.tile} flex h-12 w-12 shrink-0 items-center justify-center transition"
							aria-hidden="true"
						>
							<Icon class="h-6 w-6" />
						</span>
						<span class="min-w-0 flex-1">
							<h3 class="m-0 text-xl leading-tight text-inherit!">{tool.label}</h3>
							<span
								class="text-surface-300 mt-1 block text-sm leading-snug font-medium group-hover:text-inherit group-focus-visible:text-inherit"
							>
								{tool.description}
							</span>
						</span>
						<IconArrowUpRight
							class="h-6 w-6 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
							aria-hidden="true"
						/>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/each}
