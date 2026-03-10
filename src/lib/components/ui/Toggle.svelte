<script>
	export let checked = false;
	export let disabled = false;
	export let name = '';
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
	<input type="checkbox" {name} bind:checked {disabled} on:change={handleChange} class="sr-only" />
	<div
		class="h-6 w-11 rounded-full transition-colors duration-200 ease-in-out {checked
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
