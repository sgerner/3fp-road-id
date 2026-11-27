<script>
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import IconLoader from '@lucide/svelte/icons/loader-circle';
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
	import IconFileText from '@lucide/svelte/icons/file-text';
	import { slide } from 'svelte/transition';
	import GroupStripePaymentCard from '#lib/components/groups/GroupStripePaymentCard.svelte';
	import ManageActionRow from '#lib/components/groups/ManageActionRow.svelte';
	import ManageCardHeader from '#lib/components/groups/ManageCardHeader.svelte';
	import {
		normalizeMembershipManageViewParam,
		resolveInitialMembershipManageView
	} from '#lib/groups/membershipHandoff';

	/** @type {Record<string, any>} */
	let { data } = $props();

	/** @type {any} */
	const slug = $derived(data?.slug || data?.program_data?.group?.slug || '');
	const groupInfo = $derived(data?.program_data?.group || null);
	const MAX_TIER_PRICE_CENTS = 2_147_483_647;
	const TIER_PRICE_ERROR =
		'Enter a non-negative amount with up to two decimals (maximum $21,474,836.47).';
	/** @type {any} */
	const DEFAULT_PROGRAM = {
		enabled: true,
		access_mode: 'public',
		cta_label: 'Follow',
		contribution_mode: 'donation',
		default_tier_id: null,
		policy_markdown: `By joining, you agree to this membership policy.\n\nCancellation:\n- You can cancel anytime.\n- Cancellation takes effect at the end of your current billing cycle.\n\nRefunds:\n- Payments are non-refundable unless required by law.\n\nQuestions:\n- Contact group organizers through the group page.`,
		policy_version: 1
	};

	/**
	 * @param {any} rawProgram
	 * @param {any} rawTiers
	 */
	function syncInitialProgramAndTiers(rawProgram, rawTiers) {
		/** @type {any} */
		const nextProgram = structuredClone(rawProgram || DEFAULT_PROGRAM);
		/** @type {any[]} */
		const nextTiers = Array.isArray(rawTiers) ? structuredClone(rawTiers) : [];
		const activeDefaultId =
			(nextProgram.default_tier_id &&
				nextTiers.find((t) => t.id === nextProgram.default_tier_id && t.is_active !== false)?.id) ||
			nextTiers.find((t) => t.is_default === true && t.is_active !== false)?.id ||
			null;
		nextProgram.default_tier_id = activeDefaultId;
		for (const tier of nextTiers) {
			tier.is_default = Boolean(activeDefaultId && tier.id === activeDefaultId);
		}
		return { nextProgram, nextTiers };
	}

	const initialSynced = untrack(() =>
		syncInitialProgramAndTiers(data?.program_data?.program, data?.program_data?.tiers)
	);

	// Notification states
	/** @type {any} */
	let busy = $state(false);
	let savingProgram = $state(false);
	/** @type {any} */
	let notice = $state('');
	/** @type {any} */
	let error = $state('');

	// Data
	/** @type {any} */
	let program = $state(initialSynced.nextProgram);
	/** @type {any[]} */
	let tiers = $state(initialSynced.nextTiers);
	/** @type {any} */
	let stripeConnectionState = $state(
		untrack(() =>
			data?.program_data?.stripe_connection
				? structuredClone(data.program_data.stripe_connection)
				: null
		)
	);
	/** @type {any} */
	let tierPriceDrafts = $state({});
	/** @type {any} */
	let formFields = $state(
		untrack(() =>
			Array.isArray(data?.program_data?.form_fields)
				? structuredClone(data.program_data.form_fields)
				: []
		)
	);
	/** @type {any} */
	let applications = $state(
		untrack(() => (Array.isArray(data?.applications) ? structuredClone(data.applications) : []))
	);
	/** @type {any} */
	let members = $state(
		untrack(() => (Array.isArray(data?.members) ? structuredClone(data.members) : []))
	);

	// Split Management View ('members' | 'program')
	let activeView = $state(
		untrack(() =>
			resolveInitialMembershipManageView({
				requestedView: data?.initial_view,
				tiers: initialSynced.nextTiers
			})
		)
	);

	$effect(() => {
		const urlView = normalizeMembershipManageViewParam(
			page.url.searchParams.get('view') || page.url.searchParams.get('tab')
		);
		if (urlView && urlView !== untrack(() => activeView)) {
			activeView = urlView;
		}
	});

	/**
	 * @param {'members' | 'program' | string} view
	 */
	function setActiveView(view) {
		const next = view === 'program' ? 'program' : 'members';
		activeView = next;
		if (typeof window !== 'undefined') {
			const nextUrl = new URL(window.location.href);
			nextUrl.searchParams.set('view', next);
			nextUrl.searchParams.delete('tab');
			try {
				replaceState(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`, page.state);
			} catch {
				window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
			}
		}
	}

	/**
	 * @param {KeyboardEvent} event
	 */
	function handleViewTabKeydown(event) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const nextView = activeView === 'members' ? 'program' : 'members';
		setActiveView(nextView);
		const targetId = nextView === 'program' ? 'membership-tab-program' : 'membership-tab-members';
		if (typeof document !== 'undefined') {
			document.getElementById(targetId)?.focus();
		}
	}

	// Filters
	const STATUS_OPTIONS = ['active', 'past_due', 'cancelled'];
	/** @type {any} */
	let memberFilterStatus = $state('all');
	/** @type {any} */
	let memberFilterQuery = $state('');
	/** @type {any} */
	let expandedMemberId = $state(null);

	// Manual membership
	/** @type {any} */
	let manualMembership = $state({
		user_email: '',
		full_name: '',
		tier_id: '',
		status: 'active'
	});
	/** @type {any} */
	let manualLookupState = $state({ checking: false, found: null, full_name: '' });
	/** @type {any} */
	let manualLookupTimer = null;

	// New tier form
	/** @type {any} */
	let newTier = $state({
		name: '',
		description: '',
		monthly_amount_cents: null,
		annual_amount_cents: null,
		is_default: false,
		is_active: true
	});

	// New form field
	/** @type {any} */
	let newField = $state({
		field_type: 'text',
		label: '',
		help_text: '',
		required: false,
		options_text: ''
	});

	// Computed
	/** @type {any} */
	const publicMembershipUrl = $derived(`/groups/${slug}/membership`);
	const activeTiers = $derived(tiers.filter((tier) => tier.is_active !== false));
	/** @type {any} */
	const pendingApplications = $derived(
		applications.filter((a) => ['submitted', 'under_review', 'payment_pending'].includes(a.status))
	);
	/** @type {any} */
	const filteredMembers = $derived(
		members.filter((m) => {
			if (memberFilterStatus !== 'all' && m.status !== memberFilterStatus) return false;
			if (!memberFilterQuery) return true;
			const query = memberFilterQuery.toLowerCase();
			return (
				(m.profile?.full_name || '').toLowerCase().includes(query) ||
				(m.profile?.email || '').toLowerCase().includes(query) ||
				(m.profile?.phone || '').toLowerCase().includes(query) ||
				(m.tier?.name || '').toLowerCase().includes(query)
			);
		})
	);
	/** @type {any} */
	const activeCount = $derived(members.filter((m) => m.status === 'active').length);
	/** @type {any} */
	const pastDueCount = $derived(members.filter((m) => m.status === 'past_due').length);
	const liveActivePaidTierCount = $derived(
		activeTiers.filter(
			(t) =>
				(t.monthly_amount_cents || 0) > 0 ||
				(t.annual_amount_cents || 0) > 0 ||
				(t.amount_cents || 0) > 0 ||
				(t.allow_custom_amount === true && program.contribution_mode === 'paid')
		).length
	);
	const liveActiveSubscriptionCount = $derived(
		members.filter(
			(/** @type {any} */ m) =>
				['active', 'past_due', 'paused'].includes(m.status) &&
				Boolean(m.billing?.stripe_subscription_id)
		).length
	);
	const hasPaidTiers = $derived(liveActivePaidTierCount > 0);
	const stripeReady = $derived(
		Boolean(stripeConnectionState?.connected && stripeConnectionState?.charges_enabled)
	);
	const effectiveBillingGuard = $derived({
		active_tier_count: activeTiers.length,
		active_paid_tier_count: Math.max(
			Number(stripeConnectionState?.active_paid_tier_count || 0),
			liveActivePaidTierCount
		),
		active_subscription_count: Math.max(
			Number(stripeConnectionState?.active_subscription_count || 0),
			liveActiveSubscriptionCount
		),
		past_due_count: Math.max(Number(stripeConnectionState?.past_due_count || 0), pastDueCount),
		manage_url: `/groups/${encodeURIComponent(slug)}/manage/membership?view=program`
	});

	const hasValidManualEmail = $derived(
		/^\S+@\S+\.\S+$/.test((manualMembership.user_email || '').trim())
	);
	const hasValidManualTier = $derived(
		Boolean(manualMembership.tier_id) &&
			activeTiers.some((tier) => tier.id === manualMembership.tier_id)
	);
	const canSubmitManualMember = $derived(!busy && hasValidManualEmail && hasValidManualTier);

	// Helpers
	/**
	 * @param {any} [nextNotice]
	 * @param {any} [nextError]
	 */
	function setMessage(nextNotice = '', nextError = '') {
		notice = nextNotice;
		error = nextError;
		if (nextNotice) setTimeout(() => (notice = ''), 4000);
	}

	/**
	 * @param {string | null | undefined} nextTierId
	 */
	function selectDefaultTier(nextTierId) {
		const normalized = nextTierId || null;
		program = {
			...program,
			default_tier_id: normalized
		};
		tiers = tiers.map((tier) => ({
			...tier,
			is_default: Boolean(normalized && tier.id === normalized)
		}));
	}

	/**
	 * @param {any} bundle
	 */
	function applyProgramBundle(bundle) {
		if (!bundle) return;
		const { nextProgram, nextTiers } = syncInitialProgramAndTiers(
			bundle.program || bundle,
			bundle.tiers ?? tiers
		);
		program = nextProgram;
		tiers = nextTiers;
		if (Array.isArray(bundle.form_fields)) {
			formFields = bundle.form_fields;
		}
		if (bundle.stripe_connection) {
			stripeConnectionState = bundle.stripe_connection;
		}
	}

	/**
	 * @param {any} cents
	 */
	function centsToDollar(cents) {
		if (cents === null || cents === undefined || cents === '') return '';
		return (cents / 100).toFixed(2);
	}

	/**
	 * @param {any} value
	 */
	function dollarToCents(value) {
		const raw = String(value ?? '').trim();
		if (!raw) return null;
		if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw)) return undefined;
		const num = Number(raw);
		const cents = Math.round(num * 100);
		return Number.isSafeInteger(cents) && cents <= MAX_TIER_PRICE_CENTS ? cents : undefined;
	}

	/**
	 * @param {any} id
	 * @param {any} field
	 * @param {any} cents
	 */
	function getTierPriceDraft(id, field, cents) {
		const key = `${id ?? 'new'}:${field}`;
		return Object.hasOwn(tierPriceDrafts, key) ? tierPriceDrafts[key] : centsToDollar(cents);
	}

	/**
	 * @param {any} id
	 * @param {any} field
	 * @param {any} value
	 */
	function setTierPriceDraft(id, field, value) {
		tierPriceDrafts[`${id ?? 'new'}:${field}`] = value;
	}

	/**
	 * @param {any} id
	 * @param {any} field
	 */
	function isTierPriceInvalid(id, field) {
		const key = `${id ?? 'new'}:${field}`;
		return Object.hasOwn(tierPriceDrafts, key) && dollarToCents(tierPriceDrafts[key]) === undefined;
	}

	/**
	 * @param {any} id
	 * @param {any} tier
	 * @param {any} field
	 */
	function commitTierPriceDraft(id, tier, field) {
		const key = `${id ?? 'new'}:${field}`;
		if (!Object.hasOwn(tierPriceDrafts, key)) return true;

		const cents = dollarToCents(tierPriceDrafts[key]);
		if (cents === undefined) return false;
		tier[field] = cents;
		delete tierPriceDrafts[key];
		return true;
	}

	/**
	 * @param {any} id
	 * @param {any} tier
	 */
	function commitTierPriceDrafts(id, tier) {
		const monthlyValid = commitTierPriceDraft(id, tier, 'monthly_amount_cents');
		const annualValid = commitTierPriceDraft(id, tier, 'annual_amount_cents');
		return monthlyValid && annualValid;
	}

	/**
	 * @param {any} path
	 * @param {any} [options]
	 */
	async function api(path, options = {}) {
		const response = await fetch(path, {
			headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
			...options
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload?.error || 'Request failed');
		return payload?.data;
	}

	async function refreshProgramBundle() {
		const bundle = await api(`/api/groups/${slug}/membership/program?include_inactive=true`);
		applyProgramBundle(bundle);
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

	/**
	 * @param {any} member
	 * @param {any} newStatus
	 */
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

	/**
	 * @param {any} appId
	 */
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

	/**
	 * @param {any} appId
	 */
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
		if (!hasValidManualEmail) {
			setMessage('', 'Enter a valid email address.');
			return;
		}
		if (!hasValidManualTier) {
			setMessage('', 'Select a valid membership tier before adding a member.');
			return;
		}
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/members/manual`, {
				method: 'POST',
				body: JSON.stringify(manualMembership)
			});
			setMessage('Member added successfully');
			manualMembership = {
				user_email: '',
				full_name: '',
				tier_id: activeTiers.length === 1 ? activeTiers[0].id : '',
				status: 'active'
			};
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

	async function saveProgramAndTiers() {
		for (const tier of tiers) {
			if (!commitTierPriceDrafts(tier.id, tier)) {
				setMessage('', TIER_PRICE_ERROR);
				return;
			}
			if (!(tier.name || '').trim()) {
				setMessage('', 'Every tier must have a name before saving.');
				return;
			}
		}

		try {
			busy = true;
			savingProgram = true;
			const updated = await api(`/api/groups/${slug}/membership/program`, {
				method: 'PUT',
				body: JSON.stringify({
					enabled: program.enabled !== false,
					access_mode: program.access_mode,
					cta_label: program.cta_label,
					contribution_mode: program.contribution_mode,
					default_tier_id: program.default_tier_id || null,
					policy_markdown: program.policy_markdown ?? '',
					tiers: tiers.map((tier, index) => ({
						id: tier.id,
						name: tier.name,
						description: tier.description,
						monthly_amount_cents: tier.monthly_amount_cents,
						annual_amount_cents: tier.annual_amount_cents,
						currency: tier.currency || 'usd',
						is_default: Boolean(program.default_tier_id && program.default_tier_id === tier.id),
						is_active: tier.is_active !== false,
						allow_custom_amount: tier.allow_custom_amount === true,
						min_amount_cents: tier.min_amount_cents,
						sort_order: tier.sort_order ?? index
					}))
				})
			});
			applyProgramBundle(updated);
			setMessage('Program and tiers saved');
		} catch (e) {
			setMessage('', e?.message || 'Unable to save program and tiers');
		} finally {
			busy = false;
			savingProgram = false;
		}
	}

	async function createTier() {
		if (!(newTier.name || '').trim()) {
			setMessage('', 'Tier name is required');
			return;
		}
		if (!commitTierPriceDrafts(null, newTier)) {
			setMessage('', TIER_PRICE_ERROR);
			return;
		}
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/tiers`, {
				method: 'POST',
				body: JSON.stringify({
					...newTier,
					is_default: newTier.is_default || activeTiers.length === 0
				})
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
			await refreshProgramBundle();
		} catch (e) {
			setMessage('', e?.message || 'Unable to create tier');
		} finally {
			busy = false;
		}
	}

	/**
	 * @param {any} tierId
	 */
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
			await refreshProgramBundle();
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
			await refreshProgramBundle();
		} catch (e) {
			setMessage('', e?.message || 'Unable to add field');
		} finally {
			busy = false;
		}
	}

	/**
	 * @param {any} fieldId
	 */
	async function deleteField(fieldId) {
		if (!confirm('Delete this form field?')) return;
		try {
			busy = true;
			await api(`/api/groups/${slug}/membership/form-fields`, {
				method: 'DELETE',
				body: JSON.stringify({ id: fieldId })
			});
			setMessage('Field deleted');
			await refreshProgramBundle();
		} catch (e) {
			setMessage('', e?.message || 'Unable to delete field');
		} finally {
			busy = false;
		}
	}

	async function installDefaultTiers() {
		if (
			tiers.length > 0 &&
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
			await refreshProgramBundle();
		} catch (e) {
			setMessage('', e?.message || 'Unable to install default tier catalog.');
		} finally {
			busy = false;
		}
	}

	/**
	 * @param {any} value
	 */
	function formatDate(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	/**
	 * @param {any} name
	 */
	function getInitials(name) {
		if (!name) return '?';
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	// Auto-select tier in manual add when exactly one active tier exists, and clear stale selection
	$effect(() => {
		if (
			manualMembership.tier_id &&
			!activeTiers.some((tier) => tier.id === manualMembership.tier_id)
		) {
			manualMembership.tier_id = activeTiers.length === 1 ? activeTiers[0].id : '';
		} else if (activeTiers.length === 1 && !manualMembership.tier_id) {
			manualMembership.tier_id = activeTiers[0].id;
		}
	});
</script>

{#snippet tierPriceInput(tier, tierId, cycle, label, id)}
	{@const field = `${cycle}_amount_cents`}
	<input
		{id}
		type="text"
		inputmode="decimal"
		class="tier-input price"
		aria-label={label}
		placeholder={cycle === 'monthly' ? 'Monthly' : 'Annual'}
		aria-invalid={isTierPriceInvalid(tierId, field) || undefined}
		aria-describedby={isTierPriceInvalid(tierId, field) ? `${id}-error` : undefined}
		value={getTierPriceDraft(tierId, field, tier[field])}
		oninput={(event) => setTierPriceDraft(tierId, field, event.currentTarget.value)}
		onblur={() => commitTierPriceDraft(tierId, tier, field)}
	/>
	{#if isTierPriceInvalid(tierId, field)}
		<p id="{id}-error" class="price-error">{TIER_PRICE_ERROR}</p>
	{/if}
{/snippet}

<div class="membership-manage">
	<!-- View Switcher Header -->
	<div class="view-header">
		<div
			class="view-tabs"
			role="tablist"
			aria-label="Membership management views"
			tabindex="-1"
			onkeydown={handleViewTabKeydown}
		>
			<button
				id="membership-tab-members"
				type="button"
				role="tab"
				class="view-tab"
				class:active={activeView === 'members'}
				aria-selected={activeView === 'members'}
				aria-controls="membership-panel-members"
				tabindex={activeView === 'members' ? 0 : -1}
				onclick={() => setActiveView('members')}
			>
				<IconUsers class="h-4 w-4" />
				<span>Members</span>
				<span class="tab-pill">{members.length}</span>
				{#if pendingApplications.length > 0}
					<span class="tab-pill warning">{pendingApplications.length} pending</span>
				{/if}
			</button>
			<button
				id="membership-tab-program"
				type="button"
				role="tab"
				class="view-tab"
				class:active={activeView === 'program'}
				aria-selected={activeView === 'program'}
				aria-controls="membership-panel-program"
				tabindex={activeView === 'program' ? 0 : -1}
				onclick={() => setActiveView('program')}
			>
				<IconSettings class="h-4 w-4" />
				<span>Program and Tiers</span>
				<span class="tab-pill">{activeTiers.length}</span>
			</button>
		</div>

		<ManageActionRow class="view-header-actions">
			<button type="button" class="btn preset-tonal-surface" onclick={copyJoinLink}>
				<IconLink class="h-4 w-4" />
				<span>Copy Join Link</span>
			</button>
			{#if activeView === 'program'}
				<button
					type="button"
					class="btn preset-filled-primary-500"
					disabled={busy || savingProgram}
					onclick={saveProgramAndTiers}
					data-testid="save-program-and-tiers-top"
				>
					{#if savingProgram}
						<IconLoader class="h-4 w-4 animate-spin" />
						<span>Saving…</span>
					{:else}
						<IconSave class="h-4 w-4" />
						<span>Save Program and Tiers</span>
					{/if}
				</button>
			{/if}
		</ManageActionRow>
	</div>

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
		<div class="banner stripe-connect-banner preset-tonal-warning" role="alert">
			<div class="banner-content">
				<div class="banner-icon warning">
					<IconCreditCard class="h-4 w-4" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="banner-title">Connect Stripe to accept paid memberships</p>
					<p class="banner-subtitle">
						You have paid tiers configured. Members cannot complete payment until Stripe is
						connected.
					</p>
				</div>
				<a
					class="btn preset-filled-primary-500 stripe-connect-action"
					href="/api/donations/connect/start?recipient=group&group={encodeURIComponent(
						slug
					)}&return_to={encodeURIComponent(`/groups/${slug}/manage/membership?view=program`)}"
				>
					<IconCreditCard class="h-4 w-4" />
					Connect Stripe
				</a>
			</div>
		</div>
	{/if}

	{#if activeView === 'members'}
		<div
			id="membership-panel-members"
			role="tabpanel"
			aria-labelledby="membership-tab-members"
			class="view-panel"
		>
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
				<ManageCardHeader
					title="Member Roster"
					titleClass="text-[0.9375rem] font-semibold tracking-tight"
					icon={IconUsers}
					tone="primary"
					iconVariant="tile"
					padded
					divider
				>
					{#snippet badges()}
						{#if pendingApplications.length > 0}
							<span class="badge warning">{pendingApplications.length} pending</span>
						{/if}
					{/snippet}
					{#snippet actions()}
						<button type="button" class="btn preset-tonal-surface" onclick={copyJoinLink}>
							<IconLink class="h-4 w-4" />
							<span>Copy Join Link</span>
						</button>
					{/snippet}
				</ManageCardHeader>

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
									: activeTiers.length === 0
										? 'Set up your membership tiers first, then invite or add members.'
										: 'Add members manually below or share your join link'}
							</p>
							{#if activeTiers.length === 0}
								<button
									type="button"
									class="btn preset-filled-primary-500 mt-4"
									onclick={() => setActiveView('program')}
								>
									Open Program and Tiers
								</button>
							{/if}
						</div>
					{:else}
						<div class="member-list">
							{#each filteredMembers as member (member.id)}
								<div class="member-row" class:expanded={expandedMemberId === member.id}>
									<button
										type="button"
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
												<ManageActionRow>
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
															type="button"
															class="btn btn-sm {isActive ? statusPreset : inactivePreset}"
															disabled={isActive || busy}
															onclick={() => updateMemberStatus(member, status)}
														>
															{status}
														</button>
													{/each}
												</ManageActionRow>
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
					<ManageCardHeader
						title="Applications"
						titleClass="text-[0.9375rem] font-semibold tracking-tight"
						icon={IconUsers}
						tone="warning"
						iconVariant="tile"
						padded
						divider
					>
						{#snippet badges()}
							<span class="badge warning">{pendingApplications.length} pending</span>
						{/snippet}
					</ManageCardHeader>

					<div class="card-body">
						<div class="application-list">
							{#each applications as app (app.id)}
								<div class="application-row">
									<div class="application-info">
										<div class="application-name">
											{app.applicant_profile?.full_name ||
												app.applicant_profile?.email ||
												'Unknown'}
										</div>
										<div class="application-meta">
											<span class="tier-badge">{app.selected_tier?.name || 'No tier'}</span>
											<span class="dot">·</span>
											<span>{formatDate(app.submitted_at)}</span>
											{#if app.applicant_profile?.phone}
												<span class="dot">·</span>
												<span>{app.applicant_profile.phone}</span>
											{/if}
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
										<ManageActionRow>
											<button
												type="button"
												class="btn preset-tonal-success"
												disabled={busy}
												onclick={() => approveApplication(app.id)}
											>
												<IconCheck class="h-4 w-4" />
												Approve
											</button>
											<button
												type="button"
												class="btn preset-tonal-error"
												disabled={busy}
												onclick={() => rejectApplication(app.id)}
											>
												<IconTrash class="h-4 w-4" />
												Reject
											</button>
										</ManageActionRow>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</section>
			{/if}

			<!-- Add Member (Manual — Members view only) -->
			<section class="card" data-testid="manual-add-member-section">
				<div class="card-accent success" aria-hidden="true"></div>
				<ManageCardHeader
					title="Add Member"
					titleClass="text-[0.9375rem] font-semibold tracking-tight"
					icon={IconPlus}
					tone="success"
					iconVariant="tile"
					padded
					divider
				/>

				<div class="card-body">
					<p class="card-description">
						Enter an email and select a membership tier to add a member manually. If no account
						exists, we'll create one and send an invite.
					</p>
					{#if activeTiers.length === 0}
						<div class="notes-callout mb-4">
							<div class="notes-callout-body">
								<p class="font-medium">No active membership tiers yet</p>
								<p class="text-xs opacity-80">
									Create at least one tier in Program and Tiers before adding members manually.
								</p>
							</div>
							<button
								type="button"
								class="btn btn-sm preset-filled-primary-500"
								onclick={() => setActiveView('program')}
							>
								Set up Program and Tiers
							</button>
						</div>
					{/if}
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
								<label for="manual-tier">Tier *</label>
								<select id="manual-tier" bind:value={manualMembership.tier_id}>
									<option value="">Select tier</option>
									{#each activeTiers as tier (tier.id)}
										<option value={tier.id}>{tier.name}</option>
									{/each}
								</select>
								{#if manualMembership.user_email && !hasValidManualTier && activeTiers.length > 0}
									<span class="field-hint warning">Select a tier to enable adding this member</span>
								{/if}
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
									id="manual-add-member"
									type="button"
									class="btn preset-filled-primary-500"
									disabled={!canSubmitManualMember}
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
		</div>
	{:else}
		<div
			id="membership-panel-program"
			role="tabpanel"
			aria-labelledby="membership-tab-program"
			class="view-panel"
		>
			{#if activeTiers.length === 0 && (groupInfo?.membership_info || '').trim()}
				<section class="card" data-testid="membership-notes-reference">
					<div class="card-accent" aria-hidden="true"></div>
					<ManageCardHeader
						title="Saved Membership Notes from Group Profile"
						titleClass="text-[0.9375rem] font-semibold tracking-tight"
						subtitle="Use your existing notes as a reference when setting up structured tiers below, or import starter tiers to get started quickly."
						icon={IconFileText}
						tone="primary"
						iconVariant="tile"
						padded
						divider
					/>
					<div class="card-body">
						<div class="reference-notes-box">{groupInfo.membership_info}</div>
					</div>
				</section>
			{/if}

			<!-- Program Options (Flat Card) -->
			<section class="card">
				<div class="card-accent" aria-hidden="true"></div>
				<ManageCardHeader
					title="Program Options"
					titleClass="text-[0.9375rem] font-semibold tracking-tight"
					icon={IconSettings}
					tone="primary"
					iconVariant="tile"
					padded
					divider
				/>
				<div class="card-body">
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
								value={program.default_tier_id ?? ''}
								onchange={(e) => selectDefaultTier(e.currentTarget.value || null)}
							>
								<option value="">No default</option>
								{#each activeTiers as tier (tier.id)}
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
				</div>
			</section>

			<!-- Tiers Setup (Flat Card) -->
			<section class="card">
				<div class="card-accent success" aria-hidden="true"></div>
				<ManageCardHeader
					title="Membership Tiers"
					titleClass="text-[0.9375rem] font-semibold tracking-tight"
					icon={IconPlus}
					tone="success"
					iconVariant="tile"
					padded
					divider
				>
					{#snippet badges()}
						<span class="badge">{activeTiers.length} active</span>
					{/snippet}
					{#snippet actions()}
						<button
							type="button"
							class="btn btn-sm preset-tonal-tertiary"
							disabled={busy}
							onclick={installDefaultTiers}
						>
							Import Starter Tiers
						</button>
					{/snippet}
				</ManageCardHeader>

				<div class="card-body">
					{#if tiers.length === 0}
						<div class="quick-start">
							<div class="quick-start-content">
								<div class="quick-start-icon">
									<IconPlus class="h-5 w-5" />
								</div>
								<div>
									<p class="quick-start-title">Create your first membership tier</p>
									<p class="quick-start-desc">
										Start with recommended free and supporter tiers in one click, or define a custom
										tier below.
									</p>
								</div>
							</div>
							<button
								type="button"
								class="btn preset-filled-primary-500"
								disabled={busy}
								onclick={installDefaultTiers}
							>
								Import Starter Tiers
							</button>
						</div>
					{:else}
						<div class="tier-list">
							{#each tiers as tier (tier.id)}
								<div class="tier-row">
									<div class="tier-fields">
										<input
											class="tier-input"
											aria-label={`Tier name for ${tier.name || 'tier'}`}
											placeholder="Tier name"
											bind:value={tier.name}
										/>
										<input
											class="tier-input"
											aria-label={`Description for ${tier.name || 'tier'}`}
											placeholder="Description"
											bind:value={tier.description}
										/>
										<div class="price-inputs">
											<div class="price-field">
												<span class="price-prefix">$</span>
												{@render tierPriceInput(
													tier,
													tier.id,
													'monthly',
													`Monthly contribution for ${tier.name || 'tier'}`,
													`tier-${tier.id}-monthly-price`
												)}
											</div>
											<div class="price-field">
												<span class="price-prefix">$</span>
												{@render tierPriceInput(
													tier,
													tier.id,
													'annual',
													`Annual contribution for ${tier.name || 'tier'}`,
													`tier-${tier.id}-annual-price`
												)}
											</div>
										</div>
									</div>
									<ManageActionRow>
										{#snippet lead()}
											<div class="flex flex-wrap items-center gap-4">
												<label class="checkbox-label">
													<input
														type="checkbox"
														checked={program.default_tier_id === tier.id}
														disabled={tier.is_active === false}
														onchange={(e) =>
															selectDefaultTier(e.currentTarget.checked ? tier.id : null)}
													/>
													<span>Default tier</span>
												</label>
												<label class="checkbox-label">
													<input
														type="checkbox"
														checked={tier.is_active !== false}
														onchange={(e) => {
															const checked = e.currentTarget.checked;
															tier.is_active = checked;
															if (!checked && program.default_tier_id === tier.id) {
																selectDefaultTier(null);
															}
														}}
													/>
													<span>Active</span>
												</label>
												<label class="checkbox-label">
													<input
														type="checkbox"
														checked={tier.allow_custom_amount === true}
														onchange={(e) => (tier.allow_custom_amount = e.currentTarget.checked)}
													/>
													<span>Allow custom amount</span>
												</label>
											</div>
										{/snippet}
										<button
											type="button"
											class="btn-text danger"
											aria-label={`Delete ${tier.name || 'tier'}`}
											disabled={busy}
											onclick={() => deleteTier(tier.id)}
										>
											<IconTrash class="h-4 w-4" />
										</button>
									</ManageActionRow>
								</div>
							{/each}
						</div>
					{/if}

					<!-- New Tier Form -->
					<div class="new-tier-form">
						<h3 class="form-subtitle">Add New Tier</h3>
						<div class="tier-fields">
							<input
								class="tier-input"
								aria-label="New tier name"
								placeholder="Tier name"
								bind:value={newTier.name}
							/>
							<input
								class="tier-input"
								aria-label="New tier description"
								placeholder="Description"
								bind:value={newTier.description}
							/>
							<div class="price-inputs">
								<div class="price-field">
									<span class="price-prefix">$</span>
									{@render tierPriceInput(
										newTier,
										null,
										'monthly',
										'New tier monthly contribution',
										'new-tier-monthly-price'
									)}
								</div>
								<div class="price-field">
									<span class="price-prefix">$</span>
									{@render tierPriceInput(
										newTier,
										null,
										'annual',
										'New tier annual contribution',
										'new-tier-annual-price'
									)}
								</div>
							</div>
						</div>
						<ManageActionRow>
							{#snippet lead()}
								<label class="checkbox-label">
									<input type="checkbox" bind:checked={newTier.is_default} />
									<span>Set as default</span>
								</label>
							{/snippet}
							<button
								type="button"
								class="btn preset-tonal-primary"
								disabled={busy || !(newTier.name || '').trim()}
								onclick={createTier}
							>
								<IconPlus class="h-4 w-4" />
								Add Tier
							</button>
						</ManageActionRow>
					</div>
				</div>
			</section>

			<!-- Membership Policy (Flat Card) -->
			<section class="card">
				<div class="card-accent" aria-hidden="true"></div>
				<ManageCardHeader
					title="Membership Policy"
					titleClass="text-[0.9375rem] font-semibold tracking-tight"
					icon={IconFileText}
					tone="primary"
					iconVariant="tile"
					padded
					divider
				>
					{#snippet badges()}
						<span class="version-badge">Version {program.policy_version || 1}</span>
					{/snippet}
				</ManageCardHeader>
				<div class="card-body">
					<p class="card-description">
						Shown to prospective members during signup. Editing policy text increments the policy
						version when you save Program and Tiers.
					</p>
					<textarea
						class="policy-textarea"
						aria-label="Membership policy"
						bind:value={program.policy_markdown}
						rows="8"
						placeholder="Enter your membership policy..."></textarea>
				</div>
			</section>

			<!-- Custom Application Questions (Flat Card) -->
			<section class="card">
				<div class="card-accent warning" aria-hidden="true"></div>
				<ManageCardHeader
					title="Custom Questions"
					titleClass="text-[0.9375rem] font-semibold tracking-tight"
					icon={IconUsers}
					tone="warning"
					iconVariant="tile"
					padded
					divider
				/>
				<div class="card-body">
					<p class="card-description">
						Custom fields asked when access mode is set to Private (review required).
					</p>
					{#if formFields.length === 0}
						<p class="empty-text">No custom questions yet.</p>
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
										type="button"
										class="btn-text danger"
										aria-label={`Delete question ${field.label}`}
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
						<h3 class="form-subtitle">Add Custom Question</h3>
						<div class="field-row-inputs">
							<input
								class="setting-input"
								aria-label="Application field label"
								placeholder="Question label"
								bind:value={newField.label}
							/>
							<select
								class="setting-select"
								aria-label="Application field type"
								bind:value={newField.field_type}
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
						</div>
						{#if newField.field_type === 'select' || newField.field_type === 'multiselect'}
							<textarea
								class="setting-input mb-3 w-full"
								aria-label="Application field options"
								placeholder="Options (one per line)"
								bind:value={newField.options_text}
								rows="3"></textarea>
						{/if}
						<ManageActionRow>
							{#snippet lead()}
								<label class="checkbox-label">
									<input type="checkbox" bind:checked={newField.required} />
									<span>Required</span>
								</label>
							{/snippet}
							<button
								type="button"
								class="btn preset-tonal-primary"
								disabled={busy || !newField.label}
								onclick={createField}
							>
								<IconPlus class="h-4 w-4" />
								Add Question
							</button>
						</ManageActionRow>
					</div>
				</div>
			</section>

			<!-- Shared Payment Status Card -->
			<section class="card">
				<div class="card-accent" aria-hidden="true"></div>
				<div class="card-body">
					<GroupStripePaymentCard
						{slug}
						stripeConnection={stripeConnectionState}
						billingGuard={effectiveBillingGuard}
						title="Payment Status & Stripe"
						description="Used across both paid membership tiers and group donations."
						returnTo={`/groups/${slug}/manage/membership?view=program`}
						stripeStatus={data?.stripe_status || ''}
						stripeReason={data?.stripe_reason || ''}
						onOpenProgramAndTiers={() => setActiveView('program')}
						onDisconnected={() => {
							stripeConnectionState = {
								...(stripeConnectionState || {}),
								connected: false,
								charges_enabled: false,
								payouts_enabled: false,
								stripe_account_id: null,
								stripe_account_email: null
							};
						}}
					/>
				</div>
			</section>

			<!-- Unified Save Footer -->
			<div class="unified-save-bar">
				<div class="unified-save-copy">
					<span class="font-medium">Unified setup save</span>
					<span class="text-xs opacity-75">
						Saves program options, policy text, tier edits, and default tier selection together.
					</span>
				</div>
				<button
					type="button"
					class="btn preset-filled-primary-500"
					disabled={busy || savingProgram}
					onclick={saveProgramAndTiers}
					data-testid="save-program-and-tiers"
				>
					{#if savingProgram}
						<IconLoader class="h-4 w-4 animate-spin" />
						<span>Saving…</span>
					{:else}
						<IconSave class="h-4 w-4" />
						<span>Save Program and Tiers</span>
					{/if}
				</button>
			</div>
		</div>
	{/if}
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

	.view-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.view-tabs {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		padding: 0.3125rem;
		border-radius: 0.875rem;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
	}

	.view-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.875rem;
		border-radius: 0.625rem;
		border: 1px solid transparent;
		background: transparent;
		color: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		opacity: 0.72;
		transition: all 160ms ease;
	}

	.view-tab:hover {
		opacity: 1;
		background: var(--hover-bg);
	}

	.view-tab.active {
		opacity: 1;
		background: var(--active-bg);
		border-color: var(--active-border);
		color: var(--color-primary-300);
	}

	.tab-pill {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.0625rem 0.45rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	.tab-pill.warning {
		background: color-mix(in oklab, var(--color-warning-500) 20%, transparent);
		color: var(--color-warning-300);
	}

	.view-panel {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
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

	.banner-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.stripe-connect-banner .banner-content {
		flex-wrap: wrap;
	}

	.stripe-connect-action {
		flex-shrink: 0;
	}

	@media (max-width: 639px) {
		.stripe-connect-banner .banner-content {
			align-items: flex-start;
		}

		.stripe-connect-action {
			width: 100%;
			justify-content: center;
		}
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
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	@media (min-width: 640px) {
		.stats-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
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
		overflow: hidden;
		animation: card-in 360ms ease both;
	}

	.card-accent {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: var(--color-primary-500);
		pointer-events: none;
	}

	.card-accent.warning {
		background: var(--color-warning-500);
	}

	.card-accent.success {
		background: var(--color-success-500);
	}

	.card-body {
		padding: 1.25rem;
	}

	.card-description {
		font-size: 0.875rem;
		opacity: 0.75;
		margin-bottom: 1rem;
	}

	.badge {
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		background: color-mix(in oklab, var(--color-surface-500) 18%, transparent);
	}

	.badge.warning {
		background: color-mix(in oklab, var(--color-warning-500) 16%, transparent);
		color: var(--color-warning-400);
	}

	/* Roster Filters & Rows */
	.filters-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.search-input {
		position: relative;
		flex: 1;
		min-width: min(100%, 200px);
	}

	.search-input :global(.search-icon) {
		position: absolute;
		left: 0.875rem;
		top: 50%;
		transform: translateY(-50%);
		opacity: 0.5;
		pointer-events: none;
	}

	.search-input input {
		width: 100%;
		padding: 0.625rem 0.875rem 0.625rem 2.5rem;
		font-size: 0.875rem;
		border-radius: 0.625rem;
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: inherit;
	}

	.filters-row .select {
		min-width: min(100%, 140px);
		padding: 0.625rem 2rem 0.625rem 0.875rem;
		font-size: 0.875rem;
		border-radius: 0.625rem;
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: inherit;
		cursor: pointer;
	}

	.select:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	.member-list,
	.application-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.member-row {
		border: 1px solid var(--card-border);
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-950) 40%, transparent);
		overflow: hidden;
	}

	.member-row.expanded {
		border-color: var(--active-border);
	}

	.member-row-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.member-row-header:hover {
		background: var(--hover-bg);
	}

	.member-avatar,
	.member-avatar-fallback {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 9999px;
		flex-shrink: 0;
		object-fit: cover;
	}

	.member-avatar-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		background: color-mix(in oklab, var(--color-primary-500) 20%, transparent);
		color: var(--color-primary-300);
	}

	.member-info,
	.application-info {
		flex: 1;
		min-width: 0;
	}

	.member-name,
	.application-name {
		font-size: 0.9375rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.member-meta,
	.application-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.375rem;
		font-size: 0.75rem;
		opacity: 0.7;
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
		display: inline-flex;
		align-items: center;
		padding: 0.1875rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: capitalize;
		background: color-mix(in oklab, var(--color-surface-500) 20%, transparent);
	}

	.status-badge.success {
		background: color-mix(in oklab, var(--color-success-500) 16%, transparent);
		color: var(--color-success-400);
	}

	.status-badge.warning {
		background: color-mix(in oklab, var(--color-warning-500) 16%, transparent);
		color: var(--color-warning-400);
	}

	.status-badge.error {
		background: color-mix(in oklab, var(--color-error-500) 16%, transparent);
		color: var(--color-error-400);
	}

	:global(.chevron) {
		transition: transform 180ms ease;
		opacity: 0.6;
	}

	:global(.chevron.rotate) {
		transform: rotate(180deg);
	}

	.member-details {
		padding: 0.875rem 1rem 1rem;
		border-top: 1px solid var(--card-border);
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.details-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
		gap: 0.75rem;
		font-size: 0.8125rem;
	}

	.detail-item {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
	}

	.detail-item a {
		color: inherit;
		text-decoration: underline;
		overflow-wrap: anywhere;
	}

	.detail-label {
		opacity: 0.65;
	}

	.status-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
	}

	.action-label {
		font-size: 0.75rem;
		opacity: 0.7;
	}

	.application-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--card-border);
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-surface-950) 40%, transparent);
	}

	/* Manual Add Member Form */
	.manual-form {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1.5fr);
		gap: 0.75rem;
	}

	.form-row.three-col {
		grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, auto);
	}

	@media (max-width: 640px) {
		.form-row,
		.form-row.three-col {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-field label {
		font-size: 0.8125rem;
		font-weight: 500;
		opacity: 0.85;
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

	.submit-field {
		justify-content: flex-end;
	}

	.submit-label-spacer {
		height: 1.25rem;
	}

	@media (max-width: 640px) {
		.submit-label-spacer {
			display: none;
		}
	}

	.field-hint {
		font-size: 0.75rem;
		opacity: 0.7;
	}

	.field-hint.success {
		color: var(--color-success-400);
		opacity: 1;
	}

	.field-hint.warning {
		color: var(--color-warning-400);
		opacity: 1;
	}

	.notes-callout {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--color-primary-500) 10%, transparent);
		border: 1px solid color-mix(in oklab, var(--color-primary-500) 30%, transparent);
	}

	.reference-notes-box {
		white-space: pre-wrap;
		font-size: 0.875rem;
		line-height: 1.5;
		padding: 0.875rem 1rem;
		border-radius: 0.75rem;
		background: var(--input-bg);
		border: 1px solid var(--input-border);
	}

	/* Program Settings & Tiers */
	.settings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
		gap: 1rem;
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

	.version-badge {
		display: inline-block;
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		background: color-mix(in oklab, var(--color-surface-500) 15%, transparent);
		border-radius: 0.25rem;
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
		grid-template-columns: minmax(0, 1.5fr) minmax(0, 2fr) minmax(0, 1fr);
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	@media (max-width: 640px) {
		.tier-fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.price-inputs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(8rem, 100%), 1fr));
		gap: 0.5rem;
	}

	.price-field {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-content: start;
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

	.tier-fields > .tier-input {
		min-width: 0;
	}

	.tier-input.price {
		border: none;
		background: transparent;
		border-radius: 0;
		padding: 0.5rem;
		min-width: 0;
	}

	.price-error {
		grid-column: 1 / -1;
		margin: 0;
		padding: 0.25rem 0.5rem;
		color: var(--color-error-500);
		overflow-wrap: anywhere;
	}

	.new-tier-form,
	.new-field-form {
		background: color-mix(in oklab, var(--color-surface-950) 30%, transparent);
		border-radius: 0.75rem;
		padding: 1rem;
		border: 1px dashed var(--card-border);
	}

	.form-subtitle {
		font-size: 0.8125rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
		opacity: 0.85;
	}

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

	.btn-text {
		background: none;
		border: none;
		padding: 0.375rem;
		border-radius: 0.5rem;
		cursor: pointer;
		color: inherit;
		opacity: 0.75;
	}

	.btn-text.danger:hover {
		color: var(--color-error-400);
		background: color-mix(in oklab, var(--color-error-500) 12%, transparent);
		opacity: 1;
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

	.field-row-inputs {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	@media (max-width: 480px) {
		.field-row-inputs {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.empty-text {
		font-size: 0.875rem;
		opacity: 0.6;
		padding: 0.5rem 0 1rem;
	}

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

	.unified-save-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-radius: 1rem;
		background: var(--card-bg);
		border: 1px solid var(--active-border);
	}

	.unified-save-copy {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

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
</style>
