<script>
	import { onMount } from 'svelte';

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

	function handleBackdropClick(event) {
		if (event.target !== event.currentTarget) return;
		const rect = event.currentTarget.getBoundingClientRect();
		const clickedInside =
			rect.width > 0 &&
			rect.height > 0 &&
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom;
		if (!clickedInside) {
			event.currentTarget.close();
		}
	}
</script>

{#if !loading}
	{#if enabled}
		<div
			class="border-surface-700 border-l-success-400 bg-surface-950 text-surface-50 border border-l-4 p-4 text-sm"
		>
			<div class="text-surface-50 font-black tracking-wide uppercase">
				Text reminders are enabled
			</div>
			<p class="text-surface-200 m-0 mt-1 leading-relaxed">
				You will receive {categoryLabel} when they apply. Frequency varies. Manage all SMS choices in
				your
				<a class="text-primary-300 hover:text-surface-50 font-bold underline" href="/profile"
					>Profile</a
				>.
			</p>
		</div>
	{:else if subscriptionStatus === 'unsubscribed'}
		<div
			class="border-surface-700 border-l-warning-400 bg-surface-950 text-surface-50 border border-l-4 p-4 text-sm"
		>
			<div class="text-surface-50 font-black tracking-wide uppercase">
				SMS is opted out for this number
			</div>
			<p class="text-surface-200 m-0 mt-1 leading-relaxed">
				Reply START from the mobile number you used to opt in to rejoin, then manage this category
				in your
				<a class="text-primary-300 hover:text-surface-50 font-bold underline" href="/profile"
					>Profile</a
				>.
			</p>
		</div>
	{:else if subscriptionStatus === 'blocked'}
		<div
			class="border-surface-700 border-l-surface-400 bg-surface-950 text-surface-50 border border-l-4 p-4 text-sm"
		>
			<div class="text-surface-50 font-black tracking-wide uppercase">
				SMS cannot be enabled for this number
			</div>
			<p class="text-surface-200 m-0 mt-1 leading-relaxed">
				Contact
				<a
					class="text-primary-300 hover:text-surface-50 font-bold underline"
					href="mailto:hi@3fp.org">hi@3fp.org</a
				>
				for help.
			</p>
		</div>
	{:else}
		<div
			class="border-surface-700 border-l-primary-400 bg-surface-950 text-surface-50 space-y-3 border border-l-4 p-4"
		>
			<div>
				<strong class="text-surface-50 block text-sm font-black tracking-wide uppercase">
					{title}
				</strong>
				{#if description}
					<p class="text-surface-200 m-0 mt-1 text-sm leading-snug">{description}</p>
				{/if}
			</div>

			{#if phone}
				<p class="text-surface-200 m-0 text-xs leading-relaxed">
					We’ll use the mobile number on your Profile ending in {phone.slice(-4)}. You can change it
					in
					<a class="text-primary-300 hover:text-surface-50 font-bold underline" href="/profile"
						>Profile</a
					>.
				</p>
				<p class="text-surface-200 m-0 max-w-2xl text-xs leading-relaxed">{consentText}</p>
				<p class="text-surface-200 m-0 text-xs leading-relaxed">
					SMS is optional.
					<a class="text-primary-300 hover:text-surface-50 font-bold underline" href="/terms"
						>Terms</a
					>
					and
					<a class="text-primary-300 hover:text-surface-50 font-bold underline" href="/privacy"
						>Privacy Policy</a
					>.
				</p>
				<button
					class="bg-primary-400 text-surface-950 hover:bg-primary-300 inline-flex min-h-11 items-center justify-center rounded-none px-5 py-2.5 text-xs font-black tracking-[0.14em] uppercase transition disabled:cursor-not-allowed disabled:opacity-60"
					type="button"
					onclick={() => enableSms(phone)}
					disabled={saving}
				>
					{saving ? 'Enabling…' : 'Agree & enable SMS'}
				</button>
			{:else}
				<p class="text-surface-200 m-0 text-xs leading-relaxed">
					Add a mobile number and explicitly agree to receive these optional messages. Frequency
					varies; message and data rates may apply. Reply STOP to opt out or HELP for help.
				</p>
				<button
					class="bg-primary-400 text-surface-950 hover:bg-primary-300 inline-flex min-h-11 items-center justify-center rounded-none px-5 py-2.5 text-xs font-black tracking-[0.14em] uppercase transition"
					type="button"
					aria-haspopup="dialog"
					onclick={openOptInDialog}
				>
					Add number &amp; sign up
				</button>
			{/if}

			{#if error}
				<p class="text-error-200 m-0 text-sm font-semibold" role="alert">{error}</p>
			{/if}
			{#if success}
				<p class="text-success-200 m-0 text-sm font-semibold" role="status">{success}</p>
			{/if}
		</div>
	{/if}

	<dialog
		bind:this={optInDialog}
		onclick={handleBackdropClick}
		class="sms-opt-in-dialog bg-surface-950 text-surface-50 border-surface-600 border-t-primary-400 fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-1.5rem),36rem)] max-w-none overflow-y-auto rounded-none border-2 border-t-4 p-0"
		aria-label={`Sign up for ${categoryLabel}`}
	>
		<form class="space-y-5 p-5 sm:p-6" onsubmit={submitOptIn}>
			<div class="flex items-start justify-between gap-4">
				<div>
					<h2 class="text-surface-50! m-0 text-xl leading-tight font-black uppercase italic">
						Sign up for {categoryLabel}
					</h2>
					<p class="text-surface-200 m-0 mt-1 text-sm">Enter a mobile number you control.</p>
				</div>
				<button
					class="border-surface-300 text-surface-50 hover:border-primary-400 hover:text-primary-300 inline-flex min-h-11 shrink-0 items-center justify-center rounded-none border-2 px-3.5 py-2 text-xs font-black tracking-[0.14em] uppercase transition"
					type="button"
					aria-label="Close SMS signup"
					onclick={() => optInDialog?.close()}
				>
					Close
				</button>
			</div>

			<label class="flex flex-col gap-2 text-sm">
				<span class="text-surface-100 text-xs font-bold tracking-[0.18em] uppercase">
					Mobile number
				</span>
				<input
					class="bg-surface-950 border-surface-300 text-surface-50 placeholder:text-surface-300 focus:border-primary-400 min-h-11 w-full rounded-none border-2 px-3.5 py-2.5 text-base focus:outline-none"
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

			<label
				class="border-surface-700 border-l-primary-400 bg-surface-950 flex cursor-pointer items-start gap-3 border border-l-4 p-4"
			>
				<input
					class="sms-optin-checkbox mt-0.5 shrink-0"
					type="checkbox"
					bind:checked={consentChecked}
					required
				/>
				<span class="text-surface-50 text-sm leading-relaxed">{consentText}</span>
			</label>
			<p class="text-surface-200 m-0 text-xs leading-relaxed">
				Message and data rates may apply. Message frequency varies. Reply STOP to opt out, START to
				rejoin, or HELP for help. SMS is optional and not a condition of using 3FP. See our
				<a
					class="text-primary-300 hover:text-surface-50 font-bold underline"
					href="/terms"
					target="_blank"
					rel="noreferrer">Terms</a
				>
				and
				<a
					class="text-primary-300 hover:text-surface-50 font-bold underline"
					href="/privacy"
					target="_blank"
					rel="noreferrer">Privacy Policy</a
				>.
			</p>

			<div id={phoneErrorId} role="alert">
				{#if error}<p class="text-error-200 m-0 text-sm font-semibold">{error}</p>{/if}
			</div>

			<button
				class="bg-primary-400 text-surface-950 hover:bg-primary-300 inline-flex min-h-11 w-full items-center justify-center rounded-none px-6 py-3 text-sm font-black tracking-[0.14em] uppercase transition disabled:cursor-not-allowed disabled:opacity-55"
				type="submit"
				disabled={saving || !consentChecked || !modalPhone.trim()}
			>
				{saving ? 'Signing up…' : 'Agree & enable SMS'}
			</button>
		</form>
	</dialog>
{/if}

<style>
	.sms-opt-in-dialog::backdrop {
		background: rgb(0 0 0 / 78%);
	}

	.sms-optin-checkbox {
		appearance: none;
		-webkit-appearance: none;
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid var(--color-surface-300);
		background-color: var(--color-surface-950);
		cursor: pointer;
		display: inline-grid;
		place-content: center;
	}

	.sms-optin-checkbox::before {
		content: '';
		width: 0.65rem;
		height: 0.65rem;
		transform: scale(0);
		background-color: var(--color-surface-950);
		clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
	}

	.sms-optin-checkbox:checked {
		border-color: var(--color-primary-400);
		background-color: var(--color-primary-400);
	}

	.sms-optin-checkbox:checked::before {
		transform: scale(1);
	}

	.sms-optin-checkbox:focus-visible {
		outline: 3px solid var(--color-primary-300);
		outline-offset: 2px;
	}
</style>
