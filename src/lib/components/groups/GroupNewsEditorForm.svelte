<script>
	import IconBot from '@lucide/svelte/icons/bot';
	import LearnEditor from '$lib/components/learn/LearnEditor.svelte';
	import IconEye from '@lucide/svelte/icons/eye';
	import IconGlobe from '@lucide/svelte/icons/globe';
	import IconPencilLine from '@lucide/svelte/icons/pencil-line';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconSave from '@lucide/svelte/icons/save';
	import IconSend from '@lucide/svelte/icons/send';
	import IconSparkles from '@lucide/svelte/icons/sparkles';

	let {
		group,
		values = {},
		error = '',
		isEditing = false,
		isPublished = false,
		memberEmailCount = 0,
		emailMembers = false,
		publicHref = '',
		resetHref = ''
	} = $props();

	const publishLabel = $derived(isPublished ? 'Update published post' : 'Publish update');
	const draftLabel = $derived(isPublished ? 'Unpublish to draft' : 'Save draft');
	const STYLE_OPTIONS = [
		{
			value: 'warm_community',
			label: 'Warm community',
			description: 'Friendly and polished. Good default for most member-facing updates.'
		},
		{
			value: 'quick_bulletin',
			label: 'Quick bulletin',
			description: 'Short, crisp, and factual. Best for route changes and practical notices.'
		},
		{
			value: 'energy_boost',
			label: 'Energy boost',
			description: 'More upbeat and lively for recaps, launches, and momentum-building posts.'
		},
		{
			value: 'action_focused',
			label: 'Action focused',
			description: 'Built around deadlines, next steps, and clear calls to action.'
		}
	];
	const STARTER_PROMPTS = [
		'Draft a short route update from rough notes.',
		'Write an event reminder with the key details up top.',
		'Turn my notes into a polished member update.'
	];

	let titleEl = $state(null);
	let summaryEl = $state(null);
	let editorApi = $state(null);
	let aiStylePreset = $state('warm_community');
	let aiPrompt = $state('');
	let aiLoading = $state(false);
	let aiError = $state('');
	let aiStatus = $state('');
	let aiMessages = $state([]);
	let draftSessionKey = $state('');

	const selectedStyle = $derived(
		STYLE_OPTIONS.find((option) => option.value === aiStylePreset) ?? STYLE_OPTIONS[0]
	);

	function safeTrim(value) {
		if (value === null || value === undefined) return '';
		return String(value).trim();
	}

	function getCurrentDraftContext() {
		return {
			group: {
				name: group?.name || '',
				city: group?.city || '',
				state: group?.state || '',
				description: group?.description || group?.short_description || ''
			},
			draft: {
				title: titleEl?.value || values.title || '',
				summary: summaryEl?.value || values.summary || '',
				body_markdown: editorApi?.getMarkdown?.() || values.bodyMarkdown || ''
			}
		};
	}

	function applyAiDraft(draft) {
		if (!draft || typeof draft !== 'object') return;
		if (safeTrim(draft.title) && titleEl) {
			titleEl.value = safeTrim(draft.title);
		}
		if (summaryEl && Object.prototype.hasOwnProperty.call(draft, 'summary')) {
			summaryEl.value = typeof draft.summary === 'string' ? draft.summary : '';
		}
		if (safeTrim(draft.body_markdown) && editorApi?.setMarkdown) {
			editorApi.setMarkdown(draft.body_markdown);
		}
	}

	function resetAiChat() {
		aiMessages = [];
		aiPrompt = '';
		aiError = '';
		aiStatus = '';
	}

	$effect(() => {
		const nextKey = `${values.postId || 'new'}:${values.slug || values.title || ''}`;
		if (nextKey === draftSessionKey) return;
		draftSessionKey = nextKey;
		resetAiChat();
	});

	function seedPrompt(prompt) {
		aiPrompt = prompt;
	}

	function handleAiPromptKeydown(event) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			sendAiPrompt();
		}
	}

	async function sendAiPrompt() {
		const prompt = safeTrim(aiPrompt);
		if (!prompt || aiLoading) return;

		aiLoading = true;
		aiError = '';
		aiStatus = '';
		const nextMessages = [...aiMessages, { role: 'user', content: prompt }];
		aiMessages = nextMessages;
		aiPrompt = '';

		try {
			const response = await fetch('/api/ai/group-update-writer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: nextMessages,
					style_preset: aiStylePreset,
					context: getCurrentDraftContext()
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to draft update content right now.');
			}

			const assistantMessages = [];
			if (safeTrim(payload?.reply)) {
				assistantMessages.push({ role: 'assistant', content: safeTrim(payload.reply) });
			}
			if (Array.isArray(payload?.follow_up_questions) && payload.follow_up_questions.length) {
				assistantMessages.push({
					role: 'assistant',
					content: payload.follow_up_questions
						.map((question) => safeTrim(question))
						.filter(Boolean)
						.map((question) => `• ${question}`)
						.join('\n')
				});
			}

			if (assistantMessages.length) {
				aiMessages = [...nextMessages, ...assistantMessages];
			}

			if (payload?.draft) {
				applyAiDraft(payload.draft);
				aiStatus = 'Draft applied to the editor below. Keep chatting if you want changes.';
			}
		} catch (error) {
			aiMessages = nextMessages;
			aiPrompt = prompt;
			aiError = error?.message || 'Unable to draft update content right now.';
		} finally {
			aiLoading = false;
		}
	}
