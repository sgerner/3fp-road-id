<script>
	export let counts = {
		total: 0,
		attending: 0,
		approved: 0,
		pending: 0,
		waitlisted: 0,
		declined: 0,
		hours: 0
	};
	export let shiftGroups = [];

	function fillPercent(value, capacity) {
		if (!capacity || capacity <= 0) return null;
		return Math.min(100, Math.round((value / capacity) * 100));
	}

	function fillColor(percent) {
		if (percent === null) return 'bg-primary-500';
		if (percent >= 100) return 'bg-error-500';
		if (percent >= 75) return 'bg-warning-500';
		return 'bg-success-500';
	}
</script>

<section class="border-surface-300-700 bg-surface-100-900/70 rounded-2xl border p-6 shadow-xl">
	<!-- Overall stats strip -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="bg-surface-50-950/40 border-surface-300-700/50 rounded-xl border p-4 text-center">
			<div class="text-surface-950-50 text-3xl font-bold">{counts.total ?? 0}</div>
			<div class="text-surface-600-400 mt-0.5 text-xs tracking-wide uppercase">Total</div>
		</div>
		<div class="bg-success-500/10 border-success-500/30 rounded-xl border p-4 text-center">
			<div class="text-success-400 text-3xl font-bold">{counts.approved ?? 0}</div>
			<div class="text-surface-600-400 mt-0.5 text-xs tracking-wide uppercase">Approved</div>
		</div>
		<div class="bg-warning-500/10 border-warning-500/30 rounded-xl border p-4 text-center">
			<div class="text-warning-400 text-3xl font-bold">{counts.pending ?? 0}</div>
			<div class="text-surface-600-400 mt-0.5 text-xs tracking-wide uppercase">Pending</div>
		</div>
		<div class="bg-surface-500/10 border-surface-500/30 rounded-xl border p-4 text-center">
			<div class="text-surface-300 text-3xl font-bold">{counts.attending ?? 0}</div>
			<div class="text-surface-600-400 mt-0.5 text-xs tracking-wide uppercase">Checked In</div>
		</div>
	</div>

	{#if shiftGroups.length}
		<div class="space-y-5">
			<header>
				<h3 class="text-surface-950-50 !text-left text-base font-semibold">Shift Coverage</h3>
				<p class="text-surface-600-400 text-xs">Approved volunteers vs. capacity per shift</p>
			</header>
			<div class="space-y-4">
				{#each shiftGroups as group (group.id)}
					<div class="space-y-2">
						<h4
							class="text-surface-700-300 !text-left text-xs font-semibold tracking-wider uppercase"
						>
							{group.title}
						</h4>
						{#each group.shifts as shift (shift.id)}
							{@const pct = fillPercent(shift.approved, shift.capacity)}
							<div class="space-y-1">
								<div class="flex items-center justify-between gap-2">
									<span class="text-surface-800-200 truncate text-sm">
										{shift.label || shift.windowLabel || 'Shift'}
									</span>
									<div class="flex flex-shrink-0 items-center gap-3 text-xs">
										<span class="text-surface-950-50 font-semibold">{shift.approved} approved</span>
										{#if shift.capacity}
											<span class="text-surface-600-400">/ {shift.capacity} cap</span>
										{/if}
										{#if shift.waitlisted > 0}
											<span class="text-surface-500 text-xs">+{shift.waitlisted} waitlisted</span>
										{/if}
										{#if shift.attending > 0}
											<span class="text-success-600-400 text-xs">{shift.attending} present</span>
										{/if}
									</div>
								</div>
								{#if pct !== null}
									<div class="bg-surface-300-700/40 h-1.5 w-full overflow-hidden rounded-full">
										<div
											class={`h-full rounded-full transition-all ${fillColor(pct)}`}
											style="width: {pct}%"
										></div>
									</div>
								{:else}
									<!-- No capacity set: just show a subtle bar proportional to approved count -->
									<div class="bg-surface-300-700/40 h-1.5 w-full overflow-hidden rounded-full">
										<div class="bg-primary-500/60 h-full rounded-full" style="width: 60%"></div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>
