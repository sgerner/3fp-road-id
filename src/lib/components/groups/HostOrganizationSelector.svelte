<script>
	import IconCheck from '@lucide/svelte/icons/check';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconX from '@lucide/svelte/icons/x';
	import {
		HOST_GROUP_STATUS,
		filterHostGroups,
		formatHostGroupLocation,
		getHostGroupBadgeMeta,
		getHostGroupStatus
	} from '#lib/groups/hostGroupDirectory';

	let {
		hostGroups = [],
		hostGroupId = '',
		initialHostGroupId = '',
		sponsorshipGroupId = '',
		sponsorshipMessage = '',
		activeSponsorshipRequest = null,
		immediateSponsorshipMode = false,
		eventType = 'ride',
		eventId = '',
		label = 'Host organization (optional)',
		helperText = 'Leave blank to host independently.',
		inputId = 'host-organization-search',
		onHostGroupChange = () => {},
		onSponsorshipChange = () => {},
		onActiveSponsorshipRequestChange = () => {},
		onGroupClaimed = () => {}
	} = $props();

	let claimedIdsOverride = $state({});
	let externalIdsOverride = $state({});
	let searchQuery = $state('');
	let isOpen = $state(false);
	let highlightedIndex = $state(0);
	let pendingClaimGroupId = $state('');
	let claimInFlight = $state(false);
	let claimError = $state('');
	let claimSuccessMessage = $state('');
	let sponsorshipSendInFlight = $state(false);
	let sponsorshipCancelInFlight = $state(false);
	let sponsorshipActionError = $state('');
	let sponsorshipActionSuccess = $state('');
	let containerEl = $state(null);

	const listboxId = $derived(`${inputId}-listbox`);

	const directoryGroups = $derived(
		(Array.isArray(hostGroups) ? hostGroups : []).map((group) => {
			const id = String(group?.id ?? '');
			if (claimedIdsOverride[id]) {
				return {
					...group,
					id,
					status: HOST_GROUP_STATUS.MANAGED,
					isClaimed: true,
					canManage: true
				};
			}
			if (externalIdsOverride[id]) {
				return {
					...group,
					id,
					status: HOST_GROUP_STATUS.EXTERNAL,
					isClaimed: true,
					canManage: false
				};
			}
			return {
				...group,
				id,
				status: getHostGroupStatus(group)
			};
		})
	);

	const filteredResult = $derived(filterHostGroups(directoryGroups, searchQuery, { limit: 60 }));
	const visibleGroups = $derived(filteredResult.items);

	const attachedGroup = $derived(
		hostGroupId
			? (directoryGroups.find((group) => String(group.id) === String(hostGroupId)) ?? null)
			: null
	);

	const pendingClaimGroup = $derived(
		pendingClaimGroupId
			? (directoryGroups.find((group) => String(group.id) === String(pendingClaimGroupId)) ?? null)
			: null
	);

	const stagedSponsorshipGroup = $derived(
		sponsorshipGroupId
			? (directoryGroups.find((group) => String(group.id) === String(sponsorshipGroupId)) ?? null)
			: null
	);

	const isPreservedCoHostAffiliation = $derived(
		Boolean(
			attachedGroup &&
			initialHostGroupId &&
			String(attachedGroup.id) === String(initialHostGroupId) &&
			getHostGroupStatus(attachedGroup) !== HOST_GROUP_STATUS.MANAGED
		)
	);

	const placeholderText = $derived(
		directoryGroups.length > 0
			? `Search ${directoryGroups.length.toLocaleString()} organizations by name or city…`
			: 'No organizations available'
	);

	function handleWindowClick(event) {
		if (!isOpen || !containerEl) return;
		if (!containerEl.contains(event.target)) {
			isOpen = false;
		}
	}

	function openDropdown() {
		if (!directoryGroups.length) return;
		isOpen = true;
		highlightedIndex = 0;
	}

	function handleSearchInput(event) {
		searchQuery = event.currentTarget.value;
		isOpen = true;
		highlightedIndex = 0;
		claimError = '';
		sponsorshipActionError = '';
	}

	function handleKeydown(event) {
		if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
			event.preventDefault();
			openDropdown();
			return;
		}
		if (!isOpen) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (visibleGroups.length > 0) {
				highlightedIndex = (highlightedIndex + 1) % visibleGroups.length;
			}
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (visibleGroups.length > 0) {
				highlightedIndex = (highlightedIndex - 1 + visibleGroups.length) % visibleGroups.length;
			}
		} else if (event.key === 'Enter') {
			if (visibleGroups[highlightedIndex]) {
				event.preventDefault();
				selectOrganization(visibleGroups[highlightedIndex]);
			}
		} else if (event.key === 'Escape') {
			event.preventDefault();
			isOpen = false;
		}
	}

	function selectOrganization(group) {
		if (!group?.id) return;
		isOpen = false;
		searchQuery = '';
		claimError = '';
		claimSuccessMessage = '';
		sponsorshipActionError = '';
		sponsorshipActionSuccess = '';

		const status = getHostGroupStatus(group);
		const isUnchangedExisting =
			initialHostGroupId && String(group.id) === String(initialHostGroupId);

		if (status === HOST_GROUP_STATUS.MANAGED || isUnchangedExisting) {
			pendingClaimGroupId = '';
			if (sponsorshipGroupId) {
				onSponsorshipChange({ groupId: '', message: '' });
			}
			onHostGroupChange(String(group.id));
			return;
		}

		if (status === HOST_GROUP_STATUS.UNCLAIMED) {
			pendingClaimGroupId = String(group.id);
			if (sponsorshipGroupId) {
				onSponsorshipChange({ groupId: '', message: '' });
			}
			if (hostGroupId) {
				onHostGroupChange('');
			}
			return;
		}

		// External claimed organization -> personal hosting + sponsorship request
		pendingClaimGroupId = '';
		if (hostGroupId) {
			onHostGroupChange('');
		}
		onSponsorshipChange({
			groupId: String(group.id),
			message: sponsorshipMessage
		});
	}

	function choosePersonalHosting() {
		pendingClaimGroupId = '';
		searchQuery = '';
		claimError = '';
		claimSuccessMessage = '';
		sponsorshipActionError = '';
		sponsorshipActionSuccess = '';
		if (sponsorshipGroupId) {
			onSponsorshipChange({ groupId: '', message: '' });
		}
		if (hostGroupId) {
			onHostGroupChange('');
		}
	}

	async function claimSelectedGroup() {
		const group = pendingClaimGroup;
		if (!group?.slug || claimInFlight) return;

		claimInFlight = true;
		claimError = '';
		claimSuccessMessage = '';

		try {
			const response = await fetch(`/api/groups/${encodeURIComponent(group.slug)}/claim`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const result = await response.json().catch(() => ({}));

			if (response.status === 409) {
				externalIdsOverride = { ...externalIdsOverride, [group.id]: true };
				pendingClaimGroupId = '';
				onSponsorshipChange({
					groupId: String(group.id),
					message: sponsorshipMessage
				});
				sponsorshipActionError =
					'This organization was already claimed. You can request sponsorship from its managers below.';
				return;
			}

			if (!response.ok) {
				throw new Error(result?.error || 'Unable to claim organization right now.');
			}

			claimedIdsOverride = { ...claimedIdsOverride, [group.id]: true };
			pendingClaimGroupId = '';
			claimSuccessMessage = `You now manage ${group.name}. It is attached to this event.`;
			onGroupClaimed({
				...group,
				status: HOST_GROUP_STATUS.MANAGED,
				isClaimed: true,
				canManage: true
			});
			onHostGroupChange(String(group.id));
		} catch (error) {
			claimError = error?.message || 'Unable to claim organization.';
		} finally {
			claimInFlight = false;
		}
	}

	function handleMessageInput(event) {
		const nextMessage = event.currentTarget.value;
		onSponsorshipChange({
			groupId: sponsorshipGroupId,
			message: nextMessage
		});
	}

	async function submitImmediateSponsorshipRequest() {
		const group = stagedSponsorshipGroup;
		if (!group?.id || !eventId || sponsorshipSendInFlight) return;

		sponsorshipSendInFlight = true;
		sponsorshipActionError = '';
		sponsorshipActionSuccess = '';

		try {
			const response = await fetch('/api/event-sponsorship-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					eventType,
					eventId,
					groupId: group.id,
					message: sponsorshipMessage
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(result?.error || 'Unable to send sponsorship request.');
			}

			onActiveSponsorshipRequestChange(result.data ?? null);
			onSponsorshipChange({ groupId: '', message: '' });
			sponsorshipActionSuccess = `Sponsorship request sent to ${group.name}. This event stays under personal hosting until approved.`;
		} catch (error) {
			sponsorshipActionError = error?.message || 'Unable to send sponsorship request.';
		} finally {
			sponsorshipSendInFlight = false;
		}
	}

	async function cancelActiveSponsorship() {
		if (!activeSponsorshipRequest?.id || sponsorshipCancelInFlight) return;

		sponsorshipCancelInFlight = true;
		sponsorshipActionError = '';
		sponsorshipActionSuccess = '';

		try {
			const response = await fetch('/api/event-sponsorship-requests', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ requestId: activeSponsorshipRequest.id })
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(result?.error || 'Unable to cancel sponsorship request.');
			}

			onActiveSponsorshipRequestChange(null);
			sponsorshipActionSuccess = 'Pending sponsorship request cancelled.';
		} catch (error) {
			sponsorshipActionError = error?.message || 'Unable to cancel sponsorship request.';
		} finally {
			sponsorshipCancelInFlight = false;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="host-org-selector flex flex-col gap-2" bind:this={containerEl}>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<label class="text-surface-100 text-sm font-bold" for={inputId}>
			{label}
		</label>
		<div class="flex flex-wrap items-center gap-1.5 text-[0.68rem] font-bold uppercase">
			<span class="bg-success-500 text-surface-950 px-1.5 py-0.5">Managed</span>
			<span class="bg-warning-500 text-surface-950 px-1.5 py-0.5">Unclaimed</span>
			<span class="bg-secondary-500 text-surface-50 px-1.5 py-0.5">Requires approval</span>
		</div>
	</div>

	<div class="relative">
		<div
			class="border-surface-600 bg-surface-950 focus-within:border-primary-500 flex items-stretch border-2"
		>
			<div class="text-surface-400 flex items-center pl-3">
				<IconSearch class="h-4 w-4 shrink-0" />
			</div>
			<input
				id={inputId}
				type="text"
				role="combobox"
				autocomplete="off"
				aria-expanded={isOpen}
				aria-controls={listboxId}
				aria-autocomplete="list"
				aria-activedescendant={isOpen && visibleGroups[highlightedIndex]
					? `${inputId}-option-${visibleGroups[highlightedIndex].id}`
					: undefined}
				class="text-surface-50 placeholder:text-surface-400 w-full rounded-none border-0 bg-transparent px-3 py-2.5 text-sm focus:ring-0 focus:outline-none"
				placeholder={placeholderText}
				value={searchQuery}
				disabled={!directoryGroups.length}
				onfocus={openDropdown}
				onclick={openDropdown}
				oninput={handleSearchInput}
				onkeydown={handleKeydown}
			/>
			{#if searchQuery}
				<button
					type="button"
					class="text-surface-300 hover:text-surface-50 flex items-center px-2.5"
					aria-label="Clear search query"
					onclick={() => {
						searchQuery = '';
						openDropdown();
					}}
				>
					<IconX class="h-4 w-4" />
				</button>
			{/if}
			<button
				type="button"
				class="border-surface-700 text-surface-200 hover:bg-surface-800 flex items-center border-l px-3"
				aria-label="Toggle organization directory"
				disabled={!directoryGroups.length}
				onclick={() => {
					if (isOpen) isOpen = false;
					else openDropdown();
				}}
			>
				<IconChevronDown class="h-4 w-4" />
			</button>
		</div>

		{#if isOpen}
			<div
				id={listboxId}
				role="listbox"
				class="border-primary-500 bg-surface-950 absolute right-0 left-0 z-50 mt-1 max-h-80 overflow-y-auto border-2"
			>
				{#if visibleGroups.length === 0}
					<div class="text-surface-300 px-4 py-3 text-sm">
						No organizations match "{searchQuery}". Clear your search or leave blank for personal
						hosting.
					</div>
				{:else}
					{#each visibleGroups as group, index (group.id)}
						{@const status = getHostGroupStatus(group)}
						{@const badge = getHostGroupBadgeMeta(status)}
						{@const location = formatHostGroupLocation(group)}
						{@const isSelected =
							String(hostGroupId) === String(group.id) ||
							String(pendingClaimGroupId) === String(group.id) ||
							String(sponsorshipGroupId) === String(group.id)}
						<button
							id="{inputId}-option-{group.id}"
							type="button"
							role="option"
							aria-selected={isSelected}
							class="border-surface-800 flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left transition-colors {index ===
							highlightedIndex
								? 'bg-surface-800 text-surface-50'
								: 'bg-surface-950 text-surface-100 hover:bg-surface-900'}"
							onmouseenter={() => (highlightedIndex = index)}
							onclick={() => selectOrganization(group)}
						>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="truncate text-sm font-bold">{group.name}</span>
									{#if isSelected}
										<IconCheck class="text-primary-500 h-4 w-4 shrink-0" />
									{/if}
								</div>
								{#if location}
									<p class="text-surface-400 truncate text-xs">{location}</p>
								{/if}
							</div>
							<div class="flex shrink-0 flex-col items-end gap-0.5">
								<span
									class="rounded-none px-2 py-0.5 text-[0.68rem] font-black tracking-wider uppercase {badge.badgeClass}"
								>
									{badge.label}
								</span>
								<span class="text-surface-400 text-[0.68rem]">{badge.actionHint}</span>
							</div>
						</button>
					{/each}
					<div
						class="border-surface-800 bg-surface-900 text-surface-300 flex items-center justify-between border-t px-3 py-2 text-xs"
					>
						<span>
							Showing {visibleGroups.length} of {filteredResult.totalMatches.toLocaleString()} matching
							({filteredResult.totalGroups.toLocaleString()} total)
						</span>
						{#if filteredResult.totalMatches > visibleGroups.length}
							<span class="text-primary-400 font-semibold">Type to narrow</span>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if claimSuccessMessage}
		<div class="border-success-500 bg-surface-900 text-surface-50 border-l-4 px-3 py-2.5 text-xs">
			{claimSuccessMessage}
		</div>
	{/if}

	{#if sponsorshipActionSuccess}
		<div class="border-success-500 bg-surface-900 text-surface-50 border-l-4 px-3 py-2.5 text-xs">
			{sponsorshipActionSuccess}
		</div>
	{/if}

	{#if attachedGroup}
		<div
			class="bg-surface-900 flex flex-col justify-between gap-3 border-l-4 p-3 sm:flex-row sm:items-center {isPreservedCoHostAffiliation
				? 'border-primary-500'
				: 'border-success-500'}"
		>
			<div class="min-w-0 space-y-1">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="rounded-none px-2 py-0.5 text-[0.68rem] font-black tracking-wider uppercase {isPreservedCoHostAffiliation
							? 'bg-primary-500 text-surface-950'
							: 'bg-success-500 text-surface-950'}"
					>
						{isPreservedCoHostAffiliation ? 'Affiliated' : 'Managed'}
					</span>
					<span class="text-surface-50 text-sm font-bold">{attachedGroup.name}</span>
					{#if formatHostGroupLocation(attachedGroup)}
						<span class="text-surface-400 text-xs">· {formatHostGroupLocation(attachedGroup)}</span>
					{/if}
				</div>
				<p class="text-surface-300 text-xs">
					{#if isPreservedCoHostAffiliation}
						Approved host organization. Saving your edits preserves this club affiliation.
					{:else}
						This event will publish directly under {attachedGroup.name}.
					{/if}
				</p>
			</div>
			<button
				type="button"
				class="border-surface-600 text-surface-200 hover:border-primary-500 hover:text-primary-500 shrink-0 rounded-none border px-3 py-1.5 text-xs font-bold uppercase transition-colors"
				onclick={choosePersonalHosting}
			>
				Host independently
			</button>
		</div>
	{:else if pendingClaimGroup}
		<div class="border-warning-500 bg-surface-900 space-y-3 border-t-4 p-4">
			<div class="space-y-1">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="bg-warning-500 text-surface-950 rounded-none px-2 py-0.5 text-[0.68rem] font-black tracking-wider uppercase"
					>
						Unclaimed
					</span>
					<span class="text-surface-50 text-sm font-bold">{pendingClaimGroup.name}</span>
				</div>
				<p class="text-surface-200 text-xs leading-relaxed">
					<strong>{pendingClaimGroup.name}</strong> has not been claimed yet. If you help run this organization,
					claim it now to attach it immediately without losing your form progress — or continue with independent
					hosting.
				</p>
			</div>

			{#if claimError}
				<div class="border-error-500 bg-surface-950 text-error-400 border-l-4 px-3 py-2 text-xs">
					{claimError}
				</div>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="bg-warning-500 text-surface-950 hover:bg-surface-50 inline-flex items-center gap-2 rounded-none px-4 py-2 text-xs font-black tracking-wide uppercase transition-colors disabled:opacity-60"
					disabled={claimInFlight}
					onclick={claimSelectedGroup}
				>
					{#if claimInFlight}
						<IconLoader class="h-3.5 w-3.5 motion-safe:animate-spin" />
						<span>Claiming…</span>
					{:else}
						<span>Claim {pendingClaimGroup.name} &amp; attach</span>
					{/if}
				</button>
				<button
					type="button"
					class="border-surface-600 text-surface-100 hover:border-surface-300 rounded-none border-2 px-4 py-2 text-xs font-bold tracking-wide uppercase transition-colors"
					disabled={claimInFlight}
					onclick={choosePersonalHosting}
				>
					Host independently
				</button>
			</div>
		</div>
	{:else if stagedSponsorshipGroup}
		<div class="border-secondary-500 bg-surface-900 space-y-3 border-t-4 p-4">
			<div class="space-y-1">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="bg-secondary-500 text-surface-50 rounded-none px-2 py-0.5 text-[0.68rem] font-black tracking-wider uppercase"
					>
						Requires approval
					</span>
					<span class="text-surface-50 text-sm font-bold">{stagedSponsorshipGroup.name}</span>
				</div>
				<p class="text-surface-200 text-xs leading-relaxed">
					Your event will save under <strong>personal hosting</strong> right now and send a
					sponsorship request to <strong>{stagedSponsorshipGroup.name}</strong>'s managers. Their
					organization stays hidden on public pages until a manager approves.
				</p>
			</div>

			<div class="flex flex-col gap-1">
				<label class="text-surface-200 text-xs font-semibold" for="{inputId}-sponsorship-note">
					Note for {stagedSponsorshipGroup.name} managers (optional)
				</label>
				<textarea
					id="{inputId}-sponsorship-note"
					rows="2"
					maxlength="1000"
					class="border-surface-600 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-secondary-500 w-full rounded-none border-2 px-3 py-2 text-xs focus:ring-0 focus:outline-none"
					placeholder="Share route details, expected turnout, or how your club can collaborate…"
					value={sponsorshipMessage}
					oninput={handleMessageInput}></textarea>
			</div>

			{#if sponsorshipActionError}
				<div class="border-error-500 bg-surface-950 text-error-400 border-l-4 px-3 py-2 text-xs">
					{sponsorshipActionError}
				</div>
			{/if}

			<div class="flex flex-wrap items-center justify-between gap-2">
				{#if immediateSponsorshipMode}
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							class="bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:text-surface-950 inline-flex items-center gap-2 rounded-none px-4 py-2 text-xs font-black tracking-wide uppercase transition-colors disabled:opacity-60"
							disabled={sponsorshipSendInFlight}
							onclick={submitImmediateSponsorshipRequest}
						>
							{#if sponsorshipSendInFlight}
								<IconLoader class="h-3.5 w-3.5 motion-safe:animate-spin" />
								<span>Sending request…</span>
							{:else}
								<span>Send sponsorship request</span>
							{/if}
						</button>
						<button
							type="button"
							class="border-surface-600 text-surface-100 hover:border-surface-300 rounded-none border-2 px-4 py-2 text-xs font-bold tracking-wide uppercase transition-colors"
							disabled={sponsorshipSendInFlight}
							onclick={choosePersonalHosting}
						>
							Host independently
						</button>
					</div>
				{:else}
					<span class="text-surface-300 text-xs">
						Sponsorship request will be queued automatically when you save this event.
					</span>
					<button
						type="button"
						class="border-surface-600 text-surface-100 hover:border-surface-300 rounded-none border px-3 py-1.5 text-xs font-bold uppercase transition-colors"
						onclick={choosePersonalHosting}
					>
						Host independently
					</button>
				{/if}
			</div>
		</div>
	{:else if activeSponsorshipRequest?.status === 'pending'}
		<div
			class="border-secondary-500 bg-surface-900 flex flex-col justify-between gap-3 border-l-4 p-4 sm:flex-row sm:items-center"
		>
			<div class="min-w-0 space-y-1">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="bg-secondary-500 text-surface-50 rounded-none px-2 py-0.5 text-[0.68rem] font-black tracking-wider uppercase"
					>
						Pending approval
					</span>
					<span class="text-surface-50 text-sm font-bold">
						{activeSponsorshipRequest.groupName || 'Requested organization'}
					</span>
				</div>
				<p class="text-surface-300 text-xs">
					Currently published under personal hosting while {activeSponsorshipRequest.groupName ||
						'the organization'} reviews your sponsorship request.
				</p>
			</div>
			<button
				type="button"
				class="border-surface-600 text-surface-200 hover:border-error-500 hover:text-error-400 inline-flex shrink-0 items-center gap-1.5 rounded-none border px-3 py-1.5 text-xs font-bold uppercase transition-colors disabled:opacity-60"
				disabled={sponsorshipCancelInFlight}
				onclick={cancelActiveSponsorship}
			>
				{#if sponsorshipCancelInFlight}
					<IconLoader class="h-3.5 w-3.5 motion-safe:animate-spin" />
					<span>Cancelling…</span>
				{:else}
					<span>Cancel request</span>
				{/if}
			</button>
		</div>
	{:else if activeSponsorshipRequest?.status === 'declined'}
		<div class="border-surface-600 bg-surface-900 border-l-4 p-3 text-xs">
			<p class="text-surface-200">
				<strong>{activeSponsorshipRequest.groupName || 'Organization'}</strong> declined the previous
				sponsorship request. Your event remains under personal hosting.
			</p>
			{#if activeSponsorshipRequest.decisionNote}
				<p class="text-surface-400 mt-1">Note: {activeSponsorshipRequest.decisionNote}</p>
			{/if}
		</div>
	{:else}
		<p class="text-surface-400 text-xs">{helperText}</p>
	{/if}
</div>
