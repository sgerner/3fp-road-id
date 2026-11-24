<script>
	import { page } from '$app/state';
	import IconBike from '@lucide/svelte/icons/bike';
	import IconLink from '@lucide/svelte/icons/link';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';

	/** @type {Record<string, any>} */
	let { children } = $props();

	/** @type {any} */
	const pathname = $derived(page.url.pathname);
	/** @type {any} */
	const currentUser = $derived(page.data?.currentUser ?? null);
	/** @type {any} */
	const currentRide = $derived(page.data?.ride ?? null);
	/** @type {any} */
	const currentRideSlug = $derived(currentRide?.activity?.slug ?? null);
	/** @type {any} */
	const isWidgetFrame = $derived(pathname.startsWith('/ride/widget/frame'));
	/** @type {any} */
	const canManageCurrentRide = $derived(
		Boolean(
			currentRideSlug &&
			(page.data?.canManage ||
				pathname === `/ride/${currentRideSlug}/manage` ||
				pathname.startsWith(`/ride/${currentRideSlug}/manage`))
		)
	);

	const currentRideTitle = $derived(currentRide?.activity?.title ?? 'Ride Details');
	const isManageRoute = $derived(
		Boolean(
			currentRideSlug &&
			(pathname === `/ride/${currentRideSlug}/manage` ||
				pathname.startsWith(`/ride/${currentRideSlug}/manage/`))
		)
	);
</script>

{#if !isWidgetFrame}
	<nav
		aria-label="Ride secondary navigation"
		class="bg-surface-950 text-surface-50 border-surface-800 -mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-1.5 border-b-2 px-3 py-2 sm:gap-3 sm:px-10 sm:py-3 lg:px-14"
	>
		<div class="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
			<span class="bg-tertiary-500 h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden="true"></span>
			<a
				href="/ride"
				aria-current={pathname === '/ride' ? 'page' : undefined}
				class="inline-flex min-h-11 items-center gap-1.5 px-2.5 py-2 text-xs font-black tracking-[0.08em] whitespace-nowrap uppercase transition hover:no-underline sm:gap-2 sm:px-3.5 sm:tracking-[0.18em] {pathname ===
				'/ride'
					? 'bg-primary-400 text-surface-950'
					: 'text-surface-50 hover:bg-surface-800 hover:text-primary-300'}"
			>
				<IconBike class="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
				<span>Browse Rides</span>
			</a>

			<a
				href="/ride/widget"
				aria-current={pathname === '/ride/widget' ? 'page' : undefined}
				class="hidden min-h-11 items-center gap-2 px-3.5 py-2 text-xs font-black tracking-[0.18em] whitespace-nowrap uppercase transition hover:no-underline sm:inline-flex {pathname ===
				'/ride/widget'
					? 'bg-primary-400 text-surface-950'
					: 'text-surface-50 hover:bg-surface-800 hover:text-primary-300'}"
			>
				<IconLink class="h-4 w-4 shrink-0" />
				<span>Embed</span>
			</a>

			{#if currentRideSlug}
				<span class="text-tertiary-500 hidden px-1 text-xs font-black sm:inline" aria-hidden="true"
					>/</span
				>
				{#if isManageRoute}
					<a
						href={`/ride/${currentRideSlug}`}
						title={currentRideTitle}
						class="text-surface-200 hover:bg-surface-800 hover:text-primary-300 hidden min-h-11 items-center gap-2 px-3 py-2 text-xs font-bold tracking-[0.14em] uppercase transition hover:no-underline sm:inline-flex"
					>
						<span class="max-w-[16rem] truncate">{currentRideTitle}</span>
					</a>
				{:else}
					<span
						title={currentRideTitle}
						class="text-surface-200 hidden max-w-[18rem] truncate text-xs font-bold tracking-[0.14em] uppercase sm:inline"
					>
						{currentRideTitle}
					</span>
				{/if}
			{/if}
		</div>

		{#if currentUser || (currentRideSlug && canManageCurrentRide)}
			<div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
				{#if currentUser}
					<a
						href="/ride/new"
						aria-current={pathname === '/ride/new' ? 'page' : undefined}
						class="inline-flex min-h-11 items-center gap-1.5 px-2.5 py-2 text-xs font-black tracking-[0.08em] whitespace-nowrap uppercase transition hover:no-underline sm:gap-2 sm:px-3.5 sm:tracking-[0.18em] {pathname ===
						'/ride/new'
							? 'bg-primary-400 text-surface-950'
							: 'border-surface-50 text-surface-50 hover:bg-primary-400 hover:border-primary-400 hover:text-surface-950 border-2'}"
					>
						<IconPlus class="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
						<span>Create Ride</span>
					</a>
				{/if}

				{#if currentRideSlug && canManageCurrentRide}
					<a
						href={`/ride/${currentRideSlug}/manage`}
						aria-current={isManageRoute ? 'page' : undefined}
						class="hidden min-h-11 items-center gap-2 px-3.5 py-2 text-xs font-black tracking-[0.18em] whitespace-nowrap uppercase transition hover:no-underline sm:inline-flex {isManageRoute
							? 'bg-primary-400 text-surface-950'
							: 'border-surface-50 text-surface-50 hover:bg-primary-400 hover:border-primary-400 hover:text-surface-950 border-2'}"
					>
						<IconSquarePen class="h-4 w-4 shrink-0" />
						<span>Manage Ride</span>
					</a>
				{/if}
			</div>
		{/if}
	</nav>
{/if}

{@render children()}
