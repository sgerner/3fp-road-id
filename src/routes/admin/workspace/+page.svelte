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
	let createPassword = $state('');
	let resetPassword = $state('');

	// Reactively find the selected user from the list
	const selectedUser = $derived(data.users.find((u) => u.id === selectedUserId) || null);
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
				barClass: 'bg-surface-500/20',
				labelClass: 'opacity-70'
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
				barClass: 'bg-red-500',
				labelClass: 'text-red-600 dark:text-red-400'
			};
		}

		if (length < 12) {
			return {
				label: 'Fair',
				detail: `${length} chars, ${groups}/4 character groups. Use 16+ for a temporary password.`,
				percent: 48,
				barClass: 'bg-amber-500',
				labelClass: 'text-amber-600 dark:text-amber-400'
			};
		}

		if (length < 16 || groups < 3 || hasWhitespace) {
			return {
				label: 'Good',
				detail: `${length} chars, ${groups}/4 character groups. ${PASSWORD_HINT}`,
				percent: 72,
				barClass: 'bg-sky-500',
				labelClass: 'text-sky-600 dark:text-sky-400'
			};
		}

		return {
			label: 'Strong',
			detail: `${length} chars, ${groups}/4 character groups. ${PASSWORD_HINT}`,
			percent: 100,
			barClass: 'bg-emerald-500',
			labelClass: 'text-emerald-600 dark:text-emerald-400'
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
	<header class="flex flex-col gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
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
							{data.orgUnitsError} User management remains available; new users will default to the root
							org unit.
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
				<div class="card preset-tonal-surface border-surface-500/10 space-y-4 border p-4 shadow-sm">
					<!-- List Header & Create Trigger -->
					<div class="flex flex-col gap-3">
						<div class="flex items-center justify-between">
							<h2 class="h5 font-bold">Users ({data.users.length})</h2>
							<button
								type="button"
								class="btn btn-sm preset-filled-primary-500 font-semibold"
								onclick={() => {
									selectedUserId = null;
									resetPassword = '';
									createPassword = '';
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
					<div class="max-h-[calc(100vh-22rem)] space-y-2 overflow-y-auto pr-1">
						{#if !data.users.length}
							<div class="py-12 text-center text-sm opacity-60">No users found.</div>
						{:else}
							{#each data.users as user}
								<button
									type="button"
									onclick={() => {
										createPassword = '';
										resetPassword = '';
										selectedUserId = user.id;
										showCreateForm = false;
										activeTab = 'profile';
									}}
									class="flex w-full cursor-pointer items-center gap-3 rounded-lg p-3 text-left transition-all duration-200
									{selectedUserId === user.id
										? 'preset-tonal-primary shadow-md'
										: 'preset-tonal-surface hover:preset-tonal-secondary'}"
								>
									<!-- Initials / Avatar Circle -->
									<div
										class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold
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
												class="bg-error-500 absolute right-0 bottom-0 block h-2.5 w-2.5 rounded-full ring-2"
											></span>
										{:else}
											<span
												class="bg-success-500 absolute right-0 bottom-0 block h-2.5 w-2.5 rounded-full ring-2"
											></span>
										{/if}
									</div>

									<!-- User Metadata -->
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-bold">
											{displayName(user)}
										</p>
										<p class="truncate text-xs opacity-80">
											{user.primaryEmail}
										</p>
										<p class="mt-0.5 truncate text-[10px] opacity-60">
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
						<form method="GET" class="border-surface-500/10 border-t pt-2">
							<input type="hidden" name="q" value={data.search || ''} />
							<button
								class="btn btn-sm preset-outlined-primary-500 w-full text-sm font-semibold"
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
					<div
						class="card preset-tonal-surface border-surface-500/10 space-y-6 border p-6 shadow-sm"
					>
						<!-- Header & Back Button for Mobile -->
						<div class="border-surface-500/10 flex items-center justify-between border-b pb-4">
							<div class="space-y-1">
								<h2 class="h4 flex items-center gap-2 font-bold">
									<IconUserPlus class="h-5 w-5" />
									<span>Create New User</span>
								</h2>
								<p class="text-xs opacity-60">Provision a new account in Google Workspace.</p>
							</div>
							<button
								type="button"
								class="btn btn-sm preset-outlined-surface-500 font-semibold md:hidden"
								onclick={() => {
									createPassword = '';
									showCreateForm = false;
								}}
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

								<div class="space-y-2 sm:col-span-2">
									<label class="flex flex-col gap-1 text-sm">
										<span class="font-semibold">Temporary Password</span>
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

									<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
										<button
											type="button"
											class="btn btn-sm preset-outlined-warning font-semibold"
											onclick={() => {
												createPassword = generatePassword();
											}}
										>
											Generate secure password
										</button>
										<div class="space-y-1 text-xs sm:text-right">
											<p class={`font-semibold ${createPasswordStrength.labelClass}`}>
												{createPasswordStrength.label}
											</p>
											<p class="opacity-60">{createPasswordStrength.detail}</p>
										</div>
									</div>

									<div class="bg-surface-500/10 h-1.5 overflow-hidden rounded-full">
										<div
											class={`h-full rounded-full transition-all ${createPasswordStrength.barClass}`}
											style={`width: ${createPasswordStrength.percent}%`}
										></div>
									</div>
								</div>

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

								<div class="py-2 sm:col-span-2">
									<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
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

							<div class="border-surface-500/10 flex gap-3 border-t pt-4">
								<button
									type="button"
									class="btn preset-outlined-surface-500 flex-1 font-semibold"
									onclick={() => {
										createPassword = '';
										showCreateForm = false;
									}}
								>
									Cancel
								</button>
								<button type="submit" class="btn preset-filled-primary-500 flex-1 font-semibold">
									Create User
								</button>
							</div>
						</form>
					</div>
				{:else}
					<!-- ================= DETAILS OR EMPTY STATE PANEL ================= -->
					{#if selectedUser}
						<!-- ================= EDIT/MANAGE USER PANEL ================= -->
						<div
							class="card preset-tonal-surface border-surface-500/10 space-y-6 border p-6 shadow-sm"
						>
							<!-- Header: User details summary & Back Button for Mobile -->
							<div class="border-surface-500/10 flex items-start justify-between border-b pb-4">
								<div class="flex items-center gap-4">
									<!-- Initials Avatar Circle -->
									<div
										class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold
									{selectedUser.suspended ? 'preset-tonal-error' : 'preset-tonal-primary'}"
									>
										{getInitials(selectedUser)}
									</div>
									<div class="min-w-0">
										<h2 class="h4 truncate leading-tight font-bold">
											{displayName(selectedUser)}
										</h2>
										<p class="truncate text-sm opacity-70">{selectedUser.primaryEmail}</p>
										<div class="mt-2 flex flex-wrap gap-2">
											<span class="badge preset-tonal-surface px-2 py-0.5 text-[10px] font-medium">
												Org: {selectedUser.orgUnitPath || '/'}
											</span>
											{#if selectedUser.suspended}
												<span
													class="badge preset-filled-error-500 px-2 py-0.5 text-[10px] font-bold uppercase"
												>
													Suspended
												</span>
											{:else}
												<span
													class="badge preset-filled-success-500 px-2 py-0.5 text-[10px] font-bold uppercase"
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
									onclick={() => {
										selectedUserId = null;
										resetPassword = '';
									}}
								>
									<IconChevronLeft class="mr-1 h-4 w-4" /> Back
								</button>
							</div>

							<!-- Tabbed Navigation -->
							<div class="border-surface-500/10 flex gap-1 border-b sm:gap-2">
								<button
									type="button"
									class="flex flex-1 items-center justify-center gap-1.5 border-b-2 pb-3 text-center text-xs font-semibold transition-all duration-200 sm:text-sm
									{activeTab === 'profile'
										? 'preset-tonal-primary border-primary-500'
										: 'border-transparent opacity-50 hover:opacity-80'}"
									onclick={() => (activeTab = 'profile')}
								>
									<IconUser class="h-4 w-4" /> Profile
								</button>
								<button
									type="button"
									class="flex flex-1 items-center justify-center gap-1.5 border-b-2 pb-3 text-center text-xs font-semibold transition-all duration-200 sm:text-sm
									{activeTab === 'security'
										? 'preset-tonal-primary border-primary-500'
										: 'border-transparent opacity-50 hover:opacity-80'}"
									onclick={() => (activeTab = 'security')}
								>
									<IconLock class="h-4 w-4" /> Security
								</button>
								<button
									type="button"
									class="flex flex-1 items-center justify-center gap-1.5 border-b-2 pb-3 text-center text-xs font-semibold transition-all duration-200 sm:text-sm
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
									<h3 class="text-xs font-semibold tracking-wide uppercase opacity-60">
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
											class="btn preset-filled-primary-500 mt-2 w-full font-semibold"
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
											<h3 class="text-xs font-semibold tracking-wide uppercase opacity-60">
												Reset Password
											</h3>

											<form
												method="POST"
												action="?/resetPassword"
												use:enhance={handleResetPassword}
												class="space-y-4"
											>
												<input type="hidden" name="userKey" value={selectedUser.id} />

												<div class="space-y-2">
													<label class="flex flex-col gap-1 text-sm">
														<span class="font-medium">New Password</span>
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

													<div
														class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
													>
														<button
															type="button"
															class="btn btn-sm preset-outlined-warning font-semibold"
															onclick={() => {
																resetPassword = generatePassword();
															}}
														>
															Generate secure password
														</button>
														<div class="space-y-1 text-xs sm:text-right">
															<p class={`font-semibold ${resetPasswordStrength.labelClass}`}>
																{resetPasswordStrength.label}
															</p>
															<p class="opacity-60">{resetPasswordStrength.detail}</p>
														</div>
													</div>

													<div class="bg-surface-500/10 h-1.5 overflow-hidden rounded-full">
														<div
															class={`h-full rounded-full transition-all ${resetPasswordStrength.barClass}`}
															style={`width: ${resetPasswordStrength.percent}%`}
														></div>
													</div>
												</div>

												<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
													<input
														type="checkbox"
														name="changePasswordAtNextLogin"
														class="checkbox"
														checked
													/>
													<span>Force password change at next login</span>
												</label>

												<button type="submit" class="btn preset-tonal-warning w-full font-semibold">
													Reset Password
												</button>
											</form>
										</div>

										<hr class="border-surface-500/10" />

										<!-- Quick Actions / Danger Zone -->
										<div class="space-y-4">
											<h3 class="text-xs font-semibold tracking-wide uppercase">
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
														class="btn preset-tonal-primary w-full font-semibold"
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
														class="btn preset-filled-error-500 w-full font-semibold"
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
											<h3 class="text-xs font-semibold tracking-wide uppercase opacity-60">
												Add Email Alias
											</h3>

											<form method="POST" action="?/addAlias" use:enhance class="flex gap-2">
												<input type="hidden" name="userKey" value={selectedUser.id} />
												<div class="relative flex-1">
													<span class="absolute start-3 top-1/2 -translate-y-1/2 opacity-40">
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
											<h3 class="text-xs font-semibold tracking-wide uppercase opacity-60">
												Active Email Aliases
											</h3>

											{#if !selectedUser.aliases?.length}
												<p class="py-2 text-sm opacity-60">
													No email aliases configured for this user.
												</p>
											{:else}
												<div
													class="divide-surface-500/10 border-surface-500/15 preset-tonal-surface divide-y overflow-hidden rounded-lg border"
												>
													{#each selectedUser.aliases as alias}
														<div class="flex items-center justify-between gap-2 p-3">
															<div class="flex min-w-0 items-center gap-2 text-sm font-medium">
																<IconMail class="h-4 w-4 shrink-0 opacity-50" />
																<span class="truncate">{alias}</span>
															</div>

															<form method="POST" action="?/deleteAlias" use:enhance>
																<input type="hidden" name="userKey" value={selectedUser.id} />
																<input type="hidden" name="alias" value={alias} />
																<input type="hidden" name="confirmText" value="" />
																<button
																	class="btn btn-sm preset-tonal-error px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
																	type="submit"
																	onclick={(event) =>
																		requirePhrase(
																			event,
																			`REMOVE ${alias}`,
																			`remove alias ${alias}`
																		)}
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
							class="card preset-tonal-surface border-surface-500/10 flex min-h-[30rem] flex-col items-center justify-center space-y-4 border p-12 text-center shadow-sm"
						>
							<div
								class="preset-tonal-secondary flex h-16 w-16 items-center justify-center rounded-full"
							>
								<IconUser class="h-8 w-8" />
							</div>
							<div class="max-w-md space-y-1">
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
									resetPassword = '';
									createPassword = '';
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
