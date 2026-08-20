<script>
	import { tick } from 'svelte';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconRefresh from '@lucide/svelte/icons/refresh-cw';
	import IconSend from '@lucide/svelte/icons/send-horizontal';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import { siteEditorConfigFingerprint } from '$lib/groups/siteEditor';

	let { groupSlug, currentConfig = {}, onapplied = () => {} } = $props();
	const starter =
		'Tell me the feeling you want visitors to get. I can rewrite the page, choose a visual direction, and organize the sections.';
	const prompts = [
		'Make it welcoming for brand-new riders',
		'Make the site bold, energetic, and action-focused',
		'Polish the copy without changing our voice'
	];
	let messages = $state([{ id: 'starter', role: 'assistant', content: starter }]);
	let input = $state('');
	let sending = $state(false);
	let applying = $state(false);
	let error = $state('');
	let proposal = $state(null);
	let transcript;
	const canSend = $derived(Boolean(input.trim()) && !sending);

	const messageId = (role) =>
		`${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

	async function scrollToBottom() {
		await tick();
		transcript?.scrollTo({ top: transcript.scrollHeight, behavior: 'smooth' });
	}

	async function sendMessage(text = input) {
		const content = String(text || '').trim();
		if (!content || sending) return;
		input = '';
		error = '';
		sending = true;
		const next = [...messages, { id: messageId('user'), role: 'user', content }];
		messages = next;
		await scrollToBottom();
		try {
			const requestedConfig = structuredClone(currentConfig);
			const response = await fetch(
				`/api/groups/${encodeURIComponent(groupSlug)}/site/ai-draft-chat`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						messages: next.map((message) => ({ role: message.role, content: message.content })),
						currentConfig: requestedConfig
					})
				}
			);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok)
				throw new Error(payload?.error || 'The design assistant is unavailable right now.');
			messages = [
				...next,
				{
					id: messageId('assistant'),
					role: 'assistant',
					content: String(payload?.reply || 'Tell me what you would like to refine next.').trim()
				}
			];
			if (payload?.generated && payload?.config) {
				proposal = {
					config: payload.config,
					baseFingerprint: siteEditorConfigFingerprint(requestedConfig),
					source: String(payload?.source || 'ai'),
					generationPrompt: String(payload?.generationPrompt || ''),
					summary: Array.isArray(payload?.summary) ? payload.summary.filter(Boolean) : []
				};
			}
			await scrollToBottom();
		} catch (cause) {
			error = cause?.message || 'The design assistant is unavailable right now.';
		} finally {
			sending = false;
		}
	}

	async function applyProposal() {
		if (!proposal?.config || applying) return;
		error = '';
		if (siteEditorConfigFingerprint(currentConfig) !== proposal.baseFingerprint) {
			error =
				'Your page changed after this draft was created. Ask the assistant again so it can use your latest edits.';
			return;
		}
		try {
			applying = true;
			const applied = await onapplied(proposal.config, proposal.source);
			if (applied !== false) proposal = null;
		} catch (cause) {
			error = cause?.message || 'Unable to apply this draft.';
		} finally {
			applying = false;
		}
	}

	function reset() {
		messages = [{ id: 'starter', role: 'assistant', content: starter }];
		proposal = null;
		input = '';
		error = '';
	}
</script>

<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
	<div class="card preset-tonal-secondary overflow-hidden">
		<div class="preset-divider-bottom flex items-center justify-between gap-3 p-4">
			<div class="flex items-center gap-2">
				<IconSparkles class="h-5 w-5" />
				<div>
					<p class="font-semibold">Improve my website</p>
					<p class="text-xs opacity-65">Describe the outcome in everyday language.</p>
				</div>
			</div>
			<button class="btn btn-sm preset-tonal-surface" type="button" onclick={reset}
				><IconRefresh class="h-4 w-4" /> Reset</button
			>
		</div>
		<div class="grid max-h-80 gap-3 overflow-y-auto p-4" bind:this={transcript} aria-live="polite">
			{#each messages as message (message.id)}
				<div
					class="card max-w-[90%] p-3 text-sm {message.role === 'user'
						? 'preset-filled-primary-500 ml-auto'
						: 'preset-tonal-surface'}"
				>
					{message.content}
				</div>
			{/each}
			{#if sending}<div class="card preset-tonal-surface max-w-[90%] p-3 text-sm">
					Thinking through the page…
				</div>{/if}
		</div>
		<div class="preset-divider-top grid gap-3 p-4">
			<div class="grid min-w-0 gap-2 sm:flex sm:flex-wrap">
				{#each prompts as prompt}<button
						class="btn btn-sm preset-tonal-surface min-w-0 justify-start whitespace-normal text-left"
						type="button"
						onclick={() => sendMessage(prompt)}
						disabled={sending}>{prompt}</button
					>{/each}
			</div>
			<div class="flex min-w-0 items-end gap-2">
				<label class="sr-only" for="site-ai-prompt">Website direction</label><textarea
					id="site-ai-prompt"
					class="textarea min-h-12 min-w-0 flex-1"
					rows="2"
					bind:value={input}
					placeholder="Example: Make the homepage warmer and put our weekly rides first."
					onkeydown={(event) => {
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault();
							sendMessage();
						}
					}}
				></textarea><button
					class="btn btn-icon preset-filled-secondary-500"
					type="button"
					onclick={() => sendMessage()}
					disabled={!canSend}
					aria-label="Send direction"><IconSend class="h-4 w-4" /></button
				>
			</div>
			{#if error}<div class="preset-tonal-error p-3 text-sm" role="alert">{error}</div>{/if}
		</div>
	</div>

	<aside class="card preset-tonal-surface grid content-start gap-3 p-4">
		<div>
			<p class="text-xs font-semibold tracking-wide uppercase opacity-55">Proposal</p>
			<p class="font-semibold">Review before applying</p>
		</div>
		{#if proposal}
			{#if proposal.summary.length}<ul class="grid gap-2 text-sm">
					{#each proposal.summary as item}<li class="flex items-start gap-2">
							<IconCheck class="mt-0.5 h-4 w-4 shrink-0" />
							{item}
						</li>{/each}
				</ul>{:else}<p class="text-sm opacity-65">A complete direction is ready to apply.</p>{/if}
			<button
				class="btn preset-filled-primary-500"
				type="button"
				onclick={applyProposal}
				disabled={applying}
				><IconSparkles class="h-4 w-4" /> {applying ? 'Applying…' : 'Apply to website'}</button
			>
			<button class="btn preset-tonal-surface" type="button" onclick={() => (proposal = null)}
				>Keep current site</button
			>
		{:else}
			<div
				class="preset-tonal-surface grid min-h-40 place-items-center p-5 text-center text-sm opacity-65"
			>
				Your proposed copy and style will appear here. Nothing changes until you apply it.
			</div>
		{/if}
	</aside>
</div>
