<script>
	import { enhance } from '$app/forms';
	import { formatDistanceToNow } from 'date-fns';
	import { fade } from 'svelte/transition';
	import IconUsers from '@lucide/svelte/icons/users';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconFilter from '@lucide/svelte/icons/filter';
	import IconArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import IconSparkles from '@lucide/svelte/icons/sparkles';
	import IconSearch from '@lucide/svelte/icons/search';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import IconMessageSquare from '@lucide/svelte/icons/message-square';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconTriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import IconTrash2 from '@lucide/svelte/icons/trash-2';
	import IconImageUp from '@lucide/svelte/icons/image-up';

	let { data, form } = $props();
	let removedGroupIds = $state(new Set());
	const groups = $derived((data.groups || []).filter((group) => !removedGroupIds.has(group.id)));
	const total = $derived(groups.length);

	let selectedGroupId = $state(null);
	let copiedGroupId = $state(null);
	let contactsExpanded = $state(new Set());
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

	function getCompletenessTextClass(score) {
		if (score >= 80) return 'text-success-700-300';
		if (score >= 50) return 'text-warning-700-300';
		return 'text-error-700-300';
	}

	function selectGroup(group) {
		selectedGroupId = group.id;
		emailStatusByGroup = { ...emailStatusByGroup, [group.id]: null };
		generating = true;
		queueMicrotask(() => {
			generateFormEl?.requestSubmit?.();
		});
	}

	function hasSocials(group) {
		return Object.values(group.social_links || {}).some(Boolean);
	}

	function getContactItems(group) {
		const items = [];
		if (group.public_contact_email) items.push({ key: 'email', label: 'Email', url: `mailto:${group.public_contact_email}` });
		for (const [platform, url] of Object.entries(group.social_links || {})) {
			if (!url) continue;
			items.push({ key: platform, label: platform, url });
		}
		return items;
	}

	function getVisibleContacts(group) {
		const all = getContactItems(group);
		if (contactsExpanded.has(group.id) || all.length <= 2) return all;
		return all.slice(0, 2);
	}

	function getHiddenContactsCount(group) {
		return Math.max(0, getContactItems(group).length - 2);
	}

	function toggleContacts(groupId, event) {
		event?.stopPropagation?.();
		if (contactsExpanded.has(groupId)) contactsExpanded.delete(groupId);
		else contactsExpanded.add(groupId);
		contactsExpanded = new Set(contactsExpanded);
	}

	async function copyClaimLink(group, event) {
		event?.stopPropagation?.();
		await navigator.clipboard.writeText(group.claim_url);
		copiedGroupId = group.id;
		setTimeout(() => {
			if (copiedGroupId === group.id) copiedGroupId = null;
		}, 1400);
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
		reader.onload = () => {
			imagePreviewSrc = String(reader.result || '');
		};
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
		cropDragStart = {
			pointerX: event.clientX,
			pointerY: event.clientY,
			cropX,
			cropY
		};
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
</script>

<svelte:head>
	<title>Unclaimed Groups | Admin</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:py-8">
	<header class="flex flex-col gap-2">
		<h1 class="h2 flex items-center gap-2"><IconSparkles class="h-6 w-6" />Unclaimed Groups</h1>
		<p class="text-surface-700-300 flex items-center gap-2 text-sm"><IconUsers class="h-4 w-4" />{total} groups waiting for outreach</p>
	</header>

	<form method="GET" class="card preset-tonal-surface grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-5" transition:fade>
		<div class="relative min-w-[220px] xl:col-span-2"><IconSearch class="text-surface-700-300 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" /><input type="search" name="q" value={data.q || ''} placeholder="Search name, city, state, slug..." class="input preset-tonal-surface pl-9" /></div>
		<div class="relative"><IconFilter class="text-surface-700-300 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" /><select name="contact" class="select preset-tonal-surface pl-9" value={data.contact || 'all'}><option value="all">Any Contact Type</option><option value="email">Has Email</option><option value="social">Has Social</option><option value="none">No Contacts</option></select></div>
		<div class="relative"><IconFilter class="text-surface-700-300 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" /><select name="min_completeness" class="select preset-tonal-surface pl-9" value={String(data.minCompleteness || 0)}><option value="0">Any Completeness</option><option value="40">40%+ Complete</option><option value="60">60%+ Complete</option><option value="80">80%+ Complete</option></select></div>
		<div class="flex items-center gap-2"><div class="relative min-w-0 flex-1"><IconArrowUpDown class="text-surface-700-300 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" /><select name="sort" class="select preset-tonal-surface pl-9" value={data.sort || 'priority'}><option value="priority">Outreach Priority</option><option value="completeness">Most Complete</option><option value="newest">Newest First</option><option value="stale">Stalest Contact First</option></select></div><button type="submit" class="btn btn-sm preset-filled-primary-500">Apply</button></div>
	</form>

	<div class="card preset-outlined-surface-300-700 overflow-hidden" transition:fade>
		<div class="overflow-x-auto">
			<table class="table w-full text-sm">
				<thead class="bg-surface-100-900"><tr><th class="text-surface-700-300 px-4 py-3 text-left text-xs font-bold uppercase">Group</th><th class="text-surface-700-300 px-4 py-3 text-center text-xs font-bold uppercase">Profile</th><th class="text-surface-700-300 px-4 py-3 text-center text-xs font-bold uppercase">Priority</th><th class="text-surface-700-300 px-4 py-3 text-left text-xs font-bold uppercase">Contacts</th><th class="text-surface-700-300 px-4 py-3 text-left text-xs font-bold uppercase">Last Contact</th></tr></thead>
				<tbody class="divide-surface-200-800 divide-y">
					{#each groups as g (g.id)}
						<tr class="cursor-pointer transition-colors hover:preset-tonal-surface {selectedGroupId === g.id ? 'preset-tonal-surface' : ''}" onclick={() => selectGroup(g)}>
							<td class="px-4 py-3"><div class="flex flex-col"><div class="flex items-center gap-2">{#if g.logo_url}<img src={g.logo_url} alt="{g.name} logo" class="h-7 w-7 rounded-full object-cover ring-1 ring-surface-500/30" />{/if}<span class="font-bold">{g.name}</span><a href="/groups/{g.slug}" target="_blank" class="text-surface-700-300 hover:text-primary-700-300" onclick={(event) => event.stopPropagation()}><IconExternalLink class="h-3 w-3" /></a><button type="button" class="btn btn-sm preset-tonal-primary ml-1" onclick={(event) => { event.stopPropagation(); selectGroup(g); }}><IconMessageSquare class="h-3 w-3" />Contact</button></div><span class="text-surface-700-300 text-xs">{g.city}, {g.state_region}</span></div></td>
							<td class="px-4 py-3"><div class="flex flex-col items-center gap-1"><span class="{getCompletenessTextClass(g.completeness)} font-bold">{g.completeness}%</span><progress class="progress w-20" value={g.completeness} max="100"></progress></div></td>
							<td class="px-4 py-3 text-center"><span class="text-surface-900-100 text-sm font-bold">{g.priority_score}</span></td>
							<td class="px-4 py-3"><div class="flex flex-wrap items-center gap-1">{#each getVisibleContacts(g) as c}<a href={c.url} target={c.key === 'email' ? undefined : '_blank'} class="badge preset-tonal-surface text-xs" onclick={(event) => event.stopPropagation()}>{c.label}</a>{/each}{#if getHiddenContactsCount(g) > 0}<button type="button" class="badge preset-tonal-primary text-xs" onclick={(event) => toggleContacts(g.id, event)}>+{getHiddenContactsCount(g)}<IconChevronDown class="h-3 w-3" /></button>{/if}</div></td>
							<td class="px-4 py-3">{#if g.last_contact}<span class="text-sm">{formatDistanceToNow(new Date(g.last_contact.contacted_at), { addSuffix: true })}</span><p class="text-surface-700-300 text-xs">{g.last_contact.contact_method}</p>{:else}<span class="text-surface-700-300 text-sm">Never</span>{/if}</td>
						</tr>
						{#if selectedGroupId === g.id}
							<tr class="bg-surface-100-900/35" in:fade>
								<td colspan="5" class="px-4 py-4">
									<div class="grid gap-4 xl:grid-cols-[1.1fr_1.1fr]">
										<div class="space-y-3">
											<form bind:this={generateFormEl} method="POST" action="?/generate" use:enhance={enhanceWithFlag((v) => (generating = v))} class="hidden">
												<input type="hidden" name="group_id" value={g.id} />
											</form>
											<div class="flex flex-wrap items-center gap-2">
												<h2 class="h5">{g.name}</h2>
												<button type="button" class="btn btn-sm preset-tonal-surface" onclick={(event) => copyClaimLink(g, event)}><IconCopy class="h-3 w-3" />{copiedGroupId === g.id ? 'Copied' : 'Copy Claim URL'}</button>
												<form method="POST" action="?/enrich" use:enhance={enhanceWithFlag((v) => (enriching = v))}><input type="hidden" name="group_id" value={g.id} /><button type="submit" class="btn btn-sm preset-tonal-secondary" disabled={enriching}>{#if enriching}<span class="loading loading-spinner loading-xs"></span>{/if}<IconRefreshCw class="h-3 w-3 {enriching ? 'animate-spin' : ''}" />{enriching ? 'Enriching...' : 'Deep Enrich'}</button></form>
												<form method="POST" action="?/toggleLowPriority" use:enhance><input type="hidden" name="group_id" value={g.id} /><input type="hidden" name="value" value={g.is_low_priority ? 'false' : 'true'} /><button type="submit" class="btn btn-sm {g.is_low_priority ? 'preset-outlined-warning-300-700' : 'preset-tonal-warning'}">{g.is_low_priority ? 'Restore Priority' : 'Mark Low Priority'}</button></form>
											</div>
											<div class="grid gap-2 sm:grid-cols-2"><div class="card preset-tonal-surface p-2"><div class="text-surface-700-300 mb-1 text-[10px] font-bold uppercase">Logo</div>{#if g.logo_url}<img src={g.logo_url} alt="{g.name} logo" class="h-16 w-16 rounded-lg object-cover ring-1 ring-surface-500/30" />{/if}<button type="button" class="btn btn-sm preset-tonal-surface mt-2" onclick={() => openImageModal(g, 'logo')}><IconImageUp class="h-3 w-3" />Edit Logo</button></div><div class="card preset-tonal-surface p-2"><div class="text-surface-700-300 mb-1 text-[10px] font-bold uppercase">Cover</div>{#if g.cover_photo_url}<img src={g.cover_photo_url} alt="{g.name} cover" class="h-16 w-full rounded-lg object-cover ring-1 ring-surface-500/30" />{/if}<button type="button" class="btn btn-sm preset-tonal-surface mt-2" onclick={() => openImageModal(g, 'cover')}><IconImageUp class="h-3 w-3" />Edit Cover</button></div></div>
											{#if confirmDeleteFor === g.id}
												<div class="card preset-outlined-error-300-700 p-3" in:fade><p class="text-error-700-300 mb-2 flex items-center gap-2 text-sm font-bold"><IconTriangleAlert class="h-4 w-4" />Delete this group permanently?</p><div class="flex items-center gap-2"><form method="POST" action="?/deleteGroup" use:enhance={enhanceWithFlag((v) => (deletingGroup = v))}><input type="hidden" name="group_id" value={g.id} /><button type="submit" class="btn btn-sm preset-filled-error-500" disabled={deletingGroup}>{#if deletingGroup}<span class="loading loading-spinner loading-xs"></span>{/if}{deletingGroup ? 'Deleting...' : 'Yes, Delete Group'}</button></form><button type="button" class="btn btn-sm preset-tonal-surface" onclick={() => (confirmDeleteFor = null)}>Cancel</button></div></div>
											{:else}
												<button type="button" class="btn btn-sm preset-tonal-error" onclick={() => (confirmDeleteFor = g.id)}><IconTrash2 class="h-3 w-3" />Delete Group</button>
											{/if}
										</div>
										<div class="space-y-3">
											<div class="card preset-tonal-surface p-3">
												<div class="mb-2 flex items-center justify-between gap-2">
													<p class="text-surface-700-300 text-xs font-bold uppercase">Message</p>
													{#if generating && selectedGroupId === g.id}
														<span class="loading loading-spinner loading-sm"></span>
													{/if}
												</div>
												{#if g.public_contact_email}
													<form method="POST" action="?/sendMessage" use:enhance={enhanceWithFlag((v) => (sending = v))} class="space-y-2">
														<input type="hidden" name="group_id" value={g.id} />
														<label class="label" for={`subject-${g.id}`}>Subject</label>
														<input
															id={`subject-${g.id}`}
															type="text"
															name="subject"
															class="input preset-tonal-surface"
															value={getSubject(g)}
															oninput={(e) => setSubject(g.id, e.currentTarget.value)}
															placeholder="Email subject"
														/>
														<label class="label" for={`message-${g.id}`}>Message</label>
														<div class="relative">
															<textarea
																id={`message-${g.id}`}
																name="content"
																class="textarea preset-tonal-surface min-h-56 w-full"
																value={getMessage(g)}
																oninput={(e) => setMessage(g.id, e.currentTarget.value)}
																placeholder={generating && selectedGroupId === g.id ? 'Generating a fresh message...' : 'Outreach message...'}
																disabled={generating && selectedGroupId === g.id}
															></textarea>
															{#if generating && selectedGroupId === g.id}
																<div class="bg-surface-100-900/70 absolute inset-0 grid place-items-center rounded-lg">
																	<div class="flex flex-col items-center gap-2">
																		<span class="loading loading-spinner loading-md"></span>
																		<p class="text-surface-700-300 text-xs">Crafting a fresh outreach note...</p>
																	</div>
																</div>
															{/if}
														</div>
														<button type="submit" class="btn btn-sm preset-filled-primary-500" disabled={sending}>
															{#if sending}<span class="loading loading-spinner loading-xs"></span>{/if}
															{sending ? 'Sending...' : 'Send Email Now'}
														</button>
														{#if getEmailStatus(g.id)?.type === 'error'}
															<p class="text-error-700-300 text-xs">{getEmailStatus(g.id)?.message}</p>
														{/if}
														{#if getEmailStatus(g.id)?.type === 'success'}
															<p class="text-success-700-300 text-xs">{getEmailStatus(g.id)?.message}</p>
														{/if}
													</form>
												{:else}
													<div class="relative">
														<textarea
															id={`message-${g.id}`}
															class="textarea preset-tonal-surface min-h-56 w-full"
															value={getMessage(g)}
															oninput={(e) => setMessage(g.id, e.currentTarget.value)}
															placeholder={generating && selectedGroupId === g.id ? 'Generating a fresh message...' : 'Outreach message...'}
															disabled={generating && selectedGroupId === g.id}
														></textarea>
														{#if generating && selectedGroupId === g.id}
															<div class="bg-surface-100-900/70 absolute inset-0 grid place-items-center rounded-lg">
																<div class="flex flex-col items-center gap-2">
																	<span class="loading loading-spinner loading-md"></span>
																	<p class="text-surface-700-300 text-xs">Crafting a fresh outreach note...</p>
																</div>
															</div>
														{/if}
													</div>
												{/if}
											</div>
											{#if hasSocials(g)}
												<div class="card preset-tonal-surface p-3">
													<p class="text-surface-700-300 mb-2 text-xs font-bold uppercase">Manual Social DM Shortcuts</p>
													<div class="flex flex-wrap gap-2">
														{#each Object.entries(g.social_links || {}).filter(([, url]) => Boolean(url) && !String(url).includes('instagram.com/p/')) as [platform, url]}
															<button
																type="button"
																class="btn btn-sm preset-tonal-surface"
																onclick={(event) => openProfileAndCopy(url, getMessage(g), event)}
															>
																Open {platform.replace(/_/g, ' ')}
															</button>
														{/each}
														<button type="button" class="btn btn-sm preset-tonal-secondary" onclick={() => copyText(getMessage(g))}>Copy Message</button>
													</div>
													<p class="text-surface-700-300 mt-2 text-[11px]">
														Opening a profile automatically copies the current message draft to your clipboard.
													</p>
												</div>
											{/if}
										</div>
									</div>
								</td>
							</tr>
						{/if}
					{:else}
						<tr><td colspan="5" class="px-4 py-8 text-center"><IconUsers class="mx-auto h-8 w-8 opacity-20" /><p class="text-surface-700-300 mt-2">All caught up!</p><p class="text-surface-700-300 text-sm">No unclaimed groups match your filters.</p></td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if imageModalOpen}
		<div class="bg-surface-900/70 fixed inset-0 z-50 grid place-items-center p-4" in:fade>
			<div class="card preset-tonal-surface w-full max-w-3xl space-y-3 p-4">
				<div class="flex items-center justify-between"><h3 class="h5">Edit {imageEditTarget === 'logo' ? 'Logo' : 'Cover Photo'}</h3><button type="button" class="btn btn-sm preset-tonal-surface" onclick={() => (imageModalOpen = false)}>Close</button></div>
				<div class="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
					<div class="space-y-2">
						<label class="label" for="image-url">Image URL</label>
						<input id="image-url" class="input preset-tonal-surface" bind:value={imageUrlDraft} placeholder="https://..." />
						<button type="button" class="btn btn-sm preset-tonal-surface" onclick={applyUrlPreview}>Load URL</button>
						<label class="label" for="image-file">Upload file</label>
						<input id="image-file" type="file" accept="image/*" class="file-input" onchange={onImageFileSelected} />
						<label class="label" for="crop-zoom">Zoom</label>
						<input id="crop-zoom" type="range" min="1" max="2.5" step="0.01" bind:value={cropScale} />
						<p class="text-surface-700-300 text-xs">Drag the image in the preview to reposition it.</p>
					</div>
					<div
						class="bg-surface-300-700 relative overflow-hidden rounded-lg touch-none select-none"
						style={`aspect-ratio:${imageEditTarget === 'logo' ? '1/1' : '16/9'}`}
						role="group"
						aria-label="Image crop preview. Drag the image to reposition it."
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
								style={`position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) translate(${cropX}px, ${cropY}px) scale(${getCropFitScale() * cropScale});max-width:none;max-height:none;width:auto;height:auto;cursor:${draggingCrop ? 'grabbing' : 'grab'};user-select:none;touch-action:none;`}
							/>
						{:else}
							<div class="text-surface-700-300 grid h-full place-items-center text-sm">Add a URL or upload an image</div>
						{/if}
					</div>
				</div>
				<form bind:this={imageFormEl} method="POST" action="?/updateAssets" use:enhance={enhanceWithFlag((v) => (savingAssets = v))} class="flex items-center gap-2"><input type="hidden" name="group_id" value={imageEditGroupId} />{#if imageEditTarget === 'logo'}<input type="hidden" name="logo_file_cropped" value={logoCroppedDataUrl} /><input type="hidden" name="logo_url" value={imageUrlDraft} />{:else}<input type="hidden" name="cover_file_cropped" value={coverCroppedDataUrl} /><input type="hidden" name="cover_photo_url" value={imageUrlDraft} />{/if}<button type="button" class="btn btn-sm preset-filled-primary-500" disabled={savingAssets} onclick={prepareCroppedAndSubmit}>{#if savingAssets}<span class="loading loading-spinner loading-xs"></span>{/if}{savingAssets ? 'Saving...' : 'Save Image'}</button></form>
			</div>
		</div>
	{/if}
</div>
