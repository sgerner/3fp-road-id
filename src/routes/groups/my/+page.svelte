<script>
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconCrown from '@lucide/svelte/icons/crown';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import { fade } from 'svelte/transition';

	const { data } = $props();
	const ownedGroups = $derived((data?.ownedGroups ?? []).filter((group) => group?.slug));
	const groupCount = $derived(ownedGroups.length);
</script>

<svelte:head>
	<title>My Groups · 3 Feet Please</title>
	<meta name="description" content="Manage your cycling groups and communities." />
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<section
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]"
		aria-labelledby="my-groups-heading"
	>
		<div
			class="flex flex-col justify-between gap-10 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<p
				class="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<IconCrown class="h-4 w-4" />
				<span>Owner Dashboard · My Groups</span>
			</p>

			<div class="flex flex-col gap-6">
				<h1
					id="my-groups-heading"
					class="text-surface-950! m-0 text-[clamp(2.9rem,7.2vw,6.5rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					Your communities.<br />
					<span class="text-secondary-500">Your leadership.</span>
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium text-balance sm:text-2xl">
					Manage the groups you own, update details, respond to member inquiries, and grow your
					cycling community.
				</p>
			</div>
		</div>

		<div
			class="bg-secondary-500 text-surface-50 relative flex flex-col justify-between gap-8 px-6 py-10 pl-16 sm:px-10 sm:pl-22 lg:py-14"
		>
			<!-- Signature: the 3-foot ruler -->
			<div
				class="bg-tertiary-500 text-surface-950 absolute inset-y-0 left-0 flex w-12 flex-col items-center justify-between py-4 sm:w-16"
				aria-hidden="true"
			>
				<span class="text-lg leading-none font-black italic sm:text-2xl">3FT</span>
				<span
					class="my-4 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
				></span>
				<span class="text-lg leading-none font-black italic sm:text-2xl">0</span>
			</div>

			<div class="flex flex-col gap-3">
				<div
					class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconUsers class="h-4 w-4" />
					Groups Owned
				</div>
				<div
					class="text-primary-500 text-7xl leading-[0.82] font-black italic tabular-nums sm:text-8xl"
				>
					{String(groupCount).padStart(2, '0')}
				</div>
			</div>

			<div class="border-surface-50/30 flex flex-col gap-4 border-t-2 pt-6">
				<div
					class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					<IconSparkles class="h-4 w-4" />
					Quick Actions
				</div>

				<div class="flex flex-col gap-3 sm:flex-row lg:flex-col">
					<a
						class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center justify-center gap-2 px-6 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline"
						href="/groups/new"
					>
						<IconPlus class="h-4 w-4" />
						Create New Group
					</a>
					<a
						class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-secondary-500 inline-flex items-center justify-center gap-2 border-[3px] px-6 py-4 text-sm font-black tracking-wide uppercase transition hover:no-underline"
						href="/groups"
					>
						Browse All Groups
						<IconArrowRight class="h-4 w-4" />
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- GROUP LISTINGS -->
	<section
		class="bg-surface-950 text-surface-50 px-6 py-12 sm:px-10 lg:px-14 lg:py-16"
		aria-labelledby="managed-groups-heading"
	>
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div class="flex flex-col gap-2">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					Your Communities
				</p>
				<h2
					id="managed-groups-heading"
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
				>
					Managed Groups
				</h2>
			</div>
			<p class="text-surface-300 m-0 text-sm font-bold tracking-[0.15em] uppercase tabular-nums">
				{groupCount} group{groupCount === 1 ? '' : 's'}
			</p>
		</div>

		<!-- Lane divider -->
		<div
			class="my-8 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)] lg:my-10"
			aria-hidden="true"
		></div>

		{#if ownedGroups.length === 0}
			<!-- Empty state -->
			<div
				class="border-surface-50 flex flex-col gap-6 border-t-2 pt-10"
				in:fade={{ duration: 200 }}
			>
				<div class="bg-tertiary-500 text-surface-950 flex h-16 w-16 items-center justify-center">
					<IconUsers class="h-8 w-8" />
				</div>
				<div class="flex max-w-xl flex-col gap-3">
					<h3 class="text-surface-50! m-0 text-3xl font-black uppercase italic">
						No owned groups yet
					</h3>
					<p class="text-surface-300 m-0 text-lg leading-relaxed">
						Create a new group to connect with riders in your area, or ask a group owner to add you
						as a manager.
					</p>
				</div>
				<div class="flex flex-wrap gap-3">
					<a
						href="/groups"
						class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 inline-flex items-center gap-2 border-2 px-6 py-3 font-black uppercase transition hover:no-underline"
					>
						Browse Groups
					</a>
					<a
						href="/groups/new"
						class="bg-primary-500 text-surface-950 hover:bg-primary-400 inline-flex items-center gap-2 px-6 py-3 font-black uppercase transition hover:no-underline"
					>
						<IconPlus class="h-4 w-4" />
						Create Group
					</a>
				</div>
			</div>
		{:else}
			<!-- Groups grid -->
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
				{#each ownedGroups as group, i (group.id ?? group.slug)}
					<div
						class="border-surface-800 bg-surface-900 flex flex-col justify-between border-2"
						in:fade={{ duration: 240, delay: i * 60 }}
					>
						<div>
							<!-- Cover image area -->
							<div
								class="bg-secondary-500 border-surface-800 relative aspect-[16/9] w-full overflow-hidden border-b-2"
							>
								{#if group.cover_photo_url}
									<img
										src={group.cover_photo_url}
										alt="{group.name} cover"
										loading="lazy"
										class="absolute inset-0 h-full w-full object-cover"
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center">
										<span
											class="text-primary-500/30 text-7xl leading-none font-black italic select-none"
											aria-hidden="true"
										>
											3FT
										</span>
									</div>
								{/if}

								<span
									class="bg-surface-950 text-tertiary-500 absolute top-0 left-0 px-3 py-1.5 text-sm font-black italic tabular-nums"
								>
									{String(i + 1).padStart(2, '0')}
								</span>
							</div>

							<!-- Identity + tagline -->
							<div class="flex flex-col gap-4 p-5">
								<div class="flex items-start gap-4">
									<div
										class="bg-surface-50 text-surface-950 flex h-14 w-14 shrink-0 items-center justify-center p-1.5"
									>
										{#if group.logo_url}
											<img
												src={group.logo_url}
												alt="{group.name} logo"
												loading="lazy"
												class="h-full w-full object-contain"
											/>
										{:else}
											<IconUsers class="h-6 w-6" />
										{/if}
									</div>

									<div class="min-w-0 flex-1">
										<h3
											class="text-surface-50! m-0 truncate text-xl leading-tight font-black uppercase"
										>
											{group.name ?? 'Untitled group'}
										</h3>
										<p
											class="text-surface-300 m-0 mt-1 flex items-center gap-1 truncate text-xs font-bold tracking-[0.12em] uppercase"
										>
											<IconMapPin class="h-3.5 w-3.5 shrink-0" />
											{#if group.city}{group.city},{/if}
											{group.state_region}
											{#if group.state_region && group.country}·{/if}
											{group.country}
										</p>
									</div>
								</div>

								{#if group.tagline}
									<p class="text-surface-200 m-0 line-clamp-2 text-sm leading-relaxed">
										{group.tagline}
									</p>
								{:else}
									<p class="text-surface-400 m-0 text-sm leading-relaxed italic">
										No tagline set — add one in the group settings
									</p>
								{/if}
							</div>
						</div>

						<!-- Actions -->
						<div class="border-surface-800 grid grid-cols-2 border-t-2">
							<a
								class="border-surface-800 text-surface-50 hover:bg-secondary-500 flex items-center justify-center gap-2 border-r py-3.5 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline"
								href={`/groups/${group.slug}`}
							>
								<IconExternalLink class="h-3.5 w-3.5" />
								View
							</a>
							<a
								class="bg-primary-500 text-surface-950 hover:bg-tertiary-500 flex items-center justify-center gap-2 py-3.5 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline"
								href={`/groups/${group.slug}/manage`}
							>
								<IconSquarePen class="h-3.5 w-3.5" />
								Manage
							</a>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
