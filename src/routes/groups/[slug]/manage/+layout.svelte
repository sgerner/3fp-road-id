<script>
	import { page } from '$app/state';
	import { normalizeMicrositeSlug } from '#lib/microsites/host';
	import IconGlobe from '@lucide/svelte/icons/earth';
	import IconRss from '@lucide/svelte/icons/rss';
	import IconLayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconShield from '@lucide/svelte/icons/shield';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconIdCard from '@lucide/svelte/icons/id-card';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconWalletCards from '@lucide/svelte/icons/wallet-cards';

	let { children, data } = $props();

	const slug = $derived(data.group?.slug ?? '');
	const micrositeSlug = $derived(
		normalizeMicrositeSlug(data.group?.microsite_slug || data.group?.slug || '')
	);
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
			id: 'presence',
			label: 'Public Presence',
			icon: IconGlobe,
			href: `/groups/${slug}/manage/presence`
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

	const pathname = $derived(page.url.pathname);

	function isActive(tab) {
		if (tab.id === 'overview') {
			return pathname === `/groups/${slug}/manage`;
		}
		if (tab.id === 'presence') {
			return (
				pathname.startsWith(`/groups/${slug}/manage/presence`) ||
				pathname.startsWith(`/groups/${slug}/manage/edit`) ||
				pathname.startsWith(`/groups/${slug}/manage/site`)
			);
		}
		return pathname.startsWith(tab.href);
	}
</script>

<svelte:head>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="min-h-screen w-full">
	<div class="mx-auto space-y-6 px-4 py-6 md:px-6">
		<section class="border-primary-500 bg-surface-900 overflow-hidden border-y-2">
			<div class="flex flex-col gap-6 p-5 md:flex-row md:items-center md:justify-between md:p-6">
				<div class="flex items-center gap-4 text-left">
					{#if data.group?.logo_url}
						<img
							src={data.group.logo_url}
							alt="{groupName} logo"
							class="border-primary-500 h-16 w-16 flex-shrink-0 border-2 object-cover lg:h-20 lg:w-20"
						/>
					{:else}
						<div
							class="preset-filled-primary-500 text-surface-950 flex h-16 w-16 flex-shrink-0 items-center justify-center lg:h-20 lg:w-20"
						>
							<IconUsers class="h-8 w-8" />
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
						<h1 class="text-surface-50! text-2xl font-black tracking-tight lg:text-3xl">
							{groupName}
						</h1>
						<p class="text-surface-300 flex items-center gap-1.5 text-xs sm:text-sm">
							<IconMapPin class="h-3.5 w-3.5" />
							{locationLabel}
						</p>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<a
						href="/groups/{slug}"
						class="btn preset-outlined-primary-500 hover:preset-filled-primary-500 flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-150"
						target="_blank"
						rel="noreferrer"
					>
						<IconExternalLink class="h-4 w-4" />
						Directory Page
					</a>
					{#if micrositeSlug}
						<a
							href="/{micrositeSlug}"
							class="btn border-surface-700 bg-surface-950 text-surface-100 hover:bg-surface-800 flex items-center justify-center gap-2 border text-sm font-semibold transition-all duration-150"
							target="_blank"
							rel="noreferrer"
						>
							<IconGlobe class="h-4 w-4" />
							Custom Website
						</a>
					{/if}
				</div>
			</div>

			<!-- Navigation tabs (horizontally scrollable on mobile) -->
			<div class="border-surface-800 bg-surface-950 border-t-2">
				<nav
					class="flex items-stretch gap-0 overflow-x-auto"
					aria-label="Group management sections"
				>
					{#each allTabs as tab}
						{@const active = isActive(tab)}
						{@const Icon = tab.icon}
						<a
							href={tab.href}
							data-sveltekit-preload-data="hover"
							class="flex shrink-0 items-center gap-2 border-b-4 border-transparent px-4 py-3 text-sm font-bold tracking-wide uppercase transition-colors
								{active
								? 'border-primary-500 bg-surface-800 text-primary-500'
								: 'text-surface-300 hover:border-surface-600 hover:bg-surface-800 hover:text-surface-50'}"
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
			<div class="manage-page-content">
				{@render children()}
			</div>
		{/key}
	</div>
</div>
