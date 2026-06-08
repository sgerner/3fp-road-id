<script>
	let { data, form } = $props();

	function displayName(user) {
		const given = user?.name?.givenName || '';
		const family = user?.name?.familyName || '';
		const full = `${given} ${family}`.trim();
		return full || user?.primaryEmail || user?.id || 'Unknown user';
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
</script>

<svelte:head>
	<title>Google Workspace Admin | 3FP</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:py-10">
	<header class="space-y-1">
		<h1 class="h2">Google Workspace Users</h1>
		<p class="text-surface-700-300 text-sm">
			Manage account lifecycle from 3FP admin: create users, update details, reset passwords,
			suspend, sign out, and manage aliases.
		</p>
	</header>

	{#if !data.configured}
		<div class="card border-error-500/40 bg-error-50 p-4 text-sm">
			Workspace management is not configured. Set `GOOGLE_WORKSPACE_ADMIN_EMAIL` and service account
			credentials in server env vars.
		</div>
	{:else}
		{#if form?.error}
			<div class="card border-error-500/40 bg-error-50 p-4 text-sm">{form.error}</div>
		{/if}
		{#if form?.success}
			<div class="card border-success-500/40 bg-success-50 p-4 text-sm">
				{form.message || 'Action completed.'}
			</div>
		{/if}
		{#if data.loadError}
			<div class="card border-error-500/40 bg-error-50 p-4 text-sm">{data.loadError}</div>
		{/if}
		{#if data.orgUnitsError}
			<div class="card border-warning-500/40 bg-warning-50 p-4 text-sm">
				{data.orgUnitsError} User management remains available; new users will default to the root org
				unit.
			</div>
		{/if}

		<section class="card preset-tonal-surface space-y-4 p-4">
			<h2 class="h5">Find Users</h2>
			<form class="flex flex-wrap items-end gap-3" method="GET">
				<label class="flex min-w-[280px] flex-1 flex-col gap-1 text-sm">
					<span class="font-medium">Search query</span>
					<input
						class="input"
						type="text"
						name="q"
						value={data.search}
						placeholder="name:Alex* or email:alex@3fp.org"
					/>
				</label>
				<button class="btn variant-filled-primary" type="submit">Search</button>
				{#if data.nextPageToken}
					<button
						class="btn variant-soft-primary"
						type="submit"
						name="pageToken"
						value={data.nextPageToken}
					>
						Next Page
					</button>
				{/if}
			</form>
		</section>

		<section class="card preset-tonal-surface space-y-4 p-4">
			<h2 class="h5">Create User</h2>
			<form method="POST" action="?/createUser" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				<input class="input" type="email" name="primaryEmail" placeholder="user@3fp.org" required />
				<input class="input" type="text" name="givenName" placeholder="First name" required />
				<input class="input" type="text" name="familyName" placeholder="Last name" required />
				<input
					class="input"
					type="password"
					name="password"
					placeholder="Temporary password"
					required
				/>
				<label class="flex flex-col gap-1 text-sm">
					<span class="font-medium">Org Unit</span>
					<select class="input" name="orgUnitPath">
						{#each data.orgUnits as unit}
							<option value={unit.orgUnitPath}>
								{unit.orgUnitPath}
								{unit.description ? ` - ${unit.description}` : ''}
							</option>
						{/each}
					</select>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" name="changePasswordAtNextLogin" checked />
					Force password change at next login
				</label>
				<button class="btn variant-filled-primary md:col-span-2 xl:col-span-3" type="submit">
					Create User
				</button>
			</form>
		</section>

		<section class="space-y-3">
			<h2 class="h5">Users ({data.users.length})</h2>
			{#if !data.users.length}
				<div class="card text-surface-600 p-4 text-sm">No users found.</div>
			{:else}
				<div class="grid gap-4 lg:grid-cols-2">
					{#each data.users as user}
						<article class="card preset-tonal-surface space-y-3 p-4">
							<div class="space-y-1">
								<h3 class="text-base font-bold">{displayName(user)}</h3>
								<p class="text-sm">{user.primaryEmail}</p>
								<p class="text-surface-600 text-xs">
									ID: {user.id} | Org Unit: {user.orgUnitPath || '/'} | Status:
									{user.suspended ? 'Suspended' : 'Active'}
								</p>
							</div>

							<form method="POST" action="?/updateUser" class="grid gap-2 md:grid-cols-2">
								<input type="hidden" name="userKey" value={user.id} />
								<input class="input" type="text" name="givenName" placeholder="First name" />
								<input class="input" type="text" name="familyName" placeholder="Last name" />
								<input
									class="input md:col-span-2"
									type="email"
									name="primaryEmail"
									placeholder="Primary email"
								/>
								<label class="flex flex-col gap-1 text-sm md:col-span-2">
									<span class="font-medium">Org Unit</span>
									<select class="input" name="orgUnitPath">
										<option value="">Keep current org unit</option>
										{#each data.orgUnits as unit}
											<option value={unit.orgUnitPath}>
												{unit.orgUnitPath}
												{unit.description ? ` - ${unit.description}` : ''}
											</option>
										{/each}
									</select>
								</label>
								<button class="btn variant-soft-primary md:col-span-2" type="submit"
									>Update Profile</button
								>
							</form>

							<form method="POST" action="?/resetPassword" class="grid gap-2 md:grid-cols-2">
								<input type="hidden" name="userKey" value={user.id} />
								<input
									class="input md:col-span-2"
									type="password"
									name="password"
									placeholder="New password"
									required
								/>
								<label class="flex items-center gap-2 text-sm md:col-span-2">
									<input type="checkbox" name="changePasswordAtNextLogin" checked />
									Force password change at next login
								</label>
								<button class="btn variant-soft-primary md:col-span-2" type="submit"
									>Reset Password</button
								>
							</form>

							<form method="POST" action="?/addAlias" class="flex gap-2">
								<input type="hidden" name="userKey" value={user.id} />
								<input
									class="input flex-1"
									type="email"
									name="alias"
									placeholder="alias@3fp.org"
									required
								/>
								<button class="btn variant-soft-primary" type="submit">Add Alias</button>
							</form>

							{#if user.aliases?.length}
								<div class="space-y-1">
									<p class="text-xs font-semibold tracking-wide uppercase">Aliases</p>
									{#each user.aliases as alias}
										<form method="POST" action="?/deleteAlias" class="flex items-center gap-2">
											<input type="hidden" name="userKey" value={user.id} />
											<input type="hidden" name="alias" value={alias} />
											<input type="hidden" name="confirmText" value="" />
											<span class="text-sm">{alias}</span>
											<button
												class="btn variant-ghost-error btn-sm"
												type="submit"
												onclick={(event) =>
													requirePhrase(event, `REMOVE ${alias}`, `remove alias ${alias}`)}
											>
												Remove
											</button>
										</form>
									{/each}
								</div>
							{/if}

							<div class="flex flex-wrap gap-2">
								<form method="POST" action="?/setSuspended">
									<input type="hidden" name="userKey" value={user.id} />
									<input type="hidden" name="suspended" value={user.suspended ? 'false' : 'true'} />
									<input type="hidden" name="confirmText" value="" />
									<button
										class="btn {user.suspended ? 'variant-soft-success' : 'variant-soft-warning'}"
										type="submit"
										onclick={(event) =>
											requirePhrase(
												event,
												`${user.suspended ? 'UNSUSPEND' : 'SUSPEND'} ${user.id}`,
												`${user.suspended ? 'unsuspend' : 'suspend'} ${user.primaryEmail}`
											)}
									>
										{user.suspended ? 'Unsuspend' : 'Suspend'}
									</button>
								</form>

								<form method="POST" action="?/signOut">
									<input type="hidden" name="userKey" value={user.id} />
									<input type="hidden" name="confirmText" value="" />
									<button
										class="btn variant-soft-primary"
										type="submit"
										onclick={(event) =>
											requirePhrase(
												event,
												`SIGNOUT ${user.id}`,
												`sign out all sessions for ${user.primaryEmail}`
											)}
									>
										Sign Out Sessions
									</button>
								</form>

								<form method="POST" action="?/deleteUser">
									<input type="hidden" name="userKey" value={user.id} />
									<input type="hidden" name="confirmText" value="" />
									<button
										class="btn variant-filled-error"
										type="submit"
										onclick={(event) =>
											requirePhrase(event, `DELETE ${user.id}`, `delete ${user.primaryEmail}`)}
									>
										Delete User
									</button>
								</form>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
