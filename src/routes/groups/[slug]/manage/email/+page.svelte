<script>
	import { untrack } from 'svelte';
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
			return {
				id: makeId('paragraph'),
				type,
				title: 'New section',
				body: 'Write a concise, skimmable block of copy.'
			};
		}
		if (type === 'button') {
			return {
				id: makeId('button'),
				type,
				title: 'Primary action',
				buttonLabel: 'Open link',
				buttonUrl: ''
			};
		}
		if (type === 'quote') {
			return {
				id: makeId('quote'),
				type,
				title: 'Member voice',
				body: 'Add a quote, organizer perspective, or short testimonial.'
			};
		}
		return {
			id: makeId('paragraph'),
			type: 'paragraph',
			title: '',
			body: ''
		};
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
			headers: {
				'Content-Type': 'application/json',
				...(options.headers || {})
			},
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
	let senderForm = $state(
		untrack(() => ({
			domain: '',
			from_name: data.group?.name || '',
			from_local_part: 'hello',
			reply_to_email: '',
			is_default: (data.senderDomains || []).length === 0
		}))
	);

	const previewHtml = $derived(
		renderCampaignHtml({
			draft,
			group,
			audienceCount: audienceCount(draft.audienceStatuses, data.audienceSummary)
		})
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
	const selectedAudienceCount = $derived(
		audienceCount(draft.audienceStatuses, data.audienceSummary || {})
	);
	const explicitlySelectedSender = $derived(
		senderDomains.find((row) => row.id === draft.senderDomainId) || null
	);
	const selectedSender = $derived(
		explicitlySelectedSender ||
			senderDomains.find((row) => row.is_default) ||
			null
	);
	const senderSelectionNeedsVerification = $derived(
		Boolean(
			draft.senderDomainId &&
				(!explicitlySelectedSender || explicitlySelectedSender.ses_verified_for_sending !== true)
		)
	);

	function setComposerMessage(nextNotice = '', nextError = '') {
		notice = nextNotice;
		error = nextError;
	}

	function setSenderMessage(nextNotice = '', nextError = '') {
		senderNotice = nextNotice;
		senderError = nextError;
	}

	function resetDraft() {
		draft = createDraft();
	}

	function addBlock(type) {
		draft.blocks = [...draft.blocks, blockFactory(type)];
	}

	function removeBlock(blockId) {
		draft.blocks = draft.blocks.filter((block) => block.id !== blockId);
	}

	function duplicateCampaign(campaign) {
		draft = hydrateEditorFromCampaign(campaign);
		setComposerMessage('Loaded campaign into the composer.', '');
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
				editor: {
					...clone(draft),
					rendered_text: previewText
				}
			}
		};
		return api(`/api/groups/${group.slug}/membership/emails`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});
	}

	async function saveDraft() {
		try {
			composerBusy = true;
			setComposerMessage('', '');
			await createCampaignRecord();
			await refreshHistory();
			setComposerMessage('Draft saved to campaign history.', '');
		} catch (saveError) {
			setComposerMessage('', saveError?.message || 'Unable to save draft.');
		} finally {
			composerBusy = false;
		}
	}

	async function sendNow() {
		if (senderSelectionNeedsVerification) {
			setComposerMessage('', 'Verify the selected sender domain before sending.');
			return;
		}
		try {
			composerBusy = true;
			setComposerMessage('', '');
			const campaign = await createCampaignRecord();
			await api(`/api/groups/${group.slug}/membership/emails/${campaign.id}/send-now`, {
				method: 'POST'
			});
			await refreshHistory();
			setComposerMessage('Campaign sent.', '');
		} catch (sendError) {
			setComposerMessage('', sendError?.message || 'Unable to send campaign.');
		} finally {
			composerBusy = false;
		}
	}

	async function scheduleSend() {
		if (!scheduleAt) {
			setComposerMessage('', 'Choose a send time first.');
			return;
		}
		if (senderSelectionNeedsVerification) {
			setComposerMessage('', 'Verify the selected sender domain before scheduling.');
			return;
		}
		try {
			composerBusy = true;
			setComposerMessage('', '');
			const campaign = await createCampaignRecord();
			await api(`/api/groups/${group.slug}/membership/emails/${campaign.id}/schedule`, {
				method: 'POST',
				body: JSON.stringify({ scheduled_at: new Date(scheduleAt).toISOString() })
			});
			await refreshHistory();
			setComposerMessage('Campaign scheduled.', '');
		} catch (scheduleError) {
			setComposerMessage('', scheduleError?.message || 'Unable to schedule campaign.');
		} finally {
			composerBusy = false;
		}
	}

	async function sendExistingCampaign(campaignId) {
		try {
			composerBusy = true;
			setComposerMessage('', '');
			await api(`/api/groups/${group.slug}/membership/emails/${campaignId}/send-now`, {
				method: 'POST'
			});
			await refreshHistory();
			setComposerMessage('Campaign sent.', '');
		} catch (sendError) {
			setComposerMessage('', sendError?.message || 'Unable to send campaign.');
		} finally {
			composerBusy = false;
		}
	}

	async function verifySenderDomain(senderId) {
		try {
			verifyingSenderId = senderId;
			setSenderMessage('', '');
			await api(`/api/groups/${group.slug}/email/domains/${senderId}/verify`, {
				method: 'POST'
			});
			await refreshSenderDomains();
			setSenderMessage('Sender domain verified against AWS and refreshed.', '');
		} catch (verifyError) {
			setSenderMessage('', verifyError?.message || 'Unable to verify sender domain.');
		} finally {
			verifyingSenderId = '';
		}
	}

	async function saveSenderDomain() {
		try {
			senderBusy = true;
			setSenderMessage('', '');
			await api(`/api/groups/${group.slug}/email/domains`, {
				method: 'POST',
				body: JSON.stringify(senderForm)
			});
			await refreshSenderDomains();
			senderForm = {
				domain: '',
				from_name: group.name || '',
				from_local_part: 'hello',
				reply_to_email: '',
				is_default: false
			};
			setSenderMessage('Sender domain synced with AWS.', '');
		} catch (saveError) {
			setSenderMessage('', saveError?.message || 'Unable to save sender domain.');
		} finally {
			senderBusy = false;
		}
	}

	async function copyDnsValue(value, key) {
		try {
			await navigator.clipboard.writeText(value);
			copiedDns = key;
			setTimeout(() => {
				if (copiedDns === key) copiedDns = '';
			}, 1200);
		} catch {
			setSenderMessage('', 'Unable to copy DNS value.');
		}
	}
