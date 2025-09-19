<script>
	import IconAlertCircle from '@lucide/svelte/icons/alert-circle';
	import IconCheck from '@lucide/svelte/icons/check';
	import IconLoader from '@lucide/svelte/icons/loader-2';

	import VolunteerContactFields from './VolunteerContactFields.svelte';
	import VolunteerQuestionList from './VolunteerQuestionList.svelte';
	import VolunteerSelectedShifts from './VolunteerSelectedShifts.svelte';

	export let form = {};
	export let requiresShiftSelection = false;
	export let selectedShifts = [];
	export let questions = [];
	export let hasExistingSignup = false;
	export let onSubmit = () => {};
	export let onRemoveShift = () => {};
	export let onFieldChange = () => {};
</script>

<form class="space-y-4" onsubmit={(event) => onSubmit(event)}>
	<VolunteerSelectedShifts
		{selectedShifts}
		requiresSelection={requiresShiftSelection}
		{onRemoveShift}
	/>

	<div class="border-surface-500/30 bg-surface-900/40 space-y-4 rounded-2xl border p-4">
		<h5 class="text-secondary-100 text-sm font-semibold tracking-wide uppercase">
			Volunteer details & questions
		</h5>
		<VolunteerContactFields values={form} onChange={onFieldChange} disabled={form.loading} />
		<VolunteerQuestionList {questions} />
	</div>

	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<div class="text-surface-400 text-xs">
			We will email shift confirmations and check-ins to the address you provide above.
		</div>
		<button
			type="submit"
			class="btn preset-filled-primary-500 flex items-center gap-2"
			disabled={form.loading || (requiresShiftSelection && selectedShifts.length === 0)}
		>
			{#if form.loading}
				<IconLoader class="h-4 w-4 animate-spin" />
			{/if}
			<span>{hasExistingSignup ? 'Update signup' : 'Sign me up'}</span>
		</button>
	</div>

	{#if form.error}
		<p
			class="border-error-500/40 bg-error-500/10 text-error-200 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
		>
			<IconAlertCircle class="h-4 w-4" />
			<span>{form.error}</span>
		</p>
	{/if}
	{#if form.success}
		<p
			class="border-success-500/40 bg-success-500/10 text-success-200 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
		>
			<IconCheck class="h-4 w-4" />
			<span>{form.success}</span>
		</p>
	{/if}
</form>
