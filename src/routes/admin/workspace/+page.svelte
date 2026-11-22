<script>
	import { enhance } from '$app/forms';
	import IconArrowLeft from '@lucide/svelte/icons/arrow-left';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconUserPlus from '@lucide/svelte/icons/user-plus';
	import IconUser from '@lucide/svelte/icons/user';
	import IconLock from '@lucide/svelte/icons/lock';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconChevronRight from '@lucide/svelte/icons/chevron-right';
	import IconTrash2 from '@lucide/svelte/icons/trash';
	import IconShieldAlert from '@lucide/svelte/icons/shield-alert';
	import IconLogOut from '@lucide/svelte/icons/log-out';
	import IconCheck from '@lucide/svelte/icons/check';
	import AdminHero from '#lib/components/admin/AdminHero.svelte';
	import AdminNotice from '#lib/components/admin/AdminNotice.svelte';

	let { data, form } = $props();

	let selectedUserId = $state(null);
	let showCreateForm = $state(false);
	let activeTab = $state('profile'); // 'profile', 'security', 'aliases'
	let createPassword = $state('');
	let resetPassword = $state('');

	// Google's user list is eventually consistent: a reload right after a write
	// often misses it. Keep confirmed changes from this session layered on top.
	let createdUsers = $state([]);
	let deletedUserIds = $state([]);
	let aliasChanges = $state([]);

	const users = $derived.by(() => {
		const loadedIds = new Set(data.users.map((u) => u.id));
		const pending = createdUsers.filter(
			(u) =>
				!loadedIds.has(u.id) &&
				(!data.search ||
					`${u.primaryEmail} ${displayName(u)}`.toLowerCase().includes(data.search.toLowerCase()))
		);
		return [...data.users, ...pending]
			.filter((u) => !deletedUserIds.includes(u.id))
			.map((u) => ({ ...u, aliases: applyAliasChanges(u) }))
			.sort((a, b) => String(a.primaryEmail).localeCompare(String(b.primaryEmail)));
	});

	// Reactively find the selected user from the list
	const selectedUser = $derived(users.find((u) => u.id === selectedUserId) || null);

	function applyAliasChanges(user) {
		const aliases = new Set(user.aliases || []);
		for (const change of aliasChanges) {
			if (change.userId !== user.id) continue;
			if (change.added) aliases.add(change.alias);
			else aliases.delete(change.alias);
		}
		return [...aliases];
	}

	function trackResult(result) {
		if (result.type !== 'success') return;
		const { createdUser, deletedUserId, aliasChange } = result.data || {};
		if (createdUser?.id) createdUsers = [...createdUsers, createdUser];
		if (deletedUserId) deletedUserIds = [...deletedUserIds, deletedUserId];
		if (aliasChange) aliasChanges = [...aliasChanges, aliasChange];
	}

	function handleAliasChange() {
		return async ({ result, update }) => {
			trackResult(result);
			await update();
		};
	}
	const hasNotice = $derived(
		Boolean(
			!data.configured || form?.error || form?.success || data.loadError || data.orgUnitsError
		)
	);
	const createPasswordStrength = $derived(assessPassword(createPassword));
	const resetPasswordStrength = $derived(assessPassword(resetPassword));

	const PASSWORD_GROUPS = {
		lower: 'abcdefghijkmnopqrstuvwxyz',
		upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
		digits: '23456789',
		symbols: '!@#$%^&*()-_=+[]{}:,.?'
	};
	const PASSWORD_CHARSET =
		PASSWORD_GROUPS.lower +
		PASSWORD_GROUPS.upper +
		PASSWORD_GROUPS.digits +
		PASSWORD_GROUPS.symbols;
	const PASSWORD_LENGTH = 20;
	const PASSWORD_HINT = 'Google accepts 8-100 ASCII characters. 16+ random characters is safer.';

	function displayName(user) {
		const given = user?.name?.givenName || '';
		const family = user?.name?.familyName || '';
		const full = `${given} ${family}`.trim();
		return full || user?.primaryEmail || user?.id || 'Unknown user';
	}

	function getInitials(user) {
		const name = displayName(user);
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	function generatePassword(length = PASSWORD_LENGTH) {
		const targetLength = Math.max(16, Number(length) || PASSWORD_LENGTH);
		const characters = [
			pickRandomChar(PASSWORD_GROUPS.lower),
			pickRandomChar(PASSWORD_GROUPS.upper),
			pickRandomChar(PASSWORD_GROUPS.digits),
			pickRandomChar(PASSWORD_GROUPS.symbols)
		];

		while (characters.length < targetLength) {
			characters.push(pickRandomChar(PASSWORD_CHARSET));
		}

		shuffleCharacters(characters);
		return characters.join('');
	}

	function pickRandomChar(charset) {
		const source = String(charset || PASSWORD_CHARSET);
		const bytes = new Uint32Array(1);
		if (globalThis.crypto?.getRandomValues) {
			globalThis.crypto.getRandomValues(bytes);
			return source[bytes[0] % source.length];
		}
		return source[Math.floor(Math.random() * source.length)];
	}

	function shuffleCharacters(characters) {
		for (let index = characters.length - 1; index > 0; index -= 1) {
			const randomValue = new Uint32Array(1);
			const swapIndex = globalThis.crypto?.getRandomValues
				? (globalThis.crypto.getRandomValues(randomValue), randomValue[0] % (index + 1))
				: Math.floor(Math.random() * (index + 1));
			[characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
		}
	}

	function assessPassword(password) {
		const value = String(password || '');
		if (!value) {
			return {
				label: 'Ready for a generated password',
				detail: PASSWORD_HINT,
				percent: 0,
				barClass: 'bg-surface-500',
				labelClass: 'text-surface-300'
			};
		}

		const length = value.length;
		const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].reduce(
			(count, pattern) => count + (pattern.test(value) ? 1 : 0),
			0
		);
		const hasWhitespace = /\s/.test(value);

		if (length < 8) {
			return {
				label: 'Too short',
				detail: 'Google requires at least 8 characters.',
				percent: 24,
				barClass: 'bg-error-500',
				labelClass: 'text-error-500'
			};
		}

		if (length < 12) {
			return {
				label: 'Fair',
				detail: `${length} chars, ${groups}/4 character groups. Use 16+ for a temporary password.`,
				percent: 48,
				barClass: 'bg-warning-500',
				labelClass: 'text-warning-500'
			};
		}

		if (length < 16 || groups < 3 || hasWhitespace) {
			return {
				label: 'Good',
				detail: `${length} chars, ${groups}/4 character groups. ${PASSWORD_HINT}`,
				percent: 72,
				barClass: 'bg-primary-500',
				labelClass: 'text-primary-500'
			};
		}

		return {
			label: 'Strong',
			detail: `${length} chars, ${groups}/4 character groups. ${PASSWORD_HINT}`,
			percent: 100,
			barClass: 'bg-success-500',
			labelClass: 'text-success-500'
		};
	}

	function requirePhrase(event, phrase, actionLabel) {
		const entered = window.prompt(`Type "${phrase}" to ${actionLabel}.`);
		if (entered === null) {
			event.preventDefault();
			return;
		}
		const formElement = event.currentTarget.form;
		const input = formElement.querySelector('input[name="confirmText"]');
		if (input) {
			input.value = entered.trim();
		}
	}

	function handleCreateUser() {
		return async ({ result, update }) => {
			trackResult(result);
			await update();
			if (result.type === 'success') {
				createPassword = '';
				showCreateForm = false;
			}
		};
	}

	function handleResetPassword() {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				resetPassword = '';
			}
		};
	}

	function handleDeleteUser() {
		return async ({ result, update }) => {
			trackResult(result);
			await update();
			if (result.type === 'success') {
				selectedUserId = null;
			}
		};
	}
