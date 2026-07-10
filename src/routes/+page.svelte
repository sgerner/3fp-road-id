<script>
	import { buildAbsoluteUrl, limitSeoText } from '$lib/seo';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconCalendarDays from '@lucide/svelte/icons/calendar-days';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconShieldCheck from '@lucide/svelte/icons/shield-check';
	import IconUsersRound from '@lucide/svelte/icons/users-round';

	let { data } = $props();

	const siteOrigin = $derived(data.siteOrigin || '');
	const canonicalUrl = $derived(siteOrigin ? buildAbsoluteUrl(siteOrigin, '/') : '/');
	const seoTitle = '3 Feet Please';
	const seoDescription = $derived(
		limitSeoText(
			'Find cycling groups, public rides, volunteer opportunities, and road-safety resources from 3 Feet Please.',
			160
		)
	);
	const seoImage = $derived(
		siteOrigin ? buildAbsoluteUrl(siteOrigin, '/3fp.png?v=2') : '/3fp.png?v=2'
	);
	const shownGroups = $derived(
		data.locationSource ? (data.localGroups ?? []) : (data.featuredGroups ?? [])
	);
	const heroGroup = $derived(
		[...(data.localGroups ?? []), ...(data.featuredGroups ?? [])].find(
			(group) => group.cover_photo_url
		) ?? null
	);
	const nextRide = $derived(data.localRides?.[0] ?? null);
	const alertPrinciples = [
		{
			letter: 'A',
			label: 'Aware',
			description:
				'Scan ahead for turning cars, opening doors, debris, and changing road conditions.'
		},
		{
			letter: 'L',
			label: 'Lawful',
			description: 'Ride predictably with traffic, obey signals, and use the correct lane position.'
		},
		{
			letter: 'E',
			label: 'Eye-catching',
			description:
				'Use bright lights, visible clothing, and a road position where drivers can see you.'
		},
		{
			letter: 'R',
			label: 'Ride ready',
			description: 'Check your bike, helmet, route, weather, and supplies before rolling out.'
		},
		{
			letter: 'T',
			label: 'Telegraph',
			description: 'Signal, look, and position yourself early so every move is easy to understand.'
		}
	];
	const seoStructuredData = $derived.by(() =>
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'Organization',
			name: seoTitle,
			url: canonicalUrl,
			description: seoDescription,
			logo: siteOrigin ? buildAbsoluteUrl(siteOrigin, '/logo.png?v=2') : '/logo.png?v=2',
			sameAs: ['https://3feetplease.org']
		})
	);

	function formatRideDate(value) {
		if (!value) return { day: 'Soon', date: 'Time coming soon' };
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return { day: 'Soon', date: 'Time coming soon' };
		return {
			day: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date),
			date: new Intl.DateTimeFormat(undefined, {
				month: 'long',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			}).format(date)
		};
	}

	function groupPlace(group) {
		return (
			[group.city, group.state_region].filter(Boolean).join(', ') ||
			group.country ||
			'Location coming soon'
		);
	}

	function ridePlace(ride) {
		return ride.startLocationName || ride.group?.city || 'Location coming soon';
	}
</script>

