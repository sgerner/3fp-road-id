<script>
	import { enhance } from '$app/forms';
	import { formatDistanceToNow } from 'date-fns';
	import { fade, slide } from 'svelte/transition';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconFilter from '@lucide/svelte/icons/filter';
	import IconArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconTriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import IconImageUp from '@lucide/svelte/icons/image-up';
	import IconX from '@lucide/svelte/icons/x';
	import IconSend from '@lucide/svelte/icons/send';
	import IconWand2 from '@lucide/svelte/icons/wand-2';
	import IconLink from '@lucide/svelte/icons/link';
	import IconChevronLeft from '@lucide/svelte/icons/chevron-left';
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import IconCheck from '@lucide/svelte/icons/check';
	import AdminHero from '#lib/components/admin/AdminHero.svelte';

	/** @type {Record<string, any>} */
	let { data, form } = $props();
	let removedGroupIds = $state(new Set());
	const groups = $derived((data.groups || []).filter((group) => !removedGroupIds.has(group.id)));
	const total = $derived(groups.length);

	/** @type {any} */
	let selectedGroupId = $state(null);
	/** @type {any} */
	let copiedGroupId = $state(null);
	/** @type {any} */
	let messageByGroup = $state({});
	/** @type {any} */
	let subjectByGroup = $state({});
	/** @type {any} */
	let emailStatusByGroup = $state({});
	let sending = $state(false);
	let generating = $state(false);
	let enriching = $state(false);
	let deletingGroup = $state(false);
	/** @type {any} */
	let confirmDeleteFor = $state(null);

	let imageModalOpen = $state(false);
	let imageEditTarget = $state('logo');
	let imageEditGroupId = $state('');
	let imageUrlDraft = $state('');
	let imagePreviewSrc = $state('');
	let imageNaturalWidth = $state(0);
	let imageNaturalHeight = $state(0);
	let cropStageWidth = $state(0);
	let cropStageHeight = $state(0);
	let cropScale = $state(1);
	let cropX = $state(0);
	let cropY = $state(0);
	let draggingCrop = $state(false);
	/** @type {any} */
	let cropDragStart = $state(null);
	let savingAssets = $state(false);
	let logoCroppedDataUrl = $state('');
	let coverCroppedDataUrl = $state('');
	/** @type {any} */
	let imageFormEl = $state(null);
	/** @type {any} */
	let generateFormEl = $state(null);
	/** @type {any} */
	let imageDialogEl = $state(null);

	// Keep the native dialog in step with imageModalOpen. showModal() provides the focus trap,
	// Escape to close, an inert background and focus restore; onclose reports Escape back.
	$effect(() => {
		if (!imageDialogEl) return;
		if (imageModalOpen && !imageDialogEl.open) imageDialogEl.showModal();
		else if (!imageModalOpen && imageDialogEl.open) imageDialogEl.close();
	});

	const selectedGroup = $derived(groups.find((group) => group.id === selectedGroupId) || null);

	function enhanceWithFlag(setFlag) {
		return () => {
			setFlag(true);
			return async ({ update, result }) => {
				await update();
				if (result?.type === 'success') {
					if (result?.data?.selectedGroupId) {
						selectedGroupId = result.data.selectedGroupId;
					}
					if (result?.data?.generatedMessage && result?.data?.selectedGroupId) {
						messageByGroup = {
							...messageByGroup,
							[result.data.selectedGroupId]: result.data.generatedMessage
						};
					}
					if (result?.data?.generatedSubject && result?.data?.selectedGroupId) {
						subjectByGroup = {
							...subjectByGroup,
							[result.data.selectedGroupId]: result.data.generatedSubject
						};
					}
					if (result?.data?.emailSent && result?.data?.selectedGroupId) {
						emailStatusByGroup = {
							...emailStatusByGroup,
							[result.data.selectedGroupId]: {
								type: 'success',
								message: 'Email sent and outreach logged.'
							}
						};
					}
					if (result?.data?.deletedGroupId) {
						removedGroupIds = new Set([...removedGroupIds, result.data.deletedGroupId]);
						if (selectedGroupId === result.data.deletedGroupId) selectedGroupId = null;
						confirmDeleteFor = null;
					}
				} else if (result?.type === 'failure' && result?.data?.selectedGroupId) {
					emailStatusByGroup = {
						...emailStatusByGroup,
						[result.data.selectedGroupId]: {
							type: 'error',
							message: result.data.error || 'Unable to send email.'
						}
					};
				}
				setFlag(false);
			};
		};
	}

	$effect(() => {
		if (!selectedGroup) return;
		const id = selectedGroup.id;
		if (!subjectByGroup[id]) {
			subjectByGroup = {
				...subjectByGroup,
				[id]: `Quick hello from 3 Feet Please for ${selectedGroup.name}`
			};
		}
	});

	async function copyText(value) {
		const text = String(value || '').trim();
		if (!text) return;
		await navigator.clipboard.writeText(text);
	}

	async function openProfileAndCopy(url, message, event) {
		event?.stopPropagation?.();
		await copyText(message);
		window.open(url, '_blank', 'noopener,noreferrer');
	}

	function getMessage(group) {
		return messageByGroup[group.id] || '';
	}

	function setMessage(groupId, value) {
		messageByGroup = { ...messageByGroup, [groupId]: value };
	}

	function getSubject(group) {
		return subjectByGroup[group.id] || `Quick hello from 3 Feet Please for ${group.name}`;
	}

	function setSubject(groupId, value) {
		subjectByGroup = { ...subjectByGroup, [groupId]: value };
	}

	function getEmailStatus(groupId) {
		return emailStatusByGroup[groupId] || null;
	}

	function getContactItems(group) {
		const items = [];
		if (group.public_contact_email) items.push({ key: 'email', label: 'Email' });
		for (const [platform, url] of Object.entries(group.social_links || {})) {
			if (!url) continue;
			items.push({ key: platform, label: platform });
		}
		return items;
	}

	function selectGroup(group) {
		selectedGroupId = group.id;
		emailStatusByGroup = { ...emailStatusByGroup, [group.id]: null };
		generating = true;
		queueMicrotask(() => generateFormEl?.requestSubmit?.());
	}

	function hasSocials(group) {
		return Object.values(group.social_links || {}).some(Boolean);
	}

	async function copyClaimLink(group, event) {
		event?.stopPropagation?.();
		await navigator.clipboard.writeText(group.claim_url);
		copiedGroupId = group.id;
		setTimeout(() => copiedGroupId === group.id && (copiedGroupId = null), 1400);
	}

	function openImageModal(group, target) {
		imageEditTarget = target;
		imageEditGroupId = group.id;
		imageUrlDraft = target === 'logo' ? group.logo_url || '' : group.cover_photo_url || '';
		imagePreviewSrc = imageUrlDraft;
		imageNaturalWidth = 0;
		imageNaturalHeight = 0;
		cropStageWidth = 0;
		cropStageHeight = 0;
		cropScale = 1;
		cropX = 0;
		cropY = 0;
		draggingCrop = false;
		cropDragStart = null;
		logoCroppedDataUrl = '';
		coverCroppedDataUrl = '';
		imageModalOpen = true;
	}

	async function onImageFileSelected(event) {
		const file = event?.target?.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => (imagePreviewSrc = String(reader.result || ''));
		reader.readAsDataURL(file);
	}

	function onPreviewImageLoad(event) {
		const img = event.currentTarget;
		imageNaturalWidth = img?.naturalWidth || 0;
		imageNaturalHeight = img?.naturalHeight || 0;
	}

	function applyUrlPreview() {
		imagePreviewSrc = imageUrlDraft;
	}

	function getCropFitScale() {
		if (!imageNaturalWidth || !imageNaturalHeight || !cropStageWidth || !cropStageHeight) return 1;
		return Math.max(cropStageWidth / imageNaturalWidth, cropStageHeight / imageNaturalHeight);
	}

	function startCropDrag(event) {
		if (!imagePreviewSrc) return;
		draggingCrop = true;
		cropDragStart = { pointerX: event.clientX, pointerY: event.clientY, cropX, cropY };
		event.currentTarget?.setPointerCapture?.(event.pointerId);
	}

	function moveCropDrag(event) {
		if (!draggingCrop || !cropDragStart) return;
		cropX = cropDragStart.cropX + (event.clientX - cropDragStart.pointerX);
		cropY = cropDragStart.cropY + (event.clientY - cropDragStart.pointerY);
	}

	function endCropDrag() {
		draggingCrop = false;
		cropDragStart = null;
	}

	async function buildCroppedDataUrl() {
		if (!imagePreviewSrc) return '';
		const img = new Image();
		img.src = imagePreviewSrc;
		await new Promise((resolve, reject) => {
			img.onload = resolve;
			img.onerror = reject;
		});
		const isLogo = imageEditTarget === 'logo';
		const outW = isLogo ? 800 : 1600;
		const outH = isLogo ? 800 : 900;
		const canvas = document.createElement('canvas');
		canvas.width = outW;
		canvas.height = outH;
		const ctx = canvas.getContext('2d');
		if (!ctx) return '';
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, outW, outH);
		const baseScale = Math.max(outW / img.width, outH / img.height);
		const s = baseScale * cropScale;
		const drawW = img.width * s;
		const drawH = img.height * s;
		const previewToOutputScale = cropStageWidth ? outW / cropStageWidth : 1;
		const offsetX = (outW - drawW) / 2 + cropX * previewToOutputScale;
		const offsetY = (outH - drawH) / 2 + cropY * previewToOutputScale;
		ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
		return canvas.toDataURL('image/jpeg', 0.9);
	}

	async function prepareCroppedAndSubmit() {
		if (!imagePreviewSrc && imageUrlDraft) {
			imageFormEl?.requestSubmit?.();
			return;
		}
		const cropped = await buildCroppedDataUrl();
		if (!cropped) {
			imageFormEl?.requestSubmit?.();
			return;
		}
		if (imageEditTarget === 'logo') logoCroppedDataUrl = cropped;
		else coverCroppedDataUrl = cropped;
		await Promise.resolve();
		imageFormEl?.requestSubmit?.();
	}

	function getSortValue(group) {
		const sort = data.sort || 'priority';
		// Solid tags keep dark text readable on asphalt rows and on the lemon selected/hover row.
		const NEUTRAL_TAG = 'bg-surface-800 text-surface-50';
		const PRIORITY_TAG = 'bg-tertiary-500 text-surface-950';
		switch (sort) {
			case 'priority':
				return { label: 'Priority', value: group.priority_score, tag: PRIORITY_TAG };
			case 'completeness':
				return {
					label: 'Complete',
					value: `${group.completeness}%`,
					tag:
						group.completeness >= 80
							? 'bg-success-500 text-surface-950'
							: group.completeness >= 50
								? 'bg-warning-500 text-surface-950'
								: 'bg-error-500 text-surface-950'
				};
			case 'newest':
				return {
					label: 'Added',
					value: group.enrichment?.created_at
						? formatDistanceToNow(new Date(group.enrichment.created_at), { addSuffix: true })
						: 'Unknown',
					tag: NEUTRAL_TAG
				};
			case 'stale':
				return {
					label: 'Last',
					value: group.last_contact
						? formatDistanceToNow(new Date(group.last_contact.contacted_at), { addSuffix: true })
						: 'Never',
					tag: NEUTRAL_TAG
				};
			default:
				return { label: 'Priority', value: group.priority_score, tag: PRIORITY_TAG };
		}
	}
