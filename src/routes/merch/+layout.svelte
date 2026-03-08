<script>
	import { page } from '$app/stores';
	import IconStore from '@lucide/svelte/icons/store';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconReceiptText from '@lucide/svelte/icons/receipt-text';
	import IconSettings from '@lucide/svelte/icons/settings';
	import SectionSecondaryNav from '$lib/components/navigation/SectionSecondaryNav.svelte';

	let { children } = $props();

	const pathname = $derived($page.url.pathname);
	const isAdmin = $derived(Boolean($page.data?.isAdmin));

	const navSections = $derived.by(() => {
		const sections = [
			{
				label: '',
				items: [
					{
						label: 'Store',
						href: '/merch',
						icon: IconStore
					},
					{
						label: 'Checkout',
						href: '/merch/checkout',
						icon: IconCreditCard,
						tone: 'tertiary'
					},
					{
						label: 'Order History',
						href: '/merch/orders',
						icon: IconReceiptText,
						tone: 'primary'
					}
				]
			}
		];

		if (isAdmin) {
			sections.push({
				label: '',
				items: [
					{
						label: 'Manage Store',
						href: '/merch/manage',
						icon: IconSettings,
						tone: 'secondary'
					}
				]
			});
		}

		return sections;
	});
</script>

<SectionSecondaryNav title="Merch" sections={navSections} currentPath={pathname} layout="split" />

{@render children()}
