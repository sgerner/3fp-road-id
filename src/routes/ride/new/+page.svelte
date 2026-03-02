<script>
	import RideEditor from '$lib/components/ride/RideEditor.svelte';

	const { data } = $props();
</script>

<svelte:head>
	<title>Create Ride</title>
</svelte:head>

<RideEditor
	pageTitle="Create a Ride"
	pageDescription="Build a public ride page with RSVP, recurring schedules, reminder emails, and the ride details."
	difficultyLevels={data.difficultyLevels}
	disciplines={data.disciplines}
	hostGroups={data.hostGroups}
	currentUser={data.currentUser}
	currentProfile={data.currentProfile}
/>
