<script>
	import { page } from '$app/stores';
	import { fade } from 'svelte/transition';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconRss from '@lucide/svelte/icons/rss';
	import IconLayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconShield from '@lucide/svelte/icons/shield';

	let { children, data } = $props();

	const slug = $derived(data.group?.slug ?? '');
	const groupName = $derived(data.group?.name ?? 'Group');
	const locationLabel = $derived(
		[data.group?.city, data.group?.state_region, data.group?.country].filter(Boolean).join(', ') ||
			'Location not set'
	);

	const allTabs = $derived([
		{
			id: 'overview',
			label: 'Overview',
			icon: IconLayoutDashboard,
			href: `/groups/${slug}/manage`
		},
		{
			id: 'edit',
			label: 'Edit Profile',
			icon: IconSquarePen,
			href: `/groups/${slug}/manage/edit`
		},
		{
			id: 'news',
			label: 'Updates',
			icon: IconNewspaper,
			href: `/groups/${slug}/manage/news`
		},
		...(data.can_manage_social
			? [
					{
						id: 'social',
						label: 'Social Media',
						icon: IconRss,
						href: `/groups/${slug}/manage/social`
					}
				]
			: [])
	]);

	const pathname = $derived($page.url.pathname);

	function isActive(tab) {
		if (tab.id === 'overview') {
			return pathname === `/groups/${slug}/manage`;
		}
		return pathname.startsWith(tab.href);
	}
</script>

<div class="manage-shell min-h-screen w-full">
	<main class="mx-auto max-w-6xl space-y-6 pt-4 pb-12 md:px-4 lg:px-6">
		<section class="manage-hero relative overflow-hidden rounded-3xl" in:fade={{ duration: 300 }}>
			<div class="hero-orb hero-orb-1" aria-hidden="true"></div>
			<div class="hero-orb hero-orb-2" aria-hidden="true"></div>
			<div class="hero-orb hero-orb-3" aria-hidden="true"></div>

			<div
				class="relative z-10 flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-6"
			>
				<div class="flex items-start gap-4">
					{#if data.group?.logo_url}
						<img
							src={data.group.logo_url}
							alt="{groupName} logo"
							class="h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-lg ring-2 ring-white/10 lg:h-20 lg:w-20"
						/>
					{:else}
						<div
							class="hero-logo-placeholder flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl shadow-lg lg:h-20 lg:w-20"
						>
							<IconUsers class="h-8 w-8 text-white/60" />
						</div>
					{/if}

					<div class="min-w-0 space-y-1">
						<div class="flex flex-wrap items-center gap-2">
							<span
								class="chip preset-filled-surface-50-950 text-[0.65rem] font-semibold tracking-[0.2em] uppercase"
							>
								Group Dashboard
							</span>
							{#if data.is_admin}
								<span class="chip preset-filled-warning-500 flex items-center gap-1 text-[0.65rem]">
									<IconShield class="h-3 w-3" />
									Admin
								</span>
							{/if}
						</div>
						<h1
							class="volunteer-headline-accent text-2xl font-extrabold tracking-tight text-white lg:text-3xl"
						>
							{groupName}
						</h1>
						<p class="flex items-center gap-1.5 text-sm">
							<IconMapPin class="h-3.5 w-3.5" />
							{locationLabel}
						</p>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-3 lg:flex-col lg:items-end">
					<a
						href="/groups/{slug}"
						class="btn preset-filled-surface-50-950 flex items-center gap-2"
						target="_blank"
					>
						<IconExternalLink class="h-4 w-4" />
						View Public Page
					</a>
				</div>
			</div>

			<div
				class="hero-tabs-wrapper bg-surface-100-900/50 relative z-10 border-t border-white/10 px-6 lg:px-10"
			>
				<nav
					class="manage-tabs flex items-stretch gap-6 overflow-x-auto"
					aria-label="Group management sections"
					style="scrollbar-width: none; -ms-overflow-style: none;"
				>
					{#each allTabs as tab}
						{@const active = isActive(tab)}
						{@const Icon = tab.icon}
						<a
							href={tab.href}
							data-sveltekit-preload-data="hover"
							class="manage-tab ipx-5 shrink-0 py-3.5 text-sm font-medium transition-all
								{active ? 'tab-active text-primary-800-200 ' : 'hover:text-primary-500/80 text-white/70'}"
							aria-current={active ? 'page' : undefined}
						>
							<div
								class="flex items-center gap-2 pb-1 {active ? 'border-primary-500 border-b-2' : ''}"
							>
								<Icon class="h-4 w-4 flex-shrink-0" />
								<span>{tab.label}</span>
							</div>
						</a>
					{/each}
				</nav>
			</div>
		</section>

		{#key pathname}
			<div class="manage-page-content" in:fade={{ duration: 220 }} out:fade={{ duration: 120 }}>
				{@render children()}
			</div>
		{/key}
	</main>
</div>

<style>
	.manage-hero {
		background: color-mix(in oklab, var(--color-primary-500) 15%, var(--color-surface-950) 85%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 25%, transparent);
		animation: hero-in 600ms ease both;
	}

	.hero-orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(60px);
		pointer-events: none;
		animation: orb-float 8s ease-in-out infinite;
	}

	.hero-orb-1 {
		width: 300px;
		height: 300px;
		background: color-mix(in oklab, var(--color-primary-500) 30%, transparent);
		top: -100px;
		right: -50px;
		animation-delay: 0s;
	}

	.hero-orb-2 {
		width: 200px;
		height: 200px;
		background: color-mix(in oklab, var(--color-secondary-500) 25%, transparent);
		bottom: -50px;
		left: 10%;
		animation-delay: -3s;
	}

	.hero-orb-3 {
		width: 150px;
		height: 150px;
		background: color-mix(in oklab, var(--color-tertiary-500) 20%, transparent);
		top: 20%;
		left: 30%;
		animation-delay: -5s;
	}

	.hero-logo-placeholder {
		background: linear-gradient(
			135deg,
			var(--color-primary-500) 0%,
			var(--color-secondary-500) 100%
		);
	}

	.manage-tabs {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.manage-tabs::-webkit-scrollbar {
		display: none;
	}

	.manage-tab {
		white-space: nowrap;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition:
			color 200ms ease,
			border-color 200ms ease;
	}

	.manage-tab.tab-active {
		border-bottom-color: white;
	}

	@keyframes hero-in {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes orb-float {
		0%,
		100% {
			transform: translate(0, 0) scale(1);
		}
		25% {
			transform: translate(10px, -15px) scale(1.05);
		}
		50% {
			transform: translate(-5px, 10px) scale(0.95);
		}
		75% {
			transform: translate(15px, 5px) scale(1.02);
		}
	}
</style>
