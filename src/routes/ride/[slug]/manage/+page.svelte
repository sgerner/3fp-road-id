<script>
	import RideEditor from '$lib/components/ride/RideEditor.svelte';

	const { data } = $props();
</script>

<svelte:head>
	<title>Manage Ride</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<RideEditor
	pageTitle={`Manage ${data.ride?.activity?.title || 'Ride'}`}
	pageDescription="Edit the series, tune reminders, manage one-off occurrence changes, and keep riders informed."
	initialRide={data.ride}
	difficultyLevels={data.difficultyLevels}
	disciplines={data.disciplines}
	hostGroups={data.hostGroups}
	currentUser={data.currentUser}
	manageMode={true}
/>
