<script>
	/**
	 * Reusable component for the "A.L.E.R.T." bicycle safety system.
	 */

	const ALERT_DATA = [
		{
			letter: 'A',
			label: 'AWARE',
			points: [
				'Watch for turning vehicles',
				'Ride outside of the door zone',
				'Stay alert for debris, potholes, and road hazards'
			]
		},
		{
			letter: 'L',
			label: 'LAWFUL',
			points: [
				'Obey traffic signals and stop signs',
				'Ride with traffic, not against it',
				'Use proper lane position'
			]
		},
		{
			letter: 'E',
			label: 'EYE-CATCHING',
			points: [
				'Wear bright visible clothing (e.g., 3FP jersey)',
				'Ride with reason, avoiding sidewalks',
				'Use bright lights: white front & red rear'
			]
		},
		{
			letter: 'R',
			label: 'RIDE READY',
			points: [
				'Perform an ABC Quick Check',
				'Plan your route',
				'Wear a helmet, gloves, & appropriate clothing'
			]
		},
		{
			letter: 'T',
			label: 'TELEGRAPH',
			points: [
				'Make your intentions clear to drivers',
				'Scan the road & use hand signals',
				'Leave enough space between parked cars'
			]
		}
	];
</script>

<div class="flex flex-col gap-8">
	<div class="flex flex-col gap-2">
		<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
			Everyday Habits
		</p>
		<h2
			class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
		>
			Stay A.L.E.R.T.
		</h2>
		<h6 class="text-surface-300! m-0 text-sm font-bold tracking-wider uppercase">
			Tips for cyclist safety
		</h6>
	</div>

	<div class="border-surface-50 flex flex-col border-t-2">
		{#each ALERT_DATA as section (section.letter)}
			<div
				class="border-surface-800 grid gap-4 border-b py-6 sm:grid-cols-[4.5rem_minmax(0,14rem)_minmax(0,1fr)] sm:gap-6"
			>
				<span
					class="bg-primary-500 text-surface-950 flex h-12 w-12 items-center justify-center text-3xl leading-none font-black italic"
				>
					{section.letter}
				</span>
				<div class="text-surface-50 flex items-center text-2xl font-black uppercase italic">
					{section.label}
				</div>
				<ul class="text-surface-200 m-0 list-disc space-y-1.5 pl-5 text-base leading-relaxed">
					{#each section.points as point (point)}
						<li>{point}</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</div>
