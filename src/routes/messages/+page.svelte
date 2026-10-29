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

<div
	class="bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-41px)] flex-col overflow-hidden"
>
	<!-- HERO -->
	<section
		class="bg-primary-500 text-surface-950 grid lg:grid-cols-[minmax(0,1fr)_auto]"
		aria-labelledby="inbox-heading"
	>
		<div
			class="flex flex-col justify-between gap-8 px-6 pt-10 pb-12 sm:px-10 lg:px-14 lg:pt-14 lg:pb-16"
		>
			<p class="m-0 flex items-center gap-3 text-xs font-bold tracking-[0.22em] uppercase">
				<span class="bg-tertiary-500 h-3 w-3" aria-hidden="true"></span>
				<span>Operations</span>
			</p>

			<div class="flex flex-col gap-5">
				<h1
					id="inbox-heading"
					class="text-surface-950! m-0 text-[clamp(2.9rem,6.8vw,6rem)] leading-[0.86] font-black tracking-[-0.04em] uppercase italic"
				>
					SMS <span class="text-secondary-500">inbox</span>
				</h1>
				<p class="m-0 max-w-2xl text-lg leading-snug font-medium sm:text-2xl">
					Reply to opted-in riders and volunteers. Messages are plain text only and protected by
					daily and segment limits.
				</p>
			</div>

			<div>
				<a
					class="group bg-surface-950 text-primary-500 hover:bg-secondary-500 hover:text-surface-50 inline-flex items-center gap-3 px-7 py-4 text-base font-black tracking-wide uppercase transition hover:no-underline"
					href="/privacy"
				>
					<IconShieldCheck class="h-5 w-5" />
					SMS policy
					<IconArrowUpRight
						class="h-5 w-5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
					/>
				</a>
			</div>
		</div>

		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 hidden w-24 flex-col items-center justify-between border-l-[3px] py-6 lg:flex"
			aria-hidden="true"
		>
			<span class="text-2xl leading-none font-black italic">3FT</span>
			<span
				class="my-4 flex-1 self-stretch bg-[repeating-linear-gradient(180deg,currentColor_0_3px,transparent_3px_18px)] [mask-image:linear-gradient(90deg,#000_0_45%,transparent_45%)]"
			></span>
			<span class="text-2xl leading-none font-black italic">0</span>
		</div>
	</section>

	{#if !pageData.currentUser}
		<section
			class="bg-surface-950 border-surface-950 flex flex-1 flex-col justify-between gap-6 border-t-[3px] px-6 py-16 sm:px-10 lg:px-14 lg:py-24"
		>
			<span
				class="bg-tertiary-500 text-surface-950 flex h-14 w-14 items-center justify-center"
				aria-hidden="true"
			>
				<IconMessageCircle class="h-7 w-7" />
			</span>
			<div class="flex max-w-2xl flex-col gap-3">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					Authentication Required
				</p>
				<h2
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
				>
					Sign in to view messages
				</h2>
				<p class="text-surface-300 m-0 text-lg leading-relaxed">
					Only authenticated event admins and SMS managers can access conversations.
				</p>
			</div>
			<div
				class="mt-6 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)]"
				aria-hidden="true"
			></div>
		</section>
	{:else if pageData.loadError}
		<section
			class="bg-tertiary-500 text-surface-950 border-surface-950 border-t-[3px] px-6 py-10 text-base font-black uppercase sm:px-10 lg:px-14"
		>
			{pageData.loadError}
		</section>
	{:else if !threads.length}
		<section
			class="bg-surface-950 border-surface-950 flex flex-col gap-6 border-t-[3px] px-6 py-16 sm:px-10 lg:px-14 lg:py-24"
		>
			<span
				class="bg-secondary-500 text-primary-500 flex h-14 w-14 items-center justify-center"
				aria-hidden="true"
			>
				<IconMessageCircle class="h-7 w-7" />
			</span>
			<div class="flex max-w-2xl flex-col gap-3">
				<p class="text-primary-500 m-0 text-xs font-bold tracking-[0.22em] uppercase">
					Queue Empty
				</p>
				<h2
					class="text-surface-50! m-0 text-4xl leading-[0.92] font-black tracking-[-0.03em] uppercase italic sm:text-6xl"
				>
					No SMS conversations yet
				</h2>
				<p class="text-surface-300 m-0 text-lg leading-relaxed">
					Opted-in ride and volunteer conversations will appear here.
				</p>
			</div>
			<div
				class="mt-6 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-primary-500)_0_56px,transparent_56px_96px)]"
				aria-hidden="true"
			></div>
		</section>
	{:else}
		<div
			class="bg-surface-950 border-surface-950 grid min-h-[38rem] border-t-[3px] lg:grid-cols-[minmax(18rem,0.38fr)_minmax(0,1fr)]"
		>
			<aside class="lg:border-surface-800 flex flex-col lg:border-r-2">
				<div
					class="bg-secondary-500 text-surface-50 px-6 py-4 text-xs font-black tracking-[0.22em] uppercase"
				>
					Conversations
				</div>
				<div class="divide-surface-800 flex flex-col divide-y">
					{#each threads as thread, index (thread.id)}
						{@const active = selectedThread?.id === thread.id}
						<button
							type="button"
							class={`flex w-full items-start gap-4 px-6 py-5 text-left transition ${
								active
									? 'bg-primary-500 text-surface-950'
									: 'bg-surface-950 text-surface-50 hover:bg-primary-500 hover:text-surface-950'
							}`}
							onclick={() => selectThread(thread.id)}
						>
							<span
								class={`w-8 shrink-0 text-xl font-black italic tabular-nums ${
									active ? 'text-secondary-500' : 'text-tertiary-500'
								}`}
							>
								{String(index + 1).padStart(2, '0')}
							</span>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<span class="truncate text-base font-black uppercase">{threadLabel(thread)}</span>
									<span class="shrink-0 text-[0.68rem] font-bold tracking-widest uppercase">
										{contextLabel(thread)}
									</span>
								</div>
								<div class="mt-1 text-xs opacity-80">
									{thread.phone_e164} · {thread.messages?.length || 0} messages
								</div>
							</div>
						</button>
					{/each}
				</div>
			</aside>

			<section class="flex min-h-[38rem] flex-col">
				{#if selectedThread}
					<header
						class="bg-surface-900 border-surface-800 flex flex-wrap items-center justify-between gap-4 border-b-2 px-6 py-5 sm:px-10"
					>
						<div>
							<h2 class="text-surface-50! m-0 text-2xl font-black uppercase">
								{threadLabel(selectedThread)}
							</h2>
							<p class="text-surface-300 m-0 mt-1 text-xs font-bold tracking-wide uppercase">
								{selectedThread.phone_e164} · {contextLabel(selectedThread)}
							</p>
						</div>
						<span
							class="bg-primary-500 text-surface-950 px-3 py-1 text-xs font-black tracking-[0.2em] uppercase"
						>
							{selectedThread.status}
						</span>
					</header>

					<div class="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-8 sm:px-10">
						{#each selectedThread.messages ?? [] as sms, idx (sms.id ?? idx)}
							<div class={`flex ${sms.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
								<div
									class={`max-w-[min(38rem,90%)] p-4 ${
										sms.direction === 'outbound'
											? 'bg-primary-500 text-surface-950'
											: 'bg-secondary-500 text-surface-50'
									}`}
								>
									<div class="text-sm font-medium whitespace-pre-wrap">{sms.body}</div>
									<div class="mt-2 text-[0.68rem] font-bold tracking-wider uppercase opacity-80">
										{sms.direction === 'outbound' ? '3FP' : 'Rider'} · {sms.provider_status ||
											sms.kind}
									</div>
								</div>
							</div>
						{/each}
					</div>

					<form
						class="bg-surface-900 border-surface-800 flex flex-col gap-4 border-t-2 px-6 py-6 sm:px-10"
						onsubmit={(event) => {
							event.preventDefault();
							sendMessage();
						}}
					>
						<div class="flex flex-wrap items-center justify-between gap-3">
							<label class="flex items-center gap-3 text-sm">
								<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
									Reply type
								</span>
								<select
									class="select bg-surface-950 border-surface-700 text-surface-50"
									bind:value={kind}
								>
									<option value="admin">Admin update</option>
									<option value="bike_valet">Bike valet</option>
								</select>
							</label>
							<span
								class={`text-xs font-black tabular-nums ${
									message.length > 480 ? 'text-tertiary-500' : 'text-surface-300'
								}`}
							>
								{message.length}/480
							</span>
						</div>
						<textarea
							class="textarea bg-surface-950 border-surface-700 text-surface-50 focus:border-primary-500 min-h-24"
							bind:value={message}
							maxlength="480"
							placeholder="Write a plain-text reply…"></textarea>
						<div class="flex flex-wrap items-center justify-between gap-4">
							<p class="text-surface-300 m-0 max-w-xl text-xs">
								No photos or files. Links must be to 3fp.org. Reply STOP remains available to the
								recipient.
							</p>
							<button
								class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 px-7 py-3.5 text-sm font-black tracking-wide uppercase transition disabled:opacity-50"
								type="submit"
								disabled={sending || !message.trim()}
							>
								<IconSend class="h-4 w-4" />
								{sending ? 'Queueing…' : 'Queue reply'}
							</button>
						</div>
						{#if sendError}
							<p class="bg-tertiary-500 text-surface-950 m-0 px-4 py-2 text-sm font-bold">
								{sendError}
							</p>
						{/if}
						{#if sendSuccess}
							<p class="bg-primary-500 text-surface-950 m-0 px-4 py-2 text-sm font-black uppercase">
								{sendSuccess}
							</p>
						{/if}
					</form>
				{/if}
			</section>
		</div>
	{/if}
</div>
