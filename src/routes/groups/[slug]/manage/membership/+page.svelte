<script>
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconSave from '@lucide/svelte/icons/save';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash from '@lucide/svelte/icons/trash';
	import IconSend from '@lucide/svelte/icons/send';
	import IconCalendarClock from '@lucide/svelte/icons/calendar-clock';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconCreditCard from '@lucide/svelte/icons/credit-card';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconSettings from '@lucide/svelte/icons/settings';
	import Toggle from '$lib/components/ui/Toggle.svelte';

	let { data } = $props();

	const slug = $derived(data?.slug || data?.program_data?.group?.slug || '');
	const stripeConnection = $derived(data?.program_data?.stripe_connection || null);

	const TAB_OPTIONS = [
		{ id: 'members', label: 'People', icon: IconUsers },
		{ id: 'messages', label: 'Messages', icon: IconMail },
		{ id: 'setup', label: 'Setup', icon: IconSettings }
	];

	function getDefaultActiveTab() {
		const hasProgram = Boolean(data?.program_data?.program);
		const isEnabled = data?.program_data?.program?.enabled !== false;
		const hasAnyTier =
			Array.isArray(data?.program_data?.tiers) && data.program_data.tiers.length > 0;
		return hasProgram && isEnabled && hasAnyTier ? 'members' : 'setup';
	}

	let activeTab = $state(getDefaultActiveTab());
	let busy = $state(false);
	let notice = $state('');
	let error = $state('');

	function normalizeContributionMode(value) {
		if (value === 'paid' || value === 'required_fee') return 'paid';
		return 'donation';
	}

	let program = $state({
		...(data?.program_data?.program || {
			enabled: true,
			access_mode: 'public',
			cta_label: 'Follow',
			contribution_mode: 'donation',
			default_tier_id: null,
			policy_markdown: `By joining, you agree to this membership policy.

Cancellation:
- You can cancel anytime.
- Cancellation takes effect at the end of your current billing cycle.

Refunds:
- Payments are non-refundable unless required by law.

Questions:
- Contact group organizers through the group page.`,
			policy_version: 1
		}),
		contribution_mode: normalizeContributionMode(data?.program_data?.program?.contribution_mode)
	});
	let tiers = $state(Array.isArray(data?.program_data?.tiers) ? data.program_data.tiers : []);
	let formFields = $state(
		Array.isArray(data?.program_data?.form_fields) ? data.program_data.form_fields : []
	);
	let applications = $state(Array.isArray(data?.applications) ? data.applications : []);
	let members = $state(Array.isArray(data?.members) ? data.members : []);
	let emailHistory = $state(Array.isArray(data?.email_history) ? data.email_history : []);

	let appNotes = $state({});
	let scheduleByEmail = $state({});

	let newTier = $state({
		name: '',
		description: '',
		monthly_amount_cents: null,
		annual_amount_cents: null,
		currency: 'usd',
		is_default: false,
		is_active: true,
		sort_order: 0,
		allow_custom_amount: false,
		min_amount_cents: 0
	});

	let newField = $state({
		field_type: 'text',
		label: '',
		help_text: '',
		required: false,
		options_json: [],
		sort_order: 0,
		active: true,
		options_text: ''
	});

	let manualMembership = $state({
		user_email: '',
		full_name: '',
		tier_id: '',
		status: 'active'
	});
	let manualUserLookup = $state({
		checking: false,
		checked_email: '',
		found: null,
		full_name: ''
	});
	let manualLookupTimer = null;

	let campaignDraft = $state({
		campaign_name: '',
		subject_template: '',
		body_template: '',
		audience_statuses: ['active']
	});

	const STATUS_OPTIONS = ['active', 'past_due', 'cancelled', 'expired', 'paused'];
	const RECOMMENDED_TIER_PRESETS = [
		{
			name: 'Neighbor',
			description: 'Low friction entry point. Most members start here.',
			monthly_amount_cents: 0,
			annual_amount_cents: null,
			is_default: true,
			is_active: true,
			allow_custom_amount: false,
			min_amount_cents: 0,
			enabled: true
		},
		{
			name: 'Supporter',
			description: 'A low-cost way to support the group.',
			monthly_amount_cents: 500,
			annual_amount_cents: 5000,
			is_default: false,
			is_active: true,
			allow_custom_amount: false,
			min_amount_cents: 0,
			enabled: true
		},
		{
			name: 'Advocate',
			description: 'A stronger recurring contribution tier.',
			monthly_amount_cents: 1500,
			annual_amount_cents: 15000,
			is_default: false,
			is_active: true,
			allow_custom_amount: false,
			min_amount_cents: 0,
			enabled: true
		},
		{
			name: 'Pay What You Want',
			description: 'Custom monthly or annual amount.',
			monthly_amount_cents: 0,
			annual_amount_cents: 0,
			is_default: false,
			is_active: true,
			allow_custom_amount: true,
			min_amount_cents: 0,
			enabled: true
		}
	];
	const CAMPAIGN_BODY_PLACEHOLDER =
		'Use merge tags: {{first_name}}, {{membership_tier}}, {{renewal_date}}, {{group_name}}, {{policy_link}}.\nUse content blocks: {{upcoming_rides_block}}, {{upcoming_volunteer_events_block}}, {{group_links_block}}.';

	function centsToDollarInput(cents) {
		if (cents === null || cents === undefined) return '';
		const parsed = Number(cents);
		if (!Number.isFinite(parsed)) return '';
		return (parsed / 100).toFixed(2);
	}

	function dollarInputToCents(value) {
		const cleaned = String(value ?? '')
			.replace(/[^0-9.]/g, '')
			.trim();
		if (!cleaned) return null;
		const parsed = Number.parseFloat(cleaned);
		if (!Number.isFinite(parsed) || parsed < 0) return null;
		return Math.round(parsed * 100);
	}

	function formatDollarLabel(cents) {
		const parsed = Number(cents ?? 0);
		if (!Number.isFinite(parsed) || parsed <= 0) return 'Free';
		return `$${(parsed / 100).toFixed(2)}`;
	}

	const publicMembershipUrl = $derived(`/groups/${slug}/membership`);

	async function copyMembershipLink() {
		try {
			await navigator.clipboard.writeText(window.location.origin + publicMembershipUrl);
			setMessage('Membership link copied.');
		} catch {
			setMessage('', 'Unable to copy link.');
		}
	}

	function buildPresetTierDrafts() {
		return RECOMMENDED_TIER_PRESETS.map((tier, index) => ({
			...tier,
			sort_order: index
		}));
	}

	async function api(path, options = {}) {
		const response = await fetch(path, {
			headers: {
				'Content-Type': 'application/json',
				...(options.headers || {})
			},
			...options
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload?.error || 'Request failed');
		}
		return payload?.data;
	}

	function setMessage(nextNotice = '', nextError = '') {
		notice = nextNotice;
		error = nextError;
	}

	async function refreshProgram() {
		const payload = await api(`/api/groups/${slug}/membership/program?include_inactive=true`);
		program = payload?.program
			? { ...payload.program, contribution_mode: normalizeContributionMode(payload.program.contribution_mode) }
			: program;
		tiers = Array.isArray(payload?.tiers) ? payload.tiers : [];
		formFields = Array.isArray(payload?.form_fields) ? payload.form_fields : [];
	}

	async function refreshApplications() {
		applications = await api(`/api/groups/${slug}/membership/applications`);
	}

	async function refreshMembers() {
		members = await api(`/api/groups/${slug}/membership/members`);
	}

	async function refreshEmailHistory() {
		emailHistory = await api(`/api/groups/${slug}/membership/emails/history`);
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
					default_tier_id: program.default_tier_id || null
				})
			});
			setMessage('Membership settings saved.');
		} catch (saveError) {
			setMessage('', saveError?.message || 'Unable to save membership settings.');
		} finally {
			busy = false;
		}
	}

	async function savePolicy() {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/policy`, {
				method: 'PUT',
				body: JSON.stringify({
					policy_markdown: program.policy_markdown,
					bump_version: true
				})
			});
			setMessage('Policy saved and version incremented.');
			await refreshProgram();
		} catch (saveError) {
			setMessage('', saveError?.message || 'Unable to save policy.');
		} finally {
			busy = false;
		}
	}

	async function createTier() {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/tiers`, {
				method: 'POST',
				body: JSON.stringify(newTier)
			});
			newTier = {
				...newTier,
				name: '',
				description: '',
				monthly_amount_cents: null,
				annual_amount_cents: null,
				is_default: false,
				sort_order: (tiers?.length || 0) + 1
			};
			setMessage('Tier created.');
			await refreshProgram();
		} catch (createError) {
			setMessage('', createError?.message || 'Unable to create tier.');
		} finally {
			busy = false;
		}
	}

	async function saveTier(tier) {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/tiers`, {
				method: 'PUT',
				body: JSON.stringify(tier)
			});
			setMessage('Tier updated.');
			await refreshProgram();
		} catch (saveError) {
			setMessage('', saveError?.message || 'Unable to update tier.');
		} finally {
			busy = false;
		}
	}

	async function removeTier(tierId) {
		if (!confirm('Delete this tier? Existing memberships remain but this tier cannot be used.')) return;
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/tiers`, {
				method: 'DELETE',
				body: JSON.stringify({ id: tierId })
			});
			setMessage('Tier deleted.');
			await refreshProgram();
		} catch (deleteError) {
			setMessage('', deleteError?.message || 'Unable to delete tier.');
		} finally {
			busy = false;
		}
	}

	async function createField() {
		try {
			busy = true;
			const options = (newField.options_text || '')
				.split(/\r?\n/)
				.map((entry) => entry.trim())
				.filter(Boolean);
			await api(`/api/groups/${slug}/membership/form-fields`, {
				method: 'POST',
				body: JSON.stringify({
					...newField,
					options_json: options
				})
			});
			newField = {
				field_type: 'text',
				label: '',
				help_text: '',
				required: false,
				options_json: [],
				sort_order: (formFields?.length || 0) + 1,
				active: true,
				options_text: ''
			};
			setMessage('Form field added.');
			await refreshProgram();
		} catch (createError) {
			setMessage('', createError?.message || 'Unable to create form field.');
		} finally {
			busy = false;
		}
	}

	async function saveField(field) {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/form-fields`, {
				method: 'PUT',
				body: JSON.stringify({
					...field,
					options_json: Array.isArray(field.options_json) ? field.options_json : []
				})
			});
			setMessage('Form field updated.');
			await refreshProgram();
		} catch (saveError) {
			setMessage('', saveError?.message || 'Unable to update form field.');
		} finally {
			busy = false;
		}
	}

	async function removeField(fieldId) {
		if (!confirm('Delete this application field?')) return;
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/form-fields`, {
				method: 'DELETE',
				body: JSON.stringify({ id: fieldId })
			});
			setMessage('Form field removed.');
			await refreshProgram();
		} catch (deleteError) {
			setMessage('', deleteError?.message || 'Unable to delete form field.');
		} finally {
			busy = false;
		}
	}

	async function approveApplication(applicationId) {
		try {
			busy = true;
			const result = await api(`/api/groups/${slug}/membership/applications/${applicationId}/approve`, {
				method: 'POST',
				body: JSON.stringify({ review_notes: appNotes[applicationId] || '' })
			});
			if (result?.payment_link) {
				setMessage(`Application approved. Payment link created: ${result.payment_link}`);
			} else {
				setMessage('Application approved.');
			}
			await Promise.all([refreshApplications(), refreshMembers()]);
		} catch (approveError) {
			setMessage('', approveError?.message || 'Unable to approve application.');
		} finally {
			busy = false;
		}
	}

	async function rejectApplication(applicationId) {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/applications/${applicationId}/reject`, {
				method: 'POST',
				body: JSON.stringify({ review_notes: appNotes[applicationId] || '' })
			});
			setMessage('Application rejected.');
			await refreshApplications();
		} catch (rejectError) {
			setMessage('', rejectError?.message || 'Unable to reject application.');
		} finally {
			busy = false;
		}
	}

	async function addManualMembership() {
		if (!manualMembership.user_email) {
			setMessage('', 'Member email is required.');
			return;
		}
		if (!manualMembership.tier_id) {
			setMessage('', 'Select a tier.');
			return;
		}
		if (manualUserLookup.found === false && !String(manualMembership.full_name || '').trim()) {
			setMessage('', 'Full name is required when creating a new user.');
			return;
		}
		try {
			busy = true;
			const result = await api(`/api/groups/${slug}/membership/members/manual`, {
				method: 'POST',
				body: JSON.stringify({
					...manualMembership
				})
			});
			manualMembership = {
				user_email: '',
				full_name: '',
				tier_id: '',
				status: 'active'
			};
			manualUserLookup = {
				checking: false,
				checked_email: '',
				found: null,
				full_name: ''
			};
			setMessage(
				result?.invite_sent
					? 'Manual membership created and invite email sent to new user.'
					: 'Manual membership created.'
			);
			await refreshMembers();
		} catch (createError) {
			setMessage('', createError?.message || 'Unable to create manual membership.');
		} finally {
			busy = false;
		}
	}

	function queueManualEmailLookup() {
		if (manualLookupTimer) clearTimeout(manualLookupTimer);
		const email = String(manualMembership.user_email || '').trim().toLowerCase();
		if (!email || !email.includes('@')) {
			manualUserLookup = {
				checking: false,
				checked_email: email,
				found: null,
				full_name: ''
			};
			return;
		}
		manualLookupTimer = setTimeout(async () => {
			try {
				manualUserLookup = { ...manualUserLookup, checking: true };
				const result = await api(
					`/api/groups/${slug}/membership/members/lookup?email=${encodeURIComponent(email)}`
				);
				manualUserLookup = {
					checking: false,
					checked_email: email,
					found: result?.found === true,
					full_name: result?.full_name || ''
				};
				if (result?.found === true && result?.full_name) {
					manualMembership = { ...manualMembership, full_name: result.full_name };
				}
			} catch {
				manualUserLookup = {
					checking: false,
					checked_email: email,
					found: null,
					full_name: ''
				};
			}
		}, 350);
	}

	$effect(() => {
		if (tiers.length === 1 && !manualMembership.tier_id) {
			manualMembership = { ...manualMembership, tier_id: tiers[0].id };
		}
	});

	async function updateMember(member, patch) {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/members/${member.id}/status`, {
				method: 'POST',
				body: JSON.stringify(patch)
			});
			setMessage('Member updated.');
			await refreshMembers();
		} catch (updateError) {
			setMessage('', updateError?.message || 'Unable to update member.');
		} finally {
			busy = false;
		}
	}

	async function createCampaign() {
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/emails`, {
				method: 'POST',
				body: JSON.stringify({
					campaign_name: campaignDraft.campaign_name,
					subject_template: campaignDraft.subject_template,
					body_template: campaignDraft.body_template,
					audience_filters: {
						statuses: campaignDraft.audience_statuses
					}
				})
			});
			campaignDraft = {
				campaign_name: '',
				subject_template: '',
				body_template: '',
				audience_statuses: ['active']
			};
			setMessage('Email campaign saved.');
			await refreshEmailHistory();
		} catch (createError) {
			setMessage('', createError?.message || 'Unable to create campaign.');
		} finally {
			busy = false;
		}
	}

	async function sendCampaignNow(campaignId) {
		if (!confirm('Send this campaign now?')) return;
		try {
			busy = true;
			const result = await api(`/api/groups/${slug}/membership/emails/${campaignId}/send-now`, {
				method: 'POST'
			});
			setMessage(
				`Campaign sent: ${result?.sent_count || 0} sent, ${result?.failed_count || 0} failed.`
			);
			await refreshEmailHistory();
		} catch (sendError) {
			setMessage('', sendError?.message || 'Unable to send campaign.');
		} finally {
			busy = false;
		}
	}

	async function scheduleCampaign(campaignId) {
		const scheduledAt = scheduleByEmail[campaignId];
		if (!scheduledAt) {
			setMessage('', 'Choose a schedule time first.');
			return;
		}
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/emails/${campaignId}/schedule`, {
				method: 'POST',
				body: JSON.stringify({ scheduled_at: new Date(scheduledAt).toISOString() })
			});
			setMessage('Campaign scheduled.');
			await refreshEmailHistory();
		} catch (scheduleError) {
			setMessage('', scheduleError?.message || 'Unable to schedule campaign.');
		} finally {
			busy = false;
		}
	}

	const pendingApplications = $derived(
		applications.filter((entry) => ['submitted', 'under_review', 'approved', 'payment_pending'].includes(entry.status))
	);
	const failedBillingMembers = $derived(members.filter((member) => member.status === 'past_due'));
	const hasPaidOrCustomTiers = $derived(
		tiers.some(
			(tier) =>
				Number(tier.monthly_amount_cents ?? tier.amount_cents ?? 0) > 0 ||
				Number(tier.annual_amount_cents || 0) > 0 ||
				tier.allow_custom_amount === true
		)
	);
	const stripeReady = $derived(
		Boolean(stripeConnection?.connected === true && stripeConnection?.charges_enabled === true)
	);
	let presetTierDrafts = $state(buildPresetTierDrafts());
	let showPresetTierEditor = $state(false);

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
			await refreshProgram();
		} catch (seedError) {
			setMessage('', seedError?.message || 'Unable to install default tier catalog.');
		} finally {
			busy = false;
		}
	}

	function selectPresetDefault(index) {
		presetTierDrafts = presetTierDrafts.map((draft, draftIndex) => ({
			...draft,
			is_default: draft.enabled && draftIndex === index
		}));
	}

	async function savePresetTierDrafts() {
		const selectedDrafts = presetTierDrafts.filter(
			(draft) => draft.enabled && String(draft.name || '').trim().length > 0
		);
		if (!selectedDrafts.length) {
			setMessage('', 'Enable at least one preset tier before saving.');
			return;
		}

		if (!selectedDrafts.some((draft) => draft.is_default)) {
			selectedDrafts[0].is_default = true;
		}

		try {
			busy = true;
			for (const [index, draft] of selectedDrafts.entries()) {
				await api(`/api/groups/${slug}/membership/tiers`, {
					method: 'POST',
					body: JSON.stringify({
						name: draft.name,
						description: draft.description,
						monthly_amount_cents:
							draft.monthly_amount_cents === null || draft.monthly_amount_cents === ''
								? null
								: Number(draft.monthly_amount_cents || 0),
						annual_amount_cents:
							draft.annual_amount_cents === null || draft.annual_amount_cents === ''
								? null
								: Number(draft.annual_amount_cents || 0),
						currency: 'usd',
						is_default: draft.is_default === true,
						is_active: draft.is_active !== false,
						sort_order: index,
						allow_custom_amount: draft.allow_custom_amount === true,
						min_amount_cents:
							draft.allow_custom_amount === true ? Number(draft.min_amount_cents || 0) : null
					})
				});
			}
			setMessage(`Created ${selectedDrafts.length} preset tiers.`);
			await refreshProgram();
		} catch (saveError) {
			setMessage('', saveError?.message || 'Unable to save preset tiers.');
		} finally {
			busy = false;
		}
	}

	async function createRecommendedTiersNow() {
		showPresetTierEditor = false;
		await savePresetTierDrafts();
	}

