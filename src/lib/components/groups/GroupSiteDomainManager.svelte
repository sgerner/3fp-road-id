<script>
	import { onDestroy, onMount } from 'svelte';
	import IconBadgeCheck from '@lucide/svelte/icons/badge-check';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconExternalLink from '@lucide/svelte/icons/external-link';
	import IconGlobe from '@lucide/svelte/icons/globe-2';
	import IconRefresh from '@lucide/svelte/icons/refresh-cw';
	import IconTrash from '@lucide/svelte/icons/trash-2';
	import DomainPurchasePanel from '$lib/components/groups/DomainPurchasePanel.svelte';

	let { group, slug = $bindable(''), currentSlug = '', liveUrl = '' } = $props();
	let availability = $state({
		state: 'current',
		label: 'Current',
		message: 'This is your included address.'
	});
	let domains = $state([]);
	let loading = $state(false);
	let existingDomain = $state('');
	let verifying = $state('');
	let renewalBusy = $state('');
	let deleting = $state('');
	let notice = $state('');
	let error = $state('');
	let copied = $state('');
	let copyTimer;

	const normalizedSlug = $derived(normalizeSlug(slug));
	const includedUrl = $derived(String(liveUrl || normalizedSlug || 'yourgroup').replace(/\/$/, ''));

	function normalizeSlug(value) {
		return String(value || '')
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]/g, '')
			.slice(0, 40);
	}

	function handleSlugInput(event) {
		slug = normalizeSlug(event.currentTarget.value);
	}

	$effect(() => {
		const next = normalizedSlug;
		if (!next) {
			availability = {
				state: 'error',
				label: 'Required',
				message: 'Use letters and numbers only.'
			};
			return;
		}
		if (next === currentSlug) {
			availability = {
				state: 'current',
				label: 'Current',
				message: 'This is your included address.'
			};
			return;
		}
		availability = { state: 'checking', label: 'Checking', message: 'Checking availability…' };
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(
					`/api/groups/check-microsite-slug?slug=${encodeURIComponent(next)}&current_group_id=${encodeURIComponent(group.id)}`,
					{ signal: controller.signal }
				);
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) throw new Error('Unable to check this address.');
				availability = payload.available
					? {
							state: 'available',
							label: payload.reason === 'current' ? 'Current' : 'Available',
							message:
								payload.reason === 'current'
									? 'This is your included address.'
									: 'Available. Publish to claim it.'
						}
					: {
							state: 'taken',
							label: payload.reason === 'reserved' ? 'Reserved' : 'Taken',
							message:
								payload.reason === 'reserved'
									? 'That address is reserved by the app.'
									: 'Another group already uses that address.'
						};
			} catch (cause) {
				if (cause?.name !== 'AbortError') {
					availability = {
						state: 'error',
						label: 'Try again',
						message: cause?.message || 'Unable to check this address.'
					};
				}
			}
		}, 250);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	async function request(path, options = {}) {
		const response = await fetch(path, options);
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload?.error || 'Request failed.');
		return payload?.data;
	}

	async function loadDomains() {
		loading = true;
		error = '';
		try {
			const data = await request(`/api/groups/${encodeURIComponent(group.slug)}/domains`);
			domains = Array.isArray(data?.domains) ? data.domains : [];
		} catch (cause) {
			error = cause?.message || 'Unable to load domains.';
		} finally {
			loading = false;
		}
	}

	async function attachDomain() {
		notice = '';
		error = '';
		if (!existingDomain.trim()) {
			error = 'Enter the domain you already own.';
			return;
		}
		try {
			loading = true;
			const data = await request(`/api/groups/${encodeURIComponent(group.slug)}/domains`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ domain: existingDomain })
			});
			existingDomain = '';
			notice =
				Array.isArray(data?.instructions?.records) && data.instructions.records.length
					? 'Domain connected. Add the DNS records below, then verify.'
					: data?.instructions?.title || 'Domain connected.';
			await loadDomains();
		} catch (cause) {
			error = cause?.message || 'Unable to connect this domain.';
		} finally {
			loading = false;
		}
	}

	async function verifyDomain(domain) {
		notice = '';
		error = '';
		try {
			verifying = domain;
			const data = await request(
				`/api/groups/${encodeURIComponent(group.slug)}/domains/${encodeURIComponent(domain)}/verify`,
				{ method: 'POST' }
			);
			notice =
				data?.domain?.status === 'active'
					? `${domain} is verified and active.`
					: `${domain} is not active yet. Check the DNS steps and try again.`;
			await loadDomains();
		} catch (cause) {
			error = cause?.message || 'Unable to verify this domain.';
		} finally {
			verifying = '';
		}
	}

	async function toggleRenewal(domain, autoRenew) {
		notice = '';
		error = '';
		try {
			renewalBusy = domain;
			await request(
				`/api/groups/${encodeURIComponent(group.slug)}/domains/${encodeURIComponent(domain)}/renewal`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ autoRenew })
				}
			);
			notice = autoRenew ? `Auto-renew enabled for ${domain}.` : `Auto-renew paused for ${domain}.`;
			await loadDomains();
		} catch (cause) {
			error = cause?.message || 'Unable to update renewal.';
		} finally {
			renewalBusy = '';
		}
	}

	async function removeDomain(domain) {
		if (!confirm(`Remove ${domain} from this website?`)) return;
		notice = '';
		error = '';
		try {
			deleting = domain;
			await request(
				`/api/groups/${encodeURIComponent(group.slug)}/domains/${encodeURIComponent(domain)}`,
				{ method: 'DELETE' }
			);
			notice = `${domain} was removed.`;
			await loadDomains();
		} catch (cause) {
			error = cause?.message || 'Unable to remove this domain.';
		} finally {
			deleting = '';
		}
	}

	const asText = (value) => String(value ?? '').trim();
	const asArray = (value) => (Array.isArray(value) ? value : []);
	const trimDot = (value) => asText(value).replace(/\.$/, '');

	function displayHost(host, domain) {
		const cleanHost = trimDot(host).toLowerCase();
		const cleanDomain = trimDot(domain).toLowerCase();
		if (cleanHost === cleanDomain) return '@';
		return cleanHost.endsWith(`.${cleanDomain}`)
			? cleanHost.slice(0, -(cleanDomain.length + 1))
			: trimDot(host);
	}

	function dnsRecords(row) {
		const domain = asText(row?.domain).toLowerCase();
		if (!domain || row?.status === 'active') return [];
		const records = [];
		const seen = new Set();
		const add = (type, name, value, reason = '') => {
			const next = {
				type: asText(type).toUpperCase() || 'TXT',
				host: displayHost(name || domain, domain),
				value: trimDot(value),
				reason: asText(reason)
			};
			const key = `${next.type}|${next.host}|${next.value}`;
			if (!next.value || seen.has(key)) return;
			seen.add(key);
			records.push(next);
		};
		for (const record of asArray(row?.verification)) {
			add(record?.type || 'TXT', record?.domain || domain, record?.value, record?.reason);
		}
		const config = row?.dns_config || {};
		const ipv4 = asArray(config?.recommendedIPv4).sort(
			(left, right) => Number(left?.rank || 999) - Number(right?.rank || 999)
		)[0]?.value?.[0];
		const cname = asArray(config?.recommendedCNAME).sort(
			(left, right) => Number(left?.rank || 999) - Number(right?.rank || 999)
		)[0]?.value;
		if (asText(config?.configuredBy).toUpperCase() === 'CNAME' && cname)
			add('CNAME', domain, cname, 'Routes this address to the website.');
		else if (ipv4) add('A', domain, ipv4, 'Routes this address to the website.');
		else if (cname) add('CNAME', domain, cname, 'Routes this address to the website.');
		return records;
	}

	async function copyValue(value, key) {
		try {
			await navigator.clipboard.writeText(value);
			copied = key;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = ''), 1300);
		} catch {
			error = 'Unable to copy that value.';
		}
	}

	onMount(loadDomains);
	onDestroy(() => clearTimeout(copyTimer));
