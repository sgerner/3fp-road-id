<script>
	import VolunteerEventsExplorer from '#lib/components/volunteer/VolunteerEventsExplorer.svelte';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';

	const { data } = $props();

	const events = $derived((data?.events ?? []).filter(Boolean));
	const hostGroups = $derived((data?.hostGroups ?? []).filter(Boolean));
	const eventTypes = $derived((data?.eventTypes ?? []).filter(Boolean));
	const hostOrgs = $derived((data?.hostOrgs ?? data?.organizations ?? []).filter(Boolean));
	const opportunities = $derived(
		(data?.volunteer_opportunities ?? data?.volunteerOpportunities ?? []).filter(Boolean)
	);
	const currentUser = $derived(data?.user ?? null);
</script>

<svelte:head>
	<title>Volunteer Hub</title>
</svelte:head>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<VolunteerEventsExplorer
		eventsData={events}
		hostGroupsData={hostGroups}
		eventTypesData={eventTypes}
		hostOrgsData={hostOrgs}
		opportunitiesData={opportunities}
		user={currentUser}
		title="Volunteer."
		description="Browse rides, pop-up shops, workshops, and more. Filter by host, type, and location to find the right place to pitch in."
		showCreateButton={true}
		createButtonHref="/volunteer/new"
	/>

	<section
		class="bg-tertiary-500 text-surface-950 border-surface-950 flex flex-wrap items-center justify-between gap-4 border-t-[3px] px-6 py-8 sm:px-10 lg:px-14"
		aria-label="Ongoing volunteer opportunities"
	>
		<p class="m-0 text-base font-bold sm:text-lg">
			Looking for ongoing ways to help outside specific event shifts?
		</p>
		<a
			href="/get-involved"
			class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-2 px-6 py-3 text-sm font-black tracking-wide uppercase transition hover:no-underline"
		>
			Visit Get Involved.
			<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
		</a>
	</section>
</div>
