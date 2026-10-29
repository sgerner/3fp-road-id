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

<div class="flex flex-col gap-8">
	<div class="flex flex-col gap-2">
		<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
			Five Critical Steps
		</p>
		<h2
			class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-5xl"
		>
			Crash Response
		</h2>
	</div>

	<div class="border-surface-50 flex flex-col border-t-2">
		{#each CRASH_STEPS as step (step.number)}
			<div
				class="border-surface-800 grid gap-4 border-b py-6 sm:grid-cols-[4.5rem_minmax(0,16rem)_minmax(0,1fr)] sm:gap-6"
			>
				<span
					class="bg-tertiary-500 text-surface-950 flex h-12 w-12 items-center justify-center text-2xl leading-none font-black italic tabular-nums"
				>
					{String(step.number).padStart(2, '0')}
				</span>
				<div class="text-surface-50 flex items-center text-xl font-black uppercase">
					{step.title}
				</div>
				<ul class="text-surface-200 m-0 list-disc space-y-1.5 pl-5 text-base leading-relaxed">
					{#each step.points as point (point)}
						<li>{point}</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>

	<p class="text-surface-300 m-0 text-sm">
		For more tips & info, visit
		<a
			href="https://3feetplease.org"
			target="_blank"
			rel="noopener noreferrer"
			class="text-primary-500 font-bold underline"
		>
			3FeetPlease.org
		</a>
	</p>
</div>
