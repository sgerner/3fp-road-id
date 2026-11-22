<script>
	import { page } from '$app/state';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconUsers from '@lucide/svelte/icons/users';
	import SecondarySectionNav from '#lib/components/ui/SecondarySectionNav.svelte';

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
</script>

<SecondarySectionNav
	title="Groups"
	ariaLabel="Groups secondary navigation"
	sections={navSections}
	{pathname}
/>

{@render children()}
