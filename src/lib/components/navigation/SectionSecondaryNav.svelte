<script>
	let { title = '', sections = [], currentPath = '', layout = 'stacked' } = $props();

	function isActive(item) {
		if (!item?.href) return false;
		if (typeof item.match === 'function') return item.match(currentPath);
		if (item.match === 'prefix') {
			return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
		}
		return currentPath === item.href;
	}

	function buttonClass(item) {
		if (item?.kind === 'separator') {
			return 'text-surface-700-300 flex shrink-0 items-center px-1 text-sm font-semibold';
		}
		if (isActive(item))
			return 'btn btn-sm preset-filled-primary-500 shrink-0 gap-2 whitespace-nowrap';
		switch (item?.tone) {
			case 'secondary':
				return 'btn btn-sm preset-outlined-secondary-500 shrink-0 gap-2 whitespace-nowrap';
			case 'tertiary':
				return 'btn btn-sm preset-tonal-tertiary shrink-0 gap-2 whitespace-nowrap';
			case 'primary':
				return 'btn btn-sm preset-tonal-primary shrink-0 gap-2 whitespace-nowrap';
			default:
				return 'btn btn-sm preset-tonal-surface shrink-0 gap-2 whitespace-nowrap';
		}
	}
</script>

{#if sections.some((section) => section?.items?.length)}
	{@const visibleSections = sections.filter((section) => section?.items?.length)}
	<nav
		aria-label={title ? `${title} secondary navigation` : 'Secondary navigation'}
		class="border-surface-500/20 bg-surface-50-950/55 mb-6 rounded-2xl border p-3 shadow-sm"
	>
		{#if layout === 'split'}
			<div class="flex flex-wrap items-start justify-between gap-3">
				{#each visibleSections as section}
					<div class="flex min-w-0 flex-wrap items-center gap-2">
						{#if section.label}
							<p
								class="text-surface-700-300 px-1 text-[0.7rem] font-semibold tracking-[0.24em] uppercase"
							>
								{section.label}
							</p>
						{/if}
						<div class="flex min-w-0 flex-wrap gap-2">
							{#each section.items as item}
								{#if item.kind === 'separator' || !item.href}
									<span class={buttonClass(item)} aria-hidden="true">{item.label}</span>
								{:else}
									<a
										href={item.href}
										class={buttonClass(item)}
										aria-current={isActive(item) ? 'page' : undefined}
										title={item.label}
									>
										{#if item.icon}
											<item.icon class="h-4 w-4 shrink-0" />
										{/if}
										<span class="max-w-[14rem] truncate">{item.label}</span>
									</a>
								{/if}
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="space-y-3">
				{#each visibleSections as section}
					<div class="space-y-1.5">
						{#if section.label}
							<p
								class="text-surface-700-300 px-1 text-[0.7rem] font-semibold tracking-[0.24em] uppercase"
							>
								{section.label}
							</p>
						{/if}
						<div class="flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap">
							{#each section.items as item}
								{#if item.kind === 'separator' || !item.href}
									<span class={buttonClass(item)} aria-hidden="true">{item.label}</span>
								{:else}
									<a
										href={item.href}
										class={buttonClass(item)}
										aria-current={isActive(item) ? 'page' : undefined}
										title={item.label}
									>
										{#if item.icon}
											<item.icon class="h-4 w-4 shrink-0" />
										{/if}
										<span class="max-w-[14rem] truncate">{item.label}</span>
									</a>
								{/if}
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</nav>
{/if}
