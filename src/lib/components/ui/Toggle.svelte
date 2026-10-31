<script>
	export let checked = false;
	export let disabled = false;
	export let name = '';
	export let ariaLabel = '';
	export let onChange = undefined; // Support optional callback

	function handleChange(e) {
		if (disabled) return;
		checked = e.currentTarget.checked;
		if (typeof onChange === 'function') {
			onChange(checked);
		}
	}
</script>

<label
	class="relative inline-flex cursor-pointer items-center {disabled
		? 'cursor-not-allowed opacity-50'
		: ''}"
>
	<input
		type="checkbox"
		{name}
		aria-label={ariaLabel || name || 'Toggle'}
		bind:checked
		{disabled}
		on:change={handleChange}
		class="peer sr-only"
	/>
	<div
		class="peer-focus-visible:ring-primary-400 h-6 w-11 rounded-full transition-colors duration-200 ease-in-out peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 {checked
			? 'preset-filled-primary-500'
			: 'preset-outlined-primary-800-200'}"
	>
		<div
			class="bg-surface-50 absolute top-[2px] left-[2px] h-5 w-5 rounded-full shadow-sm transition-transform duration-200 ease-in-out {checked
				? 'translate-x-full'
				: 'translate-x-0'}"
		></div>
	</div>
</label>
