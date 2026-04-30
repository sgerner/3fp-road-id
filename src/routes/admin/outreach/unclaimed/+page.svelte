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

	let { data, form } = $props();
	let removedGroupIds = $state(new Set());
	const groups = $derived((data.groups || []).filter((group) => !removedGroupIds.has(group.id)));
	const total = $derived(groups.length);

	let selectedGroupId = $state(null);
	let copiedGroupId = $state(null);
	let messageByGroup = $state({});
	let subjectByGroup = $state({});
	let emailStatusByGroup = $state({});
	let sending = $state(false);
	let generating = $state(false);
	let enriching = $state(false);
	let deletingGroup = $state(false);
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
	let cropDragStart = $state(null);
	let savingAssets = $state(false);
	let logoCroppedDataUrl = $state('');
	let coverCroppedDataUrl = $state('');
	let imageFormEl = $state(null);
	let generateFormEl = $state(null);

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
		switch (sort) {
			case 'priority':
				return { label: 'Priority', value: group.priority_score, color: 'text-tertiary-600' };
			case 'completeness':
				return {
					label: 'Complete',
					value: `${group.completeness}%`,
					color:
						group.completeness >= 80
							? 'text-success-600'
							: group.completeness >= 50
								? 'text-warning-600'
								: 'text-error-600'
				};
			case 'newest':
				return {
					label: 'Added',
					value: group.enrichment?.created_at
						? formatDistanceToNow(new Date(group.enrichment.created_at), { addSuffix: true })
						: 'Unknown',
					color: 'text-surface-600-400'
				};
			case 'stale':
				return {
					label: 'Last',
					value: group.last_contact
						? formatDistanceToNow(new Date(group.last_contact.contacted_at), { addSuffix: true })
						: 'Never',
					color: 'text-surface-600-400'
				};
			default:
				return { label: 'Priority', value: group.priority_score, color: 'text-tertiary-600' };
		}
	}
</script>