<svelte:head>
	<title>{seoTitle} | Find your cycling community</title>
	<meta name="description" content={seoDescription} />
	<meta
		name="robots"
		content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	/>
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={seoTitle} />
	<meta property="og:title" content={`${seoTitle} | Find your cycling community`} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content={seoImage} />
	<meta property="og:image:alt" content="3 Feet Please logo" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={`${seoTitle} | Find your cycling community`} />
	<meta name="twitter:description" content={seoDescription} />
	<meta name="twitter:image" content={seoImage} />
	{@html '<script type="application/ld+json">' + seoStructuredData + '</script>'}
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-16 py-2 sm:gap-24 sm:py-6">
	<section
		class="card preset-filled-surface-950 relative min-h-[38rem] overflow-hidden text-surface-50 sm:min-h-[42rem] lg:min-h-[46rem]"
		aria-labelledby="welcome-heading"
	>
		{#if heroGroup?.cover_photo_url}
			<img
				src={heroGroup.cover_photo_url}
				alt="Cyclists from {heroGroup.name}"
				class="absolute inset-0 h-full w-full object-cover object-center"
			/>
			<div
				class="absolute inset-0 bg-gradient-to-r from-surface-950 via-surface-950/90 to-surface-950/15"
			></div>
			<div
				class="absolute inset-0 bg-gradient-to-t from-surface-950/80 via-transparent to-transparent"
			></div>
		{/if}

		<div
			class="relative z-10 flex min-h-[38rem] flex-col justify-between p-6 sm:min-h-[42rem] sm:p-10 lg:min-h-[46rem] lg:p-14"
		>
			<div class="flex items-center justify-between gap-4">
				<p class="flex items-center gap-2 text-sm font-bold tracking-[0.18em] uppercase">
					<IconBike class="h-5 w-5" /> 3 Feet Please
				</p>
				{#if data.locationSource}
					<a href="/profile" class="chip preset-tonal-surface gap-1.5 backdrop-blur-md">
						<IconMapPin class="h-3.5 w-3.5" />
						{data.area}
					</a>
				{/if}
			</div>

			<div class="max-w-3xl space-y-7 py-12">
				<p class="text-sm font-bold tracking-[0.22em] uppercase opacity-75">
					Ride together. Arrive safely.
				</p>
				<h1
					id="welcome-heading"
					class="text-5xl leading-[0.94] font-black tracking-tight text-balance sm:text-7xl lg:text-8xl"
				>
					Every ride deserves a safe return.
				</h1>
				<p class="max-w-2xl text-lg leading-relaxed text-balance opacity-85 sm:text-xl">
					Find the people, routes, and practical support that make cycling feel possible{data.area
						? `—starting around ${data.area}`
						: ''}.
				</p>
				<div class="flex flex-col gap-3 sm:flex-row">
					<a href="/groups" class="btn preset-filled-primary-500 gap-2 px-6 py-3 font-bold">
						<IconUsersRound class="h-5 w-5" /> Find your people <IconArrowRight class="h-4 w-4" />
					</a>
					<a
						href="/ride"
						class="btn preset-tonal-surface gap-2 px-6 py-3 font-bold backdrop-blur-md"
					>
						<IconCalendarDays class="h-5 w-5" /> See upcoming rides
					</a>
				</div>
			</div>

			{#if heroGroup}
				<a
					href={`/groups/${heroGroup.slug}`}
					class="group ml-auto max-w-sm text-right text-sm opacity-80 transition hover:opacity-100"
				>
					<span class="font-bold">{heroGroup.name}</span>
					<span class="block"
						>{groupPlace(heroGroup)}
						<IconArrowRight
							class="inline h-3.5 w-3.5 transition group-hover:translate-x-0.5"
						/></span
					>
				</a>
			{/if}
		</div>
	</section>

	<section
		class="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:gap-16"
		aria-labelledby="nearby-heading"
	>
		<div>
			<div
				class="mb-3 flex items-center gap-2 text-sm font-bold tracking-[0.18em] uppercase opacity-60"
			>
				<IconMapPin class="h-4 w-4" />
				{data.locationSource ? 'Close to home' : 'Community directory'}
			</div>
			<h2
				id="nearby-heading"
				class="max-w-2xl text-4xl leading-tight font-black tracking-tight text-balance sm:text-5xl"
			>
				{data.locationSource
					? `People to ride with around ${data.area}`
					: 'Good people are already riding.'}
			</h2>

			{#if shownGroups.length}
				<div class="divide-surface-500/20 mt-8 divide-y">
					{#each shownGroups as group, index}
						<a href={`/groups/${group.slug}`} class="group flex items-center gap-4 py-5 sm:gap-6">
							<span class="text-sm font-black tabular-nums opacity-35">0{index + 1}</span>
							<img
								src={group.logo_url || group.cover_photo_url}
								alt=""
								class="h-12 w-12 shrink-0 rounded-full object-cover sm:h-14 sm:w-14"
								loading="lazy"
							/>
							<span class="min-w-0 flex-1">
								<strong class="block text-lg leading-tight sm:text-xl">{group.name}</strong>
								<span class="mt-1 block truncate text-sm opacity-65"
									>{group.tagline || groupPlace(group)}</span
								>
							</span>
							<IconArrowRight
								class="h-5 w-5 shrink-0 opacity-45 transition group-hover:translate-x-1 group-hover:opacity-100"
							/>
						</a>
					{/each}
				</div>
			{:else}
				<p class="mt-6 max-w-xl text-lg leading-relaxed opacity-70">
					No group has claimed this area yet. Browse the directory—or start the community you wish
					existed.
				</p>
			{/if}

			<div class="mt-6 flex flex-wrap items-center gap-4">
				<a href="/groups" class="anchor inline-flex items-center gap-1 font-bold"
					>Explore every group <IconArrowRight class="h-4 w-4" /></a
				>
				{#if data.locationSource === 'profile'}
					<a href="/profile" class="text-sm opacity-60 hover:opacity-100">Change home area</a>
				{:else if data.locationSource === 'approximate'}
					<a href="/profile" class="text-sm opacity-60 hover:opacity-100"
						>Set a more useful home area</a
					>
				{/if}
			</div>
		</div>

		<aside
			class="relative min-h-[34rem] overflow-hidden p-6 sm:p-8 {nextRide
				? 'preset-filled-surface-950 text-surface-50'
				: 'preset-tonal-secondary'}"
			aria-label="Next ride"
		>
			{#if nextRide}
				<img
					src={nextRide.imageUrls[0]}
					alt=""
					class="absolute inset-0 h-full w-full object-cover"
				/>
				<div
					class="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/75 to-surface-950/20"
				></div>
			{/if}

			<div class="relative z-10 flex min-h-full flex-col justify-between gap-10">
				<div class="flex items-center justify-between gap-3">
					<p class="flex items-center gap-2 text-sm font-bold tracking-[0.16em] uppercase">
						<IconCalendarDays class="h-4 w-4" />
						{data.rideSource === 'local' ? 'Next up near you' : 'Featured ride'}
					</p>
					<a href="/ride" class="btn btn-sm preset-tonal-surface backdrop-blur-md">All rides</a>
				</div>

				{#if nextRide}
					{@const when = formatRideDate(nextRide.nextOccurrenceStart)}
					<div class="space-y-5">
						<p class="text-6xl font-black tracking-tight sm:text-7xl">{when.day}</p>
						<div>
							<h3 class="text-2xl leading-tight font-black">{nextRide.title}</h3>
							<p class="mt-3 text-sm leading-relaxed opacity-75">
								{when.date}<br />{ridePlace(nextRide)}
							</p>
						</div>
						<a href={`/ride/${nextRide.slug}`} class="btn preset-filled-primary-500 gap-2"
							>Open this ride <IconArrowRight class="h-4 w-4" /></a
						>
					</div>
				{:else}
					<div class="space-y-5">
						<IconBike class="h-16 w-16 opacity-35" />
						<div>
							<h3 class="text-2xl font-black">The calendar is open.</h3>
							<p class="mt-3 leading-relaxed opacity-75">
								Find a ride farther afield, or be the person who puts the next local one on the map.
							</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<a href="/ride" class="btn preset-filled-secondary-500">Browse rides</a><a
								href="/ride/new"
								class="btn preset-outlined-secondary-500">Post one</a
							>
						</div>
					</div>
				{/if}

				{#if data.rideSource !== 'featured' && data.locationSource === 'approximate'}
					<p class="text-xs leading-relaxed opacity-55">
						Based on a broad network region. We never request your precise device location.
					</p>
				{/if}
			</div>
		</aside>
	</section>

	<section
		class="preset-tonal-primary grid items-end gap-8 p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-14"
		aria-labelledby="mission-heading"
	>
		<div class="max-w-4xl">
			<p
				class="mb-4 flex items-center gap-2 text-sm font-bold tracking-[0.18em] uppercase opacity-65"
			>
				<IconHeart class="h-4 w-4" /> The distance that matters
			</p>
			<h2
				id="mission-heading"
				class="text-4xl leading-tight font-black tracking-tight text-balance sm:text-6xl"
			>
				Three feet can change a life.
			</h2>
			<p class="mt-5 max-w-2xl text-lg leading-relaxed opacity-75">
				Help build streets where every person on a bike is seen, respected, and able to come home
				safely.
			</p>
		</div>
		<div class="flex flex-col gap-3 sm:flex-row lg:flex-col">
			<a href="/volunteer" class="btn preset-filled-primary-500 gap-2"
				><IconHeartHandshake class="h-5 w-5" /> Volunteer</a
			>
			<a href="/donate" class="btn preset-outlined-primary-500">Support the mission</a>
		</div>
	</section>

	<section class="space-y-8" aria-labelledby="safety-heading">
		<div class="max-w-3xl">
			<p class="mb-3 text-sm font-bold tracking-[0.18em] uppercase opacity-60">Keep this close</p>
			<h2 id="safety-heading" class="text-4xl font-black tracking-tight text-balance sm:text-5xl">
				Know what to do before you need it.
			</h2>
		</div>

		<div class="divide-surface-500/20 grid gap-8 md:grid-cols-2 md:divide-x md:gap-0">
			<div class="md:pr-10">
				<div class="mb-5 flex items-center gap-3">
					<IconShieldCheck class="text-error-600-400 h-7 w-7" />
					<h3 class="text-2xl font-black">After a crash</h3>
				</div>
				<ol class="space-y-3 text-sm sm:text-base">
					{#each ['Get out of traffic and check for injuries', 'Call police and make a report', 'Photograph the scene and exchange information', 'Seek medical care', 'Protect your records and your rights'] as step, index}
						<li class="flex gap-4">
							<span class="font-black opacity-40">0{index + 1}</span><span>{step}</span>
						</li>
					{/each}
				</ol>
			</div>
			<div class="md:pl-10">
				<div class="mb-5 flex items-center gap-3">
					<IconBike class="text-primary-600-400 h-7 w-7" />
					<h3 class="text-2xl font-black">Stay A.L.E.R.T.</h3>
				</div>
				<div class="space-y-5">
					{#each alertPrinciples as item}
						<div class="grid grid-cols-[2rem_1fr] gap-3">
							<strong class="text-2xl font-black">{item.letter}</strong>
							<div>
								<p class="font-bold">{item.label}</p>
								<p class="mt-1 text-sm leading-relaxed opacity-70">{item.description}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<a href="/learn" class="anchor inline-flex items-center gap-1 font-bold"
			>Explore the complete safety library <IconArrowRight class="h-4 w-4" /></a
		>
	</section>
</div>
