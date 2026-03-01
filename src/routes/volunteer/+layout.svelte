<script>
	import { page } from '$app/stores';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconClipboardList from '@lucide/svelte/icons/clipboard-list';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconUsers from '@lucide/svelte/icons/users';
	import SectionSecondaryNav from '$lib/components/navigation/SectionSecondaryNav.svelte';

	let { data, children } = $props();

	const pathname = $derived($page.url.pathname);
	const currentUser = $derived(data?.volunteerNavUser ?? null);
	const currentEvent = $derived($page.data?.event ?? null);
	const currentEventSlug = $derived(currentEvent?.slug ?? null);
	const canManageCurrentEvent = $derived(
		Boolean(
			currentEventSlug &&
			($page.data?.canManageEvent ||
				pathname === `/volunteer/${currentEventSlug}/edit` ||
				pathname === `/volunteer/${currentEventSlug}/manage`)
		)
	);

	const navSections = $derived.by(() => {
		const sections = [
			{
				label: '',
				items: [
					{
						label: 'Volunteer',
						href: '/volunteer',
						icon: IconHandHeart
					},
					{
						label: 'By Group',
						href: '/volunteer/groups',
						icon: IconUsers,
						tone: 'tertiary'
					},
					{
						label: 'My Shifts',
						href: '/volunteer/shifts',
						icon: IconClipboardList,
						tone: 'primary'
					}
				]
			}
		];

		if (currentUser && currentEventSlug && canManageCurrentEvent) {
			sections.push({
				label: '',
				items: [
					{
						label: 'View Event',
						href: `/volunteer/${currentEventSlug}`,
						icon: IconCalendar
					},
					{
						label: 'Edit Event',
						href: `/volunteer/${currentEventSlug}/edit`,
						icon: IconSquarePen,
						tone: 'secondary'
					},
					{
						label: 'Manage Event',
						href: `/volunteer/${currentEventSlug}/manage`,
						icon: IconClipboardList,
						tone: 'primary'
					}
				]
			});
		} else if (currentUser) {
			sections.push({
				label: '',
				items: [
					{
						label: 'Hosted Events',
						href: '/volunteer/hosted',
						icon: IconCalendar,
						tone: 'primary'
					},
					{
						label: 'Create Event',
						href: '/volunteer/new',
						icon: IconPlus,
						tone: 'secondary'
					}
				]
			});
		}

		return sections;
	});
</script>

<SectionSecondaryNav
	title="Volunteer"
	sections={navSections}
	currentPath={pathname}
	layout="split"
/>

{@render children()}
