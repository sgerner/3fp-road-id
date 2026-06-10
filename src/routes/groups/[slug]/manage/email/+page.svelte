<script>
	import { untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconSend from '@lucide/svelte/icons/send';
	import IconClock3 from '@lucide/svelte/icons/clock-3';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconGlobe from '@lucide/svelte/icons/globe';
	import IconBadgeCheck from '@lucide/svelte/icons/badge-check';
	import IconTriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import IconSquarePen from '@lucide/svelte/icons/square-pen';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconTrash from '@lucide/svelte/icons/trash-2';
	import IconSettings from '@lucide/svelte/icons/settings';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconLayout from '@lucide/svelte/icons/layout-template';
	import DomainPurchasePanel from '$lib/components/groups/DomainPurchasePanel.svelte';
	import {
		createDefaultEmailDraft,
		EMAIL_TEMPLATE_PRESETS,
		renderCampaignHtml,
		renderCampaignText
	} from '$lib/groups/emailBuilder';

	let { data } = $props();

	const group = $derived(data.group ?? {});

	function createDraft() {
		return createDefaultEmailDraft(data.group, data.senderDomains || []);
	}

	function clone(value) {
		return JSON.parse(JSON.stringify(value));
	}

	function makeId(prefix) {
		return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
	}

	function blockFactory(type) {
		if (type === 'paragraph') {
			return { id: makeId('paragraph'), type, title: 'New section', body: 'Write your copy here.' };
		}
		if (type === 'button') {
			return { id: makeId('button'), type, title: 'Primary action', buttonLabel: 'Open link', buttonUrl: '' };
		}
		if (type === 'quote') {
			return { id: makeId('quote'), type, title: 'Member voice', body: 'Add a quote or testimonial.' };
		}
		return { id: makeId('paragraph'), type: 'paragraph', title: '', body: '' };
	}

	function hydrateEditorFromCampaign(campaign) {
		const editorState =
			campaign?.audience_filters &&
			typeof campaign.audience_filters === 'object' &&
			campaign.audience_filters.editor &&
			typeof campaign.audience_filters.editor === 'object'
				? clone(campaign.audience_filters.editor)
				: null;
		if (editorState?.blocks?.length) {
			return {
				...createDraft(),
				...editorState,
				audienceStatuses: Array.isArray(campaign?.audience_filters?.statuses)
					? campaign.audience_filters.statuses
					: editorState.audienceStatuses || ['active']
			};
		}
		return createDraft();
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

	function audienceCount(statuses, summary) {
		const selected = Array.isArray(statuses) && statuses.length ? statuses : ['active'];
		return selected.reduce((total, status) => total + Number(summary?.[status] || 0), 0);
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

	async function refreshHistory() {
		emailHistory = await api(`/api/groups/${group.slug}/membership/emails/history`);
	}

	async function refreshSenderDomains() {
		senderDomains = await api(`/api/groups/${group.slug}/email/domains`);
		if (!draft.senderDomainId) {
			draft.senderDomainId =
				senderDomains.find((row) => row.is_default)?.id || senderDomains[0]?.id || '';
		}
	}

	// ── State ──────────────────────────────────────────────────────
	let draft = $state(untrack(() => createDraft()));
	let senderDomains = $state(untrack(() => clone(data.senderDomains || [])));
	let emailHistory = $state(untrack(() => clone(data.emailHistory || [])));
	let selectedSiteDomain = $state('');
	let scheduleAt = $state('');
	let composerBusy = $state(false);
	let senderBusy = $state(false);
	let verifyingSenderId = $state('');
	let notice = $state('');
	let error = $state('');
	let senderNotice = $state('');
	let senderError = $state('');
	let copiedDns = $state('');
	let activeTab = $state('compose'); // 'compose' | 'preview' | 'history'
	let domainPanelOpen = $state(false);
	let showAdvanced = $state(false);
	let senderForm = $state(
		untrack(() => ({
			domain: '',
			from_name: data.group?.name || '',
			from_local_part: 'hello',
			reply_to_email: '',
			is_default: (data.senderDomains || []).length === 0
		}))
	);

	// ── Derived ───────────────────────────────────────────────────
	const previewHtml = $derived(
		renderCampaignHtml({ draft, group, audienceCount: audienceCount(draft.audienceStatuses, data.audienceSummary) })
	);
	const previewText = $derived(renderCampaignText({ draft }));
	const selectedPreset = $derived(
		EMAIL_TEMPLATE_PRESETS.find((item) => item.id === draft.templateId) || EMAIL_TEMPLATE_PRESETS[0]
	);
	const registeredSiteDomains = $derived(
		Array.isArray(data.siteDomains)
			? data.siteDomains.map((row) => ({
					...row,
					label: row?.source === 'registered' ? `${row.domain} · purchased here` : row?.domain || ''
				}))
			: []
	);
	const selectedAudienceCount = $derived(audienceCount(draft.audienceStatuses, data.audienceSummary || {}));
	const explicitlySelectedSender = $derived(senderDomains.find((row) => row.id === draft.senderDomainId) || null);
	const selectedSender = $derived(explicitlySelectedSender || senderDomains.find((row) => row.is_default) || null);
	const senderSelectionNeedsVerification = $derived(
		Boolean(draft.senderDomainId && (!explicitlySelectedSender || explicitlySelectedSender.ses_verified_for_sending !== true))
	);
	const verifiedSenderCount = $derived(senderDomains.filter((row) => row.ses_verified_for_sending).length);
	/** True if there's at least one verified sender ready to use */
	const hasSenderReady = $derived(verifiedSenderCount > 0);

	// ── Helpers ───────────────────────────────────────────────────
	function setComposerMessage(nextNotice = '', nextError = '') { notice = nextNotice; error = nextError; }
	function setSenderMessage(nextNotice = '', nextError = '') { senderNotice = nextNotice; senderError = nextError; }

	function resetDraft() { draft = createDraft(); setComposerMessage('', ''); }
	function addBlock(type) { draft.blocks = [...draft.blocks, blockFactory(type)]; }
	function removeBlock(blockId) { draft.blocks = draft.blocks.filter((b) => b.id !== blockId); }

	function duplicateCampaign(campaign) {
		draft = hydrateEditorFromCampaign(campaign);
		activeTab = 'compose';
		setComposerMessage('Campaign loaded into the composer.', '');
	}

	function applySelectedSiteDomain() {
		if (!selectedSiteDomain) return;
		senderForm.domain = selectedSiteDomain;
		setSenderMessage('', '');
	}

	async function createCampaignRecord() {
		const payload = {
			campaign_name: draft.campaignName,
			subject_template: draft.subject,
			body_template: previewHtml,
			audience_filters: {
				statuses: draft.audienceStatuses,
				sender_domain_id: draft.senderDomainId || null,
				editor: { ...clone(draft), rendered_text: previewText }
			}
		};
		return api(`/api/groups/${group.slug}/membership/emails`, { method: 'POST', body: JSON.stringify(payload) });
	}

	async function saveDraft() {
		try {
			composerBusy = true; setComposerMessage('', '');
			await createCampaignRecord(); await refreshHistory();
			setComposerMessage('Draft saved.', '');
		} catch (e) { setComposerMessage('', e?.message || 'Unable to save draft.'); }
		finally { composerBusy = false; }
	}

	async function sendNow() {
		if (senderSelectionNeedsVerification) { setComposerMessage('', 'Verify the selected sender domain first.'); return; }
		try {
			composerBusy = true; setComposerMessage('', '');
			const campaign = await createCampaignRecord();
			await api(`/api/groups/${group.slug}/membership/emails/${campaign.id}/send-now`, { method: 'POST' });
			await refreshHistory();
			setComposerMessage('Campaign sent successfully.', '');
		} catch (e) { setComposerMessage('', e?.message || 'Unable to send campaign.'); }
		finally { composerBusy = false; }
	}

	async function scheduleSend() {
		if (!scheduleAt) { setComposerMessage('', 'Choose a send time first.'); return; }
		if (senderSelectionNeedsVerification) { setComposerMessage('', 'Verify the selected sender domain first.'); return; }
		try {
			composerBusy = true; setComposerMessage('', '');
			const campaign = await createCampaignRecord();
			await api(`/api/groups/${group.slug}/membership/emails/${campaign.id}/schedule`, {
				method: 'POST', body: JSON.stringify({ scheduled_at: new Date(scheduleAt).toISOString() })
			});
			await refreshHistory(); setComposerMessage('Campaign scheduled.', '');
		} catch (e) { setComposerMessage('', e?.message || 'Unable to schedule campaign.'); }
		finally { composerBusy = false; }
	}

	async function sendExistingCampaign(campaignId) {
		try {
			composerBusy = true; setComposerMessage('', '');
			await api(`/api/groups/${group.slug}/membership/emails/${campaignId}/send-now`, { method: 'POST' });
			await refreshHistory(); setComposerMessage('Campaign sent.', '');
		} catch (e) { setComposerMessage('', e?.message || 'Unable to send campaign.'); }
		finally { composerBusy = false; }
	}

	async function verifySenderDomain(senderId) {
		try {
			verifyingSenderId = senderId; setSenderMessage('', '');
			await api(`/api/groups/${group.slug}/email/domains/${senderId}/verify`, { method: 'POST' });
			await refreshSenderDomains();
			setSenderMessage('Sender domain verified.', '');
		} catch (e) { setSenderMessage('', e?.message || 'Unable to verify.'); }
		finally { verifyingSenderId = ''; }
	}

	async function saveSenderDomain() {
		try {
			senderBusy = true; setSenderMessage('', '');
			await api(`/api/groups/${group.slug}/email/domains`, { method: 'POST', body: JSON.stringify(senderForm) });
			await refreshSenderDomains();
			senderForm = { domain: '', from_name: group.name || '', from_local_part: 'hello', reply_to_email: '', is_default: false };
			setSenderMessage('Sender domain synced with AWS.', '');
			// Auto-close the panel if this was the first domain and it's now configured
			if (hasSenderReady) domainPanelOpen = false;
		} catch (e) { setSenderMessage('', e?.message || 'Unable to save sender domain.'); }
		finally { senderBusy = false; }
	}

	async function copyDnsValue(value, key) {
		try {
			await navigator.clipboard.writeText(value);
			copiedDns = key;
			setTimeout(() => { if (copiedDns === key) copiedDns = ''; }, 1200);
		} catch { setSenderMessage('', 'Unable to copy DNS value.'); }
	}
</script>

<svelte:head>
	<title>Email | {group.name}</title>
</svelte:head>

<div class="space-y-3 pb-10">

	<!-- ══ STUDIO CARD ══════════════════════════════════════════════ -->
	<div class="card bg-surface-50-950 border-surface-200-800 overflow-hidden border">

		<!-- Studio header -->
		<div class="border-surface-200-800 flex items-center justify-between gap-3 border-b px-4 py-3">
			<div class="flex items-center gap-3">
				<div class="bg-primary-500/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
					<IconMail class="text-primary-400 h-4 w-4" />
				</div>
				<div>
					<h2 class="text-sm font-semibold">Email Studio</h2>
					<p class="text-surface-400-600 text-xs">
						{#if selectedSender}
							Sending from <span class="text-primary-400 font-medium">{selectedSender.from_email_address}</span>
							· {selectedAudienceCount} recipients
						{:else if senderDomains.length > 0}
							No verified sender · {selectedAudienceCount} recipients
						{:else}
							Set up a sender domain to start sending
						{/if}
					</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<!-- Sender domain status indicator -->
				{#if verifiedSenderCount > 0}
					<span class="chip preset-tonal-success text-xs">
						<IconBadgeCheck class="h-3 w-3" />
						{verifiedSenderCount} sender{verifiedSenderCount > 1 ? 's' : ''} ready
					</span>
				{:else if senderDomains.length > 0}
					<span class="chip preset-tonal-warning text-xs">
						<IconTriangleAlert class="h-3 w-3" />
						Verification pending
					</span>
				{/if}

				<!-- Settings / domain config button -->
				<button
					type="button"
					class="btn btn-sm
						{domainPanelOpen ? 'preset-filled-surface-500' : 'preset-tonal-surface'}
						{!hasSenderReady && senderDomains.length === 0 ? 'preset-filled-primary-500' : ''}"
					onclick={() => (domainPanelOpen = !domainPanelOpen)}
					title="Sender domain settings"
				>
					<IconSettings class="h-4 w-4 {domainPanelOpen ? 'rotate-45' : ''} transition-transform duration-200" />
					{#if !hasSenderReady && senderDomains.length === 0}
						Setup sender
					{/if}
				</button>
			</div>
		</div>

		<!-- ── DOMAIN CONFIG PANEL (slide-down) ──────────────────── -->
		{#if domainPanelOpen}
			<div class="border-surface-200-800 border-b" transition:slide={{ duration: 200 }}>
				<div class="space-y-5 p-4 sm:p-5">

					<!-- Intro if no domains yet -->
					{#if senderDomains.length === 0}
						<div class="bg-primary-500/5 border-primary-500/20 rounded-lg border p-4">
							<p class="text-sm font-medium">Add a sender domain to start sending campaigns</p>
							<p class="text-surface-400-600 mt-1 text-xs">
								AWS SES requires a verified domain. Once set up, recipients will see your domain name
								as the sender instead of a generic address.
							</p>
						</div>
					{/if}

					{#if senderNotice}
						<div class="preset-tonal-success flex items-center gap-2 rounded-lg p-3 text-sm">
							<IconCheck class="h-4 w-4 shrink-0" /> {senderNotice}
						</div>
					{/if}
					{#if senderError}
						<div class="preset-tonal-error flex items-center gap-2 rounded-lg p-3 text-sm">
							<IconTriangleAlert class="h-4 w-4 shrink-0" /> {senderError}
						</div>
					{/if}

					<!-- Add domain form -->
					<div>
						<p class="text-surface-600-400 mb-3 text-xs font-semibold uppercase tracking-wide">
							{senderDomains.length > 0 ? 'Add another domain' : 'Configure sender domain'}
						</p>

						{#if registeredSiteDomains.length}
							<div class="mb-3 flex gap-2">
								<select class="select flex-1 text-sm" bind:value={selectedSiteDomain}>
									<option value="">Quick-fill from a site domain…</option>
									{#each registeredSiteDomains as domainRow}
										<option value={domainRow.domain}>{domainRow.label}</option>
									{/each}
								</select>
								<button class="btn preset-tonal-primary btn-sm" type="button" disabled={!selectedSiteDomain} onclick={applySelectedSiteDomain}>
									Use
								</button>
							</div>
						{/if}

						<div class="grid gap-3 sm:grid-cols-2">
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium">Domain</span>
								<input class="input w-full text-sm" bind:value={senderForm.domain} placeholder="mail.yourgroup.org" />
							</label>
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium">From name</span>
								<input class="input w-full text-sm" bind:value={senderForm.from_name} placeholder={group.name} />
							</label>
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium">Local part (before @)</span>
								<input class="input w-full text-sm" bind:value={senderForm.from_local_part} placeholder="hello" />
							</label>
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium">Reply-to</span>
								<input class="input w-full text-sm" bind:value={senderForm.reply_to_email} placeholder="organizers@yourgroup.org" />
							</label>
						</div>
						<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
							<label class="flex cursor-pointer items-center gap-2 text-sm">
								<input type="checkbox" class="checkbox" bind:checked={senderForm.is_default} />
								Make default sender
							</label>
							<button class="btn preset-filled-primary-500" type="button" disabled={senderBusy} onclick={saveSenderDomain}>
								<IconGlobe class="h-4 w-4" />
								Sync with AWS
							</button>
						</div>
					</div>

					<!-- Buy domain -->
					<div class="border-surface-200-800 border-t pt-4">
						<DomainPurchasePanel
							groupSlug={group.slug}
							initialSearchQuery={group.slug || ''}
							defaultContact={{
								email: group.public_contact_email || group.contact_email || '',
								city: group.city || '',
								state: group.state_region || '',
								country: 'US'
							}}
							returnPath={`/groups/${group.slug}/manage/email?domain_payment=return`}
							title="Buy New Domain"
						/>
					</div>

					<!-- Existing domains list -->
					{#if senderDomains.length > 0}
						<div class="border-surface-200-800 space-y-3 border-t pt-4">
							<div class="flex items-center justify-between">
								<p class="text-surface-600-400 text-xs font-semibold uppercase tracking-wide">Configured domains</p>
								<button class="btn preset-tonal-surface btn-sm" type="button" onclick={refreshSenderDomains}>
									<IconRefreshCw class="h-3.5 w-3.5" /> Refresh
								</button>
							</div>
							{#each senderDomains as sender}
								<div class="bg-surface-100-900 border-surface-200-800 rounded-lg border p-3">
									<div class="mb-2 flex flex-wrap items-start justify-between gap-2">
										<div>
											<div class="flex flex-wrap items-center gap-1.5">
												<span class="text-sm font-semibold">{sender.domain}</span>
												{#if sender.is_default}<span class="chip preset-tonal-surface text-xs">Default</span>{/if}
												<span class="chip text-xs {sender.ses_verified_for_sending ? 'preset-tonal-success' : sender.status === 'failed' ? 'preset-tonal-error' : 'preset-tonal-warning'}">
													{#if sender.ses_verified_for_sending}<IconBadgeCheck class="h-3 w-3" />{/if}
													{sender.ses_verified_for_sending ? 'Verified' : sender.status || 'Pending'}
												</span>
											</div>
											<p class="text-surface-400-600 mt-0.5 text-xs">{sender.from_email_address}</p>
										</div>
										<button class="btn preset-tonal-surface btn-sm" type="button" disabled={verifyingSenderId === sender.id} onclick={() => verifySenderDomain(sender.id)}>
											<IconRefreshCw class="h-3.5 w-3.5 {verifyingSenderId === sender.id ? 'animate-spin' : ''}" /> Verify
										</button>
									</div>

									<!-- DNS badges -->
									<div class="mb-2 flex flex-wrap gap-1.5 text-xs">
										<span class="bg-surface-200-800 rounded px-2 py-0.5">DKIM: <strong>{sender.ses_dkim_status || 'pending'}</strong></span>
										<span class="bg-surface-200-800 rounded px-2 py-0.5">MAIL FROM: <strong>{sender.ses_mail_from_status || 'pending'}</strong></span>
										<span class="bg-surface-200-800 rounded px-2 py-0.5">
											Vercel DNS: <strong>{sender?.verification_details?.vercel_dns?.registered_via_vercel ? (sender?.verification_details?.vercel_dns?.status ?? 'pending') : 'manual'}</strong>
										</span>
									</div>

									{#if sender?.verification_details?.vercel_dns?.status === 'failed' && sender?.verification_details?.vercel_dns?.error}
										<div class="preset-tonal-error mb-2 flex items-center gap-2 rounded p-2 text-xs">
											<IconTriangleAlert class="h-3.5 w-3.5 shrink-0" /> {sender.verification_details.vercel_dns.error}
										</div>
									{/if}

									{#if sender.dns_records?.length}
										<div class="overflow-x-auto">
											<table class="w-full text-xs">
												<thead>
													<tr class="text-surface-400-600 border-surface-200-800 border-b">
														<th class="pb-1 pr-3 text-left font-semibold uppercase tracking-wide">Type</th>
														<th class="pb-1 pr-3 text-left font-semibold uppercase tracking-wide">Name</th>
														<th class="pb-1 pr-3 text-left font-semibold uppercase tracking-wide">Value</th>
														<th class="pb-1"></th>
													</tr>
												</thead>
												<tbody>
													{#each sender.dns_records as record}
														<tr class="border-surface-200-800 border-b last:border-0">
															<td class="py-1.5 pr-3 font-mono">{record.type}</td>
															<td class="py-1.5 pr-3 font-mono opacity-80">{record.name}</td>
															<td class="max-w-[160px] break-all py-1.5 pr-3 font-mono opacity-60">{record.value}</td>
															<td class="py-1.5">
																<button type="button" class="btn preset-tonal-surface btn-sm" onclick={() => copyDnsValue(record.value, `${sender.id}-${record.id}`)}>
																	{#if copiedDns === `${sender.id}-${record.id}`}
																		<IconCheck class="h-3.5 w-3.5" /> Copied
																	{:else}
																		<IconCopy class="h-3.5 w-3.5" /> Copy
																	{/if}
																</button>
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ── TABS (only shown once sender domain exists or can be bypassed) ── -->
		{#if hasSenderReady || senderDomains.length > 0 || !domainPanelOpen}
			<nav class="border-surface-200-800 flex overflow-x-auto border-b" style="scrollbar-width: none;">
				{#each [{ id: 'compose', label: 'Compose', icon: IconSquarePen }, { id: 'preview', label: 'Preview', icon: IconLayout }, { id: 'history', label: `History${emailHistory.length ? ` (${emailHistory.length})` : ''}`, icon: IconClock3 }] as tab}
					{@const Icon = tab.icon}
					{@const isActive = activeTab === tab.id}
					<button
						type="button"
						class="flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all
							{isActive ? 'border-primary-500 text-primary-400' : 'border-transparent text-surface-400-600 hover:text-surface-900-50'}"
						onclick={() => (activeTab = tab.id)}
					>
						<Icon class="h-4 w-4" />
						{tab.label}
					</button>
				{/each}
			</nav>
		{/if}

		<!-- ══ COMPOSE ══════════════════════════════════════════════ -->
		{#if activeTab === 'compose'}
			<div class="space-y-4 p-4 sm:p-5">

				<!-- Banners -->
				{#if notice}
					<div class="preset-tonal-success flex items-center gap-2 rounded-lg p-3 text-sm">
						<IconCheck class="h-4 w-4 shrink-0" /> {notice}
					</div>
				{/if}
				{#if error}
					<div class="preset-tonal-error flex items-center gap-2 rounded-lg p-3 text-sm">
						<IconTriangleAlert class="h-4 w-4 shrink-0" /> {error}
					</div>
				{/if}
				{#if senderSelectionNeedsVerification}
					<div class="preset-tonal-warning flex items-center gap-2 rounded-lg p-3 text-sm">
						<IconTriangleAlert class="h-4 w-4 shrink-0" />
						The selected sender isn't verified yet.
						<button type="button" class="underline" onclick={() => (domainPanelOpen = true)}>Open settings →</button>
					</div>
				{/if}

				<!-- Subject line — the most important field, first and prominent -->
				<label class="space-y-1.5">
					<span class="text-sm font-semibold">Subject line</span>
					<input class="input w-full text-base" bind:value={draft.subject} maxlength="300" placeholder="What's this email about?" />
				</label>

				<!-- Audience chips -->
				<div class="space-y-2">
					<span class="text-surface-600-400 text-xs font-semibold uppercase tracking-wide">Send to</span>
					<div class="flex flex-wrap gap-2">
						{#each ['active', 'past_due', 'cancelled'] as status}
							<label
								class="flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all
									{draft.audienceStatuses.includes(status)
										? 'border-primary-500/50 bg-primary-500/10 text-primary-300'
										: 'border-surface-200-800 bg-surface-100-900 text-surface-600-400'}"
							>
								<input type="checkbox" class="hidden" checked={draft.audienceStatuses.includes(status)}
									onchange={(e) => {
										if (e.currentTarget.checked) draft.audienceStatuses = [...new Set([...draft.audienceStatuses, status])];
										else draft.audienceStatuses = draft.audienceStatuses.filter((s) => s !== status);
									}}
								/>
								{#if draft.audienceStatuses.includes(status)}<IconCheck class="h-3.5 w-3.5" />{/if}
								<span class="capitalize">{status.replace('_', ' ')}</span>
								<span class="font-bold">{data.audienceSummary?.[status] || 0}</span>
							</label>
						{/each}
					</div>
					<p class="text-surface-400-600 text-xs">{selectedAudienceCount} recipients</p>
				</div>

				<!-- Content blocks -->
				<div class="space-y-2">
					<div class="flex items-center justify-between gap-3">
						<span class="text-sm font-semibold">Content</span>
						<div class="flex gap-2">
							<button type="button" class="btn preset-tonal-surface btn-sm" onclick={() => addBlock('paragraph')}>
								<IconPlus class="h-3.5 w-3.5" /> Text
							</button>
							<button type="button" class="btn preset-tonal-surface btn-sm" onclick={() => addBlock('button')}>
								<IconPlus class="h-3.5 w-3.5" /> CTA
							</button>
							<button type="button" class="btn preset-tonal-surface btn-sm" onclick={() => addBlock('quote')}>
								<IconPlus class="h-3.5 w-3.5" /> Quote
							</button>
						</div>
					</div>

					{#if draft.blocks.length === 0}
						<div class="border-surface-200-800 flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
							<div class="bg-surface-100-900 flex h-10 w-10 items-center justify-center rounded-full">
								<IconMail class="text-surface-400-600 h-5 w-5" />
							</div>
							<div>
								<p class="text-sm font-medium">No content yet</p>
								<p class="text-surface-400-600 text-xs">Add a Text, CTA, or Quote block above to start building.</p>
							</div>
						</div>
					{:else}
						<div class="space-y-2">
							{#each draft.blocks as block, index (block.id)}
								<div class="bg-surface-100-900 border-surface-200-800 rounded-xl border p-3">
									<div class="mb-2.5 flex items-center justify-between">
										<span class="text-surface-400-600 text-xs font-semibold uppercase tracking-wide">{index + 1} · {block.type}</span>
										<button type="button" class="btn preset-tonal-error btn-sm py-1" onclick={() => removeBlock(block.id)}>
											<IconTrash class="h-3.5 w-3.5" />
										</button>
									</div>

									{#if block.type === 'hero'}
										<div class="grid gap-2 sm:grid-cols-2">
											<input class="input text-sm" bind:value={block.eyebrow} placeholder="Eyebrow label" />
											<input class="input text-sm" bind:value={block.title} placeholder="Headline" />
										</div>
										<textarea class="textarea mt-2 w-full text-sm" bind:value={block.body} rows="3" placeholder="Body copy…"></textarea>
										<div class="mt-2 grid gap-2 sm:grid-cols-2">
											<input class="input text-sm" bind:value={block.buttonLabel} placeholder="Button label" />
											<input class="input text-sm" bind:value={block.buttonUrl} placeholder="https://…" />
										</div>
									{:else if block.type === 'metrics'}
										<div class="grid gap-2 sm:grid-cols-3">
											{#each block.items as item}
												<div class="bg-surface-50-950 border-surface-200-800 rounded-lg border p-2">
													<input class="input mb-1 w-full text-xs" bind:value={item.label} placeholder="Label" />
													<input class="input w-full text-xs" bind:value={item.value} placeholder="Value" />
												</div>
											{/each}
										</div>
									{:else if block.type === 'button'}
										<input class="input mb-2 w-full text-sm" bind:value={block.title} placeholder="Section title (optional)" />
										<div class="grid gap-2 sm:grid-cols-2">
											<input class="input text-sm" bind:value={block.buttonLabel} placeholder="Button label" />
											<input class="input text-sm" bind:value={block.buttonUrl} placeholder="https://…" />
										</div>
									{:else}
										<input class="input mb-2 w-full text-sm" bind:value={block.title} placeholder="Section heading" />
										<textarea class="textarea w-full text-sm" bind:value={block.body} rows="4" placeholder="Body copy…"></textarea>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Advanced settings (campaign name, template, sender, preheader) -->
				<div class="border-surface-200-800 overflow-hidden rounded-xl border">
					<button
						type="button"
						class="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5"
						onclick={() => (showAdvanced = !showAdvanced)}
					>
						<span>Advanced settings</span>
						<IconChevronDown class="h-4 w-4 opacity-50 transition-transform duration-200 {showAdvanced ? 'rotate-180' : ''}" />
					</button>
					{#if showAdvanced}
						<div class="border-surface-200-800 grid gap-3 border-t p-4 sm:grid-cols-2" transition:slide={{ duration: 150 }}>
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium">Campaign name</span>
								<input class="input w-full text-sm" bind:value={draft.campaignName} maxlength="120" placeholder="e.g. June newsletter" />
							</label>
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium">Preheader</span>
								<input class="input w-full text-sm" bind:value={draft.preheader} maxlength="180" placeholder="Preview text in inbox" />
							</label>
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium">Template</span>
								<select class="select w-full text-sm" bind:value={draft.templateId}>
									{#each EMAIL_TEMPLATE_PRESETS as preset}
										<option value={preset.id}>{preset.label}</option>
									{/each}
								</select>
							</label>
							<label class="space-y-1">
								<span class="text-surface-600-400 text-xs font-medium">Sender domain</span>
								<select class="select w-full text-sm" bind:value={draft.senderDomainId}>
									<option value="">Default SES sender</option>
									{#each senderDomains as sender}
										<option value={sender.id} disabled={!sender.ses_verified_for_sending}>
											{sender.domain} {sender.ses_verified_for_sending ? '· verified' : '· pending'}
										</option>
									{/each}
								</select>
							</label>
							{#if selectedPreset}
								<div class="border-surface-200-800 col-span-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
									<div>
										<p class="text-sm font-medium">{selectedPreset.label}</p>
										<p class="text-surface-400-600 text-xs">{selectedPreset.description}</p>
									</div>
									<div class="flex gap-1.5">
										<span class="h-4 w-4 rounded-full" style="background:{selectedPreset.colors.accent}"></span>
										<span class="h-4 w-4 rounded-full" style="background:{selectedPreset.colors.accentSoft}"></span>
										<span class="h-4 w-4 rounded-full" style="background:{selectedPreset.colors.ink}"></span>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Action bar -->
				<div class="border-surface-200-800 flex flex-wrap items-center gap-2 border-t pt-4">
					<button class="btn preset-tonal-surface btn-sm" type="button" disabled={composerBusy} onclick={resetDraft}>
						<IconSparkles class="h-4 w-4" /> New draft
					</button>
					<button class="btn preset-tonal-surface" type="button" disabled={composerBusy} onclick={saveDraft}>
						<IconSquarePen class="h-4 w-4" /> Save draft
					</button>
					<div class="ml-auto flex flex-wrap items-center gap-2">
						<div class="flex items-center gap-1.5">
							<input type="datetime-local" class="input text-sm" bind:value={scheduleAt} />
							<button class="btn preset-tonal-surface" type="button" disabled={composerBusy} onclick={scheduleSend}>
								<IconClock3 class="h-4 w-4" /> Schedule
							</button>
						</div>
						<button class="btn preset-filled-primary-500" type="button" disabled={composerBusy} onclick={sendNow}>
							<IconSend class="h-4 w-4" /> Send now
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- ══ PREVIEW ══════════════════════════════════════════════ -->
		{#if activeTab === 'preview'}
			<div class="p-4 sm:p-5">
				<div class="border-surface-200-800 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs">
					<div class="flex flex-wrap gap-2">
						<span class="text-surface-400-600">Subject:</span>
						<span class="font-medium">{draft.subject || '(no subject)'}</span>
					</div>
					<div class="flex flex-wrap gap-3 text-surface-400-600">
						<span>{selectedAudienceCount} recipients</span>
						{#if selectedSender}
							<span>from {selectedSender.from_email_address}</span>
						{:else}
							<span>default SES sender</span>
						{/if}
					</div>
				</div>
				<div class="border-surface-200-800 overflow-hidden rounded-xl border bg-white">
					<iframe title="Email preview" srcdoc={previewHtml} class="w-full" style="min-height:560px;border:0;background:white;"></iframe>
				</div>
			</div>
		{/if}

		<!-- ══ HISTORY ══════════════════════════════════════════════ -->
		{#if activeTab === 'history'}
			<div class="p-4 sm:p-5">
				<div class="mb-4 flex items-center justify-between">
					<p class="text-surface-400-600 text-sm">Duplicate any campaign to load it back into the composer.</p>
					<button class="btn preset-tonal-surface btn-sm" type="button" onclick={refreshHistory}>
						<IconRefreshCw class="h-3.5 w-3.5" /> Refresh
					</button>
				</div>

				{#if notice}
					<div class="preset-tonal-success mb-4 flex items-center gap-2 rounded-lg p-3 text-sm">
						<IconCheck class="h-4 w-4 shrink-0" /> {notice}
					</div>
				{/if}

				{#if emailHistory.length === 0}
					<div class="border-surface-200-800 flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
						<div class="bg-surface-100-900 flex h-10 w-10 items-center justify-center rounded-full">
							<IconClock3 class="text-surface-400-600 h-5 w-5" />
						</div>
						<div>
							<p class="text-sm font-medium">No campaigns yet</p>
							<p class="text-surface-400-600 mt-0.5 text-xs">Save or send a draft to see it here.</p>
						</div>
						<button class="btn preset-tonal-primary btn-sm" type="button" onclick={() => (activeTab = 'compose')}>
							Start composing
						</button>
					</div>
				{:else}
					<div class="space-y-2">
						{#each emailHistory as campaign}
							<div class="bg-surface-100-900 border-surface-200-800 rounded-xl border p-3">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-2">
											<span class="text-sm font-medium">{campaign.campaign_name || campaign.subject_template}</span>
											<span class="chip text-xs
												{campaign.status === 'sent' ? 'preset-tonal-success' : campaign.status === 'failed' ? 'preset-tonal-error' : campaign.status === 'scheduled' ? 'preset-tonal-warning' : 'preset-tonal-surface'}">
												{campaign.status}
											</span>
										</div>
										{#if campaign.campaign_name}
											<p class="text-surface-400-600 mt-0.5 text-xs">{campaign.subject_template}</p>
										{/if}
										<div class="text-surface-400-600 mt-1.5 flex flex-wrap gap-3 text-xs">
											<span>{formatDate(campaign.created_at)}</span>
											<span>{campaign.sent_count || 0} sent</span>
											{#if campaign.scheduled_at}<span>Scheduled {formatDate(campaign.scheduled_at)}</span>{/if}
										</div>
									</div>
									<div class="flex shrink-0 gap-2">
										<button class="btn preset-tonal-surface btn-sm" type="button" onclick={() => duplicateCampaign(campaign)}>
											<IconCopy class="h-3.5 w-3.5" /> Duplicate
										</button>
										{#if campaign.status === 'draft' || campaign.status === 'failed' || campaign.status === 'scheduled'}
											<button class="btn preset-filled-primary-500 btn-sm" type="button" disabled={composerBusy} onclick={() => sendExistingCampaign(campaign.id)}>
												<IconSend class="h-3.5 w-3.5" /> Send
											</button>
										{/if}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
