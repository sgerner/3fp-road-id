<script>
	export let value = { register: true, cancel: true };
	export let onChange = () => {};
	export let disabled = false;
	export let saving = false;
	export let title = 'Host email notifications';
	export let description =
		'Let event hosts know when volunteers join or cancel so they can keep the plan on track.';

	const coerceBoolean = (input, fallback = false) => {
		if (input === true) return true;
		if (input === false) return false;
		return fallback;
	};

	$: registerEnabled = coerceBoolean(value?.register, true);
	$: cancelEnabled = coerceBoolean(value?.cancel, true);

	function emitChange(patch) {
		if (typeof onChange === 'function') {
			onChange({ register: registerEnabled, cancel: cancelEnabled, ...patch });
		}
	}

	function handleToggle(key, checked) {
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

<section
	class="border-surface-700 bg-surface-900/70 flex flex-col gap-4 rounded-2xl border p-5 shadow-lg shadow-black/20"
>
	<div class="space-y-1">
		<h3 class="!text-left text-lg font-semibold text-white">{title}</h3>
		{#if description}
			<p class="text-surface-300 text-sm leading-relaxed">{description}</p>
		{/if}
	</div>

	<div class="space-y-4">
		<label class="flex items-start gap-3 text-sm">
			<input
				type="checkbox"
				class="mt-1"
				checked={registerEnabled}
				{disabled}
				on:change={(event) => handleToggle('register', event.currentTarget.checked)}
			/>
			<div class="space-y-1">
				<p class="font-medium text-white">When someone registers</p>
				<p class="text-surface-400 text-xs leading-relaxed">
					Send a note to hosts any time a volunteer signs up for a shift—whether they’re approved
					immediately or waiting for review.
				</p>
			</div>
		</label>

		<label class="flex items-start gap-3 text-sm">
			<input
				type="checkbox"
				class="mt-1"
				checked={cancelEnabled}
				{disabled}
				on:change={(event) => handleToggle('cancel', event.currentTarget.checked)}
			/>
			<div class="space-y-1">
				<p class="font-medium text-white">When a volunteer cancels</p>
				<p class="text-surface-400 text-xs leading-relaxed">
					Hosts get an alert when someone backs out so they can invite replacements or adjust the
					plan.
				</p>
			</div>
		</label>
	</div>

	{#if saving}
		<p class="text-surface-400 text-xs italic">Saving your notification preferences…</p>
	{/if}
</section>
