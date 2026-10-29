<script>
	import { page } from '$app/state';
	import IconStore from '@lucide/svelte/icons/store';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconReceiptText from '@lucide/svelte/icons/receipt-text';
	import IconSettings from '@lucide/svelte/icons/settings';

	let { children } = $props();

	const pathname = $derived(page.url.pathname);
	const isAdmin = $derived(Boolean(page.data?.isAdmin));
	const isManageRoute = $derived(pathname.startsWith('/merch/manage'));

	const navItems = [
		{
			label: 'Store',
			href: '/merch',
			icon: IconStore
		},
		{
			label: 'Checkout',
			href: '/merch/checkout',
			icon: IconCreditCard
		},
		{
			label: 'Order History',
			href: '/merch/orders',
			icon: IconReceiptText
		}
	];

	function isActive(href) {
		return pathname === href;
	}
</script>

<div class="-mx-4 -mt-4 flex flex-col {isManageRoute ? 'mb-0' : '-mb-4 overflow-hidden'}">
	<nav
		aria-label="Merch secondary navigation"
		class="bg-surface-950 text-surface-50 border-surface-800 flex flex-wrap items-stretch justify-between border-b-[3px] px-4 sm:px-8 lg:px-14"
	>
		<div class="flex flex-wrap items-stretch">
			<div
				class="border-surface-800 mr-2 flex items-center gap-2.5 py-3 pr-4 sm:mr-4 sm:border-r-[3px] sm:pr-6"
			>
				<span class="bg-tertiary-500 h-3 w-3 shrink-0" aria-hidden="true"></span>
				<span class="text-primary-500 text-xs font-black tracking-[0.22em] uppercase">
					Merch Stand
				</span>
			</div>

			<div class="flex flex-wrap items-stretch gap-1 py-2">
				{#each navItems as item (item.href)}
					{@const active = isActive(item.href)}
					<a
						href={item.href}
						aria-current={active ? 'page' : undefined}
						class="inline-flex items-center gap-2 px-4 py-2 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline {active
							? 'bg-primary-500 text-surface-950'
							: 'text-surface-50 hover:bg-secondary-500 hover:text-surface-50'}"
					>
						<item.icon class="h-4 w-4 shrink-0" />
						<span>{item.label}</span>
					</a>
				{/each}
			</div>
		</div>

		{#if isAdmin}
			<div class="flex items-center py-2">
				<a
					href="/merch/manage"
					aria-current={isManageRoute ? 'page' : undefined}
					class="inline-flex items-center gap-2 border-2 px-4 py-1.5 text-xs font-black tracking-[0.16em] uppercase transition hover:no-underline {isManageRoute
						? 'border-tertiary-500 bg-tertiary-500 text-surface-950'
						: 'border-surface-50 text-surface-50 hover:bg-surface-50 hover:text-surface-950'}"
				>
					<IconSettings class="h-3.5 w-3.5 shrink-0" />
					<span>Manage Store</span>
				</a>
			</div>
		{/if}
	</nav>

	{#if isManageRoute}
		<div class="p-4 pt-6">
			{@render children()}
		</div>
	{:else}
		{@render children()}
	{/if}
</div>
