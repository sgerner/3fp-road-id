<script>
	/**
	 * @typedef {{
	 *   label: string,
	 *   href: string,
	 *   icon?: import('svelte').Component<any>,
	 *   tone?: string,
	 *   match?: string
	 * }} SecondaryNavItem
	 */

	/**
	 * @type {{
	 *   title: string,
	 *   ariaLabel: string,
	 *   sections?: Array<{ label?: string, items?: SecondaryNavItem[] }>,
	 *   pathname?: string
	 * }}
	 */
	let { title, ariaLabel, sections = [], pathname = '' } = $props();

	function isActive(item) {
		if (!item?.href) return false;
		if (item.match === 'prefix') {
			return pathname === item.href || pathname.startsWith(`${item.href}/`);
		}
		return pathname === item.href;
	}

	function itemClass(item) {
		const base =
			'inline-flex min-w-0 max-w-full items-center gap-2 px-3.5 py-2 text-xs font-black tracking-[0.14em] whitespace-nowrap uppercase transition hover:no-underline pointer-coarse:min-h-11 pointer-coarse:min-w-11';
		if (isActive(item)) {
			return `${base} bg-primary-500 text-surface-950`;
		}
		if (item?.tone === 'secondary') {
			return `${base} bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950`;
		}
		if (item?.tone === 'tertiary') {
			return `${base} bg-tertiary-500 text-surface-950 hover:bg-primary-500`;
		}
		return `${base} border-surface-700 text-surface-50 hover:border-primary-500 hover:text-primary-500 border-2`;
	}
</script>

{#snippet navItems(items, labelClass)}
	{#each items as item (item.href)}
		<a
			href={item.href}
			class={itemClass(item)}
			aria-current={isActive(item) ? 'page' : undefined}
			title={item.label}
		>
			{#if item.icon}
				<item.icon class="h-3.5 w-3.5 shrink-0" />
			{/if}
			<span class="block {labelClass}">{item.label}</span>
		</a>
	{/each}
{/snippet}

{#if Array.isArray(sections) && sections.some((section) => section?.items?.length)}
	<nav
		aria-label={ariaLabel}
		class="bg-surface-950 text-surface-50 border-surface-800 -mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b-[3px] px-6 py-3 sm:px-10 lg:px-14"
	>
		<div class="flex flex-wrap items-center gap-3">
			<span
				class="text-primary-500 mr-2 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
				{title}
			</span>
			{@render navItems(sections[0]?.items ?? [], 'max-w-[10rem] truncate sm:max-w-[14rem]')}
		</div>

		{#if sections[1]?.items?.length}
			<div class="flex flex-wrap items-center gap-2">
				{#if sections[1].label}
					<span class="text-surface-300 text-[0.65rem] font-bold tracking-[0.22em] uppercase">
						{sections[1].label}
					</span>
				{/if}
				{@render navItems(sections[1].items, 'max-w-[8rem] truncate sm:max-w-[12rem]')}
			</div>
		{/if}
	</nav>
{/if}
