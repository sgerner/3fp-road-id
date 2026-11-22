<script>
	import { onMount, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	/** @type {{ onAsk?: (question: string) => void, initialMode?: string, instanceId?: string }} */
	let { onAsk, initialMode = 'passing', instanceId = 'encounter' } = $props();
	let mode = $state(untrack(() => initialMode));
	let oncoming = $state(true);
	let limitedRoom = $state(true);
	let doorStep = $state('check');
	let crossing = $state(true);
	let motionDuration = $state(150);
	onMount(() => {
		const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => (motionDuration = preference.matches ? 0 : 150);
		update();
		preference.addEventListener('change', update);
		return () => preference.removeEventListener('change', update);
	});

	const modes = $derived(
		[
			{ id: 'passing', label: 'Passing' },
			{ id: 'door', label: 'Opening a door' },
			{ id: 'turn', label: 'Turning' }
		]
			.filter((item) => (initialMode === 'passing' ? item.id === 'passing' : item.id !== 'passing'))
			.map((item, index) => ({ ...item, number: String(index + 1).padStart(2, '0') }))
	);
	let title = $derived(
		mode === 'passing'
			? 'Room to pass?'
			: mode === 'door'
				? 'Before the door opens'
				: 'Before the turn'
	);
	let action = $derived(
		mode === 'passing'
			? oncoming || limitedRoom
				? 'Driver: slow down and wait behind the rider.'
				: 'Driver: check the road and pass only when it is safe and lawful.'
			: mode === 'door'
				? doorStep === 'check'
					? 'Driver: look behind with the door closed.'
					: doorStep === 'wait'
						? 'Driver: keep the door closed while the rider passes.'
						: 'Driver: open only after the path is clear.'
				: crossing
					? 'Driver: check the rider’s path and wait before crossing it.'
					: 'Driver: check again, then turn only when the path is clear.'
	);
	let context = $derived(
		mode === 'passing'
			? oncoming || limitedRoom
				? 'There is not a clear opportunity to pass in this scene.'
				: 'The illustration cannot determine whether a real pass is safe.'
			: mode === 'door'
				? doorStep === 'open'
					? 'The rider has cleared the parked car.'
					: 'The car is parked; the approaching rider has the path beside it.'
				: crossing
					? 'The rider is continuing straight across the intended turn.'
					: 'The rider has cleared the crossing.'
	);
</script>

<section class="lab" aria-labelledby={`${instanceId}-title`}>
	<div class="intro">
		<div>
			<p class="eyebrow">Encounter lab <span aria-hidden="true">✳</span></p>
			<h2 id={`${instanceId}-title`}>See the decision<br /><em>in the street.</em></h2>
		</div>
		<p class="intro-copy">
			{modes.length > 1
				? 'Choose a situation, change the scene, and notice who needs to act next.'
				: 'Change the scene and notice who needs to act next.'}
		</p>
	</div>
	{#if modes.length > 1}
		<div class="mode-list" style:--mode-cols={modes.length} aria-label="Choose an encounter">
			{#each modes as item (item.id)}
				<button type="button" aria-pressed={mode === item.id} onclick={() => (mode = item.id)}
					><span>{item.number}</span>{item.label}<b aria-hidden="true">↗</b></button
				>
			{/each}
		</div>
	{/if}
	<div class="workspace">
		<div class="scene-wrap">
			<div class="scene-top">
				<span>Road scene / {mode}</span>
			</div>
			<div class="scene">
				<svg viewBox="0 0 760 440" role="img" aria-label={title + '. ' + action}>
					<defs>
						<marker
							id={`${instanceId}-lab-arrow-pink`}
							viewBox="0 0 10 10"
							refX="8"
							refY="5"
							markerWidth="8"
							markerHeight="8"
							orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#ff0180" /></marker
						>
						<marker
							id={`${instanceId}-lab-arrow-yellow`}
							viewBox="0 0 10 10"
							refX="8"
							refY="5"
							markerWidth="8"
							markerHeight="8"
							orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#ffff0a" /></marker
						>
						<g id={`${instanceId}-lab-car`}
							><rect
								x="-34"
								y="-63"
								width="68"
								height="126"
								rx="22"
								fill="#fff3df"
								stroke="#23143a"
								stroke-width="5"
							/><path d="M-25 -30 Q0 -43 25 -30 L24 -8 Q0 -17 -24 -8Z" fill="#7926cb" /><path
								d="M-23 22 Q0 29 23 22 L20 43 Q0 49 -20 43Z"
								fill="#b9a0da"
							/><rect x="-28" y="-54" width="13" height="5" rx="2" fill="#ffff0a" /><rect
								x="15"
								y="-54"
								width="13"
								height="5"
								rx="2"
								fill="#ffff0a"
							/></g
						>
						<g id={`${instanceId}-lab-bike`}>
							<rect x="-5" y="-36" width="10" height="26" rx="3" fill="#fff3df" />
							<rect x="-5" y="10" width="10" height="26" rx="3" fill="#fff3df" />
							<path
								d="M0 -20V22 M-17 -17H17"
								fill="none"
								stroke="#fff3df"
								stroke-width="6"
								stroke-linecap="round"
							/>
							<circle cy="0" r="12" fill="#ff0180" stroke="#fff3df" stroke-width="3" />
						</g>
					</defs>
					<rect width="760" height="440" fill="#ae8dcb" />
					<rect x="130" width="500" height="440" fill="#39284b" />
					<path d="M130 0V440 M630 0V440" stroke="#fff3df" stroke-width="8" />
					{#if mode === 'passing'}
						<path
							d="M380 0V440"
							stroke="#fff3df"
							stroke-width="4"
							stroke-dasharray="25 20"
							opacity=".7"
						/>
						{#if limitedRoom}<path
								d="M580 0V440"
								stroke="#ff0180"
								stroke-width="18"
								stroke-dasharray="8 7"
							/><text x="568" y="45" text-anchor="end" class="svg-label">LIMITED ROOM</text>{/if}
						{#if oncoming}<use
								href={`#${instanceId}-lab-car`}
								transform="translate(265 105) rotate(180)"
							/><text x="265" y="195" text-anchor="middle" class="svg-label">ONCOMING</text>{/if}
						<use href={`#${instanceId}-lab-bike`} transform="translate(475 140) scale(1.4)" /><path
							d="M425 95V40"
							stroke="#ffff0a"
							stroke-width="6"
							marker-end={`url(#${instanceId}-lab-arrow-yellow)`}
						/><use href={`#${instanceId}-lab-car`} transform="translate(475 320)" /><text
							x="475"
							y="410"
							text-anchor="middle"
							class="svg-label">DRIVER</text
						>
					{:else if mode === 'door'}
						<path
							d="M485 0V440"
							stroke="#fff3df"
							stroke-width="4"
							stroke-dasharray="20 14"
							opacity=".7"
						/><use href={`#${instanceId}-lab-car`} transform="translate(540 215)" /><text
							x="540"
							y="320"
							text-anchor="middle"
							class="svg-label">PARKED</text
						>
						{#if doorStep === 'open'}<path
								d="M506 180 L465 158 L460 208 L506 215"
								fill="#fff3df"
								stroke="#23143a"
								stroke-width="5"
							/><use
								href={`#${instanceId}-lab-bike`}
								transform="translate(395 60) scale(1.4)"
							/>{:else}<use
								href={`#${instanceId}-lab-bike`}
								transform="translate(395 340) scale(1.4)"
							/><path
								d="M445 290V100"
								stroke="#ffff0a"
								stroke-width="6"
								marker-end={`url(#${instanceId}-lab-arrow-yellow)`}
							/><path
								d="M500 190 Q470 200 458 230"
								fill="none"
								stroke="#ff0180"
								stroke-width="5"
								stroke-dasharray="7 5"
								marker-end={`url(#${instanceId}-lab-arrow-pink)`}
							/>{/if}
					{:else}
						<rect x="130" y="0" width="500" height="160" fill="#39284b" /><rect
							x="0"
							y="95"
							width="760"
							height="135"
							fill="#39284b"
						/><path
							d="M130 230H630 M130 95H630"
							stroke="#fff3df"
							stroke-width="4"
							stroke-dasharray="18 12"
							opacity=".65"
						/><path
							d="M480 440V230 Q480 160 650 160"
							fill="none"
							stroke="#ff0180"
							stroke-width="6"
							stroke-dasharray="12 9"
							marker-end={`url(#${instanceId}-lab-arrow-pink)`}
						/><use href={`#${instanceId}-lab-car`} transform="translate(480 340)" /><use
							href={`#${instanceId}-lab-bike`}
							transform={crossing
								? 'translate(555 255) scale(1.4)'
								: 'translate(555 65) scale(1.4)'}
						/><path
							d="M610 225V110"
							stroke="#ffff0a"
							stroke-width="6"
							marker-end={`url(#${instanceId}-lab-arrow-yellow)`}
						/><text x="660" y="195" text-anchor="middle" class="svg-label">FUTURE TURN</text><text
							x="480"
							y="425"
							text-anchor="middle"
							class="svg-label">{crossing ? 'DRIVER WAITS' : 'DRIVER CHECKS'}</text
						>
					{/if}
				</svg>
			</div>
			<p class="caption">Illustrative road scene. Check local rules and actual road layout.</p>
		</div>
		<div class="panel">
			<p class="panel-kicker">The decision <span aria-hidden="true">✳</span></p>
			<h3>{title}</h3>
			<div class="state" aria-live="polite">
				<span>What happens next</span>
				{#key action}<strong in:fade={{ duration: motionDuration }}>{action}</strong>{/key}
				{#key context}<p transition:fade={{ duration: motionDuration }}>{context}</p>{/key}
			</div>
			{#if mode === 'passing'}
				<p class="control-label">Change the scene</p>
				<div class="toggles">
					<button type="button" aria-pressed={oncoming} onclick={() => (oncoming = !oncoming)}
						><span>Oncoming traffic</span><b>{oncoming ? 'ON' : 'OFF'}</b></button
					><button
						type="button"
						aria-pressed={limitedRoom}
						onclick={() => (limitedRoom = !limitedRoom)}
						><span>Limited room</span><b>{limitedRoom ? 'ON' : 'OFF'}</b></button
					>
				</div>
			{:else if mode === 'door'}
				<p class="control-label">Step through the check</p>
				<div class="steps">
					{#each [{ id: 'check', label: 'Check' }, { id: 'wait', label: 'Wait' }, { id: 'open', label: 'Open when clear' }] as step, i (step.id)}<button
							type="button"
							aria-pressed={doorStep === step.id}
							onclick={() => (doorStep = step.id)}><span>{i + 1}</span>{step.label}</button
						>{/each}
				</div>
			{:else}
				<p class="control-label">Change the scene</p>
				<div class="toggles">
					<button type="button" aria-pressed={crossing} onclick={() => (crossing = !crossing)}
						><span>Rider in crossing</span><b>{crossing ? 'YES' : 'CLEARED'}</b></button
					>
				</div>
				<p class="legend">
					<span class="yellow-line" aria-hidden="true"></span> Rider direction
					<span class="pink-line" aria-hidden="true"></span> Intended turn
				</p>
			{/if}
			{#if onAsk}<button
					class="ask"
					type="button"
					onclick={() => onAsk(`What should a driver do in this ${mode} encounter?`)}
					>Ask about this encounter <span aria-hidden="true">↗</span></button
				>{/if}
		</div>
	</div>
</section>

<style>
	.intro h2 {
		color: var(--color-surface-50) !important;
	}
	.panel h3 {
		color: var(--ink) !important;
	}
	.lab {
		--ink: var(--color-secondary-950);
		--cream: var(--color-surface-100);
		--purple: var(--color-secondary-700);
		--pink: var(--color-tertiary-700);
		--yellow: var(--color-primary-500);
		background: var(--ink);
		color: var(--color-surface-50);
		border-top: 4px solid var(--yellow);
		padding: clamp(1.1rem, 3vw, 2.25rem);
		overflow: hidden;
	}
	.intro {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 2rem;
		margin-bottom: 1.5rem;
	}
	.eyebrow,
	.panel-kicker,
	.scene-top,
	.control-label,
	.state > span {
		font-size: 0.76rem;
		letter-spacing: 0.08em;
		font-weight: 800;
		text-transform: uppercase;
	}
	.eyebrow {
		color: var(--yellow);
		margin: 0 0 0.85rem;
	}
	.eyebrow span {
		font-size: 1.1rem;
	}
	.intro h2 {
		font-size: clamp(2.1rem, 4.5vw, 3.8rem);
		line-height: 0.94;
		letter-spacing: -0.05em;
		margin: 0;
		font-weight: 900;
	}
	.intro h2 em {
		font-style: normal;
		color: var(--yellow);
	}
	.intro-copy {
		max-width: 20rem;
		line-height: 1.5;
		color: var(--color-surface-200);
	}
	.mode-list {
		display: grid;
		grid-template-columns: repeat(var(--mode-cols, 2), minmax(0, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	button {
		font: inherit;
		cursor: pointer;
		border-radius: 0;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			color 140ms ease;
	}
	button:hover:not([aria-pressed='true']) {
		border-color: var(--yellow);
	}
	button:focus-visible {
		outline: 3px solid var(--pink);
		outline-offset: 3px;
	}
	.mode-list button {
		border: 2px solid var(--color-surface-500);
		background: var(--color-secondary-800);
		color: var(--color-surface-50);
		padding: 0.9rem 1rem;
		text-align: left;
		font-weight: 800;
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.mode-list button span {
		font-size: 0.8rem;
		opacity: 0.8;
		font-variant-numeric: tabular-nums;
	}
	.mode-list button b {
		margin-left: auto;
	}
	.mode-list button[aria-pressed='true'] {
		background: var(--yellow);
		color: var(--color-primary-contrast-500);
		border-color: var(--yellow);
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.8fr);
		gap: 0.75rem;
	}
	.scene-wrap {
		background: var(--color-secondary-800);
		border-top: 3px solid var(--color-surface-500);
		padding: 1rem;
		min-width: 0;
		overflow: hidden;
	}
	.scene-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	.scene {
		margin: 1rem auto 0;
	}
	svg {
		display: block;
		width: 100%;
	}
	.svg-label {
		fill: var(--report-soft);
		font-size: 15px;
		font-weight: 900;
		letter-spacing: 1px;
	}
	.caption {
		font-size: 0.85rem;
		line-height: 1.5;
		margin: 0.8rem 0 0;
		color: var(--color-surface-100);
	}
	.panel {
		background: var(--cream);
		color: var(--ink);
		border-top: 3px solid var(--pink);
		padding: clamp(1.2rem, 2.5vw, 1.8rem);
		display: flex;
		flex-direction: column;
	}
	.panel-kicker {
		color: var(--purple);
		display: flex;
		justify-content: space-between;
		margin: 0;
	}
	.panel-kicker span {
		font-size: 1.2rem;
	}
	.panel h3 {
		font-size: clamp(1.7rem, 3vw, 2.5rem);
		line-height: 1;
		letter-spacing: -0.04em;
		margin: 0.85rem 0 1rem;
	}
	.lab h2,
	.lab h3 {
		text-transform: none;
	}
	.state {
		background: var(--purple);
		color: var(--color-surface-50);
		padding: 1rem;
	}
	.state > span {
		color: var(--yellow);
	}
	.state strong {
		display: block;
		font-size: 1.15rem;
		line-height: 1.25;
		margin: 0.55rem 0;
	}
	.state p {
		font-size: 0.95rem;
		line-height: 1.5;
		margin: 0;
		color: var(--color-surface-100);
	}
	.control-label {
		margin: 1.35rem 0 0.6rem;
	}
	.toggles,
	.steps {
		display: grid;
		gap: 0.45rem;
	}
	.toggles button,
	.steps button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		background: var(--report-paper);
		color: var(--ink);
		border: 2px solid var(--report-border);
		padding: 0.7rem 0.8rem;
		text-align: left;
		font-weight: 750;
	}
	.toggles button b {
		font-size: 0.75rem;
		background: var(--report-soft);
		padding: 0.25rem 0.5rem;
	}
	.toggles button[aria-pressed='true'] b {
		background: var(--pink);
		color: var(--color-surface-50);
	}
	.steps button {
		justify-content: flex-start;
	}
	.steps button span {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		background: var(--report-soft);
		font-size: 0.8rem;
		font-weight: 800;
	}
	.steps button[aria-pressed='true'] {
		background: var(--ink);
		color: var(--color-surface-50);
		border-color: var(--ink);
	}
	.steps button[aria-pressed='true'] span {
		background: var(--yellow);
		color: var(--color-primary-contrast-500);
	}
	.legend {
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
	}
	.yellow-line,
	.pink-line {
		width: 22px;
		border-top: 4px solid var(--color-primary-500);
	}
	.pink-line {
		border-color: var(--pink);
		border-top-style: dashed;
		margin-left: 0.5rem;
	}
	.ask {
		margin-top: auto;
		padding: 1rem 0 0;
		background: none;
		border: 0;
		color: var(--purple);
		font-weight: 900;
		text-align: left;
	}
	.ask span {
		margin-left: 0.5rem;
	}
	@media (max-width: 760px) {
		.intro {
			display: block;
		}
		.intro-copy {
			margin-top: 0.75rem;
			margin-bottom: 0;
		}
		.workspace {
			grid-template-columns: 1fr;
		}
		.mode-list button {
			padding: 0.75rem;
			font-size: 0.82rem;
		}
		.mode-list button span {
			display: none;
		}
		.scene-top {
			flex-wrap: wrap;
			gap: 0.5rem;
			font-size: 0.68rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button,
		.scene {
			transition: none;
		}
	}
</style>
