<script>
	import { onDestroy } from 'svelte';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconCheck from '@lucide/svelte/icons/check';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import {
		DEFAULT_SIGNATURE_FORM,
		buildSignatureHtml,
		getAccentOptions,
		getLogoOptions
	} from '$lib/admin/signatureBuilder';

	let { data } = $props();

	let copied = $state(false);
	let copyTimer = null;
	let seededProfile = false;

	function buildInitialForm(profileData) {
		return {
			...DEFAULT_SIGNATURE_FORM,
			fullName: profileData.full_name || 'Your Name',
			email: profileData.email || ''
		};
	}

	function getProfileDefaults() {
		return buildInitialForm(data?.profile || {});
	}

	let form = $state({ ...DEFAULT_SIGNATURE_FORM });
	const accentOptions = getAccentOptions();
	const logoOptions = getLogoOptions();
	const generatedHtml = $derived.by(() => buildSignatureHtml(form));

	$effect(() => {
		if (seededProfile) return;
		form = { ...form, ...getProfileDefaults() };
		seededProfile = true;
	});

	function handlePhoneInput(event) {
		const nextValue = event.currentTarget.value;
		const wasEmpty = !String(form.phone || '').trim();
		const isNowFilled = Boolean(String(nextValue || '').trim());
		form.phone = nextValue;
		if (wasEmpty && isNowFilled) {
			form.showPhone = true;
		} else if (!isNowFilled) {
			form.showPhone = false;
		}
	}

	async function copyHtml() {
		if (!generatedHtml) return;
		await navigator.clipboard.writeText(generatedHtml);
		copied = true;
		if (copyTimer) window.clearTimeout(copyTimer);
		copyTimer = window.setTimeout(() => {
			copied = false;
			copyTimer = null;
		}, 1500);
	}

	function resetForm() {
		form = { ...DEFAULT_SIGNATURE_FORM, ...getProfileDefaults() };
		copied = false;
		if (copyTimer) {
			window.clearTimeout(copyTimer);
			copyTimer = null;
		}
	}

	onDestroy(() => {
		if (copyTimer) window.clearTimeout(copyTimer);
	});
</script>

<svelte:head>
	<title>Signature Builder | Admin</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
	<div
		class="overflow-hidden rounded-[2rem] border border-white/10 bg-surface-950/70 shadow-2xl shadow-black/20"
	>
		<div
			class="border-b border-white/10 bg-gradient-to-br from-surface-950 via-surface-900 to-primary-950/40 px-6 py-6 md:px-8"
		>
			<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div class="space-y-2">
					<h1 class="h1 text-4xl md:text-5xl">Signature Builder</h1>
				</div>

				<div class="flex flex-wrap gap-3">
					<button class="btn btn-sm preset-tonal-surface gap-2" type="button" onclick={resetForm}>
						<IconRefreshCw class="size-4" />
						Reset
					</button>
				</div>
			</div>
		</div>

		<div class="grid gap-6 px-6 py-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
			<section class="space-y-4">
				<div class="card preset-tonal-surface border-white/10 p-5">
					<label class="grid gap-2">
						<span class="text-xs font-bold tracking-wide uppercase text-surface-400">Name</span>
						<input
							class="input preset-tonal-surface"
							placeholder="Your Name"
							bind:value={form.fullName}
						/>
					</label>

					<label class="mt-4 grid gap-2">
						<span class="text-xs font-bold tracking-wide uppercase text-surface-400">Email</span>
						<input
							class="input preset-tonal-surface"
							placeholder="you@example.com"
							bind:value={form.email}
						/>
					</label>

					<label class="mt-4 grid gap-2">
						<span class="text-xs font-bold tracking-wide uppercase text-surface-400">Title</span>
						<input
							class="input preset-tonal-surface"
							placeholder="Volunteer"
							bind:value={form.title}
						/>
					</label>
				</div>

				<div class="card preset-tonal-surface border-white/10 p-5">
					<div class="space-y-3">
						<div
							class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface-950/70 px-4 py-3"
						>
							<div class="text-sm font-semibold text-surface-100">Phone</div>
							<Toggle bind:checked={form.showPhone} />
						</div>

						<input
							class="input preset-tonal-surface"
							placeholder="(602) 555-0123"
							value={form.phone}
							oninput={handlePhoneInput}
						/>

						<div
							class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface-950/70 px-4 py-3"
						>
							<div class="text-sm font-semibold text-surface-100">Address</div>
							<Toggle bind:checked={form.showAddress} />
						</div>
					</div>
				</div>

				<div class="card preset-tonal-surface border-white/10 p-5">
					<span class="mb-3 block text-xs font-bold tracking-wide uppercase text-surface-400"
						>Logo</span
					>
					<div class="grid grid-cols-4 gap-2 sm:grid-cols-7">
						{#each logoOptions as option}
							{@const isActive = form.logo === option.key}
							<button
								class={'relative overflow-hidden rounded-xl border transition ' +
									(isActive
										? 'border-primary-500/60 ring-1 ring-primary-500/40'
										: 'border-white/10 hover:border-white/30')}
								type="button"
								aria-label={option.label}
								title={option.label}
								onclick={() => (form.logo = option.key)}
							>
								<img src={option.url} alt={option.label} class="h-12 w-12 object-contain" />
							</button>
						{/each}
					</div>
				</div>

				<div class="flex gap-3">
					{#each accentOptions as option}
						{@const isActive = form.accent === option.key}
						<button
							class={'flex h-11 w-11 items-center justify-center rounded-full border transition ' +
								(isActive
									? 'border-white/30 bg-white/10'
									: 'border-white/10 bg-surface-950/70 hover:border-white/20')}
							type="button"
							aria-label={option.label}
							title={option.label}
							onclick={() => (form.accent = option.key)}
						>
							<span
								class="h-5 w-5 rounded-full border border-white/20"
								style={`background:${option.hex}`}
							></span>
						</button>
					{/each}
				</div>
			</section>

			<section class="space-y-4 lg:sticky lg:top-6 lg:self-start">
				<div
					class="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-xl shadow-black/10"
				>
					<div class="p-6 md:p-8">
						<div class="signature-preview inline-block max-w-full overflow-hidden">
							{@html generatedHtml}
						</div>
					</div>
				</div>

				<div class="card preset-tonal-surface border-white/10 p-5">
					<div class="relative">
						<button
							class="btn btn-xs preset-filled-primary-500 absolute top-3 right-3 z-10 gap-1.5"
							type="button"
							onclick={copyHtml}
						>
							{#if copied}
								<IconCheck class="size-3.5" />
								Copied
							{:else}
								<IconCopy class="size-3.5" />
								Copy
							{/if}
						</button>
						<textarea
							class="textarea preset-tonal-surface min-h-[20rem] pt-10 pr-28 font-mono text-xs leading-5"
							readonly
							spellcheck="false">{generatedHtml}</textarea
						>
					</div>
				</div>
			</section>
		</div>
	</div>
</div>

<style>
	.signature-preview :global(table) {
		border-collapse: collapse;
	}
</style>
