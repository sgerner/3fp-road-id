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

<div class="my-groups-page mx-auto flex w-full max-w-7xl flex-col gap-10">
	<!-- ═══════════════════════════════════════════════
	     HERO SECTION
	═══════════════════════════════════════════════ -->
	<section class="hero-section relative overflow-hidden rounded-3xl">
		<!-- Animated orb background -->
		<div class="app-orb app-orb-1" aria-hidden="true"></div>
		<div class="app-orb app-orb-2" aria-hidden="true"></div>
		<div class="app-orb app-orb-3" aria-hidden="true"></div>

		<div
			class="relative z-10 grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:p-10"
		>
			<!-- Left: headline -->
			<div class="flex flex-col gap-7">
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip preset-filled-primary-500 gap-1.5 font-semibold tracking-wide">
						<IconCrown class="h-3.5 w-3.5" />
						Owner Dashboard
					</span>
					<span class="chip preset-tonal-secondary">My Groups</span>
				</div>

				<div class="space-y-4">
					<h1
						class="my-groups-headline max-w-2xl text-4xl font-extrabold tracking-tight text-balance lg:text-5xl xl:text-6xl"
					>
						Your communities.<br />
						<span class="my-groups-headline-accent">Your leadership.</span>
					</h1>
					<p class="max-w-xl text-base leading-relaxed opacity-75">
						Manage the groups you own, update details, respond to member inquiries, and grow your
						cycling community.
					</p>
				</div>
			</div>

			<!-- Right: stats + actions -->
			<div class="flex flex-col gap-4">
				<!-- Groups Owned Stat -->
				<div class="stat-card card preset-tonal-surface relative overflow-hidden p-4">
					<div
						class="stat-card-glow"
						style="background: var(--color-primary-500);"
						aria-hidden="true"
					></div>
					<div class="relative z-10 flex items-center justify-between">
						<div>
							<div
								class="mb-1 flex items-center gap-2 text-xs font-medium tracking-[0.2em] uppercase opacity-60"
							>
								<IconUsers class="h-4 w-4" />
								Groups Owned
							</div>
							<div class="text-3xl font-black tabular-nums">{groupCount}</div>
						</div>
						<div class="bg-primary-500/10 flex h-12 w-12 items-center justify-center rounded-xl">
							<IconCrown class="text-primary-500 h-6 w-6" />
						</div>
					</div>
				</div>

				<!-- Quick Actions Panel -->
				<div
					class="search-panel card preset-filled-surface-50-950 flex flex-1 flex-col gap-4 p-5 shadow-xl"
				>
					<div class="space-y-1">
						<div
							class="flex items-center gap-2 text-xs font-semibold tracking-[0.22em] uppercase opacity-60"
						>
							<IconSparkles class="h-4 w-4" />
							Quick Actions
						</div>
					</div>

					<div class="grid gap-2">
						<a class="btn preset-filled-primary-500 gap-2" href="/groups/new">
							<IconPlus class="h-4 w-4" />
							Create New Group
						</a>
						<a class="btn preset-outlined-surface-950-50 gap-2" href="/groups">
							Browse All Groups
							<IconArrowRight class="h-4 w-4" />
						</a>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════
	     GROUP LISTINGS
	═══════════════════════════════════════════════ -->
	<section class="space-y-5">
		<div class="flex items-center justify-between gap-2">
			<div>
				<p class="label opacity-60">Your Communities</p>
				<h2 class="text-2xl font-bold">Managed Groups</h2>
			</div>
			<p class="text-sm tabular-nums opacity-60">
				{groupCount} group{groupCount === 1 ? '' : 's'}
			</p>
		</div>

		{#if ownedGroups.length === 0}
			<!-- Empty state -->
			<div
				class="app-empty-state card preset-tonal-surface relative overflow-hidden p-12 text-center"
				in:fade={{ duration: 200 }}
			>
				<div class="app-empty-orb" aria-hidden="true"></div>
				<div class="relative z-10 mx-auto max-w-lg space-y-4">
					<div
						class="app-empty-icon-ring mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full"
					>
						<IconUsers class="h-10 w-10 opacity-60" />
					</div>
					<h3 class="text-2xl font-bold">No owned groups yet</h3>
					<p class="text-sm leading-relaxed opacity-70">
						Create a new group to connect with riders in your area, or ask a group owner to add you
						as a manager.
					</p>
					<div class="flex flex-wrap justify-center gap-3 pt-2">
						<a href="/groups" class="btn preset-outlined-surface-950-50"> Browse Groups </a>
						<a href="/groups/new" class="btn preset-filled-primary-500 gap-2">
							<IconPlus class="h-4 w-4" />
							Create Group
						</a>
					</div>
				</div>
			</div>
		{:else}
			<!-- Groups grid -->
			<div class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
				{#each ownedGroups as group, i (group.id ?? group.slug)}
					<div
						class="group-identity-card group relative overflow-hidden rounded-2xl"
						in:fade={{ duration: 240, delay: i * 60 }}
					>
						<!-- Accent bar -->
						<div class="group-accent-bar" aria-hidden="true"></div>

						<!-- Card content -->
						<div class="relative z-10 flex flex-col">
							<!-- Cover image area -->
							<div class="relative aspect-[16/9] w-full overflow-hidden">
								{#if group.cover_photo_url}
									<img
										src={group.cover_photo_url}
										alt="{group.name} cover"
										loading="lazy"
										class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
									/>
								{:else}
									<!-- Fallback gradient -->
									<div
										class="from-primary-800/80 to-secondary-700/60 absolute inset-0 bg-gradient-to-br"
									></div>
								{/if}

								<!-- Bottom gradient scrim -->
								<div
									class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent"
								></div>

								<!-- Bottom overlay: logo + name + location -->
								<div class="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
									<!-- Logo -->
									{#if group.logo_url}
										<div class="logo-ring shrink-0">
											<img
												src={group.logo_url}
												alt="{group.name} logo"
												loading="lazy"
												class="h-12 w-12 rounded-xl object-cover md:h-14 md:w-14"
											/>
										</div>
									{:else}
										<div
											class="bg-surface-950-50/20 ring-surface-950-50/20 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-2 backdrop-blur-sm md:h-14 md:w-14"
										>
											<IconUsers class="text-surface-50 h-5 w-5" />
										</div>
									{/if}

									<div class="min-w-0 flex-1">
										<h3
											class="!m-0 truncate text-left text-lg leading-tight font-bold text-white drop-shadow-sm"
										>
											{group.name ?? 'Untitled group'}
										</h3>
										<p class="m-0 mt-0.5 flex items-center gap-1 truncate text-xs text-white/70">
											<IconMapPin class="h-3 w-3 shrink-0" />
											{#if group.city}{group.city},{/if}
											{group.state_region}
											{#if group.state_region && group.country}·{/if}
											{group.country}
										</p>
									</div>
								</div>
							</div>

							<!-- Info section -->
							<div class="flex flex-1 flex-col gap-4 p-4">
								<!-- Tagline -->
								{#if group.tagline}
									<p class="line-clamp-2 text-sm leading-relaxed opacity-75">
										{group.tagline}
									</p>
								{:else}
									<p class="text-sm leading-relaxed italic opacity-50">
										No tagline set — add one in the group settings
									</p>
								{/if}

								<!-- Actions -->
								<div class="mt-auto flex items-center gap-2 pt-2">
									<a
										class="btn btn-sm preset-outlined-primary-500 flex-1 gap-1.5"
										href={`/groups/${group.slug}`}
									>
										<IconExternalLink class="h-3.5 w-3.5" />
										View
									</a>
									<a
										class="btn btn-sm preset-filled-primary-500 flex-1 gap-1.5"
										href={`/groups/${group.slug}/manage`}
									>
										<IconSquarePen class="h-3.5 w-3.5" />
										Manage
									</a>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	/* Hero section styling */
	.hero-section {
		background: color-mix(in oklab, var(--color-primary-500) 12%, var(--color-surface-950) 88%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	/* Headline accent with gradient text */
	.my-groups-headline {
		color: var(--color-primary-50);
		text-align: left;
	}

	.my-groups-headline-accent {
		background: linear-gradient(
			120deg,
			var(--color-primary-300),
			var(--color-secondary-300),
			var(--color-tertiary-300)
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* Stat card with hover effects */
	.stat-card {
		transition:
			transform 200ms ease,
			box-shadow 200ms ease;
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 20%, transparent);
	}

	.stat-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px -4px color-mix(in oklab, var(--color-primary-500) 25%, transparent);
	}

	.stat-card-glow {
		position: absolute;
		inset: 0;
		opacity: 0.08;
		pointer-events: none;
	}

	/* Search/actions panel */
	.search-panel {
		backdrop-filter: blur(12px);
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	/* Group Identity Cards */
	.group-identity-card {
		background: color-mix(in oklab, var(--color-surface-900) 95%, var(--color-primary-500) 5%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 18%, transparent);
		animation: card-in 380ms ease both;
		animation-delay: calc(var(--stagger, 0) * 60ms);
		transition:
			transform 200ms ease,
			box-shadow 200ms ease,
			border-color 200ms ease;
	}

	.group-identity-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 32px -8px color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		border-color: color-mix(in oklab, var(--color-primary-500) 35%, transparent);
	}

	.group-accent-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
		opacity: 0.7;
		border-radius: 2rem 2rem 0 0;
		z-index: 20;
	}

	.logo-ring {
		border-radius: 0.875rem;
		box-shadow:
			0 0 0 3px color-mix(in oklab, var(--color-primary-400) 60%, transparent),
			0 8px 24px -4px rgba(0, 0, 0, 0.5);
	}

	/* Card entrance animation */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
