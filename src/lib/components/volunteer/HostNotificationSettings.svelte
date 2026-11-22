<script>
	import Toggle from '#lib/components/ui/Toggle.svelte';

	/** @type {any} */
	export let value = { register: true, cancel: true };
	/** @type {any} */
	export let onChange = () => {};
	/** @type {any} */
	export let disabled = false;
	/** @type {any} */
	export let saving = false;

	/** @type {any} */
	const coerceBoolean = (input, fallback = false) => {
		if (input === true) return true;
		if (input === false) return false;
		return fallback;
	};

	$: registerEnabled = /** @type {any} */ (coerceBoolean(value?.register, true));
	$: cancelEnabled = /** @type {any} */ (coerceBoolean(value?.cancel, true));

	/**
	 * @param {any} patch
	 */
	function emitChange(patch) {
		if (typeof onChange === 'function') {
			onChange({ register: registerEnabled, cancel: cancelEnabled, ...patch });
		}
	}

	/**
	 * @param {any} key
	 * @param {any} checked
	 */
	function handleToggle(key, checked) {
		/** @type {any} */
		const patch = {};
		if (key === 'register') {
			registerEnabled = checked;
			patch.register = checked;
		} else if (key === 'cancel') {
			cancelEnabled = checked;
			patch.cancel = checked;
		}
		emitChange(patch);
	}
</script>

<div class="space-y-4">
	<div class="preset-tonal-surface divide-y overflow-hidden rounded-xl">
		<div class="bg-surface-800/30 flex items-center gap-4 px-4 py-3">
			<Toggle
				name="host-register"
				ariaLabel="Notify hosts when a volunteer signs up"
				checked={registerEnabled}
				{disabled}
				onChange={(v) => handleToggle('register', v)}
			/>
			<p>
				New sign-up<span class="ml-2 text-xs opacity-60">When a volunteer registers</span>
			</p>
		</div>

		<div class="bg-surface-800/30 flex items-center gap-4 px-4 py-3">
			<Toggle
				name="host-cancel"
				ariaLabel="Notify hosts when a volunteer cancels"
				checked={cancelEnabled}
				{disabled}
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
