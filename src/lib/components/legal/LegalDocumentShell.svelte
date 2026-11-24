<script>
	// Shared Lane Lines shell for public legal policy routes (/privacy, /terms, /data-deletion).
	let {
		metaTitle,
		metaDescription,
		headingId,
		titlePrefix,
		titleAccent,
		lead,
		lastUpdated,
		currentPath,
		children,
		headingSizeClass = 'text-[clamp(2.9rem,6.8vw,6rem)]'
	} = $props();

	const NAV_LINKS = [
		{ href: '/privacy', label: 'Privacy Policy' },
		{ href: '/terms', label: 'Terms of Service' },
		{ href: '/data-deletion', label: 'Data Deletion' }
	];
</script>

<svelte:head>
	<title>{metaTitle}</title>
	<meta name="description" content={metaDescription} />
</svelte:head>

<div class="text-surface-50 -m-4 flex flex-col overflow-hidden">
	<!-- HERO -->
	<header
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1fr)_auto]"
		aria-labelledby={headingId}
	>
		<div
			class="flex flex-col justify-between gap-6 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<p class="m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase">
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<span>Legal</span>
			</p>
			<div class="flex flex-col gap-4">
				<h1
					id={headingId}
					class="text-surface-950! m-0 {headingSizeClass} leading-[0.86] font-black tracking-[-0.04em] uppercase italic"
				>
					{titlePrefix} <span class="text-secondary-500">{titleAccent}</span>
				</h1>
				<p class="m-0 max-w-2xl text-lg leading-snug font-medium sm:text-xl">
					{lead}
				</p>
			</div>
			<p class="m-0 text-xs font-black tracking-[0.22em] uppercase">
				Last updated: {lastUpdated}
			</p>
		</div>

		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 hidden w-24 flex-col items-center justify-between border-l-[3px] py-6 lg:flex"
			aria-hidden="true"
		>
			<span class="text-2xl leading-none font-black italic">3FT</span>
			<span
				class="my-4 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
			></span>
			<span class="text-2xl leading-none font-black italic">0</span>
		</div>
	</header>

	<!-- LEGAL SUB-NAV -->
	<nav
		aria-label="Legal documents"
		class="bg-secondary-500 text-surface-50 border-surface-950 flex flex-wrap items-center gap-3 border-y-[3px] px-6 py-4 sm:px-10 lg:px-14"
	>
		{#each NAV_LINKS as link (link.href)}
			{@const isActive = currentPath === link.href}
			<a
				href={link.href}
				aria-current={isActive ? 'page' : undefined}
				class={isActive
					? 'bg-primary-500 text-surface-950 inline-flex items-center px-4 py-2 text-xs font-black tracking-[0.18em] uppercase hover:no-underline pointer-coarse:min-h-11'
					: 'border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-secondary-500 inline-flex items-center border-2 px-4 py-2 text-xs font-black tracking-[0.18em] uppercase transition hover:no-underline pointer-coarse:min-h-11'}
			>
				{link.label}
			</a>
		{/each}
	</nav>

	<!-- CLAUSES -->
	<section class="bg-surface-950 px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
		<div class="border-surface-50 flex flex-col border-t-2">
			{@render children?.()}
		</div>
	</section>

	<!-- Ruler band: 0 → 3 ft -->
	<div
		class="bg-tertiary-500 text-surface-950 border-surface-950 grid grid-cols-3 border-t-[3px]"
		aria-hidden="true"
	>
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
</div>
