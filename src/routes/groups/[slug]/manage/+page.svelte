<script>
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconRss from '@lucide/svelte/icons/rss';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconIdCard from '@lucide/svelte/icons/id-card';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconCheckCircle from '@lucide/svelte/icons/check-circle';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import { fade, slide } from 'svelte/transition';

	let { data } = $props();

	const slug = $derived(data.group?.slug ?? '');

	// Profile completion stats
	const completionStats = $derived(() => {
		const g = data.group || {};
		const fields = [
			{ name: 'Name', value: g.name },
			{ name: 'Description', value: g.description },
			{ name: 'Location', value: g.city && g.state_region },
			{ name: 'Logo', value: g.logo_url },
			{ name: 'Cover Photo', value: g.cover_photo_url },
			{ name: 'Contact', value: g.website_url || g.public_contact_email || g.public_phone_number },
			{ name: 'Social Links', value: g.social_links && Object.keys(g.social_links).length > 0 }
		];
		const completed = fields.filter((f) => Boolean(f.value)).length;
		return {
			completed,
			total: fields.length,
			percentage: Math.round((completed / fields.length) * 100)
		};
	});

	const stats = $derived(() => {
		const g = data.group || {};
		return [
			{
				id: 'profile',
				label: 'Profile Complete',
				value: `${completionStats().percentage}%`,
				sublabel: `${completionStats().completed}/${completionStats().total} fields`,
				icon: IconCheckCircle,
				color:
					completionStats().percentage >= 80
						? 'success'
						: completionStats().percentage >= 50
							? 'warning'
							: 'error',
				highlight: completionStats().percentage < 80
			},
			{
				id: 'location',
				label: 'Location',
				value: g.city || 'Not set',
				sublabel: g.state_region || '',
				icon: IconMapPin,
				color: g.city ? 'primary' : 'surface'
			},
			{
				id: 'events',
				label: 'Volunteer Events',
				value: 'View',
				sublabel: 'Manage opportunities',
				icon: IconHandHeart,
				color: 'tertiary',
				action: { href: `/volunteer/groups/${slug}`, label: 'View Events' }
			}
		];
	});

	const actions = $derived([
		{
			id: 'edit',
			label: 'Edit Profile',
			description: 'Update your group name, description, location, photos, and contact details.',
			icon: IconSquarePen,
			href: `/groups/${slug}/manage/edit`,
			tone: 'primary',
			badge: completionStats().percentage < 80 ? 'Complete profile' : null
		},
		{
			id: 'membership',
			label: 'Membership',
			description:
				'Configure tiers, private applications, member roster, billing status, and member email campaigns.',
			icon: IconIdCard,
			href: `/groups/${slug}/manage/membership`,
			tone: 'primary',
			badge: null
		},
		...(data.can_manage_social
			? [
					{
						id: 'social',
						label: 'Social Media',
						description: 'Connect Facebook and Instagram to publish and schedule posts from 3FP.',
						icon: IconRss,
						href: `/groups/${slug}/manage/social`,
						tone: 'secondary',
						badge: null
					}
				]
			: []),
		{
			id: 'events',
			label: 'Volunteer Events',
			description: 'View and manage upcoming volunteer opportunities hosted by your group.',
			icon: IconUsers,
			href: `/volunteer/groups/${slug}`,
			tone: 'tertiary',
			badge: null
		}
	]);

	const toneClasses = {
		primary: {
			card: 'card bg-primary-200-800/40 hover:bg-primary-200-800/80 border border-primary-500',
			icon: 'bg-primary-500/15 text-primary-400',
			badge: 'preset-filled-primary-500'
		},
		secondary: {
			card: 'card bg-secondary-200-800/40 hover:bg-secondary-200-800/80 border border-secondary-500',
			icon: 'bg-secondary-500/15 text-secondary-400',
			badge: 'preset-filled-secondary-500'
		},
		tertiary: {
			card: 'card bg-tertiary-200-800/40 hover:bg-tertiary-200-800/80 border border-tertiary-500',
			icon: 'bg-tertiary-500/15 text-tertiary-400',
			badge: 'preset-filled-tertiary-500'
		}
	};

	const statColorClasses = {
		success: { icon: 'bg-success-500/15 text-success-400', glow: 'var(--color-success-500)' },
		warning: { icon: 'bg-warning-500/15 text-warning-400', glow: 'var(--color-warning-500)' },
		error: { icon: 'bg-error-500/15 text-error-400', glow: 'var(--color-error-500)' },
		primary: { icon: 'bg-primary-500/15 text-primary-400', glow: 'var(--color-primary-500)' },
		tertiary: { icon: 'bg-tertiary-500/15 text-tertiary-400', glow: 'var(--color-tertiary-500)' },
		surface: { icon: 'bg-surface-500/15 text-surface-400', glow: 'var(--color-surface-500)' }
	};
</script>

