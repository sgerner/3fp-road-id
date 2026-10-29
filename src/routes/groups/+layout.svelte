<script>
	import { page } from '$app/state';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconUsers from '@lucide/svelte/icons/users';

	let { data, children } = $props();

	const pathname = $derived(page.url.pathname);
	const currentGroup = $derived(data?.group ?? null);
	const ownedGroups = $derived((data?.groupsNavOwnedGroups ?? []).filter((group) => group?.slug));
	const currentGroupSlug = $derived(currentGroup?.slug ?? null);
	const currentGroupCanEdit = $derived(
		Boolean(
			currentGroupSlug &&
			(data?.can_edit ||
				pathname.startsWith(`/groups/${currentGroupSlug}/manage`) ||
				ownedGroups.some((group) => group.slug === currentGroupSlug))
		)
	);

	const navSections = $derived.by(() => {
		const primaryItems = [
			{
				label: 'Browse Groups',
				href: '/groups',
				icon: IconUsers
			},
			{
				label: 'Add Group',
				href: '/groups/new',
				icon: IconPlus,
				tone: 'secondary'
			}
		];

		if (currentGroupSlug) {
			primaryItems.push(
				{
					label: currentGroup?.name ?? 'Group Profile',
					href: `/groups/${currentGroupSlug}`,
					icon: IconUsers
				},
				{
					label: 'Volunteer Opportunities',
					href: `/volunteer/groups/${currentGroupSlug}`,
					icon: IconHandHeart,
					tone: 'tertiary'
				}
			);

			if (currentGroupCanEdit) {
				primaryItems.push({
					label: 'Manage Group',
					href: `/groups/${currentGroupSlug}/manage`,
					icon: IconSquarePen,
					tone: 'secondary',
					match: 'prefix'
				});
			}
		}

		const sections = [
			{
				label: '',
				items: primaryItems
			}
		];

		const ownedGroupItems = ownedGroups
			.filter((group) => group.slug !== currentGroupSlug)
			.slice(0, 4)
			.map((group) => ({
				label: group.name,
				href: `/groups/${group.slug}/manage`,
				icon: IconUsers,
				tone: 'primary'
			}));
		if (ownedGroupItems.length) {
			sections.push({
				label: 'Owned',
				items: ownedGroupItems
			});
		}

		return sections;
	});

	function isActive(item) {
		if (!item?.href) return false;
		if (item.match === 'prefix') {
			return pathname === item.href || pathname.startsWith(`${item.href}/`);
		}
		return pathname === item.href;
	}

	function itemClass(item) {
		const base =
			'inline-flex min-w-0 max-w-full items-center gap-2 px-3.5 py-2 text-xs font-black tracking-[0.14em] whitespace-nowrap uppercase transition hover:no-underline';
		if (isActive(item)) {
			return `${base} bg-primary-500 text-surface-950`;
		}
		if (item?.tone === 'secondary') {
			return `${base} bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950`;
		}
		if (item?.tone === 'tertiary') {
			return `${base} bg-tertiary-500 text-surface-950 hover:bg-primary-500`;
		}
		return `${base} border-surface-700 text-surface-50 hover:border-primary-500 hover:text-primary-500 border-2`;
	}
</script>

{#if navSections.some((section) => section?.items?.length)}
	<nav
		aria-label="Groups secondary navigation"
		class="bg-surface-950 text-surface-50 border-surface-800 -mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b-[3px] px-6 py-3 sm:px-10 lg:px-14"
	>
		<div class="flex flex-wrap items-center gap-3">
			<span
				class="text-primary-500 mr-2 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
				Groups
			</span>
			{#each navSections[0]?.items ?? [] as item (item.href)}
				<a
					href={item.href}
					class={itemClass(item)}
					aria-current={isActive(item) ? 'page' : undefined}
					title={item.label}
				>
					{#if item.icon}
						<item.icon class="h-3.5 w-3.5 shrink-0" />
					{/if}
					<span class="block max-w-[10rem] truncate sm:max-w-[14rem]">{item.label}</span>
				</a>
			{/each}
		</div>

		{#if navSections[1]?.items?.length}
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-surface-300 text-[0.65rem] font-bold tracking-[0.22em] uppercase">
					{navSections[1].label}
				</span>
				{#each navSections[1].items as item (item.href)}
					<a
						href={item.href}
						class={itemClass(item)}
						aria-current={isActive(item) ? 'page' : undefined}
						title={item.label}
					>
						{#if item.icon}
							<item.icon class="h-3.5 w-3.5 shrink-0" />
						{/if}
						<span class="block max-w-[8rem] truncate sm:max-w-[12rem]">{item.label}</span>
					</a>
				{/each}
			</div>
		{/if}
	</nav>
{/if}

{@render children()}
