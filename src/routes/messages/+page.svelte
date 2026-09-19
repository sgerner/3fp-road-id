<script>
	import IconArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import IconMessageCircle from '@lucide/svelte/icons/message-circle';
	import IconSend from '@lucide/svelte/icons/send';
	import IconShieldCheck from '@lucide/svelte/icons/shield-check';

	const { data } = $props();
	const pageData = $derived(data ?? {});
	const threads = $derived(pageData.threads ?? []);
	let selectedThreadId = $state('');
	let message = $state('');
	let kind = $state('admin');
	let sending = $state(false);
	let sendError = $state('');
	let sendSuccess = $state('');

	const selectedThread = $derived.by(() => {
		if (!threads.length) return null;
		return threads.find((thread) => thread.id === selectedThreadId) ?? threads[0];
	});

	function threadLabel(thread) {
		if (!thread) return 'SMS conversation';
		return thread.subject || `SMS ending ${String(thread.phone_e164 || '').slice(-4)}`;
	}

	function contextLabel(thread) {
		if (thread?.activity_event_id) return 'Ride';
		if (thread?.volunteer_event_id) return 'Volunteer';
		if (thread?.bike_valet_reference) return 'Bike valet';
		return 'General';
	}

	function selectThread(id) {
		selectedThreadId = id;
		sendError = '';
		sendSuccess = '';
	}

	async function sendMessage() {
		if (!selectedThread?.id || !message.trim() || sending) return;
		sending = true;
		sendError = '';
		sendSuccess = '';
		try {
			const response = await fetch(`/api/sms/threads/${selectedThread.id}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ body: message, kind })
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error || 'Unable to queue SMS.');
			message = '';
			sendSuccess = 'Reply queued. It will send as plain SMS when the dispatcher runs.';
			if (typeof window !== 'undefined') window.location.reload();
		} catch (error) {
			sendError = error?.message || 'Unable to queue SMS.';
		} finally {
			sending = false;
		}
	}
</script>

<svelte:head>
	<title>SMS inbox · 3 Feet Please</title>
	<meta name="description" content="Manage opted-in 3 Feet Please SMS conversations." />
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="label opacity-60">Operations</p>
			<h1 class="text-3xl font-extrabold tracking-tight">SMS inbox</h1>
			<p class="mt-2 max-w-2xl text-sm opacity-75">
				Reply to opted-in riders and volunteers. Messages are plain text only and protected by daily
				and segment limits.
			</p>
		</div>
		<a class="btn preset-outlined-primary-500 gap-2" href="/privacy">
			<IconShieldCheck class="h-4 w-4" />
			SMS policy <IconArrowUpRight class="h-4 w-4" />
		</a>
	</div>

	{#if !pageData.currentUser}
		<div class="card preset-tonal-surface p-8 text-center">
			<IconMessageCircle class="mx-auto mb-3 h-8 w-8 opacity-60" />
			<h2 class="text-xl font-bold">Sign in to view messages</h2>
			<p class="mt-2 text-sm opacity-70">
				Only authenticated event admins and SMS managers can access conversations.
			</p>
		</div>
	{:else if pageData.loadError}
		<div class="card preset-tonal-warning p-6 text-sm">{pageData.loadError}</div>
	{:else if !threads.length}
		<div class="card preset-tonal-surface p-8 text-center">
			<IconMessageCircle class="mx-auto mb-3 h-8 w-8 opacity-60" />
			<h2 class="text-xl font-bold">No SMS conversations yet</h2>
			<p class="mt-2 text-sm opacity-70">
				Opted-in ride and volunteer conversations will appear here.
			</p>
		</div>
	{:else}
		<div class="grid min-h-[34rem] gap-4 lg:grid-cols-[minmax(15rem,0.35fr)_minmax(0,1fr)]">
			<aside class="card preset-tonal-surface overflow-hidden p-2">
				<div class="px-3 py-3 text-xs font-semibold tracking-wider uppercase opacity-60">
					Conversations
				</div>
				<div class="grid gap-1">
					{#each threads as thread}
						<button
							type="button"
							class={`conversation-row text-left ${selectedThread?.id === thread.id ? 'is-selected' : ''}`}
							onclick={() => selectThread(thread.id)}
						>
							<div class="flex items-center justify-between gap-2">
								<span class="truncate font-semibold">{threadLabel(thread)}</span>
								<span class="shrink-0 text-[0.68rem] opacity-60">{contextLabel(thread)}</span>
							</div>
							<div class="mt-1 text-xs opacity-60">
								{thread.phone_e164} · {thread.messages?.length || 0} messages
							</div>
						</button>
					{/each}
				</div>
			</aside>

			<section class="card preset-tonal-surface flex min-h-[34rem] flex-col overflow-hidden">
				{#if selectedThread}
					<header
						class="border-surface-500/15 flex flex-wrap items-center justify-between gap-3 border-b p-4"
					>
						<div>
							<h2 class="font-bold">{threadLabel(selectedThread)}</h2>
							<p class="text-xs opacity-60">
								{selectedThread.phone_e164} · {contextLabel(selectedThread)}
							</p>
						</div>
						<span class="chip preset-tonal-primary">{selectedThread.status}</span>
					</header>

					<div class="flex-1 space-y-3 overflow-y-auto p-4">
						{#each selectedThread.messages ?? [] as sms}
							<div class={`flex ${sms.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
								<div
									class={`message-bubble ${sms.direction === 'outbound' ? 'outbound' : 'inbound'}`}
								>
									<div class="text-sm whitespace-pre-wrap">{sms.body}</div>
									<div class="mt-1 text-[0.68rem] opacity-60">
										{sms.direction === 'outbound' ? '3FP' : 'Rider'} · {sms.provider_status ||
											sms.kind}
									</div>
								</div>
							</div>
						{/each}
					</div>

					<form
						class="border-surface-500/15 space-y-3 border-t p-4"
						onsubmit={(event) => {
							event.preventDefault();
							sendMessage();
						}}
					>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<label class="flex items-center gap-2 text-sm">
								<span class="font-semibold">Reply type</span>
								<select class="select" bind:value={kind}>
									<option value="admin">Admin update</option>
									<option value="bike_valet">Bike valet</option>
								</select>
							</label>
							<span class={`text-xs ${message.length > 480 ? 'text-error-600-400' : 'opacity-60'}`}
								>{message.length}/480</span
							>
						</div>
						<textarea
							class="textarea min-h-24"
							bind:value={message}
							maxlength="480"
							placeholder="Write a plain-text reply…"></textarea>
						<div class="flex flex-wrap items-center justify-between gap-3">
							<p class="max-w-xl text-xs opacity-60">
								No photos or files. Links must be to 3fp.org. Reply STOP remains available to the
								recipient.
							</p>
							<button
								class="btn preset-filled-primary-500 gap-2"
								type="submit"
								disabled={sending || !message.trim()}
							>
								<IconSend class="h-4 w-4" />
								{sending ? 'Queueing…' : 'Queue reply'}
							</button>
						</div>
						{#if sendError}<p class="text-error-600-400 text-sm">{sendError}</p>{/if}
						{#if sendSuccess}<p class="text-success-600-400 text-sm">{sendSuccess}</p>{/if}
					</form>
				{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.conversation-row {
		width: 100%;
		border-radius: 0.8rem;
		padding: 0.75rem;
		transition: background 150ms ease;
	}

	.conversation-row:hover,
	.conversation-row.is-selected {
		background: color-mix(in oklab, var(--color-primary-500) 14%, transparent);
	}

	.message-bubble {
		max-width: min(38rem, 90%);
		border-radius: 1rem;
		padding: 0.75rem 0.9rem;
	}

	.message-bubble.inbound {
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
	}

	.message-bubble.outbound {
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
	}
</style>
