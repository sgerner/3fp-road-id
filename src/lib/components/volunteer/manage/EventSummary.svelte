<script lang="ts">
	import IconCalendar from '@lucide/svelte/icons/calendar';
	import IconMapPin from '@lucide/svelte/icons/map-pin';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconCheckCircle from '@lucide/svelte/icons/circle-check-big';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';

	type Counts = {
		total?: number;
		pending?: number;
		waitlisted?: number;
		declined?: number;
		approved?: number;
		attending?: number;
		hours?: number;
	};

	type Props = {
		title?: string;
		status?: string;
		schedule?: string;
		location?: string;
		description?: string;
		counts?: Counts;
	};

	const {
		title = 'Volunteer Event Management',
		status: _status = '',
		schedule = '',
		location = '',
		description = '',
		counts = {
			total: 0,
			pending: 0,
			waitlisted: 0,
			declined: 0,
			approved: 0,
			attending: 0,
			hours: 0
		}
	}: Props = $props();

	let detailsExpanded = $state(false);
</script>

<div class="flex min-w-0 flex-col gap-2">
	<!-- Title row -->
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<h1
				class="text-surface-950-50! truncate text-left! text-2xl font-black tracking-tight uppercase italic md:text-3xl"
			>
				{title}
			</h1>
			{#if description}
				<p
					class="text-surface-700-300 mt-1 line-clamp-2 hidden max-w-2xl text-sm leading-relaxed md:block"
				>
					{description}
				</p>
			{/if}
		</div>

		<!-- Event meta: desktop always visible, mobile toggleable -->
		<button
			type="button"
			class="bg-surface-200-800 text-surface-800-200 hover:bg-primary-500 hover:text-surface-950 flex min-h-11 min-w-11 items-center gap-1.5 rounded-none! px-3 py-2 text-xs font-bold uppercase transition-colors md:hidden"
			onclick={() => (detailsExpanded = !detailsExpanded)}
			aria-expanded={detailsExpanded}
		>
			<IconCalendar class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
			<span>Details</span>
			<IconChevronDown
				class={`h-3.5 w-3.5 shrink-0 transition-transform ${detailsExpanded ? 'rotate-180' : ''}`}
				aria-hidden="true"
			/>
		</button>
	</div>

	<!-- Stats row -->
	<div class="flex flex-wrap items-center gap-2">
		<div
			class="bg-surface-200-800 text-surface-800-200 flex items-center gap-1.5 rounded-none! px-3 py-1 text-sm font-bold"
		>
			<IconUsers class="h-3.5 w-3.5" aria-hidden="true" />
			<span class="font-bold">{counts.total ?? 0}</span>
			<span>Signups</span>
		</div>
		<div
			class="bg-success-500 text-surface-950 flex items-center gap-1.5 rounded-none! px-3 py-1 text-sm font-bold"
		>
			<IconCheckCircle class="h-3.5 w-3.5" aria-hidden="true" />
			<span class="font-bold">{counts.approved ?? 0}</span>
			<span>Approved</span>
		</div>
		{#if (counts.pending ?? 0) > 0}
			<div
				class="bg-warning-500 text-surface-950 flex items-center gap-1.5 rounded-none! px-3 py-1 text-sm font-bold"
			>
				<IconClock class="h-3.5 w-3.5" aria-hidden="true" />
				<span class="font-bold">{counts.pending}</span>
				<span>Pending</span>
			</div>
		{/if}
		{#if (counts.waitlisted ?? 0) > 0}
			<div
				class="bg-surface-300 text-surface-950 flex items-center gap-1.5 rounded-none! px-3 py-1 text-sm font-bold"
			>
				<span class="font-bold">{counts.waitlisted}</span>
				<span>Waitlisted</span>
			</div>
		{/if}

		<!-- Desktop event meta inline -->
		<div class="text-surface-700-300 ml-2 hidden items-center gap-4 md:flex">
			{#if schedule}
				<div class="flex items-center gap-1.5 text-xs">
					<IconCalendar class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>{schedule}</span>
				</div>
			{/if}
			{#if location}
				<div class="flex items-center gap-1.5 text-xs">
					<IconMapPin class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>{location}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Mobile expandable details -->
	{#if detailsExpanded}
		<div class="text-surface-700-300 mt-1 flex flex-col gap-1.5 px-1 md:hidden">
			{#if schedule}
				<div class="flex items-center gap-1.5 text-xs">
					<IconCalendar class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>{schedule}</span>
				</div>
			{/if}
			{#if location}
				<div class="flex items-center gap-1.5 text-xs">
					<IconMapPin class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span>{location}</span>
				</div>
			{/if}
			{#if description}
				<p class="text-xs leading-relaxed">{description}</p>
			{/if}
		</div>
	{/if}
</div>
