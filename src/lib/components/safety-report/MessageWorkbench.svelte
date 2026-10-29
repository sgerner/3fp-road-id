<script>
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	let { report, onAsk = undefined } = $props();
	const storageKey = '3fp-safety-message-brief-v1';
	const templates = {
		passing: {
			label: 'Passing',
			headline: 'No safe room? Slow down. Wait behind.',
			audience: 'Drivers',
			example: 'PASSING',
			fallback: 'No safe room to pass? Slow down and wait behind.',
			images: ['01-give-people-space-poster-v9-page-01', 'fig-3', 'print-1'],
			reference: 'Section 4: Passing and lane position'
		},
		doors: {
			label: 'Opening a door',
			headline: 'Before the door opens, look back.',
			audience: 'Drivers and passengers',
			example: 'DOORS',
			fallback: 'Keep the door closed. Look beside and behind. Open only when clear.',
			images: ['fig-4', 'print-2', '3fp-poster-look-before-you-open-letter-native-v9-page-01'],
			reference: 'Section 5: Doors, junctions and large vehicles'
		},
		turn: {
			label: 'Turning',
			headline: 'Check. Wait. Then turn.',
			audience: 'Drivers',
			example: 'TURNING',
			fallback: 'Before turning across a rider’s path, check and wait until the rider has cleared.',
			images: ['fig-5', 'print-3', '3fp-poster-check-before-you-turn-letter-native-v9-page-01'],
			reference: 'Section 5: Doors, junctions and large vehicles'
		},
		practice: {
			label: 'Riding practice',
			headline: 'Practice together. Build your skills.',
			audience: 'Riders and families',
			fallback: 'Practice with a trained instructor. Try the skill and get feedback.',
			images: ['fig-11', 'print-7', '04-practice-before-traffic-poster-v9-page-01'],
			reference: 'Section 8: Rider education and supervised practice'
		},
		lights: {
			label: 'Lights',
			headline: 'Before the ride home, check your lights.',
			audience: 'Riders',
			fallback:
				'Check that your front and rear lights work. Ask for help choosing and fitting lights if you need it.',
			images: ['fig-14', 'print-8', '05-light-the-ride-poster-v9-page-01'],
			reference: 'Section 9: Lights, visibility and helmets'
		}
	};
	let encounter = $state('passing');
	let audience = $state('Drivers');
	let headline = $state(templates.passing.headline);
	let action = $state(templates.passing.fallback);
	let help = $state('');
	let delivery = $state('');
	let website = $state('3fp.org');
	let imageId = $state('01-give-people-space-poster-v9-page-01');
	let checks = $state([false, false, false, false]);
	let status = $state('');
	let motionDuration = $state(150);
	const checklist = [
		'Check the local rules and road scene.',
		'Confirm any help is real and available.',
		'Ask a reader to explain the action.',
		'Print a sample at its actual size.'
	];
	let pictures = $derived([...report.campaignGallery, ...report.figures]);
	let choices = $derived(
		templates[encounter].images
			.map((id) => pictures.find((picture) => picture.id === id))
			.filter(Boolean)
	);
	let selectedImage = $derived(pictures.find((picture) => picture.id === imageId));
	let questions = $derived(report.quickGuide.questions);
	function defaultAction(key) {
		const template = templates[key];
		return (
			report.quickGuide.examples.find((example) => example.label === template.example)?.text ||
			template.fallback
		);
	}
	function chooseEncounter(key) {
		encounter = key;
		audience = templates[key].audience;
		action = defaultAction(key);
		headline = templates[key].headline;
		imageId = templates[key].images[0];
		checks = [false, false, false, false];
		status = 'Template changed. Your help, delivery and website details were kept.';
	}
	function reset() {
		help = '';
		delivery = '';
		website = '3fp.org';
		chooseEncounter('passing');
		status = 'Brief reset to the passing template.';
	}
	function brief() {
		return `Campaign brief — draft\n\nEncounter: ${templates[encounter].label}\nAudience: ${audience}\nHeadline: ${headline}\nAction: ${action}\nPractical help: ${help}\nDelivery: ${delivery}\nWebsite: ${website}\nImage: ${selectedImage?.title || 'None'}\n\nReport reference: ${templates[encounter].reference}; Quick guide: Make a safety message people can use.\n\nPretest questions:\n${questions.map((question) => `- ${question}`).join('\n')}\n\nBefore use:\n${checklist.map((item, index) => `- [${checks[index] ? 'x' : ' '}] ${item}`).join('\n')}`;
	}
	function download() {
		const url = URL.createObjectURL(new Blob([brief()], { type: 'text/plain;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = 'cycling-message-brief.txt';
		link.click();
		URL.revokeObjectURL(url);
		status = 'Brief downloaded.';
	}
	function save() {
		try {
			localStorage.setItem(
				storageKey,
				JSON.stringify({
					encounter,
					audience,
					headline,
					action,
					help,
					delivery,
					website,
					imageId,
					checks
				})
			);
			status = 'Saved on this device.';
		} catch {
			status = 'Could not save on this device.';
		}
	}
	onMount(() => {
		const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => (motionDuration = preference.matches ? 0 : 150);
		updateMotion();
		preference.addEventListener('change', updateMotion);
		const cleanupMotion = () => preference.removeEventListener('change', updateMotion);
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw || raw.length > 5000) return cleanupMotion;
			const saved = JSON.parse(raw);
			if (!saved || !Object.hasOwn(templates, saved.encounter)) return cleanupMotion;
			const bounded = (value, max) => typeof value === 'string' && value.length <= max;
			if (
				!bounded(saved.audience, 100) ||
				!bounded(saved.headline, 160) ||
				!bounded(saved.action, 400) ||
				!bounded(saved.help, 400) ||
				!bounded(saved.delivery, 400) ||
				!bounded(saved.website, 100) ||
				!templates[saved.encounter].images.includes(saved.imageId) ||
				!Array.isArray(saved.checks) ||
				saved.checks.length !== 4 ||
				!saved.checks.every((value) => typeof value === 'boolean')
			)
				return cleanupMotion;
			encounter = saved.encounter;
			audience = saved.audience;
			headline = saved.headline;
			action = saved.action;
			help = saved.help;
			delivery = saved.delivery;
			website = saved.website;
			imageId = saved.imageId;
			checks = saved.checks;
			status = 'Saved brief restored from this device.';
		} catch {
			status = 'Could not restore the saved brief.';
		}
		return cleanupMotion;
	});
</script>

<section class="workbench" aria-labelledby="workbench-title">
	<div class="heading">
		<div>
			<p class="eyebrow">MESSAGE WORKBENCH <span>✳</span></p>
			<h2 id="workbench-title">Make the action<br /><em>impossible to miss.</em></h2>
		</div>
		<p>Build a draft for one audience and one moment. Then put it in front of real readers.</p>
	</div>
	<div class="layout">
		<div class="editor">
			<div class="editor-head">
				<span>01 / YOUR BRIEF</span><button type="button" class="text-button" onclick={reset}
					>Reset brief ↺</button
				>
			</div>
			<label for="brief-encounter">Choose a situation</label><select
				id="brief-encounter"
				value={encounter}
				onchange={(event) => chooseEncounter(event.currentTarget.value)}
				>{#each Object.entries(templates) as [key, template]}<option value={key}
						>{template.label}</option
					>{/each}</select
			>
			<label for="brief-audience">Who is this for?</label><input
				id="brief-audience"
				maxlength="100"
				bind:value={audience}
			/>
			<label for="brief-headline">Poster headline</label><textarea
				id="brief-headline"
				maxlength="160"
				rows="3"
				bind:value={headline}></textarea>
			<label for="brief-action">What action should the reader take?</label><textarea
				id="brief-action"
				maxlength="400"
				rows="3"
				bind:value={action}></textarea>
			<label for="brief-help">Practical help available <span>optional</span></label><textarea
				id="brief-help"
				maxlength="400"
				rows="2"
				bind:value={help}
				placeholder="Add confirmed help and how to find it"></textarea>
			<label for="brief-delivery">Where will people see this? <span>optional</span></label><textarea
				id="brief-delivery"
				maxlength="400"
				rows="2"
				bind:value={delivery}
				placeholder="For example, a driving school or community space"></textarea>
			<label for="brief-website">Website or short link</label><input
				id="brief-website"
				maxlength="100"
				bind:value={website}
			/>
			<fieldset>
				<legend>Choose an example image</legend>
				<div class="image-choices">
					{#each choices as picture}<button
							type="button"
							aria-pressed={imageId === picture.id}
							onclick={() => (imageId = picture.id)}
							><img src={picture.src} alt="" /><span>{picture.title}</span></button
						>{/each}
				</div>
			</fieldset>
		</div>
		<div class="preview-column">
			<div class="preview-head"><span>02 / POSTER PREVIEW</span><span>DRAFT</span></div>
			<div class="poster">
				<div class="poster-top"><span>3 FEET PLEASE</span><span>✳</span></div>
				<p class="poster-kicker">{templates[encounter].label} / {audience || 'Your audience'}</p>
				{#key encounter}<h3 in:fade={{ duration: motionDuration }}>
						{headline || 'Your headline here'}
					</h3>{/key}
				{#if selectedImage}{#key imageId}<div
							class="poster-image"
							in:fade={{ duration: motionDuration }}
						>
							<img src={selectedImage.src} alt={selectedImage.alt || selectedImage.title} />
						</div>{/key}{/if}
				<p class="poster-action">{action}</p>
				{#if help}<p class="poster-help">{help}</p>{/if}
				<div class="poster-footer">
					<strong>LET’S MAKE ROOM<br />FOR EACH OTHER.</strong><span>{website}</span>
				</div>
			</div>
			<p class="preview-note">A draft to adapt and test with your audience.</p>
		</div>
	</div>
	<div class="finish">
		<div>
			<p class="eyebrow">BEFORE YOU SHARE</p>
			<h3>Check it in the real world.</h3>
			<div class="checklist">
				{#each checklist as item, i}<label
						><input type="checkbox" bind:checked={checks[i]} /><span>{item}</span></label
					>{/each}
			</div>
		</div>
		<div class="actions">
			<button type="button" class="primary" onclick={download}>Download brief <span>↓</span></button
			><button type="button" onclick={save}>Save on this device <span>↗</span></button
			>{#if onAsk}<button
					type="button"
					onclick={() =>
						onAsk(
							`Please give feedback on this draft campaign brief, including clarity, action and questions to pretest:\n${brief()}`.slice(
								0,
								1000
							)
						)}>Ask for feedback <span>↗</span></button
				>{/if}
			<p>This brief stays on this device until you ask the assistant.</p>
			<p class="status" aria-live="polite">
				{#key status}<span in:fade={{ duration: motionDuration }}>{status}</span>{/key}
			</p>
		</div>
	</div>
</section>

<style>
	.heading h2,
	.finish h3 {
		color: var(--cream) !important;
	}
	.poster h3 {
		color: var(--ink) !important;
	}
	.workbench {
		--ink: #23143a;
		--cream: #fff3df;
		--purple: #7926cb;
		--pink: #ff0180;
		--lemon: #ffff0a;
		background: var(--purple);
		color: white;
		padding: clamp(1.2rem, 3vw, 2.5rem);
		border-radius: 28px;
	}
	.heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: 2rem;
	}
	.heading > p {
		max-width: 21rem;
		line-height: 1.5;
	}
	.eyebrow,
	.editor-head,
	.preview-head,
	.poster-kicker {
		font-size: 0.7rem;
		letter-spacing: 0.13em;
		font-weight: 900;
	}
	.eyebrow {
		color: var(--lemon);
		margin: 0 0 1rem;
	}
	.heading h2 {
		font-size: clamp(2.3rem, 5vw, 4.5rem);
		line-height: 0.95;
		letter-spacing: -0.055em;
		margin: 0;
	}
	.heading h2 em {
		font-style: normal;
		color: var(--lemon);
	}
	.layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		align-items: start;
	}
	.editor,
	.preview-column {
		border-radius: 16px;
		padding: clamp(1rem, 2.4vw, 2rem);
	}
	.editor {
		background: var(--cream);
		color: var(--ink);
	}
	.editor-head,
	.preview-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.4rem;
	}
	.editor-head {
		color: var(--purple);
	}
	button,
	input,
	textarea,
	select {
		font: inherit;
	}
	button {
		cursor: pointer;
	}
	button {
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			color 140ms ease;
	}
	button:hover {
		border-color: var(--lemon);
	}
	.text-button {
		background: none;
		border: 0;
		color: var(--purple);
		font-weight: 800;
		text-decoration: underline;
	}
	.editor label,
	.editor legend {
		display: block;
		font-size: 0.84rem;
		font-weight: 850;
		margin: 1rem 0 0.4rem;
	}
	.editor label span {
		font-weight: 400;
		color: #6f607b;
	}
	.editor input,
	.editor textarea,
	.editor select {
		box-sizing: border-box;
		width: 100%;
		border: 1px solid #b9a5c7;
		border-radius: 8px;
		padding: 0.7rem;
		background: #fffdf8;
		color: var(--ink);
	}
	textarea {
		resize: vertical;
	}
	.editor fieldset {
		border: 0;
		padding: 0;
		margin: 1rem 0 0;
		min-width: 0;
	}
	.image-choices {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
	}
	.image-choices button {
		background: white;
		color: var(--ink);
		border: 2px solid transparent;
		border-radius: 8px;
		padding: 0.3rem;
		text-align: left;
		font-size: 0.66rem;
		line-height: 1.2;
		font-weight: 700;
	}
	.image-choices button[aria-pressed='true'] {
		border-color: var(--pink);
		box-shadow: 0 0 0 1px var(--pink);
	}
	.image-choices img {
		width: 100%;
		height: 75px;
		object-fit: cover;
		object-position: top;
		display: block;
		border-radius: 4px;
		margin-bottom: 0.4rem;
	}
	.preview-column {
		background: #4e198c;
	}
	.preview-head span:last-child {
		color: var(--ink);
		background: var(--lemon);
		padding: 0.3rem 0.5rem;
		border-radius: 4px;
	}
	.poster {
		background: var(--lemon);
		color: var(--ink);
		padding: clamp(1.2rem, 3vw, 2rem);
		box-shadow: 8px 8px 0 var(--pink);
		overflow-wrap: anywhere;
	}
	.poster-top {
		display: flex;
		justify-content: space-between;
		font-weight: 950;
		font-size: 0.75rem;
	}
	.poster-top span:last-child {
		font-size: 1.5rem;
	}
	.poster-kicker {
		margin: 1.4rem 0 0.7rem;
	}
	.poster h3 {
		font-size: clamp(2rem, 4vw, 3.7rem);
		line-height: 0.95;
		letter-spacing: -0.055em;
		margin: 0 0 1.2rem;
	}
	.poster-image {
		height: clamp(160px, 24vw, 300px);
		overflow: hidden;
		background: var(--ink);
		border: 5px solid var(--ink);
		transform: rotate(-2deg);
		margin: 1.5rem 0;
	}
	.poster-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
	}
	.poster-action {
		font-size: 1.1rem;
		font-weight: 850;
		line-height: 1.25;
	}
	.poster-help {
		font-size: 0.85rem;
	}
	.poster-footer {
		border-top: 3px solid var(--ink);
		padding-top: 0.8rem;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: end;
		font-size: 0.75rem;
		font-weight: 900;
	}
	.preview-note {
		font-size: 0.8rem;
		margin: 1.3rem 0 0;
	}
	.finish {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		padding: 2.5rem 0.5rem 0.3rem;
	}
	.finish h3 {
		font-size: clamp(1.8rem, 3vw, 2.5rem);
		letter-spacing: -0.04em;
		line-height: 1;
		margin: 0 0 1rem;
	}
	.checklist {
		display: grid;
		gap: 0.6rem;
	}
	.checklist label {
		display: flex;
		gap: 0.7rem;
		align-items: start;
	}
	.checklist input {
		width: 1.15rem;
		height: 1.15rem;
		accent-color: var(--pink);
		flex: none;
	}
	.actions {
		display: grid;
		gap: 0.5rem;
		align-content: start;
	}
	.actions button {
		display: flex;
		justify-content: space-between;
		text-align: left;
		background: transparent;
		color: white;
		border: 1px solid #d6b5f5;
		border-radius: 9px;
		padding: 0.85rem 1rem;
		font-weight: 850;
	}
	.actions button.primary {
		background: var(--lemon);
		color: var(--ink);
		border-color: var(--lemon);
	}
	.actions p {
		font-size: 0.75rem;
		margin: 0.25rem 0;
		color: #ead8fa;
	}
	.actions .status {
		min-height: 1em;
		color: var(--lemon);
	}
	button:focus-visible,
	input:focus-visible,
	textarea:focus-visible,
	select:focus-visible {
		outline: 3px solid var(--pink);
		outline-offset: 3px;
	}
	@media (max-width: 760px) {
		.heading {
			display: block;
		}
		.layout,
		.finish {
			grid-template-columns: 1fr;
		}
		.poster-image {
			height: 220px;
		}
		.finish {
			gap: 1.5rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>
