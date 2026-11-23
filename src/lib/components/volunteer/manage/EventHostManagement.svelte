<script lang="ts">
	import IconUserPlus from '@lucide/svelte/icons/user-plus';
	import IconX from '@lucide/svelte/icons/x';
	import { toaster } from '../../../../routes/toaster-svelte';
	import ManageActionButton from './ManageActionButton.svelte';
	import ManageShiftHeader from './ManageShiftHeader.svelte';

	type HostProfileSubRecord = {
		user_id?: string | number | null;
		userId?: string | number | null;
		email?: string | null;
		email_address?: string | null;
		full_name?: string | null;
		name?: string | null;
	};

	type HostUserSubRecord = {
		id?: string | number | null;
		user_id?: string | number | null;
		email?: string | null;
	};

	type HostRecord = {
		user_id?: string | number | null;
		userId?: string | number | null;
		email?: string | null;
		contact_email?: string | null;
		full_name?: string | null;
		name?: string | null;
		profile?: HostProfileSubRecord | null;
		user?: HostUserSubRecord | null;
	};

	type HostEventRecord = {
		id?: string | number | null;
		host_user_id?: string | number | null;
		host_group_details?: {
			name?: string | null;
		} | null;
	};

	type CurrentUserRecord = {
		id?: string | number | null;
	};

	type HostListItem = {
		userId: string | null;
		label: string;
	};

	type Props = {
		event?: HostEventRecord;
		primaryHost?: HostRecord | null;
		groupOwners?: HostRecord[];
		hosts?: HostRecord[];
		currentUser?: CurrentUserRecord | null;
	};

	let {
		event = {},
		primaryHost = null,
		groupOwners = [],
		hosts = $bindable([]),
		currentUser = null
	}: Props = $props();

	let newHostEmail = $state('');
	let loading = $state(false);
	let removingUserId = $state<string | null>(null);

	const uid = $props.id();
	const sectionHeadingId = `${uid}-heading`;
	const emailInputId = `${uid}-email`;

	const normalizedOwners = $derived(Array.isArray(groupOwners) ? groupOwners : []);
	const normalizedHosts = $derived(Array.isArray(hosts) ? hosts : []);
	const currentUserId = $derived(currentUser?.id ? String(currentUser.id) : null);

	function getUserId(record: HostRecord | null | undefined): string | number | null {
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

	function getDisplayLabel(record: HostRecord | null | undefined): string {
		if (!record || typeof record !== 'object') return '';
		const email =
			record.email ??
			record.profile?.email ??
			record.user?.email ??
			record.profile?.email_address ??
			record.contact_email ??
			'';
		if (email) return String(email);
		const name =
			record.full_name ?? record.profile?.full_name ?? record.profile?.name ?? record.name ?? '';
		if (name) return String(name);
		const userId = getUserId(record);
		if (userId) return `User ${userId}`;
		return '';
	}

	function isGroupOwner(userId: string | null): boolean {
		if (!userId) return false;
		return normalizedOwners.some((owner) => {
			const ownerId = getUserId(owner);
			return Boolean(ownerId && String(ownerId) === String(userId));
		});
	}

	function canRemoveHostItem(hostItem: HostListItem): boolean {
		const userId = hostItem?.userId;
		if (!userId) return false;
		if (currentUserId && String(userId) === currentUserId) return false;
		return !isGroupOwner(userId);
	}

	function removeHostRecord(hostItem: HostListItem) {
		if (!hostItem?.userId) return;
		removeHostByUserId(hostItem.userId);
	}

	const primaryHostDetails = $derived.by<HostListItem | null>(() => {
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
	});

	const ownerItems = $derived.by<HostListItem[]>(() =>
		normalizedOwners
			.map((owner) => {
				const userId = getUserId(owner);
				let label = getDisplayLabel(owner);
				if (!label && userId) label = `User ${userId}`;
				return { userId: userId ? String(userId) : null, label };
			})
			.filter((owner) => Boolean(owner.label))
	);

	const hostItems = $derived.by<HostListItem[]>(() =>
		normalizedHosts
			.map((host) => {
				const userId = getUserId(host);
				let label = getDisplayLabel(host);
				if (!label && userId) label = `User ${userId}`;
				return { userId: userId ? String(userId) : null, label };
			})
			.filter((host) => Boolean(host.label))
	);

	const totalHostCount = $derived((primaryHostDetails ? 1 : 0) + hostItems.length);

	async function addHost(submitEvent?: SubmitEvent) {
		submitEvent?.preventDefault();
		const trimmedEmail = newHostEmail.trim();
		if (!trimmedEmail || !event?.id) return;
		loading = true;
		try {
			const res = await fetch('/api/v1/volunteer-event-hosts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					event_id: event.id,
					email: trimmedEmail
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
		} catch (err: unknown) {
			const description = err instanceof Error ? err.message : 'Failed to add host.';
			toaster.error({ title: 'Error adding host', description });
		} finally {
			loading = false;
		}
	}

	async function removeHostByUserId(userId: string) {
		if (!userId || !event?.id) return;
		removingUserId = userId;
		try {
			const res = await fetch('/api/v1/volunteer-event-hosts', {
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
		} catch (err: unknown) {
			const description = err instanceof Error ? err.message : 'Failed to remove host.';
			toaster.error({ title: 'Error removing host', description });
		} finally {
			removingUserId = null;
		}
	}
</script>

<section
	aria-labelledby={sectionHeadingId}
	class="border-tertiary-500 bg-surface-900 text-surface-50 flex w-full min-w-0 flex-col gap-6 border-t-4 p-4 sm:p-6"
>
	<header class="flex flex-col gap-1">
		<h2 id={sectionHeadingId} class="text-surface-50! m-0 text-left! text-xl font-black uppercase">
			Event Hosts
		</h2>
		<p class="text-surface-300 m-0 text-sm">Manage who can edit and manage this event.</p>
	</header>

	<div class="border-surface-800 flex min-w-0 flex-col border-2">
		<ManageShiftHeader
			headingLevel="h3"
			title="Assigned Hosts"
			badges={[{ label: `${totalHostCount} active`, tone: 'primary' }]}
		/>

		{#if primaryHostDetails || hostItems.length > 0}
			<ul class="divide-surface-800 m-0 list-none divide-y p-0">
				{#if primaryHostDetails}
					<li
						class="bg-surface-950 flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3"
					>
						<span class="text-surface-50 min-w-0 flex-1 truncate text-sm font-bold">
							{primaryHostDetails.label}
						</span>
						<span
							class="bg-primary-500 text-surface-950 shrink-0 px-2.5 py-1 text-xs font-black tracking-wide uppercase"
						>
							Primary Host
						</span>
					</li>
				{/if}

				{#each hostItems as host, index (`${host.userId ?? host.label}-${index}`)}
					<li
						class="bg-surface-950 flex min-h-11 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<span class="text-surface-50 min-w-0 flex-1 truncate text-sm font-bold">
							{host.label}
						</span>
						{#if canRemoveHostItem(host)}
							<div class="flex shrink-0">
								<ManageActionButton
									label="Remove"
									ariaLabel={`Remove ${host.label}`}
									icon={IconX}
									tone="error"
									variant="outlined"
									disabled={removingUserId === host.userId}
									fullWidth={true}
									class="sm:w-auto"
									onclick={() => removeHostRecord(host)}
								/>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-surface-300 bg-surface-950 m-0 px-4 py-4 text-sm">
				No event hosts assigned yet.
			</p>
		{/if}
	</div>

	<form
		class="border-surface-800 bg-surface-950 flex w-full min-w-0 flex-col gap-3 border-2 p-4"
		onsubmit={addHost}
	>
		<label
			for={emailInputId}
			class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
		>
			Add Host by Email
		</label>
		<div class="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
			<input
				id={emailInputId}
				type="email"
				required
				placeholder="new.host@example.com"
				bind:value={newHostEmail}
				disabled={loading}
				class="border-surface-500 bg-surface-950 text-surface-50 placeholder:text-surface-400 focus:border-primary-500 min-h-11 w-full min-w-0 flex-1 rounded-none border-2 px-3 py-2 text-sm font-medium focus:outline-none disabled:opacity-50"
			/>
			<ManageActionButton
				type="submit"
				icon={IconUserPlus}
				label={loading ? 'Adding…' : 'Add Host'}
				tone="primary"
				variant="filled"
				disabled={loading || !newHostEmail.trim()}
				fullWidth={true}
				class="sm:w-auto sm:px-5"
			/>
		</div>
	</form>

	{#if ownerItems.length > 0}
		<div class="border-surface-800 flex min-w-0 flex-col border-2">
			<ManageShiftHeader
				headingLevel="h3"
				title={`${event?.host_group_details?.name ?? 'Host Group'} Admins`}
				subtitle="Admins of the host group automatically can manage this event."
				badges={[
					{
						label: `${ownerItems.length} admin${ownerItems.length === 1 ? '' : 's'}`,
						tone: 'secondary'
					}
				]}
			/>
			<ul class="divide-surface-800 m-0 list-none divide-y p-0">
				{#each ownerItems as owner, index (`${owner.userId ?? owner.label}-${index}`)}
					<li class="bg-surface-950 flex min-h-11 items-center justify-between gap-2 px-4 py-3">
						<span class="text-surface-50 min-w-0 truncate text-sm font-bold">{owner.label}</span>
						<span
							class="border-surface-500 bg-surface-800 text-surface-50 shrink-0 border px-2 py-0.5 text-xs font-black tracking-wide uppercase"
						>
							Group Admin
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
