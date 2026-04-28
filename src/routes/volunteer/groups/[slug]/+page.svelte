<script>
	import GroupHeroCard from '$lib/components/groups/GroupHeroCard.svelte';
	import VolunteerEventsExplorer from '$lib/components/volunteer/VolunteerEventsExplorer.svelte';
	import { buildContactLinks, selectPrimaryCta } from '$lib/groups/contactLinks';
	import { page } from '$app/stores';
	import { buildCanonicalUrl, cleanSeoText, limitSeoText } from '$lib/seo';

	const { data } = $props();

	const group = $derived(data?.group ?? null);
	const contactLinks = $derived(buildContactLinks(group));
	const primaryCta = $derived(selectPrimaryCta(group, contactLinks));

	const events = $derived((data?.events ?? []).filter(Boolean));
	const hostGroups = $derived((data?.hostGroups ?? []).filter(Boolean));
	const eventTypes = $derived((data?.eventTypes ?? []).filter(Boolean));
	const hostOrgs = $derived((data?.hostOrgs ?? data?.organizations ?? []).filter(Boolean));
	const opportunities = $derived(
		(data?.volunteer_opportunities ?? data?.volunteerOpportunities ?? []).filter(Boolean)
	);
	const currentUser = $derived(data?.user ?? null);

	const locationLabel = $derived.by(() => {
		if (!group) return '';
		return [group.city, group.state_region, group.country]
			.map((part) => (part || '').trim())
			.filter(Boolean)
			.join(', ');
	});
	const title = $derived(
		group?.name ? cleanSeoText(`Volunteer with ${group.name}`) : 'Volunteer Opportunities'
	);
	const description = $derived.by(() => {
		if (!group) {
			return 'Join upcoming volunteer opportunities hosted by this group.';
		}
		const loc = locationLabel;
		if (loc) {
			return `Support ${group.name} by joining volunteer events in ${loc}.`;
		}
		return `Support ${group.name} by joining their upcoming volunteer events.`;
	});
	const seoCanonical = $derived(buildCanonicalUrl($page.url));
</script>

<svelte:head>
	<title>{group?.name ? `Volunteer with ${group.name}` : 'Group Volunteer Opportunities'}</title>
	<meta
		name="description"
		content={group
			? limitSeoText(description, 165)
			: 'Join upcoming volunteer opportunities hosted by this group.'}
	/>
	<meta
		name="robots"
		content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	/>
	<link rel="canonical" href={seoCanonical} />
</svelte:head>

{#if group}
	<div class="mx-auto mb-6 w-full max-w-7xl space-y-6">
		<GroupHeroCard {group} canEdit={false} {contactLinks} {primaryCta} />
	</div>
{/if}

<VolunteerEventsExplorer
	eventsData={events}
	hostGroupsData={hostGroups}
	eventTypesData={eventTypes}
	hostOrgsData={hostOrgs}
	opportunitiesData={opportunities}
	user={currentUser}
	{title}
	{description}
	showCreateButton={false}
/>