</script>

<form class="space-y-6" method="POST">
	<input name="postId" type="hidden" value={values.postId || ''} />

	<section
		class="border-surface-500/20 bg-surface-950/55 overflow-hidden rounded-[2rem] border shadow-xl"
	>
		<div class="border-b border-white/8 px-6 py-5">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="max-w-2xl">
					<div class="mb-2 flex items-center gap-2">
						<span class="chip {isPublished ? 'preset-filled-success-500' : 'preset-tonal-warning'}">
							{isPublished ? 'Live update' : 'Draft update'}
						</span>
						<span class="chip preset-tonal-surface">{group?.name || 'Group'} updates</span>
					</div>
					<h1 class="text-3xl font-black">
						{isEditing ? 'Edit update' : 'Write a new update'}
					</h1>
					<p class="mt-2 text-sm leading-6 opacity-75">
						Share a quick route note, event reminder, recap, or community message. The newest 3 live
						updates appear on the main group page.
					</p>
				</div>

				<div class="flex flex-wrap gap-2">
					{#if publicHref}
						<a class="btn preset-tonal-surface gap-2" href={publicHref} target="_blank">
							<IconEye class="h-4 w-4" />
							View live page
						</a>
					{/if}
					{#if resetHref}
						<a class="btn preset-tonal-surface" href={resetHref}>
							{isEditing ? 'New update' : 'Reset'}
						</a>
					{/if}
				</div>
			</div>
		</div>

		<div class="space-y-6 p-6">
			<label class="space-y-2">
				<span class="label">Title</span>
				<input
					bind:this={titleEl}
					class="input text-base"
					name="title"
					placeholder="Weekend route update"
					required
					value={values.title || ''}
				/>
			</label>

			<section class="border-surface-500/20 bg-surface-900/45 rounded-[1.75rem] border p-5">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div class="max-w-2xl">
						<div class="mb-2 flex items-center gap-2">
							<div
								class="bg-primary-500/15 text-primary-300 flex h-10 w-10 items-center justify-center rounded-2xl"
							>
								<IconBot class="h-5 w-5" />
							</div>
							<div>
								<p class="label opacity-60">AI Draft Assistant</p>
								<h2 class="text-xl font-black">Draft, refine, and restyle in place</h2>
							</div>
						</div>
						<p class="text-sm leading-6 opacity-75">
							Drop in rough notes, pick a style, and the draft will be applied directly to this
							editor. Ask follow-up changes like “make it shorter,” “sound warmer,” or “add a clearer
							call to action.”
						</p>
					</div>
					<button
						class="btn btn-sm preset-tonal-surface gap-2"
						type="button"
						onclick={resetAiChat}
						disabled={aiLoading || (!aiMessages.length && !aiPrompt)}
					>
						<IconRefreshCw class="h-4 w-4" />
						Reset chat
					</button>
				</div>

				<div class="mt-5 grid gap-5 xl:grid-cols-[0.95fr,1.05fr]">
					<div class="space-y-4">
						<label class="space-y-2">
							<span class="label">Style preset</span>
							<select class="select" bind:value={aiStylePreset}>
								{#each STYLE_OPTIONS as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
						<p class="text-sm leading-6 opacity-70">{selectedStyle.description}</p>

						<div class="flex flex-wrap gap-2">
							{#each STARTER_PROMPTS as prompt}
								<button
									class="btn btn-sm preset-tonal-surface"
									type="button"
									onclick={() => seedPrompt(prompt)}
								>
									{prompt}
								</button>
							{/each}
						</div>

						<label class="space-y-2">
							<span class="label">What should this update say?</span>
							<textarea
								class="textarea min-h-36"
								bind:value={aiPrompt}
								onkeydown={handleAiPromptKeydown}
								placeholder="Example: We moved Saturday’s ride to 8:30 AM because of the heat. Mention the new meetup point, tell people to bring extra water, and keep it short."
							></textarea>
						</label>

						<div class="flex flex-wrap items-start justify-between gap-3">
							<p class="max-w-md text-xs leading-5 opacity-60">
								Use rough notes or revision requests. The assistant sees the current draft, so you can
								iteratively shape the update instead of starting over.
							</p>
							<button
								class="btn preset-filled-primary-500 gap-2"
								type="button"
								onclick={sendAiPrompt}
								disabled={aiLoading || !safeTrim(aiPrompt)}
							>
								<IconSend class="h-4 w-4" />
								{aiLoading ? 'Drafting…' : aiMessages.length ? 'Revise draft' : 'Draft with AI'}
							</button>
						</div>

						{#if aiStatus}
							<p class="text-success-400 text-sm">{aiStatus}</p>
						{/if}
						{#if aiError}
							<p class="text-error-400 text-sm">{aiError}</p>
						{/if}
					</div>

					<div
						class="border-surface-500/20 bg-surface-950/55 min-h-64 rounded-[1.5rem] border p-4 shadow-inner"
					>
						{#if aiMessages.length}
							<div class="max-h-[420px] space-y-3 overflow-auto pr-1">
								{#each aiMessages as message}
									<article
										class="rounded-[1.25rem] border px-4 py-3 {message.role === 'assistant'
											? 'border-primary-500/20 bg-primary-500/8'
											: 'border-surface-500/20 bg-surface-900/55'}"
									>
										<p class="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-55">
											{message.role === 'assistant' ? 'Update Muse' : 'You'}
										</p>
										<p class="mt-2 whitespace-pre-wrap text-sm leading-6">{message.content}</p>
									</article>
								{/each}
							</div>
						{:else}
							<div class="flex h-full min-h-56 flex-col justify-between gap-4">
								<div>
									<p class="label opacity-60">Conversation</p>
									<h3 class="mt-2 text-lg font-bold">Start with rough notes</h3>
									<p class="mt-2 text-sm leading-6 opacity-72">
										You do not need to write clean copy first. A few bullet points, a time change,
										some event details, or “make this sound more welcoming” is enough.
									</p>
								</div>
								<div class="border-surface-500/20 bg-surface-900/45 rounded-[1.25rem] border p-4">
									<p class="text-xs font-semibold tracking-[0.18em] uppercase opacity-55">
										Good revision prompts
									</p>
									<ul class="mt-3 space-y-2 text-sm leading-6 opacity-75">
										<li>Make it shorter and more direct.</li>
										<li>Add a clearer call to action near the top.</li>
										<li>Keep the details but make the tone warmer.</li>
									</ul>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</section>

			<LearnEditor
				value={values.bodyMarkdown || ''}
				height="500px"
				label="Update"
				placeholder="Write the update the way you want members to read it."
				onReady={(api) => {
					editorApi = api;
				}}
			/>

			<details class="border-surface-500/20 bg-surface-900/40 rounded-[1.5rem] border p-4">
				<summary class="cursor-pointer list-none font-semibold"> Optional settings </summary>
				<div class="mt-4 space-y-4">
					<label class="space-y-2">
						<span class="label">Short summary</span>
						<textarea
							bind:this={summaryEl}
							class="textarea min-h-24"
							name="summary"
							placeholder="Optional. If blank, the archive and cards use the first lines of the post."
							>{values.summary || ''}</textarea
						>
					</label>
					<label class="space-y-2">
						<span class="label">Custom slug</span>
						<input
							class="input"
							name="slug"
							placeholder="Optional. Leave blank to generate from the title."
							value={values.slug || ''}
						/>
					</label>
				</div>
			</details>

			<section class="border-surface-500/20 bg-surface-900/45 rounded-[1.5rem] border p-4">
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div class="space-y-2 text-sm opacity-80">
						<div class="flex items-center gap-2">
							<IconPencilLine class="h-4 w-4" />
							Drafts stay private in Manage.
						</div>
						<div class="flex items-center gap-2">
							<IconGlobe class="h-4 w-4" />
							Published updates appear on the group page, archive, and full article page.
						</div>
						<div class="flex items-center gap-2">
							<IconSparkles class="h-4 w-4" />
							Keep updates short and direct. Members scan these quickly.
						</div>
					</div>

					<div class="flex flex-wrap justify-end gap-3">
						<label
							class="border-surface-500/20 bg-surface-950/45 flex items-center gap-3 rounded-xl border px-3 py-2 text-sm"
						>
							<input
								type="checkbox"
								name="emailMembers"
								class="checkbox checkbox-sm"
								checked={emailMembers}
								disabled={memberEmailCount === 0}
							/>
							<span>
								Also email active members
								{#if memberEmailCount > 0}
									<span class="opacity-60">
										({memberEmailCount}
										{memberEmailCount === 1 ? 'person' : 'people'})
									</span>
								{:else}
									<span class="opacity-60">(no active member emails)</span>
								{/if}
							</span>
						</label>
						<button
							class="btn preset-tonal-warning gap-2"
							type="submit"
							name="intent"
							value="save_draft"
						>
							<IconSave class="h-4 w-4" />
							{draftLabel}
						</button>
						<button
							class="btn preset-filled-primary-500 gap-2"
							type="submit"
							name="intent"
							value="publish"
						>
							<IconGlobe class="h-4 w-4" />
							{publishLabel}
						</button>
					</div>
				</div>

				{#if error}
					<p class="text-error-500 mt-4 text-sm">{error}</p>
				{/if}
			</section>
		</div>
	</section>
</form>
