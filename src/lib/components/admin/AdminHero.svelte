<script>
	// Compact asphalt hero shared by every /admin page (docs/design-language.md, secondary pages).
	let { eyebrow, title, children, actions } = $props();
</script>

<section class="border-surface-800 border-b-2" aria-labelledby="admin-heading">
	<div
		class="border-primary-500 flex flex-col gap-5 border-l-4 px-6 py-8 sm:px-10 lg:flex-row lg:items-end lg:justify-between lg:px-14 lg:py-10"
	>
		<div class="flex min-w-0 flex-col gap-3">
			<p
				class="text-primary-500 m-0 flex items-center gap-2.5 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
				<span>{eyebrow}</span>
			</p>
			<h1
				id="admin-heading"
				class="m-0 text-3xl leading-[0.92] font-black tracking-[-0.03em] text-balance uppercase italic sm:text-5xl"
			>
				{title}
			</h1>
			{#if children}
				<p class="text-surface-300 m-0 max-w-2xl text-base leading-snug font-medium">
					{@render children()}
				</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex flex-wrap items-center gap-3">
				{@render actions()}
			</div>
		{/if}
	</div>
</section>
