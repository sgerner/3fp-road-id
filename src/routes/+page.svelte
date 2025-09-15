<script>
	let { data } = $props();
	import AlertSystem from '$lib/components/AlertSystem.svelte';
	import CrashResponse from '$lib/components/CrashResponse.svelte';
	import { goto } from '$app/navigation';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconIdCard from '@lucide/svelte/icons/id-card';
</script>

<div class="mx-auto max-w-7xl space-y-10">
	<!-- Header with gradient background -->
	<header>
		<h1 class="text-3xl font-bold">3 Feet Please</h1>
		<p class="mt-2 text-center text-lg">Bicycle Safety & Community Resources</p>
	</header>

	<!-- Quick links -->
	<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
		<a
			href="/groups"
			class="card border-surface-300 bg-surface-900 card-hover flex items-center gap-3 border p-4"
		>
			<IconUsers class="h-6 w-6" />
			<div>
				<div class="text-lg font-semibold">Explore Groups</div>
				<p class="text-surface-400 m-0 text-sm">Find local clubs, teams, and orgs</p>
			</div>
		</a>
		<a
			href="/roadid"
			class="card border-surface-300 bg-surface-900 card-hover flex items-center gap-3 border p-4"
		>
			<IconIdCard class="h-6 w-6" />
			<div>
				<div class="text-lg font-semibold">Road ID</div>
				<p class="text-surface-400 m-0 text-sm">Manage your emergency profile</p>
			</div>
		</a>
	</div>

	<!-- About 3 Feet Please Section -->
	<section class="card border-surface-300 bg-surface-950 card-hover border-[1px] p-2">
		<p class="mb-2 border-b pb-2 text-center text-2xl font-bold">About 3 Feet Please</p>
		<p class="pl-8 indent-[-1.5rem]">
			🚴‍♀️ We are a <strong>bicycle safety nonprofit</strong> dedicated to protecting riders.
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			❤️ We <strong>advocate for safe riding practices</strong> and share the road awareness.
		</p>
		<p class="pl-8 indent-[-1.5rem]">
			📚 Our mission is to provide <strong>essential resources</strong> for the cycling community.
		</p>
		<button class="btn btn-sm preset-outlined-success-500 mt-4 w-full">
			<a href="https://3feetplease.org" target="_blank" rel="noopener noreferrer"> Learn more </a>
		</button>
	</section>

	<!-- Featured Groups (only with cover + logo) -->
	{#if data.highlights?.length}
		<section class="space-y-2">
			<h2 class="text-2xl font-bold">Featured Groups</h2>
			<div class="grid grid-cols-1 gap-2">
				{#each data.highlights as g}
					<a
						href={`/groups/${g.slug}`}
						class="card group border-surface-300 bg-surface-900 card-hover block overflow-hidden border"
					>
						<div
							class="from-primary-800/60 to-primary-600/40 relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-r"
						>
							<img
								src={g.cover_photo_url}
								alt="{g.name} cover"
								loading="lazy"
								class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
							/>
							<div class="absolute inset-x-0 bottom-0">
								<div class="flex items-center gap-2 rounded-md bg-black/60 p-2 backdrop-blur-sm">
									<img
										src={g.logo_url}
										alt="{g.name} logo"
										loading="lazy"
										class="h-20 w-20 rounded-md object-cover"
									/>
									<div class="min-w-0">
										<h3 class="truncate !text-left text-base font-bold text-white">{g.name}</h3>
										<p class="!m-0 truncate text-[11px] text-white/90">
											{#if g.city}{g.city},
											{/if}
											{g.state_region} · {g.country}
										</p>
										{#if g.tagline}
											<p class="line-clamp-1 hidden text-white/80 md:block">
												{g.tagline}
											</p>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Safety Advice Section with two cards -->
	<section class="space-y-6">
		<CrashResponse />
		<hr />
		<AlertSystem />
	</section>
</div>

<style>
	p {
		margin-bottom: 0.5rem;
	}
</style>
