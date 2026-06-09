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
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconMonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';
	import IconIdCard from '@lucide/svelte/icons/id-card';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconWalletCards from '@lucide/svelte/icons/wallet-cards';

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
			id: 'site',
			label: 'Website',
			icon: IconMonitorSmartphone,
			href: `/groups/${slug}/manage/site`
		},
		{
			id: 'membership',
			label: 'Membership',
			icon: IconIdCard,
			href: `/groups/${slug}/manage/membership`
		},
		{
			id: 'accounting',
			label: 'Accounting',
			icon: IconWalletCards,
			href: `/groups/${slug}/manage/accounting`
		},
		{
			id: 'email',
			label: 'Email',
			icon: IconMail,
			href: `/groups/${slug}/manage/email`
		},
		{
			id: 'assets',
			label: 'Assets',
			icon: IconFolderOpen,
			href: `/groups/${slug}/manage/assets`
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

<svelte:head>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="preset-filled-surface-50-950 min-h-screen w-full">
	<main class="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
		<section
			class="card preset-tonal-primary border-primary-500/20 overflow-hidden rounded-2xl border shadow-sm md:rounded-3xl"
			in:fade={{ duration: 300 }}
		>
			<div class="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
				<div class="flex items-center gap-4 text-left">
					{#if data.group?.logo_url}
						<img
							src={data.group.logo_url}
							alt="{groupName} logo"
							class="ring-primary-500/20 h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-md ring-2 lg:h-20 lg:w-20"
						/>
					{:else}
						<div
							class="preset-filled-primary-500 flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl shadow-md lg:h-20 lg:w-20"
						>
							<IconUsers class="h-8 w-8 text-white" />
						</div>
					{/if}

					<div class="min-w-0 space-y-1">
						<div class="flex flex-wrap items-center gap-2">
							<span
								class="chip preset-tonal-surface text-[0.65rem] font-bold tracking-[0.2em] uppercase"
							>
								Group Dashboard
							</span>
							{#if data.is_admin}
								<span
									class="badge preset-filled-warning-500 flex items-center gap-1 text-[0.65rem] font-semibold"
								>
									<IconShield class="h-3 w-3" />
									Admin
								</span>
							{/if}
						</div>
						<h1
							class="text-surface-900 dark:text-surface-50 text-2xl font-black tracking-tight lg:text-3xl"
						>
							{groupName}
						</h1>
						<p
							class="text-surface-600 dark:text-surface-400 flex items-center gap-1.5 text-xs sm:text-sm"
						>
							<IconMapPin class="h-3.5 w-3.5" />
							{locationLabel}
						</p>
					</div>
				</div>

				<div class="flex items-center">
					<a
						href="/groups/{slug}"
						class="btn preset-outlined-primary-500 hover:preset-filled-primary-500 flex w-full items-center justify-center gap-2 text-sm font-semibold transition-all duration-150 md:w-auto"
						target="_blank"
					>
						<IconExternalLink class="h-4 w-4" />
						View Public Page
					</a>
				</div>
			</div>

			<!-- Navigation tabs (horizontally scrollable on mobile) -->
			<div class="border-primary-500/10 bg-surface-50/30 dark:bg-surface-950/30 border-t">
				<nav
					class="scrollbar-none flex items-stretch gap-1.5 overflow-x-auto p-2"
					aria-label="Group management sections"
				>
					{#each allTabs as tab}
						{@const active = isActive(tab)}
						{@const Icon = tab.icon}
						<a
							href={tab.href}
							data-sveltekit-preload-data="hover"
							class="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150
								{active
								? 'preset-filled-primary-500 text-white shadow-sm'
								: 'text-surface-600 dark:text-surface-400 hover:bg-primary-500/10 hover:text-primary-800 dark:hover:text-primary-200'}"
							aria-current={active ? 'page' : undefined}
						>
							<Icon class="h-4 w-4 flex-shrink-0" />
							<span>{tab.label}</span>
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
	/* Hide scrollbar for Chrome, Safari and Opera */
	.scrollbar-none::-webkit-scrollbar {
		display: none;
	}
	/* Hide scrollbar for IE, Edge and Firefox */
	.scrollbar-none {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}
</style>
