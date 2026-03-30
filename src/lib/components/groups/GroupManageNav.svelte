<script>
	import { page } from '$app/stores';
	import IconLayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconRss from '@lucide/svelte/icons/rss';
	import IconIdCard from '@lucide/svelte/icons/id-card';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconMonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';

	let { group = null, canManageSocial = false } = $props();

	const slug = $derived(group?.slug ?? '');
	const pathname = $derived($page.url.pathname);

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
		...(canManageSocial
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

	function isActive(tab) {
		if (tab.id === 'overview') {
			return pathname === `/groups/${slug}/manage`;
		}
		return pathname.startsWith(tab.href);
	}
</script>

<!-- Minimal tab navigation - integrated into page hero -->
<nav
	class="manage-tabs mx-auto flex max-w-6xl items-stretch gap-1 overflow-x-auto px-3"
	aria-label="Group management sections"
	style="scrollbar-width: none; -ms-overflow-style: none;"
>
	{#each allTabs as tab}
		{@const active = isActive(tab)}
		{@const Icon = tab.icon}
		<a
			href={tab.href}
			class="manage-tab flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all
				{active ? 'bg-white/15 text-white shadow-sm' : 'text-white/60 hover:bg-white/10 hover:text-white'}"
			aria-current={active ? 'page' : undefined}
		>
			<Icon class="h-4 w-4 flex-shrink-0" />
			<span>{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	.manage-tabs {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}
	.manage-tabs::-webkit-scrollbar {
		display: none;
	}

	.manage-tab {
		white-space: nowrap;
	}
</style>
