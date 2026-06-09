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
	import IconMail from '@lucide/svelte/icons/mail';
	import IconWalletCards from '@lucide/svelte/icons/wallet-cards';

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
				id: 'email',
				label: 'Email Studio',
				description: 'Mailchimp-style campaigns with custom sender domains',
				icon: IconMail,
				href: `/groups/${slug}/manage/email`,
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
			{
				id: 'accounting',
				label: 'Accounting',
				description: 'Income, expenses, budgets, reports',
				icon: IconWalletCards,
				href: `/groups/${slug}/manage/accounting`,
				accent: 'secondary',
				badge: 'New',
				badgeVariant: 'success'
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
		primary: 'preset-tonal-primary text-primary-500',
		secondary: 'preset-tonal-secondary text-secondary-500',
		tertiary: 'preset-tonal-tertiary text-tertiary-500'
	};

	const badgeStyles = {
		success: 'badge preset-filled-success-500',
		warning: 'badge preset-filled-warning-500',
		error: 'badge preset-filled-error-500',
		surface: 'badge preset-tonal-surface'
	};
</script>

<div class="manage-overview space-y-4 pb-6">
	<!-- Profile completion reminder -->
	{#if completionStats() < 100}
		<a
			href="/groups/{slug}/manage/edit"
			class="card preset-tonal-warning border-warning-500/20 hover:border-warning-500/40 flex items-center gap-4 border p-4 transition-colors"
		>
			<div
				class="preset-filled-warning-500 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
			>
				<IconSparkles class="h-5 w-5" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between">
					<span class="text-sm font-bold">Complete your group profile</span>
					<span class="text-xs font-semibold opacity-80">{completionStats()}% Complete</span>
				</div>
				<div class="bg-warning-500/20 mt-2 h-2 w-full overflow-hidden rounded-full">
					<div
						class="preset-filled-warning-500 h-full rounded-full transition-all duration-500"
						style="width: {completionStats()}%"
					></div>
				</div>
			</div>
			<IconChevronRight class="h-5 w-5 opacity-60" />
		</a>
	{/if}

	<!-- Action cards -->
	<section class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each manageActions() as action}
			{@const Icon = action.icon}
			<a
				href={action.href}
				class="group card preset-filled-surface-100-900 border-surface-200-800 flex items-center gap-4 border p-4 transition-all hover:scale-[1.02] hover:shadow-md"
			>
				<div
					class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm {accentStyles[
						action.accent
					]}"
				>
					<Icon class="h-6 w-6" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center justify-between gap-2">
						<span class="text-surface-900 dark:text-surface-50 text-sm font-semibold"
							>{action.label}</span
						>
						{#if action.badge}
							<span class={badgeStyles[action.badgeVariant]}>
								{action.badge}
							</span>
						{:else}
							<IconArrowRight
								class="h-4 w-4 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-80"
							/>
						{/if}
					</div>
					<p class="text-surface-600 dark:text-surface-400 mt-1 text-xs leading-relaxed">
						{action.description}
					</p>
				</div>
			</a>
		{/each}
	</section>

	<!-- Help -->
	<section class="card preset-filled-surface-100-900 border-surface-200-800 border p-4">
		<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
			<div class="flex w-full items-center gap-3">
				<div
					class="preset-tonal-secondary flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
				>
					<IconAlertCircle class="text-secondary-500 h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h3 class="text-surface-900 dark:text-surface-50 text-sm font-bold">Need help?</h3>
					<p class="text-surface-600 dark:text-surface-400 text-xs">
						Contact our team for assistance
					</p>
				</div>
			</div>
			<a
				href="mailto:hi@3fp.org"
				class="btn btn-sm preset-outlined-primary-500 w-full font-semibold sm:w-auto"
			>
				Contact
			</a>
		</div>
	</section>
</div>
