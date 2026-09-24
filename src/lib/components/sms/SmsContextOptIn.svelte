<script>
	import { onMount } from 'svelte';

	export let category = 'ride_reminders';
	export let source = 'profile';
	export let title = 'Get text reminders';
	export let description = '';
	export let onSaved = () => {};

	const categoryLabels = {
		ride_reminders: 'ride reminders',
		volunteer_reminders: 'volunteer shift reminders',
		admin_messages: 'event admin messages',
		bike_valet_messages: 'bike valet updates'
	};

	let loading = true;
	let saving = false;
	let enabled = false;
	let subscriptionStatus = 'paused';
	let phone = '';
	let modalPhone = '';
	let consentChecked = false;
	let consentText =
		'By checking the SMS consent box or selecting “Agree & enable SMS,” I agree to receive recurring 3 Feet Please SMS messages about the categories I select. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, START to rejoin, or HELP for help.';
	let error = '';
	let success = '';
	let optInDialog;

	const categoryLabel = categoryLabels[category] || '3FP updates';

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
		optInDialog?.showModal();
	}

	async function enableSms(submittedPhone = phone) {
		if (saving) return;
		saving = true;
		error = '';
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
			if (!response.ok) throw new Error(payload?.error || 'Unable to enable SMS updates.');
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
		enableSms(modalPhone);
	}
</script>

{#if !loading}
	{#if enabled}
		<div class="border-success-500/30 bg-success-500/8 rounded-2xl border p-4 text-sm">
			<div class="font-semibold">Text reminders are enabled</div>
			<p class="mt-1 opacity-75">
				You will receive {categoryLabel} when they apply. Frequency varies. Manage all SMS choices in
				your <a class="underline" href="/profile">Profile</a>.
			</p>
		</div>
	{:else if subscriptionStatus === 'unsubscribed'}
		<div class="border-warning-500/30 bg-warning-500/8 rounded-2xl border p-4 text-sm">
			<div class="font-semibold">SMS is opted out for this number</div>
			<p class="mt-1 opacity-75">
				Reply START from the mobile number you used to opt in to rejoin, then manage this category
				in your <a class="underline" href="/profile">Profile</a>.
			</p>
		</div>
	{:else if subscriptionStatus === 'blocked'}
		<div class="border-surface-500/30 bg-surface-500/8 rounded-2xl border p-4 text-sm">
			<div class="font-semibold">SMS cannot be enabled for this number</div>
			<p class="mt-1 opacity-75">
				Contact <a class="underline" href="mailto:hi@3fp.org">hi@3fp.org</a> for help.
			</p>
		</div>
	{:else}
		<div class="border-primary-500/30 bg-primary-500/8 space-y-3 rounded-2xl border p-4">
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
					class="btn preset-filled-primary-500"
					type="button"
					on:click={() => enableSms(phone)}
					disabled={saving}
				>
					{saving ? 'Enabling…' : 'Agree & enable SMS'}
				</button>
			{:else}
				<p class="text-xs leading-relaxed opacity-70">
					Add a mobile number and explicitly agree to receive these optional messages. Frequency
					varies; message and data rates may apply. Reply STOP to opt out or HELP for help.
				</p>
				<button class="btn preset-filled-primary-500" type="button" on:click={openOptInDialog}>
					Add number &amp; sign up
				</button>
			{/if}

			{#if error}<p class="text-error-600-400 text-sm" role="alert">{error}</p>{/if}
			{#if success}<p class="text-success-600-400 text-sm" role="status">{success}</p>{/if}
		</div>

		<dialog
			bind:this={optInDialog}
			class="sms-opt-in-dialog bg-surface-950 text-surface-50 w-[min(94vw,36rem)] rounded-2xl border border-white/15 p-0 shadow-2xl"
			aria-label={`Sign up for ${categoryLabel}`}
		>
			<form class="space-y-5 p-6" on:submit={submitOptIn}>
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="text-xl font-bold">Sign up for {categoryLabel}</h2>
						<p class="mt-1 text-sm opacity-75">Enter a mobile number you control.</p>
					</div>
					<button
						class="btn preset-outlined-surface-500 shrink-0"
						type="button"
						aria-label="Close SMS signup"
						on:click={() => optInDialog?.close()}
					>
						Close
					</button>
				</div>

				<label class="flex flex-col gap-2 text-sm">
					<span class="font-semibold">Mobile number</span>
					<input
						class="input bg-surface-50-950/20"
						type="tel"
						autocomplete="tel"
						maxlength="20"
						placeholder="(480) 555-0123"
						bind:value={modalPhone}
						required
					/>
				</label>

				<label
					class="border-primary-500/30 bg-primary-500/8 flex items-start gap-3 rounded-xl border p-4"
				>
					<input class="mt-1 shrink-0" type="checkbox" bind:checked={consentChecked} required />
					<span class="text-sm leading-relaxed">{consentText}</span>
				</label>
				<p class="text-xs leading-relaxed opacity-70">
					Message and data rates may apply. Message frequency varies. Reply STOP to opt out, START
					to rejoin, or HELP for help. SMS is optional and not a condition of using 3FP. See our
					<a class="underline" href="/terms" target="_blank" rel="noreferrer">Terms</a> and
					<a class="underline" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
				</p>

				{#if error}<p class="text-error-600-400 text-sm" role="alert">{error}</p>{/if}

				<button
					class="btn preset-filled-primary-500 w-full"
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
		backdrop-filter: blur(3px);
	}
</style>
