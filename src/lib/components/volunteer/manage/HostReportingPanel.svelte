<script>
	import IconFileDown from '@lucide/svelte/icons/file-down';
	import IconCheckSquare from '@lucide/svelte/icons/check-square';
	import IconClock from '@lucide/svelte/icons/clock';
	import IconAlertTriangle from '@lucide/svelte/icons/alert-triangle';

	export let onExportRoster = () => {};
	export let onAttendanceReport = () => {};
	export let onNoShowReport = () => {};
	export let onHoursSummary = () => {};
</script>

<section
	class="border-surface-700 bg-surface-900/70 rounded-2xl border p-6 shadow-xl shadow-black/30"
>
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 class="text-xl font-semibold text-white">Host Reporting</h2>
			<p class="text-surface-300 text-sm">
				Export rosters, review check-ins, and summarise volunteer hours.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button class="chip preset-tonal-surface-500" onclick={onExportRoster}>
				<IconFileDown class="mr-2 h-4 w-4" />
				Export roster
			</button>
			<button class="chip preset-tonal-primary-500" onclick={onAttendanceReport}>
				<IconCheckSquare class="mr-2 h-4 w-4" />
				Attendance check-in
			</button>
			<button class="chip preset-tonal-error-500" onclick={onNoShowReport}>
				<IconAlertTriangle class="mr-2 h-4 w-4" />
				Review no-shows
			</button>
			<button class="chip preset-tonal-surface-500" onclick={onHoursSummary}>
				<IconClock class="mr-2 h-4 w-4" />
				Hours summary
			</button>
		</div>
	</div>

	<div class="text-surface-200 mt-6 grid gap-3 text-sm md:grid-cols-2">
		<article class="bg-surface-950/40 border-surface-700/60 rounded-xl border p-4">
			<p class="font-semibold text-white">Attendance check-in</p>
			<p class="text-surface-400 mt-2">Use tablet mode at HQ to mark arrivals in real time.</p>
		</article>
		<article class="bg-surface-950/40 border-surface-700/60 rounded-xl border p-4">
			<p class="font-semibold text-white">No-show tracking</p>
			<p class="text-surface-400 mt-2">
				Flag unconfirmed volunteers so replacements can be contacted.
			</p>
		</article>
	</div>
</section>
