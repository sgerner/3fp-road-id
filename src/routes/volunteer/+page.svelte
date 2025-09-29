<script>
	import VolunteerEventsExplorer from '$lib/components/volunteer/VolunteerEventsExplorer.svelte';

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

<VolunteerEventsExplorer
	eventsData={events}
	hostGroupsData={hostGroups}
	eventTypesData={eventTypes}
	hostOrgsData={hostOrgs}
	opportunitiesData={opportunities}
	user={currentUser}
	title="Volunteer Opportunities"
	description="Browse rides, pop-up shops, workshops, and more. Filter by host, type, and location to find the right place to pitch in."
	showManagedEventsSection={true}
	showCreateButton={true}
	createButtonHref="/volunteer/new"
/>
