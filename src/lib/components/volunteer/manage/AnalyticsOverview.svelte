<script lang="ts">
	import ManageShiftHeader, { type ShiftHeaderBadge } from './ManageShiftHeader.svelte';

	type VolunteerCounts = {
		total?: number;
		attending?: number;
		approved?: number;
		pending?: number;
		waitlisted?: number;
		declined?: number;
		hours?: number;
	};

	type ShiftCoverageItem = {
		id: string | number | null;
		label?: string;
		windowLabel?: string;
		capacity?: number | null;
		approved?: number;
		waitlisted?: number;
		pending?: number;
		attending?: number;
	};

	type ShiftCoverageGroup = {
		id: string | number | null;
		title: string;
		shifts: ShiftCoverageItem[];
	};

	type Props = {
		counts?: VolunteerCounts;
		shiftGroups?: ShiftCoverageGroup[];
	};

	const {
		counts = {
			total: 0,
			attending: 0,
			approved: 0,
			pending: 0,
			waitlisted: 0,
			declined: 0,
			hours: 0
		},
		shiftGroups = []
	}: Props = $props();

	const headingId = $props.id();

	function fillPercent(value = 0, capacity: number | null | undefined = null): number | null {
		if (!capacity || capacity <= 0) return null;
		return Math.min(100, Math.round((value / capacity) * 100));
	}

	function buildShiftBadges(shift: ShiftCoverageItem): ShiftHeaderBadge[] {
		const approved = shift.approved ?? 0;
		const badges: ShiftHeaderBadge[] = [
			{
				label: `${approved} approved`,
				tone: approved > 0 ? 'success' : 'surface'
			}
		];

		if (shift.capacity && shift.capacity > 0) {
			badges.push({
				label: `${shift.capacity} cap`,
				tone: 'surface'
			});
		}

		if ((shift.pending ?? 0) > 0) {
			badges.push({
				label: `${shift.pending} pending`,
				tone: 'warning'
			});
		}

		if ((shift.waitlisted ?? 0) > 0) {
			badges.push({
				label: `+${shift.waitlisted} waitlisted`,
				tone: 'surface'
			});
		}

		if ((shift.attending ?? 0) > 0) {
			badges.push({
				label: `${shift.attending} present`,
				tone: 'primary'
			});
		}

		return badges;
	}
</script>

<section
	aria-labelledby={headingId}
	class="border-primary-500 bg-surface-900 text-surface-50 flex w-full min-w-0 flex-col gap-6 border-t-4 p-4 sm:p-6"
>
	<header class="flex flex-col gap-1">
		<h2 id={headingId} class="text-surface-50! m-0 text-left! text-xl font-black uppercase">
			Overview &amp; Shift Coverage
		</h2>
		<p class="text-surface-300 m-0 text-xs font-medium sm:text-sm">
			Approved volunteers, attendance, and capacity across every activity shift.
		</p>
	</header>

	<!-- Overall stats strip -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="border-primary-500 bg-surface-950 border-t-2 p-4 text-center">
			<div class="text-surface-50 text-3xl font-black tabular-nums">{counts.total ?? 0}</div>
			<div class="text-surface-300 mt-1 text-xs font-bold tracking-[0.18em] uppercase">Total</div>
		</div>
		<div class="border-success-500 bg-surface-950 border-t-2 p-4 text-center">
			<div class="text-success-400 text-3xl font-black tabular-nums">{counts.approved ?? 0}</div>
			<div class="text-surface-300 mt-1 text-xs font-bold tracking-[0.18em] uppercase">
				Approved
			</div>
		</div>
		<div class="border-warning-500 bg-surface-950 border-t-2 p-4 text-center">
			<div class="text-warning-400 text-3xl font-black tabular-nums">{counts.pending ?? 0}</div>
			<div class="text-surface-300 mt-1 text-xs font-bold tracking-[0.18em] uppercase">Pending</div>
		</div>
		<div class="border-secondary-400 bg-surface-950 border-t-2 p-4 text-center">
			<div class="text-surface-50 text-3xl font-black tabular-nums">
				{counts.attending ?? 0}
			</div>
			<div class="text-surface-300 mt-1 text-xs font-bold tracking-[0.18em] uppercase">
				Checked In
			</div>
		</div>
	</div>

	{#if shiftGroups.length}
		<div class="flex flex-col gap-5">
			{#each shiftGroups as group, groupIdx (group.id ?? `${group.title}-${groupIdx}`)}
				<div class="border-surface-800 flex min-w-0 flex-col gap-3 border-t-2 pt-4">
					<h3
						class="text-primary-500! m-0 text-left! text-xs font-black tracking-[0.18em] break-words uppercase sm:text-sm"
					>
						{group.title}
					</h3>
					<div class="flex min-w-0 flex-col gap-3">
						{#each group.shifts as shift, shiftIdx (shift.id ?? `${group.title}-${shiftIdx}`)}
							{@const pct = fillPercent(shift.approved ?? 0, shift.capacity)}
							{@const shiftTitle = shift.label || shift.windowLabel || 'Shift'}
							{@const shiftSubtitle =
								shift.windowLabel && shift.label && shift.windowLabel !== shift.label
									? shift.windowLabel
									: ''}
							<ManageShiftHeader
								headingLevel="h4"
								title={shiftTitle}
								subtitle={shiftSubtitle}
								badges={buildShiftBadges(shift)}
								progressPercent={pct}
								showUncappedBar={true}
								class="border-surface-800 border-2"
							/>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>
