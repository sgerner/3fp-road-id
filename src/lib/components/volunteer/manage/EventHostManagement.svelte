<script>
	import { toaster } from '../../../../routes/toaster-svelte';

	export let event;
	export let primaryHost;
	export let groupOwners;
	export let hosts;
	export let currentUser;
	let newHostEmail = '';
	let loading = false;
	$: normalizedOwners = Array.isArray(groupOwners) ? groupOwners : [];
	$: normalizedHosts = Array.isArray(hosts) ? hosts : [];
	$: currentUserId = currentUser?.id ? String(currentUser.id) : null;

	function getUserId(record) {
		if (!record || typeof record !== 'object') return null;
		return (
			record.user_id ??
			record.userId ??
			record.profile?.user_id ??
			record.profile?.userId ??
			record.user?.id ??
			record.user?.user_id ??
			null
		);
	}
	function getDisplayLabel(record) {
		if (!record || typeof record !== 'object') return '';
		const email =
			record.email ??
			record.profile?.email ??
			record.user?.email ??
			record.profile?.email_address ??
			record.contact_email ??
			'';
		if (email) return email;
		const name =
			record.full_name ?? record.profile?.full_name ?? record.profile?.name ?? record.name ?? '';
		if (name) return name;
		const userId = getUserId(record);
		if (userId) return `User ${userId}`;
		return '';
	}
	function isGroupOwner(userId) {
		if (!userId) return false;
		return normalizedOwners.some((owner) => {
			const ownerId = getUserId(owner);
			return ownerId && String(ownerId) === String(userId);
		});
	}
	function canRemoveHostItem(hostItem) {
		const userId = hostItem?.userId;
		if (!userId) return false;
		if (currentUserId && String(userId) === currentUserId) return false;
		return !isGroupOwner(userId);
	}
	function removeHostRecord(hostItem) {
		if (!hostItem?.userId) return;
		removeHostByUserId(hostItem.userId);
	}
	$: primaryHostDetails = (() => {
		const fallbackUserId = event?.host_user_id ?? null;
		const source = primaryHost ?? null;
		const userIdRaw = getUserId(source) ?? fallbackUserId ?? null;
		if (!source && !userIdRaw) return null;
		const userId = userIdRaw ? String(userIdRaw) : null;
		let label = getDisplayLabel(source);
		if (!label && fallbackUserId) label = String(fallbackUserId);
		if (!label && userId) label = `User ${userId}`;
		if (!label) return null;
		return { userId, label };
	})();
	$: ownerItems = normalizedOwners
		.map((owner) => {
			const userId = getUserId(owner);
			let label = getDisplayLabel(owner);
			if (!label && userId) label = `User ${userId}`;
			return { userId: userId ? String(userId) : null, label };
		})
		.filter((owner) => owner.label);
	$: hostItems = normalizedHosts
		.map((host) => {
			const userId = getUserId(host);
			let label = getDisplayLabel(host);
			if (!label && userId) label = `User ${userId}`;
			return { userId: userId ? String(userId) : null, label };
		})
		.filter((host) => host.label);

	async function addHost() {
		if (!newHostEmail || !event?.id) return;
		loading = true;
		try {
			const res = await fetch(`/api/v1/volunteer-event-hosts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					event_id: event.id,
					email: newHostEmail
				})
			});
			if (!res.ok) {
				const { error } = await res.json();
				throw new Error(error || 'Failed to add host.');
			}
			const { data: newHost } = await res.json();
			hosts = [...normalizedHosts, newHost];
			newHostEmail = '';
			toaster.success({ title: 'Host added successfully.' });
		} catch (err) {
			toaster.error({ title: 'Error adding host', message: err.message });
		} finally {
			loading = false;
		}
	}

	async function removeHostByUserId(userId) {
		if (!userId || !event?.id) return;
		try {
			const res = await fetch(`/api/v1/volunteer-event-hosts`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					event_id: event.id,
					user_id: userId
				})
			});
			if (!res.ok) {
				const { error } = await res.json();
				throw new Error(error || 'Failed to remove host.');
			}
			hosts = normalizedHosts.filter((h) => String(getUserId(h)) !== String(userId));
			toaster.success({ title: 'Host removed successfully.' });
		} catch (err) {
			toaster.error({ title: 'Error removing host', message: err.message });
		}
	}
</script>

<section
	class="card border-surface-700 bg-surface-900/70 rounded-2xl border p-6 shadow-xl shadow-black/30"
>
	<h2 class="!text-left text-xl font-semibold text-white">Event Hosts</h2>
	<p class="text-surface-300 text-sm">Manage who can edit and manage this event.</p>

	<div class="mt-4">
		<ul class="divide-surface-700/50 border-surface-700/50 mt-2 divide-y rounded-md border">
			{#if primaryHostDetails}
				<li class="flex items-center justify-between p-2">
					<span class="truncate text-sm">{primaryHostDetails.label}</span>
				</li>
			{/if}
			{#if hostItems.length > 0}
				{#each hostItems as host}
					<li class="flex items-center justify-between p-2">
						<span class="truncate text-sm">{host.label}</span>
						{#if canRemoveHostItem(host)}
							<button
								class="btn btn-sm preset-outlined-error-500"
								on:click={() => removeHostRecord(host)}
							>
								Remove
							</button>
						{/if}
					</li>
				{/each}
			{/if}
			<div class="mt-2 flex gap-2">
				<input
					type="email"
					placeholder="new.host@example.com"
					bind:value={newHostEmail}
					class="input bg-surface-800/50 w-full"
					disabled={loading}
				/>
				<button
					class="btn preset-filled-primary-500"
					on:click={addHost}
					disabled={loading || !newHostEmail}
				>
					{#if loading}
						<span>Adding...</span>
					{:else}
						<span>Add Host</span>
					{/if}
				</button>
			</div>
		</ul>
	</div>
	{#if ownerItems.length > 0}
		<div class="mt-4">
			<h3 class="!text-left font-medium text-white">
				{event.host_group_details?.name ?? 'Host Group'} Admins
			</h3>
			<p class="text-surface-400 text-sm">
				Admins of the host group automatically can manage this event.
			</p>
			<ul class="divide-surface-700/50 border-surface-700/50 mt-2 divide-y rounded-md border">
				{#each ownerItems as owner}
					<li class="flex items-center justify-between p-2">
						<span class="truncate text-sm">{owner.label}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
