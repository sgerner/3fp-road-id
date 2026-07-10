<script>
	let { eyebrow = 'Explore', title, description = '', icon: Icon, actions, children } = $props();
</script>

<section class="preset-tonal-surface p-5 sm:p-7" aria-label={title}>
	<div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
		<div class="max-w-2xl">
			<p class="flex items-center gap-2 text-xs font-black tracking-[0.2em] uppercase opacity-55">
				{#if Icon}<Icon class="h-4 w-4" />{/if}
				{eyebrow}
			</p>
			<h2 class="mt-2 text-2xl font-black tracking-tight text-balance sm:text-3xl">{title}</h2>
			{#if description}<p class="mt-2 text-sm leading-relaxed opacity-65">{description}</p>{/if}
		</div>
		{#if actions}<div class="flex flex-wrap gap-2">{@render actions()}</div>{/if}
	</div>
	<div class="mt-6">{@render children()}</div>
</section>
