<script>
	import { page } from '$app/state';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconLink from '@lucide/svelte/icons/link';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';

	let { children } = $props();

	const pathname = $derived(page.url.pathname);
	const currentUser = $derived(page.data?.currentUser ?? null);
	const currentRide = $derived(page.data?.ride ?? null);
	const currentRideSlug = $derived(currentRide?.activity?.slug ?? null);
	const isWidgetFrame = $derived(pathname.startsWith('/ride/widget/frame'));
	const canManageCurrentRide = $derived(
		Boolean(
			currentRideSlug &&
			(page.data?.canManage ||
				pathname === `/ride/${currentRideSlug}/manage` ||
				pathname.startsWith(`/ride/${currentRideSlug}/manage`))
		)
	);

	const navSections = $derived.by(() => {
		const sections = [
			{
				label: '',
				items: [
					{
						label: 'Browse Rides',
						href: '/ride',
						icon: IconBike
					},
					{
						label: 'Embed',
						href: '/ride/widget',
						icon: IconLink
					}
				]
			}
		];

		const actionSection = {
			label: '',
			items: []
		};

		if (currentUser) {
			actionSection.items.push({
				label: 'Create Ride',
				href: '/ride/new',
				icon: IconPlus,
				tone: 'secondary'
			});
		}

		if (currentRideSlug) {
			actionSection.items.push({
				label: currentRide?.activity?.title ?? 'Ride Details',
				href: `/ride/${currentRideSlug}`,
				icon: IconBike,
				tone: 'primary'
			});

			if (canManageCurrentRide) {
				actionSection.items.push({
					label: 'Manage Ride',
					href: `/ride/${currentRideSlug}/manage`,
					icon: IconSquarePen,
					tone: 'secondary'
				});
			}
		}

		if (actionSection.items.length) {
			sections.push(actionSection);
		}

		return sections;
	});

	function isActive(item) {
		if (!item?.href) return false;
		if (typeof item.match === 'function') return item.match(pathname);
		if (item.match === 'prefix') {
			return pathname === item.href || pathname.startsWith(`${item.href}/`);
		}
		return pathname === item.href;
	}

	function itemClass(item) {
		const base =
			'inline-flex min-w-0 max-w-full items-center gap-2 px-4 py-2 text-xs font-black tracking-[0.16em] whitespace-nowrap uppercase transition hover:no-underline';
		if (isActive(item)) {
			return `${base} bg-primary-500 text-surface-950`;
		}
		if (item?.tone === 'secondary') {
			return `${base} border-surface-50 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950 border-2 py-1.5`;
		}
		if (item?.tone === 'primary') {
			return `${base} bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950`;
		}
		return `${base} text-surface-50 hover:bg-surface-800 hover:text-primary-500`;
	}
</script>

{#if !isWidgetFrame}
	<nav
		aria-label="Ride secondary navigation"
		class="bg-surface-950 text-surface-50 border-surface-800 -mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 px-6 py-3 sm:px-10 lg:px-14"
	>
		{#each navSections as section, idx (idx)}
			<div class="flex min-w-0 flex-wrap items-center gap-2">
				{#if idx === 0}
					<span
						class="bg-tertiary-500 text-surface-950 mr-1 px-2.5 py-1 text-xs font-black tracking-[0.22em] uppercase italic"
					>
						Ride
					</span>
				{/if}
				{#each section.items as item (item.href)}
					<a
						href={item.href}
						class={itemClass(item)}
						aria-current={isActive(item) ? 'page' : undefined}
						title={item.label}
					>
						{#if item.icon}
							<item.icon class="h-4 w-4 shrink-0" />
						{/if}
						<span class="block max-w-[10rem] truncate sm:max-w-[14rem]">{item.label}</span>
					</a>
				{/each}
			</div>
		{/each}
	</nav>
{/if}

{@render children()}
