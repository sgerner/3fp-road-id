<script>
	import IconPieChart from '@lucide/svelte/icons/pie-chart';
	import IconTrendingUp from '@lucide/svelte/icons/trending-up';
	import IconAlertTriangle from '@lucide/svelte/icons/alert-triangle';

	export let counts = {
		total: 0,
		attending: 0,
		approved: 0,
		hours: 0
	};
	export let shiftGroups = [];

	const attendanceRate = counts.total ? Math.round((counts.attending / counts.total) * 100) : 0;
	const noShowCount = Math.max((counts.approved ?? 0) - (counts.attending ?? 0), 0);
</script>

<section
	class="border-surface-700 bg-surface-900/70 rounded-2xl border p-6 shadow-xl shadow-black/30"
>
	{#if shiftGroups.length}
		<div class="space-y-3">
			<header class="flex flex-col gap-1">
				<h3 class="!text-left text-xl font-semibold text-white">Shift Summary</h3>
				<p class="text-surface-400 text-sm">Review coverage by activity.</p>
			</header>
			<div class="space-y-3">
				{#each shiftGroups as group (group.id)}
					<div class="space-y-3">
						<h4 class="text-surface-200 !text-left text-lg font-semibold tracking-wide uppercase">
							{group.title}
						</h4>
						<div class="grid gap-3 md:grid-cols-3">
							{#each group.shifts as shift (shift.id)}
								<article class="bg-surface-950/40 border-surface-700/60 rounded-xl border p-4">
									<div class="text-surface-300 text-sm">{shift.label}</div>
									<p class="mt-2 text-xl font-semibold text-white">{shift.approved}</p>
									<p class="text-surface-400 text-xs">
										{#if shift.capacity}
											Capacity {shift.capacity} •
										{/if}
										{shift.attending} present • {shift.waitlisted} waitlisted
									</p>
								</article>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>
