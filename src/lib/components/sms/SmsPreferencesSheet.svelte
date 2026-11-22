<script>
	import { onMount } from 'svelte';
	import IconMessageSquare from '@lucide/svelte/icons/message-square';
	import { SMS_INLINE_DEFAULT_CONSENT_TEXT } from '#lib/sms/inlineEnrollment';

	let {
		rideSource = 'ride-rsvp',
		adminSource = 'ride-rsvp-admin-messages',
		onSaved = () => {}
	} = $props();

	const id = $props.id();
	const bannerHeadingId = `${id}-banner`;
	const sheetHeadingId = `${id}-sheet`;
	const phoneErrorId = `${id}-phone-error`;

	let loading = $state(true);
	let saving = $state(false);
	let subscriptionStatus = $state('paused');
	let phone = $state('');
	let rideReminders = $state(false);
	let adminMessages = $state(false);
	let volunteerReminders = $state(false);
	let bikeValetMessages = $state(false);
	let consentText = $state(SMS_INLINE_DEFAULT_CONSENT_TEXT);

	let sheetPhone = $state('');
	let sheetRideReminders = $state(false);
	let sheetAdminMessages = $state(false);
	let sheetConsent = $state(false);
	let phoneInvalid = $state(false);
	let loadError = $state('');
	let sheetError = $state('');
	let bannerNotice = $state('');
	let sheetDialog = $state();

	const activeRideReminders = $derived(subscriptionStatus === 'active' && rideReminders);
	const activeAdminMessages = $derived(subscriptionStatus === 'active' && adminMessages);
	const activeRideCategoryCount = $derived(
		Number(activeRideReminders) + Number(activeAdminMessages)
	);
	const enablingAnyRideCategory = $derived(sheetRideReminders || sheetAdminMessages);
	const hadAnyRideCategory = $derived(activeRideReminders || activeAdminMessages);
	const otherCategoriesActive = $derived(
		subscriptionStatus === 'active' && (volunteerReminders || bikeValetMessages)
	);
	const canSubmitSheet = $derived(
		!saving &&
			(enablingAnyRideCategory ? Boolean(sheetPhone.trim()) && sheetConsent : hadAnyRideCategory)
	);

	const bannerSummary = $derived.by(() => {
		if (loading) {
			return 'Checking your optional ride text alert preferences…';
		}
		if (loadError) {
			return loadError;
		}
		if (activeRideReminders && activeAdminMessages) {
			return 'Ride reminders and organizer texts are active for your account.';
		}
		if (activeRideReminders) {
			return 'Ride reminders are on · Organizer texts are off.';
		}
		if (activeAdminMessages) {
			return 'Organizer texts are on · Ride reminders are off.';
		}
		return 'Get optional ride reminders and organizer updates in one place.';
	});

	function syncFromPreferences(preferences = {}) {
		phone = preferences.phone || '';
		subscriptionStatus = preferences.status || 'paused';
		rideReminders = preferences.ride_reminders === true;
		adminMessages = preferences.admin_messages === true;
		volunteerReminders = preferences.volunteer_reminders === true;
		bikeValetMessages = preferences.bike_valet_messages === true;
	}

	onMount(async () => {
		try {
			const response = await fetch('/api/sms/preferences');
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error || 'Unable to load SMS preferences.');
			}
			syncFromPreferences(payload?.preferences ?? {});
			consentText = payload?.consentText || consentText;
		} catch (err) {
			loadError = err?.message || 'Unable to load SMS preferences.';
		} finally {
			loading = false;
		}
	});

	function openSheet() {
		sheetPhone = phone;
		sheetRideReminders = activeRideReminders;
		sheetAdminMessages = activeAdminMessages;
		sheetConsent = subscriptionStatus === 'active' && Boolean(phone);
		sheetError = '';
		phoneInvalid = false;
		bannerNotice = '';
		sheetDialog?.showModal();
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

	async function savePreferences(event) {
		event.preventDefault();
		if (!canSubmitSheet) return;

		saving = true;
		sheetError = '';
		phoneInvalid = false;
		bannerNotice = '';

		const submittedPhone = sheetPhone.trim() || phone;
		const source = sheetAdminMessages && !sheetRideReminders ? adminSource : rideSource;

		try {
			const response = await fetch('/api/sms/preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					phone: submittedPhone,
					sms_consent: enablingAnyRideCategory ? true : otherCategoriesActive,
					ride_reminders: sheetRideReminders,
					admin_messages: sheetAdminMessages,
					source
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				phoneInvalid = response.status === 400 || response.status === 409;
				throw new Error(payload?.error || 'Unable to save SMS preferences.');
			}
			const savedPreferences = payload?.preferences ?? {};
			syncFromPreferences({
				...savedPreferences,
				phone: savedPreferences.phone || submittedPhone
			});
			loadError = '';
			if (enablingAnyRideCategory && subscriptionStatus !== 'active') {
				throw new Error('SMS updates could not be enabled for this account.');
			}
			bannerNotice = enablingAnyRideCategory
				? 'Ride SMS preferences saved.'
				: 'Ride SMS alerts turned off.';
			if (sheetDialog?.open) sheetDialog.close();
			onSaved(savedPreferences);
		} catch (err) {
			sheetError = err?.message || 'Unable to save SMS preferences.';
		} finally {
			saving = false;
		}
	}
</script>

<section
	class="bg-surface-950 text-surface-50 border-surface-700 border-b-2 px-4 py-3.5 sm:px-10 lg:px-14"
	aria-labelledby={bannerHeadingId}
>
	{#if !loading && subscriptionStatus === 'unsubscribed'}
		<div class="border-warning-400 flex flex-col gap-1 border-l-4 pl-3.5 text-sm">
			<h2
				id={bannerHeadingId}
				class="text-surface-50! m-0 text-xs font-black tracking-[0.16em] uppercase"
			>
				SMS is opted out for this number
			</h2>
			<p class="text-surface-200 m-0 text-xs leading-relaxed">
				Reply START from the mobile number you used to opt in to rejoin, then manage categories in
				your
				<a class="text-primary-300 hover:text-surface-50 font-bold underline" href="/profile"
					>Profile</a
				>.
			</p>
		</div>
	{:else if !loading && subscriptionStatus === 'blocked'}
		<div class="border-surface-400 flex flex-col gap-1 border-l-4 pl-3.5 text-sm">
			<h2
				id={bannerHeadingId}
				class="text-surface-50! m-0 text-xs font-black tracking-[0.16em] uppercase"
			>
				SMS cannot be enabled for this number
			</h2>
			<p class="text-surface-200 m-0 text-xs leading-relaxed">
				Contact
				<a
					class="text-primary-300 hover:text-surface-50 font-bold underline"
					href="mailto:hi@3fp.org">hi@3fp.org</a
				>
				for help.
			</p>
		</div>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div
				class={`min-w-0 flex-1 border-l-4 pl-3.5 ${
					activeRideCategoryCount > 0 ? 'border-success-400' : 'border-primary-400'
				}`}
			>
				<div class="flex flex-wrap items-center gap-2">
					<IconMessageSquare class="text-primary-300 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<h2
						id={bannerHeadingId}
						class="text-surface-50! m-0 text-xs font-black tracking-[0.16em] uppercase not-italic"
					>
						{#if activeRideCategoryCount === 2}
							Ride text alerts enabled
						{:else if activeRideCategoryCount === 1}
							1 of 2 ride text alerts on
						{:else}
							Optional ride text alerts
						{/if}
					</h2>
				</div>
				<p
					class={`m-0 mt-0.5 text-xs leading-snug ${loadError ? 'text-error-200' : 'text-surface-200'}`}
				>
					{bannerSummary}
				</p>
				{#if bannerNotice}
					<p class="text-success-200 m-0 mt-1 text-xs font-bold" role="status">
						{bannerNotice}
					</p>
				{/if}
			</div>

			<button
				type="button"
				class="bg-primary-400 text-surface-950 hover:bg-primary-300 inline-flex min-h-11 shrink-0 items-center justify-center px-4 py-2.5 text-xs font-black tracking-[0.14em] uppercase transition disabled:cursor-not-allowed disabled:opacity-60"
				aria-haspopup="dialog"
				onclick={openSheet}
				disabled={loading}
			>
				{activeRideCategoryCount > 0 ? 'Manage SMS' : 'Set up SMS'}
			</button>
		</div>
	{/if}
</section>

<dialog
	bind:this={sheetDialog}
	aria-labelledby={sheetHeadingId}
	onclick={handleBackdropClick}
	class="sms-preferences-sheet bg-surface-950 text-surface-50 border-surface-600 border-t-primary-400 fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-1.5rem),34rem)] max-w-none overflow-y-auto border-2 border-t-4 p-0"
>
	<form class="flex flex-col gap-5 p-5 sm:p-6" onsubmit={savePreferences}>
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				<p class="text-primary-300 m-0 text-[0.7rem] font-bold tracking-[0.2em] uppercase">
					Ride SMS preferences
				</p>
				<h2
					id={sheetHeadingId}
					class="text-surface-50! m-0 mt-1 text-2xl leading-tight font-black uppercase italic"
				>
					Text alerts for rides
				</h2>
				<p class="text-surface-200 m-0 mt-1 text-xs leading-relaxed">
					Choose which optional text updates you want when you RSVP for rides.
				</p>
			</div>
			<button
				type="button"
				class="border-surface-300 text-surface-50 hover:border-primary-400 hover:text-primary-300 inline-flex min-h-11 shrink-0 items-center justify-center border-2 px-3.5 py-2 text-xs font-black tracking-[0.14em] uppercase transition"
				aria-label="Close SMS preferences"
				onclick={() => sheetDialog?.close()}
			>
				Close
			</button>
		</div>

		<div class="border-surface-700 flex flex-col border-t-2">
			<label
				class="sms-sheet-switch border-surface-700 flex cursor-pointer items-center justify-between gap-4 border-b py-3.5"
			>
				<span class="flex min-w-0 flex-col gap-0.5">
					<strong class="text-surface-50 text-sm font-black tracking-wide uppercase">
						Ride reminders
					</strong>
					<span class="text-surface-200 text-xs leading-snug">
						Concise reminders for upcoming rides you RSVP to attend.
					</span>
				</span>
				<input
					type="checkbox"
					role="switch"
					aria-checked={sheetRideReminders}
					bind:checked={sheetRideReminders}
					disabled={saving}
				/>
			</label>

			<label
				class="sms-sheet-switch border-surface-700 flex cursor-pointer items-center justify-between gap-4 border-b py-3.5"
			>
				<span class="flex min-w-0 flex-col gap-0.5">
					<strong class="text-surface-50 text-sm font-black tracking-wide uppercase">
						Organizer texts
					</strong>
					<span class="text-surface-200 text-xs leading-snug">
						Receive and reply to messages from ride organizers about your RSVP.
					</span>
				</span>
				<input
					type="checkbox"
					role="switch"
					aria-checked={sheetAdminMessages}
					bind:checked={sheetAdminMessages}
					disabled={saving}
				/>
			</label>
		</div>

		<label class="flex flex-col gap-1.5">
			<span class="text-surface-100 text-xs font-bold tracking-[0.18em] uppercase">
				Mobile number
			</span>
			<input
				class="bg-surface-950 border-surface-300 text-surface-50 placeholder:text-surface-300 focus:border-primary-400 min-h-11 w-full border-2 px-3.5 py-2.5 text-base focus:outline-none"
				type="tel"
				autocomplete="tel"
				maxlength="20"
				placeholder="(480) 555-0123"
				bind:value={sheetPhone}
				readonly={saving}
				aria-invalid={phoneInvalid || undefined}
				aria-describedby={phoneInvalid ? phoneErrorId : undefined}
				oninput={() => {
					if (phoneInvalid) {
						sheetError = '';
						phoneInvalid = false;
					}
				}}
				required={enablingAnyRideCategory}
			/>
			<span class="text-surface-200 text-xs leading-snug">
				Saved to your
				<a class="text-primary-300 hover:text-surface-50 font-bold underline" href="/profile"
					>Profile</a
				>
				in E.164 format for delivery.
			</span>
		</label>

		<label
			class="border-surface-700 border-l-primary-400 bg-surface-950 flex cursor-pointer items-start gap-3 border border-l-4 p-3.5"
		>
			<input
				class="sms-consent-box mt-0.5 shrink-0"
				type="checkbox"
				bind:checked={sheetConsent}
				disabled={saving}
				required={enablingAnyRideCategory}
			/>
			<span class="text-surface-50 text-xs leading-relaxed">{consentText}</span>
		</label>

		<p class="text-surface-200 m-0 text-xs leading-relaxed">
			SMS is optional and not a condition of using 3FP. See our
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
			{#if sheetError}
				<p class="text-error-200 m-0 text-sm font-semibold">{sheetError}</p>
			{/if}
		</div>

		<button
			type="submit"
			class="bg-primary-400 text-surface-950 hover:bg-primary-300 inline-flex min-h-11 w-full items-center justify-center px-6 py-3 text-sm font-black tracking-[0.14em] uppercase transition disabled:cursor-not-allowed disabled:opacity-55"
			disabled={!canSubmitSheet}
		>
			{#if saving}
				Saving…
			{:else if enablingAnyRideCategory}
				Save SMS preferences
			{:else}
				Turn off ride SMS
			{/if}
		</button>
	</form>
</dialog>

<style>
	.sms-preferences-sheet::backdrop {
		background: rgb(0 0 0 / 78%);
	}

	.sms-sheet-switch input[role='switch'] {
		appearance: none;
		-webkit-appearance: none;
		flex: 0 0 auto;
		width: 3rem;
		height: 1.75rem;
		margin: 0;
		border: 2px solid var(--color-surface-300);
		background-color: var(--color-surface-800);
		background-image: linear-gradient(var(--color-surface-50), var(--color-surface-50));
		background-repeat: no-repeat;
		background-position: 0.2rem center;
		background-size: 1.05rem 1.05rem;
		cursor: pointer;
	}

	.sms-sheet-switch input[role='switch']:checked {
		border-color: var(--color-primary-400);
		background-color: var(--color-primary-400);
		background-image: linear-gradient(var(--color-surface-950), var(--color-surface-950));
		background-position: 1.5rem center;
	}

	.sms-sheet-switch input[role='switch']:focus-visible,
	.sms-consent-box:focus-visible {
		outline: 3px solid var(--color-primary-300);
		outline-offset: 2px;
	}

	.sms-consent-box {
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

	.sms-consent-box::before {
		content: '';
		width: 0.65rem;
		height: 0.65rem;
		transform: scale(0);
		background-color: var(--color-surface-950);
		clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
	}

	.sms-consent-box:checked {
		border-color: var(--color-primary-400);
		background-color: var(--color-primary-400);
	}

	.sms-consent-box:checked::before {
		transform: scale(1);
	}
</style>
