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
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import IconShieldAlert from '@lucide/svelte/icons/shield-alert';
	import IconLogOut from '@lucide/svelte/icons/log-out';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconInfo from '@lucide/svelte/icons/info';

	let { data, form } = $props();

	let selectedUserId = $state(null);
	let showCreateForm = $state(false);
	let activeTab = $state('profile'); // 'profile', 'security', 'aliases'

	// Reactively find the selected user from the list
	const selectedUser = $derived(data.users.find((u) => u.id === selectedUserId) || null);

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
			await update();
			if (result.type === 'success') {
				showCreateForm = false;
			}
		};
	}

	function handleDeleteUser() {
		return async ({ result, update }) => {
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

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:py-10">
	<!-- Header -->
	<header class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-2">
		<div class="space-y-1">
			<h1 class="h2">Google Workspace Users</h1>
			<p class="text-surface-700-300 text-sm">
				Manage account lifecycle from 3FP admin: create users, update details, reset passwords,
				suspend, sign out, and manage aliases.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<a href="/admin" class="btn preset-outlined-surface-500 text-sm font-semibold">
				<IconArrowLeft class="mr-2 h-4 w-4" /> Admin Dashboard
			</a>
		</div>
	</header>

	<!-- Global Status Alerts -->
	<div class="space-y-3">
		{#if !data.configured}
			<div class="card preset-tonal-error p-4 text-sm">
				<div class="flex gap-2">
					<IconShieldAlert class="h-5 w-5 shrink-0" />
					<div>
						<p class="font-bold">Not Configured</p>
						<p>
							Workspace management is not configured. Set <code>GOOGLE_WORKSPACE_ADMIN_EMAIL</code>
							and service account credentials in server env vars.
						</p>
					</div>
				</div>
			</div>
		{/if}

		{#if form?.error}
			<div class="card preset-tonal-error p-4 text-sm">
				<div class="flex gap-2">
					<IconAlertCircle class="h-5 w-5 shrink-0" />
					<div>
						<p class="font-bold">Action Failed</p>
						<p>{form.error}</p>
					</div>
				</div>
			</div>
		{/if}

		{#if form?.success}
			<div class="card preset-tonal-success p-4 text-sm">
				<div class="flex gap-2">
					<IconCheck class="h-5 w-5 shrink-0" />
					<div>
						<p class="font-bold">Success</p>
						<p>{form.message || 'Action completed successfully.'}</p>
					</div>
				</div>
			</div>
		{/if}

		{#if data.loadError}
			<div class="card preset-tonal-error p-4 text-sm">
				<div class="flex gap-2">
					<IconAlertCircle class="h-5 w-5 shrink-0" />
					<div>
						<p class="font-bold">Failed to Load Users</p>
						<p>{data.loadError}</p>
					</div>
				</div>
			</div>
		{/if}

		{#if data.orgUnitsError}
			<div class="card preset-tonal-warning p-4 text-sm">
				<div class="flex gap-2">
					<IconInfo class="h-5 w-5 shrink-0" />
					<div>
						<p class="font-bold">Organizational Units Unavailable</p>
						<p>
							{data.orgUnitsError} User management remains available; new users will default to the
							root org unit.
						</p>
					</div>
				</div>
			</div>
		{/if}
	</div>

	{#if data.configured}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-12">
			<!-- MASTER PANEL: Users List -->
			<div
				class="space-y-4 md:col-span-5 lg:col-span-4 {selectedUserId || showCreateForm
					? 'hidden md:block'
					: 'block'}"
			>
				<div class="card preset-tonal-surface border border-surface-500/10 p-4 space-y-4 shadow-sm">
					<!-- List Header & Create Trigger -->
					<div class="flex flex-col gap-3">
						<div class="flex items-center justify-between">
							<h2 class="h5 font-bold">Users ({data.users.length})</h2>
							<button
								type="button"
								class="btn btn-sm preset-filled-primary-500 font-semibold"
								onclick={() => {
									selectedUserId = null;
									showCreateForm = true;
								}}
							>
								<IconPlus class="mr-1 h-4 w-4" /> Create User
							</button>
						</div>

						<!-- Search bar -->
						<form class="flex gap-2" method="GET">
							<div class="relative flex-1">
								<span class="absolute start-3 top-1/2 -translate-y-1/2 opacity-40">
									<IconSearch class="h-4 w-4" />
								</span>
								<input
									class="input ps-9 text-sm"
									type="text"
									name="q"
									value={data.search || ''}
									placeholder="Search name or email..."
								/>
							</div>
							<button class="btn preset-tonal-primary text-sm font-semibold" type="submit"
								>Search</button
							>
						</form>
					</div>

					<!-- Scrollable Users List -->
					<div class="space-y-2 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1">
						{#if !data.users.length}
							<div class="text-center py-12 text-sm opacity-60">No users found.</div>
						{:else}
							{#each data.users as user}
								<button
									type="button"
									onclick={() => {
										selectedUserId = user.id;
										showCreateForm = false;
										activeTab = 'profile';
									}}
									class="w-full text-left flex items-center gap-3 p-3 rounded-lg transition-all duration-200 cursor-pointer
									{selectedUserId === user.id
										? 'preset-tonal-primary shadow-md'
										: 'preset-tonal-surface hover:preset-tonal-secondary'}"
								>
									<!-- Initials / Avatar Circle -->
									<div
										class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-sm
									{selectedUserId === user.id
										? 'preset-filled-primary-500'
										: user.suspended
											? 'preset-tonal-error'
											: 'preset-tonal-secondary'}"
									>
										{getInitials(user)}

										<!-- Status dot -->
										{#if user.suspended}
											<span
												class="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-error-500 ring-2"
											></span>
										{:else}
											<span
												class="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-success-500 ring-2"
											></span>
										{/if}
									</div>

									<!-- User Metadata -->
									<div class="min-w-0 flex-1">
										<p
											class="font-bold text-sm truncate"
										>
											{displayName(user)}
										</p>
										<p
											class="text-xs truncate opacity-80"
										>
											{user.primaryEmail}
										</p>
										<p
											class="text-[10px] mt-0.5 truncate opacity-60"
										>
											{user.orgUnitPath || '/'}
										</p>
									</div>

									{#if selectedUserId !== user.id}
										<IconChevronRight class="h-4 w-4 shrink-0 opacity-40" />
									{/if}
								</button>
							{/each}
						{/if}
					</div>

					<!-- Pagination / Next Page Button -->
					{#if data.nextPageToken}
						<form method="GET" class="pt-2 border-t border-surface-500/10">
							<input type="hidden" name="q" value={data.search || ''} />
							<button
								class="btn w-full btn-sm preset-outlined-primary-500 text-sm font-semibold"
								type="submit"
								name="pageToken"
								value={data.nextPageToken}
							>
								Next Page <IconChevronRight class="ml-1 h-3.5 w-3.5" />
							</button>
						</form>
					{/if}
				</div>
			</div>

			<!-- DETAIL PANEL: Manage User / Create User Form -->
			<div
				class="md:col-span-7 lg:col-span-8 {selectedUserId || showCreateForm
					? 'block'
					: 'hidden md:block'}"
			>
				{#if showCreateForm}
					<!-- ================= CREATE USER PANEL ================= -->
					<div class="card preset-tonal-surface border border-surface-500/10 p-6 space-y-6 shadow-sm">
						<!-- Header & Back Button for Mobile -->
						<div class="flex items-center justify-between pb-4 border-b border-surface-500/10">
							<div class="space-y-1">
								<h2 class="h4 font-bold flex items-center gap-2">
									<IconUserPlus class="h-5 w-5" />
									<span>Create New User</span>
								</h2>
								<p class="text-xs opacity-60">Provision a new account in Google Workspace.</p>
							</div>
							<button
								type="button"
								class="btn btn-sm preset-outlined-surface-500 font-semibold md:hidden"
								onclick={() => (showCreateForm = false)}
							>
								<IconChevronLeft class="mr-1 h-4 w-4" /> Back
							</button>
						</div>

						<form
							method="POST"
							action="?/createUser"
							use:enhance={handleCreateUser}
							class="space-y-4"
						>
							<div class="grid gap-4 sm:grid-cols-2">
								<label class="flex flex-col gap-1 text-sm sm:col-span-2">
									<span class="font-semibold">Primary Email Address</span>
									<input
										class="input"
										type="email"
										name="primaryEmail"
										placeholder="username@3fp.org"
										required
									/>
								</label>

								<label class="flex flex-col gap-1 text-sm">
									<span class="font-semibold">First Name</span>
									<input
										class="input"
										type="text"
										name="givenName"
										placeholder="First name"
										required
									/>
								</label>

								<label class="flex flex-col gap-1 text-sm">
									<span class="font-semibold">Last Name</span>
									<input
										class="input"
										type="text"
										name="familyName"
										placeholder="Last name"
										required
									/>
								</label>

								<label class="flex flex-col gap-1 text-sm sm:col-span-2">
									<span class="font-semibold">Temporary Password</span>
									<input
										class="input"
										type="password"
										name="password"
										placeholder="Temporary password"
										required
									/>
								</label>

								<label class="flex flex-col gap-1 text-sm sm:col-span-2">
									<span class="font-semibold">Organizational Unit</span>
									<select class="input" name="orgUnitPath">
										{#each data.orgUnits as unit}
											<option value={unit.orgUnitPath}>
												{unit.orgUnitPath}
												{unit.description ? ` - ${unit.description}` : ''}
											</option>
										{/each}
									</select>
								</label>

								<div class="sm:col-span-2 py-2">
									<label class="flex items-center gap-2 text-sm cursor-pointer select-none">
										<input
											type="checkbox"
											name="changePasswordAtNextLogin"
											class="checkbox"
											checked
										/>
										<span>Force password change at next login</span>
									</label>
								</div>
							</div>

							<div class="flex gap-3 pt-4 border-t border-surface-500/10">
								<button
									type="button"
									class="btn flex-1 preset-outlined-surface-500 font-semibold"
									onclick={() => (showCreateForm = false)}
								>
									Cancel
								</button>
								<button type="submit" class="btn flex-1 preset-filled-primary-500 font-semibold">
									Create User
								</button>
							</div>
						</form>
					</div>
				{:else}
					<!-- ================= DETAILS OR EMPTY STATE PANEL ================= -->
					{#if selectedUser}
						<!-- ================= EDIT/MANAGE USER PANEL ================= -->
						<div class="card preset-tonal-surface border border-surface-500/10 p-6 space-y-6 shadow-sm">
							<!-- Header: User details summary & Back Button for Mobile -->
							<div class="flex items-start justify-between pb-4 border-b border-surface-500/10">
								<div class="flex items-center gap-4">
									<!-- Initials Avatar Circle -->
									<div
										class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-bold text-lg
									{selectedUser.suspended
										? 'preset-tonal-error'
										: 'preset-tonal-primary'}"
									>
										{getInitials(selectedUser)}
									</div>
									<div class="min-w-0">
										<h2 class="h4 font-bold leading-tight truncate">
											{displayName(selectedUser)}
										</h2>
										<p class="text-sm opacity-70 truncate">{selectedUser.primaryEmail}</p>
										<div class="flex flex-wrap gap-2 mt-2">
											<span class="badge preset-tonal-surface text-[10px] font-medium py-0.5 px-2">
												Org: {selectedUser.orgUnitPath || '/'}
											</span>
											{#if selectedUser.suspended}
												<span
													class="badge preset-filled-error-500 text-[10px] font-bold py-0.5 px-2 uppercase"
												>
													Suspended
												</span>
											{:else}
												<span
													class="badge preset-filled-success-500 text-[10px] font-bold py-0.5 px-2 uppercase"
												>
													Active
												</span>
											{/if}
										</div>
									</div>
								</div>

								<button
									type="button"
									class="btn btn-sm preset-outlined-surface-500 font-semibold md:hidden"
									onclick={() => (selectedUserId = null)}
								>
									<IconChevronLeft class="mr-1 h-4 w-4" /> Back
								</button>
							</div>

							<!-- Tabbed Navigation -->
							<div class="flex border-b border-surface-500/10 gap-1 sm:gap-2">
								<button
									type="button"
									class="flex-1 pb-3 text-center text-xs sm:text-sm font-semibold transition-all duration-200 border-b-2 flex items-center justify-center gap-1.5
									{activeTab === 'profile'
										? 'preset-tonal-primary border-primary-500'
										: 'border-transparent opacity-50 hover:opacity-80'}"
									onclick={() => (activeTab = 'profile')}
								>
									<IconUser class="h-4 w-4" /> Profile
								</button>
								<button
									type="button"
									class="flex-1 pb-3 text-center text-xs sm:text-sm font-semibold transition-all duration-200 border-b-2 flex items-center justify-center gap-1.5
									{activeTab === 'security'
										? 'preset-tonal-primary border-primary-500'
										: 'border-transparent opacity-50 hover:opacity-80'}"
									onclick={() => (activeTab = 'security')}
								>
									<IconLock class="h-4 w-4" /> Security
								</button>
								<button
									type="button"
									class="flex-1 pb-3 text-center text-xs sm:text-sm font-semibold transition-all duration-200 border-b-2 flex items-center justify-center gap-1.5
									{activeTab === 'aliases'
										? 'preset-tonal-primary border-primary-500'
										: 'border-transparent opacity-50 hover:opacity-80'}"
									onclick={() => (activeTab = 'aliases')}
								>
									<IconMail class="h-4 w-4" /> Aliases
								</button>
							</div>

							<!-- Tab Contents -->
							{#if activeTab === 'profile'}
								<!-- TAB: PROFILE DETAILS -->
								<div class="space-y-4">
									<h3 class="font-semibold text-xs uppercase tracking-wide opacity-60">
										Update Profile Details
									</h3>

									<form method="POST" action="?/updateUser" use:enhance class="space-y-4">
										<input type="hidden" name="userKey" value={selectedUser.id} />

										<div class="grid gap-4 sm:grid-cols-2">
											<label class="flex flex-col gap-1 text-sm">
												<span class="font-medium">First Name</span>
												<input
													class="input"
													type="text"
													name="givenName"
													placeholder="First name"
													value={selectedUser.name?.givenName || ''}
												/>
											</label>

											<label class="flex flex-col gap-1 text-sm">
												<span class="font-medium">Last Name</span>
												<input
													class="input"
													type="text"
													name="familyName"
													placeholder="Last name"
													value={selectedUser.name?.familyName || ''}
												/>
											</label>

											<label class="flex flex-col gap-1 text-sm sm:col-span-2">
												<span class="font-medium">Primary Email Address</span>
												<input
													class="input"
													type="email"
													name="primaryEmail"
													placeholder="Primary email"
													value={selectedUser.primaryEmail || ''}
												/>
											</label>

											<label class="flex flex-col gap-1 text-sm sm:col-span-2">
												<span class="font-medium">Organizational Unit</span>
												<select
													class="input"
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

										<button
											type="submit"
											class="btn w-full preset-filled-primary-500 font-semibold mt-2"
										>
											Update Profile Details
										</button>
									</form>
								</div>
							{:else}
								{#if activeTab === 'security'}
									<!-- TAB: SECURITY & QUICK ACTIONS -->
									<div class="space-y-6">
										<!-- Password Reset Section -->
										<div class="space-y-4">
											<h3 class="font-semibold text-xs uppercase tracking-wide opacity-60">
												Reset Password
											</h3>

											<form method="POST" action="?/resetPassword" use:enhance class="space-y-4">
												<input type="hidden" name="userKey" value={selectedUser.id} />

												<label class="flex flex-col gap-1 text-sm">
													<span class="font-medium">New Password</span>
													<input
														class="input"
														type="password"
														name="password"
														placeholder="Enter new password"
														required
													/>
												</label>

												<label class="flex items-center gap-2 text-sm cursor-pointer select-none">
													<input
														type="checkbox"
														name="changePasswordAtNextLogin"
														class="checkbox"
														checked
													/>
													<span>Force password change at next login</span>
												</label>

												<button type="submit" class="btn w-full preset-tonal-warning font-semibold">
													Reset Password
												</button>
											</form>
										</div>

										<hr class="border-surface-500/10" />

										<!-- Quick Actions / Danger Zone -->
										<div class="space-y-4">
											<h3 class="font-semibold text-xs uppercase tracking-wide">
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
														class="btn w-full font-semibold {selectedUser.suspended
															? 'preset-tonal-success'
															: 'preset-tonal-warning'}"
														type="submit"
														onclick={(event) =>
															requirePhrase(
																event,
																`${selectedUser.suspended ? 'UNSUSPEND' : 'SUSPEND'} ${selectedUser.id}`,
																`${selectedUser.suspended ? 'unsuspend' : 'suspend'} ${selectedUser.primaryEmail}`
															)}
													>
														{#if selectedUser.suspended}
															<IconCheck class="mr-1.5 h-4 w-4" /> Unsuspend
														{:else}
															<IconShieldAlert class="mr-1.5 h-4 w-4" /> Suspend
														{/if}
													</button>
												</form>

												<!-- Sign Out Sessions -->
												<form method="POST" action="?/signOut" use:enhance class="contents">
													<input type="hidden" name="userKey" value={selectedUser.id} />
													<input type="hidden" name="confirmText" value="" />
													<button
														class="btn w-full preset-tonal-primary font-semibold"
														type="submit"
														onclick={(event) =>
															requirePhrase(
																event,
																`SIGNOUT ${selectedUser.id}`,
																`sign out all sessions for ${selectedUser.primaryEmail}`
															)}
													>
														<IconLogOut class="mr-1.5 h-4 w-4" /> Sign Out
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
														class="btn w-full preset-filled-error-500 font-semibold"
														type="submit"
														onclick={(event) =>
															requirePhrase(
																event,
																`DELETE ${selectedUser.id}`,
																`delete ${selectedUser.primaryEmail}`
															)}
													>
														<IconTrash2 class="mr-1.5 h-4 w-4" /> Delete User
													</button>
												</form>
											</div>
										</div>
									</div>
								{:else}
									<!-- TAB: ALIASES -->
									<div class="space-y-6">
										<!-- Add Alias Section -->
										<div class="space-y-4">
											<h3 class="font-semibold text-xs uppercase tracking-wide opacity-60">
												Add Email Alias
											</h3>

											<form method="POST" action="?/addAlias" use:enhance class="flex gap-2">
												<input type="hidden" name="userKey" value={selectedUser.id} />
												<div class="relative flex-1">
													<span
														class="absolute start-3 top-1/2 -translate-y-1/2 opacity-40"
													>
														<IconMail class="h-4 w-4" />
													</span>
													<input
														class="input ps-9 text-sm"
														type="email"
														name="alias"
														placeholder="new-alias@3fp.org"
														required
													/>
												</div>
												<button
													class="btn preset-filled-primary-500 text-sm font-semibold whitespace-nowrap"
													type="submit"
												>
													Add Alias
												</button>
											</form>
										</div>

										<hr class="border-surface-500/10" />

										<!-- Existing Aliases List -->
										<div class="space-y-3">
											<h3 class="font-semibold text-xs uppercase tracking-wide opacity-60">
												Active Email Aliases
											</h3>

											{#if !selectedUser.aliases?.length}
												<p class="text-sm opacity-60 py-2">
													No email aliases configured for this user.
												</p>
											{:else}
												<div
													class="divide-y divide-surface-500/10 border border-surface-500/15 rounded-lg overflow-hidden preset-tonal-surface"
												>
													{#each selectedUser.aliases as alias}
														<div class="flex items-center justify-between p-3 gap-2">
															<div class="flex items-center gap-2 text-sm font-medium min-w-0">
																<IconMail class="h-4 w-4 shrink-0 opacity-50" />
																<span class="truncate">{alias}</span>
															</div>

															<form method="POST" action="?/deleteAlias" use:enhance>
																<input type="hidden" name="userKey" value={selectedUser.id} />
																<input type="hidden" name="alias" value={alias} />
																<input type="hidden" name="confirmText" value="" />
																<button
																	class="btn btn-sm preset-tonal-error text-xs font-semibold py-1 px-2.5 whitespace-nowrap"
																	type="submit"
																	onclick={(event) =>
																		requirePhrase(event, `REMOVE ${alias}`, `remove alias ${alias}`)}
																>
																	Remove
																</button>
															</form>
														</div>
													{/each}
												</div>
											{/if}
										</div>
									</div>
								{/if}
							{/if}
						</div>
					{:else}
						<!-- ================= EMPTY STATE ================= -->
						<div
							class="card preset-tonal-surface border border-surface-500/10 p-12 text-center flex flex-col items-center justify-center min-h-[30rem] space-y-4 shadow-sm"
						>
							<div
								class="preset-tonal-secondary h-16 w-16 rounded-full flex items-center justify-center"
							>
								<IconUser class="h-8 w-8" />
							</div>
							<div class="space-y-1 max-w-md">
								<h3 class="text-lg font-bold">No User Selected</h3>
								<p class="text-sm opacity-70">
									Select a Google Workspace user from the list on the left to view profile details,
									reset passwords, manage email aliases, or suspend/delete their account.
								</p>
							</div>
							<button
								type="button"
								class="btn preset-filled-primary-500 font-semibold"
								onclick={() => {
									selectedUserId = null;
									showCreateForm = true;
								}}
							>
								<IconUserPlus class="mr-2 h-4 w-4" /> Create New User
							</button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>
