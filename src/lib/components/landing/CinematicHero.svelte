<script>
	let {
		eyebrow,
		title,
		description = '',
		icon: Icon,
		imageUrl = '',
		imageAlt = '',
		stats = [],
		actions
	} = $props();
</script>

<section
	class={`card preset-filled-surface-950 relative overflow-hidden text-surface-50 ${imageUrl ? 'min-h-[32rem] sm:min-h-[36rem]' : 'min-h-[27rem] sm:min-h-[30rem]'}`}
>
	{#if imageUrl}
		<img
			src={imageUrl}
			alt={imageAlt}
			class="absolute inset-0 h-full w-full object-cover saturate-125 contrast-[1.04]"
		/>
		<div
			class="absolute inset-0 bg-gradient-to-r from-surface-950 via-surface-950/88 to-surface-950/50"
		></div>
		<div
			class="absolute inset-0 bg-gradient-to-t from-surface-950/85 via-transparent to-surface-950/25"
		></div>
	{/if}

	<div
		class={`relative z-10 flex flex-col justify-between p-6 sm:p-10 lg:p-14 ${imageUrl ? 'min-h-[32rem] gap-10 sm:min-h-[36rem]' : 'min-h-[27rem] gap-8 sm:min-h-[30rem]'}`}
	>
		<p class="flex items-center gap-2 text-sm font-black tracking-[0.2em] uppercase opacity-85">
			{#if Icon}<Icon class="h-5 w-5" />{/if}
			{eyebrow}
		</p>

		<div class="max-w-4xl space-y-6">
			<h1
				class="max-w-4xl text-4xl leading-[0.98] font-black tracking-tight text-balance sm:text-6xl lg:text-7xl"
			>
				{title}
			</h1>
			{#if description}
				<p class="max-w-2xl text-lg leading-relaxed text-balance opacity-80 sm:text-xl">
					{description}
				</p>
			{/if}
			{#if actions}
				<div class="flex flex-wrap gap-3 pt-1">{@render actions()}</div>
			{/if}
		</div>

		{#if stats.length}
			<div class="divide-surface-50/20 grid max-w-3xl grid-cols-3 divide-x">
				{#each stats as stat}
					<div class="min-w-0 px-3 first:pl-0 sm:px-6 sm:first:pl-0">
						<p class="text-xl font-black tabular-nums sm:text-3xl">{stat.value}</p>
						<p
							class="mt-1 text-[0.65rem] leading-tight font-bold tracking-wide uppercase opacity-60 sm:text-xs"
						>
							{stat.label}
						</p>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>
