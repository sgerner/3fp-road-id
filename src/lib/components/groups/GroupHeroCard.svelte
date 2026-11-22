<script>
	import IconArrowRight from '@lucide/svelte/icons/arrow-right';
	import IconLink from '@lucide/svelte/icons/link';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import { CONTACT_ICON_MAP, CTA_ICON_MAP } from '#lib/groups/contactLinks.js';
	import { optimizedImageUrl } from '#lib/media/optimized';

	let {
		group,
		canEdit = false,
		primaryCta = null,
		membershipCta = null,
		contactLinks = []
	} = $props();

	const CONTACT_LABELS = {
		website: 'Website',
		email: 'Email',
		phone: 'Phone',
		instagram: 'Instagram',
		facebook: 'Facebook',
		x: 'X',
		youtube: 'YouTube',
		linkedin: 'LinkedIn',
		threads: 'Threads',
		tiktok: 'TikTok',
		strava: 'Strava',
		bluesky: 'Bluesky',
		mastodon: 'Mastodon',
		discord: 'Discord'
	};

	const ctaIcons = CTA_ICON_MAP;
	const contactIconByKey = CONTACT_ICON_MAP;
	const IconComp = $derived(primaryCta ? ctaIcons[primaryCta.key] || IconLink : IconLink);
	const coverImage = $derived(
		group?.cover_photo_url
			? optimizedImageUrl(group.cover_photo_url, { width: 1200, height: 736, quality: 68 })
			: ''
	);
	const logoImage = $derived(
		group?.logo_url
			? optimizedImageUrl(group.logo_url, { width: 128, height: 128, quality: 68 })
			: ''
	);
	const tagline = $derived((group?.tagline || '').trim());
	const locationText = $derived.by(() => {
		const locality = [group?.city, group?.state_region]
			.map((part) => (part || '').trim())
			.filter(Boolean)
			.join(', ');
		const country = (group?.country || '').trim();
		return [locality, country].filter(Boolean).join(' · ');
	});
	const hasCta = $derived(Boolean(canEdit || primaryCta || membershipCta));
	const visibleContactLinks = $derived(
		(Array.isArray(contactLinks) ? contactLinks : []).filter((link) => link?.href).slice(0, 6)
	);

	function getContactLabel(link) {
		const base = CONTACT_LABELS[link?.key] || link?.label || link?.key || 'Contact link';
		const groupName = (group?.name || '').trim();
		return groupName ? `${groupName} ${base}` : base;
	}
</script>

<section
	class="group-hero-card bg-primary-500 text-surface-950 grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
	aria-labelledby="group-hero-heading"
>
	<div
		class="flex min-w-0 flex-col justify-between gap-8 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
	>
		{#if locationText}
			<p
				class="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-3 w-3 shrink-0" aria-hidden="true"></span>
				<IconMapPin class="h-3.5 w-3.5 shrink-0" />
				<span>{locationText}</span>
			</p>
		{/if}

		<div class="flex min-w-0 flex-col gap-5">
			<div class="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:gap-5">
				{#if logoImage}
					<div
						class="bg-surface-50 border-surface-950 flex h-16 w-16 shrink-0 items-center justify-center border-[3px] p-1.5 sm:h-20 sm:w-20"
					>
						<img
							src={logoImage}
							alt="{group?.name || 'Group'} logo"
							loading="eager"
							class="h-full w-full object-contain"
							width="96"
							height="96"
							decoding="async"
						/>
					</div>
				{/if}

				<h1
					id="group-hero-heading"
					class="text-surface-950! m-0 w-full min-w-0 text-[clamp(2.4rem,6vw,5.4rem)] leading-[0.88] font-black tracking-[-0.04em] text-balance wrap-anywhere uppercase italic sm:flex-1"
				>
					{group?.name}
				</h1>
			</div>

			{#if tagline}
				<p class="m-0 max-w-2xl text-lg leading-snug font-medium text-balance sm:text-2xl">
					{tagline}
				</p>
			{/if}
		</div>

		{#if hasCta}
			<div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				{#if canEdit}
					<a
						href={`/groups/${group?.slug ?? ''}/manage`}
						class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase hover:no-underline motion-safe:transition"
					>
						<span>Manage Group</span>
						<IconArrowRight
							class="h-5 w-5 shrink-0 motion-safe:transition motion-safe:group-hover:translate-x-1"
						/>
					</a>
				{:else if primaryCta}
					<a
						href={primaryCta.href}
						target={primaryCta.key === 'email' || primaryCta.key === 'phone' ? '_self' : '_blank'}
						rel={primaryCta.key === 'email' || primaryCta.key === 'phone'
							? undefined
							: 'noopener noreferrer'}
						class="bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center justify-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase hover:no-underline motion-safe:transition"
					>
						{#if primaryCta.key !== 'custom'}
							<IconComp class="h-5 w-5 shrink-0" />
						{/if}
						<span>{primaryCta.label}</span>
					</a>
				{/if}

				{#if membershipCta}
					<a
						href={membershipCta.href}
						onclick={membershipCta.onClick}
						class="border-surface-950 text-surface-950 hover:bg-surface-950 hover:text-primary-500 inline-flex items-center justify-center gap-3 border-[3px] px-7 py-4 text-base font-black tracking-wide uppercase hover:no-underline motion-safe:transition"
					>
						{membershipCta.label}
					</a>
				{/if}
			</div>
		{/if}
	</div>

	<div class="bg-surface-950 relative min-h-[20rem] sm:min-h-[26rem]">
		{#if coverImage}
			<img
				src={coverImage}
				alt="{group?.name || 'Group'} cover"
				loading="eager"
				fetchpriority="high"
				width="1200"
				height="736"
				decoding="async"
				class="absolute inset-0 h-full w-full object-cover"
			/>
		{:else}
			<div
				class="bg-secondary-500 absolute inset-0 flex items-center justify-center overflow-hidden"
			>
				<span
					class="text-primary-500 text-[clamp(6rem,18vw,13rem)] leading-none font-black italic select-none"
					aria-hidden="true"
				>
					3FT
				</span>
			</div>
		{/if}

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

		{#if visibleContactLinks.length}
			<div
				class="bg-surface-950 text-surface-50 absolute right-0 bottom-0 left-12 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:left-16 sm:px-5"
			>
				<span class="text-primary-500 text-[0.65rem] font-bold tracking-[0.22em] uppercase">
					Connect
				</span>
				<div class="flex flex-wrap items-center gap-1.5">
					{#each visibleContactLinks as c (c.key || c.href)}
						{@const ContactIcon = contactIconByKey[c.key] || c.icon || IconLink}
						<a
							href={c.href}
							aria-label={getContactLabel(c)}
							title={CONTACT_LABELS[c.key] || c.key}
							target={c.key === 'email' || c.key === 'phone' ? '_self' : '_blank'}
							rel={c.key === 'email' || c.key === 'phone' ? undefined : 'noopener noreferrer'}
							class="border-surface-500 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 flex min-h-11 min-w-11 items-center justify-center border hover:no-underline motion-safe:transition sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9"
						>
							<ContactIcon class="h-4 w-4" />
						</a>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</section>
