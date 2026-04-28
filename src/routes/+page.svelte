<script>
	let { data } = $props();
	import AlertSystem from '$lib/components/AlertSystem.svelte';
	import CrashResponse from '$lib/components/CrashResponse.svelte';
	import { buildAbsoluteUrl, limitSeoText } from '$lib/seo';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconShield from '@lucide/svelte/icons/shield';
	import IconMegaphone from '@lucide/svelte/icons/megaphone';
	import IconBookOpen from '@lucide/svelte/icons/book-open';
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';

	const siteOrigin = $derived(data.siteOrigin || '');
	const canonicalUrl = $derived(siteOrigin ? buildAbsoluteUrl(siteOrigin, '/') : '/');
	const seoTitle = '3 Feet Please';
	const seoDescription = $derived(
		limitSeoText(
			'Public rides, cycling groups, volunteer events, merch, emergency contacts, and road-safety resources from 3 Feet Please.',
			160
		)
	);
	const seoImage = $derived(siteOrigin ? buildAbsoluteUrl(siteOrigin, '/3fp.png') : '/3fp.png');
	const seoStructuredData = $derived.by(() =>
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'Organization',
			name: seoTitle,
			url: canonicalUrl,
			description: seoDescription,
			logo: siteOrigin ? buildAbsoluteUrl(siteOrigin, '/logo.png') : '/logo.png',
			sameAs: ['https://3feetplease.org']
		})
	);
</script>

<svelte:head>
	<title>{seoTitle} | Road safety and cycling community resources</title>
	<meta name="description" content={seoDescription} />
	<meta
		name="robots"
		content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
	/>
	<link rel="canonical" href={canonicalUrl} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={seoTitle} />
	<meta property="og:title" content={`${seoTitle} | Road safety and cycling community resources`} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content={seoImage} />
	<meta property="og:image:alt" content="3 Feet Please logo" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={`${seoTitle} | Road safety and cycling community resources`} />
	<meta name="twitter:description" content={seoDescription} />
	<meta name="twitter:image" content={seoImage} />

	{@html '<script type="application/ld+json">' + seoStructuredData + '</script>'}
</svelte:head>

<!-- ============================================================
     CINEMATIC HERO — full-bleed, bleeds behind the sidebar
     ============================================================ -->
<section
	class="relative -mx-4 -mt-6 mb-16 flex min-h-[90dvh] flex-col items-center justify-center overflow-hidden sm:-mx-6 lg:-mx-10"
	aria-label="Hero"
>
	<!-- Background video-like layered gradient -->
	<div
		class="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(58%_0.13_116deg/0.35)_0%,transparent_70%)]"
	></div>
	<div
		class="from-surface-950 via-surface-950/80 to-surface-950 absolute inset-0 bg-linear-to-b"
	></div>

	<!-- Decorative cycling road lines -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.06]">
		<svg
			class="text-surface-500 h-full w-full"
			viewBox="0 0 1200 800"
			preserveAspectRatio="xMidYMid slice"
			fill="none"
		>
			<line
				x1="600"
				y1="0"
				x2="600"
				y2="800"
				stroke="currentColor"
				stroke-width="4"
				stroke-dasharray="24 24"
			/>
			<line
				x1="0"
				y1="400"
				x2="1200"
				y2="400"
				stroke="currentColor"
				stroke-width="2"
				stroke-dasharray="16 16"
			/>
			<circle
				cx="600"
				cy="400"
				r="200"
				stroke="currentColor"
				stroke-width="2"
				stroke-dasharray="12 12"
			/>
			<circle
				cx="600"
				cy="400"
				r="350"
				stroke="currentColor"
				stroke-width="1"
				stroke-dasharray="8 8"
			/>
		</svg>
	</div>

	<!-- Radial glow accent -->
	<div
		class="bg-primary-600-400/10 pointer-events-none absolute top-1/3 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
	></div>

	<!-- Hero content -->
	<div class="relative z-10 mx-auto max-w-5xl px-6 text-center">
		<!-- Eyebrow -->
		<div
			class="border-primary-600-400/30 bg-primary-600-400/10 mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 backdrop-blur-sm"
		>
			<span class="bg-primary-600-400 h-1.5 w-1.5 animate-pulse rounded-full"></span>
			<span class="text-primary-700-300 text-xs font-semibold tracking-[0.2em] uppercase"
				>Community Hub</span
			>
		</div>

		<!-- Main headline -->
		<h1
			class="!text-center text-5xl leading-[1.08] font-extrabold tracking-tight sm:text-6xl lg:text-7xl"
		>
			<span class="text-primary-950-50">Ride,</span><br />
			<span class="from-primary-300 to-primary-500 bg-linear-to-r bg-clip-text text-transparent">
				volunteer,
			</span><br />
			<span class="text-primary-950-50">and advocate.</span>
		</h1>

		<!-- Sub-headline -->
		<p class="text-surface-700-300 mx-auto mt-6 max-w-2xl text-lg leading-relaxed sm:text-xl">
			Find public rides, discover riding groups, manage volunteer events, and keep emergency contact
			details ready when they matter most.
		</p>

		<!-- CTA buttons -->
		<div class="mt-10 flex flex-wrap items-center justify-center gap-4">
			<a
				href="/groups"
				class="btn preset-filled-primary-500 group shadow-primary-500/20 hover:shadow-primary-500/30 gap-2 px-7 py-3 text-base font-semibold shadow-lg transition-all hover:scale-105"
			>
				<IconUsers class="h-5 w-5" />
				Explore Groups
				<IconArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-1" />
			</a>
			<a
				href="/ride"
				class="btn preset-outlined-primary-500 group gap-2 px-7 py-3 text-base font-semibold transition-all hover:scale-105"
			>
				<IconBike class="h-5 w-5" />
				Find Rides
			</a>
		</div>
	</div>

	<!-- Scroll hint -->
	<div class="text-surface-500 absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
		<IconChevronDown class="h-6 w-6" />
	</div>