<div class="manage-overview space-y-8 pb-10">
	<!-- ═══════════════════════════════════════════════
	     STATS GRID
	═══════════════════════════════════════════════ -->
	<section
		class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
		in:fade={{ duration: 300, delay: 100 }}
	>
		{#each stats() as stat, i}
			{@const colors = statColorClasses[stat.color]}
			<div
				class="stat-card card preset-tonal-surface relative overflow-hidden p-4"
				style="--stagger: {i}"
			>
				<div class="stat-glow" style="background: {colors.glow}" aria-hidden="true"></div>
				<div class="relative z-10 flex items-start justify-between">
					<div>
						<div
							class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.15em] uppercase opacity-60"
						>
							<stat.icon class="h-3.5 w-3.5" />
							{stat.label}
						</div>
						<div class="text-2xl font-black tabular-nums">{stat.value}</div>
						{#if stat.sublabel}
							<div class="mt-0.5 text-xs opacity-60">{stat.sublabel}</div>
						{/if}
					</div>
					<div class="flex h-10 w-10 items-center justify-center rounded-xl {colors.icon}">
						<stat.icon class="h-5 w-5" />
					</div>
				</div>
				{#if stat.action}
					<div class="relative z-10 mt-3">
						<a
							href={stat.action.href}
							class="text-primary-600-400 flex items-center gap-1 text-xs font-medium hover:underline"
						>
							{stat.action.label}
							<IconArrowRight class="h-3 w-3" />
						</a>
					</div>
				{/if}
			</div>
		{/each}
	</section>

	<!-- ═══════════════════════════════════════════════
	     PROFILE COMPLETION TIP
	═══════════════════════════════════════════════ -->
	{#if completionStats().percentage < 80}
		<section
			class="tip-card relative overflow-hidden rounded-2xl p-4"
			in:slide={{ duration: 250, delay: 150 }}
		>
			<div class="tip-glow" aria-hidden="true"></div>
			<div class="relative z-10 flex items-start gap-3">
				<div
					class="bg-warning-500/15 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
				>
					<IconSparkles class="text-warning-400 h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h3 class="font-semibold">Complete your profile</h3>
							<p class="text-surface-600-400 text-sm">
								Groups with complete profiles get more visibility and engagement.
							</p>
						</div>
						<a href="/groups/{slug}/manage/edit" class="btn btn-sm preset-filled-warning-500">
							Finish Setup
						</a>
					</div>
					<!-- Progress bar -->
					<div class="mt-3">
						<div class="flex items-center justify-between text-xs">
							<span class="text-surface-600-400">Profile completion</span>
							<span class="font-semibold">{completionStats().percentage}%</span>
						</div>
						<div class="bg-surface-500/20 mt-1.5 h-2 overflow-hidden rounded-full">
							<div
								class="bg-warning-500 h-full rounded-full transition-all duration-500"
								style="width: {completionStats().percentage}%"
							></div>
						</div>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- ═══════════════════════════════════════════════
	     QUICK ACTIONS
	═══════════════════════════════════════════════ -->
	<section class="space-y-4" in:fade={{ duration: 300, delay: 200 }}>
		<div class="flex items-center justify-between">
			<div>
				<h2 class="text-xl font-bold">Quick Actions</h2>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each actions as action, i}
				{@const Icon = action.icon}
				{@const tone = toneClasses[action.tone]}
				<a
					href={action.href}
					class="action-card relative overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg {tone.card}"
					style="--stagger: {i}"
				>
					<div class="flex items-start gap-4">
						<!-- Icon -->
						<div
							class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl {tone.icon}"
						>
							<Icon class="h-5 w-5" />
						</div>
						<!-- Content -->
						<div class="min-w-0 flex-1">
							<div class="mb-1 flex items-center justify-between gap-2">
								<h3 class="text-base leading-snug font-semibold">{action.label}</h3>
								{#if action.badge}
									<span class="chip {tone.badge} shrink-0 text-xs">{action.badge}</span>
								{:else}
									<IconArrowRight
										class="text-surface-500-400 h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1"
									/>
								{/if}
							</div>
							<p class=" text-sm leading-relaxed">{action.description}</p>
						</div>
					</div>
				</a>
			{/each}
		</div>
	</section>

	<!-- ═══════════════════════════════════════════════
	     HELP & SUPPORT
	═══════════════════════════════════════════════ -->
	<section
		class="help-card relative overflow-hidden rounded-2xl p-5"
		in:fade={{ duration: 300, delay: 300 }}
	>
		<div class="help-glow" aria-hidden="true"></div>
		<div class="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
			<div class="flex items-start gap-3">
				<div
					class="bg-secondary-500/15 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
				>
					<IconAlertCircle class="text-secondary-400 h-5 w-5" />
				</div>
				<div>
					<h3 class="font-semibold">Need help managing your group?</h3>
					<p class="text-surface-600-400 text-sm">
						Contact our team for assistance with group management, social media integration, or
						volunteer events.
					</p>
				</div>
			</div>
			<a href="mailto:hi@3fp.org" class="btn preset-outlined-secondary-500 shrink-0">
				Contact Support
			</a>
		</div>
	</section>
</div>

<style>
	/* ── Stat Cards ── */
	.stat-card {
		transition:
			transform 200ms ease,
			box-shadow 200ms ease;
		animation: card-in 400ms ease both;
		animation-delay: calc(var(--stagger, 0) * 100ms);
	}

	.stat-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px -4px color-mix(in oklab, var(--color-primary-500) 15%, transparent);
	}

	.stat-glow {
		position: absolute;
		inset: 0;
		opacity: 0.05;
		pointer-events: none;
	}

	/* ── Tip Card ── */
	.tip-card {
		background: color-mix(in oklab, var(--color-warning-500) 8%, var(--color-surface-900) 92%);
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 20%, transparent);
		animation: card-in 400ms ease both;
	}

	.tip-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 70% 50% at 100% 0%,
			color-mix(in oklab, var(--color-warning-500) 12%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	/* ── Action Cards ── */
	.action-card {
		animation: card-in 400ms ease both;
		animation-delay: calc(var(--stagger, 0) * 80ms);
		text-decoration: none;
	}

	/* ── Help Card ── */
	.help-card {
		background: color-mix(in oklab, var(--color-secondary-500) 8%, var(--color-surface-900) 92%);
		border: 1px solid color-mix(in oklab, var(--color-secondary-500) 18%, transparent);
		animation: card-in 400ms ease both;
	}

	.help-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 80% 60% at 0% 100%,
			color-mix(in oklab, var(--color-secondary-500) 12%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	/* ── Animations ── */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

</style>
