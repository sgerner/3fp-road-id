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

<div class="bg-surface-950 text-surface-50 flex flex-col gap-5 sm:gap-8">
	<div class="flex flex-col gap-2">
		<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
			Everyday Habits
		</p>
		<h2
			class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
		>
			Stay A.L.E.R.T.
		</h2>
		<p class="text-surface-300! m-0 text-sm font-bold tracking-wider uppercase">
			Tips for cyclist safety
		</p>
	</div>

	<div class="border-surface-50 flex flex-col border-t-2">
		{#each ALERT_DATA as section (section.letter)}
			<div
				class="border-surface-800 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-b py-4 sm:grid-cols-[4.5rem_minmax(0,14rem)_minmax(0,1fr)] sm:gap-6 sm:py-6"
			>
				<span
					class="bg-primary-500 text-surface-950 flex h-9 w-9 items-center justify-center text-3xl leading-none font-black italic sm:h-12 sm:w-12"
				>
					{section.letter}
				</span>
				<div class="text-surface-50 flex items-center text-2xl font-black uppercase italic">
					{section.label}
				</div>
				<ul
					class="text-surface-200 col-span-2 m-0 list-disc space-y-1 pl-5 text-base leading-snug sm:col-span-1 sm:space-y-1.5 sm:leading-relaxed"
				>
					{#each section.points as point (point)}
						<li>{point}</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</div>
