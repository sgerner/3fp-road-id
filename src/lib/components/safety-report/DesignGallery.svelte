<script>
	import { tick } from 'svelte';
	let { report, onAsk = undefined } = $props();
	let library = $state('visuals');
	let query = $state('');
	let type = $state('All');
	let topic = $state('All');
	let visible = $state(12);
	let activeIndex = $state(0);
	let dialog = $state();
	let trigger;

	const items = $derived(library === 'visuals' ? report.figures : report.campaignGallery);
	const types = $derived([...new Set(items.map((item) => item.kind))].sort());
	const topics = $derived(
		[...new Set(items.map((item) => (library === 'visuals' ? item.topic : item.campaign)))].sort()
	);
	const results = $derived.by(() => {
		const term = query.trim().toLowerCase();
		return items.filter((item) => {
			const search = [
				item.id,
				item.title,
				item.caption,
				item.alt,
				item.topic,
				item.campaign,
				item.kind
			]
				.join(' ')
				.toLowerCase();
			return (
				(!term || search.includes(term)) &&
				(type === 'All' || item.kind === type) &&
				(topic === 'All' || (library === 'visuals' ? item.topic : item.campaign) === topic)
			);
		});
	});
	const active = $derived(results[activeIndex]);
	const displayType = (value) =>
		value === 'figure'
			? 'Figure'
			: value === 'print'
				? 'Print example'
				: value.replaceAll('-', ' ');
	function reset() {
		visible = 12;
	}
	function switchLibrary(value) {
		library = value;
		type = 'All';
		topic = 'All';
		query = '';
		reset();
	}
	function openImage(index, event) {
		trigger = event.currentTarget;
		activeIndex = index;
		dialog?.showModal();
	}
	function closeImage() {
		dialog?.close();
	}
	function restoreFocus() {
		trigger?.focus();
	}
	function move(delta) {
		activeIndex = (activeIndex + delta + results.length) % results.length;
	}
	function keydown(event) {
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			move(event.key === 'ArrowLeft' ? -1 : 1);
		}
	}
	async function readChapter(id) {
		closeImage();
		await tick();
		const target = document.getElementById(id);
		if (!target) return;
		let parent = target.parentElement;
		while (parent) {
			if (parent instanceof HTMLDetailsElement) parent.open = true;
			parent = parent.parentElement;
		}
		if (target instanceof HTMLDetailsElement) target.open = true;
		target.scrollIntoView({ behavior: 'auto', block: 'start' });
		history.replaceState(null, '', `#${id}`);
	}
</script>

