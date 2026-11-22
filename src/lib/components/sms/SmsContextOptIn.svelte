<script>
	import { onMount } from 'svelte';

	/** @type {Record<string, any>} */
	let {
		category = 'ride_reminders',
		source = 'profile',
		title = 'Get text reminders',
		description = '',
		onSaved = () => {}
	} = $props();
	const phoneErrorId = $props.id();

	const categoryLabels = {
		ride_reminders: 'ride reminders',
		volunteer_reminders: 'volunteer shift reminders',
		admin_messages: 'event admin messages',
		bike_valet_messages: 'bike valet updates'
	};

	let loading = $state(true);
	let saving = $state(false);
	let enabled = $state(false);
	let subscriptionStatus = $state('paused');
	let phone = $state('');
	let modalPhone = $state('');
	let consentChecked = $state(false);
	let consentText = $state(
		'By checking the SMS consent box or selecting “Agree & enable SMS,” I agree to receive recurring 3 Feet Please SMS messages about the categories I select. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, START to rejoin, or HELP for help.'
	);
	let error = $state('');
	let success = $state('');
	let optInDialog = $state();

	const categoryLabel = $derived(categoryLabels[category] || '3FP updates');
	let phoneInvalid = $state(false);

	onMount(async () => {
		try {
			const response = await fetch('/api/sms/preferences');
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error || 'Unable to load SMS preferences.');
			const preferences = payload?.preferences ?? {};
			phone = preferences.phone || '';
			subscriptionStatus = preferences.status || 'paused';
			enabled = subscriptionStatus === 'active' && preferences[category] === true;
			consentText = payload?.consentText || consentText;
		} catch (loadError) {
			error = loadError?.message || 'Unable to load SMS preferences.';
		} finally {
			loading = false;
		}
	});

	function openOptInDialog() {
		modalPhone = phone;
		consentChecked = false;
		error = '';
		phoneInvalid = false;
		optInDialog?.showModal();
	}

	async function enableSms(submittedPhone = phone, fromDialog = false) {
		if (saving) return;
		saving = true;
		error = '';
		phoneInvalid = false;
		success = '';

		try {
			const response = await fetch('/api/sms/preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					phone: submittedPhone,
					sms_consent: true,
					[category]: true,
					source
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				phoneInvalid = fromDialog && (response.status === 400 || response.status === 409);
				throw new Error(payload?.error || 'Unable to enable SMS updates.');
			}
			const preferences = payload?.preferences ?? {};
			phone = preferences.phone || submittedPhone;
			subscriptionStatus = preferences.status || 'paused';
			enabled = subscriptionStatus === 'active' && preferences[category] === true;
			if (!enabled) throw new Error('SMS updates could not be enabled for this account.');
			success = `You are signed up for ${categoryLabel}.`;
			if (optInDialog?.open) optInDialog.close();
			onSaved(preferences);
		} catch (saveError) {
			error = saveError?.message || 'Unable to enable SMS updates.';
		} finally {
			saving = false;
		}
	}

	function submitOptIn(event) {
		event.preventDefault();
		if (!consentChecked || !modalPhone.trim()) return;
		enableSms(modalPhone, true);
	}
</script>