</section>

<!-- ============================================================
     MISSION CARDS — who we are, 3 pillars
     ============================================================ -->
<section class="mx-auto mb-16 w-full max-w-7xl px-0">
	<div class="grid gap-5 md:grid-cols-3">
		{#each [{ icon: IconShield, color: 'primary', title: 'Safety Nonprofit', desc: 'Dedicated to protecting riders through education, advocacy, and community resources.' }, { icon: IconMegaphone, color: 'tertiary', title: 'Road Awareness', desc: 'We advocate for safe riding practices and share the road awareness across the cycling community.' }, { icon: IconBookOpen, color: 'success', title: 'Essential Resources', desc: 'Crash response guides, safety systems, group directories and emergency contacts—all in one place.' }] as pillar}
			<div
				class="card border-surface-300-700/50 bg-surface-100-900/60 group relative overflow-hidden border p-6 backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-xl"
			>
				<!-- Glow accent top-left -->
				<div
					class="bg-primary-600-400/10 pointer-events-none absolute -top-6 -left-6 h-24 w-24 rounded-full blur-2xl transition-all group-hover:opacity-80"
				></div>
				<div class="relative">
					<div class="bg-surface-200-800/80 mb-4 inline-flex rounded-xl p-3">
						<pillar.icon class="text-primary-600-400 h-6 w-6" />
					</div>
					<h3 class="text-primary-950-50 mb-2 !text-left text-lg font-bold">{pillar.title}</h3>
					<p class="text-surface-700-300 !mb-0 text-sm leading-relaxed">{pillar.desc}</p>
				</div>
			</div>
		{/each}
	</div>
	<div class="mt-6 text-center">
		<a
			href="https://3feetplease.org"
			target="_blank"
			rel="noopener noreferrer"
			class="btn preset-outlined-primary-500 btn-sm gap-2 transition-all hover:scale-105"
		>
			Learn more at 3FeetPlease.org
			<IconArrowRight class="h-4 w-4" />
		</a>
	</div>
	<p class="text-surface-700-300 mt-4 text-sm">
		Want to help outside scheduled shifts?
		<a href="/get-involved" class="anchor">See ongoing opportunities.</a>
	</p>
</section>

<!-- ============================================================
     QUICK LINKS
     ============================================================ -->
<section class="mx-auto mb-16 w-full max-w-7xl" aria-label="Quick links">
	<h2 class="mb-5 !text-left text-2xl font-bold">Get Started</h2>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
		<a
			href="/ride"
			class="card border-surface-300-700/50 bg-surface-100-900/60 card-hover group flex items-center gap-4 border p-5 backdrop-blur-sm transition-all hover:-translate-y-0.5"
		>
			<div
				class="bg-surface-200-800 group-hover:bg-primary-600-400/20 rounded-xl p-3 transition-colors"
			>
				<IconBike class="text-primary-600-400 h-6 w-6" />
			</div>
			<div>
				<div class="text-primary-950-50 font-semibold">Ride</div>
				<p class="text-surface-600-400 !mb-0 text-sm">Post and find public rides</p>
			</div>
			<IconArrowRight
				class="text-surface-400-600 group-hover:text-primary-600-400 ml-auto h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1"
			/>
		</a>
		<a
			href="/groups"
			class="card border-surface-300-700/50 bg-surface-100-900/60 card-hover group flex items-center gap-4 border p-5 backdrop-blur-sm transition-all hover:-translate-y-0.5"
		>
			<div
				class="bg-surface-200-800 group-hover:bg-primary-600-400/20 rounded-xl p-3 transition-colors"
			>
				<IconUsers class="text-primary-600-400 h-6 w-6" />
			</div>
			<div>
				<div class="text-primary-950-50 font-semibold">Explore Groups</div>
				<p class="text-surface-600-400 !mb-0 text-sm">Find local clubs, teams, and orgs</p>
			</div>
			<IconArrowRight
				class="text-surface-400-600 group-hover:text-primary-600-400 ml-auto h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1"
			/>
		</a>
		<a
			href="/volunteer"
			class="card border-surface-300-700/50 bg-surface-100-900/60 card-hover group flex items-center gap-4 border p-5 backdrop-blur-sm transition-all hover:-translate-y-0.5"
		>
			<div
				class="bg-surface-200-800 group-hover:bg-primary-600-400/20 rounded-xl p-3 transition-colors"
			>
				<IconHandHeart class="text-primary-600-400 h-6 w-6" />
			</div>
			<div>
				<div class="text-primary-950-50 font-semibold">Volunteer</div>
				<p class="text-surface-600-400 !mb-0 text-sm">Sign up for shifts and events</p>
			</div>
			<IconArrowRight
				class="text-surface-400-600 group-hover:text-primary-600-400 ml-auto h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1"
			/>
		</a>
		<a
			href="/merch"
			class="card border-surface-300-700/50 bg-surface-100-900/60 card-hover group flex items-center gap-4 border p-5 backdrop-blur-sm transition-all hover:-translate-y-0.5"
		>
			<div
				class="bg-surface-200-800 group-hover:bg-primary-600-400/20 rounded-xl p-3 transition-colors"
			>
				<IconShoppingBag class="text-primary-600-400 h-6 w-6" />
			</div>
			<div>
				<div class="text-primary-950-50 font-semibold">Store</div>
				<p class="text-surface-600-400 !mb-0 text-sm">Official apparel & gear</p>
			</div>
			<IconArrowRight
				class="text-surface-400-600 group-hover:text-primary-600-400 ml-auto h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1"
			/>
		</a>
	</div>
</section>

<!-- ============================================================
     FEATURED GROUPS
     ============================================================ -->
{#if data.highlights?.length}
	<section class="mx-auto mb-16 w-full max-w-7xl space-y-5" aria-label="Featured groups">
		<div class="flex items-center justify-between">
			<h2 class="!text-left text-2xl font-bold">Featured Groups</h2>
			<a
				href="/groups"
				class="anchor text-primary-600-400 hover:text-primary-700-300 flex items-center gap-1 text-sm font-medium"
			>
				View all <IconArrowRight class="h-3.5 w-3.5" />
			</a>
		</div>
		<div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
			{#each data.highlights as g}
				<a
					href={`/groups/${g.slug}`}
					class="card border-surface-300-700/50 bg-surface-100-900/80 group block overflow-hidden border backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-2xl"
				>
					<!-- Cover photo -->
					<div
						class="from-primary-800/60 to-surface-950/80 relative aspect-[21/9] w-full overflow-hidden bg-gradient-to-r"
					>
						<img
							src={g.cover_photo_url}
							alt="{g.name} cover"
							loading="lazy"
							class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
						/>
						<!-- Gradient overlay -->
						<div
							class="from-surface-50-950/80 via-surface-50-950/20 absolute inset-0 bg-gradient-to-t to-transparent"
						></div>

						<!-- Info overlay at bottom -->
						<div class="absolute inset-x-0 bottom-0 flex items-end gap-4 p-4">
							<img
								src={g.logo_url}
								alt="{g.name} logo"
								loading="lazy"
								class="border-surface-950-50/20 h-14 w-14 shrink-0 rounded-xl border-2 object-cover shadow-lg sm:h-16 sm:w-16"
							/>
							<div class="min-w-0 flex-1">
								<h3 class="text-primary-950-50 truncate !text-left text-lg font-bold drop-shadow">
									{g.name}
								</h3>
								<p class="text-surface-950-50 !m-0 text-xs">
									{#if g.city}{g.city},
									{/if}{g.state_region} · {g.country}
								</p>
								{#if g.tagline}
									<p class="text-surface-950-50 !m-0 mt-0.5 line-clamp-1 hidden text-sm md:block">
										{g.tagline}
									</p>
								{/if}
							</div>
						</div>
					</div>
				</a>
			{/each}
		</div>
	</section>
{/if}

<!-- ============================================================
     SAFETY SECTION — divider + cards
     ============================================================ -->
<section class="mx-auto mb-16 w-full max-w-7xl" aria-label="Safety resources">
	<!-- Section header -->
	<div class="mb-8 flex items-center gap-4">
		<div class="to-surface-700/50 h-px flex-1 bg-gradient-to-r from-transparent"></div>
		<div class="flex items-center gap-3">
			<div class="bg-primary-600-400/15 rounded-full p-2">
				<IconShield class="text-primary-600-400 h-5 w-5" />
			</div>
			<h2 class="text-primary-700-300 !text-center text-xl font-bold tracking-widest uppercase">
				Safety Resources
			</h2>
		</div>
		<div class="to-surface-700/50 h-px flex-1 bg-gradient-to-l from-transparent"></div>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Crash Response card -->
		<div class="card border-surface-300-700/50 bg-surface-100-900/60 border p-6 backdrop-blur-sm">
			<CrashResponse />
		</div>
		<!-- ALERT card -->
		<div class="card border-surface-300-700/50 bg-surface-100-900/60 border p-6 backdrop-blur-sm">
			<AlertSystem />
		</div>
	</div>
</section>
