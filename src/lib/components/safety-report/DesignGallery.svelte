<script>
	import { tick, onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	let { report, onAsk = undefined } = $props();
	let library = $state('visuals');
	let query = $state('');
	let type = $state('All');
	let topic = $state('All');
	let visible = $state(12);
	let activeIndex = $state(0);
	let dialog = $state();
	let trigger;
	let reducedMotion = $state(true);
	onMount(() => {
		const preference = matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => (reducedMotion = preference.matches);
		update();
		preference.addEventListener('change', update);
		return () => preference.removeEventListener('change', update);
	});
	const bytes = (size) =>
		size >= 1000000 ? `${(size / 1000000).toFixed(1)} MB` : `${Math.ceil(size / 1000)} KB`;
	const campaignName = (value) =>
		value === 'All'
			? 'All'
			: value
					.split(', ')
					.map((name) =>
						name === '03-a-person-on-a-bike'
							? 'Family, friends & everyday rides'
							: name.replace(/^\d+-/, '').replaceAll('-', ' ')
					)
					.join(' + ');
	const formatSize = (item) =>
		item.kind === 'social'
			? `${item.pixelWidth || 1080} × ${item.pixelHeight || 1080} px`
			: item.dimensions
				? `${item.dimensions.join(' × ')} in`
				: '';

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
	<div class="free-assets">
		<div>
			<span class="free-label">FREE CAMPAIGN LIBRARY</span>
			<h3>Take an idea.<br />Make it your own.</h3>
			<p>
				Download a PDF to print, or open a Canva template to create your own editable copy. No email
				or form required for downloads.
			</p>
		</div>
		<div class="free-actions">
			<button type="button" onclick={() => switchLibrary('campaigns')}
				>Explore {report.meta.campaignAssetCount || 36} free design sets
				<span aria-hidden="true">↗</span></button
			>
			<p>Canva sign-in is required to make a copy. Editable PowerPoint files are available too.</p>
		</div>
	</div>
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
				><option>All</option>{#each topics as value}<option {value}>{campaignName(value)}</option
					>{/each}</select
			></label
		>
	</div>
	<p class="count" aria-live="polite">
		{results.length}
		{results.length === 1 ? 'result' : 'results'}
	</p>
	<div class="grid">
		{#each results.slice(0, visible) as item, index (item.id)}
			<article
				in:fly={{ y: reducedMotion ? 0 : 14, duration: reducedMotion ? 0 : 250 }}
				animate:flip={{ duration: reducedMotion ? 0 : 220 }}
			>
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
				{#if library === 'campaigns'}<p class="asset-meta">
						{formatSize(item)} · {item.pageCount}-page set
					</p>
					<div class="card-actions">
						{#if item.pdfUrl}<a
								href={item.pdfUrl}
								download
								aria-label={`Download PDF set: ${item.title}`}>PDF ↓</a
							>{/if}
						{#if item.pngUrl}<a
								href={item.pngUrl}
								download
								aria-label={`Download PNG: ${item.title}`}>PNG ↓</a
							>{/if}
						{#if item.canvaTemplateUrl}<a
								href={item.canvaTemplateUrl}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={`Make your own Canva copy: ${item.title}`}>Make a Canva copy ↗</a
							>{/if}
					</div>{/if}
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
		{#key active.id}<img
				class="full-image"
				src={active.src}
				alt={active.alt}
				in:fade={{ duration: reducedMotion ? 0 : 200 }}
			/>{/key}
		{#if active.caption}<p class="caption">{active.caption}</p>{:else}<p class="caption">
				{active.alt}
			</p>{/if}
		<div class="actions">
			{#if active.chapterId}<button type="button" onclick={() => readChapter(active.chapterId)}
					>Read chapter ↓</button
				>{/if}
			{#if active.downloadUrl}<a href={active.downloadUrl} download>Download editable SVG ↓</a>{/if}
			{#if active.pdfUrl}<a class="download-primary" href={active.pdfUrl} download
					>Download PDF set ↓ <small>{bytes(active.pdfBytes)}</small></a
				>{/if}
			{#if active.pngUrl}<a href={active.pngUrl} download
					>Download PNG ↓ <small>{bytes(active.pngBytes)}</small></a
				>{/if}
			{#if active.canvaTemplateUrl}<a
					class="template-link"
					href={active.canvaTemplateUrl}
					target="_blank"
					rel="noopener noreferrer">Make your own Canva copy ↗</a
				>{/if}
			{#if active.editableUrl}<a href={active.editableUrl} download
					>Download editable PowerPoint ↓ <small>{bytes(active.editableBytes)}</small></a
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
		{#if active.pdfUrl}<p class="download-note">
				The PDF and PowerPoint include all {active.pageCount} pages in this design set. {formatSize(
					active
				)}. Canva opens a template so you can edit your own copy. Check the final layout and QR code
				after making changes.
			</p>{/if}
		<div class="navigation">
			<button type="button" onclick={() => move(-1)}>← Previous</button><span
				>Use arrow keys to browse</span
			><button type="button" onclick={() => move(1)}>Next →</button>
		</div>
	{/if}
</dialog>

<style>
	.free-assets {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 2rem;
		align-items: center;
		background: #35125f;
		color: #fff3df;
		padding: clamp(1.3rem, 3vw, 2.3rem);
		margin: 2rem 0;
		border-top: 6px solid #ff0180;
	}
	.free-label {
		font-size: 0.68rem;
		font-weight: 800;
		color: #ffff0a;
		letter-spacing: 0.14em;
	}
	.free-assets h3 {
		color: #fff3df !important;
		font-size: clamp(1.8rem, 3vw, 2.7rem);
		line-height: 1.05;
		margin: 0.8rem 0 1rem;
	}
	.free-assets p {
		font-size: 0.85rem;
		line-height: 1.6;
		max-width: 32rem;
	}
	.free-actions button {
		background: #ffff0a;
		color: #23143a;
		border: 0;
		padding: 1.1rem;
		font-weight: 800;
		display: flex;
		justify-content: space-between;
		gap: 1.2rem;
		width: 100%;
	}
	.free-actions p {
		margin: 1rem 0 0;
		color: #e6d5f5;
		font-size: 0.75rem;
	}
	.asset-meta {
		font-size: 0.73rem;
		color: #655b70;
		margin: 0.6rem 0;
	}
	.card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.8rem;
	}
	.card-actions a {
		font-size: 0.7rem;
		padding: 0.5rem 0.6rem;
		background: #eee2f9;
		color: #4c197d;
		text-decoration: none;
		font-weight: 800;
	}
	.card-actions a:last-child {
		background: #7926cb;
		color: white;
	}
	.card-actions a:hover {
		background: #ffff0a;
		color: #23143a;
	}
	.actions small {
		display: block;
		font-size: 0.65rem;
		font-weight: 400;
		opacity: 0.8;
	}
	.actions .download-primary {
		background: #7926cb;
		color: white;
	}
	.actions .template-link {
		background: #ffff0a;
		color: #23143a;
	}
	.download-note {
		font-size: 0.78rem;
		line-height: 1.7;
		color: #655b70;
		margin: 1rem 0;
	}
	dialog[open] {
		animation: gallery-arrive 0.22s ease-out;
	}
	@keyframes gallery-arrive {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.99);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.image-button img {
		transition: transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	.image-button:hover img {
		transform: scale(1.035);
	}
	@media (max-width: 650px) {
		.free-assets {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		dialog[open] {
			animation: none;
		}
		.image-button img {
			transition: none;
		}
		.image-button:hover img {
			transform: none;
		}
	}

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
