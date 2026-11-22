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
	/** @type {any} */
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

<section class="border-surface-300-700 bg-surface-100-900 border-primary-500 border-t-4 p-6">
	<!-- Overall stats strip -->
	<div class="mb-6 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
		<div class="border-surface-300-700 border-t-2 p-4 text-center">
			<div class="text-surface-950-50 text-3xl font-black tabular-nums">{counts.total ?? 0}</div>
			<div class="text-surface-600-400 mt-0.5 text-xs tracking-wide uppercase">Total</div>
		</div>
		<div class="border-surface-300-700 border-t-2 p-4 text-center">
			<div class="text-success-400 text-3xl font-black tabular-nums">{counts.approved ?? 0}</div>
			<div class="text-surface-600-400 mt-0.5 text-xs tracking-wide uppercase">Approved</div>
		</div>
		<div class="border-surface-300-700 border-t-2 p-4 text-center">
			<div class="text-warning-400 text-3xl font-black tabular-nums">{counts.pending ?? 0}</div>
			<div class="text-surface-600-400 mt-0.5 text-xs tracking-wide uppercase">Pending</div>
		</div>
		<div class="border-surface-300-700 border-t-2 p-4 text-center">
			<div class="text-surface-950-50 text-3xl font-black tabular-nums">
				{counts.attending ?? 0}
			</div>
			<div class="text-surface-600-400 mt-0.5 text-xs tracking-wide uppercase">Checked In</div>
		</div>
	</div>

	{#if shiftGroups.length}
		<div class="space-y-5">
			<header>
				<h3 class="text-surface-950-50! !text-left text-base font-black uppercase">
					Shift Coverage
				</h3>
				<p class="text-surface-600-400 text-xs">Approved volunteers vs. capacity per shift</p>
			</header>
			<div class="space-y-4">
				{#each shiftGroups as group (group.id)}
					<div class="space-y-2">
						<h4
							class="text-surface-700-300! !text-left text-xs font-black tracking-wider uppercase"
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
									<div class="bg-surface-300-700 h-1.5 w-full overflow-hidden rounded-none!">
										<div
											class={`h-full rounded-none! transition-all ${fillColor(pct)}`}
											style="width: {pct}%"
										></div>
									</div>
								{:else}
									<!-- No capacity set: just show a subtle bar proportional to approved count -->
									<div class="bg-surface-300-700 h-1.5 w-full overflow-hidden rounded-none!">
										<div class="bg-primary-500 h-full rounded-none!" style="width: 60%"></div>
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
