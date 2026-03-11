<script>
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconCheckCircle from '@lucide/svelte/icons/check-circle';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';

	export let title = 'Volunteer Event Management';
	export let schedule = '';
	export let location = '';
	export let description = '';
	export let counts = {
		total: 0,
		pending: 0,
		waitlisted: 0,
		declined: 0,
		approved: 0,
		attending: 0,
		hours: 0
	};

	let detailsExpanded = false;
</script>

<div class="flex flex-col gap-2">
	<!-- Title row -->
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<h1 class="!text-left text-2xl font-bold text-white drop-shadow-sm md:text-3xl truncate">
				{title}
			</h1>
			{#if description}
				<p class="text-surface-300 mt-1 max-w-2xl text-sm leading-relaxed line-clamp-2 hidden md:block">
					{description}
				</p>
			{/if}
		</div>

		<!-- Event meta: desktop always visible, mobile toggleable -->
		<button
			type="button"
			class="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 transition-colors md:hidden"
			onclick={() => (detailsExpanded = !detailsExpanded)}
			aria-expanded={detailsExpanded}
		>
			<IconCalendar class="h-3.5 w-3.5" />
			<span>Details</span>
			<IconChevronDown class={`h-3 w-3 transition-transform ${detailsExpanded ? 'rotate-180' : ''}`} />
		</button>
	</div>

	<!-- Stats row -->
	<div class="flex flex-wrap items-center gap-2">
		<div class="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white">
			<IconUsers class="h-3.5 w-3.5 text-white/70" />
			<span class="font-bold">{counts.total ?? 0}</span>
			<span class="text-white/70">Signups</span>
		</div>
		<div class="flex items-center gap-1.5 rounded-full bg-success-500/20 px-3 py-1 text-sm font-medium text-success-300">
			<IconCheckCircle class="h-3.5 w-3.5" />
			<span class="font-bold">{counts.approved ?? 0}</span>
			<span class="opacity-80">Approved</span>
		</div>
		{#if (counts.pending ?? 0) > 0}
			<div class="flex items-center gap-1.5 rounded-full bg-warning-500/20 px-3 py-1 text-sm font-medium text-warning-300">
				<IconClock class="h-3.5 w-3.5" />
				<span class="font-bold">{counts.pending}</span>
				<span class="opacity-80">Pending</span>
			</div>
		{/if}
		{#if (counts.waitlisted ?? 0) > 0}
			<div class="flex items-center gap-1.5 rounded-full bg-surface-500/20 px-3 py-1 text-sm font-medium text-surface-300">
				<span class="font-bold">{counts.waitlisted}</span>
				<span class="opacity-80">Waitlisted</span>
			</div>
		{/if}

		<!-- Desktop event meta inline -->
		<div class="hidden md:flex items-center gap-4 ml-2">
			{#if schedule}
				<div class="flex items-center gap-1.5 text-xs text-white/60">
					<IconCalendar class="h-3.5 w-3.5 flex-shrink-0" />
					<span>{schedule}</span>
				</div>
			{/if}
			{#if location}
				<div class="flex items-center gap-1.5 text-xs text-white/60">
					<IconMapPin class="h-3.5 w-3.5 flex-shrink-0" />
					<span>{location}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Mobile expandable details -->
	{#if detailsExpanded}
		<div class="flex flex-col gap-1.5 md:hidden mt-1 px-1">
			{#if schedule}
				<div class="flex items-center gap-1.5 text-xs text-white/60">
					<IconCalendar class="h-3.5 w-3.5 flex-shrink-0" />
					<span>{schedule}</span>
				</div>
			{/if}
			{#if location}
				<div class="flex items-center gap-1.5 text-xs text-white/60">
					<IconMapPin class="h-3.5 w-3.5 flex-shrink-0" />
					<span>{location}</span>
				</div>
			{/if}
			{#if description}
				<p class="text-surface-300 text-xs leading-relaxed">{description}</p>
			{/if}
		</div>
	{/if}
</div>
