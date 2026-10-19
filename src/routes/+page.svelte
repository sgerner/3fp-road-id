<script>
	import { buildAbsoluteUrl, limitSeoText, toJsonLd } from '#lib/seo';
	import { getRideImage } from '#lib/rides/media';
	import { optimizedImageUrl } from '#lib/media/optimized';
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
	const heroImageSmall = $derived(
		heroGroup?.cover_photo_url
			? optimizedImageUrl(heroGroup.cover_photo_url, { width: 768, height: 736, quality: 64 })
			: ''
	);
	const heroImageLarge = $derived(
		heroGroup?.cover_photo_url
			? optimizedImageUrl(heroGroup.cover_photo_url, { width: 1200, height: 736, quality: 68 })
			: ''
	);
	const nextRideImage = $derived(
		nextRide
			? optimizedImageUrl(getRideImage(nextRide), { width: 768, height: 768, quality: 64 })
			: ''
	);
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
		toJsonLd({
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
	{#if heroImageLarge}
		<link
			rel="preload"
			as="image"
			href={heroImageLarge}
			imagesrcset={`${heroImageSmall} 768w, ${heroImageLarge} 1200w`}
			imagesizes="(min-width: 1024px) 45vw, 100vw"
			fetchpriority="high"
		/>
	{/if}
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

<div
	class="mx-auto flex w-full max-w-7xl flex-col gap-16 py-2 sm:gap-24 sm:py-6 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-current"
>
	<section
		class="bg-secondary-950 grid overflow-hidden rounded-3xl text-white lg:grid-cols-[1.1fr_0.9fr]"
		aria-labelledby="welcome-heading"
	>
		<div class="flex flex-col justify-between gap-12 p-7 sm:p-12 lg:p-14">
			<div class="flex flex-wrap items-center gap-4">
				<p
					class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase"
				>
					<IconBike class="h-5 w-5" /> A little space. A better world.
				</p>
				{#if data.locationSource}
					<a
						href="/profile"
						class="inline-flex items-center gap-1.5 text-sm text-white/80 underline underline-offset-4"
					>
						<IconMapPin class="h-3.5 w-3.5" />{data.area}
					</a>
				{/if}
			</div>
			<div class="space-y-6">
				<h1
					id="welcome-heading"
					class="text-4xl leading-[0.98] font-black tracking-tight text-balance !text-white sm:text-6xl lg:text-5xl xl:text-6xl"
				>
					Good people.<br />Open roads.<br /><span class="text-primary-500">Room to ride.</span>
				</h1>
				<p class="max-w-lg text-lg leading-relaxed text-white/80">
					Every ride deserves a safe return. Find your cycling community and help make the road a
					more welcoming place{data.area ? `—starting around ${data.area}` : ''}.
				</p>
				<div class="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
					<a
						href="/groups"
						class="btn bg-primary-500 text-secondary-950 hover:bg-primary-300 gap-2 px-6 py-3 font-bold"
					>
						Find your people <IconArrowRight class="h-4 w-4" />
					</a>
					<a
						href="/ride"
						class="btn gap-2 border border-white/40 px-6 py-3 font-bold text-white hover:bg-white/10"
					>
						<IconCalendarDays class="h-5 w-5" /> Find a ride
					</a>
				</div>
			</div>
			<p class="border-t border-white/20 pt-5 text-sm text-white/70">
				For the everyday rider. The weekend explorer. And everyone who shares the road.
			</p>
		</div>
		<div class="relative min-h-80 lg:min-h-full">
			<img
				src={heroImageSmall || '/images/default-ride.webp'}
				srcset={heroImageSmall ? `${heroImageSmall} 768w, ${heroImageLarge} 1200w` : undefined}
				sizes="(min-width: 1024px) 45vw, 100vw"
				alt={heroGroup
					? `Cyclists from ${heroGroup.name}`
					: 'Cyclists sharing a ride on an open road'}
				class="absolute inset-0 h-full w-full object-cover"
				width="1200"
				height="736"
				fetchpriority="high"
				decoding="async"
			/>
			<div
				class="from-secondary-950/90 absolute inset-0 bg-gradient-to-t via-transparent to-transparent"
			></div>
			<div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 p-7 sm:p-10">
				<p class="text-3xl leading-tight font-black text-white">Life is better<br />on a bike.</p>
				{#if heroGroup}
					<a
						href={`/groups/${heroGroup.slug}`}
						class="max-w-44 text-right text-sm text-white underline-offset-4 hover:underline"
					>
						<span class="block font-bold">{heroGroup.name}</span>
						<span class="text-white/80"
							>{groupPlace(heroGroup)} <IconArrowRight class="inline h-3.5 w-3.5" /></span
						>
					</a>
				{/if}
			</div>
		</div>
	</section>

	<nav
		aria-label="Explore 3 Feet Please"
		class="divide-surface-500/20 border-surface-500/20 -mt-8 grid divide-y border-b sm:-mt-12 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
	>
		{#each [{ href: '/groups', icon: IconUsersRound, label: 'Find your community', detail: 'Good company. Great miles.' }, { href: '/learn', icon: IconShieldCheck, label: 'Ride with confidence', detail: 'Practical know-how for every road.' }, { href: '/volunteer', icon: IconHeartHandshake, label: 'Make a difference', detail: 'Safer streets start with us.' }] as item}
			<a
				href={item.href}
				class="group hover:bg-secondary-500/10 flex items-center gap-4 px-3 py-6 transition sm:px-6"
			>
				<item.icon class="text-primary-500 h-6 w-6 shrink-0" />
				<span class="flex-1"
					><strong class="block text-base">{item.label}</strong><span
						class="mt-1 block text-xs opacity-70">{item.detail}</span
					></span
				>
				<IconArrowRight class="h-4 w-4 shrink-0 transition group-hover:translate-x-1" />
			</a>
		{/each}
	</nav>

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
						<a
							href={`/groups/${group.slug}`}
							class="group hover:bg-secondary-500/10 flex items-center gap-4 rounded-xl px-3 py-5 transition sm:gap-6"
						>
							<span class="text-sm font-black tabular-nums opacity-70">0{index + 1}</span>
							<img
								src={optimizedImageUrl(group.logo_url || group.cover_photo_url, {
									width: 96,
									height: 96,
									quality: 68
								})}
								alt=""
								class="h-12 w-12 shrink-0 rounded-full object-cover sm:h-14 sm:w-14"
								width="56"
								height="56"
								loading="lazy"
								decoding="async"
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
			class="relative min-h-[34rem] overflow-hidden rounded-3xl p-6 sm:p-8 {nextRide
				? 'preset-filled-surface-950 text-surface-50'
				: 'preset-tonal-secondary'}"
			aria-label="Next ride"
		>
			{#if nextRide}
				<img
					src={nextRideImage}
					alt=""
					class="absolute inset-0 h-full w-full object-cover"
					width="768"
					height="768"
					loading="lazy"
					decoding="async"
				/>
				<div
					class="from-surface-950 via-surface-950/75 to-surface-950/20 absolute inset-0 bg-gradient-to-t"
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
		class="bg-primary-500 text-secondary-950 grid items-center gap-8 rounded-3xl p-7 sm:p-10 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-12 lg:p-12"
		aria-labelledby="mission-heading"
	>
		<div
			aria-hidden="true"
			class="border-secondary-950 border-b-4 pb-3 text-8xl leading-none font-black tracking-tighter lg:text-9xl"
		>
			3<span class="text-3xl tracking-normal"> ft</span>
			<div class="mt-3 flex justify-between text-xl"><span>←</span><span>→</span></div>
		</div>
		<div class="max-w-4xl">
			<p
				class="mb-4 flex items-center gap-2 text-sm font-bold tracking-[0.18em] uppercase opacity-65"
			>
				<IconHeart class="h-4 w-4" /> The distance that matters
			</p>
			<h2
				id="mission-heading"
				class="!text-secondary-950 text-4xl leading-tight font-black tracking-tight text-balance sm:text-5xl"
			>
				Three feet can change a life.
			</h2>
			<p class="mt-5 max-w-2xl text-lg leading-relaxed opacity-75">
				Help build streets where every person on a bike is seen, respected, and able to come home
				safely.
			</p>
		</div>
		<div class="flex flex-col gap-3 sm:flex-row lg:flex-col">
			<a href="/volunteer" class="btn bg-secondary-950 hover:bg-secondary-800 gap-2 text-white"
				><IconHeartHandshake class="h-5 w-5" /> Volunteer</a
			>
			<a
				href="/donate"
				class="btn border-secondary-950 text-secondary-950 hover:bg-secondary-950/10 border"
				>Support the mission</a
			>
		</div>
	</section>

	<section class="border-surface-500/20 space-y-8 border-t pt-12" aria-labelledby="safety-heading">
		<div class="max-w-3xl">
			<p class="mb-3 text-sm font-bold tracking-[0.18em] uppercase opacity-60">Keep this close</p>
			<h2 id="safety-heading" class="text-4xl font-black tracking-tight text-balance sm:text-5xl">
				Know what to do before you need it.
			</h2>
		</div>

		<div class="divide-surface-500/20 grid gap-8 md:grid-cols-2 md:gap-0 md:divide-x">
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