</script>

<svelte:head>
	<title>Group Outreach | Admin</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<AdminHero eyebrow="Groups" title="Group Outreach">
	{total} groups waiting for outreach
</AdminHero>

<!-- FILTERS -->
<section
	class="bg-surface-900 border-surface-800 border-b-2 px-6 py-5 sm:px-10 lg:px-14"
	aria-label="Outreach filters"
>
	<form method="GET" class="flex flex-wrap gap-3" transition:fade>
		<div class="relative flex-[1_1_16rem]">
			<IconSearch
				class="text-surface-300 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
			/>
			<input
				type="search"
				name="q"
				aria-label="Search groups"
				value={data.q || ''}
				placeholder="Search groups..."
				class="input pl-9"
			/>
		</div>
		<div class="relative flex-[1_1_11rem]">
			<IconFilter
				class="text-surface-300 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
			/>
			<select
				name="contact"
				aria-label="Filter by contact type"
				class="select pl-9"
				value={data.contact || 'all'}
			>
				<option value="all">All contacts</option>
				<option value="email">Has email</option>
				<option value="social">Has social</option>
				<option value="none">No contacts</option>
			</select>
		</div>
		<div class="relative flex-[1_1_14rem]">
			<IconFilter
				class="text-surface-300 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
			/>
			<select
				name="min_completeness"
				aria-label="Minimum completeness"
				class="select pl-9"
				value={String(data.minCompleteness || 0)}
			>
				<option value="0">Any completeness</option>
				<option value="40">40%+ complete</option>
				<option value="60">60%+ complete</option>
				<option value="80">80%+ complete</option>
			</select>
		</div>
		<div class="flex flex-[1_1_21rem] items-center gap-3">
			<div class="relative min-w-0 flex-1">
				<IconArrowUpDown
					class="text-surface-300 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
				/>
				<select
					name="sort"
					aria-label="Sort groups"
					class="select pl-9"
					value={data.sort || 'priority'}
				>
					<option value="priority">Priority (high first)</option>
					<option value="completeness">Most complete</option>
					<option value="newest">Newest first</option>
					<option value="stale">Stalest contact</option>
				</select>
			</div>
			<button type="submit" class="btn preset-filled-primary-500 px-4">Apply</button>
		</div>
	</form>
