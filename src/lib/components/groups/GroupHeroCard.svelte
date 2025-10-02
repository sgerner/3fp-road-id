<script>
	import IconLink from '@lucide/svelte/icons/link';
	import { CTA_ICON_MAP } from '$lib/groups/contactLinks.js';

	let { group, canEdit, primaryCta } = $props();

	const ctaIcons = CTA_ICON_MAP;
	const IconComp = primaryCta ? ctaIcons[primaryCta.key] || IconLink : IconLink;
</script>

<section class="card border-surface-300 bg-surface-900 overflow-hidden border">
	<div
		class="from-primary-800/60 to-primary-600/40 relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-r"
	>
		{#if group?.cover_photo_url}
			<img
				src={group.cover_photo_url}
				alt="{group.name} cover"
				loading="lazy"
				class="absolute inset-0 h-full w-full object-cover"
			/>
		{/if}
		<div
			class="absolute inset-x-0 bottom-0 md:bg-gradient-to-t md:from-black/60 md:via-black/50 md:to-black/40 md:backdrop-blur-xs"
		>
			<div class="flex gap-2 rounded-md bg-black/40 p-2 backdrop-blur-xs md:hidden">
				{#if group?.logo_url}
					<img
						src={group.logo_url}
						alt="{group.name} logo"
						loading="lazy"
						class="h-14 w-14 object-cover"
					/>
				{/if}
				<div class="w-full min-w-0">
					<h1 class="truncate !text-left text-base font-bold text-white">{group?.name}</h1>
					<div class="flex items-start gap-2">
						<p class="grow truncate text-[11px] text-white/90">
							{#if group?.city}{group.city},&nbsp;{/if}{group?.state_region} · {group?.country}
						</p>
						{#if canEdit}
							<a
								href={`/groups/${group?.slug ?? ''}/edit`}
								class="chip preset-filled-primary-500 shrink-0 font-bold"
							>
								Edit Group
							</a>
						{:else if primaryCta}
							<a
								href={primaryCta.href}
								target={primaryCta.key === 'email' || primaryCta.key === 'phone'
									? '_self'
									: '_blank'}
								rel={primaryCta.key === 'email' || primaryCta.key === 'phone'
									? undefined
									: 'noopener noreferrer'}
								class="chip preset-filled-primary-500 flex shrink-0 items-center gap-2 font-bold"
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
			<div class="mx-auto hidden items-center justify-between gap-4 px-4 py-1 md:flex">
				{#if group?.logo_url}
					<img
						src={group.logo_url}
						alt="{group.name} logo"
						loading="lazy"
						class="h-24 w-24 object-cover"
					/>
				{/if}
				<div class="min-w-0">
					<h1 class="truncate !text-left text-2xl font-bold text-white">{group?.name}</h1>
					{#if group?.tagline}
						<p class="!m-0 text-white">{group.tagline}</p>
					{/if}
					<p class="text-sm text-white/80">
						{#if group?.city}{group.city},{/if}
						{group?.state_region} · {group?.country}
					</p>
				</div>
				{#if canEdit}
					<a
						href={`/groups/${group?.slug ?? ''}/edit`}
						class="btn preset-filled-primary-500 shrink-0 font-bold"
					>
						Edit Group
					</a>
				{:else if primaryCta}
					<a
						href={primaryCta.href}
						target={primaryCta.key === 'email' || primaryCta.key === 'phone' ? '_self' : '_blank'}
						rel={primaryCta.key === 'email' || primaryCta.key === 'phone'
							? undefined
							: 'noopener noreferrer'}
						class="btn preset-filled-primary-500 flex shrink-0 items-center gap-2 font-bold"
					>
						{#if primaryCta.key !== 'custom'}
							<IconComp class="h-5 w-5" />
						{/if}
						<span>{primaryCta.label}</span>
					</a>
				{/if}
			</div>
		</div>
	</div>
</section>