</script>

<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)]">
	<div class="grid content-start gap-4">
		<div class="card preset-tonal-primary grid gap-4 p-4 sm:p-5">
			<div class="flex items-start justify-between gap-3">
				<div>
					<p class="text-xs font-semibold tracking-wide uppercase opacity-55">Included address</p>
					<h2 class="h4">Your website already has a home</h2>
					<p class="text-sm opacity-65">
						Keep this simple address forever, even if you add a custom domain.
					</p>
				</div>
				<IconGlobe class="h-7 w-7 shrink-0" />
			</div>
			<a
				class="btn preset-tonal-surface w-fit max-w-full"
				href={liveUrl || `/${normalizedSlug}`}
				target="_blank"
				rel="noreferrer"
				><span class="truncate">{includedUrl}</span><IconExternalLink class="h-4 w-4 shrink-0" /></a
			>
			<label class="label"
				><span>Change the included address</span>
				<div class="flex items-center gap-2">
					<input
						class="input min-w-0 flex-1"
						value={slug}
						oninput={handleSlugInput}
						maxlength="40"
						inputmode="url"
						autocomplete="off"
					/><span
						class="badge {availability.state === 'available' || availability.state === 'current'
							? 'preset-tonal-success'
							: availability.state === 'checking'
								? 'preset-tonal-warning'
								: 'preset-tonal-error'}">{availability.label}</span
					>
				</div>
				<span class="text-xs opacity-60">{availability.message}</span></label
			>
		</div>

		<div class="card preset-tonal-surface grid gap-4 p-4 sm:p-5">
			<div>
				<h2 class="h4">Connect a domain you own</h2>
				<p class="text-sm opacity-65">Enter the plain domain—no https:// or page path.</p>
			</div>
			<div class="flex gap-2">
				<input
					class="input min-w-0 flex-1"
					bind:value={existingDomain}
					placeholder="yourgroup.org"
					inputmode="url"
				/><button
					class="btn preset-filled-primary-500"
					type="button"
					onclick={attachDomain}
					disabled={loading}>Connect</button
				>
			</div>
			{#if notice}<div
					class="preset-tonal-success flex items-center gap-2 p-3 text-sm"
					role="status"
				>
					<IconCheck class="h-4 w-4 shrink-0" />
					{notice}
				</div>{/if}
			{#if error}<div class="preset-tonal-error flex items-center gap-2 p-3 text-sm" role="alert">
					<IconCircleAlert class="h-4 w-4 shrink-0" />
					{error}
				</div>{/if}
		</div>

		{#if loading && domains.length === 0}<div class="card preset-tonal-surface p-5 text-sm">
				Loading connected domains…
			</div>{/if}
		{#each domains as row}
			{@const records = dnsRecords(row)}
			<article class="card preset-tonal-surface grid gap-3 p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div class="flex flex-wrap items-center gap-2">
							<p class="font-semibold">{row.domain}</p>
							<span
								class="badge {row.status === 'active'
									? 'preset-tonal-success'
									: 'preset-tonal-warning'}">{row.status === 'active' ? 'Live' : 'DNS needed'}</span
							>{#if row.auto_renew}<span class="badge preset-tonal-surface">Auto-renew</span>{/if}
						</div>
						<p class="mt-1 text-xs opacity-60">
							{row.source === 'registered' ? 'Purchased here' : 'Connected domain'}
						</p>
					</div>
					<div class="flex gap-1">
						<button
							class="btn btn-sm preset-tonal-surface"
							type="button"
							onclick={() => verifyDomain(row.domain)}
							disabled={verifying === row.domain}
							><IconRefresh class="h-4 w-4 {verifying === row.domain ? 'animate-spin' : ''}" /> Verify</button
						><button
							class="btn btn-sm preset-tonal-surface"
							type="button"
							onclick={() => {
								if (
									row.auto_renew &&
									!confirm(
										`Pause automatic renewal for ${row.domain}? The domain may expire unless you renew it manually.`
									)
								)
									return;
								toggleRenewal(row.domain, !row.auto_renew);
							}}
							disabled={renewalBusy === row.domain}
							>{row.auto_renew ? 'Pause renewal' : 'Auto-renew'}</button
						><button
							class="btn btn-icon btn-sm preset-tonal-error"
							type="button"
							onclick={() => removeDomain(row.domain)}
							disabled={deleting === row.domain}
							aria-label={`Remove ${row.domain}`}><IconTrash class="h-4 w-4" /></button
						>
					</div>
				</div>
				{#if records.length}<details class="card preset-tonal-warning">
						<summary class="cursor-pointer p-3 text-sm font-semibold"
							>DNS steps ({records.length})</summary
						>
						<div class="grid gap-2 px-3 pb-3">
							{#each records as record}<div
									class="card preset-tonal-surface grid gap-2 p-3 text-xs sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center"
								>
									<span class="font-mono font-bold">{record.type}</span>
									<div class="min-w-0">
										<p class="font-mono">Name: {record.host}</p>
										<p class="break-all font-mono opacity-65">Value: {record.value}</p>
										{#if record.reason}<p class="mt-1 opacity-55">{record.reason}</p>{/if}
									</div>
									<div class="flex gap-1">
										<button
											class="btn btn-sm preset-tonal-surface"
											type="button"
											onclick={() => copyValue(record.host, `${record.type}-${record.host}-host`)}
											>{copied === `${record.type}-${record.host}-host`
												? 'Copied'
												: 'Copy name'}</button
										><button
											class="btn btn-sm preset-tonal-surface"
											type="button"
											onclick={() => copyValue(record.value, `${record.type}-${record.host}-value`)}
											>{#if copied === `${record.type}-${record.host}-value`}<IconCheck
													class="h-4 w-4"
												/>{:else}<IconCopy class="h-4 w-4" />{/if} Value</button
										>
									</div>
								</div>{/each}
						</div>
					</details>{/if}
			</article>
		{/each}
	</div>

	<aside class="grid content-start gap-4">
		<div class="card preset-tonal-secondary p-4">
			<div class="flex items-center gap-2">
				<IconBadgeCheck class="h-5 w-5" />
				<p class="font-semibold">Domain setup, translated</p>
			</div>
			<ol class="mt-3 grid gap-2 text-sm">
				<li>1. Connect the domain here.</li>
				<li>2. Copy the DNS records to your provider.</li>
				<li>3. Come back and click Verify.</li>
			</ol>
			<p class="mt-3 text-xs opacity-60">
				DNS updates can take a little while. Your included address stays live throughout.
			</p>
		</div>
		<details class="card preset-tonal-surface">
			<summary class="cursor-pointer p-4 font-semibold">Find and buy a domain</summary>
			<div class="preset-divider-top p-4">
				<DomainPurchasePanel
					groupSlug={group.slug}
					initialSearchQuery={currentSlug || group.slug || ''}
					defaultContact={{
						email: group.public_contact_email || group.contact_email || '',
						city: group.city || '',
						state: group.state_region || '',
						country: 'US'
					}}
					returnPath={`/groups/${group.slug}/manage/site?view=address&domain_payment=return`}
					title="Find a domain"
				/>
			</div>
		</details>
	</aside>
</div>
