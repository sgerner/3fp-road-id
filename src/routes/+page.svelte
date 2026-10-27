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

<div class="mx-auto flex w-full max-w-7xl flex-col gap-8 py-2 sm:gap-10 sm:py-6">
	<section
		class="card preset-filled-surface-50-950 preset-outlined-surface-200-800 relative overflow-hidden"
		aria-labelledby="welcome-heading"
	>
		<img
			src={heroImageSmall || '/images/default-ride.webp'}
			srcset={heroImageSmall ? `${heroImageSmall} 768w, ${heroImageLarge} 1200w` : undefined}
			sizes="100vw"
			alt={heroGroup
				? `Cyclists from ${heroGroup.name}`
				: 'Cyclists riding together on an open road'}
			class="absolute inset-0 h-full w-full object-cover object-center"
			width="1200"
			height="736"
			fetchpriority="high"
		/>
		<div
			class="from-surface-950 via-surface-950/90 to-surface-950/35 absolute inset-0 bg-gradient-to-r"
		></div>
		<div
			class="from-surface-950/90 via-surface-950/25 absolute inset-0 bg-gradient-to-t to-transparent"
		></div>

		<div
			class="relative z-10 flex min-h-[22rem] flex-col justify-between gap-8 p-6 sm:min-h-[26rem] sm:p-10 lg:min-h-[28rem] lg:p-12"
		>
			<div class="max-w-3xl space-y-5">
				<p class="label m-0 flex w-auto flex-wrap items-center gap-2 tracking-[0.2em] opacity-80">
					<span>Ride together. Arrive safely.</span>
					{#if data.locationSource && data.area}
						<span aria-hidden="true">·</span>
						<a href="/profile" class="anchor inline-flex items-center gap-1 tracking-normal">
							<IconMapPin class="h-3.5 w-3.5" />
							{data.area}
						</a>
					{/if}
				</p>
				<h1
					id="welcome-heading"
					class="text-4xl leading-[0.96] font-black tracking-tight text-balance sm:text-6xl lg:text-7xl"
				>
					Every ride deserves a safe return.
				</h1>
				<p class="m-0 max-w-2xl text-base leading-relaxed text-balance opacity-90 sm:text-xl">
					Find the people, routes, and practical support that make cycling feel possible{data.area
						? `—starting around ${data.area}`
						: ''}.
				</p>
				<div class="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
					<a href="/groups" class="btn preset-filled-primary-500 gap-2 px-6 py-3 font-bold">
						<IconUsersRound class="h-5 w-5" /> Find your people <IconArrowRight class="h-4 w-4" />
					</a>
					<a
						href="/ride"
						class="btn preset-tonal-surface preset-outlined-surface-300-700 gap-2 px-6 py-3 font-bold"
					>
						<IconCalendarDays class="h-5 w-5" /> See upcoming rides
					</a>
				</div>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs sm:text-sm">
				<p class="m-0 opacity-75">Local clubs, public rides, and practical road-safety guides.</p>
				{#if heroGroup}
					<a
						href={`/groups/${heroGroup.slug}`}
						class="anchor inline-flex items-center gap-1.5 opacity-85 hover:opacity-100"
					>
						<span class="font-bold">{heroGroup.name}</span>
						<span class="opacity-75">· {groupPlace(heroGroup)}</span>
						<IconArrowRight class="h-3.5 w-3.5" />
					</a>
				{/if}
			</div>
		</div>
	</section>

	<section class="grid grid-cols-1 gap-6 lg:grid-cols-12" aria-labelledby="nearby-heading">
		<div
			class="card preset-tonal-surface preset-outlined-surface-200-800 flex min-w-0 flex-col justify-between gap-6 p-6 sm:p-8 lg:col-span-7"
		>
			<div class="space-y-5">
				<div class="space-y-2">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<p class="label m-0 flex w-auto items-center gap-2 tracking-[0.18em] opacity-70">
							<IconMapPin class="h-4 w-4" />
							{data.locationSource ? 'Close to home' : 'Community directory'}
						</p>
						<a href="/groups" class="anchor inline-flex items-center gap-1 text-xs font-bold">
							All groups <IconArrowRight class="h-3.5 w-3.5" />
						</a>
					</div>
					<h2
						id="nearby-heading"
						class="text-2xl leading-tight font-black tracking-tight text-balance sm:text-4xl"
					>
						{data.locationSource
							? `People to ride with around ${data.area}`
							: 'Good people are already riding.'}
					</h2>
				</div>

				{#if shownGroups.length}
					<div class="divide-surface-200-800 divide-y">
						{#each shownGroups as group}
							<a
								href={`/groups/${group.slug}`}
								class="group flex min-w-0 items-center gap-4 py-4 transition first:pt-2 last:pb-0 hover:opacity-85"
							>
								<span
									class="badge-icon preset-filled-surface-950-50 h-12 w-12 shrink-0 overflow-hidden p-1 sm:h-14 sm:w-14"
								>
									<img
										src={optimizedImageUrl(group.logo_url || group.cover_photo_url, {
											width: 96,
											height: 96,
											quality: 68
										})}
										alt=""
										class="h-full w-full object-contain"
										width="56"
										height="56"
									/>
								</span>
								<span class="min-w-0 flex-1">
									<strong class="block truncate text-base leading-snug sm:text-lg">
										{group.name}
									</strong>
									<span class="mt-0.5 block truncate text-xs opacity-75 sm:text-sm">
										{[groupPlace(group), group.tagline].filter(Boolean).join(' · ')}
									</span>
								</span>
								<IconArrowRight
									class="h-5 w-5 shrink-0 opacity-60 transition group-hover:translate-x-1 group-hover:opacity-100"
								/>
							</a>
						{/each}
					</div>
				{:else}
					<div class="space-y-4 py-2">
						<p class="m-0 text-base leading-relaxed opacity-85">
							No group has claimed this area yet. Browse the directory—or start the community you
							wish existed.
						</p>
						<div class="flex flex-wrap gap-3">
							<a href="/groups" class="btn preset-filled-primary-500 gap-2 font-bold">
								Browse directory <IconArrowRight class="h-4 w-4" />
							</a>
							<a
								href="/groups/new"
								class="btn preset-tonal-surface preset-outlined-surface-300-700 font-bold"
							>
								Start a group
							</a>
						</div>
					</div>
				{/if}
			</div>

			{#if data.locationSource === 'profile' || data.locationSource === 'approximate'}
				<div class="pt-2 text-xs">
					<a href="/profile" class="anchor opacity-75 hover:opacity-100">
						{data.locationSource === 'profile' ? 'Change home area' : 'Set a more useful home area'}
					</a>
				</div>
			{/if}
		</div>

		<aside
			class="card preset-tonal-surface preset-outlined-surface-200-800 flex min-w-0 flex-col justify-between overflow-hidden lg:col-span-5"
			aria-label="Next ride"
		>
			{#if nextRide}
				{@const when = formatRideDate(nextRide.nextOccurrenceStart)}
				<div class="h-52 w-full shrink-0 overflow-hidden sm:h-56">
					<img
						src={nextRideImage}
						alt={nextRide.title}
						class="h-full w-full object-cover"
						width="768"
						height="432"
					/>
				</div>

				<div class="flex flex-1 flex-col justify-between gap-6 p-6 sm:p-8">
					<div class="space-y-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="label m-0 flex w-auto items-center gap-1.5 tracking-[0.16em] opacity-75">
								<IconCalendarDays class="h-4 w-4" />
								{data.rideSource === 'local' ? 'Next up near you' : 'Featured ride'}
							</p>
							<a href="/ride" class="anchor inline-flex items-center gap-1 text-xs font-bold">
								All rides <IconArrowRight class="h-3.5 w-3.5" />
							</a>
						</div>

						<h3 class="text-2xl leading-tight font-black">{nextRide.title}</h3>

						<div class="space-y-1 text-sm opacity-80">
							<p class="m-0 font-semibold">{when.day} · {when.date}</p>
							<p class="m-0 flex items-center gap-1.5">
								<IconMapPin class="h-4 w-4 shrink-0" />
								<span>{ridePlace(nextRide)}</span>
							</p>
						</div>
					</div>

					<div class="space-y-3">
						<a
							href={`/ride/${nextRide.slug}`}
							class="btn preset-filled-primary-500 w-full gap-2 font-bold"
						>
							Open this ride <IconArrowRight class="h-4 w-4" />
						</a>
						{#if data.rideSource !== 'featured' && data.locationSource === 'approximate'}
							<p class="m-0 text-xs leading-relaxed opacity-65">
								Based on a broad network region. We never request your precise device location.
							</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="flex flex-1 flex-col justify-between gap-8 p-6 sm:p-8">
					<div class="flex items-center justify-between gap-3">
						<p class="label m-0 flex w-auto items-center gap-2 tracking-[0.16em] opacity-70">
							<IconCalendarDays class="h-4 w-4" />
							{data.rideSource === 'local' ? 'Next up near you' : 'Featured ride'}
						</p>
						<a href="/ride" class="anchor inline-flex items-center gap-1 text-xs font-bold">
							All rides <IconArrowRight class="h-3.5 w-3.5" />
						</a>
					</div>

					<div class="space-y-4">
						<span class="badge-icon preset-tonal-secondary h-12 w-12">
							<IconBike class="h-6 w-6" />
						</span>
						<h3 class="text-2xl font-black">The calendar is open.</h3>
						<p class="m-0 leading-relaxed opacity-80">
							Find a ride farther afield, or be the person who puts the next local one on the map.
						</p>
					</div>

					<div class="flex flex-wrap gap-3">
						<a href="/ride" class="btn preset-filled-primary-500 font-bold">Browse rides</a>
						<a
							href="/ride/new"
							class="btn preset-tonal-surface preset-outlined-surface-300-700 font-bold"
						>
							Post one
						</a>
					</div>
				</div>
			{/if}
		</aside>
	</section>

	<section
		class="card preset-tonal-secondary preset-outlined-secondary-500 grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-10"
		aria-labelledby="mission-heading"
	>
		<div class="max-w-3xl space-y-3">
			<p class="label m-0 flex w-auto items-center gap-2 tracking-[0.18em] opacity-80">
				<IconHeart class="h-4 w-4" /> The distance that matters
			</p>
			<h2
				id="mission-heading"
				class="text-3xl leading-tight font-black tracking-tight text-balance sm:text-5xl"
			>
				Three feet can change a life.
			</h2>
			<p class="m-0 max-w-2xl text-base leading-relaxed opacity-85 sm:text-lg">
				Help build streets where every person on a bike is seen, respected, and able to come home
				safely.
			</p>
		</div>
		<div class="flex flex-col gap-3 sm:flex-row lg:flex-col">
			<a href="/volunteer" class="btn preset-filled-primary-500 gap-2 font-bold">
				<IconHeartHandshake class="h-5 w-5" /> Volunteer
			</a>
			<a href="/donate" class="btn preset-tonal-surface preset-outlined-surface-300-700 font-bold">
				Support the mission
			</a>
		</div>
	</section>

	<section
		class="card preset-tonal-surface preset-outlined-surface-200-800 space-y-6 p-6 sm:p-8 lg:p-10"
		aria-labelledby="safety-heading"
	>
		<div class="space-y-2">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="label m-0 w-auto tracking-[0.18em] opacity-70">Keep this close</p>
				<a href="/learn" class="anchor inline-flex items-center gap-1 text-xs font-bold">
					Explore safety library <IconArrowRight class="h-3.5 w-3.5" />
				</a>
			</div>
			<h2 id="safety-heading" class="text-2xl font-black tracking-tight text-balance sm:text-4xl">
				Know what to do before you need it.
			</h2>
		</div>

		<hr class="hr" />

		<div class="grid gap-8 lg:grid-cols-[1fr_auto_1fr]">
			<div class="space-y-5">
				<div class="flex items-center gap-3">
					<span class="chip-icon preset-tonal-error">
						<IconShieldCheck class="h-5 w-5" />
					</span>
					<div>
						<h3 class="text-xl font-black sm:text-2xl">After a crash</h3>
						<p class="m-0 text-xs opacity-70">Five steps to protect yourself and your rights</p>
					</div>
				</div>
				<ol class="space-y-3.5 text-sm sm:text-base">
					{#each crashSteps as step, index}
						<li class="flex items-start gap-3">
							<span class="badge preset-tonal-error mt-0.5 shrink-0 tabular-nums">
								0{index + 1}
							</span>
							<p class="m-0 min-w-0 leading-relaxed">
								<strong class="font-bold">{step.label}:</strong>
								<span class="opacity-80">{step.description}</span>
							</p>
						</li>
					{/each}
				</ol>
			</div>

			<hr class="hr lg:hidden" />
			<span class="vr hidden lg:block" aria-hidden="true"></span>

			<div class="space-y-5">
				<div class="flex items-center gap-3">
					<span class="chip-icon preset-filled-primary-500">
						<IconBike class="h-5 w-5" />
					</span>
					<div>
						<h3 class="text-xl font-black sm:text-2xl">Stay A.L.E.R.T.</h3>
						<p class="m-0 text-xs opacity-70">Everyday habits for confident road riding</p>
					</div>
				</div>
				<div class="space-y-3.5 text-sm sm:text-base">
					{#each alertPrinciples as item}
						<div class="flex items-start gap-3">
							<span class="badge preset-filled-primary-500 mt-0.5 w-6 shrink-0 justify-center">
								{item.letter}
							</span>
							<p class="m-0 min-w-0 leading-relaxed">
								<strong class="font-bold">{item.label}:</strong>
								<span class="opacity-80">{item.description}</span>
							</p>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</section>
</div>
