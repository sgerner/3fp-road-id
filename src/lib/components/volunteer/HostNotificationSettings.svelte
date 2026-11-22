<script>
	import Toggle from '#lib/components/ui/Toggle.svelte';

	export let value = { register: true, cancel: true };
	export let onChange = null;
	export let disabled = false;
	export let saving = false;

	const coerceBoolean = (input, fallback = false) => {
		if (input === true) return true;
		if (input === false) return false;
		return fallback;
	};

	$: registerEnabled = coerceBoolean(value?.register, true);
	$: cancelEnabled = coerceBoolean(value?.cancel, true);
	$: isInteractive = !disabled && !saving && typeof onChange === 'function';

	function handleToggle(key, checked) {
		if (!isInteractive) return;
		const next = {
			register: registerEnabled,
			cancel: cancelEnabled,
			[key]: Boolean(checked)
		};
		onChange(next);
	}
</script>

<div class="space-y-4">
	<div class="preset-tonal-surface divide-y overflow-hidden rounded-xl">
		<div class="bg-surface-800/30 flex min-h-12 items-center gap-4 px-4 py-3">
			<Toggle
				name="host-register"
				ariaLabel="Notify hosts when a volunteer signs up"
				checked={registerEnabled}
				disabled={!isInteractive}
				onChange={(v) => handleToggle('register', v)}
			/>
			<p>
				New sign-up<span class="ml-2 text-xs opacity-60">When a volunteer registers</span>
			</p>
		</div>

		<div class="bg-surface-800/30 flex min-h-12 items-center gap-4 px-4 py-3">
			<Toggle
				name="host-cancel"
				ariaLabel="Notify hosts when a volunteer cancels"
				checked={cancelEnabled}
				disabled={!isInteractive}
				onChange={(v) => handleToggle('cancel', v)}
			/>
			<p>
				Cancellation <span class="ml-2 text-xs opacity-60">When a volunteer backs out</span>
			</p>
		</div>
	</div>

	{#if saving}
		<p class="text-surface-500 text-xs italic">Saving…</p>
	{/if}
</div>
