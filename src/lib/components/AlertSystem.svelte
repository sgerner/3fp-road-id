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

<div class="">
	<h2 class="mb-2 text-2xl font-bold">Stay A.L.E.R.T.</h2>
	<h6 class="h6">Tips for cyclist safety</h6>
	{#each ALERT_DATA as section}
		<div class="mb-4">
			<div class="flex items-center text-xl font-bold">
				<span
					class="bg-primary-500 mr-2 flex h-8 w-8 items-center justify-center rounded-full font-extrabold text-black"
				>
					{section.letter}
				</span>
				{section.label}
			</div>
			<ul class="mt-2 ml-10 list-inside list-disc text-sm">
				{#each section.points as point}
					<li>{point}</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
