<script>
	import IconCheck from '@lucide/svelte/icons/check';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconHandshake from '@lucide/svelte/icons/handshake';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconX from '@lucide/svelte/icons/x';

	let {
		groupSlug = '',
		groupName = 'this organization',
		initialRequests = [],
		onRequestsChange = () => {}
	} = $props();

	let updatedRequestsById = $state({});
	let busyRequestId = $state('');
	let busyDecision = $state('');
	let actionError = $state('');
	let actionNotice = $state('');

	const requests = $derived(
		(Array.isArray(initialRequests) ? initialRequests : []).map(
			(entry) => updatedRequestsById[entry.id] ?? entry
		)
	);
	const pendingRequests = $derived(requests.filter((item) => item?.status === 'pending'));
	const reviewedRequests = $derived(
		requests
			.filter((item) => item?.status === 'approved' || item?.status === 'declined')
			.slice(0, 5)
	);

	function formatWhen(isoValue, timezone = 'UTC') {
		if (!isoValue) return 'Date TBD';
		const date = new Date(isoValue);
		if (Number.isNaN(date.getTime())) return 'Date TBD';
		try {
			return new Intl.DateTimeFormat(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short',
				timeZone: timezone || 'UTC'
			}).format(date);
		} catch {
			return date.toLocaleString();
		}
	}

	async function handleDecision(requestItem, action) {
		if (!requestItem?.id || !groupSlug || busyRequestId) return;
		busyRequestId = requestItem.id;
		busyDecision = action;
		actionError = '';
		actionNotice = '';

		try {
			const response = await fetch(
				`/api/groups/${encodeURIComponent(groupSlug)}/sponsorship-requests/${encodeURIComponent(requestItem.id)}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action })
				}
			);
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(result?.error || `Unable to ${action} sponsorship request.`);
			}

			const updated = result.data ?? {
				...requestItem,
				status: action === 'approve' ? 'approved' : 'declined',
				reviewedAt: new Date().toISOString()
			};
			updatedRequestsById = {
				...updatedRequestsById,
				[requestItem.id]: updated
			};
			onRequestsChange(requests.map((entry) => (entry.id === requestItem.id ? updated : entry)));

			actionNotice =
				action === 'approve'
					? `Approved "${requestItem.eventTitle}". ${groupName} is now linked on the public event page.`
					: `Declined "${requestItem.eventTitle}". The event remains under personal hosting.`;
		} catch (error) {
			actionError = error?.message || `Unable to ${action} sponsorship request.`;
		} finally {
			busyRequestId = '';
			busyDecision = '';
		}
	}
</script>

<section
	id="sponsorship-requests"
	aria-labelledby="sponsorship-requests-heading"
	class="bg-surface-900 border-y-2 {pendingRequests.length > 0
		? 'border-warning-500'
		: 'border-surface-800'}"
>
	<div class="flex flex-col justify-between gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
		<div class="flex items-start gap-3">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center {pendingRequests.length > 0
					? 'bg-warning-500 text-surface-950'
					: 'bg-surface-800 text-surface-200'}"
			>
				<IconHandshake class="h-5 w-5" />
			</div>
			<div class="min-w-0 space-y-0.5">
				<div class="flex flex-wrap items-center gap-2">
					<h2
						id="sponsorship-requests-heading"
						class="text-surface-50! text-base font-black uppercase"
					>
						Event Sponsorship Requests
					</h2>
					{#if pendingRequests.length > 0}
						<span
							class="bg-warning-500 text-surface-950 rounded-none px-2 py-0.5 text-xs font-black uppercase tabular-nums"
						>
							{pendingRequests.length} Pending
						</span>
					{:else}
						<span
							class="bg-surface-800 text-surface-300 rounded-none px-2 py-0.5 text-xs font-bold uppercase tabular-nums"
						>
							0 Pending
						</span>
					{/if}
				</div>
				<p class="text-surface-300 text-xs leading-relaxed">
					{#if pendingRequests.length > 0}
						Approve legitimate partner events to link {groupName} on their public page in one click, or
						decline unrelated requests.
					{:else}
						Requests from community ride and volunteer organizers appear here for one-click review.
					{/if}
				</p>
			</div>
		</div>
	</div>

	{#if actionNotice}
		<div
			class="border-success-500 bg-surface-950 text-surface-50 border-t border-l-4 px-4 py-3 text-xs"
		>
			{actionNotice}
		</div>
	{/if}

	{#if actionError}
		<div
			class="border-error-500 bg-surface-950 text-error-400 border-t border-l-4 px-4 py-3 text-xs"
		>
			{actionError}
		</div>
	{/if}

	{#if pendingRequests.length > 0}
		<div class="border-surface-800 divide-surface-800 divide-y border-t">
			{#each pendingRequests as req (req.id)}
				{@const isBusy = busyRequestId === req.id}
				<div
					class="bg-surface-950 flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between"
				>
					<div class="min-w-0 flex-1 space-y-2">
						<div class="flex flex-wrap items-center gap-2">
							<span
								class="rounded-none px-2 py-0.5 text-[0.68rem] font-black tracking-wider uppercase {req.eventType ===
								'ride'
									? 'bg-primary-500 text-surface-950'
									: 'bg-tertiary-500 text-surface-950'}"
							>
								{req.eventType === 'ride' ? 'Ride' : 'Volunteer'}
							</span>
							{#if req.eventPublicPath}
								<a
									href={req.eventPublicPath}
									target="_blank"
									rel="noreferrer"
									class="text-surface-50 hover:text-primary-400 inline-flex items-center gap-1.5 text-sm font-bold underline-offset-2 hover:underline"
								>
									<span>{req.eventTitle}</span>
									<IconExternalLink class="h-3.5 w-3.5 shrink-0" />
								</a>
							{:else}
								<span class="text-surface-50 text-sm font-bold">{req.eventTitle}</span>
							{/if}
						</div>

						<p class="text-surface-300 text-xs">
							<strong>When:</strong>
							{formatWhen(req.eventStartsAt, req.eventTimezone)} ·
							<strong>Requested by:</strong>
							{req.requesterName}
						</p>

						{#if req.message}
							<div
								class="border-secondary-500 bg-surface-900 text-surface-200 border-l-4 px-3 py-2 text-xs"
							>
								"{req.message}"
							</div>
						{/if}
					</div>

					<div class="flex shrink-0 flex-wrap items-center gap-2">
						<button
							type="button"
							class="bg-success-500 text-surface-950 hover:bg-primary-500 inline-flex items-center gap-1.5 rounded-none px-4 py-2 text-xs font-black tracking-wide uppercase transition-colors disabled:opacity-60"
							disabled={Boolean(busyRequestId)}
							onclick={() => handleDecision(req, 'approve')}
						>
							{#if isBusy && busyDecision === 'approve'}
								<IconLoader class="h-3.5 w-3.5 motion-safe:animate-spin" />
								<span>Approving…</span>
							{:else}
								<IconCheck class="h-3.5 w-3.5" />
								<span>Approve &amp; link event</span>
							{/if}
						</button>
						<button
							type="button"
							class="border-surface-600 text-surface-200 hover:border-error-500 hover:text-error-400 inline-flex items-center gap-1.5 rounded-none border-2 px-4 py-2 text-xs font-bold tracking-wide uppercase transition-colors disabled:opacity-60"
							disabled={Boolean(busyRequestId)}
							onclick={() => handleDecision(req, 'decline')}
						>
							{#if isBusy && busyDecision === 'decline'}
								<IconLoader class="h-3.5 w-3.5 motion-safe:animate-spin" />
								<span>Declining…</span>
							{:else}
								<IconX class="h-3.5 w-3.5" />
								<span>Decline</span>
							{/if}
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if reviewedRequests.length > 0}
		<div class="border-surface-800 bg-surface-950 border-t px-4 py-3 sm:px-5">
			<p class="text-surface-400 mb-2 text-[0.68rem] font-bold tracking-wider uppercase">
				Recent Decisions
			</p>
			<div class="divide-surface-800 divide-y">
				{#each reviewedRequests as item (item.id)}
					<div class="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
						<div class="flex flex-wrap items-center gap-2">
							<span
								class="rounded-none px-1.5 py-0.5 text-[0.65rem] font-black uppercase {item.status ===
								'approved'
									? 'bg-success-500 text-surface-950'
									: 'bg-error-500 text-surface-950'}"
							>
								{item.status}
							</span>
							{#if item.eventPublicPath}
								<a
									href={item.eventPublicPath}
									target="_blank"
									rel="noreferrer"
									class="text-surface-100 hover:text-primary-400 font-semibold hover:underline"
								>
									{item.eventTitle}
								</a>
							{:else}
								<span class="text-surface-100 font-semibold">{item.eventTitle}</span>
							{/if}
							<span class="text-surface-400">· {item.requesterName}</span>
						</div>
						<span class="text-surface-400 tabular-nums">
							{formatWhen(item.reviewedAt || item.updatedAt, item.eventTimezone)}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>