{#if !loading}
	{#if enabled}
		<div class="border-success-500 bg-surface-100-900 border-l-4 p-4 text-sm">
			<div class="font-semibold">Text reminders are enabled</div>
			<p class="mt-1 opacity-75">
				You will receive {categoryLabel} when they apply. Frequency varies. Manage all SMS choices in
				your <a class="underline" href="/profile">Profile</a>.
			</p>
		</div>
	{:else if subscriptionStatus === 'unsubscribed'}
		<div class="border-warning-500 bg-surface-100-900 border-l-4 p-4 text-sm">
			<div class="font-semibold">SMS is opted out for this number</div>
			<p class="mt-1 opacity-75">
				Reply START from the mobile number you used to opt in to rejoin, then manage this category
				in your <a class="underline" href="/profile">Profile</a>.
			</p>
		</div>
	{:else if subscriptionStatus === 'blocked'}
		<div class="border-surface-500 bg-surface-100-900 border-l-4 p-4 text-sm">
			<div class="font-semibold">SMS cannot be enabled for this number</div>
			<p class="mt-1 opacity-75">
				Contact <a class="underline" href="mailto:hi@3fp.org">hi@3fp.org</a> for help.
			</p>
		</div>
	{:else}
		<div class="border-primary-500 bg-surface-100-900 space-y-3 border-l-4 p-4">
			<div>
				<strong>{title}</strong>
				{#if description}
					<p class="mt-1 text-sm opacity-75">{description}</p>
				{/if}
			</div>

			{#if phone}
				<p class="text-xs opacity-70">
					We’ll use the mobile number on your Profile ending in {phone.slice(-4)}. You can change it
					in
					<a class="underline" href="/profile">Profile</a>.
				</p>
				<p class="max-w-2xl text-xs leading-relaxed opacity-75">{consentText}</p>
				<p class="text-xs leading-relaxed opacity-70">
					SMS is optional. <a class="underline" href="/terms">Terms</a> and
					<a class="underline" href="/privacy">Privacy Policy</a>.
				</p>
				<button
					class="btn preset-filled-primary-500 rounded-none"
					type="button"
					onclick={() => enableSms(phone)}
					disabled={saving}
				>
					{saving ? 'Enabling…' : 'Agree & enable SMS'}
				</button>
			{:else}
				<p class="text-xs leading-relaxed opacity-70">
					Add a mobile number and explicitly agree to receive these optional messages. Frequency
					varies; message and data rates may apply. Reply STOP to opt out or HELP for help.
				</p>
				<button
					class="btn preset-filled-primary-500 rounded-none"
					type="button"
					onclick={openOptInDialog}
				>
					Add number &amp; sign up
				</button>
			{/if}

			{#if error}<p class="text-error-600-400 text-sm" role="alert">{error}</p>{/if}
			{#if success}<p class="text-success-600-400 text-sm" role="status">{success}</p>{/if}
		</div>

		<dialog
			bind:this={optInDialog}
			class="sms-opt-in-dialog bg-surface-950 text-surface-50 border-primary-500 w-[min(94vw,36rem)] border-t-4 p-0"
			aria-label={`Sign up for ${categoryLabel}`}
		>
			<form class="space-y-5 p-6" onsubmit={submitOptIn}>
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="text-xl font-bold">Sign up for {categoryLabel}</h2>
						<p class="mt-1 text-sm opacity-75">Enter a mobile number you control.</p>
					</div>
					<button
						class="btn preset-outlined-surface-500 shrink-0 rounded-none"
						type="button"
						aria-label="Close SMS signup"
						onclick={() => optInDialog?.close()}
					>
						Close
					</button>
				</div>

				<label class="flex flex-col gap-2 text-sm">
					<span class="font-semibold">Mobile number</span>
					<input
						class="input bg-surface-900 rounded-none"
						type="tel"
						autocomplete="tel"
						maxlength="20"
						placeholder="(480) 555-0123"
						bind:value={modalPhone}
						readonly={saving}
						aria-invalid={phoneInvalid || undefined}
						aria-describedby={phoneInvalid ? phoneErrorId : undefined}
						oninput={() => {
							if (phoneInvalid) {
								error = '';
								phoneInvalid = false;
							}
						}}
						required
					/>
				</label>

				<label class="border-primary-500 bg-surface-900 flex items-start gap-3 border-l-4 p-4">
					<input class="mt-1 shrink-0" type="checkbox" bind:checked={consentChecked} required />
					<span class="text-sm leading-relaxed">{consentText}</span>
				</label>
				<p class="text-xs leading-relaxed opacity-70">
					Message and data rates may apply. Message frequency varies. Reply STOP to opt out, START
					to rejoin, or HELP for help. SMS is optional and not a condition of using 3FP. See our
					<a class="underline" href="/terms" target="_blank" rel="noreferrer">Terms</a> and
					<a class="underline" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
				</p>

				<div id={phoneErrorId} role="alert">
					{#if error}<p class="text-error-600-400 text-sm">{error}</p>{/if}
				</div>

				<button
					class="btn preset-filled-primary-500 w-full rounded-none"
					type="submit"
					disabled={saving || !consentChecked || !modalPhone.trim()}
				>
					{saving ? 'Signing up…' : 'Agree & enable SMS'}
				</button>
			</form>
		</dialog>
	{/if}
{/if}

<style>
	.sms-opt-in-dialog::backdrop {
		background: rgb(0 0 0 / 65%);
	}
</style>
