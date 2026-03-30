<script>
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconRss from '@lucide/svelte/icons/rss';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconIdCard from '@lucide/svelte/icons/id-card';
	import IconNewspaper from '@lucide/svelte/icons/newspaper';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import IconFolderOpen from '@lucide/svelte/icons/folder-open';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconMonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';

	let { data } = $props();

	const slug = $derived(data.group?.slug ?? '');

	// Profile completion
	const completionStats = $derived(() => {
		const g = data.group || {};
		const fields = [
			{ value: g.name },
			{ value: g.description },
			{ value: g.city && g.state_region },
			{ value: g.logo_url },
			{ value: g.cover_photo_url },
			{ value: g.website_url || g.public_contact_email || g.public_phone_number },
			{ value: g.social_links && Object.keys(g.social_links).length > 0 }
		];
		const completed = fields.filter((f) => Boolean(f.value)).length;
		return Math.round((completed / fields.length) * 100);
	});

	const manageActions = $derived(() => {
		const completion = completionStats();
		const assetCount = data.asset_summary?.assets ?? 0;

		return [
			{
				id: 'edit',
				label: 'Edit Profile',
				description: 'Name, description, location, photos, contact',
				icon: IconSquarePen,
				href: `/groups/${slug}/manage/edit`,
				accent: 'primary',
				badge: completion < 100 ? `${completion}%` : null,
				badgeVariant: completion < 50 ? 'error' : completion < 80 ? 'warning' : 'success'
			},
			{
				id: 'site',
				label: 'Microsite',
				description: 'Customize your public website builder page',
				icon: IconMonitorSmartphone,
				href: `/groups/${slug}/manage/site`,
				accent: 'primary',
				badge: 'New',
				badgeVariant: 'success'
			},
			{
				id: 'membership',
				label: 'Membership',
				description: 'Tiers, applications, roster, billing',
				icon: IconIdCard,
				href: `/groups/${slug}/manage/membership`,
				accent: 'primary',
				badge: null
			},
			...(data.can_manage_social
				? [
						{
							id: 'social',
							label: 'Social Media',
							description: 'Connect Facebook & Instagram',
							icon: IconRss,
							href: `/groups/${slug}/manage/social`,
							accent: 'secondary',
							badge: null
						}
					]
				: []),
			{
				id: 'assets',
				label: 'Shared Assets',
				description: 'Photos, files, links for public page',
				icon: IconFolderOpen,
				href: `/groups/${slug}/manage/assets`,
				accent: 'secondary',
				badge: assetCount > 0 ? `${assetCount}` : null,
				badgeVariant: assetCount > 0 ? 'success' : 'surface'
			},
			{
				id: 'news',
				label: 'Updates',
				description: 'Publish news to your group page',
				icon: IconNewspaper,
				href: `/groups/${slug}/manage/news`,
				accent: 'secondary',
				badge: null
			},
			{
				id: 'events',
				label: 'Volunteer Events',
				description: 'Manage volunteer opportunities',
				icon: IconUsers,
				href: `/volunteer/groups/${slug}`,
				accent: 'tertiary',
				badge: null
			}
		];
	});

	const accentStyles = {
		primary: 'bg-primary-500/10 text-primary-500',
		secondary: 'bg-secondary-500/10 text-secondary-500',
		tertiary: 'bg-tertiary-500/10 text-tertiary-500'
	};

	const badgeStyles = {
		success: 'bg-success-500/15 text-success-600',
		warning: 'bg-warning-500/15 text-warning-600',
		error: 'bg-error-500/15 text-error-600',
		surface: 'bg-surface-200-800 text-surface-700-300'
	};
</script>

<div class="manage-overview space-y-3 pb-6">
	<!-- Profile completion reminder -->
	{#if completionStats() < 100}
		<a
			href="/groups/{slug}/manage/edit"
			class="card bg-surface-50-950 border-warning-500/30 flex items-center gap-3 border p-3"
		>
			<div class="bg-warning-500/15 flex h-9 w-9 items-center justify-center rounded-full">
				<IconSparkles class="text-warning-500 h-4 w-4" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium">Profile {completionStats()}% complete</span>
				</div>
				<div
					class="bg-surface-200-800 mt-1.5 h-1.5 w-full max-w-[140px] overflow-hidden rounded-full"
				>
					<div
						class="bg-warning-500 h-full rounded-full transition-all duration-500"
						style="width: {completionStats()}%"
					></div>
				</div>
			</div>
			<IconChevronRight class="h-5 w-5 opacity-40" />
		</a>
	{/if}

	<!-- Action cards -->
	<section class="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
		{#each manageActions() as action}
			{@const Icon = action.icon}
			<a
				href={action.href}
				class="group card bg-surface-50-950 border-surface-200-800 hover:border-surface-400-600 flex items-center gap-3 border p-3 transition-all"
			>
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl {accentStyles[
						action.accent
					]}"
				>
					<Icon class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center justify-between gap-2">
						<span class="text-sm font-medium">{action.label}</span>
						{#if action.badge}
							<span
								class="rounded-full px-2 py-0.5 text-xs font-medium {badgeStyles[
									action.badgeVariant
								]}"
							>
								{action.badge}
							</span>
						{:else}
							<IconArrowRight class="h-4 w-4 opacity-0 transition-all group-hover:opacity-50" />
						{/if}
					</div>
					<p class="mt-0.5 text-xs opacity-60">{action.description}</p>
				</div>
			</a>
		{/each}
	</section>

	<!-- Help -->
	<section class="card bg-surface-50-950 border-surface-200-800 border p-4">
		<div class="flex items-center gap-3">
			<div
				class="bg-secondary-500/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
			>
				<IconAlertCircle class="text-secondary-500 h-4 w-4" />
			</div>
			<div class="min-w-0 flex-1">
				<h3 class="text-sm font-medium">Need help?</h3>
				<p class="text-xs opacity-60">Contact our team for assistance</p>
			</div>
			<a href="mailto:hi@3fp.org" class="btn btn-sm preset-outlined-surface-500"> Contact </a>
		</div>
	</section>
</div>
