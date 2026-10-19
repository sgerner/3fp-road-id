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
	class="bg-surface-950 text-surface-50 [&_h2]:!text-surface-50 [&_h3]:!text-surface-50 mx-auto my-2 flex w-full max-w-7xl flex-col overflow-hidden rounded-3xl shadow-2xl sm:my-6 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-current"
>
	<section
		class="from-secondary-950 to-secondary-800 text-surface-50 grid overflow-hidden bg-gradient-to-br lg:grid-cols-[1.1fr_0.9fr]"
		aria-labelledby="welcome-heading"
	>
		<div class="flex flex-col justify-between gap-8 p-6 sm:p-10 lg:p-12">
			<div class="flex flex-wrap items-center gap-4">
				<p
					class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase"
				>
					<IconBike class="h-5 w-5" /> A little space. A better world.
				</p>
				{#if data.locationSource}
					<a
						href="/profile"
						class="text-surface-50/80 inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
					>
						<IconMapPin class="h-3.5 w-3.5" />{data.area}
					</a>
				{/if}
			</div>
			<div class="space-y-6">
				<h1
					id="welcome-heading"
					class="!text-surface-50 text-4xl leading-[0.98] font-black tracking-tight text-balance sm:text-6xl lg:text-5xl xl:text-6xl"
				>
					Good people.<br />Open roads.<br /><span class="text-primary-500">Room to ride.</span>
				</h1>
				<p class="text-surface-50/80 max-w-lg text-lg leading-relaxed">
					Every ride deserves a safe return. Find your cycling community and help make the road a
					more welcoming place{data.area ? `—starting around ${data.area}` : ''}.
				</p>
				<div class="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
					<a
						href="/groups"
						class="btn bg-primary-500 text-surface-950 hover:bg-primary-300 gap-2 px-6 py-3 font-bold"
					>
						Find your people <IconArrowRight class="h-4 w-4" />
					</a>
					<a
						href="/ride"
						class="btn border-surface-50/40 text-surface-50 hover:bg-surface-50/10 gap-2 border px-6 py-3 font-bold"
					>
						<IconCalendarDays class="h-5 w-5" /> Find a ride
					</a>
				</div>
			</div>
		</div>
		<div class="relative min-h-64 lg:min-h-full">
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
			<div
				class="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-5 p-6 sm:p-8"
			>
				{#if heroGroup}
					<a
						href={`/groups/${heroGroup.slug}`}
						class="text-surface-50 max-w-44 text-sm underline-offset-4 hover:underline"
					>
						<span class="block font-bold">{heroGroup.name}</span>
						<span class="text-surface-50/80"
							>{groupPlace(heroGroup)} <IconArrowRight class="inline h-3.5 w-3.5" /></span
						>
					</a>
				{/if}
			</div>
		</div>
	</section>

	<section
		class="grid gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12 lg:p-12"
		aria-labelledby="nearby-heading"
	>
		<div>
			<div
				class="text-surface-300 mb-3 flex items-center gap-2 text-sm font-bold tracking-[0.18em] uppercase"
			>
				<IconMapPin class="h-4 w-4" />
				{data.locationSource ? 'Close to home' : 'Community directory'}
			</div>
			<h2
				id="nearby-heading"
				class="max-w-2xl text-3xl leading-tight font-black tracking-tight text-balance sm:text-4xl"
			>
				{data.locationSource ? `Ride together around ${data.area}` : 'Find your people.'}
			</h2>

			{#if shownGroups.length}
				<div class="divide-surface-500/20 mt-8 divide-y">
					{#each shownGroups as group}
						<a
							href={`/groups/${group.slug}`}
							class="group hover:bg-secondary-500/10 flex items-center gap-4 rounded-xl px-3 py-5 transition sm:gap-6"
						>
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
								<span class="text-surface-200 mt-1 block text-sm">{groupPlace(group)}</span>
							</span>
							<IconArrowRight
								class="h-5 w-5 shrink-0 opacity-45 transition group-hover:translate-x-1 group-hover:opacity-100"
							/>
						</a>
					{/each}
				</div>
			{:else}
				<p class="text-surface-200 mt-6 max-w-xl text-lg leading-relaxed">
					No group has claimed this area yet. Browse the directory—or start the community you wish
					existed.
				</p>
			{/if}

			<div class="mt-6 flex flex-wrap items-center gap-4">
				<a href="/groups" class="anchor inline-flex items-center gap-1 font-bold"
					>Explore every group <IconArrowRight class="h-4 w-4" /></a
				>
				{#if data.locationSource === 'profile'}
					<a href="/profile" class="text-surface-300 text-sm hover:opacity-100">Change home area</a>
				{:else if data.locationSource === 'approximate'}
					<a href="/profile" class="text-surface-300 text-sm hover:opacity-100"
						>Set a more useful home area</a
					>
				{/if}
			</div>
		</div>

		<aside
			class="border-surface-700 bg-surface-900 self-start overflow-hidden rounded-2xl border"
			aria-label="Next ride"
		>
			{#if nextRide}
				<img
					src={nextRideImage}
					alt=""
					class="aspect-[16/8] w-full object-cover"
					width="768"
					height="384"
					loading="lazy"
					decoding="async"
				/>
			{/if}
			<div class="space-y-5 p-6 sm:p-7">
				<p
					class="text-primary-500 flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase"
				>
					<IconCalendarDays class="h-4 w-4" />{data.rideSource === 'local'
						? 'Next up near you'
						: 'Featured ride'}
				</p>
				{#if nextRide}
					{@const when = formatRideDate(nextRide.nextOccurrenceStart)}
					<div>
						<h3 class="text-2xl leading-tight font-bold">{nextRide.title}</h3>
						<p class="text-surface-200 mt-4 flex items-start gap-2">
							<IconCalendarDays class="mt-0.5 h-4 w-4 shrink-0" />{when.day}, {when.date}
						</p>
						<p class="text-surface-200 mt-2 flex items-start gap-2">
							<IconMapPin class="mt-0.5 h-4 w-4 shrink-0" />{ridePlace(nextRide)}
						</p>
					</div>
					<a
						href={`/ride/${nextRide.slug}`}
						class="btn bg-primary-500 text-surface-950 hover:bg-primary-300 w-full gap-2 font-bold"
						>View ride details <IconArrowRight class="h-4 w-4" /></a
					>
				{:else}
					<h3 class="text-2xl font-bold">Your next ride starts here.</h3>
					<p class="text-surface-200 leading-relaxed">
						Explore the calendar, or bring people together by posting a ride.
					</p>
					<a href="/ride/new" class="btn bg-primary-500 text-surface-950 hover:bg-primary-300"
						>Post a ride</a
					>
				{/if}
				<a
					href="/ride"
					class="flex items-center justify-center gap-2 py-1 text-sm font-bold underline underline-offset-4"
					>Browse all rides <IconArrowRight class="h-4 w-4" /></a
				>
				{#if data.rideSource !== 'featured' && data.locationSource === 'approximate'}
					<p class="text-surface-300 text-xs leading-relaxed">
						Based on a broad network region. Set your home area in your profile for better
						suggestions.
					</p>
				{/if}
			</div>
		</aside>
	</section>

	<section
		class="border-secondary-700 from-secondary-950 to-secondary-900 grid gap-6 border-y bg-gradient-to-r p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12"
		aria-labelledby="mission-heading"
	>
		<div class="flex items-start gap-5 sm:gap-8">
			<span
				aria-hidden="true"
				class="text-primary-500 hidden text-7xl leading-none font-black tracking-tighter sm:block"
				>3<span class="text-2xl">ft</span></span
			>
			<div>
				<p
					class="text-primary-500 mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase"
				>
					<IconHeart class="h-4 w-4" /> A little space changes everything
				</p>
				<h2 id="mission-heading" class="text-3xl leading-tight font-bold tracking-tight">
					Safer roads. More happy homecomings.
				</h2>
				<p class="text-surface-200 mt-3 max-w-xl leading-relaxed">
					Help make room for every person on a bike. Start with three feet. Keep going with us.
				</p>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-5">
			<a
				href="/volunteer"
				class="btn bg-primary-500 text-surface-950 hover:bg-primary-300 gap-2 font-bold"
				><IconHeartHandshake class="h-5 w-5" /> Get involved</a
			>
			<a href="/donate" class="font-bold underline underline-offset-4">Donate</a>
		</div>
	</section>

	<section class="p-6 sm:p-10 lg:p-12" aria-labelledby="safety-heading">
		<div class="mb-7 flex flex-wrap items-end justify-between gap-4">
			<div>
				<p class="text-primary-500 mb-3 text-xs font-bold tracking-[0.16em] uppercase">
					A little preparation. A lot more confidence.
				</p>
				<h2 id="safety-heading" class="text-3xl font-bold tracking-tight sm:text-4xl">
					Ready for the road.
				</h2>
			</div>
			<a
				href="/learn"
				class="inline-flex items-center gap-2 py-2 font-bold underline underline-offset-4"
				>Explore the safety library <IconArrowRight class="h-4 w-4" /></a
			>
		</div>
		<div class="divide-surface-700 border-surface-700 divide-y border-y">
			<details class="group py-5">
				<summary
					class="focus-visible:outline-primary-500 flex cursor-pointer list-none items-center gap-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden"
				>
					<IconBike class="text-primary-500 h-6 w-6 shrink-0" />
					<span class="flex-1"
						><strong class="block text-lg">Before you ride: stay A.L.E.R.T.</strong><span
							class="text-surface-200 mt-1 block text-sm"
							>Five simple habits for a more confident ride.</span
						></span
					>
					<span aria-hidden="true" class="text-primary-500 text-2xl transition group-open:rotate-45"
						>+</span
					>
				</summary>
				<dl class="mt-6 grid gap-5 sm:ml-10 sm:grid-cols-2 lg:grid-cols-3">
					{#each alertPrinciples as item}
						<div>
							<dt class="font-bold">
								<span class="text-primary-500">{item.letter}</span> · {item.label}
							</dt>
							<dd class="text-surface-200 mt-2 text-sm leading-relaxed">{item.description}</dd>
						</div>
					{/each}
				</dl>
			</details>
			<details class="group py-5">
				<summary
					class="focus-visible:outline-primary-500 flex cursor-pointer list-none items-center gap-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden"
				>
					<IconShieldCheck class="text-tertiary-300 h-6 w-6 shrink-0" />
					<span class="flex-1"
						><strong class="block text-lg">After a crash: your next steps</strong><span
							class="text-surface-200 mt-1 block text-sm"
							>Keep the essentials close, before you need them.</span
						></span
					>
					<span aria-hidden="true" class="text-primary-500 text-2xl transition group-open:rotate-45"
						>+</span
					>
				</summary>
				<ol class="text-surface-200 mt-6 ml-6 list-decimal space-y-3 leading-relaxed sm:ml-16">
					{#each ['Get out of traffic and check for injuries', 'Call police and make a report', 'Photograph the scene and exchange information', 'Seek medical care', 'Protect your records and your rights'] as step}
						<li class="pl-2">{step}</li>
					{/each}
				</ol>
			</details>
		</div>
	</section>
</div>
