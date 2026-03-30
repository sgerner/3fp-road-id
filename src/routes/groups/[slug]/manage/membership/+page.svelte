<script>
	import { untrack } from 'svelte';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconSave from '@lucide/svelte/icons/save';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash from '@lucide/svelte/icons/trash';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconSettings from '@lucide/svelte/icons/settings';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconLink from '@lucide/svelte/icons/link';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import { slide } from 'svelte/transition';

	let { data } = $props();

	const slug = $derived(data?.slug || data?.program_data?.group?.slug || '');
	const stripeConnection = $derived(data?.program_data?.stripe_connection || null);
	const DEFAULT_PROGRAM = {
		enabled: true,
		access_mode: 'public',
		cta_label: 'Follow',
		contribution_mode: 'donation',
		default_tier_id: null,
		policy_markdown: `By joining, you agree to this membership policy.\n\nCancellation:\n- You can cancel anytime.\n- Cancellation takes effect at the end of your current billing cycle.\n\nRefunds:\n- Payments are non-refundable unless required by law.\n\nQuestions:\n- Contact group organizers through the group page.`,
		policy_version: 1
	};

	// Panel states
	let settingsOpen = $state(false);
	let tiersOpen = $state(true);
	let policyOpen = $state(false);
	let formFieldsOpen = $state(false);
	let billingOpen = $state(false);

	// Notification states
	let busy = $state(false);
	let notice = $state('');
	let error = $state('');

	// Data
	let program = $state(
		untrack(() => structuredClone(data?.program_data?.program || DEFAULT_PROGRAM))
	);

	let tiers = $state(
		untrack(() =>
			Array.isArray(data?.program_data?.tiers) ? structuredClone(data.program_data.tiers) : []
		)
	);
	let formFields = $state(
		untrack(() =>
			Array.isArray(data?.program_data?.form_fields)
				? structuredClone(data.program_data.form_fields)
				: []
		)
	);
	let applications = $state(
		untrack(() => (Array.isArray(data?.applications) ? structuredClone(data.applications) : []))
	);
	let members = $state(
		untrack(() => (Array.isArray(data?.members) ? structuredClone(data.members) : []))
	);

	// Filters
	const STATUS_OPTIONS = ['active', 'past_due', 'cancelled'];
	let memberFilterStatus = $state('all');
	let memberFilterQuery = $state('');
	let expandedMemberId = $state(null);

	// Manual membership
	let manualMembership = $state({
		user_email: '',
		full_name: '',
		tier_id: '',
		status: 'active'
	});
	let manualLookupState = $state({ checking: false, found: null, full_name: '' });
	let manualLookupTimer = null;

	// New tier form
	let newTier = $state({
		name: '',
		description: '',
		monthly_amount_cents: null,
		annual_amount_cents: null,
		is_default: false,
		is_active: true
	});

	// New form field
	let newField = $state({
		field_type: 'text',
		label: '',
		help_text: '',
		required: false,
		options_text: ''
	});

	// Computed
	const publicMembershipUrl = $derived(`/groups/${slug}/membership`);
	const pendingApplications = $derived(
		applications.filter((a) => ['submitted', 'under_review', 'payment_pending'].includes(a.status))
	);
	const filteredMembers = $derived(
		members.filter((m) => {
			if (memberFilterStatus !== 'all' && m.status !== memberFilterStatus) return false;
			if (!memberFilterQuery) return true;
			const query = memberFilterQuery.toLowerCase();
			return (
				(m.profile?.full_name || '').toLowerCase().includes(query) ||
				(m.profile?.email || '').toLowerCase().includes(query) ||
				(m.tier?.name || '').toLowerCase().includes(query)
			);
		})
	);
	const activeCount = $derived(members.filter((m) => m.status === 'active').length);
	const pastDueCount = $derived(members.filter((m) => m.status === 'past_due').length);
	const hasPaidTiers = $derived(
		tiers.some((t) => (t.monthly_amount_cents || 0) > 0 || (t.annual_amount_cents || 0) > 0)
	);
	const stripeReady = $derived(stripeConnection?.connected && stripeConnection?.charges_enabled);

	// Helpers
	function setMessage(nextNotice = '', nextError = '') {
		notice = nextNotice;
		error = nextError;
		if (nextNotice) setTimeout(() => (notice = ''), 4000);
	}

	function centsToDollar(cents) {
		if (!cents) return '';
		return (cents / 100).toFixed(2);
	}

	function dollarToCents(value) {
		const num = parseFloat(value);
		return isNaN(num) ? null : Math.round(num * 100);
	}

	function formatCurrency(cents) {
		if (!cents) return 'Free';
		return `$${(cents / 100).toFixed(2)}`;
	}

	async function api(path, options = {}) {
		const response = await fetch(path, {
			headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
			...options
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload?.error || 'Request failed');
		return payload?.data;
	}

	async function copyJoinLink() {
		try {
			await navigator.clipboard.writeText(window.location.origin + publicMembershipUrl);
			setMessage('Join link copied to clipboard');
		} catch {
			setMessage('', 'Unable to copy link');
		}
	}

	async function refreshMembers() {
		const params = new URLSearchParams();
		if (memberFilterStatus !== 'all') params.set('status', memberFilterStatus);
		if (memberFilterQuery.trim()) params.set('query', memberFilterQuery.trim());
		members = await api(`/api/groups/${slug}/membership/members?${params.toString()}`);
	}

	async function updateMemberStatus(member, newStatus) {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/members/${member.id}/status`, {
				method: 'POST',
				body: JSON.stringify({ status: newStatus })
			});
			setMessage('Member status updated');
			await refreshMembers();
			expandedMemberId = null;
		} catch (e) {
			setMessage('', e?.message || 'Unable to update member');
		} finally {
			busy = false;
		}
	}

	async function approveApplication(appId) {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/applications/${appId}/approve`, {
				method: 'POST',
				body: JSON.stringify({})
			});
			setMessage('Application approved');
			applications = await api(`/api/groups/${slug}/membership/applications`);
			await refreshMembers();
		} catch (e) {
			setMessage('', e?.message || 'Unable to approve application');
		} finally {
			busy = false;
		}
	}

	async function rejectApplication(appId) {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/applications/${appId}/reject`, {
				method: 'POST',
				body: JSON.stringify({})
			});
			setMessage('Application rejected');
			applications = await api(`/api/groups/${slug}/membership/applications`);
		} catch (e) {
			setMessage('', e?.message || 'Unable to reject application');
		} finally {
			busy = false;
		}
	}

	async function addManualMembership() {
		if (!manualMembership.user_email) {
			setMessage('', 'Email is required');
			return;
		}
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/members/manual`, {
				method: 'POST',
				body: JSON.stringify(manualMembership)
			});
			setMessage('Member added successfully');
			manualMembership = { user_email: '', full_name: '', tier_id: '', status: 'active' };
			manualLookupState = { checking: false, found: null, full_name: '' };
			await refreshMembers();
		} catch (e) {
			setMessage('', e?.message || 'Unable to add member');
		} finally {
			busy = false;
		}
	}

	function queueEmailLookup() {
		if (manualLookupTimer) clearTimeout(manualLookupTimer);
		const email = manualMembership.user_email.trim().toLowerCase();
		if (!email || !email.includes('@')) {
			manualLookupState = { checking: false, found: null, full_name: '' };
			return;
		}
		manualLookupTimer = setTimeout(async () => {
			manualLookupState = { ...manualLookupState, checking: true };
			try {
				const result = await api(
					`/api/groups/${slug}/membership/members/lookup?email=${encodeURIComponent(email)}`
				);
				manualLookupState = {
					checking: false,
					found: result?.found === true,
					full_name: result?.full_name || ''
				};
				if (result?.full_name) {
					manualMembership.full_name = result.full_name;
				}
			} catch {
				manualLookupState = { checking: false, found: false, full_name: '' };
			}
		}, 350);
	}

	async function saveProgramSettings() {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/program`, {
				method: 'PUT',
				body: JSON.stringify({
					enabled: program.enabled,
					access_mode: program.access_mode,
					cta_label: program.cta_label,
					contribution_mode: program.contribution_mode,
					default_tier_id: program.default_tier_id
				})
			});
			setMessage('Settings saved');
		} catch (e) {
			setMessage('', e?.message || 'Unable to save settings');
		} finally {
			busy = false;
		}
	}

	async function savePolicy() {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/policy`, {
				method: 'PUT',
				body: JSON.stringify({ policy_markdown: program.policy_markdown, bump_version: true })
			});
			setMessage('Policy saved');
		} catch (e) {
			setMessage('', e?.message || 'Unable to save policy');
		} finally {
			busy = false;
		}
	}

	async function createTier() {
		if (!newTier.name) {
			setMessage('', 'Tier name is required');
			return;
		}
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/tiers`, {
				method: 'POST',
				body: JSON.stringify(newTier)
			});
			setMessage('Tier created');
			newTier = {
				name: '',
				description: '',
				monthly_amount_cents: null,
				annual_amount_cents: null,
				is_default: false,
				is_active: true
			};
			const data = await api(`/api/groups/${slug}/membership/program?include_inactive=true`);
			tiers = data?.tiers || [];
		} catch (e) {
			setMessage('', e?.message || 'Unable to create tier');
		} finally {
			busy = false;
		}
	}

	async function updateTier(tier) {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/tiers`, {
				method: 'PUT',
				body: JSON.stringify(tier)
			});
			setMessage('Tier updated');
			const data = await api(`/api/groups/${slug}/membership/program?include_inactive=true`);
			tiers = data?.tiers || [];
		} catch (e) {
			setMessage('', e?.message || 'Unable to update tier');
		} finally {
			busy = false;
		}
	}

	async function deleteTier(tierId) {
		if (
			!confirm(
				'Delete this tier? Existing memberships will remain but this tier cannot be used for new signups.'
			)
		)
			return;
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/tiers`, {
				method: 'DELETE',
				body: JSON.stringify({ id: tierId })
			});
			setMessage('Tier deleted');
			const data = await api(`/api/groups/${slug}/membership/program?include_inactive=true`);
			tiers = data?.tiers || [];
		} catch (e) {
			setMessage('', e?.message || 'Unable to delete tier');
		} finally {
			busy = false;
		}
	}

	async function createField() {
		if (!newField.label) {
			setMessage('', 'Field label is required');
			return;
		}
		try {
			busy = true;
			const options = (newField.options_text || '')
				.split(/\n/)
				.map((s) => s.trim())
				.filter(Boolean);
			await api(`/api/groups/${slug}/membership/form-fields`, {
				method: 'POST',
				body: JSON.stringify({ ...newField, options_json: options })
			});
			setMessage('Field added');
			newField = {
				field_type: 'text',
				label: '',
				help_text: '',
				required: false,
				options_text: ''
			};
			const data = await api(`/api/groups/${slug}/membership/program?include_inactive=true`);
			formFields = data?.form_fields || [];
		} catch (e) {
			setMessage('', e?.message || 'Unable to add field');
		} finally {
			busy = false;
		}
	}

	async function deleteField(fieldId) {
		if (!confirm('Delete this form field?')) return;
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/form-fields`, {
				method: 'DELETE',
				body: JSON.stringify({ id: fieldId })
			});
			setMessage('Field deleted');
			const data = await api(`/api/groups/${slug}/membership/program?include_inactive=true`);
			formFields = data?.form_fields || [];
		} catch (e) {
			setMessage('', e?.message || 'Unable to delete field');
		} finally {
			busy = false;
		}
	}

	async function installDefaultTiers() {
		if (
			!confirm(
				'Install the recommended tier catalog? Existing matching tiers will be updated and missing tiers will be created.'
			)
		) {
			return;
		}
		try {
			busy = true;
			const result = await api(`/api/groups/${slug}/membership/tiers/defaults`, {
				method: 'POST'
			});
			setMessage(
				`Tier catalog ready. Created ${result?.created_count || 0}, updated ${result?.updated_count || 0}.`
			);
			const data = await api(`/api/groups/${slug}/membership/program?include_inactive=true`);
			tiers = data?.tiers || [];
		} catch (e) {
			setMessage('', e?.message || 'Unable to install default tier catalog.');
		} finally {
			busy = false;
		}
	}

	function formatDate(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function getInitials(name) {
		if (!name) return '?';
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	// Auto-select tier if only one exists
	$effect(() => {
		if (tiers.length === 1 && !manualMembership.tier_id) {
			manualMembership.tier_id = tiers[0].id;
		}
	});
</script>

<div class="membership-manage">
	<!-- Notifications -->
	{#if notice}
		<div class="banner success" role="status">
			<div class="banner-content">
				<div class="banner-icon success">
					<IconCheck class="h-4 w-4" />
				</div>
				<div>
					<p class="banner-title">{notice}</p>
				</div>
			</div>
		</div>
	{/if}
	{#if error}
		<div class="banner error" role="alert">
			<div class="banner-content">
				<div class="banner-icon error">
					<IconTrash class="h-4 w-4" />
				</div>
				<div>
					<p class="banner-title">{error}</p>
				</div>
			</div>
		</div>
	{/if}

	{#if hasPaidTiers && !stripeReady}
		<div class="banner preset-tonal-warning" role="alert">
			<div class="banner-content">
				<div class="banner-icon warning">
					<IconCreditCard class="h-4 w-4" />
				</div>
				<div class="flex-1">
					<p class="banner-title">Connect Stripe to accept paid memberships</p>
					<p class="banner-subtitle">
						You have paid tiers configured. Members cannot complete payment until Stripe is
						connected.
					</p>
				</div>
				<a
					class="btn preset-filled-primary-500"
					href="/api/donations/connect/start?recipient=group&group={encodeURIComponent(slug)}"
				>
					<IconCreditCard class="h-4 w-4" />
					Connect Stripe
				</a>
			</div>
		</div>
	{/if}

	<!-- Stats Row -->
	<div class="stats-grid">
		<div class="stat-card">
			<div class="stat-label">Total Members</div>
			<div class="stat-value">{members.length}</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Active</div>
			<div class="stat-value success">{activeCount}</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Past Due</div>
			<div class="stat-value warning">{pastDueCount}</div>
		</div>
		<div class="stat-card">
			<div class="stat-label">Pending Applications</div>
			<div class="stat-value">{pendingApplications.length}</div>
		</div>
	</div>

	<!-- Member Roster -->
	<section class="card">
		<div class="card-accent" aria-hidden="true"></div>
		<div class="card-header">
			<div class="card-header-left">
				<div class="card-icon primary">
					<IconUsers class="h-5 w-5" />
				</div>
				<div class="card-title-group">
					<h2 class="card-title">Member Roster</h2>
					{#if pendingApplications.length > 0}
						<span class="badge warning">{pendingApplications.length} pending</span>
					{/if}
				</div>
			</div>
			<div class="card-header-right">
				<button class="btn preset-tonal-surface" onclick={copyJoinLink}>
					<IconLink class="h-4 w-4" />
					<span>Copy Join Link</span>
				</button>
			</div>
		</div>

		<div class="card-body">
			<div class="filters-row">
				<div class="search-input">
					<IconSearch class="search-icon h-4 w-4" />
					<input
						type="text"
						placeholder="Search members..."
						bind:value={memberFilterQuery}
						oninput={refreshMembers}
					/>
				</div>
				<select class="select" bind:value={memberFilterStatus} onchange={refreshMembers}>
					<option value="all">All statuses</option>
					{#each STATUS_OPTIONS as status}
						<option value={status}>{status}</option>
					{/each}
				</select>
			</div>

			{#if filteredMembers.length === 0}
				<div class="empty-state">
					<div class="empty-icon">
						<IconUsers class="h-8 w-8" />
					</div>
					<p class="empty-title">No members found</p>
					<p class="empty-subtitle">
						{memberFilterQuery || memberFilterStatus !== 'all'
							? 'Try adjusting your filters'
							: 'Add members manually or share your join link'}
					</p>
				</div>
			{:else}
				<div class="member-list">
					{#each filteredMembers as member (member.id)}
						<div class="member-row" class:expanded={expandedMemberId === member.id}>
							<button
								class="member-row-header"
								onclick={() =>
									(expandedMemberId = expandedMemberId === member.id ? null : member.id)}
								aria-expanded={expandedMemberId === member.id}
							>
								{#if member.profile?.avatar_url}
									<img
										src={member.profile.avatar_url}
										alt={`${member.profile?.full_name || 'Member'} avatar`}
										class="member-avatar"
									/>
								{:else}
									<div class="member-avatar-fallback">
										{getInitials(member.profile?.full_name)}
									</div>
								{/if}
								<div class="member-info">
									<div class="member-name">
										{member.profile?.full_name || member.profile?.email || 'Unknown'}
									</div>
									<div class="member-meta">
										<span class="tier-badge">{member.tier?.name || 'No tier'}</span>
										<span class="dot">·</span>
										<span class="source">{member.source}</span>
									</div>
								</div>
								<div class="member-status">
									<span
										class="status-badge"
										class:success={member.status === 'active'}
										class:warning={member.status === 'past_due'}
										class:error={member.status === 'cancelled'}
									>
										{member.status}
									</span>
								</div>
								<IconChevronDown
									class="chevron h-4 w-4 {expandedMemberId === member.id ? 'rotate' : ''}"
								/>
							</button>

							{#if expandedMemberId === member.id}
								<div class="member-details" transition:slide={{ duration: 180 }}>
									<div class="details-grid">
										{#if member.profile?.email}
											<div class="detail-item">
												<IconMail class="h-4 w-4" />
												<a href="mailto:{member.profile.email}">{member.profile.email}</a>
											</div>
										{/if}
										{#if member.profile?.phone}
											<div class="detail-item">
												<IconPhone class="h-4 w-4" />
												<a href="tel:{member.profile.phone}">{member.profile.phone}</a>
											</div>
										{/if}
										<div class="detail-item">
											<span class="detail-label">Joined:</span>
											<span>{formatDate(member.created_at)}</span>
										</div>
									</div>

									<div class="status-actions">
										<span class="action-label">Change status:</span>
										<div class="action-buttons">
											{#each STATUS_OPTIONS as status}
												{@const isActive = member.status === status}
												{@const statusPreset =
													status === 'active'
														? 'preset-filled-success-500'
														: status === 'past_due'
															? 'preset-filled-warning-500'
															: status === 'cancelled'
																? 'preset-filled-error-500'
																: 'preset-filled-surface'}
												{@const inactivePreset =
													status === 'active'
														? 'preset-outlined-success-500'
														: status === 'past_due'
															? 'preset-outlined-warning-500'
															: status === 'cancelled'
																? 'preset-outlined-error-500'
																: 'preset-outlined-surface'}
												<button
													class="btn btn-sm {isActive ? statusPreset : inactivePreset}"
													disabled={isActive || busy}
													onclick={() => updateMemberStatus(member, status)}
												>
													{status}
												</button>
											{/each}
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- Applications Queue -->
	{#if applications.length > 0}
		<section class="card">
			<div class="card-accent warning" aria-hidden="true"></div>
			<div class="card-header">
				<div class="card-header-left">
					<div class="card-icon warning">
						<IconUsers class="h-5 w-5" />
					</div>
					<div class="card-title-group">
						<h2 class="card-title">Applications</h2>
						<span class="badge warning">{pendingApplications.length} pending</span>
					</div>
				</div>
			</div>

			<div class="card-body">
				<div class="application-list">
					{#each applications as app (app.id)}
						<div class="application-row">
							<div class="application-info">
								<div class="application-name">
									{app.applicant_profile?.full_name || app.applicant_profile?.email || 'Unknown'}
								</div>
								<div class="application-meta">
									<span class="tier-badge">{app.selected_tier?.name || 'No tier'}</span>
									<span class="dot">·</span>
									<span>{formatDate(app.submitted_at)}</span>
								</div>
							</div>
							<div class="application-status">
								<span
									class="status-badge"
									class:success={app.status === 'approved'}
									class:warning={['submitted', 'under_review', 'payment_pending'].includes(
										app.status
									)}
									class:error={app.status === 'rejected'}
								>
									{app.status}
								</span>
							</div>
							{#if ['submitted', 'under_review', 'payment_pending'].includes(app.status)}
								<div class="application-actions">
									<button
										class="btn preset-tonal-success"
										disabled={busy}
										onclick={() => approveApplication(app.id)}
									>
										<IconCheck class="h-4 w-4" />
										Approve
									</button>
									<button
										class="btn preset-tonal-error"
										disabled={busy}
										onclick={() => rejectApplication(app.id)}
									>
										<IconTrash class="h-4 w-4" />
										Reject
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- Add Member (Manual) -->
	<section class="card">
		<div class="card-accent success" aria-hidden="true"></div>
		<div class="card-header">
			<div class="card-header-left">
				<div class="card-icon success">
					<IconPlus class="h-5 w-5" />
				</div>
				<div class="card-title-group">
					<h2 class="card-title">Add Member</h2>
				</div>
			</div>
		</div>

		<div class="card-body">
			<p class="card-description">
				Enter an email to add a member manually. If no account exists, we'll create one and send an
				invite.
			</p>
			<div class="manual-form">
				<div class="form-row">
					<div class="form-field">
						<label for="manual-email">Email address</label>
						<input
							id="manual-email"
							type="email"
							bind:value={manualMembership.user_email}
							oninput={queueEmailLookup}
							placeholder="member@example.com"
						/>
						{#if manualLookupState.checking}
							<span class="field-hint">Checking...</span>
						{:else if manualLookupState.found === true}
							<span class="field-hint success">Existing user found</span>
						{:else if manualLookupState.found === false}
							<span class="field-hint">New account will be created</span>
						{/if}
					</div>
					<div class="form-field">
						<label for="manual-name">Full name</label>
						<input
							id="manual-name"
							type="text"
							bind:value={manualMembership.full_name}
							placeholder={manualLookupState.full_name || 'Full name'}
							disabled={manualLookupState.found === true}
						/>
					</div>
				</div>
				<div class="form-row three-col">
					<div class="form-field">
						<label for="manual-tier">Tier</label>
						<select id="manual-tier" bind:value={manualMembership.tier_id}>
							<option value="">Select tier</option>
							{#each tiers as tier}
								<option value={tier.id}>{tier.name}</option>
							{/each}
						</select>
					</div>
					<div class="form-field">
						<label for="manual-status">Status</label>
						<select id="manual-status" bind:value={manualMembership.status}>
							{#each STATUS_OPTIONS as status}
								<option value={status}>{status}</option>
							{/each}
						</select>
					</div>
					<div class="form-field submit-field">
						<div class="submit-label-spacer" aria-hidden="true"></div>
						<button
							class="btn preset-filled-primary-500"
							disabled={busy || !manualMembership.user_email}
							onclick={addManualMembership}
						>
							<IconPlus class="h-4 w-4" />
							Add Member
						</button>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Settings -->
	<section class="card settings-card">
		<div
			class="card-accent"
			aria-hidden="true"
			style="background: linear-gradient(90deg, var(--color-surface-500), var(--color-surface-400));"
		></div>
		<button
			class="settings-header"
			onclick={() => (settingsOpen = !settingsOpen)}
			aria-expanded={settingsOpen}
		>
			<div class="card-header-left">
				<div class="card-icon muted">
					<IconSettings class="h-5 w-5" />
				</div>
				<div class="card-title-group">
					<h2 class="card-title">Settings</h2>
				</div>
			</div>
			<IconChevronDown class="chevron h-5 w-5 {settingsOpen ? 'rotate' : ''}" />
		</button>

		{#if settingsOpen}
			<div class="card-body" transition:slide={{ duration: 200 }}>
				<!-- Program Settings -->
				<div class="settings-section">
					<h3 class="section-title">Program Settings</h3>
					<div class="settings-grid">
						<div class="setting-item">
							<label class="setting-label" for="setting-enabled">Membership enabled</label>
							<div class="toggle-wrapper">
								<input
									id="setting-enabled"
									type="checkbox"
									checked={program.enabled !== false}
									onchange={(e) => (program = { ...program, enabled: e.currentTarget.checked })}
									class="toggle-input"
								/>
								<span class="toggle-track" class:checked={program.enabled !== false}>
									<span class="toggle-thumb" class:checked={program.enabled !== false}></span>
								</span>
							</div>
						</div>
						<div class="setting-item">
							<label class="setting-label" for="setting-access">Access mode</label>
							<select id="setting-access" class="setting-select" bind:value={program.access_mode}>
								<option value="public">Public</option>
								<option value="private_request">Private (review required)</option>
							</select>
						</div>
						<div class="setting-item">
							<label class="setting-label" for="setting-contribution">Contribution mode</label>
							<select
								id="setting-contribution"
								class="setting-select"
								bind:value={program.contribution_mode}
							>
								<option value="donation">Donation ($0 default)</option>
								<option value="paid">Paid (requires payment)</option>
							</select>
						</div>
						<div class="setting-item">
							<label class="setting-label" for="setting-default-tier">Default tier</label>
							<select
								id="setting-default-tier"
								class="setting-select"
								bind:value={program.default_tier_id}
							>
								<option value={null}>No default</option>
								{#each tiers as tier}
									<option value={tier.id}>{tier.name}</option>
								{/each}
							</select>
						</div>
						<div class="setting-item full-width">
							<label class="setting-label" for="setting-cta">CTA Label</label>
							<input
								id="setting-cta"
								class="setting-input"
								bind:value={program.cta_label}
								maxlength="80"
								placeholder="Join, Subscribe, etc."
							/>
						</div>
					</div>
					<div class="section-actions">
						<button
							class="btn preset-filled-primary-500"
							disabled={busy}
							onclick={saveProgramSettings}
						>
							<IconSave class="h-4 w-4" />
							Save Settings
						</button>
					</div>
				</div>

				<!-- Policy -->
				<div class="settings-section">
					<button
						class="section-toggle"
						onclick={() => (policyOpen = !policyOpen)}
						aria-expanded={policyOpen}
					>
						<h3 class="section-title">Membership Policy</h3>
						<IconChevronDown class="h-4 w-4 {policyOpen ? 'rotate' : ''}" />
					</button>
					{#if policyOpen}
						<div class="policy-content" transition:slide={{ duration: 180 }}>
							<div class="version-badge">Version {program.policy_version || 1}</div>
							<textarea
								class="policy-textarea"
								bind:value={program.policy_markdown}
								rows="8"
								placeholder="Enter your membership policy..."
							></textarea>
							<div class="section-actions">
								<button class="btn preset-filled-primary-500" disabled={busy} onclick={savePolicy}>
									<IconSave class="h-4 w-4" />
									Save Policy
								</button>
							</div>
						</div>
					{/if}
				</div>

				<!-- Tiers -->
				<div class="settings-section">
					<button
						class="section-toggle"
						onclick={() => (tiersOpen = !tiersOpen)}
						aria-expanded={tiersOpen}
					>
						<h3 class="section-title">Tiers</h3>
						<IconChevronDown class="h-4 w-4 {tiersOpen ? 'rotate' : ''}" />
					</button>
					{#if tiersOpen}
						<div class="tiers-content" transition:slide={{ duration: 180 }}>
							{#if tiers.length === 0}
								<p class="empty-text">No tiers yet. Create your first tier below.</p>
							{:else}
								<div class="tier-list">
									{#each tiers as tier (tier.id)}
										<div class="tier-row">
											<div class="tier-fields">
												<input class="tier-input" placeholder="Tier name" bind:value={tier.name} />
												<input
													class="tier-input"
													placeholder="Description"
													bind:value={tier.description}
												/>
												<div class="price-inputs">
													<div class="price-field">
														<span class="price-prefix">$</span>
														<input
															type="text"
															class="tier-input price"
															placeholder="Monthly"
															value={centsToDollar(tier.monthly_amount_cents)}
															oninput={(e) =>
																(tier.monthly_amount_cents = dollarToCents(e.currentTarget.value))}
														/>
													</div>
													<div class="price-field">
														<span class="price-prefix">$</span>
														<input
															type="text"
															class="tier-input price"
															placeholder="Annual"
															value={centsToDollar(tier.annual_amount_cents)}
															oninput={(e) =>
																(tier.annual_amount_cents = dollarToCents(e.currentTarget.value))}
														/>
													</div>
												</div>
											</div>
											<div class="tier-actions">
												<label class="checkbox-label">
													<input
														type="checkbox"
														checked={tier.is_default}
														onchange={() => {
															tiers = tiers.map((t) => ({ ...t, is_default: t.id === tier.id }));
														}}
													/>
													<span>Default</span>
												</label>
												<button
													class="btn btn-sm preset-tonal-secondary"
													disabled={busy}
													onclick={() => updateTier(tier)}
												>
													Save
												</button>
												<button
													class="btn-text danger"
													disabled={busy}
													onclick={() => deleteTier(tier.id)}
												>
													<IconTrash class="h-4 w-4" />
												</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}

							<!-- New Tier Form -->
							<div class="new-tier-form">
								<div class="flex items-center justify-between gap-2">
									<h4 class="form-subtitle">Create New Tier</h4>
									<button
										class="btn btn-sm preset-tonal-tertiary"
										disabled={busy}
										onclick={installDefaultTiers}
									>
										Import Starter Tiers
									</button>
								</div>
								<div class="tier-fields">
									<input class="tier-input" placeholder="Tier name" bind:value={newTier.name} />
									<input
										class="tier-input"
										placeholder="Description"
										bind:value={newTier.description}
									/>
									<div class="price-inputs">
										<div class="price-field">
											<span class="price-prefix">$</span>
											<input
												type="text"
												class="tier-input price"
												placeholder="Monthly"
												value={centsToDollar(newTier.monthly_amount_cents)}
												oninput={(e) =>
													(newTier.monthly_amount_cents = dollarToCents(e.currentTarget.value))}
											/>
										</div>
										<div class="price-field">
											<span class="price-prefix">$</span>
											<input
												type="text"
												class="tier-input price"
												placeholder="Annual"
												value={centsToDollar(newTier.annual_amount_cents)}
												oninput={(e) =>
													(newTier.annual_amount_cents = dollarToCents(e.currentTarget.value))}
											/>
										</div>
									</div>
								</div>
								<div class="tier-actions">
									<div class="tier-actions-left">
										<label class="checkbox-label">
											<input type="checkbox" bind:checked={newTier.is_default} />
											<span>Set as default</span>
										</label>
									</div>
									<button
										class="btn preset-filled-primary-500"
										disabled={busy || !newTier.name}
										onclick={createTier}
									>
										<IconPlus class="h-4 w-4" />
										Create Tier
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Form Fields -->
				<div class="settings-section">
					<button
						class="section-toggle"
						onclick={() => (formFieldsOpen = !formFieldsOpen)}
						aria-expanded={formFieldsOpen}
					>
						<h3 class="section-title">Application Form Fields</h3>
						<IconChevronDown class="h-4 w-4 {formFieldsOpen ? 'rotate' : ''}" />
					</button>
					{#if formFieldsOpen}
						<div class="form-fields-content" transition:slide={{ duration: 180 }}>
							{#if formFields.length === 0}
								<p class="empty-text">No custom fields yet.</p>
							{:else}
								<div class="field-list">
									{#each formFields as field (field.id)}
										<div class="field-row">
											<div class="field-info">
												<span class="field-label">{field.label}</span>
												<span class="field-type">{field.field_type}</span>
												{#if field.required}
													<span class="field-required">Required</span>
												{/if}
											</div>
											<button
												class="btn-text danger"
												disabled={busy}
												onclick={() => deleteField(field.id)}
											>
												<IconTrash class="h-4 w-4" />
											</button>
										</div>
									{/each}
								</div>
							{/if}

							<div class="new-field-form">
								<h4 class="form-subtitle">Add Custom Field</h4>
								<div class="field-row-inputs">
									<input
										class="setting-input"
										placeholder="Field label"
										bind:value={newField.label}
									/>
									<select class="setting-select" bind:value={newField.field_type}>
										<option value="text">Text</option>
										<option value="textarea">Textarea</option>
										<option value="email">Email</option>
										<option value="phone">Phone</option>
										<option value="number">Number</option>
										<option value="select">Select</option>
										<option value="multiselect">Multiselect</option>
										<option value="checkbox">Checkbox</option>
										<option value="date">Date</option>
									</select>
								</div>
								{#if newField.field_type === 'select' || newField.field_type === 'multiselect'}
									<textarea
										class="setting-input"
										placeholder="Options (one per line)"
										bind:value={newField.options_text}
										rows="3"
									></textarea>
								{/if}
								<div class="field-actions-row">
									<label class="checkbox-label">
										<input type="checkbox" bind:checked={newField.required} />
										<span>Required</span>
									</label>
									<button
										class="btn preset-filled-primary-500"
										disabled={busy || !newField.label}
										onclick={createField}
									>
										<IconPlus class="h-4 w-4" />
										Add Field
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Billing -->
				<div class="settings-section">
					<button
						class="section-toggle"
						onclick={() => (billingOpen = !billingOpen)}
						aria-expanded={billingOpen}
					>
						<h3 class="section-title">Billing & Stripe</h3>
						<IconChevronDown class="h-4 w-4 {billingOpen ? 'rotate' : ''}" />
					</button>
					{#if billingOpen}
						<div class="billing-content" transition:slide={{ duration: 180 }}>
							<div class="stripe-status">
								{#if stripeReady}
									<div class="status-message success">
										<IconCheck class="h-5 w-5" />
										<div>
											<p class="status-title">Stripe Connected</p>
											<p class="status-desc">Your group is ready to accept payments.</p>
										</div>
									</div>
								{:else if hasPaidTiers}
									<div class="status-message warning">
										<IconCreditCard class="h-5 w-5" />
										<div>
											<p class="status-title">Stripe Not Connected</p>
											<p class="status-desc">
												You have paid tiers but Stripe is not connected. Connect Stripe to accept
												payments.
											</p>
										</div>
									</div>
								{:else}
									<div class="status-message">
										<IconCreditCard class="h-5 w-5" />
										<div>
											<p class="status-title">Connect Stripe</p>
											<p class="status-desc">
												Connect Stripe to accept payments for paid memberships.
											</p>
										</div>
									</div>
								{/if}
								<a
									class="btn preset-filled-primary-500"
									href="/api/donations/connect/start?recipient=group&group={encodeURIComponent(
										slug
									)}"
								>
									<IconCreditCard class="h-4 w-4" />
									{stripeReady ? 'Manage Stripe' : 'Connect Stripe'}
								</a>
							</div>

							{#if members.some((m) => m.billing)}
								<div class="billing-stats">
									<div class="billing-stat">
										<span class="stat-label-sm">With billing</span>
										<span class="stat-value-sm">
											{members.filter((m) => m.billing).length}
										</span>
									</div>
									<div class="billing-stat">
										<span class="stat-label-sm">Past due</span>
										<span class="stat-value-sm warning">{pastDueCount}</span>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</section>
</div>

<style>
	.membership-manage {
		--card-bg: color-mix(in oklab, var(--color-surface-900) 98%, var(--color-surface-500) 2%);
		--card-border: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		--hover-bg: color-mix(in oklab, var(--color-surface-800) 80%, transparent);
		--active-bg: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-900) 92%);
		--active-border: color-mix(in oklab, var(--color-primary-500) 35%, transparent);
		--input-bg: color-mix(in oklab, var(--color-surface-950) 70%, transparent);
		--input-border: color-mix(in oklab, var(--color-surface-500) 30%, transparent);

		max-width: 72rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding-bottom: 2rem;
	}

	@media (min-width: 640px) {
		.membership-manage {
			gap: 1.5rem;
		}
	}

	/* Banners */
	.banner {
		border-radius: 1rem;
		padding: 1rem 1.25rem;
		animation: slide-in 300ms ease both;
	}

	.banner.success {
		background: color-mix(in oklab, var(--color-success-500) 8%, var(--color-surface-950) 92%);
		border: 1px solid color-mix(in oklab, var(--color-success-500) 20%, transparent);
	}

	.banner.error {
		background: color-mix(in oklab, var(--color-error-500) 8%, var(--color-surface-950) 92%);
		border: 1px solid color-mix(in oklab, var(--color-error-500) 20%, transparent);
	}

	.banner.warning {
		background: color-mix(in oklab, var(--color-warning-500) 10%, var(--color-surface-950) 90%);
		border: 1px solid color-mix(in oklab, var(--color-warning-500) 28%, transparent);
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.banner-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
	}

	.banner-icon.success {
		background: color-mix(in oklab, var(--color-success-500) 15%, transparent);
		color: var(--color-success-400);
	}

	.banner-icon.error {
		background: color-mix(in oklab, var(--color-error-500) 15%, transparent);
		color: var(--color-error-400);
	}

	.banner-icon.warning {
		background: color-mix(in oklab, var(--color-warning-500) 15%, transparent);
		color: var(--color-warning-400);
	}

	.banner-title {
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.25;
	}

	.banner-subtitle {
		margin-top: 0.125rem;
		font-size: 0.75rem;
		opacity: 0.8;
	}

	/* Stats Grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	@media (min-width: 640px) {
		.stats-grid {
			grid-template-columns: repeat(4, 1fr);
			gap: 1rem;
		}
	}

	.stat-card {
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 1rem;
		padding: 1rem;
		text-align: center;
	}

	.stat-label {
		font-size: 0.75rem;
		font-weight: 500;
		opacity: 0.6;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.stat-value.success {
		color: var(--color-success-400);
	}

	.stat-value.warning {
		color: var(--color-warning-400);
	}

	/* Cards */
	.card {
		position: relative;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 1.25rem;
		overflow: hidden;
		animation: card-in 360ms ease both;
		box-shadow:
			0 1px 3px color-mix(in oklab, black 8%, transparent),
			0 4px 12px color-mix(in oklab, black 4%, transparent);
	}

	.card-accent {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary-500), var(--color-secondary-500));
		opacity: 0.8;
		pointer-events: none;
	}

	.card-accent.warning {
		background: linear-gradient(90deg, var(--color-warning-500), var(--color-tertiary-500));
	}

	.card-accent.success {
		background: linear-gradient(90deg, var(--color-success-500), var(--color-secondary-500));
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--card-border);
	}

	@media (max-width: 480px) {
		.card-header {
			padding: 0.875rem 1rem;
		}
	}

	.card-header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-primary-500) 12%, transparent);
		color: var(--color-primary-400);
	}

	.card-icon.warning {
		background: color-mix(in oklab, var(--color-warning-500) 12%, transparent);
		color: var(--color-warning-400);
	}

	.card-icon.success {
		background: color-mix(in oklab, var(--color-success-500) 12%, transparent);
		color: var(--color-success-400);
	}

	.card-icon.muted {
		background: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		color: var(--color-surface-400);
	}

	.card-title-group {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex-wrap: wrap;
	}

	.card-title {
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.card-header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.card-body {
		padding: 1rem 1.25rem;
	}

	@media (max-width: 480px) {
		.card-body {
			padding: 0.875rem 1rem;
		}
	}

	.card-description {
		font-size: 0.8125rem;
		opacity: 0.7;
		margin-bottom: 1rem;
		line-height: 1.5;
	}

	/* Badges */
	.badge {
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.badge.warning {
		background: color-mix(in oklab, var(--color-warning-500) 12%, transparent);
		color: var(--color-warning-400);
	}

	/* Buttons */
	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 0.625rem;
		background: var(--color-primary-500);
		color: white;
		border: none;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-primary-600);
		transform: translateY(-1px);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-surface-500) 12%, transparent);
		color: inherit;
		border: none;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.btn-secondary:hover {
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	.btn-success {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-success-500) 15%, transparent);
		color: var(--color-success-300);
		border: none;
		cursor: pointer;
		transition: all 120ms ease;
	}

	.btn-success:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-success-500) 25%, transparent);
	}

	.btn-danger {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-error-500) 15%, transparent);
		color: var(--color-error-300);
		border: none;
		cursor: pointer;
		transition: all 120ms ease;
	}

	.btn-danger:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-error-500) 25%, transparent);
	}

	.btn-text {
		padding: 0.375rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: 0.375rem;
		background: transparent;
		border: none;
		color: var(--color-primary-400);
		cursor: pointer;
		transition: all 120ms ease;
	}

	.btn-text:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-surface-500) 10%, transparent);
	}

	.btn-text.danger {
		color: var(--color-error-400);
	}

	/* Filters */
	.filters-row {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.search-input {
		flex: 1;
		min-width: 200px;
		position: relative;
	}

	.search-input input {
		width: 100%;
		padding: 0.625rem 0.875rem 0.625rem 2.25rem;
		font-size: 0.875rem;
		border-radius: 0.625rem;
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: inherit;
	}

	.search-input input:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		opacity: 0.5;
	}

	.select {
		padding: 0.625rem 0.875rem;
		font-size: 0.875rem;
		border-radius: 0.625rem;
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: inherit;
		cursor: pointer;
		min-width: 140px;
	}

	.select:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	/* Member List */
	.member-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.member-row {
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
		border-radius: 0.875rem;
		border: 1px solid transparent;
		transition: all 180ms ease;
		overflow: hidden;
	}

	.member-row:hover {
		background: var(--hover-bg);
		border-color: color-mix(in oklab, var(--color-surface-400) 18%, transparent);
	}

	.member-row.expanded {
		background: var(--active-bg);
		border-color: var(--active-border);
	}

	.member-row-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		width: 100%;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	@media (max-width: 480px) {
		.member-row-header {
			padding: 0.75rem;
			gap: 0.625rem;
		}
	}

	.member-avatar,
	.member-avatar-fallback {
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 9999px;
	}

	.member-avatar {
		object-fit: cover;
	}

	.member-avatar-fallback {
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-secondary-500));
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.875rem;
		font-weight: 600;
		color: white;
	}

	@media (max-width: 480px) {
		.member-avatar,
		.member-avatar-fallback {
			width: 2.25rem;
			height: 2.25rem;
			font-size: 0.75rem;
		}
	}

	.member-info {
		flex: 1;
		min-width: 0;
	}

	.member-name {
		font-size: 0.9375rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@media (max-width: 480px) {
		.member-name {
			font-size: 0.875rem;
		}
	}

	.member-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		opacity: 0.6;
		margin-top: 0.125rem;
	}

	.tier-badge {
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		border-radius: 0.25rem;
	}

	.dot {
		opacity: 0.5;
	}

	.member-status {
		flex-shrink: 0;
	}

	.status-badge {
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
	}

	.status-badge.success {
		background: color-mix(in oklab, var(--color-success-500) 12%, transparent);
		color: var(--color-success-400);
	}

	.status-badge.warning {
		background: color-mix(in oklab, var(--color-warning-500) 12%, transparent);
		color: var(--color-warning-400);
	}

	.status-badge.error {
		background: color-mix(in oklab, var(--color-error-500) 12%, transparent);
		color: var(--color-error-400);
	}

	.chevron {
		flex-shrink: 0;
		opacity: 0.5;
		transition: transform 200ms ease;
	}

	.chevron.rotate {
		transform: rotate(180deg);
	}

	/* Member Details */
	.member-details {
		padding: 0 1rem 1rem 1rem;
		border-top: 1px solid var(--card-border);
		animation: slide-down 200ms ease;
	}

	.details-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.75rem;
		padding: 1rem 0;
	}

	.detail-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		opacity: 0.8;
	}

	.detail-item a {
		color: inherit;
		text-decoration: underline;
	}

	.detail-label {
		opacity: 0.6;
	}

	.status-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.action-label {
		font-size: 0.75rem;
		opacity: 0.6;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.status-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: 0.5rem;
		border: 1px solid color-mix(in oklab, var(--color-surface-500) 25%, transparent);
		background: transparent;
		color: inherit;
		cursor: pointer;
		transition: all 120ms ease;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.status-btn:hover:not(:disabled) {
		background: color-mix(in oklab, var(--color-surface-500) 10%, transparent);
	}

	.status-btn.active {
		background: var(--color-surface-500);
		color: var(--color-surface-100);
	}

	.status-btn.success.active {
		background: color-mix(in oklab, var(--color-success-500) 20%, transparent);
		color: var(--color-success-300);
		border-color: var(--color-success-500);
	}

	.status-btn.warning.active {
		background: color-mix(in oklab, var(--color-warning-500) 20%, transparent);
		color: var(--color-warning-300);
		border-color: var(--color-warning-500);
	}

	.status-btn.error.active {
		background: color-mix(in oklab, var(--color-error-500) 20%, transparent);
		color: var(--color-error-300);
		border-color: var(--color-error-500);
	}

	.status-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Application List */
	.application-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.application-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
		border-radius: 0.75rem;
		flex-wrap: wrap;
	}

	@media (max-width: 640px) {
		.application-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}
	}

	.application-info {
		flex: 1;
		min-width: 0;
	}

	.application-name {
		font-size: 0.9375rem;
		font-weight: 500;
	}

	.application-meta {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		opacity: 0.6;
		margin-top: 0.125rem;
	}

	.application-status {
		flex-shrink: 0;
	}

	.application-actions {
		display: flex;
		gap: 0.5rem;
	}

	/* Manual Form */
	.manual-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 2fr 1.5fr;
		gap: 0.75rem;
	}

	.form-row.three-col {
		grid-template-columns: 2fr 1fr 1fr;
	}

	@media (max-width: 768px) {
		.form-row,
		.form-row.three-col {
			grid-template-columns: 1fr;
		}
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-field.submit-field {
		justify-content: flex-end;
	}

	.submit-label-spacer {
		min-height: 0.875rem;
	}

	.submit-label-spacer {
		min-height: 0.875rem;
	}

	.form-field label {
		font-size: 0.75rem;
		font-weight: 500;
		opacity: 0.7;
	}

	.form-field input,
	.form-field select {
		padding: 0.625rem 0.875rem;
		font-size: 0.875rem;
		border-radius: 0.625rem;
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: inherit;
	}

	.form-field input:focus,
	.form-field select:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	.form-field input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.field-hint {
		font-size: 0.75rem;
		opacity: 0.6;
	}

	.field-hint.success {
		color: var(--color-success-400);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
	}

	/* Settings */
	.settings-card {
		background: color-mix(in oklab, var(--color-surface-900) 95%, var(--color-surface-500) 5%);
	}

	.settings-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 1rem 1.25rem;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
	}

	.settings-header:hover {
		background: color-mix(in oklab, var(--color-surface-800) 30%, transparent);
	}

	.settings-section {
		padding: 1rem 0;
		border-bottom: 1px solid var(--card-border);
	}

	.settings-section:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.section-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.5rem 0;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
	}

	.section-title {
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		padding: 1rem 0;
	}

	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.setting-item.full-width {
		grid-column: 1 / -1;
	}

	.setting-label {
		font-size: 0.8125rem;
		font-weight: 500;
		opacity: 0.8;
	}

	.setting-input,
	.setting-select,
	.tier-input {
		padding: 0.625rem 0.875rem;
		font-size: 0.875rem;
		border-radius: 0.625rem;
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: inherit;
	}

	.setting-input:focus,
	.setting-select:focus,
	.tier-input:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	.setting-select {
		cursor: pointer;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.75rem center;
		background-size: 1rem;
		padding-right: 2.5rem;
	}

	/* Toggle Switch */
	.toggle-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
		cursor: pointer;
	}

	.toggle-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	.toggle-track {
		display: block;
		width: 2.75rem;
		height: 1.5rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-500) 40%, transparent);
		border: 1px solid var(--input-border);
		transition: all 200ms ease;
		position: relative;
	}

	.toggle-track.checked {
		background: var(--color-primary-500);
		border-color: var(--color-primary-500);
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: calc(1.5rem - 6px);
		height: calc(1.5rem - 6px);
		border-radius: 9999px;
		background: white;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
		transition: transform 200ms ease;
	}

	.toggle-thumb.checked {
		transform: translateX(1.25rem);
	}

	.section-actions {
		display: flex;
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid var(--card-border);
	}

	/* Policy */
	.policy-content {
		padding-top: 1rem;
	}

	.version-badge {
		display: inline-block;
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		border-radius: 0.25rem;
		margin-bottom: 0.75rem;
	}

	.policy-textarea {
		width: 100%;
		padding: 0.75rem;
		font-size: 0.875rem;
		border-radius: 0.625rem;
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: inherit;
		resize: vertical;
		min-height: 8rem;
		font-family: inherit;
	}

	.policy-textarea:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	/* Tiers */
	.tiers-content {
		padding-top: 1rem;
	}

	.tier-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.tier-row {
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
		border-radius: 0.75rem;
		padding: 0.75rem;
		border: 1px solid var(--card-border);
	}

	.tier-fields {
		display: grid;
		grid-template-columns: 1.5fr 2fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	@media (max-width: 640px) {
		.tier-fields {
			grid-template-columns: 1fr;
		}
	}

	.price-inputs {
		display: flex;
		gap: 0.5rem;
	}

	.price-field {
		display: flex;
		align-items: center;
		background: var(--input-bg);
		border-radius: 0.5rem;
		border: 1px solid var(--input-border);
		overflow: hidden;
	}

	.price-prefix {
		padding: 0.5rem 0.5rem;
		font-size: 0.875rem;
		opacity: 0.6;
		border-right: 1px solid var(--input-border);
	}

	.tier-input.price {
		border: none;
		background: transparent;
		border-radius: 0;
		padding: 0.5rem;
		min-width: 80px;
	}

	.tier-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.new-tier-form {
		background: color-mix(in oklab, var(--color-surface-950) 30%, transparent);
		border-radius: 0.75rem;
		padding: 1rem;
		border: 1px dashed var(--card-border);
	}

	.form-subtitle {
		font-size: 0.8125rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
		opacity: 0.8;
	}

	/* Checkbox */
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox'] {
		width: 1rem;
		height: 1rem;
		accent-color: var(--color-primary-500);
	}

	/* Form Fields */
	.form-fields-content {
		padding-top: 1rem;
	}

	.field-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.75rem;
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
		border-radius: 0.5rem;
		border: 1px solid var(--card-border);
	}

	.field-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.field-label {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.field-type {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		border-radius: 0.25rem;
		opacity: 0.8;
	}

	.field-required {
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: color-mix(in oklab, var(--color-warning-500) 15%, transparent);
		color: var(--color-warning-400);
		border-radius: 0.25rem;
	}

	.new-field-form {
		background: color-mix(in oklab, var(--color-surface-950) 30%, transparent);
		border-radius: 0.75rem;
		padding: 1rem;
		border: 1px dashed var(--card-border);
	}

	.field-row-inputs {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	@media (max-width: 480px) {
		.field-row-inputs {
			grid-template-columns: 1fr;
		}
	}

	.field-actions-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.empty-text {
		font-size: 0.875rem;
		opacity: 0.6;
		padding: 1rem 0;
		text-align: center;
	}

	/* Quick Start */
	.quick-start {
		background: color-mix(in oklab, var(--color-primary-500) 8%, var(--color-surface-950) 92%);
		border: 1px dashed color-mix(in oklab, var(--color-primary-500) 40%, transparent);
		border-radius: 0.75rem;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.quick-start-content {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.quick-start-icon {
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.625rem;
		background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
		color: var(--color-primary-400);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.quick-start-title {
		font-size: 0.9375rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
		color: var(--color-primary-300);
	}

	.quick-start-desc {
		font-size: 0.8125rem;
		opacity: 0.7;
		line-height: 1.4;
	}

	/* Billing */
	.billing-content {
		padding-top: 1rem;
	}

	.stripe-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 1rem;
		background: color-mix(in oklab, var(--color-surface-950) 50%, transparent);
		border-radius: 0.75rem;
		border: 1px solid var(--card-border);
	}

	.status-message {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
	}

	.status-message.success {
		color: var(--color-success-400);
	}

	.status-message.warning {
		color: var(--color-warning-400);
	}

	.status-title {
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.status-desc {
		font-size: 0.8125rem;
		opacity: 0.8;
	}

	.billing-stats {
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--card-border);
	}

	.billing-stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label-sm {
		font-size: 0.6875rem;
		opacity: 0.6;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-value-sm {
		font-size: 1.25rem;
		font-weight: 600;
	}

	.stat-value-sm.warning {
		color: var(--color-warning-400);
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2.5rem 1.5rem;
		text-align: center;
	}

	.empty-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 1rem;
		background: color-mix(in oklab, var(--color-surface-500) 10%, transparent);
		color: color-mix(in oklab, var(--color-surface-300) 60%, transparent);
		margin-bottom: 1rem;
	}

	.empty-title {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.empty-subtitle {
		font-size: 0.8125rem;
		opacity: 0.6;
	}

	/* Animations */
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slide-down {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
