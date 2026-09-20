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
	let selected = false;
	let phone = '';
	let error = '';
	let success = '';

	const categoryLabel = categoryLabels[category] || '3FP updates';

	onMount(async () => {
		try {
			const response = await fetch('/api/sms/preferences');
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error || 'Unable to load SMS preferences.');
			const preferences = payload?.preferences ?? {};
			phone = preferences.phone || '';
			enabled = preferences.status === 'active' && preferences[category] === true;
			selected = enabled;
		} catch (loadError) {
			error = loadError?.message || 'Unable to load SMS preferences.';
		} finally {
			loading = false;
		}
	});

	async function enableSms() {
		if (saving || !selected) return;
		saving = true;
		error = '';
		success = '';

		try {
			const response = await fetch('/api/sms/preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					phone,
					sms_consent: true,
					[category]: true,
					source
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload?.error || 'Unable to enable SMS updates.');
			const preferences = payload?.preferences ?? {};
			phone = preferences.phone || phone;
			enabled = preferences.status === 'active' && preferences[category] === true;
			if (!enabled) throw new Error('SMS updates could not be enabled for this account.');
			success = `You are signed up for ${categoryLabel}.`;
			onSaved(preferences);
		} catch (saveError) {
			error = saveError?.message || 'Unable to enable SMS updates.';
		} finally {
			saving = false;
		}
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
	{:else}
		<div class="border-primary-500/30 bg-primary-500/8 space-y-3 rounded-2xl border p-4">
			<label class="flex items-start gap-3 text-sm">
				<input class="mt-1" type="checkbox" bind:checked={selected} />
				<span>
					<strong>{title}</strong>
					{#if description}
						<small class="mt-1 block opacity-75">{description}</small>
					{/if}
				</span>
			</label>

			{#if selected}
				<label class="flex max-w-sm flex-col gap-1 text-xs tracking-wide uppercase">
					<span>Mobile number</span>
					<input
						class="input bg-surface-50-950/20"
						type="tel"
						autocomplete="tel"
						maxlength="20"
						placeholder="(480) 555-0123"
						bind:value={phone}
					/>
				</label>
				<p class="max-w-2xl text-xs leading-relaxed opacity-70">
					By enabling SMS, you agree to recurring 3 Feet Please messages about the selected
					category. Message frequency varies. Message and data rates may apply. Reply STOP to opt
					out or HELP for help. See the <a class="underline" href="/privacy">Privacy Policy</a>.
				</p>
				<button
					class="btn preset-filled-primary-500"
					type="button"
					on:click={enableSms}
					disabled={saving || !phone.trim()}
				>
					{saving ? 'Enabling…' : 'Enable text reminders'}
				</button>
			{/if}

			{#if error}<p class="text-error-600-400 text-sm">{error}</p>{/if}
			{#if success}<p class="text-success-600-400 text-sm">{success}</p>{/if}
		</div>
	{/if}
{/if}
