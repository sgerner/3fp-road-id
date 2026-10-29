<script>
	import { buildAbsoluteUrl, limitSeoText, toJsonLd } from '#lib/seo';
	import { getRideImage } from '#lib/rides/media';
	import { optimizedImageUrl } from '#lib/media/optimized';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconCalendarDays from '@lucide/svelte/icons/calendar-days';
	import IconHeart from '@lucide/svelte/icons/heart';
	import IconHeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import IconHandCoins from '@lucide/svelte/icons/hand-coins';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconPlus from '@lucide/svelte/icons/plus';
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
			? optimizedImageUrl(getRideImage(nextRide), { width: 768, height: 432, quality: 64 })
			: ''
	);
	const crashSteps = [
		{
			label: 'Get to safety',
			description:
				'Move out of traffic if possible, check yourself and others for injuries, and call for medical help.'
		},
		{
			label: 'Call police & report',
			description:
				'Always report the crash, state the facts without admitting fault, and get the report number.'
		},
		{
			label: 'Document the scene',
			description:
				'Photograph vehicles, bikes, road conditions, and injuries, and exchange contact and insurance details.'
		},
		{
			label: 'Seek medical care',
			description:
				'Get evaluated promptly since symptoms can appear later, and save damaged gear and medical records.'
		},
		{
			label: 'Protect your rights',
			description:
				'Avoid quick settlements or signing statements before reviewing your options and reporting road hazards.'
		}
	];
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
	const tickerWords = [
		'Give 3 feet',
		'Ride together',
		'Arrive safely',
		'Find your people',
		'Every rider is someone'
	];
	const actions = [
		{
			href: '/groups/new',
			label: 'Start a group',
			description: 'Put your crew on the map so new riders can find you.',
			icon: IconUsersRound,
			tone: 'bg-primary-500 text-surface-950 hover:bg-primary-600'
		},
		{
			href: '/ride/new',
			label: 'Post a ride',
			description: 'Share a route, a time, and a pace. Someone is waiting for it.',
			icon: IconPlus,
			tone: 'bg-secondary-500 text-surface-50 hover:bg-secondary-600'
		},
		{
			href: '/donate',
			label: 'Fuel the mission',
			description: 'Fund safety education and advocacy for every person on a bike.',
			icon: IconHandCoins,
			tone: 'bg-tertiary-500 text-surface-950 hover:bg-tertiary-400'
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
			imagesizes="100vw"
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

<!--
	Visual direction: "Lane Lines" — flat, full-bleed color fields borrowed from road markings
	and race posters. Square edges, no stacked cards; sections sit edge to edge and are separated
	by color, hairlines, and the 3-foot ruler motif.
-->
<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<section
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
		aria-labelledby="welcome-heading"
	>
		<div
			class="flex flex-col justify-between gap-10 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<p
				class="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<span>Ride together. Arrive safely.</span>
				{#if data.locationSource && data.area}
					<a
						href="/profile"
						class="border-surface-950 hover:border-tertiary-600 inline-flex items-center gap-1 border-b-2 tracking-normal normal-case hover:no-underline"
					>
						<IconMapPin class="h-3.5 w-3.5" />
						{data.area}
					</a>
				{/if}
			</p>

			<div class="flex flex-col gap-6">
				<h1
					id="welcome-heading"
					class="text-surface-950! m-0 text-[clamp(2.9rem,7.4vw,7rem)] leading-[0.86] font-black tracking-[-0.04em] text-balance uppercase italic"
				>
					Every ride deserves a <span class="text-secondary-500">safe return.</span>
				</h1>
				<p class="m-0 max-w-xl text-lg leading-snug font-medium text-balance sm:text-2xl">
					Find the people, routes, and practical support that make cycling feel possible{data.area
						? `—starting around ${data.area}`
						: ''}.
				</p>
			</div>

			<div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				<a
					href="/groups"
					class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
				>
					<IconUsersRound class="h-5 w-5" /> Find your people
					<IconArrowRight class="h-5 w-5 transition group-hover:translate-x-1" />
				</a>
				<a
					href="/ride"
					class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center justify-center gap-3 border-[3px] px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
				>
					<IconCalendarDays class="h-5 w-5" /> Upcoming rides
				</a>
			</div>
		</div>

		<div class="bg-surface-950 relative min-h-[24rem] sm:min-h-[30rem]">
			<img
				src={heroImageSmall || '/images/default-ride.webp'}
				srcset={heroImageSmall ? `${heroImageSmall} 768w, ${heroImageLarge} 1200w` : undefined}
				sizes="(min-width: 1024px) 50vw, 100vw"
				alt={heroGroup
					? `Cyclists from ${heroGroup.name}`
					: 'Cyclists riding together on an open road'}
				class="absolute inset-0 h-full w-full object-cover"
				width="1200"
				height="736"
				fetchpriority="high"
			/>

			<!-- Signature: the 3-foot ruler -->
			<div
				class="bg-tertiary-500 text-surface-950 absolute inset-y-0 left-0 flex w-12 flex-col items-center justify-between py-4 sm:w-16"
				aria-hidden="true"
			>
				<span class="text-lg leading-none font-black italic sm:text-2xl">3FT</span>
				<span
					class="my-4 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
				></span>
				<span class="text-lg leading-none font-black italic sm:text-2xl">0</span>
			</div>

			{#if heroGroup}
				<a
					href={`/groups/${heroGroup.slug}`}
					class="group bg-surface-950 text-surface-50 hover:bg-secondary-500 absolute right-0 bottom-0 left-12 flex items-center justify-between gap-4 px-5 py-4 transition hover:no-underline sm:left-16"
				>
					<span class="min-w-0">
						<span
							class="text-primary-500 block text-[0.65rem] font-bold tracking-[0.22em] uppercase"
						>
							Riding with
						</span>
						<span class="block truncate text-base font-black sm:text-lg">{heroGroup.name}</span>
						<span class="block truncate text-xs opacity-75">{groupPlace(heroGroup)}</span>
					</span>
					<IconArrowUpRight
						class="text-primary-500 h-6 w-6 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
					/>
				</a>
			{/if}
		</div>
	</section>

	<!-- TICKER -->
	<div class="bg-secondary-500 text-primary-500 overflow-hidden py-3 sm:py-4" aria-hidden="true">
		<div
			class="ticker flex w-max gap-8 text-xl font-black tracking-tight whitespace-nowrap uppercase italic sm:text-3xl"
		>
			{#each [0, 1] as copy (copy)}
				<span class="flex gap-8">
					{#each tickerWords as word (word)}
						<span>{word}</span>
						<span class="text-tertiary-400">✺</span>
					{/each}
				</span>
			{/each}
		</div>
	</div>

	<!-- PEOPLE + NEXT RIDE -->
	<section
		class="bg-surface-950 grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
		aria-labelledby="nearby-heading"
	>
		<div class="flex min-w-0 flex-col gap-8 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
			<div class="flex flex-col gap-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p
						class="text-primary-500 m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
					>
						<IconMapPin class="h-4 w-4" />
						{data.locationSource ? 'Close to home' : 'Community directory'}
					</p>
					<a
						href="/groups"
						class="text-surface-50 hover:text-primary-500 inline-flex items-center gap-1.5 text-sm font-bold"
					>
						All groups <IconArrowRight class="h-4 w-4" />
					</a>
				</div>
				<h2
					id="nearby-heading"
					class="text-surface-50! m-0 max-w-3xl text-4xl leading-[0.92] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-6xl"
				>
					{data.locationSource
						? `People to ride with around ${data.area}`
						: 'Good people are already riding.'}
				</h2>
			</div>

			{#if shownGroups.length}
				<ol class="border-surface-50 m-0 list-none border-t-2 p-0">
					{#each shownGroups as group, index (group.id ?? group.slug)}
						<li class="border-surface-800 border-b">
							<a
								href={`/groups/${group.slug}`}
								class="group text-surface-50 hover:bg-primary-500 hover:text-surface-950 -mx-3 flex min-w-0 items-center gap-4 px-3 py-5 transition hover:no-underline sm:gap-6"
							>
								<span
									class="text-tertiary-500 group-hover:text-secondary-500 w-10 shrink-0 text-2xl font-black italic tabular-nums sm:w-14 sm:text-4xl"
								>
									{String(index + 1).padStart(2, '0')}
								</span>
								<span
									class="bg-surface-50 flex h-14 w-14 shrink-0 items-center justify-center p-1.5 sm:h-16 sm:w-16"
								>
									<img
										src={optimizedImageUrl(group.logo_url || group.cover_photo_url, {
											width: 128,
											height: 128,
											quality: 68
										})}
										alt=""
										class="h-full w-full object-contain"
										width="64"
										height="64"
										loading="lazy"
									/>
								</span>
								<span class="min-w-0 flex-1">
									<strong class="block truncate text-lg leading-tight font-black sm:text-2xl">
										{group.name}
									</strong>
									<span class="mt-1 block truncate text-sm opacity-75">
										{[groupPlace(group), group.tagline].filter(Boolean).join(' · ')}
									</span>
								</span>
								<IconArrowRight
									class="h-6 w-6 shrink-0 opacity-50 transition group-hover:translate-x-1 group-hover:opacity-100"
								/>
							</a>
						</li>
					{/each}
				</ol>
			{:else}
				<div class="border-surface-50 flex flex-col gap-6 border-t-2 pt-6">
					<p class="text-surface-200 m-0 max-w-xl text-lg leading-relaxed">
						No group has claimed this area yet. Browse the directory—or start the community you wish
						existed.
					</p>
					<div class="flex flex-wrap gap-3">
						<a
							href="/groups"
							class="bg-primary-500 text-surface-950 hover:bg-primary-600 inline-flex items-center gap-2 px-6 py-3 font-black uppercase hover:no-underline"
						>
							Browse directory <IconArrowRight class="h-4 w-4" />
						</a>
						<a
							href="/groups/new"
							class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950 inline-flex items-center gap-2 border-2 px-6 py-3 font-black uppercase hover:no-underline"
						>
							Start a group
						</a>
					</div>
				</div>
			{/if}

			{#if data.locationSource === 'profile' || data.locationSource === 'approximate'}
				<a
					href="/profile"
					class="text-surface-300 decoration-tertiary-500 hover:text-surface-50 self-start text-sm underline decoration-2 underline-offset-4"
				>
					{data.locationSource === 'profile' ? 'Change home area' : 'Set a more useful home area'}
				</a>
			{/if}
		</div>

		<aside class="bg-secondary-500 text-surface-50 flex min-w-0 flex-col" aria-label="Next ride">
			{#if nextRide}
				{@const when = formatRideDate(nextRide.nextOccurrenceStart)}
				<div
					class="bg-secondary-800 relative aspect-[16/10] w-full shrink-0 overflow-hidden lg:aspect-auto lg:flex-1"
				>
					<img
						src={nextRideImage}
						alt={nextRide.title}
						class="absolute inset-0 h-full w-full object-cover"
						width="768"
						height="432"
						loading="lazy"
					/>
					<span
						class="bg-primary-500 text-surface-950 absolute top-0 left-0 px-4 py-2 text-xs font-black tracking-[0.2em] uppercase"
					>
						{data.rideSource === 'local' ? 'Next up near you' : 'Featured ride'}
					</span>
				</div>

				<div class="flex flex-col gap-6 px-6 py-8 sm:px-10 lg:px-10 lg:py-10">
					<div class="flex items-end gap-5">
						<span
							class="text-primary-500 text-6xl leading-[0.8] font-black tracking-tighter uppercase italic sm:text-7xl"
						>
							{when.day}
						</span>
						<span class="pb-1 text-sm font-bold tracking-wide uppercase opacity-90"
							>{when.date}</span
						>
					</div>
					<div class="flex flex-col gap-2">
						<h3 class="text-surface-50! m-0 text-2xl leading-tight font-black sm:text-3xl">
							{nextRide.title}
						</h3>
						<p class="m-0 flex items-center gap-1.5 text-sm opacity-85">
							<IconMapPin class="h-4 w-4 shrink-0" />
							<span>{ridePlace(nextRide)}</span>
						</p>
					</div>
					<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
						<a
							href={`/ride/${nextRide.slug}`}
							class="group bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 px-6 py-3 font-black uppercase transition hover:no-underline"
						>
							Open this ride
							<IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
						</a>
						<a href="/ride" class="text-surface-50 text-sm font-bold underline underline-offset-4">
							All rides
						</a>
					</div>
					{#if data.rideSource !== 'featured' && data.locationSource === 'approximate'}
						<p class="m-0 text-xs leading-relaxed opacity-70">
							Based on a broad network region. We never request your precise device location.
						</p>
					{/if}
				</div>
			{:else}
				<div class="flex flex-1 flex-col justify-between gap-10 px-6 py-12 sm:px-10">
					<span
						class="bg-primary-500 text-surface-950 self-start px-4 py-2 text-xs font-black tracking-[0.2em] uppercase"
					>
						Rides
					</span>
					<div class="flex flex-col gap-4">
						<IconBike class="text-primary-500 h-14 w-14" />
						<h3 class="text-surface-50! m-0 text-4xl leading-none font-black uppercase italic">
							The calendar is open.
						</h3>
						<p class="m-0 max-w-sm text-lg leading-relaxed opacity-90">
							Find a ride farther afield, or be the person who puts the next local one on the map.
						</p>
					</div>
					<div class="flex flex-wrap gap-3">
						<a
							href="/ride"
							class="bg-primary-500 text-surface-950 hover:bg-surface-50 px-6 py-3 font-black uppercase hover:no-underline"
						>
							Browse rides
						</a>
						<a
							href="/ride/new"
							class="border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-secondary-500 border-2 px-6 py-3 font-black uppercase hover:no-underline"
						>
							Post one
						</a>
					</div>
				</div>
			{/if}
		</aside>
	</section>

	<!-- MISSION -->
	<section class="bg-tertiary-500 text-surface-950" aria-labelledby="mission-heading">
		<div
			class="grid items-end gap-8 px-6 pt-12 pb-10 sm:px-10 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-14 lg:px-14 lg:pt-16"
		>
			<p
				class="m-0 text-[clamp(7rem,22vw,17rem)] leading-[0.78] font-black tracking-[-0.06em] italic"
				aria-hidden="true"
			>
				3<span class="text-transparent [-webkit-text-stroke:3px_var(--color-surface-950)]">FT</span>
			</p>
			<div class="flex max-w-2xl flex-col gap-5 pb-2">
				<p class="m-0 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase">
					<IconHeart class="h-4 w-4" /> The distance that matters
				</p>
				<h2
					id="mission-heading"
					class="text-surface-950! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] text-balance uppercase sm:text-6xl"
				>
					Three feet can change a life.
				</h2>
				<p class="m-0 text-lg leading-snug font-medium sm:text-xl">
					Help build streets where every person on a bike is seen, respected, and able to come home
					safely.
				</p>
				<div class="flex flex-col gap-3 pt-2 sm:flex-row">
					<a
						href="/volunteer"
						class="group bg-surface-950 text-tertiary-400 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-2 px-7 py-4 font-black tracking-wide uppercase transition hover:no-underline"
					>
						<IconHeartHandshake class="h-5 w-5" /> Volunteer
					</a>
					<a
						href="/donate"
						class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-tertiary-400 inline-flex items-center justify-center gap-2 border-[3px] px-7 py-4 font-black tracking-wide uppercase transition hover:no-underline"
					>
						Support the mission
					</a>
				</div>
			</div>
		</div>

		<!-- Ruler band: 0 → 3 ft -->
		<div class="border-surface-950 grid grid-cols-3 border-t-[3px]" aria-hidden="true">
			{#each ['0', '1 ft', '2 ft'] as mark, i (mark)}
				<div class="border-surface-950 relative h-14 border-l-[3px] first:border-l-0">
					<span
						class="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(90deg,var(--color-surface-950)_0_2px,transparent_2px_calc(100%/12))]"
					></span>
					<span class="absolute bottom-2 left-3 text-sm font-black uppercase">{mark}</span>
					{#if i === 2}
						<span class="absolute right-3 bottom-2 text-sm font-black uppercase">3 ft</span>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<!-- SAFETY -->
	<section
		class="bg-surface-950 px-6 py-14 sm:px-10 lg:px-14 lg:py-20"
		aria-labelledby="safety-heading"
	>
		<div class="flex flex-wrap items-end justify-between gap-6">
			<div class="flex flex-col gap-4">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					Keep this close
				</p>
				<h2
					id="safety-heading"
					class="text-surface-50! m-0 max-w-3xl text-4xl leading-[0.92] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-6xl"
				>
					Know what to do before you need it.
				</h2>
			</div>
			<a
				href="/learn"
				class="group border-primary-500 text-surface-50 hover:text-primary-500 inline-flex items-center gap-2 border-b-[3px] pb-1 font-black uppercase hover:no-underline"
			>
				Safety library <IconArrowRight class="h-4 w-4 transition group-hover:translate-x-1" />
			</a>
		</div>

		<!-- lane divider -->
		<div
			class="my-10 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)] lg:my-14"
			aria-hidden="true"
		></div>

		<div class="grid gap-14 lg:grid-cols-2 lg:gap-0">
			<div class="lg:border-surface-800 lg:border-r lg:pr-12">
				<div class="mb-8 flex items-center gap-4">
					<span
						class="bg-tertiary-500 text-surface-950 flex h-12 w-12 shrink-0 items-center justify-center"
					>
						<IconShieldCheck class="h-6 w-6" />
					</span>
					<div>
						<h3 class="text-surface-50! m-0 text-2xl font-black uppercase sm:text-3xl">
							After a crash
						</h3>
						<p class="text-surface-300 m-0 text-sm">
							Five steps to protect yourself and your rights
						</p>
					</div>
				</div>
				<ol class="m-0 list-none p-0">
					{#each crashSteps as step, index (step.label)}
						<li class="border-surface-800 flex gap-5 border-t py-5">
							<span
								class="text-tertiary-500 w-12 shrink-0 text-3xl leading-none font-black italic tabular-nums"
							>
								{String(index + 1).padStart(2, '0')}
							</span>
							<p class="m-0 min-w-0 leading-relaxed">
								<strong class="text-surface-50 block text-lg font-black">{step.label}</strong>
								<span class="text-surface-300">{step.description}</span>
							</p>
						</li>
					{/each}
				</ol>
			</div>

			<div class="lg:pl-12">
				<div class="mb-8 flex items-center gap-4">
					<span
						class="bg-primary-500 text-surface-950 flex h-12 w-12 shrink-0 items-center justify-center"
					>
						<IconBike class="h-6 w-6" />
					</span>
					<div>
						<h3 class="text-surface-50! m-0 text-2xl font-black uppercase sm:text-3xl">
							Stay A.L.E.R.T.
						</h3>
						<p class="text-surface-300 m-0 text-sm">Everyday habits for confident road riding</p>
					</div>
				</div>
				<ul class="m-0 list-none p-0">
					{#each alertPrinciples as item (item.letter)}
						<li class="border-surface-800 flex gap-5 border-t py-5">
							<span
								class="text-primary-500 w-12 shrink-0 text-5xl leading-[0.8] font-black italic"
								aria-hidden="true"
							>
								{item.letter}
							</span>
							<p class="m-0 min-w-0 leading-relaxed">
								<strong class="text-surface-50 block text-lg font-black">{item.label}</strong>
								<span class="text-surface-300">{item.description}</span>
							</p>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</section>

	<!-- ACTION TRIPTYCH -->
	<nav class="grid md:grid-cols-3" aria-label="Get involved">
		{#each actions as action (action.href)}
			<a
				href={action.href}
				class="group flex min-h-64 flex-col justify-between gap-10 px-6 py-10 transition hover:no-underline sm:px-10 lg:min-h-80 lg:px-12 {action.tone}"
			>
				<span class="flex items-start justify-between">
					<action.icon class="h-10 w-10" />
					<IconArrowUpRight
						class="h-10 w-10 transition group-hover:translate-x-1 group-hover:-translate-y-1"
					/>
				</span>
				<span>
					<span
						class="block text-4xl leading-[0.9] font-black tracking-[-0.03em] uppercase italic lg:text-5xl"
					>
						{action.label}
					</span>
					<span class="mt-3 block max-w-xs text-base leading-snug font-medium opacity-90">
						{action.description}
					</span>
				</span>
			</a>
		{/each}
	</nav>
</div>

<style>
	@keyframes ticker {
		to {
			transform: translateX(-50%);
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.ticker {
			animation: ticker 40s linear infinite;
		}
	}
</style>
