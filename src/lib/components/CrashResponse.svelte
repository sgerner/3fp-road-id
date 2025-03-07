<script>
	/**
	 * Reusable component for "Crash Response" advice.
	 * Import into any Svelte page to display these tips.
	 */

	const CRASH_STEPS = [
		{
			number: 1,
			title: 'Stay Safe Assess Injury',
			points: [
				'Move out of traffic if possible',
				'Check yourself and others for injuries',
				'Call for medical help if needed'
			]
		},
		{
			number: 2,
			title: 'Call Police & Report',
			points: [
				'Always report the crash, even if minor',
				'Provide facts, but do not admit any fault',
				'Ask how to obtain a copy of the report'
			]
		},
		{
			number: 3,
			title: 'Gather Information',
			points: [
				'Driver’s name, contact, license & insurance',
				'Witness names & phone numbers',
				'Photos of scene, vehicle/bike & injuries'
			]
		},
		{
			number: 4,
			title: 'Seek Medical Attention',
			points: [
				'Injuries can appear hours or days later',
				'Keep records of all medical visits',
				'Save damaged gear and clothing'
			]
		},
		{
			number: 5,
			title: 'Protect Your Rights',
			points: [
				'Avoid quick settlements or signing anything',
				'Contact a lawyer if unsure (e.g., bikelaw.com)',
				'Report unsafe road conditions to local authorities'
			]
		}
	];
</script>

<div class="flex flex-col gap-4">
	<h2 class="mb-2 text-2xl font-bold uppercase">Crash Response</h2>
	{#each CRASH_STEPS as step}
		<div class="mb-4">
			<div class="flex items-center text-xl font-bold">
				<span
					class="bg-primary-500 mr-2 flex h-8 w-8 items-center justify-center rounded-full font-extrabold text-black"
				>
					{step.number}
				</span>
				{step.title}
			</div>
			<ul class="ml-10 list-inside list-disc text-sm">
				{#each step.points as point}
					<li>{point}</li>
				{/each}
			</ul>
		</div>
	{/each}

	<p class="mt-4 text-sm">
		For more tips & info, visit
		<a href="https://3feetplease.org" target="_blank" rel="noopener noreferrer" class="anchor">
			3FeetPlease.org
		</a>
	</p>
</div>
