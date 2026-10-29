<script>
	import { page } from '$app/state';
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconClipboardList from '@lucide/svelte/icons/clipboard-list';
	import IconHandHeart from '@lucide/svelte/icons/hand-heart';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconUsers from '@lucide/svelte/icons/users';

	let { data, children } = $props();

	const pathname = $derived(page.url.pathname);
	const currentUser = $derived(data?.volunteerNavUser ?? null);
	const currentEvent = $derived(page.data?.event ?? null);
	const currentEventSlug = $derived(currentEvent?.slug ?? null);
	const canManageCurrentEvent = $derived(
		Boolean(
			currentEventSlug &&
			(page.data?.canManageEvent ||
				pathname === `/volunteer/${currentEventSlug}/edit` ||
				pathname === `/volunteer/${currentEventSlug}/manage`)
		)
	);

	const navSections = $derived.by(() => {
		const sections = [
			{
				label: '',
				items: [
					{
						label: 'Volunteer',
						href: '/volunteer',
						icon: IconHandHeart
					},
					{
						label: 'By Group',
						href: '/volunteer/groups',
						icon: IconUsers,
						tone: 'tertiary'
					},
					{
						label: 'My Shifts',
						href: '/volunteer/shifts',
						icon: IconClipboardList,
						tone: 'primary'
					}
				]
			}
		];

		if (currentUser && currentEventSlug && canManageCurrentEvent) {
			sections.push({
				label: 'Host Tools',
				items: [
					{
						label: 'View Event',
						href: `/volunteer/${currentEventSlug}`,
						icon: IconCalendar
					},
					{
						label: 'Edit Event',
						href: `/volunteer/${currentEventSlug}/edit`,
						icon: IconSquarePen,
						tone: 'secondary'
					},
					{
						label: 'Manage Event',
						href: `/volunteer/${currentEventSlug}/manage`,
						icon: IconClipboardList,
						tone: 'primary'
					}
				]
			});
		} else if (currentUser) {
			sections.push({
				label: 'Host',
				items: [
					{
						label: 'Hosted Events',
						href: '/volunteer/hosted',
						icon: IconCalendar,
						tone: 'primary'
					},
					{
						label: 'Create Event',
						href: '/volunteer/new',
						icon: IconPlus,
						tone: 'secondary'
					}
				]
			});
		}

		return sections;
	});

	function isActive(item) {
		if (!item?.href) return false;
		if (item.match === 'prefix') {
			return pathname === item.href || pathname.startsWith(`${item.href}/`);
		}
		return pathname === item.href;
	}

	function itemClass(item) {
		const base =
			'inline-flex min-w-0 max-w-full items-center gap-2 px-3.5 py-2 text-xs font-black tracking-[0.14em] whitespace-nowrap uppercase transition hover:no-underline';
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

{#if navSections.some((section) => section?.items?.length)}
	<nav
		aria-label="Volunteer secondary navigation"
		class="bg-surface-950 text-surface-50 border-surface-800 -mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b-[3px] px-6 py-3 sm:px-10 lg:px-14"
	>
		<div class="flex flex-wrap items-center gap-3">
			<span
				class="text-primary-500 mr-2 flex items-center gap-2 text-xs font-bold tracking-[0.22em] uppercase"
			>
				<span class="bg-tertiary-500 h-2.5 w-2.5" aria-hidden="true"></span>
				Volunteer
			</span>
			{#each navSections[0]?.items ?? [] as item (item.href)}
				<a
					href={item.href}
					class={itemClass(item)}
					aria-current={isActive(item) ? 'page' : undefined}
					title={item.label}
				>
					{#if item.icon}
						<item.icon class="h-3.5 w-3.5 shrink-0" />
					{/if}
					<span class="block max-w-[10rem] truncate sm:max-w-[14rem]">{item.label}</span>
				</a>
			{/each}
		</div>

		{#if navSections[1]?.items?.length}
			<div class="flex flex-wrap items-center gap-2">
				{#if navSections[1].label}
					<span class="text-surface-300 text-[0.65rem] font-bold tracking-[0.22em] uppercase">
						{navSections[1].label}
					</span>
				{/if}
				{#each navSections[1].items as item (item.href)}
					<a
						href={item.href}
						class={itemClass(item)}
						aria-current={isActive(item) ? 'page' : undefined}
						title={item.label}
					>
						{#if item.icon}
							<item.icon class="h-3.5 w-3.5 shrink-0" />
						{/if}
						<span class="block max-w-[8rem] truncate sm:max-w-[12rem]">{item.label}</span>
					</a>
				{/each}
			</div>
		{/if}
	</nav>
{/if}

{@render children()}
