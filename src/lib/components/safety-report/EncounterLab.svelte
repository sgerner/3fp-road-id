<script>
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	/** @type {{ onAsk?: (question: string) => void }} */
	let { onAsk } = $props();
	let mode = $state('passing');
	let oncoming = $state(true);
	let limitedRoom = $state(true);
	let view = $state('overhead');
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

	const modes = [
		{ id: 'passing', number: '01', label: 'Passing' },
		{ id: 'door', number: '02', label: 'Opening a door' },
		{ id: 'turn', number: '03', label: 'Turning' }
	];
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

<section class="lab" aria-labelledby="encounter-title">
	<div class="intro">
		<div>
			<p class="eyebrow">THE ENCOUNTER LAB <span>✳</span></p>
			<h2 id="encounter-title">See the decision<br /><em>in the street.</em></h2>
		</div>
		<p class="intro-copy">
			Choose a situation, change the scene, and notice who needs to act next.
		</p>
	</div>
	<div class="mode-list" aria-label="Choose an encounter">
		{#each modes as item}
			<button type="button" aria-pressed={mode === item.id} onclick={() => (mode = item.id)}
				><span>{item.number}</span>{item.label}<b aria-hidden="true">↗</b></button
			>
		{/each}
	</div>
	<div class="workspace">
		<div class="scene-wrap">
			<div class="scene-top">
				<span>ROAD SCENE / {mode.toUpperCase()}</span>
				<div class="views" aria-label="Scene view">
					<button
						type="button"
						aria-pressed={view === 'overhead'}
						onclick={() => (view = 'overhead')}>Overhead</button
					><button type="button" aria-pressed={view === 'angled'} onclick={() => (view = 'angled')}
						>Angled</button
					>
				</div>
			</div>
			<div class:angled={view === 'angled'} class="scene">
				<svg viewBox="0 0 760 440" role="img" aria-label={title + '. ' + action}>
					<defs>
						<marker
							id="lab-arrow-pink"
							viewBox="0 0 10 10"
							refX="8"
							refY="5"
							markerWidth="8"
							markerHeight="8"
							orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#ff0180" /></marker
						>
						<marker
							id="lab-arrow-yellow"
							viewBox="0 0 10 10"
							refX="8"
							refY="5"
							markerWidth="8"
							markerHeight="8"
							orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#ffff0a" /></marker
						>
						<g id="lab-car"
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
						<g id="lab-bike"
							><circle
								cx="0"
								cy="-27"
								r="13"
								fill="none"
								stroke="#23143a"
								stroke-width="5"
							/><circle cx="0" cy="27" r="13" fill="none" stroke="#23143a" stroke-width="5" /><path
								d="M0 -27 L-10 0 L0 27 L10 2 Z M-13 -18 H13"
								fill="none"
								stroke="#23143a"
								stroke-width="4"
								stroke-linecap="round"
							/><circle cy="-3" r="12" fill="#ff0180" stroke="#23143a" stroke-width="4" /><circle
								cy="-18"
								r="8"
								fill="#fff3df"
								stroke="#23143a"
								stroke-width="3"
							/></g
						>
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
						{#if oncoming}<use href="#lab-car" transform="translate(265 105) rotate(180)" /><text
								x="265"
								y="195"
								text-anchor="middle"
								class="svg-label">ONCOMING</text
							>{/if}
						<use href="#lab-bike" transform="translate(475 140)" /><path
							d="M475 95V40"
							stroke="#ffff0a"
							stroke-width="6"
							marker-end="url(#lab-arrow-yellow)"
						/><use href="#lab-car" transform="translate(475 320)" /><text
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
						/><use href="#lab-car" transform="translate(540 215)" /><text
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
							/><use href="#lab-bike" transform="translate(395 60)" />{:else}<use
								href="#lab-bike"
								transform="translate(395 340)"
							/><path
								d="M395 290V100"
								stroke="#ffff0a"
								stroke-width="6"
								marker-end="url(#lab-arrow-yellow)"
							/><path
								d="M500 190 Q470 200 458 230"
								fill="none"
								stroke="#ff0180"
								stroke-width="5"
								stroke-dasharray="7 5"
								marker-end="url(#lab-arrow-pink)"
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
							marker-end="url(#lab-arrow-pink)"
						/><use href="#lab-car" transform="translate(480 340)" /><use
							href="#lab-bike"
							transform={crossing ? 'translate(555 255)' : 'translate(555 65)'}
						/><path
							d="M555 225V110"
							stroke="#ffff0a"
							stroke-width="6"
							marker-end="url(#lab-arrow-yellow)"
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
			<p class="panel-kicker">THE DECISION <span>✳</span></p>
			<h3>{title}</h3>
			<div class="state" aria-live="polite">
				<span>WHAT HAPPENS NEXT</span>
				{#key action}<strong in:fade={{ duration: motionDuration }}>{action}</strong>{/key}
				{#key context}<p transition:fade={{ duration: motionDuration }}>{context}</p>{/key}
			</div>
			{#if mode === 'passing'}
				<p class="control-label">CHANGE THE SCENE</p>
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
				<p class="control-label">STEP THROUGH THE CHECK</p>
				<div class="steps">
					{#each [{ id: 'check', label: 'Check' }, { id: 'wait', label: 'Wait' }, { id: 'open', label: 'Open when clear' }] as step, i}<button
							type="button"
							aria-pressed={doorStep === step.id}
							onclick={() => (doorStep = step.id)}><span>{i + 1}</span>{step.label}</button
						>{/each}
				</div>
			{:else}
				<p class="control-label">CHANGE THE SCENE</p>
				<div class="toggles">
					<button type="button" aria-pressed={crossing} onclick={() => (crossing = !crossing)}
						><span>Rider in crossing</span><b>{crossing ? 'YES' : 'CLEARED'}</b></button
					>
				</div>
				<p class="legend">
					<span class="yellow-line"></span> Rider direction <span class="pink-line"></span> Intended turn
				</p>
			{/if}
			{#if onAsk}<button
					class="ask"
					type="button"
					onclick={() => onAsk(`What should a driver do in this ${mode} encounter?`)}
					>Ask about this encounter <span>↗</span></button
				>{/if}
		</div>
	</div>
</section>

<style>
	.intro h2 {
		color: var(--cream) !important;
	}
	.panel h3 {
		color: var(--ink) !important;
	}
	.lab {
		--ink: #23143a;
		--cream: #fff3df;
		--purple: #7926cb;
		--pink: #ff0180;
		--yellow: #ffff0a;
		background: var(--ink);
		color: var(--cream);
		border-radius: 28px;
		padding: clamp(1.1rem, 3vw, 2.5rem);
		overflow: hidden;
	}
	.intro {
		display: flex;
		justify-content: space-between;
		align-items: end;
		gap: 2rem;
		margin-bottom: 1.8rem;
	}
	.eyebrow,
	.panel-kicker,
	.scene-top,
	.control-label,
	.state > span {
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		font-weight: 900;
	}
	.eyebrow {
		color: var(--yellow);
		margin: 0 0 1rem;
	}
	.eyebrow span {
		font-size: 1.2rem;
	}
	.intro h2 {
		font-size: clamp(2.4rem, 5vw, 4.6rem);
		line-height: 0.94;
		letter-spacing: -0.055em;
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
		color: #e4d4f1;
	}
	.mode-list {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		margin-bottom: 0.7rem;
	}
	button {
		font: inherit;
		cursor: pointer;
	}
	button {
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
		border: 1px solid #806a96;
		background: #3a294e;
		color: var(--cream);
		padding: 1rem;
		text-align: left;
		border-radius: 12px;
		font-weight: 800;
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.mode-list button span {
		font-size: 0.7rem;
		opacity: 0.7;
	}
	.mode-list button b {
		margin-left: auto;
	}
	.mode-list button[aria-pressed='true'] {
		background: var(--yellow);
		color: var(--ink);
		border-color: var(--yellow);
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.8fr);
		gap: 0.7rem;
	}
	.scene-wrap {
		background: #61407e;
		border-radius: 16px;
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
	.views {
		flex-shrink: 0;
		display: flex;
		gap: 0.25rem;
	}
	.views button {
		white-space: nowrap;
		border: 0;
		border-radius: 6px;
		padding: 0.45rem 0.6rem;
		color: var(--cream);
		background: transparent;
		font-size: 0.7rem;
	}
	.views button[aria-pressed='true'] {
		background: var(--cream);
		color: var(--ink);
	}
	.scene {
		margin: 1rem auto 0;
		transition: transform 0.25s;
		transform-origin: center;
	}
	.scene.angled {
		transform: perspective(900px) rotateX(12deg) rotateZ(-3deg) scale(0.93);
	}
	@media (prefers-reduced-motion: reduce) {
		button,
		.scene {
			transition: none;
		}
	}
	svg {
		display: block;
		width: 100%;
		border-radius: 10px;
	}
	.svg-label {
		fill: #fff3df;
		font-size: 15px;
		font-weight: 900;
		letter-spacing: 1px;
	}
	.caption {
		font-size: 0.75rem;
		line-height: 1.4;
		margin: 0.8rem 0 0;
		color: #f0dff5;
	}
	.panel {
		background: var(--cream);
		color: var(--ink);
		border-radius: 16px;
		padding: clamp(1.2rem, 2.5vw, 2rem);
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
		font-size: 1.4rem;
	}
	.panel h3 {
		font-size: clamp(1.8rem, 3vw, 2.8rem);
		line-height: 1;
		letter-spacing: -0.05em;
		margin: 1rem 0;
	}
	.state {
		background: var(--purple);
		color: white;
		border-radius: 12px;
		padding: 1rem;
	}
	.state > span {
		color: var(--yellow);
	}
	.state strong {
		display: block;
		font-size: 1.2rem;
		line-height: 1.2;
		margin: 0.6rem 0;
	}
	.state p {
		font-size: 0.85rem;
		line-height: 1.4;
		margin: 0;
		color: #f2e3ff;
	}
	.control-label {
		margin: 1.5rem 0 0.65rem;
	}
	.toggles,
	.steps {
		display: grid;
		gap: 0.4rem;
	}
	.toggles button,
	.steps button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		background: transparent;
		color: var(--ink);
		border: 1px solid #b8a8c5;
		border-radius: 9px;
		padding: 0.75rem;
		text-align: left;
		font-weight: 750;
	}
	.toggles button b {
		font-size: 0.65rem;
		background: #ded3e4;
		border-radius: 5px;
		padding: 0.3rem 0.45rem;
	}
	.toggles button[aria-pressed='true'] b {
		background: var(--pink);
		color: white;
	}
	.steps button {
		justify-content: flex-start;
	}
	.steps button span {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background: #ded3e4;
	}
	.steps button[aria-pressed='true'] {
		background: var(--ink);
		color: white;
		border-color: var(--ink);
	}
	.steps button[aria-pressed='true'] span {
		background: var(--yellow);
		color: var(--ink);
	}
	.legend {
		font-size: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.yellow-line,
	.pink-line {
		width: 22px;
		border-top: 4px solid #aa8e00;
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
	button:focus-visible {
		outline: 3px solid var(--pink);
		outline-offset: 3px;
	}
	@media (max-width: 760px) {
		.intro {
			display: block;
		}
		.intro-copy {
			margin-bottom: 0;
		}
		.workspace {
			grid-template-columns: 1fr;
		}
		.mode-list button {
			padding: 0.7rem;
			font-size: 0.8rem;
		}
		.mode-list button span {
			display: none;
		}
		.scene-top {
			flex-wrap: wrap;
			gap: 0.5rem;
			font-size: 0.6rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.scene {
			transition: none;
		}
	}
</style>
