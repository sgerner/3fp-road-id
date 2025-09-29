<script>
	import GroupHeroCard from '$lib/components/groups/GroupHeroCard.svelte';
	import VolunteerEventsExplorer from '$lib/components/volunteer/VolunteerEventsExplorer.svelte';
	import { buildContactLinks, selectPrimaryCta } from '$lib/groups/contactLinks';
	import { CTA_ICON_MAP, CONTACT_ICON_MAP } from '$lib/groups/contactLinks';

	const { data } = $props();

	const group = $derived(data?.group ?? null);
	const contactLinks = $derived(buildContactLinks(group));
	const primaryCta = $derived(selectPrimaryCta(group, contactLinks));
	const contactIconByKey = CONTACT_ICON_MAP;

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
	const title = $derived(group?.name ? `Volunteer with ${group.name}` : 'Volunteer Opportunities');
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
</script>

<svelte:head>
	<title>{group?.name ? `Volunteer with ${group.name}` : 'Group Volunteer Opportunities'}</title>
</svelte:head>

{#if group}
	<div class="mx-auto w-full max-w-4xl space-y-6">
		<GroupHeroCard {group} canEdit={false} {contactLinks} {primaryCta} />
	</div>
{/if}

{#if contactLinks?.length}
	<div class=" hidden gap-2 md:flex">
		{#each contactLinks.slice(0, 6) as contact}
			<a
				href={contact.href}
				title={contact.key}
				target={contact.key === 'email' || contact.key === 'phone' ? '_self' : '_blank'}
				rel={contact.key === 'email' || contact.key === 'phone' ? undefined : 'noopener noreferrer'}
				class="rounded-md p-2 text-white/90 hover:bg-white/10 hover:text-white"
			>
				<svelte:component
					this={contactIconByKey[contact.key] || IconLink}
					class="h-5 w-5"
					className="h-5 w-5"
				/>
			</a>
		{/each}
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
	showManagedEventsSection={false}
	showCreateButton={false}
/>