</section>

<div class="grid flex-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
	<!-- GROUP LIST (one list for every screen size) -->
	<section
		class="bg-surface-900 border-surface-800 border-t-secondary-500 border-t-4 lg:border-r-2"
		aria-label="Groups awaiting outreach"
	>
		<ul class="m-0 flex list-none flex-col p-0 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto">
			{#each groups as g (g.id)}
				{@const sortInfo = getSortValue(g)}
				{@const contacts = getContactItems(g)}
				{@const isSelected = selectedGroupId === g.id}
				{@const muted = isSelected ? '' : 'text-surface-300 group-hover:text-surface-950'}
				<li class="border-surface-800 border-b">
					<button
						type="button"
						aria-pressed={isSelected}
						class="group flex w-full cursor-pointer flex-col gap-2 px-5 py-3 text-left transition {isSelected
							? 'bg-primary-500 text-surface-950'
							: 'hover:bg-primary-500 hover:text-surface-950'}"
						onclick={() => selectGroup(g)}
					>
						<span class="flex items-center gap-3">
							{#if g.logo_url}
								<img
									src={g.logo_url}
									alt=""
									class="bg-surface-50 h-10 w-10 shrink-0 object-cover"
								/>
							{:else}
								<span
									class="bg-surface-50 text-surface-950 flex h-10 w-10 shrink-0 items-center justify-center"
								>
									<IconUsers class="h-4 w-4" />
								</span>
							{/if}
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-2">
									<span class="truncate text-sm font-black">{g.name}</span>
									{#if g.is_low_priority}
										<span
											class="bg-warning-500 text-surface-950 shrink-0 px-1.5 py-0.5 text-[0.65rem] font-black tracking-wide uppercase"
										>
											Low
										</span>
									{/if}
								</span>
								<span class="block truncate text-xs {muted}">{g.city}, {g.state_region}</span>
							</span>
							<span class="flex shrink-0 flex-col items-end gap-1">
								<span
									class="{sortInfo.tag} px-2 py-0.5 text-xs font-black whitespace-nowrap tabular-nums"
								>
									{sortInfo.value}
								</span>
								<span class="text-[0.65rem] font-bold tracking-[0.14em] uppercase {muted}">
									{sortInfo.label}
								</span>
							</span>
						</span>
						<span class="flex flex-wrap gap-1">
							{#each contacts.slice(0, 4) as c}
								<span class="bg-surface-800 text-surface-50 px-1.5 py-0.5 text-xs">{c.label}</span>
							{/each}
							{#if contacts.length > 4}
								<span class="bg-surface-800 text-surface-50 px-1.5 py-0.5 text-xs">
									+{contacts.length - 4}
								</span>
							{/if}
						</span>
					</button>
				</li>
			{:else}
				<li class="flex flex-col items-center gap-3 px-6 py-16 text-center">
					<span class="bg-surface-50 text-surface-950 flex h-12 w-12 items-center justify-center">
						<IconSparkles class="h-6 w-6" aria-hidden="true" />
					</span>
					<p class="m-0 text-sm font-black tracking-wide uppercase">All caught up!</p>
				</li>
			{/each}
		</ul>
	</section>

	<!-- DETAIL: an inline pane from lg up, a full-screen sheet under the header below it. It is
	     one element, so the form and its ids are rendered once. -->
	<section
		class="min-w-0 {selectedGroup
			? 'bg-surface-950 border-primary-500 fixed inset-x-0 top-[var(--app-header-height)] bottom-0 z-50 flex flex-col overflow-hidden border-t-4 lg:static lg:z-auto lg:block lg:overflow-visible lg:border-t-0 lg:bg-transparent'
			: 'hidden lg:block'}"
		aria-label="Outreach details"
	>
		{#if selectedGroup}
			<div
				class="border-surface-800 bg-surface-900 flex shrink-0 items-center justify-between border-b-2 px-4 py-3 lg:hidden"
			>
				<button
					type="button"
					class="btn btn-sm preset-outlined-surface-500"
					onclick={() => (selectedGroupId = null)}
				>
					<IconChevronLeft class="h-4 w-4" /> Back
				</button>
				<span class="text-surface-300 text-xs font-bold tracking-[0.22em] uppercase">Outreach</span>
				<div class="w-16"></div>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto lg:flex-none lg:overflow-visible">
				<div class="lg:sticky lg:top-4">
					{@render detailContent(selectedGroup)}
				</div>
			</div>
		{:else}
			<div class="lg:sticky lg:top-4">
				<div
					class="flex min-h-[24rem] flex-col items-start justify-center gap-5 px-10 py-12 lg:px-14"
				>
					<span class="bg-secondary-500 text-surface-50 flex h-16 w-16 items-center justify-center">
						<IconSend class="h-8 w-8" aria-hidden="true" />
					</span>
					<h2 class="m-0 text-3xl leading-[0.92] sm:text-4xl">Select a group</h2>
					<p class="text-surface-300 m-0 max-w-md text-base leading-snug font-medium">
						Choose a group to compose your outreach message.
					</p>
				</div>
			</div>
		{/if}
	</section>
</div>

{#snippet detailContent(group)}
	<form
		bind:this={generateFormEl}
		method="POST"
		action="?/generate"
		use:enhance={enhanceWithFlag((v) => (generating = v))}
		class="hidden"
	>
		<input type="hidden" name="group_id" value={group.id} />
	</form>

	<!-- Group header -->
	<div class="border-surface-800 flex items-center gap-4 border-b-2 px-6 py-5">
		{#if group.logo_url}
			<img src={group.logo_url} alt="" class="bg-surface-50 h-14 w-14 shrink-0 object-cover" />
		{:else}
			<span
				class="bg-surface-50 text-surface-950 flex h-14 w-14 shrink-0 items-center justify-center"
			>
				<IconUsers class="h-6 w-6" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<h2 class="m-0 truncate text-2xl leading-tight">{group.name}</h2>
				<a
					href="/groups/{group.slug}"
					target="_blank"
					class="btn btn-sm preset-outlined-surface-500 shrink-0"
					onclick={(event) => event.stopPropagation()}
				>
					<IconExternalLink class="h-4 w-4" />
					Open group
				</a>
			</div>
			<p class="text-surface-300 m-0 text-sm">{group.city}, {group.state_region}</p>
		</div>
	</div>

	<!-- Compose -->
	<section class="flex flex-col gap-4 px-6 py-6" aria-label="Compose message">
		<div class="flex items-center justify-between gap-3">
			<h3 class="m-0 flex items-center gap-2 text-lg">
				<IconSend class="text-primary-500 h-4 w-4" aria-hidden="true" />
				Compose Message
			</h3>
			<p class="text-surface-300 m-0 text-xs" role="status">
				{generating ? 'Writing draft…' : ''}
			</p>
		</div>

		{#if group.public_contact_email}
			<form
				method="POST"
				action="?/sendMessage"
				use:enhance={enhanceWithFlag((v) => (sending = v))}
				class="flex flex-col gap-4"
			>
				<input type="hidden" name="group_id" value={group.id} />
				<div class="flex flex-col gap-2">
					<label
						class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
						for={`subject-${group.id}`}>Subject</label
					>
					<input
						id={`subject-${group.id}`}
						type="text"
						name="subject"
						class="input"
						value={getSubject(group)}
						oninput={(e) => setSubject(group.id, e.currentTarget.value)}
						disabled={generating}
					/>
				</div>
				<div class="flex flex-col gap-2">
					<label
						class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
						for={`message-${group.id}`}>Message</label
					>
					<textarea
						id={`message-${group.id}`}
						name="content"
						class="textarea min-h-44 w-full text-sm leading-relaxed"
						value={getMessage(group)}
						oninput={(e) => setMessage(group.id, e.currentTarget.value)}
						disabled={generating}></textarea>
				</div>
				<div class="flex flex-wrap items-center gap-4">
					<button
						type="submit"
						class="btn preset-filled-primary-500 px-7 py-3"
						disabled={sending || generating}
					>
						{#if sending}
							<IconRefreshCw class="h-4 w-4 motion-safe:animate-spin" />
						{:else}
							<IconSend class="h-4 w-4" />
						{/if}
						{sending ? 'Sending...' : 'Send Email'}
					</button>
					{#if getEmailStatus(group.id)?.type === 'success'}
						<span
							class="text-success-500 flex items-center gap-1.5 text-sm font-bold"
							role="status"
						>
							<IconCheck class="h-4 w-4" />
							{getEmailStatus(group.id)?.message}
						</span>
					{:else if getEmailStatus(group.id)?.type === 'error'}
						<span class="text-error-500 flex items-center gap-1.5 text-sm font-bold" role="status">
							<IconAlertCircle class="h-4 w-4" />
							{getEmailStatus(group.id)?.message}
						</span>
					{/if}
				</div>
			</form>
		{:else}
			<div class="flex flex-col gap-2">
				<label
					class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
					for={`message-${group.id}`}>Message</label
				>
				<textarea
					id={`message-${group.id}`}
					class="textarea min-h-44 w-full text-sm leading-relaxed"
					value={getMessage(group)}
					oninput={(e) => setMessage(group.id, e.currentTarget.value)}
					disabled={generating}></textarea>
			</div>
			<div class="text-warning-500 flex items-center gap-2 text-sm font-bold">
				<IconAlertCircle class="h-4 w-4" />
				<span>No public email. Use social DMs below.</span>
			</div>
		{/if}

		{#if hasSocials(group)}
			<div class="flex flex-wrap gap-2 pt-2">
				{#each Object.entries(group.social_links || {}).filter(([, url]) => Boolean(url) && !String(url).includes('instagram.com/p/')) as [platform, url]}
					<button
						type="button"
						class="btn btn-sm preset-outlined-surface-500"
						onclick={(event) => openProfileAndCopy(url, getMessage(group), event)}
						disabled={generating}
					>
						Open {platform.replace(/_/g, ' ')}
					</button>
				{/each}
				<button
					type="button"
					class="btn btn-sm preset-filled-secondary-500"
					onclick={() => copyText(getMessage(group))}
					disabled={generating}
				>
					<IconCopy class="h-3.5 w-3.5" /> Copy
				</button>
			</div>
		{/if}
	</section>

	<!-- Actions -->
	<div class="bg-surface-900 border-surface-800 flex flex-wrap gap-2 border-y-2 px-6 py-4">
		<button
			type="button"
			class="btn btn-sm preset-outlined-surface-500"
			onclick={(event) => copyClaimLink(group, event)}
		>
			<IconLink class="h-3.5 w-3.5" />
			{copiedGroupId === group.id ? 'Copied!' : 'Claim URL'}
		</button>
		<form
			method="POST"
			action="?/enrich"
			use:enhance={enhanceWithFlag((v) => (enriching = v))}
			class="contents"
		>
			<input type="hidden" name="group_id" value={group.id} />
			<button type="submit" class="btn btn-sm preset-filled-secondary-500" disabled={enriching}>
				<IconWand2 class="h-3.5 w-3.5 {enriching ? 'motion-safe:animate-spin' : ''}" />
				{enriching ? 'Enriching...' : 'Enrich'}
			</button>
		</form>
		<form method="POST" action="?/toggleLowPriority" use:enhance class="contents">
			<input type="hidden" name="group_id" value={group.id} />
			<input type="hidden" name="value" value={group.is_low_priority ? 'false' : 'true'} />
			<button
				type="submit"
				class="btn btn-sm {group.is_low_priority
					? 'preset-outlined-surface-500'
					: 'preset-outlined-warning-500'}"
			>
				{group.is_low_priority ? 'Restore' : 'Low Priority'}
			</button>
		</form>
		{#if confirmDeleteFor === group.id}
			<div
				class="bg-error-500 text-surface-950 flex w-full items-center gap-3 px-3 py-2"
				transition:slide
			>
				<IconAlertCircle class="h-4 w-4 shrink-0" aria-hidden="true" />
				<span class="flex-1 text-xs font-black tracking-wide uppercase">Delete permanently?</span>
				<form
					method="POST"
					action="?/deleteGroup"
					use:enhance={enhanceWithFlag((v) => (deletingGroup = v))}
				>
					<input type="hidden" name="group_id" value={group.id} />
					<button
						type="submit"
						class="bg-surface-950 text-surface-50 hover:bg-surface-800 cursor-pointer px-3 py-1.5 text-xs font-black tracking-wide uppercase transition"
						disabled={deletingGroup}
					>
						{deletingGroup ? '...' : 'Delete'}
					</button>
				</form>
				<button
					type="button"
					class="border-surface-950 hover:bg-surface-950 hover:text-surface-50 cursor-pointer border-2 px-3 py-1 text-xs font-black tracking-wide uppercase transition"
					onclick={() => (confirmDeleteFor = null)}>Cancel</button
				>
			</div>
		{:else}
			<button
				type="button"
				class="btn btn-sm preset-outlined-error-500"
				aria-label="Delete group"
				onclick={() => (confirmDeleteFor = group.id)}
			>
				<IconTrash2 class="h-3.5 w-3.5" />
			</button>
		{/if}
	</div>

	<!-- Assets & stats -->
	<div class="flex flex-wrap items-center gap-x-6 gap-y-4 px-6 py-5">
		<div class="flex items-center gap-2">
			<div
				class="bg-surface-50 text-surface-950 flex h-10 w-10 items-center justify-center overflow-hidden"
			>
				{#if group.logo_url}
					<img src={group.logo_url} alt="" class="h-full w-full object-cover" />
				{:else}
					<IconImageUp class="h-4 w-4" />
				{/if}
			</div>
			<button
				type="button"
				class="text-surface-300 hover:text-primary-500 cursor-pointer text-xs font-black tracking-[0.14em] uppercase transition"
				aria-label="Edit logo"
				onclick={() => openImageModal(group, 'logo')}
			>
				Edit
			</button>
		</div>
		<div class="flex items-center gap-2">
			<div
				class="bg-surface-50 text-surface-950 flex h-10 w-16 items-center justify-center overflow-hidden"
			>
				{#if group.cover_photo_url}
					<img src={group.cover_photo_url} alt="" class="h-full w-full object-cover" />
				{:else}
					<IconImageUp class="h-4 w-4" />
				{/if}
			</div>
			<button
				type="button"
				class="text-surface-300 hover:text-primary-500 cursor-pointer text-xs font-black tracking-[0.14em] uppercase transition"
				aria-label="Edit cover"
				onclick={() => openImageModal(group, 'cover')}
			>
				Edit
			</button>
		</div>
		<dl class="m-0 ml-auto flex items-center gap-6">
			<div class="border-surface-700 flex flex-col-reverse gap-1 border-l-2 pl-3">
				<dt class="text-surface-300 text-[0.65rem] font-bold tracking-[0.16em] uppercase">
					Complete
				</dt>
				<dd
					class="m-0 text-xl leading-none font-black italic tabular-nums {group.completeness >= 80
						? 'text-success-500'
						: group.completeness >= 50
							? 'text-warning-500'
							: 'text-error-500'}"
				>
					{group.completeness}%
				</dd>
			</div>
			<div class="border-surface-700 flex flex-col-reverse gap-1 border-l-2 pl-3">
				<dt class="text-surface-300 text-[0.65rem] font-bold tracking-[0.16em] uppercase">
					Priority
				</dt>
				<dd class="text-tertiary-500 m-0 text-xl leading-none font-black italic tabular-nums">
					{group.priority_score}
				</dd>
			</div>
			<div class="border-surface-700 flex flex-col-reverse gap-1 border-l-2 pl-3">
				<dt class="text-surface-300 text-[0.65rem] font-bold tracking-[0.16em] uppercase">
					Contacts
				</dt>
				<dd class="m-0 text-xl leading-none font-black italic tabular-nums">
					{group.contacts_count}
				</dd>
			</div>
		</dl>
	</div>
{/snippet}

<!-- m-auto: Tailwind's reset zeroes the margin that centers a modal dialog. -->
<dialog
	bind:this={imageDialogEl}
	aria-labelledby="image-editor-heading"
	onclose={() => (imageModalOpen = false)}
	class="bg-surface-950 text-surface-50 border-surface-700 border-t-primary-500 backdrop:bg-surface-950/80 m-auto max-h-[90dvh] w-full max-w-[min(32rem,calc(100%-2rem))] flex-col overflow-hidden border-2 border-t-4 p-0 open:flex"
>
	{#if imageModalOpen}
		<div class="flex min-h-0 flex-1 flex-col">
			<!-- Header -->
			<div
				class="border-surface-800 flex shrink-0 items-center justify-between border-b-2 px-5 py-4"
			>
				<div class="flex items-center gap-2">
					<IconImageUp class="text-primary-500 h-5 w-5" aria-hidden="true" />
					<h2 id="image-editor-heading" class="m-0 text-xl">
						Edit {imageEditTarget === 'logo' ? 'Logo' : 'Cover'}
					</h2>
				</div>
				<button
					type="button"
					class="btn-icon preset-outlined-surface-500"
					aria-label="Close image editor"
					onclick={() => (imageModalOpen = false)}
				>
					<IconX class="h-5 w-5" />
				</button>
			</div>

			<!-- Preview -->
			<div class="bg-surface-900 border-surface-800 relative shrink-0 overflow-hidden border-b-2">
				<div
					class="relative mx-auto touch-none select-none"
					class:w-48={imageEditTarget === 'logo'}
					class:h-48={imageEditTarget === 'logo'}
					class:w-full={imageEditTarget === 'cover'}
					class:h-40={imageEditTarget === 'cover'}
					role="group"
					aria-label="Image crop preview"
					bind:clientWidth={cropStageWidth}
					bind:clientHeight={cropStageHeight}
					onpointerdown={startCropDrag}
					onpointermove={moveCropDrag}
					onpointerup={endCropDrag}
					onpointercancel={endCropDrag}
					onpointerleave={endCropDrag}
				>
					{#if imagePreviewSrc}
						<img
							src={imagePreviewSrc}
							alt="crop preview"
							draggable="false"
							onload={onPreviewImageLoad}
							class="absolute top-1/2 left-1/2 h-auto max-h-none w-auto max-w-none touch-none select-none"
							style="transform: translate(-50%, -50%) translate({cropX}px, {cropY}px) scale({getCropFitScale() *
								cropScale}); cursor: {draggingCrop ? 'grabbing' : 'grab'}"
						/>
					{:else}
						<div
							class="text-surface-300 absolute inset-0 flex flex-col items-center justify-center gap-2"
						>
							<IconImageUp class="h-10 w-10" aria-hidden="true" />
							<span class="text-sm font-medium">Add an image to start</span>
						</div>
					{/if}
				</div>
				{#if imagePreviewSrc}
					<div
						class="bg-surface-950 text-surface-50 absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-bold"
					>
						Drag to reposition
					</div>
				{/if}
			</div>

			<!-- Controls -->
			<div class="flex flex-col gap-5 overflow-y-auto p-5">
				<div class="flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<label
							class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase"
							for="crop-zoom">Zoom</label
						>
						<span class="text-surface-300 text-xs tabular-nums">{Math.round(cropScale * 100)}%</span
						>
					</div>
					<input
						id="crop-zoom"
						type="range"
						min="1"
						max="2.5"
						step="0.01"
						bind:value={cropScale}
						class="accent-primary-500 w-full"
					/>
				</div>

				<div
					class="border-surface-500 grid grid-cols-2 border-2"
					role="group"
					aria-label="Image source"
				>
					<button
						type="button"
						class="cursor-pointer px-3 py-2 text-sm font-black tracking-wide uppercase transition {imageUrlDraft
							? 'bg-primary-500 text-surface-950'
							: 'text-surface-300 hover:text-surface-50'}"
						onclick={() => {
							imageUrlDraft = imagePreviewSrc || '';
						}}
					>
						URL
					</button>
					<label
						class="cursor-pointer px-3 py-2 text-center text-sm font-black tracking-wide uppercase transition {imagePreviewSrc &&
						!imageUrlDraft
							? 'bg-primary-500 text-surface-950'
							: 'text-surface-300 hover:text-surface-50'}"
					>
						Upload
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
							class="hidden"
							onchange={onImageFileSelected}
						/>
					</label>
				</div>

				<div class="flex gap-2">
					<input
						type="text"
						class="input flex-1"
						aria-label="Image URL"
						bind:value={imageUrlDraft}
						placeholder="https://example.com/image.jpg"
						onkeydown={(e) => e.key === 'Enter' && applyUrlPreview()}
					/>
					<button type="button" class="btn preset-outlined-surface-500" onclick={applyUrlPreview}>
						Load
					</button>
				</div>
			</div>

			<!-- Footer -->
			<div class="border-surface-800 bg-surface-900 shrink-0 border-t-2 px-5 py-4">
				<form
					bind:this={imageFormEl}
					method="POST"
					action="?/updateAssets"
					use:enhance={enhanceWithFlag((v) => (savingAssets = v))}
					class="flex justify-end gap-2"
				>
					<input type="hidden" name="group_id" value={imageEditGroupId} />
					{#if imageEditTarget === 'logo'}
						<input type="hidden" name="logo_file_cropped" value={logoCroppedDataUrl} />
						<input type="hidden" name="logo_url" value={imageUrlDraft} />
					{:else}
						<input type="hidden" name="cover_file_cropped" value={coverCroppedDataUrl} />
						<input type="hidden" name="cover_photo_url" value={imageUrlDraft} />
					{/if}
					<button
						type="button"
						class="btn preset-outlined-surface-500"
						onclick={() => (imageModalOpen = false)}>Cancel</button
					>
					<button
						type="button"
						class="btn preset-filled-primary-500"
						disabled={savingAssets || !imagePreviewSrc}
						onclick={prepareCroppedAndSubmit}
					>
						{#if savingAssets}<IconRefreshCw class="h-4 w-4 motion-safe:animate-spin" />{/if}
						{savingAssets ? 'Saving...' : 'Save'}
					</button>
				</form>
			</div>
		</div>
	{/if}
</dialog>
