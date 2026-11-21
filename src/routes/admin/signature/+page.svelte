<script>
	import { onDestroy } from 'svelte';
	import IconCopy from '@lucide/svelte/icons/copy';
	import IconRefreshCw from '@lucide/svelte/icons/refresh-cw';
	import IconCheck from '@lucide/svelte/icons/check';
	import Toggle from '#lib/components/ui/Toggle.svelte';
	import AdminHero from '#lib/components/admin/AdminHero.svelte';
	import {
		DEFAULT_SIGNATURE_FORM,
		buildSignatureHtml,
		getAccentOptions,
		getLogoOptions
	} from '#lib/admin/signatureBuilder';

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

<AdminHero eyebrow="Branding" title="Signature Builder">
	{#snippet actions()}
		<button class="btn preset-outlined-surface-500" type="button" onclick={resetForm}>
			<IconRefreshCw class="size-4" />
			Reset
		</button>
	{/snippet}
</AdminHero>

<div class="grid flex-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
	<!-- FORM -->
	<div class="flex flex-col gap-10 px-6 py-10 sm:px-10 lg:px-14 lg:py-14">
		<section class="flex flex-col gap-5" aria-labelledby="signature-details-heading">
			<div class="flex items-center gap-3">
				<span
					class="text-tertiary-500 text-2xl leading-none font-black italic tabular-nums"
					aria-hidden="true">01</span
				>
				<h2 id="signature-details-heading" class="m-0 text-xl">Details</h2>
			</div>

			<label class="flex flex-col gap-2">
				<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">Name</span>
				<input class="input" placeholder="Your Name" bind:value={form.fullName} />
			</label>

			<label class="flex flex-col gap-2">
				<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">Email</span>
				<input class="input" placeholder="you@example.com" bind:value={form.email} />
			</label>

			<label class="flex flex-col gap-2">
				<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">Title</span>
				<input class="input" placeholder="Volunteer" bind:value={form.title} />
			</label>
		</section>

		<section class="flex flex-col gap-5" aria-labelledby="signature-rows-heading">
			<div class="flex items-center gap-3">
				<span
					class="text-tertiary-500 text-2xl leading-none font-black italic tabular-nums"
					aria-hidden="true">02</span
				>
				<h2 id="signature-rows-heading" class="m-0 text-xl">Contact rows</h2>
			</div>

			<div class="border-surface-800 flex flex-col border-t-2">
				<div class="border-surface-800 flex items-center justify-between gap-3 border-b py-4">
					<span class="text-sm font-black tracking-wide uppercase">Phone</span>
					<Toggle ariaLabel="Show phone number on signature" bind:checked={form.showPhone} />
				</div>
				<div class="border-surface-800 border-b py-4">
					<input
						class="input"
						aria-label="Phone number"
						placeholder="(602) 555-0123"
						value={form.phone}
						oninput={handlePhoneInput}
					/>
				</div>
				<div class="border-surface-800 flex items-center justify-between gap-3 border-b py-4">
					<span class="text-sm font-black tracking-wide uppercase">Address</span>
					<Toggle ariaLabel="Show address on signature" bind:checked={form.showAddress} />
				</div>
			</div>
		</section>

		<section class="flex flex-col gap-5" aria-labelledby="signature-logo-heading">
			<div class="flex items-center gap-3">
				<span
					class="text-tertiary-500 text-2xl leading-none font-black italic tabular-nums"
					aria-hidden="true">03</span
				>
				<h2 id="signature-logo-heading" class="m-0 text-xl">Logo</h2>
			</div>

			<!-- Logos are black art made for light backgrounds, so each sits on a white tile. -->
			<div class="grid grid-cols-4 gap-3 sm:grid-cols-7">
				{#each logoOptions as option (option.key)}
					{@const isActive = form.logo === option.key}
					<button
						class="bg-surface-50 flex items-center justify-center p-1 transition {isActive
							? 'outline-primary-500 outline-4 outline-offset-2'
							: 'hover:outline-surface-400 hover:outline-2 hover:outline-offset-2'}"
						type="button"
						aria-label={option.label}
						aria-pressed={isActive}
						title={option.label}
						onclick={() => (form.logo = option.key)}
					>
						<img src={option.url} alt="" class="h-12 w-12 object-contain" />
					</button>
				{/each}
			</div>
		</section>

		<section class="flex flex-col gap-5" aria-labelledby="signature-accent-heading">
			<div class="flex items-center gap-3">
				<span
					class="text-tertiary-500 text-2xl leading-none font-black italic tabular-nums"
					aria-hidden="true">04</span
				>
				<h2 id="signature-accent-heading" class="m-0 text-xl">Accent</h2>
			</div>

			<div class="flex gap-4">
				{#each accentOptions as option (option.key)}
					{@const isActive = form.accent === option.key}
					<button
						class="h-12 w-12 transition {isActive
							? 'outline-primary-500 outline-4 outline-offset-2'
							: 'hover:outline-surface-400 hover:outline-2 hover:outline-offset-2'}"
						type="button"
						aria-label={option.label}
						aria-pressed={isActive}
						title={option.label}
						style={`background:${option.hex}`}
						onclick={() => (form.accent = option.key)}
					></button>
				{/each}
			</div>
		</section>
	</div>

	<!-- PREVIEW + HTML -->
	<div class="bg-surface-900 border-surface-800 border-t-secondary-500 border-t-4 lg:border-l-2">
		<div
			class="flex flex-col gap-8 px-6 py-10 sm:px-10 lg:sticky lg:top-6 lg:self-start lg:px-12 lg:py-12"
		>
			<!-- The signature is an email canvas, so it stays on white. -->
			<section class="bg-surface-50 text-surface-950 relative" aria-label="Signature preview">
				<p
					class="bg-primary-500 text-surface-950 absolute top-0 left-0 m-0 px-4 py-2 text-xs font-bold tracking-[0.22em] uppercase"
				>
					Preview
				</p>
				<div class="px-6 pt-16 pb-8 md:px-8">
					<div class="signature-preview inline-block max-w-full overflow-hidden">
						{@html generatedHtml}
					</div>
				</div>
			</section>

			<section class="relative" aria-label="Signature HTML">
				<p
					class="text-primary-500 m-0 mb-3 text-xs font-bold tracking-[0.22em] uppercase"
					aria-hidden="true"
				>
					HTML
				</p>
				<div class="relative">
					<button
						class="btn btn-sm preset-filled-primary-500 absolute top-3 right-3 z-10 gap-1.5"
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
						class="textarea min-h-[20rem] pt-14 pr-4 font-mono text-xs leading-5"
						aria-label="Signature HTML source"
						readonly
						spellcheck="false">{generatedHtml}</textarea
					>
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