<div class="gallery">
	<p class="eyebrow">Examples and campaign materials</p>
	<h2>See the ideas in action.</h2>
	<p class="intro">
		Explore the report’s draft examples and the current campaign library. Poster A and B pages are
		alternatives; card pages may form duplex pairs. Page numbers identify each proof without
		assuming every page is a front or back.
	</p>
	<div class="switcher" aria-label="Choose a library">
		<button
			type="button"
			class:active={library === 'visuals'}
			aria-pressed={library === 'visuals'}
			onclick={() => switchLibrary('visuals')}>Report visuals <span>31</span></button
		>
		<button
			type="button"
			class:active={library === 'campaigns'}
			aria-pressed={library === 'campaigns'}
			onclick={() => switchLibrary('campaigns')}>Campaign library <span>82</span></button
		>
	</div>
	<div class="controls">
		<label
			>Search <input
				type="search"
				bind:value={query}
				oninput={reset}
				placeholder="Search title, topic, or source ID"
			/></label
		>
		<label
			>Type <select bind:value={type} onchange={reset}
				><option>All</option>{#each types as value}<option {value}>{displayType(value)}</option
					>{/each}</select
			></label
		>
		<label
			>{library === 'visuals' ? 'Topic' : 'Campaign'}
			<select bind:value={topic} onchange={reset}
				><option>All</option>{#each topics as value}<option {value}>{value}</option>{/each}</select
			></label
		>
	</div>
	<p class="count" aria-live="polite">
		{results.length}
		{results.length === 1 ? 'result' : 'results'}
	</p>
	<div class="grid">
		{#each results.slice(0, visible) as item, index (item.id)}
			<article>
				<button
					type="button"
					class="image-button"
					aria-label={'Open ' + item.title}
					onclick={(event) => openImage(index, event)}
				>
					<img
						src={item.src}
						alt={item.alt}
						loading="lazy"
						decoding="async"
						width="600"
						height="450"
					/>
				</button>
				<p class="item-label">
					{library === 'visuals'
						? `${displayType(item.kind)} ${item.number}`
						: `${displayType(item.kind)} · page ${item.page} of ${item.pageCount}`}
				</p>
				<h3>{item.title}</h3>
			</article>
		{/each}
	</div>
	{#if results.length === 0}<p>No matches. Try another search or reset a filter.</p>{/if}
	{#if visible < results.length}<button class="more" type="button" onclick={() => (visible += 12)}
			>Load more <span aria-hidden="true">↓</span></button
		>{/if}
</div>

<dialog
	bind:this={dialog}
	onclose={restoreFocus}
	onkeydown={keydown}
	aria-labelledby="gallery-dialog-title"
>
	{#if active}
		<div class="dialog-top">
			<p class="eyebrow">
				{activeIndex + 1} / {results.length} · {library === 'visuals'
					? `${displayType(active.kind)} ${active.number}`
					: `${displayType(active.kind)} · page ${active.page} of ${active.pageCount}`}
			</p>
			<button type="button" class="close" onclick={closeImage} aria-label="Close image">×</button>
		</div>
		<h2 id="gallery-dialog-title">{active.title}</h2>
		<img class="full-image" src={active.src} alt={active.alt} />
		{#if active.caption}<p class="caption">{active.caption}</p>{:else}<p class="caption">
				{active.alt}
			</p>{/if}
		<div class="actions">
			{#if active.chapterId}<button type="button" onclick={() => readChapter(active.chapterId)}
					>Read chapter ↓</button
				>{/if}
			{#if active.downloadUrl}<a href={active.downloadUrl} download>Download editable SVG ↓</a>{/if}
			{#if active.canvaUrl}<a href={active.canvaUrl} target="_blank" rel="noopener noreferrer"
					>Edit in Canva ↗</a
				>{/if}
			{#if onAsk}<button
					type="button"
					onclick={async () => {
						const question = `Explain this example: ${active.title}. ${active.caption || active.alt}`;
						closeImage();
						await tick();
						onAsk(question);
					}}>Ask about this example →</button
				>{/if}
		</div>
		<div class="navigation">
			<button type="button" onclick={() => move(-1)}>← Previous</button><span
				>Use arrow keys to browse</span
			><button type="button" onclick={() => move(1)}>Next →</button>
		</div>
	{/if}
</dialog>

<style>
	h2,
	h3 {
		color: #26123c !important;
	}
	.gallery {
		color: #23143a;
	}
	.eyebrow,
	.item-label {
		color: #7926cb;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 0.75rem;
		font-weight: 800;
	}
	h2 {
		font-size: clamp(2rem, 5vw, 3.5rem);
		line-height: 1.05;
		letter-spacing: -0.04em;
		margin: 0.5rem 0 1rem;
	}
	.intro {
		max-width: 48rem;
		line-height: 1.6;
	}
	button,
	select,
	input {
		font: inherit;
	}
	button {
		cursor: pointer;
	}
	button:focus-visible,
	a:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 3px solid #ff0180;
		outline-offset: 3px;
	}
	.switcher {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 2rem 0;
	}
	.switcher button {
		padding: 0.75rem 1rem;
		border: 2px solid #7926cb;
		background: transparent;
		color: #681bae;
		border-radius: 0.3rem;
		font-weight: 800;
	}
	.switcher button.active {
		background: #7926cb;
		color: white;
	}
	.switcher span {
		opacity: 0.8;
		margin-left: 0.3rem;
	}
	.controls {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: 1rem;
	}
	.controls label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.85rem;
		font-weight: 800;
	}
	input,
	select {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		padding: 0.8rem;
		color: #23143a;
		border: 1px solid #9d8aab;
		border-radius: 0.3rem;
		background: white;
	}
	.count {
		font-weight: 700;
		margin: 1.5rem 0 1rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 2rem 1.25rem;
	}
	.image-button {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: #f3edf7;
	}
	.image-button img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 4 / 3;
		object-fit: contain;
	}
	.image-button:hover {
		box-shadow: 0 0 0 4px #ff0180;
	}
	.item-label {
		margin: 0.8rem 0 0.35rem;
	}
	h3 {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.3;
	}
	.more {
		margin: 2rem 0;
		padding: 0.85rem 1.2rem;
		border: 2px solid #7926cb;
		border-radius: 0.3rem;
		background: transparent;
		color: #681bae;
		font-weight: 800;
	}
	dialog {
		box-sizing: border-box;
		width: min(1100px, calc(100% - 2rem));
		max-width: 1100px;
		max-height: 90vh;
		overflow: auto;
		padding: clamp(1rem, 4vw, 2.5rem);
		color: #23143a;
		background: #fffdf8;
		border: 0;
		border-top: 6px solid #ff0180;
	}
	dialog::backdrop {
		background: rgb(35 20 58 / 0.78);
	}
	.dialog-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.close {
		border: 0;
		background: transparent;
		color: #23143a;
		font-size: 2.5rem;
		line-height: 1;
	}
	dialog h2 {
		font-size: clamp(1.5rem, 3vw, 2.4rem);
	}
	.full-image {
		display: block;
		max-width: 100%;
		max-height: 65vh;
		width: auto;
		height: auto;
		margin: 1.5rem auto;
		object-fit: contain;
	}
	.caption {
		max-width: 65rem;
		line-height: 1.6;
	}
	.actions,
	.navigation {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem 1.5rem;
	}
	.actions a,
	.actions button {
		color: #681bae;
		font-weight: 800;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.actions button {
		border: 0;
		background: none;
		padding: 0;
	}
	.navigation {
		justify-content: space-between;
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid #cbbbd3;
	}
	.navigation button {
		border: 0;
		background: #ffff0a;
		color: #23143a;
		padding: 0.65rem 0.9rem;
		font-weight: 800;
	}
	.navigation span {
		font-size: 0.8rem;
	}
	@media (max-width: 700px) {
		.controls {
			grid-template-columns: 1fr;
		}
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 420px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.navigation span {
			display: none;
		}
	}
</style>
