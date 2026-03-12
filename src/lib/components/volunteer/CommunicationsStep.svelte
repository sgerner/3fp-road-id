<script>
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconChevronUp from '@lucide/svelte/icons/chevron-up';
	import IconPlus from '@lucide/svelte/icons/plus';
	import IconTrash from '@lucide/svelte/icons/trash';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconLoader from '@lucide/svelte/icons/loader-2';
	import IconSend from '@lucide/svelte/icons/send';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { tick, onMount } from 'svelte';
	import HostNotificationSettings from './HostNotificationSettings.svelte';
	import {
		createPreviewContext,
		renderEmailBody,
		renderSubject,
		VOLUNTEER_MERGE_TAGS,
		getMergeTagExample
	} from '$lib/volunteer/merge-tags';
	import { slide } from 'svelte/transition';

	export let customQuestions = [];
	export let showCustomQuestionsSection = true;
	export let eventEmails = [];
	export let eventDetails = {};
	export let opportunities = [];
	export let fieldTypeOptions = [];
	export let emailTypeOptions = [];
	export let onAddQuestion = () => {};
	export let onRemoveQuestion = () => {};
	export let onUpdateQuestion = () => {};
	export let onAddEmail = () => {};
	export let onRemoveEmail = () => {};
	export let onUpdateEmail = () => {};
	export let onComposeEmail = () => {};
	export let showImmediateEmailOption = false;
	export let volunteerCounts = {
		total: 0,
		approved: 0,
		pending: 0,
		waitlisted: 0,
		checkedIn: 0,
		declined: 0
	};
	export let onSendImmediateEmail = async () => {};
	export let hostNotificationSettings = { register: true, cancel: true };
	export let onHostNotificationChange = () => {};
	export let hostNotificationSaving = false;
	export let hostNotificationDisabled = false;

	let targetStatuses = ['approved'];
	$: targetVolunteerCount = targetStatuses.reduce((total, status) => {
		if (status === 'approved') return total + (volunteerCounts.approved || 0);
		if (status === 'pending') return total + (volunteerCounts.pending || 0);
		if (status === 'waitlisted') return total + (volunteerCounts.waitlisted || 0);
		if (status === 'declined') return total + (volunteerCounts.declined || 0);
		if (status === 'checked_in') return total + (volunteerCounts.checkedIn || 0);
		return total;
	}, 0);

	const OPTION_FIELD_TYPES = new Set(['select', 'multiselect', 'checkbox']);

	const supportsOptionField = (type) => OPTION_FIELD_TYPES.has(type);

	function formatEmailType(type) {
		if (type === 'thankyou') {
			return 'Thank You';
		}
		if (type) {
			return type.charAt(0).toUpperCase() + type.slice(1);
		}
		return '';
	}

	function formatSentTimestamp(timestamp) {
		if (!timestamp) return '';
		try {
			const date = new Date(timestamp);
			if (Number.isNaN(date.getTime())) return String(timestamp);
			return new Intl.DateTimeFormat(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short'
			}).format(date);
		} catch (error) {
			console.warn('Unable to format sent timestamp', error);
			return String(timestamp);
		}
	}

	function parseOptions(raw) {
		return (raw || '')
			.split(/\r?\n/)
			.map((value) => value.trim())
			.filter(Boolean);
	}

	function getEmailTiming(minutes) {
		const value = Number(minutes);
		if (!Number.isFinite(value) || value === 0) {
			return { hours: 0, direction: 'before' };
		}
		return {
			hours: Math.abs(value) / 60,
			direction: value >= 0 ? 'before' : 'after'
		};
	}

	function handleTimingChange(id, { hours, direction }) {
		const parsedHours = Number(hours);
		const numericHours = Number.isFinite(parsedHours) && parsedHours >= 0 ? parsedHours : 0;
		const safeDirection = direction === 'after' ? 'after' : 'before';
		const minutes = numericHours * 60 * (safeDirection === 'before' ? 1 : -1);
		onUpdateEmail(id, { sendOffsetMinutes: minutes });
	}

	function handleConfirmationChange(event, email) {
		const { checked } = event.currentTarget;
		let body = email.body || '';
		if (checked) {
			body = ensureConfirmationBlock(body);
		} else {
			body = removeConfirmationBlock(body);
		}

		onUpdateEmail(email.id, { requireConfirmation: checked, body });
		resetSendNowFeedback(email.id);
	}

	function addOption(question) {
		const draft = question?.optionDraft?.trim();
		if (!draft) return;
		const existing = parseOptions(question.optionsRaw);
		if (existing.includes(draft)) {
			onUpdateQuestion(question.id, { optionDraft: '' });
			return;
		}
		const next = [...existing, draft];
		onUpdateQuestion(question.id, {
			optionsRaw: next.join('\n'),
			optionDraft: ''
		});
	}

	function removeOption(question, value) {
		const next = parseOptions(question.optionsRaw).filter((option) => option !== value);
		onUpdateQuestion(question.id, { optionsRaw: next.join('\n') });
	}

	const previewOrigin =
		typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';

	async function handleAddEmail() {
		const previousIds = new Set(scheduledEmails?.map((e) => e.id) || []);
		onAddEmail();
		// Allow time for parent state to update, prop to re-cascade, and DOM to render
		setTimeout(() => {
			const newEmail = scheduledEmails?.find((e) => !previousIds.has(e.id));
			if (newEmail) {
				const el = document.getElementById(`email-card-${newEmail.id}`);
				if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}, 50);
	}

	let activeInput = null;
	let activeEmailId = null;
	let activeFieldType = null;
	let immediateEmail = { subject: '', body: '', requireConfirmation: false };
	let immediateEmailSending = false;
	let immediateEmailError = '';
	let immediateEmailSuccess = '';
	let sendNowFeedback = {};
	let warnBeforeUnload = false;
	let openMergePreviews = {};
	let openSentEmails = {};
	let immediateValuesInitialised = false;
	let lastImmediateSubject = immediateEmail.subject ?? '';
	let lastImmediateBody = immediateEmail.body ?? '';
	const markdownHints = ['**bold**', '_italic_', '`inline code`', '[links](https://example.org)'];
	const BEFORE_UNLOAD_MESSAGE =
		'You drafted an immediate email that has not been sent. Are you sure you want to leave?';
	const CONFIRMATION_TOKEN = '{{shift_confirmation_block}}';
	const CONFIRMATION_PATTERN = /\s*\{\{shift_confirmation_block\}\}\s*/gi;

	function removeConfirmationBlock(content = '') {
		return content
			.replace(CONFIRMATION_PATTERN, '\n\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
	}

	function ensureConfirmationBlock(content = '') {
		const base = removeConfirmationBlock(content);
		if (!base) return CONFIRMATION_TOKEN;
		return `${base}\n\n${CONFIRMATION_TOKEN}`;
	}

	$: previewContext = createPreviewContext({ eventDetails, opportunities, origin: previewOrigin });
	$: mergeTagPreviews = VOLUNTEER_MERGE_TAGS.map((tag) => ({
		...tag,
		exampleHtml: getMergeTagExample(tag.token, previewContext, 'html'),
		exampleText: getMergeTagExample(tag.token, previewContext, 'text')
	}));
	$: immediateBodyPreview = renderEmailBody(immediateEmail.body ?? '', previewContext);
	$: immediateSubjectPreview = renderSubject(immediateEmail.subject ?? '', previewContext);

	$: {
		const nextSubject = immediateEmail.subject ?? '';
		const nextBody = immediateEmail.body ?? '';
		if (immediateValuesInitialised) {
			if (nextSubject !== lastImmediateSubject || nextBody !== lastImmediateBody) {
				resetImmediateFeedback();
			}
		} else {
			immediateValuesInitialised = true;
		}
		lastImmediateSubject = nextSubject;
		lastImmediateBody = nextBody;
	}

	function buildBodyPreview(email) {
		return renderEmailBody(email.body ?? '', previewContext);
	}

	function buildSubjectPreview(email) {
		return renderSubject(email.subject ?? '', previewContext);
	}

	function truncateSubject(value, maxLength = 80) {
		const text = (value ?? '').trim();
		if (!text) return 'No subject';
		if (text.length <= maxLength) return text;
		return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
	}

	function compareSentEmail(a, b) {
		const aTime = new Date(a?.lastSentAt ?? a?.last_sent_at ?? 0).getTime();
		const bTime = new Date(b?.lastSentAt ?? b?.last_sent_at ?? 0).getTime();
		return bTime - aTime;
	}

	function getSentEmailKey(email) {
		if (!email) return '';
		if (email.id) return String(email.id);
		if (email.lastSentAt) return `sent:${email.lastSentAt}`;
		return `sent:${email.subject ?? Math.random()}`;
	}

	function isScheduledEmail(email) {
		if (!email) return false;
		if (email.emailType === 'immediate') return false;
		return !email.lastSentAt;
	}

	function toggleSentEmail(key) {
		if (!key) return;
		openSentEmails[key] = !openSentEmails[key];
		openSentEmails = openSentEmails;
	}

	function isSentEmailOpen(key) {
		if (!key) return false;
		return !!openSentEmails[key];
	}

	function setActiveEditor(emailId, field, element) {
		activeEmailId = emailId;
		activeFieldType = field;
		activeInput = element;
	}

	function clearActiveEditor(element) {
		if (activeInput === element) {
			activeInput = null;
			activeEmailId = null;
			activeFieldType = null;
		}
	}

	function getTimingModeFromMinutes(minutes) {
		if (!Number.isFinite(minutes)) return 'now';
		if (minutes === 0) return 'now';
		return minutes > 0 ? 'before' : 'after';
	}

	function setSendNowFeedback(id, patch) {
		const current = sendNowFeedback[id] ?? {};
		sendNowFeedback = {
			...sendNowFeedback,
			[id]: { ...current, ...patch }
		};
	}

	function resetSendNowFeedback(id) {
		if (!id || !sendNowFeedback[id]) return;
		sendNowFeedback = {
			...sendNowFeedback,
			[id]: { sending: false, error: '', success: '' }
		};
	}

	async function handleSendScheduledNow(email) {
		const key = email?.id ?? '';
		if (!key) return;
		setSendNowFeedback(key, { sending: true, error: '', success: '' });

		try {
			if (!volunteerCounts.approved && !volunteerCounts.checkedIn) {
				throw new Error('No approved volunteers are ready to email yet.');
			}
			if (!email.subject?.trim()) {
				throw new Error('Subject is required before sending.');
			}
			let bodyToSend = email.body ?? '';
			if (email.requireConfirmation) {
				bodyToSend = ensureConfirmationBlock(bodyToSend);
				if (bodyToSend !== (email.body ?? '')) {
					onUpdateEmail(email.id, { body: bodyToSend });
				}
			}
			if (!bodyToSend.trim()) {
				throw new Error('Body is required before sending.');
			}

			const result = await onSendImmediateEmail({
				subject: email.subject,
				body: bodyToSend,
				requireConfirmation: email.requireConfirmation,
				emailId: email.id
			});
			const sentCount = result?.sentCount ?? volunteerCounts.approved + volunteerCounts.checkedIn;
			if (result?.lastSentAt) {
				onUpdateEmail(email.id, { lastSentAt: result.lastSentAt });
			}
			setSendNowFeedback(key, {
				success: `Email sent to ${sentCount} approved volunteer${sentCount === 1 ? '' : 's'}.`
			});
		} catch (error) {
			setSendNowFeedback(key, {
				error: error?.message || 'Unable to send the volunteer email right now.'
			});
		} finally {
			setSendNowFeedback(key, { sending: false });
		}
	}

	async function handleEmailInput(event, email, field) {
		const target = event.currentTarget;
		if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
		let { selectionStart, selectionEnd, value } = target;
		if (field === 'subject') {
			onUpdateEmail(email.id, { subject: value });
			resetSendNowFeedback(email.id);
		}
		await tick();
		if (document.activeElement === target && selectionStart !== null && selectionEnd !== null) {
			try {
				target.setSelectionRange(selectionStart, selectionEnd);
			} catch (error) {
				console.warn('Unable to restore cursor', error);
			}
		}
	}

	async function insertMergeTag(token) {
		if (!token || !activeInput) return;
		const target = activeInput;
		const start = target.selectionStart ?? target.value.length;
		const end = target.selectionEnd ?? start;
		const nextValue = `${target.value.slice(0, start)}${token}${target.value.slice(end)}`;
		target.value = nextValue;

		if (activeFieldType === 'subject') {
			onUpdateEmail(activeEmailId, { subject: nextValue });
		} else if (activeFieldType === 'body') {
			onUpdateEmail(activeEmailId, { body: nextValue });
		} else if (activeFieldType === 'immediate-subject') {
			resetImmediateFeedback();
			immediateEmail = { ...immediateEmail, subject: nextValue };
		} else if (activeFieldType === 'immediate-body') {
			resetImmediateFeedback();
			immediateEmail = { ...immediateEmail, body: nextValue };
		}

		const cursor = start + token.length;
		await tick();
		try {
			target.setSelectionRange(cursor, cursor);
			target.focus();
		} catch (error) {
			console.warn('Unable to set cursor after merge tag insert', error);
		}
	}

	async function handleSendImmediateEmail() {
		immediateEmailError = '';
		immediateEmailSuccess = '';
		if (!immediateEmail.subject?.trim()) {
			immediateEmailError = 'Subject is required before sending.';
			return;
		}
		if (!immediateEmail.body?.trim()) {
			immediateEmailError = 'Body is required before sending.';
			return;
		}
		if (!targetVolunteerCount) {
			immediateEmailError = 'No volunteers match your selected statuses.';
			return;
		}
		immediateEmailSending = true;
		try {
			const result = await onSendImmediateEmail({ ...immediateEmail, targetStatuses });
			const sentCount = result?.sentCount ?? targetVolunteerCount;
			immediateEmailSuccess = `Email sent to ${sentCount} volunteer${sentCount === 1 ? '' : 's'}.`;
			const clearedEmail = { subject: '', body: '', requireConfirmation: false };
			immediateValuesInitialised = false;
			lastImmediateSubject = clearedEmail.subject;
			lastImmediateBody = clearedEmail.body;
			immediateEmail = clearedEmail;
		} catch (error) {
			immediateEmailError = error?.message || 'Unable to send the volunteer email right now.';
		} finally {
			immediateEmailSending = false;
		}
	}

	function resetImmediateFeedback() {
		immediateEmailError = '';
		immediateEmailSuccess = '';
	}

	function insertBodyTag(emailId, token, immediate = false) {
		if (typeof document === 'undefined') return;
		const elementId = immediate ? 'immediate-email-body' : `email-body-${emailId}`;
		const element = document.getElementById(elementId);
		if (!(element instanceof HTMLTextAreaElement)) return;
		const hadFocus = document.activeElement === element;
		setActiveEditor(
			immediate ? 'immediate' : emailId,
			immediate ? 'immediate-body' : 'body',
			element
		);
		element.focus();
		if (!hadFocus) {
			const cursor = element.value.length;
			try {
				element.setSelectionRange(cursor, cursor);
			} catch (error) {
				console.warn('Unable to set cursor for merge tag insert', error);
			}
		}
		insertMergeTag(token);
	}

	function getMergePreviewKey(scope, token) {
		return `${scope ?? 'global'}:${token}`;
	}
	function toggleMergePreview(scope, token) {
		if (!token) return;
		const key = getMergePreviewKey(scope, token);
		openMergePreviews[key] = !openMergePreviews[key];
		openMergePreviews = openMergePreviews;
	}
	function isMergePreviewOpen(scope, token) {
		return !!openMergePreviews[getMergePreviewKey(scope, token)];
	}

	$: scheduledEmails = Array.isArray(eventEmails)
		? eventEmails.filter((email) => isScheduledEmail(email))
		: [];

	$: sentEmailHistory = Array.isArray(eventEmails)
		? [...eventEmails].filter((email) => email?.lastSentAt).sort(compareSentEmail)
		: [];

	$: {
		if (Array.isArray(eventEmails)) {
			for (const email of eventEmails) {
				if (!email?.id) continue;
				if (email.emailType !== 'reminder') continue;
				if (!email.requireConfirmation) continue;
				if (email.body?.includes(CONFIRMATION_TOKEN)) continue;
				onUpdateEmail(email.id, { body: ensureConfirmationBlock(email.body ?? '') });
			}
		}
	}

	$: immediateDraftDirty =
		showImmediateEmailOption &&
		!immediateEmailSending &&
		!immediateEmailSuccess &&
		((immediateEmail.subject ?? '').trim() || (immediateEmail.body ?? '').trim());
	$: warnBeforeUnload = immediateDraftDirty;

	onMount(() => {
		const handleBeforeUnload = (event) => {
			if (!warnBeforeUnload) return;
			event.preventDefault();
			event.returnValue = BEFORE_UNLOAD_MESSAGE;
			return BEFORE_UNLOAD_MESSAGE;
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('beforeunload', handleBeforeUnload);
		}
		return () => {
			if (typeof window !== 'undefined') {
				window.removeEventListener('beforeunload', handleBeforeUnload);
			}
		};
	});
</script>

<div class="space-y-10">
	<!-- ── Host Notifications ── -->
	<section class="space-y-3">
		<h2 class="card preset-tonal-tertiary px-4 py-2 !text-left text-lg font-bold">
			Host Notifications
		</h2>
		<div class="overflow-hidden">
			<HostNotificationSettings
				value={hostNotificationSettings}
				onChange={onHostNotificationChange}
				disabled={hostNotificationDisabled}
				saving={hostNotificationSaving}
			/>
		</div>
	</section>

	<!-- ── Custom Intake Questions ── -->
	{#if showCustomQuestionsSection}
		<section class="space-y-4">
			<div class="card preset-tonal-tertiary flex items-center justify-between px-4 py-2">
				<div>
					<h2 class="!text-left text-lg font-bold">Intake Questions</h2>
				</div>
				<button
					type="button"
					on:click={onAddQuestion}
					class="btn btn-sm preset-tonal-primary flex items-center gap-2"
				>
					<IconPlus class="h-3.5 w-3.5" />
					<span>Add question</span>
				</button>
			</div>

			{#if customQuestions.length === 0}
				<p class="opacity-70" transition:slide>Collect info from volunteers when they sign up</p>
			{:else}
				{#each customQuestions as question, idx (question.id)}
					<div class="card border-surface-500/15 bg-surface-800/20 border p-5">
						<div class="mb-4 flex items-center justify-between">
							<h3 class="text-base font-bold">Question {idx + 1}</h3>
							<button
								type="button"
								class="btn btn-sm preset-tonal-error flex items-center gap-2"
								on:click={() => onRemoveQuestion(question.id)}
							>
								<IconTrash class="h-4 w-4" />
								<span class="hidden sm:inline">Remove</span>
							</button>
						</div>
						<div class="grid gap-4 md:grid-cols-2">
							<label class="flex flex-col gap-1.5 md:col-span-2">
								<span class="text-surface-200 text-sm font-medium">Label *</span>
								<input
									class="input preset-tonal-surface rounded-lg px-4 py-2"
									value={question.label}
									on:input={(e) => onUpdateQuestion(question.id, { label: e.currentTarget.value })}
								/>
							</label>
							<label class="flex flex-col gap-1.5">
								<span class="text-surface-200 text-sm font-medium">Field type</span>
								<select
									class="select preset-tonal-surface rounded-lg px-4 py-2"
									value={question.fieldType}
									on:change={(e) =>
										onUpdateQuestion(question.id, { fieldType: e.currentTarget.value })}
								>
									{#each fieldTypeOptions as option (option)}
										<option value={option}>{option}</option>
									{/each}
								</select>
							</label>
							<div class="flex flex-col gap-1.5">
								<span class="text-surface-200 text-sm font-medium">Required?</span>
								<label class="flex items-center gap-3">
									<Toggle
										name={`question-required-${question.id}`}
										checked={question.isRequired}
										onChange={(v) => onUpdateQuestion(question.id, { isRequired: v })}
									/>
									<span class="text-surface-200 text-sm">Required</span>
								</label>
							</div>
							<label class="flex flex-col gap-1.5 md:col-span-2">
								<span class="text-surface-200 text-sm font-medium">Help text</span>
								<textarea
									class="textarea preset-tonal-surface min-h-20 w-full rounded-lg px-4 py-2"
									value={question.helpText}
									on:input={(e) =>
										onUpdateQuestion(question.id, { helpText: e.currentTarget.value })}
									placeholder="Give volunteers context, links, or clarifications."
								></textarea>
							</label>
							{#if supportsOptionField(question.fieldType)}
								<div class="space-y-2 md:col-span-2">
									<div class="flex flex-col gap-1.5">
										<span class="text-surface-200 text-sm font-medium">Options</span>
										<div class="flex flex-col gap-2 py-1 md:flex-row md:items-center">
											<input
												class="input preset-tonal-surface rounded-lg px-4 py-2 md:w-64"
												value={question.optionDraft}
												on:input={(e) =>
													onUpdateQuestion(question.id, { optionDraft: e.currentTarget.value })}
												placeholder="Add a choice"
												on:keydown={(event) => {
													if (event.key === 'Enter') {
														event.preventDefault();
														addOption(question);
													}
												}}
											/>
											<button
												type="button"
												class="btn preset-tonal-surface flex items-center gap-2 md:w-auto"
												on:click={() => addOption(question)}
												disabled={!question.optionDraft?.trim()}
											>
												<IconPlus class="h-4 w-4" />
												<span>Add option</span>
											</button>
										</div>
									</div>
									{#if parseOptions(question.optionsRaw).length}
										<div class="flex flex-wrap gap-2 pt-2">
											{#each parseOptions(question.optionsRaw) as option (option)}
												<span
													class="bg-surface-800/40 text-surface-200 border-surface-500/15 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
												>
													{option}
													<button
														type="button"
														class="text-error-400 hover:text-error-300 text-xs transition-colors"
														on:click={() => removeOption(question, option)}
													>
														<IconTrash class="h-3.5 w-3.5" />
													</button>
												</span>
											{/each}
										</div>
									{:else}
										<p class="text-surface-500 text-sm">Add at least one option for this field.</p>
									{/if}
								</div>
							{/if}
							<label class="flex flex-col gap-1.5 md:col-span-2">
								<span class="text-surface-200 text-sm font-medium">Limit to activity</span>
								<select
									class="select preset-tonal-surface rounded-lg px-4 py-2"
									value={question.opportunityId}
									on:change={(e) =>
										onUpdateQuestion(question.id, { opportunityId: e.currentTarget.value })}
								>
									<option value="">Applies to all signups</option>
									{#each opportunities as opp (opp.id)}
										<option value={opp.id}>{opp.title || 'Unnamed activity'}</option>
									{/each}
								</select>
							</label>
						</div>
					</div>
				{/each}
			{/if}
		</section>
	{/if}

	<!-- ── Sent Email History ── -->
	{#if sentEmailHistory.length > 0}
		<section class="space-y-3">
			<h2 class="text-surface-950-50 text-base font-bold">Sent History</h2>

			<ul class="space-y-3">
				{#each sentEmailHistory as historyEmail (getSentEmailKey(historyEmail))}
					{@const historyKey = getSentEmailKey(historyEmail)}
					{@const historySubject = buildSubjectPreview(historyEmail)}
					{@const historyBody = buildBodyPreview(historyEmail)}
					<li
						class="even:bg-secondary-500/10 border-primary-500/30 odd:bg-surface-50-950/70 rounded-lg border"
					>
						<button
							type="button"
							class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
							on:click={() => {
								toggleSentEmail(historyKey);
							}}
						>
							<div class="min-w-0 space-y-1">
								<p class="text-surface-900-100 truncate text-sm font-semibold">
									{truncateSubject(historySubject || historyEmail.subject || 'No subject')}
								</p>
								<p class="text-surface-500 text-xs">
									{formatSentTimestamp(historyEmail.lastSentAt)}
								</p>
							</div>
							{#if openSentEmails[historyKey]}
								<IconChevronUp class="text-surface-600-400 h-4 w-4 flex-shrink-0" />
							{:else}
								<IconChevronDown class="text-surface-600-400 h-4 w-4 flex-shrink-0" />
							{/if}
						</button>
						{#if openSentEmails[historyKey]}
							<div
								class="border-surface-200-800/60 space-y-3 border-t px-4 py-3 text-sm"
								transition:slide
							>
								<div class="space-y-1">
									<span class="text-surface-600-400 text-[11px] tracking-wide uppercase"
										>Subject</span
									>
									<p class="text-surface-900-100 font-semibold">
										{historySubject || historyEmail.subject || 'No subject'}
									</p>
								</div>
								<div class="space-y-1">
									<span class="text-surface-600-400 text-[11px] tracking-wide uppercase">Body</span>
									<div class="text-surface-900-100 space-y-3 text-sm leading-relaxed !normal-case">
										{#if historyBody?.html}
											<div aria-live="polite">{@html historyBody.html}</div>
										{:else if historyBody?.text}
											<p class="whitespace-pre-wrap">{historyBody.text}</p>
										{:else}
											<p class="text-surface-500 italic">No body content provided.</p>
										{/if}
									</div>
								</div>
								<p class="text-surface-500 text-xs">
									Sent {formatSentTimestamp(historyEmail.lastSentAt)}
								</p>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- ── Immediate Emails ── -->
	<section class="space-y-4">
		{#if showImmediateEmailOption}
			<div class="card preset-tonal-surface space-y-4 rounded-xl p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="space-y-1">
						<div class="flex items-center gap-2">
							<IconSend class="text-primary-700-300 h-4 w-4" />
							<h3 class="text-surface-900-100 text-base font-semibold">Send immediate update</h3>
						</div>
						<p class="text-surface-600-400 text-sm">
							This message sends immediately to volunteers matching your selected statuses.
						</p>
					</div>
					<div class="flex flex-col items-end gap-2 text-xs md:items-start md:text-left">
						<span
							class="bg-surface-50-950/60 text-surface-700-300 border-surface-300-700 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold tracking-wide uppercase"
						>
							Target: {targetVolunteerCount} recipient{targetVolunteerCount === 1 ? '' : 's'}
						</span>
						<span class="text-surface-600-400 flex items-center gap-2">
							<span
								class="border-primary-500/30 bg-primary-500/10 text-primary-800-200 rounded-full border px-2 py-0.5 font-semibold tracking-wide uppercase"
							>
								Send timing: Now
							</span>
						</span>
					</div>
				</div>

				<div class="space-y-2">
					<span
						class="text-surface-600-400 block text-[11px] font-semibold tracking-wide uppercase"
					>
						Target Statuses
					</span>
					<div class="flex flex-wrap gap-2">
						{#each [{ value: 'approved', label: 'Approved', count: volunteerCounts.approved || 0, activeColor: 'bg-success-500/15 text-success-600 border-success-500/30' }, { value: 'checked_in', label: 'Checked In', count: volunteerCounts.checkedIn || 0, activeColor: 'bg-success-500/15 text-success-600 border-success-500/30' }, { value: 'pending', label: 'Pending', count: volunteerCounts.pending || 0, activeColor: 'bg-warning-500/15 text-warning-600 border-warning-500/30' }, { value: 'waitlisted', label: 'Waitlisted', count: volunteerCounts.waitlisted || 0, activeColor: 'bg-surface-500/15 text-surface-600 border-surface-500/30' }, { value: 'declined', label: 'Declined', count: volunteerCounts.declined || 0, activeColor: 'bg-error-500/15 text-error-600 border-error-500/30' }] as status (status.value)}
							<label
								class="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors select-none
								{targetStatuses.includes(status.value)
									? status.activeColor
									: 'border-surface-300-700 bg-surface-50-950/60 text-surface-400 hover:text-surface-200 hover:border-surface-500'}"
							>
								<input
									type="checkbox"
									value={status.value}
									class="hidden"
									checked={targetStatuses.includes(status.value)}
									on:change={(e) => {
										if (e.currentTarget.checked) {
											targetStatuses = [...targetStatuses, status.value];
										} else {
											targetStatuses = targetStatuses.filter((s) => s !== status.value);
										}
									}}
								/>
								{status.label} ({status.count})
							</label>
						{/each}
					</div>
				</div>

				{#if !targetVolunteerCount}
					<div
						class="border-warning-500/40 bg-warning-500/10 text-warning-800-200 flex items-start gap-3 rounded-md border p-3 text-xs"
					>
						<IconAlertCircle class="mt-0.5 h-4 w-4 flex-shrink-0" />
						<p>No volunteers match the selected statuses. Adjust filters to enable sending.</p>
					</div>
				{/if}

				<div class="grid gap-4 md:grid-cols-2">
					<label class="label flex flex-col gap-2">
						<span>Subject *</span>
						<input
							id="immediate-email-subject"
							class="input bg-surface-50-950/60"
							bind:value={immediateEmail.subject}
							on:focus={(event) =>
								setActiveEditor('immediate', 'immediate-subject', event.currentTarget)}
							on:blur={(event) => clearActiveEditor(event.currentTarget)}
							on:keydown={resetImmediateFeedback}
							placeholder="Urgent update for {eventDetails.title}"
							disabled={immediateEmailSending}
						/>
						<div
							class="border-surface-300-700/60 bg-surface-50-950/50 text-surface-700-300 rounded-md border p-2 text-xs"
						>
							<strong class="text-surface-600-400 block text-[11px] tracking-wide uppercase">
								Subject preview
							</strong>
							<p class="text-surface-800-200 mt-1 break-words whitespace-pre-wrap !normal-case">
								{immediateSubjectPreview ||
									'Merge tags render here so you can double-check personalisation.'}
							</p>
						</div>
					</label>
					<div
						class="border-surface-300-700/60 bg-surface-50-950/50 text-surface-700-300 rounded-md border p-2 text-xs"
					>
						<strong class="text-surface-600-400 block text-[11px] tracking-wide uppercase">
							Markdown & merge tips
						</strong>
						<p class="text-surface-600-400 mt-1">
							Markdown supported: {#each markdownHints as hint, idx}
								<code>{hint}</code>{idx < markdownHints.length - 1 ? ', ' : ''}
							{/each}
							. Use the merge tag chips below the body field to personalise content.
						</p>
					</div>
				</div>

				<label class="label flex flex-col gap-2">
					<span>Body *</span>
					<textarea
						id="immediate-email-body"
						class="textarea bg-surface-50-950/60 min-h-32"
						bind:value={immediateEmail.body}
						on:focus={(event) =>
							setActiveEditor('immediate', 'immediate-body', event.currentTarget)}
						on:blur={(event) => clearActiveEditor(event.currentTarget)}
						on:keydown={resetImmediateFeedback}
						placeholder="Share meetup adjustments, last-minute needs, or celebration notes."
						disabled={immediateEmailSending}
					></textarea>
					<div
						class="border-surface-300-700/60 bg-surface-50-950/50 text-surface-700-300 space-y-2 rounded-md border p-3 text-xs"
					>
						<strong class="text-surface-600-400 block text-[11px] tracking-wide uppercase">
							Body preview
						</strong>
						{#if immediateBodyPreview?.brandedHtml}
							<div
								class="text-surface-900-100 space-y-3 text-sm leading-relaxed !normal-case"
								id="immediate-email-preview"
							>
								{@html immediateBodyPreview.brandedHtml}
							</div>
						{:else}
							<p class="text-surface-600-400 !normal-case">
								Use merge tags like &#123;&#123;event_details_block&#125;&#125; or
								&#123;&#123;volunteer_portal_block&#125;&#125; to add formatted context.
							</p>
						{/if}
					</div>
					{#if mergeTagPreviews.length}
						<div class="space-y-2">
							<strong class="text-surface-600-400 block text-[11px] tracking-wide uppercase">
								Merge tags
							</strong>
							<div class="flex flex-wrap gap-2">
								{#each mergeTagPreviews as tag (tag.token)}
									<div class="space-y-1">
										<div class="flex items-center gap-1">
											<button
												type="button"
												class="bg-surface-50-950/70 text-surface-800-200 hover:border-primary-600-400/60 border-surface-300-700/70 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
												on:click={() => insertBodyTag('immediate', tag.token, true)}
											>
												{tag.label}
											</button>
											<button
												type="button"
												class="text-surface-600-400 hover:text-surface-800-200 rounded-full p-1"
												aria-label={`Toggle preview for ${tag.label}`}
												aria-expanded={!!openMergePreviews[
													getMergePreviewKey('immediate', tag.token)
												]}
												on:click={() => toggleMergePreview('immediate', tag.token)}
											>
												{#if !!openMergePreviews[getMergePreviewKey('immediate', tag.token)]}
													<IconChevronUp class="h-4 w-4" />
												{:else}
													<IconChevronDown class="h-4 w-4" />
												{/if}
											</button>
										</div>
										{#if !!openMergePreviews[getMergePreviewKey('immediate', tag.token)]}
											<div
												class="border-surface-300-700/60 bg-surface-50-950/70 text-surface-800-200 space-y-2 rounded-md border p-3 text-xs"
											>
												<div class="flex items-center justify-between gap-2">
													<code class="text-primary-800-200 text-xs">{tag.token}</code>
												</div>

												{#if tag.block && tag.exampleHtml}
													<div
														class="pointer-events-none space-y-2 !normal-case"
														aria-hidden="true"
													>
														{@html tag.exampleHtml}
													</div>
													{#if tag.exampleText}
														<p class="text-surface-900-100 text-[11px] !normal-case">
															Plain text preview: {tag.exampleText}
														</p>
													{/if}
												{:else if tag.exampleHtml}
													<div class="pointer-events-none" aria-hidden="true">
														{@html tag.exampleHtml}
													</div>
												{:else if tag.exampleText}
													<p class="text-surface-800-200">{tag.exampleText}</p>
												{:else}
													<p class="text-surface-500">Preview coming soon.</p>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</label>

				{#if immediateEmailError}
					<p class="text-error-700-300 text-xs">{immediateEmailError}</p>
				{/if}
				{#if immediateEmailSuccess}
					<p class="text-success-700-300 text-xs">{immediateEmailSuccess}</p>
				{/if}

				<div class="flex flex-wrap items-center justify-between gap-3">
					<button
						type="button"
						class="btn preset-filled-primary-500 flex items-center gap-2"
						on:click={handleSendImmediateEmail}
						disabled={immediateEmailSending || !targetVolunteerCount}
					>
						{#if immediateEmailSending}
							<IconLoader class="h-4 w-4 animate-spin" />
							<span>Sending…</span>
						{:else}
							<IconSend class="h-4 w-4" />
							<span>Send email now</span>
						{/if}
					</button>
					<button
						type="button"
						class="btn preset-tonal-surface text-xs"
						on:click={() => {
							immediateEmail = { subject: '', body: '', requireConfirmation: false };
							resetImmediateFeedback();
						}}
						disabled={immediateEmailSending}
					>
						Clear draft
					</button>
				</div>
			</div>
		{/if}
	</section>

	<!-- ── Scheduled Emails ── -->
	<section class="space-y-4">
		<div class="card preset-tonal-tertiary flex items-center justify-between px-4 py-2">
			<h2 class="text-lg font-bold">Scheduled Emails</h2>

			<button
				type="button"
				on:click={handleAddEmail}
				class="btn btn-sm preset-tonal-primary flex items-center gap-2"
			>
				<IconPlus class="h-3.5 w-3.5" />
				<span>Add email</span>
			</button>
		</div>
		<p class="opacity-70">Auto-send reminders and updates before or after the event</p>

		{#each scheduledEmails as email, idx (email.id)}
			{@const subjectPreview = buildSubjectPreview(email)}
			{@const bodyPreview = buildBodyPreview(email)}
			{@const timingMode = getTimingModeFromMinutes(email.sendOffsetMinutes)}
			{@const feedback = sendNowFeedback[email.id] ?? {
				sending: false,
				error: '',
				success: ''
			}}
			{@const emailSent = !!email.lastSentAt}
			<div id={`email-card-${email.id}`} class="card preset-tonal-surface space-y-4 rounded-xl p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="space-y-1">
						<h3 class="text-lg font-bold">
							{formatEmailType(email.emailType)}
							<span class="text-tertiary-500 ml-4 text-sm italic">
								Scheduled {getEmailTiming(email.sendOffsetMinutes).hours} hrs {getEmailTiming(
									email.sendOffsetMinutes
								).direction}
							</span>
						</h3>
					</div>
					{#if !emailSent}
						<button
							type="button"
							class="btn preset-tonal-error flex items-center gap-2"
							on:click={() => onRemoveEmail(email.id)}
						>
							<IconTrash class="h-4 w-4" />
							<span>Remove</span>
						</button>
					{/if}
				</div>

				<div class="mt-4 flex flex-wrap items-end justify-between gap-2">
					<div class="flex grow flex-col gap-2">
						<span class="label">Email type</span>
						<select
							name={`email-type-${email.id}`}
							class="select preset-tonal-surface w-full rounded-lg px-4 py-2"
							value={email.emailType}
							on:change={(e) => {
								const val = e.currentTarget.value;
								if (val) {
									const patch = { emailType: val };
									if (val !== 'reminder' && email.requireConfirmation) {
										patch.requireConfirmation = false;
										patch.body = removeConfirmationBlock(email.body ?? '');
									}
									onUpdateEmail(email.id, patch);
									resetSendNowFeedback(email.id);
								}
							}}
						>
							{#each emailTypeOptions as option (option)}
								<option value={option}>{formatEmailType(option)}</option>
							{/each}
						</select>
					</div>
					<button
						type="button"
						class={`btn flex items-center gap-2 ${email.aiComposerOpen ? 'preset-outlined-error-500' : 'preset-tonal-primary'}`}
						on:click={() =>
							onUpdateEmail(email.id, { aiComposerOpen: !email.aiComposerOpen, aiError: '' })}
						disabled={email.aiLoading}
					>
						<IconSparkles class="h-4 w-4" />
						<span>{email.aiComposerOpen ? 'Close composer' : 'Compose with AI'}</span>
					</button>
				</div>

				{#if email.aiComposerOpen}
					<div
						class="border-primary-600-400/30 bg-primary-600-400/10 mt-4 space-y-3 rounded border p-4"
						transition:slide
					>
						<label class="text-surface-200 text-sm font-medium" for={`email-ai-prompt-${email.id}`}>
							Describe the message
						</label>
						<textarea
							id={`email-ai-prompt-${email.id}`}
							class="textarea preset-tonal-surface min-h-20 w-full rounded-lg px-4 py-2"
							value={email.aiPrompt}
							on:input={(e) => onUpdateEmail(email.id, { aiPrompt: e.currentTarget.value })}
							placeholder="Share the tone, reminders, or updates you'd like this email to cover."
							disabled={email.aiLoading}
						></textarea>
						<div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
							<button
								type="button"
								class="btn preset-filled-secondary-500 flex items-center gap-2"
								on:click={() => onComposeEmail(email.id)}
								disabled={!email.aiPrompt?.trim() || email.aiLoading}
							>
								{#if email.aiLoading}
									<IconLoader class="h-4 w-4 animate-spin" />
									<span>Composing…</span>
								{:else}
									<IconSparkles class="h-4 w-4" />
									<span>Generate email</span>
								{/if}
							</button>
							<button
								type="button"
								class="btn preset-tonal-surface flex items-center gap-2"
								on:click={() => onUpdateEmail(email.id, { aiComposerOpen: false, aiError: '' })}
								disabled={email.aiLoading}
							>
								<span>Cancel</span>
							</button>
						</div>
						{#if email.aiError}
							<p class="text-error-700-300 text-xs">{email.aiError}</p>
						{/if}
					</div>
				{/if}

				<div class="mt-4 grid gap-4 md:grid-cols-2">
					<label class="border-surface-500/15 flex flex-col gap-1.5 border-r pr-4">
						<span class="text-surface-200 text-sm font-medium">Send timing</span>
						<div class="flex flex-col gap-2">
							{#if timingMode !== 'now'}
								<div class="flex flex-col gap-2 py-1 md:flex-row md:items-center">
									<input
										type="number"
										min="0"
										step="1"
										class="input preset-tonal-surface rounded-lg px-4 py-2 md:w-28"
										value={getEmailTiming(email.sendOffsetMinutes).hours}
										on:input={(e) => {
											handleTimingChange(email.id, {
												hours: e.currentTarget.value,
												direction: getEmailTiming(email.sendOffsetMinutes).direction
											});
										}}
									/>
									<select
										class="select preset-tonal-surface rounded-lg px-4 py-2"
										value={getEmailTiming(email.sendOffsetMinutes).direction}
										on:change={(e) => {
											handleTimingChange(email.id, {
												hours: getEmailTiming(email.sendOffsetMinutes).hours,
												direction: e.currentTarget.value
											});
										}}
									>
										<option value="before">hours before</option>
										<option value="after">hours after</option>
									</select>
								</div>
								<p class="text-surface-500 text-xs">
									This email sends automatically relative to the event start.
								</p>
							{:else}
								<p class="text-surface-600-400 text-xs">
									This email won't send automatically. Use “Send email now” when you're ready to
									deliver it.
								</p>
							{/if}
						</div>
					</label>
					{#if email.emailType === 'reminder'}
						<div class="flex flex-col gap-1.5 pl-4">
							<span class="text-surface-200 text-sm font-medium" id={`email-confirm-${email.id}`}>
								Require confirmation?
							</span>
							<label class="flex items-center gap-3">
								<Toggle
									name={`email-confirm-toggle-${email.id}`}
									checked={email.requireConfirmation}
									onChange={(v) =>
										handleConfirmationChange({ currentTarget: { checked: v } }, email)}
								/>
								<span class="text-surface-200 text-sm">Require attendance confirmation</span>
							</label>
						</div>
					{/if}
				</div>

				<label class="flex flex-col gap-1.5">
					<span class="text-surface-200 text-sm font-medium">Subject *</span>
					<input
						id={`email-subject-${email.id}`}
						class="input preset-tonal-surface rounded-lg px-4 py-2"
						value={email.subject}
						on:focus={(event) => setActiveEditor(email.id, 'subject', event.currentTarget)}
						on:blur={(event) => clearActiveEditor(event.currentTarget)}
						on:input={(event) => handleEmailInput(event, email, 'subject')}
						placeholder="Reminder: {eventDetails.title} starts soon"
					/>
					<div
						class="border-surface-300-700/60 bg-surface-50-950/50 text-surface-700-300 rounded-md border p-2 text-xs"
					>
						<strong class="text-surface-600-400 block text-[11px] tracking-wide uppercase">
							Subject preview
						</strong>
						<p class="text-surface-800-200 mt-1 break-words whitespace-pre-wrap !normal-case">
							{subjectPreview || 'Merge tags render here so you can double-check personalisation.'}
						</p>
					</div>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="text-surface-200 text-sm font-medium">Body *</span>
					<textarea
						id={`email-body-${email.id}`}
						class="textarea preset-tonal-surface min-h-32 w-full rounded-lg px-4 py-2"
						bind:value={email.body}
						on:focus={(event) => setActiveEditor(email.id, 'body', event.currentTarget)}
						on:blur={(event) => clearActiveEditor(event.currentTarget)}
						on:keydown={() => resetSendNowFeedback(email.id)}
						placeholder="Drop volunteer instructions, call-to-actions, or celebratory recaps."
					></textarea>
					{#if mergeTagPreviews.length}
						<div class="space-y-2">
							<strong class="text-surface-600-400 block text-[11px] tracking-wide uppercase">
								Merge tags
							</strong>
							<div class="flex flex-wrap gap-2">
								{#each mergeTagPreviews as tag (tag.token)}
									<div class="space-y-1">
										<div class="flex items-center gap-1">
											<button
												type="button"
												class="bg-surface-100-900/70 text-surface-800-200 hover:border-primary-600-400/60 border-surface-300-700/70 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
												on:click={() => insertBodyTag(email.id, tag.token)}
											>
												{tag.label}
											</button>
											<button
												type="button"
												class="text-surface-600-400 hover:text-surface-800-200 rounded-full p-1"
												aria-label={`Toggle preview for ${tag.label}`}
												aria-expanded={!!openMergePreviews[
													getMergePreviewKey(`email-${email.id}`, tag.token)
												]}
												on:click={() => toggleMergePreview(`email-${email.id}`, tag.token)}
											>
												{#if !!openMergePreviews[getMergePreviewKey(`email-${email.id}`, tag.token)]}
													<IconChevronUp class="h-4 w-4" />
												{:else}
													<IconChevronDown class="h-4 w-4" />
												{/if}
											</button>
										</div>
										{#if !!openMergePreviews[getMergePreviewKey(`email-${email.id}`, tag.token)]}
											<div
												class="border-surface-300-700/60 bg-surface-100-900/70 text-surface-800-200 space-y-2 rounded-md border p-3 text-xs"
											>
												<div class="flex items-center justify-between gap-2">
													<code class="text-primary-800-200 text-xs">{tag.token}</code>
												</div>

												{#if tag.block && tag.exampleHtml}
													<div
														class="pointer-events-none space-y-2 !normal-case"
														aria-hidden="true"
													>
														{@html tag.exampleHtml}
													</div>
													{#if tag.exampleText}
														<p class="text-surface-900-100 text-[11px] !normal-case">
															Plain text preview: {tag.exampleText}
														</p>
													{/if}
												{:else if tag.exampleHtml}
													<div class="pointer-events-none !normal-case" aria-hidden="true">
														{@html tag.exampleHtml}
													</div>
												{:else if tag.exampleText}
													<p class="text-surface-800-200">{tag.exampleText}</p>
												{:else}
													<p class="text-surface-500">Preview coming soon.</p>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
					<div
						class="border-surface-300-700/60 bg-surface-50-950/50 text-surface-700-300 space-y-2 rounded-md border p-3 text-xs"
					>
						<strong class="text-surface-600-400 block text-[11px] tracking-wide uppercase">
							Body preview
						</strong>
						{#if bodyPreview?.brandedHtml}
							<div
								class="text-surface-900-100 space-y-3 text-sm leading-relaxed !normal-case"
								id={`email-preview-${email.id}`}
							>
								{@html bodyPreview.brandedHtml}
							</div>
						{:else}
							<p class="text-surface-600-400">
								Use the merge tag chips below to add event, shift, and confirmation blocks. Markdown
								like
								<code>**bold**</code> or <code>[links](https://example.org)</code> is supported.
							</p>
						{/if}
					</div>
				</label>

				<div class="mt-4 space-y-2">
					<button
						type="button"
						class="btn preset-filled-primary-500 flex items-center gap-2"
						on:click={() => handleSendScheduledNow(email)}
						disabled={feedback.sending || !volunteerCounts.approved}
					>
						{#if feedback.sending}
							<IconLoader class="h-4 w-4 animate-spin" />
							<span>Sending…</span>
						{:else}
							<IconSend class="h-4 w-4" />
							<span>{timingMode === 'now' ? 'Send email now' : 'Send immediately'}</span>
						{/if}
					</button>
					{#if !volunteerCounts.approved}
						<p class="text-warning-700-300 text-xs">No approved volunteers are ready yet.</p>
					{/if}
					{#if timingMode !== 'now'}
						<p class="text-surface-600-400 text-xs">
							Sending now will override the scheduled delivery.
						</p>
					{/if}
					{#if feedback.error}
						<p class="text-error-700-300 text-xs">{feedback.error}</p>
					{/if}
					{#if feedback.success}
						<p class="text-success-700-300 text-xs">{feedback.success}</p>
					{/if}
				</div>
			</div>
		{/each}
	</section>
</div>
