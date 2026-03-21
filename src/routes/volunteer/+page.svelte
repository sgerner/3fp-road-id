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

<section class="border-surface-300-700 bg-surface-100-900/70 mb-4 rounded-xl border p-4">
	<p class="text-surface-700-300 !mb-0 text-sm">
		Looking for ongoing ways to help outside specific event shifts?
		<a href="/get-involved" class="anchor">Visit Get Involved.</a>
	</p>
</section>

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
