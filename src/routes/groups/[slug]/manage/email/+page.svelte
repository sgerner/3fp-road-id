<script>
	import { beforeNavigate, replaceState } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import IconBadgeCheck from '@lucide/svelte/icons/badge-check';
	import IconCalendarClock from '@lucide/svelte/icons/calendar-clock';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
	import IconClock from '@lucide/svelte/icons/clock-3';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconGlobe from '@lucide/svelte/icons/globe-2';
	import IconHistory from '@lucide/svelte/icons/history';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPalette from '@lucide/svelte/icons/palette';
	import IconRefresh from '@lucide/svelte/icons/refresh-cw';
	import IconSave from '@lucide/svelte/icons/save';
	import IconSend from '@lucide/svelte/icons/send';
	import IconSettings from '@lucide/svelte/icons/settings-2';
	import IconUsers from '@lucide/svelte/icons/users';
	import DomainPurchasePanel from '$lib/components/groups/DomainPurchasePanel.svelte';
	import GroupEmailCanvas from '$lib/components/groups/GroupEmailCanvas.svelte';
	import {
		EMAIL_BRAND_PRESETS,
		EMAIL_PURPOSES,
		createDefaultEmailDraft,
		createPurposeBlocks,
		getCampaignReadiness,
		renderCampaignHtml,
		renderCampaignText
	} from '$lib/groups/emailEditor';

	let { data } = $props();
	const group = $derived(data.group ?? {});
	const clone = (value) => structuredClone(value);
	const editorGroup = $derived({
		...(data.group || {}),
		website_url: data.group?.website_url || data.defaultActionUrl
	});
	const createDraft = () => createDefaultEmailDraft(editorGroup, data.senderDomains || []);

	function hydrateCampaign(campaign) {
		const editor =
			campaign?.audience_filters?.editor && typeof campaign.audience_filters.editor === 'object'
				? clone(campaign.audience_filters.editor)
				: {};
		return {
			...createDraft(),
			...editor,
			campaignName: campaign?.campaign_name || editor.campaignName || 'Untitled campaign',
			subject: campaign?.subject_template || editor.subject || '',
			audienceStatuses: Array.isArray(campaign?.audience_filters?.statuses)
				? campaign.audience_filters.statuses
				: editor.audienceStatuses || ['active'],
			includeNewsletterSubscribers:
				campaign?.audience_filters?.subscribers === true ||
				editor.includeNewsletterSubscribers === true,
			senderDomainId: campaign?.audience_filters?.sender_domain_id || editor.senderDomainId || ''
		};
	}

	function formatDate(value) {
		if (!value) return 'Not scheduled';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Invalid date';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}

	function countAudience(statuses, includeNewsletterSubscribers = false) {
		const selected = Array.isArray(statuses) ? statuses : [];
		const membershipCount = selected.reduce(
			(total, status) => total + Number(data.audienceSummary?.[status] || 0),
			0
		);
		return (
			membershipCount +
			(includeNewsletterSubscribers ? Number(data.audienceSummary?.newsletter || 0) : 0)
		);
	}

	const views = [
		{ id: 'compose', label: 'Compose', hint: 'Write and design', icon: IconMail },
		{ id: 'review', label: 'Review & send', hint: 'Check every detail', icon: IconBadgeCheck },
		{ id: 'campaigns', label: 'Campaigns', hint: 'Drafts and history', icon: IconHistory },
		{ id: 'senders', label: 'Sender setup', hint: 'Domains and DNS', icon: IconSettings }
	];
	const audienceOptions = [
		{ id: 'active', label: 'Current members' },
		{ id: 'past_due', label: 'Members with payment issues' },
		{ id: 'cancelled', label: 'Cancelled memberships' }
	];

	let draft = $state(untrack(() => createDraft()));
	let senderDomains = $state(untrack(() => clone(data.senderDomains || [])));
	let emailHistory = $state(untrack(() => clone(data.emailHistory || [])));
	let activeView = $state('compose');
	let currentCampaignId = $state('');
	let canvasKey = $state(0);
	let savedSnapshot = $state(untrack(() => JSON.stringify(draft)));
	let scheduleAt = $state('');
	let busy = $state(false);
	let notice = $state('');
	let error = $state('');
	let selectedSiteDomain = $state('');
	let senderBusy = $state(false);
	let verifyingSenderId = $state('');
	let senderNotice = $state('');
	let senderError = $state('');
	let copiedDns = $state('');
	let senderForm = $state(
		untrack(() => ({
			from_name: data.group?.name || '',
			sender_email: '',
			is_default: (data.senderDomains || []).length === 0
		}))
	);

	const dirty = $derived(JSON.stringify(draft) !== savedSnapshot);
	const selectedAudienceCount = $derived(
		countAudience(draft.audienceStatuses, draft.includeNewsletterSubscribers)
	);
	const selectedSender = $derived(
		senderDomains.find((row) => row.id === draft.senderDomainId) || null
	);
	const verifiedSenderCount = $derived(
		senderDomains.filter((row) => row.ses_verified_for_sending === true).length
	);
	const previewHtml = $derived(renderCampaignHtml({ draft, group }));
	const readiness = $derived(
		getCampaignReadiness({
			draft,
			senderDomains,
			audienceCount: selectedAudienceCount,
			renderedHtmlLength: previewHtml.length
		})
	);
	const blockingIssues = $derived(readiness.filter((item) => item.blocking && !item.ready));
	const readyCount = $derived(readiness.filter((item) => item.ready).length);
	const previewText = $derived(renderCampaignText({ draft }));
	const registeredSiteDomains = $derived(
		Array.isArray(data.siteDomains)
			? data.siteDomains.map((row) => ({
					...row,
					label: row?.source === 'registered' ? `${row.domain} · purchased here` : row?.domain || ''
				}))
			: []
	);

	async function api(path, options = {}) {
		const response = await fetch(path, {
			headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
			...options
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload?.error || 'Request failed.');
		return payload?.data;
	}

	function selectView(view) {
		activeView = view;
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('view', view);
		replaceState(url, {});
	}

	function handleViewKeydown(event, index) {
		if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const nextIndex =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? views.length - 1
					: (index + (event.key === 'ArrowRight' ? 1 : -1) + views.length) % views.length;
		selectView(views[nextIndex].id);
		document.getElementById(`email-view-${views[nextIndex].id}`)?.focus();
	}

	function clearMessages() {
		notice = '';
		error = '';
	}

	function campaignPayload() {
		return {
			campaign_name: draft.campaignName || `${group.name || 'Group'} campaign`,
			subject_template: draft.subject,
			body_template: previewHtml,
			audience_filters: {
				statuses: draft.audienceStatuses,
				subscribers: draft.includeNewsletterSubscribers === true,
				sender_domain_id: draft.senderDomainId || null,
				editor: { ...clone(draft), rendered_text: previewText, version: 1 }
			}
		};
	}

	async function persistCampaign() {
		const persistedSnapshot = JSON.stringify(draft);
		const payload = campaignPayload();
		if (currentCampaignId) {
			const campaign = await api(
				`/api/groups/${group.slug}/membership/emails/${currentCampaignId}`,
				{
					method: 'PUT',
					body: JSON.stringify(payload)
				}
			);
			savedSnapshot = persistedSnapshot;
			return campaign;
		}
		const campaign = await api(`/api/groups/${group.slug}/membership/emails`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});
		currentCampaignId = campaign.id;
		savedSnapshot = persistedSnapshot;
		return campaign;
	}

	async function refreshHistory() {
		emailHistory = await api(`/api/groups/${group.slug}/membership/emails/history`);
	}

	async function refreshSenders() {
		senderDomains = await api(`/api/groups/${group.slug}/email/domains`);
		if (!draft.senderDomainId) {
			draft.senderDomainId =
				senderDomains.find((row) => row.is_default && row.ses_verified_for_sending)?.id ||
				senderDomains.find((row) => row.ses_verified_for_sending)?.id ||
				'';
		}
	}

	async function saveDraft() {
		clearMessages();
		const contentIssue = readiness.find(
			(item) => ['subject', 'content'].includes(item.key) && !item.ready
		);
		if (contentIssue) {
			error = contentIssue.label;
			return;
		}
		try {
			busy = true;
			await persistCampaign();
			await refreshHistory();
			notice = 'Draft saved.';
		} catch (cause) {
			error = cause?.message || 'Unable to save this draft.';
		} finally {
			busy = false;
		}
	}

	async function sendNow() {
		clearMessages();
		if (blockingIssues.length) {
			error = `Fix these before sending: ${blockingIssues.map((item) => item.label).join('; ')}.`;
			selectView('review');
			return;
		}
		if (
			!confirm(
				`Send this email to ${selectedAudienceCount.toLocaleString()} people now? This cannot be undone.`
			)
		)
			return;
		try {
			busy = true;
			const campaign = await persistCampaign();
			const result = await api(
				`/api/groups/${group.slug}/membership/emails/${campaign.id}/send-now`,
				{ method: 'POST' }
			);
			await refreshHistory();
			startNewDraft(false);
			selectView('campaigns');
			notice = `Email sent to ${Number(result?.sent_count || 0).toLocaleString()} people.`;
		} catch (cause) {
			error = cause?.message || 'Unable to send this email.';
		} finally {
			busy = false;
		}
	}

	async function scheduleSend() {
		clearMessages();
		const scheduledDate = new Date(scheduleAt);
		if (
			!scheduleAt ||
			Number.isNaN(scheduledDate.getTime()) ||
			scheduledDate.getTime() <= Date.now() + 30_000
		) {
			error = 'Choose a send time at least 30 seconds in the future.';
			return;
		}
		if (blockingIssues.length) {
			error = `Fix these before scheduling: ${blockingIssues.map((item) => item.label).join('; ')}.`;
			return;
		}
		if (!confirm(`Schedule this email for ${formatDate(scheduledDate.toISOString())}?`)) return;
		try {
			busy = true;
			const campaign = await persistCampaign();
			await api(`/api/groups/${group.slug}/membership/emails/${campaign.id}/schedule`, {
				method: 'POST',
				body: JSON.stringify({ scheduled_at: scheduledDate.toISOString() })
			});
			await refreshHistory();
			startNewDraft(false);
			selectView('campaigns');
			notice = `Email scheduled for ${formatDate(scheduledDate.toISOString())}.`;
		} catch (cause) {
			error = cause?.message || 'Unable to schedule this email.';
		} finally {
			busy = false;
		}
	}

	function startNewDraft(confirmDiscard = true) {
		if (confirmDiscard && dirty && !confirm('Discard the current unsaved draft?')) return;
		draft = createDraft();
		currentCampaignId = '';
		canvasKey += 1;
		savedSnapshot = JSON.stringify(draft);
		scheduleAt = '';
		clearMessages();
		selectView('compose');
	}

	function loadCampaign(campaign) {
		if (dirty && !confirm('Discard the current unsaved changes?')) return;
		draft = hydrateCampaign(campaign);
		currentCampaignId = campaign.status === 'draft' ? campaign.id : '';
		canvasKey += 1;
		savedSnapshot = campaign.status === 'draft' ? JSON.stringify(draft) : '';
		clearMessages();
		selectView('compose');
	}

	function duplicateCampaign(campaign) {
		if (dirty && !confirm('Discard the current unsaved changes?')) return;
		draft = {
			...hydrateCampaign(campaign),
			campaignName: `${campaign.campaign_name || 'Campaign'} copy`
		};
		currentCampaignId = '';
		canvasKey += 1;
		savedSnapshot = '';
		clearMessages();
		selectView('compose');
	}

	function applyPurpose(purposeId) {
		if (purposeId === draft.purpose) return;
		if (draft.blocks.length && !confirm('Replace the current message layout with this starter?'))
			return;
		const purpose = EMAIL_PURPOSES.find((item) => item.id === purposeId);
		draft.purpose = purposeId;
		draft.blocks = createPurposeBlocks(purposeId, editorGroup);
		draft.campaignName = `${group.name || 'Group'} ${purpose?.label || 'campaign'}`;
		canvasKey += 1;
	}

	function applyBrand(preset) {
		draft.brandPresetId = preset.id;
		draft.brand = { ...preset };
	}

	function toggleAudience(status, checked) {
		draft.audienceStatuses = checked
			? [...new Set([...draft.audienceStatuses, status])]
			: draft.audienceStatuses.filter((candidate) => candidate !== status);
	}

	function applySelectedSiteDomain() {
		if (!selectedSiteDomain) return;
		const current = String(senderForm.sender_email || '').trim();
		const local = current.includes('@')
			? current.slice(0, current.lastIndexOf('@'))
			: current || 'hello';
		senderForm.sender_email = `${local}@${selectedSiteDomain}`;
	}

	function senderPayload() {
		const email = String(senderForm.sender_email || '')
			.trim()
			.toLowerCase();
		const at = email.lastIndexOf('@');
		if (at <= 0 || at === email.length - 1)
			throw new Error('Enter a complete sender email address.');
		return {
			domain: email.slice(at + 1),
			from_name: senderForm.from_name,
			from_local_part: email.slice(0, at),
			reply_to_email: email,
			is_default: senderForm.is_default
		};
	}

	async function saveSender() {
		senderNotice = '';
		senderError = '';
		try {
			senderBusy = true;
			await api(`/api/groups/${group.slug}/email/domains`, {
				method: 'POST',
				body: JSON.stringify(senderPayload())
			});
			await refreshSenders();
			senderForm = { from_name: group.name || '', sender_email: '', is_default: false };
			senderNotice = 'Sender added. Complete any DNS steps below, then verify it.';
		} catch (cause) {
			senderError = cause?.message || 'Unable to add this sender.';
		} finally {
			senderBusy = false;
		}
	}

	async function verifySender(senderId) {
		senderNotice = '';
		senderError = '';
		try {
			verifyingSenderId = senderId;
			await api(`/api/groups/${group.slug}/email/domains/${senderId}/verify`, { method: 'POST' });
			await refreshSenders();
			senderNotice = 'Sender verification refreshed.';
		} catch (cause) {
			senderError = cause?.message || 'Unable to verify this sender.';
		} finally {
			verifyingSenderId = '';
		}
	}

	async function copyDns(value, key) {
		try {
			await navigator.clipboard.writeText(value);
			copiedDns = key;
			setTimeout(() => {
				if (copiedDns === key) copiedDns = '';
			}, 1200);
		} catch {
			senderError = 'Unable to copy that DNS value.';
		}
	}

	beforeNavigate(({ cancel }) => {
		if (dirty && !busy && !confirm('Leave without saving your email draft?')) cancel();
	});

	onMount(() => {
		const requestedView = new URL(window.location.href).searchParams.get('view');
		if (views.some((view) => view.id === requestedView)) activeView = requestedView;
		const warn = (event) => {
			if (!dirty || busy) return;
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});
</script>

<svelte:head><title>Newsletter Studio | {group.name}</title></svelte:head>

<div class="mx-auto grid max-w-[1600px] gap-4 pb-10">
	<header
		class="card preset-tonal-surface grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
	>
		<div class="flex min-w-0 items-start gap-3">
			<span class="card preset-tonal-primary shrink-0 p-2.5"><IconMail class="h-6 w-6" /></span>
			<div class="min-w-0">
				<p class="text-xs font-semibold tracking-[0.16em] uppercase opacity-55">
					Communications · Email
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<h1 class="h2">Newsletter Studio</h1>
					{#if dirty}<span class="badge preset-tonal-warning">Unsaved</span>{:else}<span
							class="badge preset-tonal-success"><IconCheck class="h-3 w-3" /> Saved</span
						>{/if}
				</div>
				<p class="mt-1 max-w-2xl text-sm opacity-70">
					Write, design, review, and send without leaving one calm workspace.
				</p>
			</div>
		</div>
		<div class="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
			<button
				class="btn preset-tonal-surface"
				type="button"
				onclick={() => startNewDraft()}
				disabled={busy}>New email</button
			>
			<button class="btn preset-tonal-primary" type="button" onclick={saveDraft} disabled={busy}
				><IconSave class="h-4 w-4" /> Save draft</button
			>
			<button
				class="btn preset-filled-primary-500"
				type="button"
				onclick={() => selectView('review')}><IconBadgeCheck class="h-4 w-4" /> Review</button
			>
		</div>
	</header>

	{#if notice}<div class="card preset-tonal-success flex items-center gap-2 p-3" role="status">
			<IconCheck class="h-4 w-4 shrink-0" />
			{notice}
		</div>{/if}
	{#if error}<div class="card preset-tonal-error flex items-center gap-2 p-3" role="alert">
			<IconCircleAlert class="h-4 w-4 shrink-0" />
			{error}
		</div>{/if}

	<nav class="card preset-outlined-surface-200-800 p-1.5" aria-label="Newsletter workspace">
		<div class="grid grid-cols-2 gap-1 sm:grid-cols-4" role="tablist">
			{#each views as view, index}
				{@const ViewIcon = view.icon}
				<button
					class="btn btn-sm min-h-12 justify-center {activeView === view.id
						? 'preset-filled-primary-500'
						: 'preset-tonal-surface'}"
					type="button"
					role="tab"
					id={`email-view-${view.id}`}
					aria-controls={`email-panel-${view.id}`}
					aria-selected={activeView === view.id}
					tabindex={activeView === view.id ? 0 : -1}
					title={view.hint}
					onkeydown={(event) => handleViewKeydown(event, index)}
					onclick={() => selectView(view.id)}><ViewIcon class="h-4 w-4" /> {view.label}</button
				>
			{/each}
		</div>
	</nav>

	{#if activeView === 'compose'}
		<div
			class="grid gap-4"
			id="email-panel-compose"
			role="tabpanel"
			aria-labelledby="email-view-compose"
		>
			{#if verifiedSenderCount === 0}
				<div
					class="card preset-tonal-warning grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
				>
					<div>
						<p class="font-semibold">One setup step before you can send</p>
						<p class="text-sm opacity-70">
							Design your email now, then verify a sender address when you are ready.
						</p>
					</div>
					<button
						class="btn preset-filled-warning-500"
						type="button"
						onclick={() => selectView('senders')}
						><IconSettings class="h-4 w-4" /> Set up sender</button
					>
				</div>
			{/if}

			<div class="card preset-tonal-surface grid gap-5 p-4 sm:p-5">
				<div>
					<p class="h4">Start with the job</p>
					<p class="text-sm opacity-65">Pick the closest goal. You can change every word.</p>
				</div>
				<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
					{#each EMAIL_PURPOSES as purpose}
						<button
							class="card cursor-pointer p-3 text-left {draft.purpose === purpose.id
								? 'preset-filled-primary-500'
								: 'preset-tonal-surface hover:preset-tonal-primary'}"
							type="button"
							aria-pressed={draft.purpose === purpose.id}
							onclick={() => applyPurpose(purpose.id)}
						>
							<span class="block font-semibold">{purpose.label}</span><span
								class="mt-1 block text-xs opacity-65">{purpose.description}</span
							>
						</button>
					{/each}
				</div>

				<div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="label sm:col-span-2"
							><span>Subject line <span class="opacity-50">{draft.subject.length}/300</span></span
							><input
								class="input"
								bind:value={draft.subject}
								maxlength="300"
								placeholder="A useful reason to open"
							/></label
						>
						<label class="label"
							><span>Campaign name</span><input
								class="input"
								bind:value={draft.campaignName}
								maxlength="120"
							/></label
						>
						<label class="label"
							><span>Inbox preview</span><input
								class="input"
								bind:value={draft.preheader}
								maxlength="180"
								placeholder="Complete the thought"
							/></label
						>
					</div>
					<div class="grid gap-3">
						<div>
							<p class="text-sm font-semibold">Send to</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each audienceOptions as option}
									<label
										class="btn btn-sm cursor-pointer {draft.audienceStatuses.includes(option.id)
											? 'preset-filled-primary-500'
											: 'preset-tonal-surface'}"
									>
										<input
											class="sr-only"
											type="checkbox"
											checked={draft.audienceStatuses.includes(option.id)}
											onchange={(event) => toggleAudience(option.id, event.currentTarget.checked)}
										/>
										{option.label} · {data.audienceSummary?.[option.id] || 0}
									</label>
								{/each}
								<label
									class="btn btn-sm cursor-pointer {draft.includeNewsletterSubscribers
										? 'preset-filled-primary-500'
										: 'preset-tonal-surface'}"
								>
									<input
										class="sr-only"
										type="checkbox"
										bind:checked={draft.includeNewsletterSubscribers}
									/>
									Newsletter subscribers · {data.audienceSummary?.newsletter || 0}
								</label>
							</div>
							<p class="mt-2 text-xs opacity-60">
								{selectedAudienceCount.toLocaleString()} selected · maximum 2,000 per campaign · people
								on more than one list receive one email
							</p>
						</div>
						<label class="label"
							><span>From</span><select class="select" bind:value={draft.senderDomainId}
								><option value="">Choose a verified sender</option
								>{#each senderDomains.filter((row) => row.ses_verified_for_sending) as sender}<option
										value={sender.id}>{sender.from_email_address}</option
									>{/each}</select
							></label
						>
					</div>
				</div>

				<div class="preset-divider-top pt-4">
					<div class="mb-3 flex items-center gap-2">
						<IconPalette class="h-4 w-4" />
						<p class="text-sm font-semibold">Email colors</p>
					</div>
					<div class="flex flex-wrap gap-2">
						{#each EMAIL_BRAND_PRESETS as preset}
							<button
								class="btn btn-sm {draft.brandPresetId === preset.id
									? 'preset-filled-primary-500'
									: 'preset-tonal-surface'}"
								type="button"
								aria-pressed={draft.brandPresetId === preset.id}
								onclick={() => applyBrand(preset)}
							>
								<span class="h-3 w-3 rounded-full" style:background={preset.primaryColor}
								></span>{preset.label}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="card preset-outlined-surface-200-800 overflow-hidden">
				{#key canvasKey}<GroupEmailCanvas
						blocks={draft.blocks}
						brand={draft.brand}
						groupName={group.name}
						defaultActionUrl={editorGroup.website_url}
						onchange={(blocks) => (draft.blocks = blocks)}
					/>{/key}
			</div>
			<div
				class="card preset-tonal-surface sticky bottom-3 z-20 flex flex-wrap items-center gap-2 p-3 shadow-xl"
			>
				<div class="mr-auto">
					<p class="text-sm font-semibold">
						{dirty ? 'Unsaved changes' : currentCampaignId ? 'Draft saved' : 'New email'}
					</p>
					<p class="text-xs opacity-60">
						{draft.blocks.length} blocks · {selectedAudienceCount.toLocaleString()} recipients
					</p>
				</div>
				<button class="btn preset-tonal-primary" type="button" onclick={saveDraft} disabled={busy}
					><IconSave class="h-4 w-4" /> Save</button
				>
				<button
					class="btn preset-filled-primary-500"
					type="button"
					onclick={() => selectView('review')}><IconBadgeCheck class="h-4 w-4" /> Review</button
				>
			</div>
		</div>
	{:else if activeView === 'review'}
		<div
			class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"
			id="email-panel-review"
			role="tabpanel"
			aria-labelledby="email-view-review"
		>
			<div class="card preset-tonal-surface overflow-hidden">
				<div class="preset-divider-bottom grid gap-1 p-4">
					<p class="text-xs opacity-60">
						From: {selectedSender?.from_email_address || 'Choose a sender'}
					</p>
					<p class="font-semibold">{draft.subject || 'Your subject line'}</p>
					<p class="text-sm opacity-60">
						{draft.preheader || 'Your inbox preview will appear here.'}
					</p>
				</div>
				<iframe class="min-h-[48rem] w-full" title="Email preview" srcdoc={previewHtml}></iframe>
			</div>
			<aside class="grid content-start gap-4">
				<div class="card preset-tonal-surface p-4">
					<div class="mb-4 flex items-center justify-between gap-2">
						<div>
							<p class="font-semibold">Send review</p>
							<p class="text-xs opacity-60">Only real blockers stop a send.</p>
						</div>
						<span
							class="badge {blockingIssues.length
								? 'preset-tonal-warning'
								: 'preset-tonal-success'}">{readyCount}/{readiness.length}</span
						>
					</div>
					<div class="grid gap-2">
						{#each readiness as check}<div
								class="{check.ready
									? 'preset-tonal-success'
									: check.blocking
										? 'preset-tonal-error'
										: 'preset-tonal-warning'} flex items-start gap-2 p-3 text-sm"
							>
								{#if check.ready}<IconCheck
										class="mt-0.5 h-4 w-4 shrink-0"
									/>{:else}<IconCircleAlert class="mt-0.5 h-4 w-4 shrink-0" />{/if}<span
									>{check.label}</span
								>
							</div>{/each}
					</div>
				</div>
				<div class="card preset-tonal-primary grid gap-3 p-4">
					<div>
						<p class="font-semibold">Send later</p>
						<p class="text-xs opacity-65">Times use this device’s timezone.</p>
					</div>
					<input class="input" type="datetime-local" bind:value={scheduleAt} /><button
						class="btn preset-filled-primary-500"
						type="button"
						onclick={scheduleSend}
						disabled={busy || blockingIssues.length > 0}
						><IconCalendarClock class="h-4 w-4" /> Schedule email</button
					>
				</div>
				<button
					class="btn preset-filled-primary-500 min-h-12"
					type="button"
					onclick={sendNow}
					disabled={busy || blockingIssues.length > 0}
					><IconSend class="h-4 w-4" /> Send now to {selectedAudienceCount.toLocaleString()}</button
				>
				<button class="btn preset-tonal-surface" type="button" onclick={() => selectView('compose')}
					>Back to design</button
				>
			</aside>
		</div>
	{:else if activeView === 'campaigns'}
		<div
			class="grid gap-4"
			id="email-panel-campaigns"
			role="tabpanel"
			aria-labelledby="email-view-campaigns"
		>
			<div class="card preset-tonal-surface flex flex-wrap items-center justify-between gap-3 p-4">
				<div>
					<h2 class="h4">Campaign library</h2>
					<p class="text-sm opacity-65">
						Drafts can be reopened. Sent or scheduled emails are duplicated before editing.
					</p>
				</div>
				<div class="flex gap-2">
					<button class="btn preset-tonal-surface" type="button" onclick={refreshHistory}
						><IconRefresh class="h-4 w-4" /> Refresh</button
					><button
						class="btn preset-filled-primary-500"
						type="button"
						onclick={() => startNewDraft()}><IconMail class="h-4 w-4" /> New email</button
					>
				</div>
			</div>
			{#if emailHistory.length === 0}<div
					class="card preset-tonal-surface grid min-h-64 place-items-center p-8 text-center"
				>
					<div>
						<IconClock class="mx-auto h-8 w-8 opacity-50" />
						<p class="mt-3 font-semibold">No campaigns yet</p>
						<p class="text-sm opacity-60">Your first saved draft will appear here.</p>
					</div>
				</div>{:else}<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{#each emailHistory as campaign}<article
							class="card preset-tonal-surface grid content-start gap-4 p-4"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate font-semibold">
										{campaign.campaign_name || campaign.subject_template}
									</p>
									<p class="mt-1 line-clamp-2 text-sm opacity-65">{campaign.subject_template}</p>
								</div>
								<span
									class="badge {campaign.status === 'sent'
										? 'preset-tonal-success'
										: campaign.status === 'failed' || campaign.status === 'partially_failed'
											? 'preset-tonal-error'
											: campaign.status === 'scheduled'
												? 'preset-tonal-warning'
												: 'preset-tonal-surface'}">{campaign.status.replace('_', ' ')}</span
								>
							</div>
							<div class="grid grid-cols-2 gap-2 text-xs opacity-65">
								<span>Created {formatDate(campaign.created_at)}</span><span
									>{campaign.sent_count || 0} sent</span
								>{#if campaign.scheduled_at}<span class="col-span-2"
										>Scheduled {formatDate(campaign.scheduled_at)}</span
									>{/if}
							</div>
							<div class="flex gap-2">
								{#if campaign.status === 'draft'}<button
										class="btn btn-sm preset-filled-primary-500 flex-1"
										type="button"
										onclick={() => loadCampaign(campaign)}>Continue editing</button
									>{/if}<button
									class="btn btn-sm preset-tonal-surface flex-1"
									type="button"
									onclick={() => duplicateCampaign(campaign)}
									><IconCopy class="h-4 w-4" /> Duplicate</button
								>
							</div>
						</article>{/each}
				</div>{/if}
		</div>
	{:else}
		<div
			class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)]"
			id="email-panel-senders"
			role="tabpanel"
			aria-labelledby="email-view-senders"
		>
			<div class="grid content-start gap-4">
				<div class="card preset-tonal-surface grid gap-4 p-4 sm:p-5">
					<div>
						<h2 class="h4">Add a sending address</h2>
						<p class="text-sm opacity-65">
							Use an inbox your members recognize. We’ll translate the technical DNS status into
							clear steps.
						</p>
					</div>
					{#if senderNotice}<div class="preset-tonal-success p-3 text-sm" role="status">
							{senderNotice}
						</div>{/if}{#if senderError}<div class="preset-tonal-error p-3 text-sm" role="alert">
							{senderError}
						</div>{/if}{#if registeredSiteDomains.length}<div class="flex gap-2">
							<select class="select min-w-0 flex-1" bind:value={selectedSiteDomain}
								><option value="">Use a website domain…</option
								>{#each registeredSiteDomains as domain}<option value={domain.domain}
										>{domain.label}</option
									>{/each}</select
							><button
								class="btn preset-tonal-primary"
								type="button"
								disabled={!selectedSiteDomain}
								onclick={applySelectedSiteDomain}>Use</button
							>
						</div>{/if}
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="label"
							><span>From name</span><input
								class="input"
								bind:value={senderForm.from_name}
								placeholder={group.name}
							/></label
						><label class="label"
							><span>From and reply-to email</span><input
								class="input"
								type="email"
								bind:value={senderForm.sender_email}
								placeholder="organizers@yourgroup.org"
							/></label
						>
					</div>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<label class="flex cursor-pointer items-center gap-2 text-sm"
							><input class="checkbox" type="checkbox" bind:checked={senderForm.is_default} /> Make default
							sender</label
						><button
							class="btn preset-filled-primary-500"
							type="button"
							onclick={saveSender}
							disabled={senderBusy}><IconGlobe class="h-4 w-4" /> Add sender</button
						>
					</div>
				</div>
				<div class="grid gap-3">
					{#each senderDomains as sender}<article class="card preset-tonal-surface grid gap-3 p-4">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div>
									<div class="flex flex-wrap items-center gap-2">
										<p class="font-semibold">{sender.from_email_address || sender.domain}</p>
										{#if sender.is_default}<span class="badge preset-tonal-surface">Default</span
											>{/if}<span
											class="badge {sender.ses_verified_for_sending
												? 'preset-tonal-success'
												: 'preset-tonal-warning'}"
											>{sender.ses_verified_for_sending
												? 'Ready to send'
												: 'Needs verification'}</span
										>
									</div>
									<p class="mt-1 text-xs opacity-60">
										DKIM: {sender.ses_dkim_status || 'pending'} · MAIL FROM: {sender.ses_mail_from_status ||
											'pending'}
									</p>
								</div>
								<button
									class="btn btn-sm preset-tonal-surface"
									type="button"
									onclick={() => verifySender(sender.id)}
									disabled={verifyingSenderId === sender.id}
									><IconRefresh
										class="h-4 w-4 {verifyingSenderId === sender.id ? 'animate-spin' : ''}"
									/> Verify</button
								>
							</div>
							{#if sender.dns_records?.length}<details class="card preset-tonal-warning">
									<summary class="cursor-pointer p-3 text-sm font-semibold"
										>DNS steps ({sender.dns_records.length})</summary
									>
									<div class="grid gap-2 px-3 pb-3">
										{#each sender.dns_records as record}<div
												class="card preset-tonal-surface grid gap-2 p-3 text-xs sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center"
											>
												<span class="font-mono font-bold">{record.type}</span>
												<div class="min-w-0">
													<p class="truncate font-mono">{record.name}</p>
													<p class="break-all font-mono opacity-60">{record.value}</p>
												</div>
												<button
													class="btn btn-sm preset-tonal-surface"
													type="button"
													onclick={() => copyDns(record.value, `${sender.id}-${record.id}`)}
													>{#if copiedDns === `${sender.id}-${record.id}`}<IconCheck
															class="h-4 w-4"
														/> Copied{:else}<IconCopy class="h-4 w-4" /> Copy{/if}</button
												>
											</div>{/each}
									</div>
								</details>{/if}
						</article>{/each}
				</div>
			</div>
			<aside class="grid content-start gap-4">
				<div class="card preset-tonal-primary p-4">
					<p class="font-semibold">What happens next?</p>
					<ol class="mt-3 grid gap-2 text-sm">
						<li>1. Add the address members should see.</li>
						<li>2. Copy any DNS records to your domain provider.</li>
						<li>3. Click Verify. DNS can take a little time.</li>
					</ol>
				</div>
				<details class="card preset-tonal-surface">
					<summary class="cursor-pointer p-4 font-semibold">Need a domain?</summary>
					<div class="preset-divider-top p-4">
						<DomainPurchasePanel
							groupSlug={group.slug}
							initialSearchQuery={group.slug || ''}
							defaultContact={{
								email: group.public_contact_email || group.contact_email || '',
								city: group.city || '',
								state: group.state_region || '',
								country: 'US'
							}}
							returnPath={`/groups/${group.slug}/manage/email?view=senders&domain_payment=return`}
							title="Find a domain"
						/>
					</div>
				</details>
				<a class="btn preset-tonal-surface" href={`/groups/${group.slug}/manage/site?view=address`}
					><IconExternalLink class="h-4 w-4" /> Website domains</a
				>
			</aside>
		</div>
	{/if}
</div>
