<script>
	import { page } from '$app/stores';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconLink from '@lucide/svelte/icons/link';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import SectionSecondaryNav from '$lib/components/navigation/SectionSecondaryNav.svelte';

	let { children } = $props();

	const pathname = $derived($page.url.pathname);
	const currentUser = $derived($page.data?.currentUser ?? null);
	const currentRide = $derived($page.data?.ride ?? null);
	const currentRideSlug = $derived(currentRide?.activity?.slug ?? null);
	const isWidgetFrame = $derived(pathname.startsWith('/ride/widget/frame'));
	const canManageCurrentRide = $derived(
		Boolean(
			currentRideSlug &&
			($page.data?.canManage ||
				pathname === `/ride/${currentRideSlug}/manage` ||
				pathname.startsWith(`/ride/${currentRideSlug}/manage`))
		)
	);

	const navSections = $derived.by(() => {
		const sections = [
			{
				label: '',
				items: [
					{
						label: 'Browse Rides',
						href: '/ride',
						icon: IconBike
					},
					{
						label: 'Embed',
						href: '/ride/widget',
						icon: IconLink
					}
				]
			}
		];

		const actionSection = {
			label: '',
			items: []
		};

		if (currentUser) {
			actionSection.items.push({
				label: 'Create Ride',
				href: '/ride/new',
				icon: IconPlus,
				tone: 'secondary'
			});
		}

		if (currentRideSlug) {
			actionSection.items.push({
				label: currentRide?.activity?.title ?? 'Ride Details',
				href: `/ride/${currentRideSlug}`,
				icon: IconBike,
				tone: 'primary'
			});

			if (canManageCurrentRide) {
				actionSection.items.push({
					label: 'Manage Ride',
					href: `/ride/${currentRideSlug}/manage`,
					icon: IconSquarePen,
					tone: 'secondary'
				});
			}
		}

		if (actionSection.items.length) {
			sections.push(actionSection);
		}

		return sections;
	});
</script>

{#if !isWidgetFrame}
	<SectionSecondaryNav title="Ride" sections={navSections} currentPath={pathname} layout="split" />
{/if}

{@render children()}