</script>

<svelte:head>
	<title>Google Workspace Admin | 3FP</title>
</svelte:head>

<AdminHero eyebrow="Branding & Workspace" title="Google Workspace Users">
	Manage account lifecycle from 3FP admin: create users, update details, reset passwords, suspend,
	sign out, and manage aliases.
	{#snippet actions()}
		<a href="/admin" class="btn preset-outlined-surface-500">
			<IconArrowLeft class="h-4 w-4" /> Admin Dashboard
		</a>
	{/snippet}
</AdminHero>

{#if hasNotice}
	<div class="border-surface-800 flex flex-col gap-3 border-b-2 px-6 py-6 sm:px-10 lg:px-14">
		{#if !data.configured}
			<AdminNotice tone="error" title="Not Configured">
				Workspace management is not configured. Set
				<code class="bg-surface-950 text-surface-50 px-1.5 font-mono"
					>GOOGLE_WORKSPACE_ADMIN_EMAIL</code
				>
				and service account credentials in server env vars.
			</AdminNotice>
		{/if}

		{#if form?.error}
			<AdminNotice tone="error" title="Action Failed">{form.error}</AdminNotice>
		{/if}

		{#if form?.success}
			<AdminNotice tone="success" title="Success">
				{form.message || 'Action completed successfully.'}
			</AdminNotice>
		{/if}

		{#if data.loadError}
			<AdminNotice tone="error" title="Failed to Load Users">{data.loadError}</AdminNotice>
		{/if}

		{#if data.orgUnitsError}
			<AdminNotice tone="warning" title="Organizational Units Unavailable">
				{data.orgUnitsError} User management remains available; new users will default to the root org
				unit.
			</AdminNotice>
		{/if}
	</div>
{/if}

{#if data.configured}
	<div
		class="grid flex-1 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
	>
		<!-- USERS LIST -->
		<section
			class="bg-surface-900 border-surface-800 border-t-secondary-500 flex-col border-t-4 md:border-r-2 {selectedUserId ||
			showCreateForm
				? 'hidden md:flex'
				: 'flex'}"
			aria-labelledby="workspace-users-heading"
		>
			<div class="flex flex-col gap-4 px-6 pt-6 pb-5">
				<div class="flex items-center justify-between gap-3">
					<h2 id="workspace-users-heading" class="m-0 text-xl">Users ({users.length})</h2>
					<button
						type="button"
						class="btn btn-sm preset-filled-primary-500"
						onclick={() => {
							selectedUserId = null;
							resetPassword = '';
							createPassword = '';
							showCreateForm = true;
						}}
					>
						<IconPlus class="h-4 w-4" /> Create User
					</button>
				</div>

				<form class="flex gap-2" method="GET">
					<div class="relative flex-1">
						<IconSearch
							class="text-surface-300 pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2"
						/>
						<input
							class="input ps-9 text-sm"
							type="text"
							name="q"
							aria-label="Search users"
							value={data.search || ''}
							placeholder="Search name or email..."
						/>
					</div>
					<button class="btn preset-outlined-surface-500" type="submit">Search</button>
				</form>
			</div>

			<ul
				class="border-surface-800 m-0 flex max-h-[calc(100dvh-22rem)] list-none flex-col overflow-y-auto border-t-2 p-0"
			>
				{#if !users.length}
					<li class="text-surface-300 px-6 py-12 text-center text-sm">No users found.</li>
				{:else}
					{#each users as user (user.id)}
						{@const isSelected = selectedUserId === user.id}
						<li class="border-surface-800 border-b">
							<button
								type="button"
								aria-pressed={isSelected}
								onclick={() => {
									createPassword = '';
									resetPassword = '';
									selectedUserId = user.id;
									showCreateForm = false;
									activeTab = 'profile';
								}}
								class="group flex w-full cursor-pointer items-center gap-3 px-6 py-3 text-left transition {isSelected
									? 'bg-primary-500 text-surface-950'
									: 'hover:bg-primary-500 hover:text-surface-950'}"
							>
								<span
									class="flex h-10 w-10 shrink-0 items-center justify-center text-sm font-black {isSelected
										? 'bg-surface-950 text-primary-500'
										: user.suspended
											? 'bg-error-500 text-surface-950'
											: 'bg-surface-50 text-surface-950 group-hover:bg-surface-950 group-hover:text-primary-500'}"
								>
									{getInitials(user)}
								</span>

								<span class="min-w-0 flex-1">
									<span class="flex items-center gap-2">
										<span class="truncate text-sm font-black">{displayName(user)}</span>
										{#if user.suspended}
											<span
												class="bg-error-500 text-surface-950 shrink-0 px-1.5 py-0.5 text-[0.65rem] font-black tracking-wide uppercase"
											>
												Suspended
											</span>
										{/if}
									</span>
									<span
										class="block truncate text-xs {isSelected
											? ''
											: 'text-surface-300 group-hover:text-surface-950'}"
									>
										{user.primaryEmail}
									</span>
									<span
										class="block truncate text-xs {isSelected
											? ''
											: 'text-surface-300 group-hover:text-surface-950'}"
									>
										{user.orgUnitPath || '/'}
									</span>
								</span>

								{#if !isSelected}
									<IconChevronRight
										class="text-surface-300 h-4 w-4 shrink-0 group-hover:text-inherit"
									/>
								{/if}
							</button>
						</li>
					{/each}
				{/if}
			</ul>

			{#if data.nextPageToken}
				<form method="GET" class="px-6 py-4">
					<input type="hidden" name="q" value={data.search || ''} />
					<button
						class="btn btn-sm preset-outlined-surface-500 w-full"
						type="submit"
						name="pageToken"
						value={data.nextPageToken}
					>
						Next Page <IconChevronRight class="h-3.5 w-3.5" />
					</button>
				</form>
			{/if}
		</section>

		<!-- DETAIL: create form, selected user, or empty state -->
		<section class="min-w-0 {selectedUserId || showCreateForm ? 'block' : 'hidden md:block'}">
			{#if showCreateForm}
				<!-- ================= CREATE USER ================= -->
				<div class="flex flex-col gap-8 px-6 py-8 sm:px-10 lg:px-12 lg:py-10">
					<div class="border-surface-800 flex items-start justify-between gap-4 border-b-2 pb-6">
						<div class="flex flex-col gap-1">
							<h2 class="m-0 flex items-center gap-3 text-2xl">
								<IconUserPlus class="h-6 w-6" aria-hidden="true" />
								<span>Create New User</span>
							</h2>
							<p class="text-surface-300 m-0 text-sm">
								Provision a new account in Google Workspace.
							</p>
						</div>
						<button
							type="button"
							class="btn btn-sm preset-outlined-surface-500 md:hidden"
							onclick={() => {
								createPassword = '';
								showCreateForm = false;
							}}
						>
							<IconChevronLeft class="h-4 w-4" /> Back
						</button>
					</div>

					<form
						method="POST"
						action="?/createUser"
						use:enhance={handleCreateUser}
						class="flex flex-col gap-6"
					>
						<div class="grid gap-5 sm:grid-cols-2">
							<label class="flex flex-col gap-2 sm:col-span-2">
								<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
									Primary Email Address
								</span>
								<input
									class="input"
									type="email"
									name="primaryEmail"
									placeholder="username@3fp.org"
									required
								/>
							</label>

							<label class="flex flex-col gap-2">
								<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
									First Name
								</span>
								<input
									class="input"
									type="text"
									name="givenName"
									placeholder="First name"
									required
								/>
							</label>

							<label class="flex flex-col gap-2">
								<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
									Last Name
								</span>
								<input
									class="input"
									type="text"
									name="familyName"
									placeholder="Last name"
									required
								/>
							</label>

							<div class="flex flex-col gap-3 sm:col-span-2">
								<label class="flex flex-col gap-2">
									<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
										Temporary Password
									</span>
									<input
										class="input"
										type="password"
										name="password"
										bind:value={createPassword}
										placeholder="Temporary password"
										autocomplete="new-password"
										minlength="8"
										maxlength="100"
										required
									/>
								</label>
								{@render passwordMeter(createPasswordStrength, () => {
									createPassword = generatePassword();
								})}
							</div>

							<label class="flex flex-col gap-2 sm:col-span-2">
								<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
									Organizational Unit
								</span>
								<select class="select" name="orgUnitPath">
									{#each data.orgUnits as unit}
										<option value={unit.orgUnitPath}>
											{unit.orgUnitPath}
											{unit.description ? ` - ${unit.description}` : ''}
										</option>
									{/each}
								</select>
							</label>

							<label
								class="flex cursor-pointer items-center gap-3 text-sm font-bold select-none sm:col-span-2"
							>
								<input type="checkbox" name="changePasswordAtNextLogin" class="checkbox" checked />
								<span>Force password change at next login</span>
							</label>
						</div>

						<div class="border-surface-800 flex gap-3 border-t-2 pt-6">
							<button
								type="button"
								class="btn preset-outlined-surface-500 flex-1 py-3"
								onclick={() => {
									createPassword = '';
									showCreateForm = false;
								}}
							>
								Cancel
							</button>
							<button type="submit" class="btn preset-filled-primary-500 flex-1 py-3">
								Create User
							</button>
						</div>
					</form>
				</div>
			{:else if selectedUser}
				<!-- ================= MANAGE USER ================= -->
				<div class="flex flex-col gap-8 px-6 py-8 sm:px-10 lg:px-12 lg:py-10">
					<div class="border-surface-800 flex items-start justify-between gap-4 border-b-2 pb-6">
						<div class="flex min-w-0 items-center gap-4">
							<span
								class="text-surface-950 flex h-16 w-16 shrink-0 items-center justify-center text-xl font-black {selectedUser.suspended
									? 'bg-error-500'
									: 'bg-primary-500'}"
							>
								{getInitials(selectedUser)}
							</span>
							<div class="min-w-0">
								<h2 class="m-0 truncate text-2xl leading-tight">{displayName(selectedUser)}</h2>
								<p class="text-surface-300 m-0 truncate text-sm">{selectedUser.primaryEmail}</p>
								<div class="mt-2 flex flex-wrap gap-2">
									<span
										class="bg-surface-800 text-surface-50 px-2 py-0.5 text-xs font-bold tracking-wide uppercase"
									>
										Org: {selectedUser.orgUnitPath || '/'}
									</span>
									{#if selectedUser.suspended}
										<span
											class="bg-error-500 text-surface-950 px-2 py-0.5 text-xs font-black tracking-[0.16em] uppercase"
										>
											Suspended
										</span>
									{:else}
										<span
											class="bg-success-500 text-surface-950 px-2 py-0.5 text-xs font-black tracking-[0.16em] uppercase"
										>
											Active
										</span>
									{/if}
								</div>
							</div>
						</div>

						<button
							type="button"
							class="btn btn-sm preset-outlined-surface-500 md:hidden"
							onclick={() => {
								selectedUserId = null;
								resetPassword = '';
							}}
						>
							<IconChevronLeft class="h-4 w-4" /> Back
						</button>
					</div>

					<div class="border-surface-800 flex border-b-2" role="group" aria-label="User sections">
						{#each [{ key: 'profile', label: 'Profile', icon: IconUser }, { key: 'security', label: 'Security', icon: IconLock }, { key: 'aliases', label: 'Aliases', icon: IconMail }] as tab (tab.key)}
							<button
								type="button"
								aria-pressed={activeTab === tab.key}
								class="-mb-0.5 flex flex-1 cursor-pointer items-center justify-center gap-2 border-b-4 px-3 py-3 text-xs font-black tracking-[0.14em] uppercase transition sm:text-sm {activeTab ===
								tab.key
									? 'border-primary-500 text-primary-500'
									: 'text-surface-300 hover:text-surface-50 border-transparent'}"
								onclick={() => (activeTab = tab.key)}
							>
								<tab.icon class="h-4 w-4" aria-hidden="true" />
								{tab.label}
							</button>
						{/each}
					</div>

					{#if activeTab === 'profile'}
						<!-- TAB: PROFILE -->
						<section class="flex flex-col gap-5" aria-labelledby="workspace-profile-heading">
							<h3 id="workspace-profile-heading" class="m-0 text-lg">Update Profile Details</h3>

							<form method="POST" action="?/updateUser" use:enhance class="flex flex-col gap-6">
								<input type="hidden" name="userKey" value={selectedUser.id} />

								<div class="grid gap-5 sm:grid-cols-2">
									<label class="flex flex-col gap-2">
										<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
											First Name
										</span>
										<input
											class="input"
											type="text"
											name="givenName"
											placeholder="First name"
											value={selectedUser.name?.givenName || ''}
										/>
									</label>

									<label class="flex flex-col gap-2">
										<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
											Last Name
										</span>
										<input
											class="input"
											type="text"
											name="familyName"
											placeholder="Last name"
											value={selectedUser.name?.familyName || ''}
										/>
									</label>

									<label class="flex flex-col gap-2 sm:col-span-2">
										<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
											Primary Email Address
										</span>
										<input
											class="input"
											type="email"
											name="primaryEmail"
											placeholder="Primary email"
											value={selectedUser.primaryEmail || ''}
										/>
									</label>

									<label class="flex flex-col gap-2 sm:col-span-2">
										<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
											Organizational Unit
										</span>
										<select
											class="select"
											name="orgUnitPath"
											value={selectedUser.orgUnitPath || '/'}
										>
											<option value="">Keep current org unit</option>
											{#each data.orgUnits as unit}
												<option value={unit.orgUnitPath}>
													{unit.orgUnitPath}
													{unit.description ? ` - ${unit.description}` : ''}
												</option>
											{/each}
										</select>
									</label>
								</div>

								<button type="submit" class="btn preset-filled-primary-500 w-full py-3">
									Update Profile Details
								</button>
							</form>
						</section>
					{:else if activeTab === 'security'}
						<!-- TAB: SECURITY -->
						<section class="flex flex-col gap-5" aria-labelledby="workspace-reset-heading">
							<h3 id="workspace-reset-heading" class="m-0 text-lg">Reset Password</h3>

							<form
								method="POST"
								action="?/resetPassword"
								use:enhance={handleResetPassword}
								class="flex flex-col gap-5"
							>
								<input type="hidden" name="userKey" value={selectedUser.id} />

								<div class="flex flex-col gap-3">
									<label class="flex flex-col gap-2">
										<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
											New Password
										</span>
										<input
											class="input"
											type="password"
											name="password"
											bind:value={resetPassword}
											placeholder="Enter new password"
											autocomplete="new-password"
											minlength="8"
											maxlength="100"
											required
										/>
									</label>
									{@render passwordMeter(resetPasswordStrength, () => {
										resetPassword = generatePassword();
									})}
								</div>

								<label class="flex cursor-pointer items-center gap-3 text-sm font-bold select-none">
									<input
										type="checkbox"
										name="changePasswordAtNextLogin"
										class="checkbox"
										checked
									/>
									<span>Force password change at next login</span>
								</label>

								<button type="submit" class="btn preset-filled-warning-500 w-full py-3">
									Reset Password
								</button>
							</form>
						</section>

						<section
							class="bg-surface-900 border-error-500 flex flex-col gap-5 border-t-4 px-6 py-6"
							aria-labelledby="workspace-danger-heading"
						>
							<h3 id="workspace-danger-heading" class="m-0 text-lg">
								Quick Actions &amp; Danger Zone
							</h3>

							<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								<!-- Suspend / Unsuspend -->
								<form method="POST" action="?/setSuspended" use:enhance class="contents">
									<input type="hidden" name="userKey" value={selectedUser.id} />
									<input
										type="hidden"
										name="suspended"
										value={selectedUser.suspended ? 'false' : 'true'}
									/>
									<input type="hidden" name="confirmText" value="" />
									<button
										class="btn w-full {selectedUser.suspended
											? 'preset-outlined-success-500'
											: 'preset-outlined-warning-500'}"
										type="submit"
										onclick={(event) =>
											requirePhrase(
												event,
												`${selectedUser.suspended ? 'UNSUSPEND' : 'SUSPEND'} ${selectedUser.id}`,
												`${selectedUser.suspended ? 'unsuspend' : 'suspend'} ${selectedUser.primaryEmail}`
											)}
									>
										{#if selectedUser.suspended}
											<IconCheck class="h-4 w-4" /> Unsuspend
										{:else}
											<IconShieldAlert class="h-4 w-4" /> Suspend
										{/if}
									</button>
								</form>

								<!-- Sign Out Sessions -->
								<form method="POST" action="?/signOut" use:enhance class="contents">
									<input type="hidden" name="userKey" value={selectedUser.id} />
									<input type="hidden" name="confirmText" value="" />
									<button
										class="btn preset-outlined-surface-500 w-full"
										type="submit"
										onclick={(event) =>
											requirePhrase(
												event,
												`SIGNOUT ${selectedUser.id}`,
												`sign out all sessions for ${selectedUser.primaryEmail}`
											)}
									>
										<IconLogOut class="h-4 w-4" /> Sign Out
									</button>
								</form>

								<!-- Delete User -->
								<form
									method="POST"
									action="?/deleteUser"
									use:enhance={handleDeleteUser}
									class="contents sm:col-span-2 lg:col-span-1"
								>
									<input type="hidden" name="userKey" value={selectedUser.id} />
									<input type="hidden" name="confirmText" value="" />
									<button
										class="btn preset-filled-error-500 w-full"
										type="submit"
										onclick={(event) =>
											requirePhrase(
												event,
												`DELETE ${selectedUser.id}`,
												`delete ${selectedUser.primaryEmail}`
											)}
									>
										<IconTrash2 class="h-4 w-4" /> Delete User
									</button>
								</form>
							</div>
						</section>
					{:else}
						<!-- TAB: ALIASES -->
						<section class="flex flex-col gap-5" aria-labelledby="workspace-add-alias-heading">
							<h3 id="workspace-add-alias-heading" class="m-0 text-lg">Add Email Alias</h3>

							<form
								method="POST"
								action="?/addAlias"
								use:enhance={handleAliasChange}
								class="flex gap-2"
							>
								<input type="hidden" name="userKey" value={selectedUser.id} />
								<div class="relative flex-1">
									<IconMail
										class="text-surface-300 pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2"
									/>
									<input
										class="input ps-9 text-sm"
										type="email"
										name="alias"
										aria-label="New alias address"
										placeholder="new-alias@3fp.org"
										required
									/>
								</div>
								<button class="btn preset-filled-primary-500 whitespace-nowrap" type="submit">
									Add Alias
								</button>
							</form>
						</section>

						<section
							class="border-surface-800 flex flex-col gap-4 border-t-2 pt-8"
							aria-labelledby="workspace-aliases-heading"
						>
							<h3 id="workspace-aliases-heading" class="m-0 text-lg">Active Email Aliases</h3>

							{#if !selectedUser.aliases?.length}
								<p class="text-surface-300 m-0 text-sm">
									No email aliases configured for this user.
								</p>
							{:else}
								<ul class="border-surface-800 m-0 flex list-none flex-col border-t-2 p-0">
									{#each selectedUser.aliases as alias (alias)}
										<li
											class="border-surface-800 flex items-center justify-between gap-3 border-b py-3"
										>
											<span class="flex min-w-0 items-center gap-3 text-sm font-bold">
												<IconMail class="text-primary-500 h-4 w-4 shrink-0" aria-hidden="true" />
												<span class="truncate">{alias}</span>
											</span>

											<form method="POST" action="?/deleteAlias" use:enhance={handleAliasChange}>
												<input type="hidden" name="userKey" value={selectedUser.id} />
												<input type="hidden" name="alias" value={alias} />
												<input type="hidden" name="confirmText" value="" />
												<button
													class="btn btn-sm preset-outlined-error-500 whitespace-nowrap"
													type="submit"
													onclick={(event) =>
														requirePhrase(event, `REMOVE ${alias}`, `remove alias ${alias}`)}
												>
													Remove
												</button>
											</form>
										</li>
									{/each}
								</ul>
							{/if}
						</section>
					{/if}
				</div>
			{:else}
				<!-- ================= EMPTY STATE ================= -->
				<div
					class="flex min-h-[28rem] flex-col items-start justify-center gap-5 px-6 py-12 sm:px-10 lg:px-14"
				>
					<span class="bg-secondary-500 text-surface-50 flex h-16 w-16 items-center justify-center">
						<IconUser class="h-8 w-8" aria-hidden="true" />
					</span>
					<h2 class="m-0 text-3xl leading-[0.92] sm:text-4xl">No User Selected</h2>
					<p class="text-surface-300 m-0 max-w-md text-base leading-snug font-medium">
						Select a Google Workspace user from the list on the left to view profile details, reset
						passwords, manage email aliases, or suspend/delete their account.
					</p>
					<button
						type="button"
						class="btn preset-filled-primary-500 px-7 py-4"
						onclick={() => {
							selectedUserId = null;
							resetPassword = '';
							createPassword = '';
							showCreateForm = true;
						}}
					>
						<IconUserPlus class="h-4 w-4" /> Create New User
					</button>
				</div>
			{/if}
		</section>
	</div>
{/if}

{#snippet passwordMeter(strength, onGenerate)}
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<button type="button" class="btn btn-sm preset-outlined-warning-500" onclick={onGenerate}>
			Generate secure password
		</button>
		<div class="flex flex-col gap-1 text-xs sm:text-right">
			<p class="m-0 font-bold {strength.labelClass}">{strength.label}</p>
			<p class="text-surface-300 m-0">{strength.detail}</p>
		</div>
	</div>

	<div class="bg-surface-800 h-1.5 w-full">
		<div
			class="h-full motion-safe:transition-all {strength.barClass}"
			style="width: {strength.percent}%"
		></div>
	</div>
{/snippet}
