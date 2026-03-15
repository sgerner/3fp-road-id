<script>
	import IconLink from '@lucide/svelte/icons/link';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import { CTA_ICON_MAP } from '$lib/groups/contactLinks.js';

	let { group, canEdit, primaryCta } = $props();

	const ctaIcons = CTA_ICON_MAP;
	const IconComp = $derived(primaryCta ? ctaIcons[primaryCta.key] || IconLink : IconLink);
</script>

<section class="group-hero-card relative overflow-hidden rounded-2xl">
	<!-- Animated background orbs -->
	<div class="app-orb app-orb-1" aria-hidden="true"></div>
	<div class="app-orb app-orb-2" aria-hidden="true"></div>

	<!-- Cover photo -->
	<div class="relative aspect-[16/9] w-full overflow-hidden md:aspect-[21/9]">
		{#if group?.cover_photo_url}
			<img
				src={group.cover_photo_url}
				alt="{group.name} cover"
				loading="lazy"
				class="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
			/>
		{:else}
			<!-- Fallback gradient when no cover photo -->
			<div class="from-primary-800/80 to-secondary-700/60 absolute inset-0 bg-gradient-to-br"></div>
		{/if}

		<!-- Bottom gradient scrim -->
		<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>

		<!-- Bottom identity strip -->
		<div class="absolute inset-x-0 bottom-0 p-4 md:p-6">
			<div class="flex items-end gap-4">
				<!-- Logo -->
				{#if group?.logo_url}
					<div class="logo-ring shrink-0">
						<img
							src={group.logo_url}
							alt="{group.name} logo"
							loading="lazy"
							class="h-14 w-14 rounded-xl object-cover md:h-20 md:w-20"
						/>
					</div>
				{/if}

				<!-- Name + tagline + location -->
				<div class="min-w-0 flex-1">
					<h1
						class="!text-left text-xl leading-tight font-extrabold text-white drop-shadow-sm md:text-3xl"
					>
						{group?.name}
					</h1>
					{#if group?.tagline}
						<p class="mt-0.5 line-clamp-1 text-sm text-white/75 drop-shadow-sm">{group.tagline}</p>
					{/if}
					<p class="mt-1 flex items-center gap-1 text-[11px] text-white/60 md:text-xs">
						<IconMapPin class="h-3 w-3 shrink-0" />
						{#if group?.city}{group.city},{/if}
						{group?.state_region}
						{#if group?.state_region && group?.country}·{/if}
						{group?.country}
					</p>
				</div>

				<!-- CTA -->
				<div class="shrink-0">
					{#if canEdit}
						<a
							href={`/groups/${group?.slug ?? ''}/manage`}
							class="btn preset-filled-primary-500 font-bold shadow-lg"
						>
							Manage Group
						</a>
					{:else if primaryCta}
						<a
							href={primaryCta.href}
							target={primaryCta.key === 'email' || primaryCta.key === 'phone' ? '_self' : '_blank'}
							rel={primaryCta.key === 'email' || primaryCta.key === 'phone'
								? undefined
								: 'noopener noreferrer'}
							class="btn preset-filled-primary-500 cta-btn flex items-center gap-2 font-bold shadow-lg"
						>
							{#if primaryCta.key !== 'custom'}
								<IconComp class="h-4 w-4" />
							{/if}
							<span>{primaryCta.label}</span>
						</a>
					{/if}
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.group-hero-card {
		background: color-mix(in oklab, var(--color-primary-500) 10%, var(--color-surface-950) 90%);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 22%, transparent);
	}

					.logo-ring {
		border-radius: 0.875rem;
		box-shadow:
			0 0 0 3px color-mix(in oklab, var(--color-primary-400) 60%, transparent),
			0 8px 24px -4px rgba(0, 0, 0, 0.5);
	}

	.cta-btn {
		animation: cta-pulse 3s ease-in-out infinite;
	}

	@keyframes cta-pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-primary-500) 0%, transparent);
		}
		50% {
			box-shadow: 0 0 0 6px color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		}
	}
</style>