</script>

<svelte:head>
	<title>Email | {group.name}</title>
</svelte:head>

<div class="space-y-6 pb-10">
	<section class="email-hero">
		<div class="email-hero-copy">
			<div class="eyebrow">
				<IconMail class="h-4 w-4" />
				<span>Email Studio</span>
			</div>
			<h1>Build polished member campaigns with a block editor and live preview.</h1>
			<p>
				Compose the message, send from a verified custom domain, and reuse campaign history without
				leaving group management.
			</p>
		</div>
		<div class="hero-metrics">
			<div class="hero-metric">
				<span>Audience</span>
				<strong>{data.audienceSummary.total}</strong>
				<small>members in included statuses</small>
			</div>
			<div class="hero-metric">
				<span>Verified senders</span>
				<strong>{senderDomains.filter((row) => row.ses_verified_for_sending).length}</strong>
				<small>ready in AWS SES</small>
			</div>
			<div class="hero-metric">
				<span>Campaign history</span>
				<strong>{emailHistory.length}</strong>
				<small>saved drafts and sends</small>
			</div>
		</div>
	</section>

	<div class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
		<section class="studio-panel space-y-5">
			<div class="panel-header">
				<div>
					<h2>Composer</h2>
					<p>Design the email first, then save a draft, send immediately, or schedule it.</p>
				</div>
				<button class="chip-button" type="button" onclick={resetDraft}>
					<IconSparkles class="h-4 w-4" />
					New draft
				</button>
			</div>

			{#if notice}
				<div class="banner success"><IconCheck class="h-4 w-4" /> {notice}</div>
			{/if}
			{#if error}
				<div class="banner error"><IconTriangleAlert class="h-4 w-4" /> {error}</div>
			{/if}

			<div class="grid gap-4 lg:grid-cols-2">
				<label class="field">
					<span>Campaign name</span>
					<input bind:value={draft.campaignName} maxlength="120" />
				</label>
				<label class="field">
					<span>Subject line</span>
					<input bind:value={draft.subject} maxlength="300" />
				</label>
			</div>

			<div class="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
				<label class="field">
					<span>Template</span>
					<select bind:value={draft.templateId}>
						{#each EMAIL_TEMPLATE_PRESETS as preset}
							<option value={preset.id}>{preset.label}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Sender domain</span>
					<select bind:value={draft.senderDomainId}>
						<option value="">Default SES sender</option>
						{#each senderDomains as sender}
							<option value={sender.id} disabled={!sender.ses_verified_for_sending}>
								{sender.domain}
								{sender.ses_verified_for_sending ? '• verified' : '• pending'}
							</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span>Preheader</span>
					<input bind:value={draft.preheader} maxlength="180" />
				</label>
			</div>

			<div class="field">
				<span>Audience</span>
				<div class="audience-grid">
					{#each ['active', 'past_due', 'cancelled'] as status}
						<label class="audience-chip">
							<input
								type="checkbox"
								checked={draft.audienceStatuses.includes(status)}
								onchange={(event) => {
									if (event.currentTarget.checked) {
										draft.audienceStatuses = [...new Set([...draft.audienceStatuses, status])];
									} else {
										draft.audienceStatuses = draft.audienceStatuses.filter(
											(item) => item !== status
										);
									}
								}}
							/>
							<span>{status.replace('_', ' ')}</span>
							<strong>{data.audienceSummary?.[status] || 0}</strong>
						</label>
					{/each}
				</div>
				<small>{selectedAudienceCount} recipients match the current audience filters.</small>
			</div>

			{#if senderSelectionNeedsVerification}
				<div class="banner error">
					<IconTriangleAlert class="h-4 w-4" />
					The selected sender domain is not verified yet. Verify it in Sender domains before
					sending.
				</div>
			{/if}

			<div class="preset-callout">
				<div>
					<strong>{selectedPreset.label}</strong>
					<p>{selectedPreset.description}</p>
				</div>
				<div class="preset-swatches">
					<span style={`background:${selectedPreset.colors.accent}`}></span>
					<span style={`background:${selectedPreset.colors.accentSoft}`}></span>
					<span style={`background:${selectedPreset.colors.ink}`}></span>
				</div>
			</div>

			<div class="blocks-header">
				<div>
					<h3>Blocks</h3>
					<p>Stack sections in the order readers should experience them.</p>
				</div>
				<div class="block-actions">
					<button type="button" class="chip-button" onclick={() => addBlock('paragraph')}>
						<IconPlus class="h-4 w-4" />
						Text
					</button>
					<button type="button" class="chip-button" onclick={() => addBlock('button')}>
						<IconPlus class="h-4 w-4" />
						CTA
					</button>
					<button type="button" class="chip-button" onclick={() => addBlock('quote')}>
						<IconPlus class="h-4 w-4" />
						Quote
					</button>
				</div>
			</div>

			<div class="space-y-4">
				{#each draft.blocks as block, index (block.id)}
					<div class="block-card">
						<div class="block-card-header">
							<div>
								<strong>{index + 1}. {block.type}</strong>
								<small>{block.id}</small>
							</div>
							<button type="button" class="icon-button" onclick={() => removeBlock(block.id)}>
								Remove
							</button>
						</div>

						{#if block.type === 'hero'}
							<div class="grid gap-3 lg:grid-cols-2">
								<label class="field">
									<span>Eyebrow</span>
									<input bind:value={block.eyebrow} />
								</label>
								<label class="field">
									<span>Headline</span>
									<input bind:value={block.title} />
								</label>
							</div>
							<label class="field">
								<span>Body</span>
								<textarea bind:value={block.body} rows="4"></textarea>
							</label>
							<div class="grid gap-3 lg:grid-cols-2">
								<label class="field">
									<span>Button label</span>
									<input bind:value={block.buttonLabel} />
								</label>
								<label class="field">
									<span>Button URL</span>
									<input bind:value={block.buttonUrl} />
								</label>
							</div>
						{:else if block.type === 'metrics'}
							<div class="grid gap-3 lg:grid-cols-3">
								{#each block.items as item}
									<div class="metric-editor">
										<label class="field">
											<span>Label</span>
											<input bind:value={item.label} />
										</label>
										<label class="field">
											<span>Value</span>
											<input bind:value={item.value} />
										</label>
									</div>
								{/each}
							</div>
						{:else if block.type === 'button'}
							<label class="field">
								<span>Section title</span>
								<input bind:value={block.title} />
							</label>
							<div class="grid gap-3 lg:grid-cols-2">
								<label class="field">
									<span>Button label</span>
									<input bind:value={block.buttonLabel} />
								</label>
								<label class="field">
									<span>Button URL</span>
									<input bind:value={block.buttonUrl} />
								</label>
							</div>
						{:else}
							<label class="field">
								<span>Title</span>
								<input bind:value={block.title} />
							</label>
							<label class="field">
								<span>Body</span>
								<textarea bind:value={block.body} rows="5"></textarea>
							</label>
						{/if}
					</div>
				{/each}
			</div>

			<div class="composer-actions">
				<button class="btn-secondary" type="button" disabled={composerBusy} onclick={saveDraft}>
					<IconSquarePen class="h-4 w-4" />
					Save draft
				</button>
				<div class="schedule-bar">
					<input type="datetime-local" bind:value={scheduleAt} />
					<button
						class="btn-secondary"
						type="button"
						disabled={composerBusy}
						onclick={scheduleSend}
					>
						<IconClock3 class="h-4 w-4" />
						Schedule
					</button>
				</div>
				<button class="btn-primary" type="button" disabled={composerBusy} onclick={sendNow}>
					<IconSend class="h-4 w-4" />
					Send now
				</button>
			</div>
		</section>

		<section class="space-y-6">
			<div class="studio-panel">
				<div class="panel-header">
					<div>
						<h2>Live preview</h2>
						<p>Rendered HTML from the current block layout.</p>
					</div>
					<div class="preview-meta">
						<span>{selectedAudienceCount} recipients</span>
						{#if selectedSender}
							<span>{selectedSender.from_email_address}</span>
						{:else}
							<span>Default SES sender</span>
						{/if}
					</div>
				</div>
				<div class="preview-shell">
					<iframe title="Email preview" srcdoc={previewHtml}></iframe>
				</div>
			</div>

			<div class="studio-panel">
				<div class="panel-header">
					<div>
						<h2>Sender domains</h2>
						<p>
							Create SES identities, copy required DNS records, and verify sending status. Domains
							registered through your microsite flow sync records to Vercel automatically.
						</p>
					</div>
					<button class="chip-button" type="button" onclick={refreshSenderDomains}>
						<IconRefreshCw class="h-4 w-4" />
						Refresh
					</button>
				</div>

				{#if senderNotice}
					<div class="banner success"><IconCheck class="h-4 w-4" /> {senderNotice}</div>
				{/if}
				{#if senderError}
					<div class="banner error"><IconTriangleAlert class="h-4 w-4" /> {senderError}</div>
				{/if}

				<div class="grid gap-3 lg:grid-cols-2">
					{#if registeredSiteDomains.length}
						<label class="field lg:col-span-2">
							<span>Use a site domain</span>
							<div class="registered-domain-picker">
								<select bind:value={selectedSiteDomain}>
									<option value="">Select a domain already attached to this group</option>
									{#each registeredSiteDomains as domainRow}
										<option value={domainRow.domain}>{domainRow.label}</option>
									{/each}
								</select>
								<button
									class="btn-secondary"
									type="button"
									disabled={!selectedSiteDomain}
									onclick={applySelectedSiteDomain}
								>
									Use domain
								</button>
							</div>
						</label>
					{/if}
					<label class="field">
						<span>Domain</span>
						<input
							bind:value={senderForm.domain}
							placeholder="mail.yourgroup.org or yourgroup.org"
						/>
					</label>
					<label class="field">
						<span>From name</span>
						<input bind:value={senderForm.from_name} placeholder={group.name} />
					</label>
					<label class="field">
						<span>From address local part</span>
						<input bind:value={senderForm.from_local_part} placeholder="hello" />
					</label>
					<label class="field">
						<span>Reply-to email</span>
						<input bind:value={senderForm.reply_to_email} placeholder="organizers@yourgroup.org" />
					</label>
				</div>
				<label class="audience-chip max-w-max">
					<input type="checkbox" bind:checked={senderForm.is_default} />
					<span>Make this the default sender</span>
				</label>
				<button
					class="btn-primary mt-3"
					type="button"
					disabled={senderBusy}
					onclick={saveSenderDomain}
				>
					<IconGlobe class="h-4 w-4" />
					Sync with AWS
				</button>

				<div class="mt-4">
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

				<div class="space-y-4 pt-5">
					{#if senderDomains.length === 0}
						<div class="empty-card">No sender domains configured yet.</div>
					{:else}
						{#each senderDomains as sender}
							<div class="sender-card">
								<div class="sender-card-header">
									<div>
										<div class="sender-title">
											<strong>{sender.domain}</strong>
											{#if sender.is_default}
												<span class="status-pill neutral">Default</span>
											{/if}
											<span
												class={`status-pill ${sender.ses_verified_for_sending ? 'success' : sender.status === 'failed' ? 'error' : 'warning'}`}
											>
												{sender.ses_verified_for_sending ? 'Verified' : sender.status}
											</span>
										</div>
										<p>{sender.from_email_address}</p>
									</div>
									<button
										class="chip-button"
										type="button"
										disabled={verifyingSenderId === sender.id}
										onclick={() => verifySenderDomain(sender.id)}
									>
										<IconRefreshCw
											class={`h-4 w-4 ${verifyingSenderId === sender.id ? 'spin' : ''}`}
										/>
										Verify
									</button>
								</div>

								<div class="sender-meta">
									<div>
										<span>DKIM</span>
										<strong>{sender.ses_dkim_status || 'pending'}</strong>
									</div>
									<div>
										<span>MAIL FROM</span>
										<strong>{sender.ses_mail_from_status || 'pending'}</strong>
									</div>
									<div>
										<span>Vercel DNS</span>
										<strong>
											{#if sender?.verification_details?.vercel_dns?.registered_via_vercel}
												{#if sender?.verification_details?.vercel_dns?.status === 'synced'}
													synced
												{:else if sender?.verification_details?.vercel_dns?.status === 'failed'}
													failed
												{:else}
													pending
												{/if}
											{:else}
												manual
											{/if}
										</strong>
									</div>
								</div>
								{#if sender?.verification_details?.vercel_dns?.status === 'failed' && sender?.verification_details?.vercel_dns?.error}
									<div class="banner error mt-2">
										<IconTriangleAlert class="h-4 w-4" />
										{sender.verification_details.vercel_dns.error}
									</div>
								{/if}

								<div class="dns-table">
									<div class="dns-header">
										<span>Type</span>
										<span>Name</span>
										<span>Value</span>
										<span></span>
									</div>
									{#each sender.dns_records || [] as record}
										<div class="dns-row">
											<span>{record.type}</span>
											<span>{record.name}</span>
											<span class="dns-value">{record.value}</span>
											<button
												type="button"
												class="icon-button"
												onclick={() => copyDnsValue(record.value, `${sender.id}-${record.id}`)}
											>
												<IconCopy class="h-4 w-4" />
												{copiedDns === `${sender.id}-${record.id}` ? 'Copied' : 'Copy'}
											</button>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<div class="studio-panel">
				<div class="panel-header">
					<div>
						<h2>Campaign history</h2>
						<p>Duplicate drafts, reuse layouts, or manually send saved campaigns.</p>
					</div>
					<button class="chip-button" type="button" onclick={refreshHistory}>
						<IconRefreshCw class="h-4 w-4" />
						Refresh
					</button>
				</div>

				<div class="space-y-3">
					{#if emailHistory.length === 0}
						<div class="empty-card">No campaigns yet.</div>
					{:else}
						{#each emailHistory as campaign}
							<div class="history-card">
								<div class="history-main">
									<div>
										<strong>{campaign.campaign_name}</strong>
										<p>{campaign.subject_template}</p>
									</div>
									<span
										class={`status-pill ${campaign.status === 'sent' ? 'success' : campaign.status === 'failed' ? 'error' : 'neutral'}`}
									>
										{campaign.status}
									</span>
								</div>
								<div class="history-meta">
									<span>Created {formatDate(campaign.created_at)}</span>
									<span>{campaign.sent_count || 0} sent</span>
									{#if campaign.scheduled_at}
										<span>Scheduled {formatDate(campaign.scheduled_at)}</span>
									{/if}
								</div>
								<div class="history-actions">
									<button
										class="chip-button"
										type="button"
										onclick={() => duplicateCampaign(campaign)}
									>
										<IconCopy class="h-4 w-4" />
										Duplicate
									</button>
									{#if campaign.status === 'draft' || campaign.status === 'failed' || campaign.status === 'scheduled'}
										<button
											class="chip-button"
											type="button"
											onclick={() => sendExistingCampaign(campaign.id)}
										>
											<IconSend class="h-4 w-4" />
											Send now
										</button>
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</section>
	</div>
</div>

<style>
	.email-hero {
		display: grid;
		gap: 1.5rem;
		padding: 1.75rem;
		border-radius: 32px;
		background:
			radial-gradient(circle at top left, rgba(255, 202, 133, 0.35), transparent 28%),
			radial-gradient(circle at bottom right, rgba(43, 109, 246, 0.2), transparent 26%),
			linear-gradient(135deg, rgba(10, 20, 37, 0.98), rgba(23, 41, 70, 0.94));
		color: white;
	}

	.email-hero-copy h1 {
		margin: 0.5rem 0 0.75rem;
		font-size: clamp(2rem, 3vw, 3rem);
		line-height: 1;
	}

	.email-hero-copy p {
		max-width: 52rem;
		margin: 0;
		font-size: 1rem;
		line-height: 1.7;
		color: rgba(255, 255, 255, 0.74);
	}

	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.8rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.hero-metrics {
		display: grid;
		gap: 0.9rem;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	}

	.hero-metric {
		padding: 1rem;
		border-radius: 22px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.hero-metric span,
	.hero-metric small {
		display: block;
		color: rgba(255, 255, 255, 0.66);
	}

	.hero-metric strong {
		display: block;
		margin: 0.25rem 0;
		font-size: 2rem;
		line-height: 1;
	}

	.studio-panel {
		padding: 1.35rem;
		border-radius: 28px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
		border: 1px solid rgba(148, 163, 184, 0.22);
		box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
	}

	.panel-header,
	.blocks-header,
	.sender-card-header,
	.history-main,
	.composer-actions {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
	}

	.panel-header h2,
	.blocks-header h3 {
		margin: 0;
		font-size: 1.1rem;
	}

	.panel-header p,
	.blocks-header p,
	.sender-card-header p,
	.history-main p {
		margin: 0.25rem 0 0;
		color: #64748b;
		font-size: 0.92rem;
	}

	.field {
		display: grid;
		gap: 0.45rem;
	}

	.field span {
		font-size: 0.83rem;
		font-weight: 700;
		color: #334155;
	}

	.field small {
		color: #64748b;
		font-size: 0.82rem;
	}

	.field input,
	.field select,
	.field textarea {
		width: 100%;
		padding: 0.8rem 0.9rem;
		border-radius: 16px;
		border: 1px solid #d8dee8;
		background: rgba(255, 255, 255, 0.94);
		color: #0f172a;
	}

	.field textarea {
		resize: vertical;
		min-height: 120px;
	}

	.registered-domain-picker {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.registered-domain-picker select {
		flex: 1 1 auto;
	}

	.banner {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.85rem 1rem;
		border-radius: 16px;
		font-size: 0.93rem;
		font-weight: 600;
	}

	.banner.success {
		background: #ecfdf3;
		color: #166534;
	}

	.banner.error {
		background: #fff1f2;
		color: #be123c;
	}

	.chip-button,
	.icon-button,
	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 999px;
		border: 1px solid transparent;
		font-weight: 700;
	}

	.chip-button,
	.icon-button,
	.btn-secondary {
		background: #eef2ff;
		color: #243b6b;
		border-color: rgba(99, 102, 241, 0.12);
	}

	.btn-primary {
		background: #0f172a;
		color: white;
	}

	.audience-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
	}

	.audience-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.8rem 1rem;
		border-radius: 999px;
		background: #f8fafc;
		border: 1px solid #d8dee8;
	}

	.audience-chip strong {
		font-size: 0.9rem;
	}

	.preset-callout {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.1rem;
		border-radius: 22px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	.preset-callout strong {
		display: block;
		margin-bottom: 0.2rem;
	}

	.preset-callout p {
		margin: 0;
		color: #64748b;
		font-size: 0.9rem;
	}

	.preset-swatches {
		display: flex;
		gap: 0.5rem;
	}

	.preset-swatches span {
		width: 1rem;
		height: 1rem;
		border-radius: 999px;
	}

	.block-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.block-card,
	.sender-card,
	.history-card,
	.empty-card {
		padding: 1rem;
		border-radius: 22px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	.block-card-header,
	.history-actions,
	.sender-title,
	.sender-meta,
	.history-meta,
	.preview-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}

	.block-card-header small,
	.sender-meta span,
	.history-meta,
	.preview-meta {
		color: #64748b;
		font-size: 0.82rem;
	}

	.metric-editor {
		padding: 0.8rem;
		border-radius: 18px;
		background: white;
		border: 1px solid #e2e8f0;
	}

	.schedule-bar {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.schedule-bar input {
		padding: 0.75rem 0.9rem;
		border-radius: 999px;
		border: 1px solid #d8dee8;
	}

	.preview-shell {
		min-height: 540px;
		margin-top: 1rem;
		border-radius: 24px;
		overflow: hidden;
		border: 1px solid #d8dee8;
		background: white;
	}

	.preview-shell iframe {
		width: 100%;
		min-height: 540px;
		border: 0;
		background: white;
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		padding: 0.34rem 0.7rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.status-pill.success {
		background: #dcfce7;
		color: #166534;
	}

	.status-pill.warning {
		background: #fff7ed;
		color: #b45309;
	}

	.status-pill.error {
		background: #ffe4e6;
		color: #be123c;
	}

	.status-pill.neutral {
		background: #e2e8f0;
		color: #334155;
	}

	.sender-meta {
		padding: 0.8rem 0 0.3rem;
	}

	.sender-meta div {
		min-width: 120px;
	}

	.sender-meta strong {
		display: block;
		font-size: 0.92rem;
		color: #0f172a;
	}

	.dns-table {
		margin-top: 1rem;
		display: grid;
		gap: 0.55rem;
	}

	.dns-header,
	.dns-row {
		display: grid;
		grid-template-columns: 80px minmax(0, 1.3fr) minmax(0, 1.3fr) auto;
		gap: 0.8rem;
		align-items: center;
	}

	.dns-header {
		font-size: 0.76rem;
		font-weight: 800;
		color: #475569;
		text-transform: uppercase;
	}

	.dns-row {
		padding: 0.75rem;
		border-radius: 16px;
		background: white;
		border: 1px solid #e2e8f0;
		font-size: 0.86rem;
	}

	.dns-value {
		overflow-wrap: anywhere;
		color: #334155;
	}

	.history-meta {
		margin-top: 0.6rem;
	}

	.history-actions {
		margin-top: 0.85rem;
	}

	.spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 900px) {
		.panel-header,
		.blocks-header,
		.composer-actions,
		.sender-card-header {
			flex-direction: column;
			align-items: stretch;
		}

		.registered-domain-picker,
		.schedule-bar {
			flex-direction: column;
			align-items: stretch;
		}

		.dns-header,
		.dns-row {
			grid-template-columns: 1fr;
		}
	}
</style>