<svelte:head>
	<title>Unclaimed Groups | Admin</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:py-8">
	<!-- Header -->
	<header class="flex flex-col gap-1">
		<h1 class="h2 flex items-center gap-2">
			<IconSparkles class="text-tertiary-500 h-6 w-6" />
			Unclaimed Groups
		</h1>
		<p class="text-surface-600-400 flex items-center gap-2 text-sm">
			<IconUsers class="h-4 w-4" />
			{total} groups waiting for outreach
		</p>
	</header>

	<!-- Filters -->
	<form method="GET" class="card preset-outlined-surface-200-800 p-3" transition:fade>
		<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
			<div class="relative lg:col-span-2">
				<IconSearch class="text-surface-500 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<input
					type="search"
					name="q"
					value={data.q || ''}
					placeholder="Search groups..."
					class="input preset-tonal-surface pl-9"
				/>
			</div>
			<div class="relative">
				<IconFilter class="text-surface-500 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<select
					name="contact"
					class="select preset-tonal-surface pl-9"
					value={data.contact || 'all'}
				>
					<option value="all">All contacts</option>
					<option value="email">Has email</option>
					<option value="social">Has social</option>
					<option value="none">No contacts</option>
				</select>
			</div>
			<div class="relative">
				<IconFilter class="text-surface-500 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<select
					name="min_completeness"
					class="select preset-tonal-surface pl-9"
					value={String(data.minCompleteness || 0)}
				>
					<option value="0">Any completeness</option>
					<option value="40">40%+ complete</option>
					<option value="60">60%+ complete</option>
					<option value="80">80%+ complete</option>
				</select>
			</div>
			<div class="flex items-center gap-2">
				<div class="relative min-w-0 flex-1">
					<IconArrowUpDown
						class="text-surface-500 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
					/>
					<select
						name="sort"
						class="select preset-tonal-surface pl-9"
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
		</div>
	</form>

	<!-- Desktop Layout -->
	<div class="hidden items-start gap-5 lg:grid lg:grid-cols-[320px_1fr]">
		<!-- Group List -->
		<div class="flex max-h-[calc(100vh-11rem)] flex-col gap-1.5 overflow-y-auto pr-1">
			{#each groups as g (g.id)}
				{@const sortInfo = getSortValue(g)}
				<button
					type="button"
					class="group rounded-lg border p-3 text-left transition-all duration-150 {selectedGroupId ===
					g.id
						? 'bg-primary-500/10 border-primary-500/40'
						: 'bg-surface-50-950 border-surface-200-800 hover:border-surface-300-700'}"
					onclick={() => selectGroup(g)}
				>
					<div class="flex items-center gap-3">
						{#if g.logo_url}
							<img
								src={g.logo_url}
								alt=""
								class="ring-surface-500/20 h-9 w-9 shrink-0 rounded-lg object-cover ring-1"
							/>
						{:else}
							<div
								class="preset-tonal-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
							>
								<IconUsers class="h-4 w-4 opacity-40" />
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-surface-900-100 truncate text-sm font-medium">{g.name}</span>
								{#if g.is_low_priority}
									<span
										class="bg-warning-500/20 text-warning-700-300 rounded px-1.5 py-0.5 text-[9px]"
										>LOW</span
									>
								{/if}
							</div>
							<div class="text-surface-600-400 text-xs">{g.city}, {g.state_region}</div>
						</div>
						<div class="flex shrink-0 flex-col items-end">
							<span class="text-xs font-bold {sortInfo.color}">{sortInfo.value}</span>
							<span class="text-surface-500 text-[10px] uppercase">{sortInfo.label}</span>
						</div>
					</div>
					<div class="mt-2 flex flex-wrap gap-1">
						{#each getContactItems(g).slice(0, 4) as c}
							<span
								class="bg-surface-200-800 text-surface-600-400 rounded px-1.5 py-0.5 text-[10px]"
								>{c.label}</span
							>
						{/each}
						{#if getContactItems(g).length > 4}
							<span
								class="bg-surface-200-800 text-surface-600-400 rounded px-1.5 py-0.5 text-[10px]"
								>+{getContactItems(g).length - 4}</span
							>
						{/if}
					</div>
				</button>
			{:else}
				<div class="card preset-tonal-surface p-8 text-center">
					<div
						class="w-12 h-12 mx-auto rounded-full bg-surface-200-800 flex items-center justify-center mb-2"
					>
						<IconSparkles class="h-6 w-6 text-surface-500" />
					</div>
					<p class="text-surface-700-300 text-sm font-medium">All caught up!</p>
				</div>
			{/each}
		</div>

		<!-- Detail Panel -->
		<div class="sticky top-4">
			{#if selectedGroup}
				<div
					class="card bg-surface-50-950 border-surface-200-800 overflow-hidden rounded-xl border"
				>
					{@render detailContent(selectedGroup)}
				</div>
			{:else}
				<div class="card preset-tonal-surface p-10 text-center">
					<div
						class="bg-surface-200-800 mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl"
					>
						<IconSend class="text-surface-500 h-8 w-8" />
					</div>
					<h3 class="h5 text-surface-700-300">Select a group</h3>
					<p class="text-surface-600-400 mt-1 text-sm">
						Choose a group to compose your outreach message.
					</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Mobile/Tablet Layout -->
	<div class="flex flex-col gap-2 lg:hidden">
		{#each groups as g (g.id)}
			{@const sortInfo = getSortValue(g)}
			<button
				type="button"
				class="group rounded-lg border p-3 text-left transition-all duration-150 {selectedGroupId ===
				g.id
					? 'bg-primary-500/10 border-primary-500/40'
					: 'bg-surface-50-950 border-surface-200-800'}"
				onclick={() => selectGroup(g)}
			>
				<div class="flex items-center gap-3">
					{#if g.logo_url}
						<img
							src={g.logo_url}
							alt=""
							class="ring-surface-500/20 h-10 w-10 shrink-0 rounded-lg object-cover ring-1"
						/>
					{:else}
						<div
							class="preset-tonal-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
						>
							<IconUsers class="h-5 w-5 opacity-40" />
						</div>
					{/if}
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="text-surface-900-100 truncate font-medium">{g.name}</span>
							{#if g.is_low_priority}
								<span
									class="bg-warning-500/20 text-warning-700-300 rounded px-1.5 py-0.5 text-[9px]"
									>LOW</span
								>
							{/if}
						</div>
						<div class="text-surface-600-400 text-sm">{g.city}, {g.state_region}</div>
					</div>
					<div class="flex shrink-0 flex-col items-end">
						<span class="text-sm font-bold {sortInfo.color}">{sortInfo.value}</span>
						<span class="text-surface-500 text-[10px] uppercase">{sortInfo.label}</span>
					</div>
				</div>
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each getContactItems(g) as c}
						<span class="bg-surface-200-800 text-surface-600-400 rounded px-2 py-0.5 text-xs"
							>{c.label}</span
						>
					{/each}
				</div>
			</button>
		{:else}
			<div class="card preset-tonal-surface p-8 text-center">
				<div
					class="w-12 h-12 mx-auto rounded-full bg-surface-200-800 flex items-center justify-center mb-2"
				>
					<IconSparkles class="h-6 w-6 text-surface-500" />
				</div>
				<p class="text-surface-700-300 text-sm font-medium">All caught up!</p>
			</div>
		{/each}
	</div>

	<!-- Mobile Detail Sheet -->
	{#if selectedGroupId && selectedGroup}
		<div class="fixed inset-0 z-50 lg:hidden" transition:fade={{ duration: 150 }}>
			<button
				type="button"
				class="bg-surface-950/60 absolute inset-0 backdrop-blur-sm"
				aria-label="Close outreach panel"
				onclick={() => (selectedGroupId = null)}
			></button>
			<div
				class="bg-surface-50-950 absolute inset-x-0 top-12 bottom-0 flex flex-col overflow-hidden rounded-t-2xl"
				transition:slide={{ duration: 200 }}
			>
				<div
					class="border-surface-200-800 flex shrink-0 items-center justify-between border-b px-4 py-2"
				>
					<button
						type="button"
						class="btn btn-sm preset-tonal-surface"
						onclick={() => (selectedGroupId = null)}
					>
						<IconChevronLeft class="h-4 w-4" /> Back
					</button>
					<span class="text-surface-500 text-xs font-medium">Outreach</span>
					<div class="w-16"></div>
				</div>
				<div class="flex-1 overflow-y-auto">
					{@render detailContent(selectedGroup)}
				</div>
			</div>
		</div>
	{/if}
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

	<!-- Group Header -->
	<div class="border-surface-200-800 border-b p-4">
		<div class="flex items-center gap-3">
			{#if group.logo_url}
				<img
					src={group.logo_url}
					alt=""
					class="ring-surface-500/20 h-12 w-12 shrink-0 rounded-xl object-cover ring-1"
				/>
			{:else}
				<div
					class="preset-tonal-surface flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
				>
					<IconUsers class="h-6 w-6 opacity-40" />
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h2 class="h5 truncate">{group.name}</h2>
					<a
						href="/groups/{group.slug}"
						target="_blank"
						class="text-surface-500 hover:text-primary-500 shrink-0 transition-colors"
						onclick={(event) => event.stopPropagation()}
					>
						<IconExternalLink class="h-4 w-4" />
					</a>
				</div>
				<p class="text-surface-600-400 text-sm">{group.city}, {group.state_region}</p>
			</div>
		</div>
	</div>

	<!-- Primary: Message Composer -->
	<div class="space-y-3 p-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<IconSend class="text-primary-500 h-4 w-4" />
				<span class="text-sm font-medium">Compose Message</span>
			</div>
			{#if generating}
				<span class="loading loading-spinner loading-sm text-primary-500"></span>
			{/if}
		</div>

		{#if group.public_contact_email}
			<form
				method="POST"
				action="?/sendMessage"
				use:enhance={enhanceWithFlag((v) => (sending = v))}
				class="space-y-3"
			>
				<input type="hidden" name="group_id" value={group.id} />
				<div>
					<label class="label text-surface-500 mb-1 text-xs" for={`subject-${group.id}`}
						>Subject</label
					>
					<input
						id={`subject-${group.id}`}
						type="text"
						name="subject"
						class="input preset-tonal-surface"
						value={getSubject(group)}
						oninput={(e) => setSubject(group.id, e.currentTarget.value)}
					/>
				</div>
				<div class="relative">
					<label class="label text-surface-500 mb-1 text-xs" for={`message-${group.id}`}
						>Message</label
					>
					<textarea
						id={`message-${group.id}`}
						name="content"
						class="textarea preset-tonal-surface min-h-44 w-full text-sm leading-relaxed"
						value={getMessage(group)}
						oninput={(e) => setMessage(group.id, e.currentTarget.value)}
						disabled={generating}
					></textarea>
					{#if generating}
						<div
							class="bg-surface-100-900/80 absolute inset-0 flex items-center justify-center rounded-lg backdrop-blur-sm"
						>
							<div class="text-surface-600-400 flex items-center gap-2">
								<span class="loading loading-spinner loading-sm"></span>
								<span class="text-sm">Crafting...</span>
							</div>
						</div>
					{/if}
				</div>
				<div class="flex items-center gap-3">
					<button type="submit" class="btn preset-filled-primary-500" disabled={sending}>
						{#if sending}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<IconSend class="h-4 w-4" />
						{/if}
						{sending ? 'Sending...' : 'Send Email'}
					</button>
					{#if getEmailStatus(group.id)?.type === 'success'}
						<span class="text-success-600 flex items-center gap-1 text-sm">
							<IconAlertCircle class="h-4 w-4" />
							{getEmailStatus(group.id)?.message}
						</span>
					{:else if getEmailStatus(group.id)?.type === 'error'}
						<span class="text-error-600 flex items-center gap-1 text-sm">
							<IconAlertCircle class="h-4 w-4" />
							{getEmailStatus(group.id)?.message}
						</span>
					{/if}
				</div>
			</form>
		{:else}
			<div class="relative">
				<textarea
					id={`message-${group.id}`}
					class="textarea preset-tonal-surface min-h-44 w-full text-sm leading-relaxed"
					value={getMessage(group)}
					oninput={(e) => setMessage(group.id, e.currentTarget.value)}
					disabled={generating}
				></textarea>
				{#if generating}
					<div
						class="bg-surface-100-900/80 absolute inset-0 flex items-center justify-center rounded-lg backdrop-blur-sm"
					>
						<div class="text-surface-600-400 flex items-center gap-2">
							<span class="loading loading-spinner loading-sm"></span>
							<span class="text-sm">Crafting...</span>
						</div>
					</div>
				{/if}
			</div>
			<div class="text-warning-600 flex items-center gap-2 text-sm">
				<IconAlertCircle class="h-4 w-4" />
				<span>No public email. Use social DMs below.</span>
			</div>
		{/if}

		{#if hasSocials(group)}
			<div class="flex flex-wrap gap-2 pt-2">
				{#each Object.entries(group.social_links || {}).filter(([, url]) => Boolean(url) && !String(url).includes('instagram.com/p/')) as [platform, url]}
					<button
						type="button"
						class="btn btn-sm preset-tonal-surface"
						onclick={(event) => openProfileAndCopy(url, getMessage(group), event)}
					>
						Open {platform.replace(/_/g, ' ')}
					</button>
				{/each}
				<button
					type="button"
					class="btn btn-sm preset-tonal-secondary"
					onclick={() => copyText(getMessage(group))}
				>
					<IconCopy class="h-3.5 w-3.5" /> Copy
				</button>
			</div>
		{/if}
	</div>

	<!-- Collapsible: Actions -->
	<div class="border-surface-200-800 border-t">
		<div class="bg-surface-100-900/50 p-3">
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="btn btn-sm preset-tonal-surface"
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
					<button type="submit" class="btn btn-sm preset-tonal-secondary" disabled={enriching}>
						<IconWand2 class="h-3.5 w-3.5 {enriching ? 'animate-spin' : ''}" />
						{enriching ? 'Enriching...' : 'Enrich'}
					</button>
				</form>
				<form method="POST" action="?/toggleLowPriority" use:enhance class="contents">
					<input type="hidden" name="group_id" value={group.id} />
					<input type="hidden" name="value" value={group.is_low_priority ? 'false' : 'true'} />
					<button
						type="submit"
						class="btn btn-sm {group.is_low_priority
							? 'preset-outlined-warning-300-700'
							: 'preset-tonal-warning'}"
					>
						{group.is_low_priority ? 'Restore' : 'Low Priority'}
					</button>
				</form>
				{#if confirmDeleteFor === group.id}
					<div
						class="bg-error-500/10 border-error-500/30 mt-1 flex w-full items-center gap-2 rounded-lg border p-2"
						transition:slide
					>
						<IconAlertCircle class="text-error-500 h-4 w-4 shrink-0" />
						<span class="text-error-700-300 flex-1 text-xs">Delete permanently?</span>
						<form
							method="POST"
							action="?/deleteGroup"
							use:enhance={enhanceWithFlag((v) => (deletingGroup = v))}
						>
							<input type="hidden" name="group_id" value={group.id} />
							<button
								type="submit"
								class="btn btn-sm preset-filled-error-500"
								disabled={deletingGroup}
							>
								{deletingGroup ? '...' : 'Delete'}
							</button>
						</form>
						<button
							type="button"
							class="btn btn-sm preset-tonal-surface"
							onclick={() => (confirmDeleteFor = null)}>Cancel</button
						>
					</div>
				{:else}
					<button
						type="button"
						class="btn btn-sm preset-tonal-error"
						onclick={() => (confirmDeleteFor = group.id)}
					>
						<IconTrash2 class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Collapsible: Assets (compact) -->
	<div class="border-surface-200-800 border-t">
		<div class="p-3">
			<div class="flex items-center gap-4">
				<!-- Logo thumbnail -->
				<div class="flex items-center gap-2">
					<div
						class="ring-surface-500/20 bg-surface-100-900 h-10 w-10 overflow-hidden rounded-lg ring-1"
					>
						{#if group.logo_url}
							<img src={group.logo_url} alt="" class="h-full w-full object-cover" />
						{:else}
							<div class="flex h-full w-full items-center justify-center">
								<IconImageUp class="text-surface-400 h-4 w-4" />
							</div>
						{/if}
					</div>
					<button
						type="button"
						class="text-surface-500 hover:text-surface-900-100 text-xs transition-colors"
						onclick={() => openImageModal(group, 'logo')}
					>
						Edit
					</button>
				</div>
				<!-- Cover thumbnail -->
				<div class="flex items-center gap-2">
					<div
						class="ring-surface-500/20 bg-surface-100-900 h-10 w-16 overflow-hidden rounded-lg ring-1"
					>
						{#if group.cover_photo_url}
							<img src={group.cover_photo_url} alt="" class="h-full w-full object-cover" />
						{:else}
							<div class="flex h-full w-full items-center justify-center">
								<IconImageUp class="text-surface-400 h-4 w-4" />
							</div>
						{/if}
					</div>
					<button
						type="button"
						class="text-surface-500 hover:text-surface-900-100 text-xs transition-colors"
						onclick={() => openImageModal(group, 'cover')}
					>
						Edit
					</button>
				</div>
				<!-- Stats -->
				<div class="ml-auto flex items-center gap-4 text-xs">
					<div class="text-center">
						<div class="text-surface-500">Complete</div>
						<div
							class="font-bold {group.completeness >= 80
								? 'text-success-600'
								: group.completeness >= 50
									? 'text-warning-600'
									: 'text-error-600'}"
						>
							{group.completeness}%
						</div>
					</div>
					<div class="text-center">
						<div class="text-surface-500">Priority</div>
						<div class="text-tertiary-600 font-bold">{group.priority_score}</div>
					</div>
					<div class="text-center">
						<div class="text-surface-500">Contacts</div>
						<div class="text-surface-900-100 font-bold">{group.contacts_count}</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/snippet}

{#if imageModalOpen}
	<div
		class="bg-surface-950/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="card bg-surface-50-950 border-surface-200-800 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl"
			transition:slide={{ duration: 200 }}
		>
			<!-- Header -->
			<div
				class="border-surface-200-800 flex shrink-0 items-center justify-between border-b px-5 py-4"
			>
				<div class="flex items-center gap-2">
					<IconImageUp class="text-primary-500 h-5 w-5" />
					<h3 class="h5">Edit {imageEditTarget === 'logo' ? 'Logo' : 'Cover'}</h3>
				</div>
				<button
					type="button"
					class="btn-icon preset-tonal-surface"
					onclick={() => (imageModalOpen = false)}
				>
					<IconX class="h-5 w-5" />
				</button>
			</div>

			<!-- Preview (Hero) -->
			<div
				class="bg-surface-100-900 border-surface-200-800 relative shrink-0 overflow-hidden border-b"
			>
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
							class="text-surface-500 absolute inset-0 flex flex-col items-center justify-center gap-2"
						>
							<IconImageUp class="h-10 w-10 opacity-40" />
							<span class="text-sm">Add an image to start</span>
						</div>
					{/if}
				</div>
				{#if imagePreviewSrc}
					<div
						class="bg-surface-950/60 text-surface-100 absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs backdrop-blur-sm"
					>
						Drag to reposition
					</div>
				{/if}
			</div>

			<!-- Controls -->
			<div class="space-y-4 overflow-y-auto p-5">
				<!-- Zoom -->
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<label
							class="text-surface-600-400 text-xs font-medium tracking-wider uppercase"
							for="crop-zoom">Zoom</label
						>
						<span class="text-surface-500 text-xs">{Math.round(cropScale * 100)}%</span>
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

				<!-- Source Tabs -->
				<div class="bg-surface-100-900 grid grid-cols-2 gap-2 rounded-xl p-1">
					<button
						type="button"
						class="rounded-lg px-3 py-2 text-sm font-medium transition-all {imageUrlDraft
							? 'bg-surface-50-950 shadow-sm'
							: 'text-surface-500 hover:text-surface-900-100'}"
						onclick={() => {
							imageUrlDraft = imagePreviewSrc || '';
						}}
					>
						URL
					</button>
					<label
						class="cursor-pointer rounded-lg px-3 py-2 text-center text-sm font-medium transition-all {imagePreviewSrc &&
						!imageUrlDraft
							? 'bg-surface-50-950 shadow-sm'
							: 'text-surface-500 hover:text-surface-900-100'}"
					>
						Upload
						<input type="file" accept="image/*" class="hidden" onchange={onImageFileSelected} />
					</label>
				</div>

				<!-- URL Input -->
				<div class="flex gap-2">
					<input
						type="text"
						class="input preset-tonal-surface flex-1"
						bind:value={imageUrlDraft}
						placeholder="https://example.com/image.jpg"
						onkeydown={(e) => e.key === 'Enter' && applyUrlPreview()}
					/>
					<button type="button" class="btn preset-tonal-surface" onclick={applyUrlPreview}>
						Load
					</button>
				</div>
			</div>

			<!-- Footer -->
			<div class="border-surface-200-800 bg-surface-100-900/50 shrink-0 border-t px-5 py-4">
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
						class="btn preset-tonal-surface"
						onclick={() => (imageModalOpen = false)}>Cancel</button
					>
					<button
						type="button"
						class="btn preset-filled-primary-500"
						disabled={savingAssets || !imagePreviewSrc}
						onclick={prepareCroppedAndSubmit}
					>
						{#if savingAssets}<span class="loading loading-spinner loading-xs"></span>{/if}
						{savingAssets ? 'Saving...' : 'Save'}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