</script>

<div class="membership-manage space-y-6 pb-10">
	<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-xl font-bold">Membership</h2>
				<p class="text-surface-600-400 text-sm">
					Set up joining, tiers, members, and member messages.
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<button type="button" class="btn btn-sm preset-tonal-surface" onclick={copyMembershipLink}>
					Copy Join Link
				</button>
				{#if busy}
					<div class="flex items-center gap-2 text-sm opacity-75">
						<IconLoader class="h-4 w-4 animate-spin" /> Saving...
					</div>
				{/if}
			</div>
		</div>

		{#if notice}
			<div class="text-success-600-400 text-sm">{notice}</div>
		{/if}
		{#if error}
			<div class="text-error-600-400 text-sm">{error}</div>
		{/if}

		<nav class="flex flex-wrap gap-2" aria-label="Membership tabs">
			{#each TAB_OPTIONS as tab}
				{@const Icon = tab.icon}
				<button
					type="button"
					class="btn btn-sm {activeTab === tab.id ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
					onclick={() => {
						activeTab = tab.id;
					}}
				>
					<Icon class="h-4 w-4" /> {tab.label}
				</button>
			{/each}
		</nav>
	</section>

	{#if activeTab === 'setup'}
		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
			<h3 class="text-lg font-semibold">Program</h3>
			<div class="grid gap-4 md:grid-cols-2">
				<div class="space-y-3">
					<label class="text-sm font-medium">Membership enabled</label>
					<Toggle
						name="membership-enabled"
						checked={program.enabled !== false}
						onChange={(value) => {
							program = { ...program, enabled: value };
						}}
					/>
				</div>
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">Access mode</span>
					<select
						class="select preset-tonal-surface"
						value={program.access_mode}
						onchange={(event) => {
							program = { ...program, access_mode: event.currentTarget.value };
						}}
					>
						<option value="public">Public</option>
						<option value="private_request">Private (review before join)</option>
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">Contribution mode</span>
					<select
						class="select preset-tonal-surface"
						value={program.contribution_mode}
						onchange={(event) => {
							program = { ...program, contribution_mode: event.currentTarget.value };
						}}
					>
						<option value="donation">Donation ($0 default)</option>
						<option value="paid">Paid (requires payment)</option>
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">Default tier</span>
					<select
						class="select preset-tonal-surface"
						value={program.default_tier_id || ''}
						onchange={(event) => {
							program = { ...program, default_tier_id: event.currentTarget.value || null };
						}}
					>
						<option value="">No default selection</option>
						{#each tiers as tier (tier.id)}
							<option value={tier.id}>{tier.name}</option>
						{/each}
					</select>
				</label>
				<label class="md:col-span-2 flex flex-col gap-1.5">
					<span class="text-sm font-medium">CTA label</span>
					<input
						class="input preset-tonal-surface"
						value={program.cta_label || ''}
						oninput={(event) => {
							program = { ...program, cta_label: event.currentTarget.value };
						}}
						maxlength="80"
					/>
				</label>
			</div>
			<div class="flex justify-end">
				<button type="button" class="btn preset-filled-primary-500" onclick={saveProgramSettings}>
					<IconSave class="h-4 w-4" /> Save Program
				</button>
			</div>

			<details class="rounded-xl border border-surface-400-600/30 p-3" open>
				<summary class="cursor-pointer text-base font-semibold">Policy</summary>
				<div class="space-y-3 pt-3">
					<div class="flex items-center justify-between">
						<div class="text-xs opacity-70">Version {program.policy_version || 1}</div>
					</div>
					<textarea
						class="textarea preset-tonal-surface min-h-52"
						bind:value={program.policy_markdown}
						placeholder="Membership policy"
					></textarea>
					<button type="button" class="btn preset-filled-primary-500" onclick={savePolicy}>
						<IconSave class="h-4 w-4" /> Save Policy Version
					</button>
				</div>
			</details>
		</section>

		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 class="text-lg font-semibold">Tiers</h3>
					<p class="text-sm opacity-70">
						Use 4 starter tiers: free, low-cost, higher support, and pay-what-you-want.
					</p>
				</div>
				{#if tiers.length > 0}
					<button type="button" class="btn btn-sm preset-filled-primary-500" onclick={installDefaultTiers}>
						<IconPlus class="h-4 w-4" /> Reapply Recommended Tiers
					</button>
				{/if}
			</div>
			<div class="space-y-3">
				{#if tiers.length === 0}
					<div class="space-y-3">
						<div class="rounded-xl border border-warning-500/35 bg-warning-500/10 p-3 text-sm">
							<div class="font-semibold">Recommended tiers are not live yet.</div>
							<div class="opacity-85">
								Nothing is applied until you click <span class="font-semibold">Create 4 Recommended Tiers</span>.
							</div>
						</div>
						<div class="space-y-2">
							{#each RECOMMENDED_TIER_PRESETS as preset}
								<div class="border-surface-400-600/30 bg-surface-900/20 rounded-xl border p-3 opacity-80">
									<div class="flex items-center justify-between gap-3">
										<div class="font-medium">{preset.name}</div>
										<div class="text-sm">
											{formatDollarLabel(preset.monthly_amount_cents)}/month · {formatDollarLabel(preset.annual_amount_cents)}/year
										</div>
									</div>
									<div class="text-xs opacity-70">{preset.description}</div>
								</div>
							{/each}
						</div>
						<div class="flex flex-wrap justify-end gap-2">
							<button
								type="button"
								class="btn btn-sm preset-tonal-surface"
								onclick={() => {
									showPresetTierEditor = !showPresetTierEditor;
								}}
							>
								{showPresetTierEditor ? 'Hide Customizer' : 'Customize Before Create'}
							</button>
							<button
								type="button"
								class="btn btn-sm preset-filled-primary-500"
								onclick={createRecommendedTiersNow}
							>
								<IconSave class="h-4 w-4" /> Create 4 Recommended Tiers
							</button>
						</div>
						{#if showPresetTierEditor}
							{#each presetTierDrafts as draft, index (`preset-${index}`)}
								<div class="border-surface-400-600/40 bg-surface-900/30 rounded-xl border p-3 opacity-70">
								<div class="mb-2 flex items-center justify-between gap-3">
									<label class="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											class="preset-tonal-surface"
											checked={draft.enabled !== false}
											onchange={(event) => {
												presetTierDrafts[index].enabled = event.currentTarget.checked;
												presetTierDrafts = [...presetTierDrafts];
											}}
										/>
										<span>Include preset</span>
									</label>
									<label class="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="preset-default-tier"
											class="preset-tonal-surface"
											checked={draft.is_default === true}
											disabled={draft.enabled === false}
											onchange={() => selectPresetDefault(index)}
										/>
										<span>Default</span>
									</label>
								</div>
								<div class="grid gap-3 md:grid-cols-6">
									<input
										class="input preset-tonal-surface md:col-span-2"
										value={draft.name}
										oninput={(event) => {
											presetTierDrafts[index].name = event.currentTarget.value;
											presetTierDrafts = [...presetTierDrafts];
										}}
										placeholder="Tier name"
									/>
									<input
										class="input preset-tonal-surface md:col-span-2"
										value={draft.description}
										oninput={(event) => {
											presetTierDrafts[index].description = event.currentTarget.value;
											presetTierDrafts = [...presetTierDrafts];
										}}
										placeholder="Description"
									/>
									<div class="flex items-center">
										<span class="border border-r-0 border-surface-400-600/40 rounded-l-md px-3 py-2 text-sm opacity-80">$</span>
										<input
											type="text"
											inputmode="decimal"
											class="input preset-tonal-surface rounded-l-none"
											value={centsToDollarInput(draft.monthly_amount_cents)}
											oninput={(event) => {
												presetTierDrafts[index].monthly_amount_cents = dollarInputToCents(
													event.currentTarget.value
												);
												presetTierDrafts = [...presetTierDrafts];
											}}
											placeholder="Monthly (optional)"
										/>
									</div>
									<div class="flex items-center">
										<span class="border border-r-0 border-surface-400-600/40 rounded-l-md px-3 py-2 text-sm opacity-80">$</span>
										<input
											type="text"
											inputmode="decimal"
											class="input preset-tonal-surface rounded-l-none"
											value={centsToDollarInput(draft.annual_amount_cents)}
											oninput={(event) => {
												presetTierDrafts[index].annual_amount_cents = dollarInputToCents(
													event.currentTarget.value
												);
												presetTierDrafts = [...presetTierDrafts];
											}}
											placeholder="Annual (optional)"
										/>
									</div>
									<label class="flex items-center gap-2 text-sm md:col-span-2">
										<input
											type="checkbox"
											class="preset-tonal-surface"
											checked={draft.allow_custom_amount === true}
											onchange={(event) => {
												presetTierDrafts[index].allow_custom_amount = event.currentTarget.checked;
												presetTierDrafts = [...presetTierDrafts];
											}}
										/>
										<span>Allow custom amount</span>
									</label>
									{#if draft.allow_custom_amount}
										<div class="flex items-center">
											<span class="border border-r-0 border-surface-400-600/40 rounded-l-md px-3 py-2 text-sm opacity-80">$</span>
											<input
												type="text"
												inputmode="decimal"
												class="input preset-tonal-surface rounded-l-none"
												value={centsToDollarInput(draft.min_amount_cents)}
												oninput={(event) => {
													presetTierDrafts[index].min_amount_cents =
														dollarInputToCents(event.currentTarget.value) ?? 0;
													presetTierDrafts = [...presetTierDrafts];
												}}
												placeholder="Minimum"
											/>
										</div>
									{/if}
								</div>
							</div>
							{/each}
							<div class="flex justify-end">
								<button
									type="button"
									class="btn btn-sm preset-filled-primary-500"
									onclick={savePresetTierDrafts}
								>
									<IconSave class="h-4 w-4" /> Create Customized Tiers
								</button>
							</div>
						{/if}
					</div>
				{/if}
				{#each tiers as tier (tier.id)}
					<div class="border-surface-400-600/30 rounded-xl border p-3">
						<div class="grid gap-3 md:grid-cols-6">
							<input
								class="input preset-tonal-surface md:col-span-2"
								value={tier.name}
								oninput={(event) => {
									tier.name = event.currentTarget.value;
									tiers = [...tiers];
								}}
							/>
							<div class="flex items-center">
								<span class="border border-r-0 border-surface-400-600/40 rounded-l-md px-3 py-2 text-sm opacity-80">$</span>
								<input
									type="text"
									inputmode="decimal"
									class="input preset-tonal-surface rounded-l-none"
									value={centsToDollarInput(tier.monthly_amount_cents ?? tier.amount_cents)}
									oninput={(event) => {
										const next = dollarInputToCents(event.currentTarget.value);
										tier.monthly_amount_cents = next;
										tier.amount_cents = next ?? 0;
										tiers = [...tiers];
									}}
									placeholder="Monthly"
								/>
							</div>
							<div class="flex items-center">
								<span class="border border-r-0 border-surface-400-600/40 rounded-l-md px-3 py-2 text-sm opacity-80">$</span>
								<input
									type="text"
									inputmode="decimal"
									class="input preset-tonal-surface rounded-l-none"
									value={centsToDollarInput(tier.annual_amount_cents)}
									oninput={(event) => {
										tier.annual_amount_cents = dollarInputToCents(event.currentTarget.value);
										tiers = [...tiers];
									}}
									placeholder="Annual"
								/>
							</div>
							<div class="flex items-center gap-2">
								<button type="button" class="btn btn-sm preset-tonal-primary" onclick={() => saveTier(tier)}>
									Save
								</button>
								<button
									type="button"
									class="btn btn-sm preset-tonal-error"
									onclick={() => removeTier(tier.id)}
								>
									<IconTrash class="h-4 w-4" />
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="border-surface-400-600/30 rounded-xl border p-3">
				<div class="mb-2 text-sm font-semibold">Create tier</div>
				<div class="grid gap-3 md:grid-cols-6">
					<input class="input preset-tonal-surface md:col-span-2" bind:value={newTier.name} placeholder="Tier name" />
					<input class="input preset-tonal-surface md:col-span-2" bind:value={newTier.description} placeholder="Description" />
					<div class="flex items-center">
						<span class="border border-r-0 border-surface-400-600/40 rounded-l-md px-3 py-2 text-sm opacity-80">$</span>
						<input
							type="text"
							inputmode="decimal"
							class="input preset-tonal-surface rounded-l-none"
							value={centsToDollarInput(newTier.monthly_amount_cents)}
							oninput={(event) => {
								newTier = {
									...newTier,
									monthly_amount_cents: dollarInputToCents(event.currentTarget.value)
								};
							}}
							placeholder="Monthly (optional)"
						/>
					</div>
					<div class="flex items-center">
						<span class="border border-r-0 border-surface-400-600/40 rounded-l-md px-3 py-2 text-sm opacity-80">$</span>
						<input
							type="text"
							inputmode="decimal"
							class="input preset-tonal-surface rounded-l-none"
							value={centsToDollarInput(newTier.annual_amount_cents)}
							oninput={(event) => {
								newTier = {
									...newTier,
									annual_amount_cents: dollarInputToCents(event.currentTarget.value)
								};
							}}
							placeholder="Annual (optional)"
						/>
					</div>
				</div>
				<div class="mt-3 flex items-center gap-3">
					<Toggle
						name="new-tier-default"
						checked={newTier.is_default}
						onChange={(value) => {
							newTier = { ...newTier, is_default: value };
						}}
					/>
					<span class="text-sm">Set as default tier</span>
					<button type="button" class="btn btn-sm preset-filled-primary-500 ml-auto" onclick={createTier}>
						<IconPlus class="h-4 w-4" /> Add Tier
					</button>
				</div>
			</div>
		</section>
	{/if}

	{#if activeTab === 'setup'}
		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
			<details class="rounded-xl border border-surface-400-600/30 p-3">
				<summary class="cursor-pointer text-lg font-semibold">Application Form Builder (Optional)</summary>
				<div class="mt-3 space-y-4">
					<div class="rounded-xl border border-surface-400-600/30 bg-surface-900/20 p-3 space-y-2">
						<div class="text-sm font-semibold">Profile Fields (Always Included)</div>
						<p class="text-xs opacity-70">
							These are collected from the member profile at submission time and can be updated by the member on the join/apply form.
						</p>
						<div class="grid gap-2 md:grid-cols-3">
							<input class="input preset-tonal-surface opacity-70" value="Full name" disabled />
							<input class="input preset-tonal-surface opacity-70" value="Email" disabled />
							<input class="input preset-tonal-surface opacity-70" value="Phone" disabled />
						</div>
					</div>
					{#if formFields.length === 0}
						<p class="text-sm opacity-70">No custom fields yet.</p>
					{/if}
					{#each formFields as field (field.id)}
						<div class="border-surface-400-600/30 rounded-xl border p-3">
							<div class="grid gap-3 md:grid-cols-4">
								<input
									class="input preset-tonal-surface md:col-span-2"
									value={field.label}
									oninput={(event) => {
										field.label = event.currentTarget.value;
										formFields = [...formFields];
									}}
								/>
								<select
									class="select preset-tonal-surface"
									value={field.field_type}
									onchange={(event) => {
										field.field_type = event.currentTarget.value;
										formFields = [...formFields];
									}}
								>
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
								<div class="flex items-center gap-2 justify-end">
									<button type="button" class="btn btn-sm preset-tonal-primary" onclick={() => saveField(field)}>
										Save
									</button>
									<button
										type="button"
										class="btn btn-sm preset-tonal-error"
										onclick={() => removeField(field.id)}
									>
										<IconTrash class="h-4 w-4" />
									</button>
								</div>
							</div>
							<div class="mt-2 flex items-center gap-3 text-sm">
								<Toggle
									name={`required-${field.id}`}
									checked={field.required === true}
									onChange={(value) => {
										field.required = value;
										formFields = [...formFields];
									}}
								/>
								<span>Required</span>
							</div>
						</div>
					{/each}

					<div class="border-surface-400-600/30 rounded-xl border p-3">
						<div class="mb-2 text-sm font-semibold">Add field</div>
						<div class="grid gap-3 md:grid-cols-4">
							<input class="input preset-tonal-surface md:col-span-2" bind:value={newField.label} placeholder="Field label" />
							<select class="select preset-tonal-surface" bind:value={newField.field_type}>
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
							<input class="input preset-tonal-surface" bind:value={newField.help_text} placeholder="Help text" />
						</div>
						{#if newField.field_type === 'select' || newField.field_type === 'multiselect'}
							<textarea
								class="textarea preset-tonal-surface mt-3"
								bind:value={newField.options_text}
								placeholder="Options, one per line"
							></textarea>
						{/if}
						<div class="mt-3 flex items-center gap-3">
							<Toggle
								name="new-field-required"
								checked={newField.required === true}
								onChange={(value) => {
									newField = { ...newField, required: value };
								}}
							/>
							<span class="text-sm">Required</span>
							<button type="button" class="btn btn-sm preset-filled-primary-500 ml-auto" onclick={createField}>
								<IconPlus class="h-4 w-4" /> Add Field
							</button>
						</div>
					</div>
				</div>
			</details>
		</section>
	{/if}

	{#if activeTab === 'members'}
		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
			<h3 class="text-lg font-semibold">Application Queue</h3>
			{#if applications.length === 0}
				<p class="text-sm opacity-70">No applications yet.</p>
			{/if}
			{#each applications as app (app.id)}
				<div class="border-surface-400-600/30 rounded-xl border p-3 space-y-2">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div>
							<div class="font-medium">{app.applicant_profile?.full_name || app.applicant_profile?.email || app.user_id}</div>
							<div class="text-xs opacity-70">{app.selected_tier?.name || 'No tier selected'} · {app.status}</div>
						</div>
						<div class="text-xs opacity-70">Submitted {new Date(app.submitted_at).toLocaleString()}</div>
					</div>
					<textarea
						class="textarea preset-tonal-surface"
						placeholder="Review notes"
						value={appNotes[app.id] || app.review_notes || ''}
						oninput={(event) => {
							appNotes = { ...appNotes, [app.id]: event.currentTarget.value };
						}}
					></textarea>
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="btn btn-sm preset-tonal-success"
							onclick={() => approveApplication(app.id)}
							disabled={['rejected', 'completed', 'withdrawn'].includes(app.status)}
						>
							Approve
						</button>
						<button
							type="button"
							class="btn btn-sm preset-tonal-error"
							onclick={() => rejectApplication(app.id)}
							disabled={['completed', 'withdrawn', 'rejected'].includes(app.status)}
						>
							Reject
						</button>
					</div>
				</div>
			{/each}
		</section>
	{/if}

	{#if activeTab === 'members'}
		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
			<h3 class="text-lg font-semibold">Member Roster</h3>
			{#if members.length === 0}
				<p class="text-sm opacity-70">No members yet.</p>
			{/if}
			<div class="space-y-2">
				{#each members as member (member.id)}
					<div class="border-surface-400-600/30 rounded-xl border p-3 flex flex-wrap items-center gap-3">
						<div class="min-w-48 flex-1">
							<div class="font-medium">{member.profile?.full_name || member.profile?.email || member.user_id}</div>
							<div class="text-xs opacity-70">{member.tier?.name || 'No tier'} · {member.source}</div>
						</div>
						<select
							class="select preset-tonal-surface w-40"
							value={member.status}
							onchange={(event) => {
								member.status = event.currentTarget.value;
								members = [...members];
							}}
						>
							{#each STATUS_OPTIONS as status}
								<option value={status}>{status}</option>
							{/each}
						</select>
						<button
							type="button"
							class="btn btn-sm preset-tonal-primary"
							onclick={() => updateMember(member, { status: member.status })}
						>
							Save
						</button>
					</div>
				{/each}
			</div>
		</section>

		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
			<h3 class="text-lg font-semibold">Manual / Offline Membership</h3>
			<p class="text-sm opacity-70">
				Enter a member email. If no account exists yet, we will create one, send an invite email, and attach the membership.
			</p>
			<div class="grid gap-3 md:grid-cols-2">
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">Member email</span>
					<input
						class="input preset-tonal-surface"
						type="email"
						bind:value={manualMembership.user_email}
						placeholder="name@example.com"
						oninput={queueManualEmailLookup}
					/>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">Tier</span>
					<select class="select preset-tonal-surface" bind:value={manualMembership.tier_id}>
						<option value="">Select tier</option>
						{#each tiers as tier (tier.id)}
							<option value={tier.id}>{tier.name}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">Status</span>
					<select class="select preset-tonal-surface" bind:value={manualMembership.status}>
						{#each STATUS_OPTIONS as status}
							<option value={status}>{status}</option>
						{/each}
					</select>
				</label>
				{#if manualUserLookup.checking}
					<div class="text-sm opacity-70 self-end">Checking email…</div>
				{:else if manualUserLookup.found === true}
					<div class="text-sm opacity-70 self-end">Existing user found. An invite will not be sent.</div>
				{:else if manualUserLookup.found === false}
					<div class="text-sm opacity-70 self-end">No user found. A new account and invite will be created.</div>
				{/if}
				{#if manualUserLookup.found !== true}
					<label class="flex flex-col gap-1.5 md:col-span-2">
						<span class="text-sm font-medium">Full name (for new account)</span>
						<input
							class="input preset-tonal-surface"
							bind:value={manualMembership.full_name}
							placeholder="Member full name"
						/>
					</label>
				{:else}
					<label class="flex flex-col gap-1.5 md:col-span-2">
						<span class="text-sm font-medium">Full name</span>
						<input
							class="input preset-tonal-surface opacity-70"
							value={manualMembership.full_name || manualUserLookup.full_name || 'Existing user'}
							disabled
						/>
					</label>
				{/if}
			</div>
			<button type="button" class="btn preset-filled-primary-500" onclick={addManualMembership}>
				<IconPlus class="h-4 w-4" /> Add Manual Membership
			</button>
		</section>
	{/if}

	{#if activeTab === 'setup'}
		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
			<h3 class="text-lg font-semibold">Billing</h3>
			<div class="rounded-xl border border-surface-400-600/30 p-4 space-y-2">
				<div class="text-base font-semibold">Stripe Connection</div>
				{#if stripeReady}
					<p class="text-sm text-success-600-400">
						Stripe is connected and charges are enabled. Paid membership checkout is ready.
					</p>
				{:else if hasPaidOrCustomTiers}
					<p class="text-sm">
						Paid or pay-what-you-want tiers are configured, but Stripe is not fully connected yet. Connect Stripe to start collecting payments.
					</p>
				{:else}
					<p class="text-sm">
						Connect Stripe now so your paid tiers and donation-style memberships are ready when you turn them on.
					</p>
				{/if}
				<a
					class="btn btn-sm preset-filled-primary-500"
					href={`/api/donations/connect/start?recipient=group&group=${encodeURIComponent(slug)}`}
				>
					<IconCreditCard class="h-4 w-4" /> Connect Stripe
				</a>
			</div>

			<details class="rounded-xl border border-surface-400-600/30 p-3">
				<summary class="cursor-pointer text-sm font-semibold">Advanced Billing Details</summary>
				<div class="mt-3 space-y-4">
					<div class="grid gap-4 md:grid-cols-3">
						<div class="rounded-xl border border-surface-400-600/30 p-3">
							<div class="text-xs uppercase tracking-wide opacity-70">Members with billing profile</div>
							<div class="mt-1 text-2xl font-bold">{members.filter((m) => m.billing).length}</div>
						</div>
						<div class="rounded-xl border border-surface-400-600/30 p-3">
							<div class="text-xs uppercase tracking-wide opacity-70">Past due</div>
							<div class="mt-1 text-2xl font-bold">{failedBillingMembers.length}</div>
						</div>
						<div class="rounded-xl border border-surface-400-600/30 p-3">
							<div class="text-xs uppercase tracking-wide opacity-70">Pending applications</div>
							<div class="mt-1 text-2xl font-bold">{pendingApplications.length}</div>
						</div>
					</div>

					<div class="space-y-2">
						<h4 class="text-base font-semibold">Failed payment queue</h4>
						{#if failedBillingMembers.length === 0}
							<p class="text-sm opacity-70">No members are currently marked `past_due`.</p>
						{:else}
							{#each failedBillingMembers as member (member.id)}
								<div class="rounded-xl border border-error-500/30 bg-error-500/8 p-3">
									<div class="font-medium">{member.profile?.full_name || member.profile?.email || member.user_id}</div>
									<div class="text-xs opacity-80">
										Last status: {member.billing?.last_payment_status || 'unknown'} · Next billing: {member.billing?.next_billing_at ? new Date(member.billing.next_billing_at).toLocaleString() : 'n/a'}
									</div>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</details>
		</section>
	{/if}

	{#if activeTab === 'messages'}
		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
			<h3 class="text-lg font-semibold">Send A Member Message</h3>
			<div class="grid gap-3 md:grid-cols-2">
				<input class="input preset-tonal-surface" bind:value={campaignDraft.campaign_name} placeholder="Campaign name" />
				<input class="input preset-tonal-surface" bind:value={campaignDraft.subject_template} placeholder="Subject template" />
			</div>
			<textarea
				class="textarea preset-tonal-surface min-h-40"
				bind:value={campaignDraft.body_template}
				placeholder={CAMPAIGN_BODY_PLACEHOLDER}
			></textarea>
			<div class="space-y-2">
				<div class="text-sm font-medium">Audience statuses</div>
				<div class="flex flex-wrap gap-2">
					{#each STATUS_OPTIONS as status}
						<label class="chip preset-tonal-surface inline-flex items-center gap-2 px-3 py-1.5">
								<input
									type="checkbox"
									class="preset-tonal-surface"
									checked={campaignDraft.audience_statuses.includes(status)}
								onchange={(event) => {
									if (event.currentTarget.checked) {
										campaignDraft = {
											...campaignDraft,
											audience_statuses: Array.from(
												new Set([...campaignDraft.audience_statuses, status])
											)
										};
									} else {
										campaignDraft = {
											...campaignDraft,
											audience_statuses: campaignDraft.audience_statuses.filter((s) => s !== status)
										};
									}
								}}
							/>
							<span>{status}</span>
						</label>
					{/each}
				</div>
			</div>
			<button type="button" class="btn preset-filled-primary-500" onclick={createCampaign}>
				<IconSave class="h-4 w-4" /> Save Campaign
			</button>
		</section>

		<section class="card border-surface-300-700 bg-surface-100-900/70 space-y-4 rounded-2xl border p-4">
			<h3 class="text-lg font-semibold">Campaign History</h3>
			{#if emailHistory.length === 0}
				<p class="text-sm opacity-70">No campaigns yet.</p>
			{/if}
			{#each emailHistory as campaign (campaign.id)}
				<div class="border-surface-400-600/30 rounded-xl border p-3 space-y-2">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div>
							<div class="font-medium">{campaign.campaign_name}</div>
							<div class="text-xs opacity-70">
								Status: {campaign.status} · Sent: {campaign.sent_count || 0} · Failed: {campaign.failed_count || 0}
							</div>
						</div>
						<div class="text-xs opacity-70">Created {new Date(campaign.created_at).toLocaleString()}</div>
					</div>
					<div class="grid gap-2 md:grid-cols-[auto_1fr]">
						<button type="button" class="btn btn-sm preset-filled-primary-500" onclick={() => sendCampaignNow(campaign.id)}>
							<IconSend class="h-4 w-4" /> Send Now
						</button>
						<details class="rounded-xl border border-surface-400-600/30 p-2">
							<summary class="cursor-pointer text-sm font-medium">Schedule Later</summary>
							<div class="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
								<input
									type="datetime-local"
									class="input preset-tonal-surface"
									value={scheduleByEmail[campaign.id] || ''}
									oninput={(event) => {
										scheduleByEmail = { ...scheduleByEmail, [campaign.id]: event.currentTarget.value };
									}}
								/>
								<button
									type="button"
									class="btn btn-sm preset-tonal-primary"
									onclick={() => scheduleCampaign(campaign.id)}
								>
									<IconCalendarClock class="h-4 w-4" /> Schedule
								</button>
							</div>
						</details>
					</div>
				</div>
			{/each}
		</section>
	{/if}
</div>
