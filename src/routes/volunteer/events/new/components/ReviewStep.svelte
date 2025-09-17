<script>
	import IconLoader from '@lucide/svelte/icons/loader-2';

	export let eventDetails;
	export let opportunities = [];
	export let customQuestions = [];
	export let eventEmails = [];
	export let saveError = '';
	export let saveSuccess = '';
	export let saving = false;
	export let onSubmit = () => {};
</script>

<div class="space-y-6">
	<div class="rounded border border-primary-500/30 bg-primary-500/10 p-4">
		<h3 class="font-semibold text-primary-100">Event snapshot</h3>
		<ul class="mt-3 space-y-1 text-sm text-primary-50">
			<li><strong>Title:</strong> {eventDetails.title || 'Unnamed event'}</li>
			<li>
				<strong>When:</strong> {eventDetails.eventStart || 'TBD'} → {eventDetails.eventEnd || 'TBD'} ({eventDetails.timezone})
			</li>
			<li><strong>Where:</strong> {eventDetails.locationName || 'Meetup TBD'}</li>
			<li><strong>Opportunities:</strong> {opportunities.length}</li>
			<li><strong>Custom questions:</strong> {customQuestions.length}</li>
			<li><strong>Emails queued:</strong> {eventEmails.length}</li>
		</ul>
	</div>

	{#if saveError}
		<p class="rounded border border-error-500/40 bg-error-500/10 p-3 text-sm text-error-200">{saveError}</p>
	{/if}
	{#if saveSuccess}
		<p class="rounded border border-success-500/40 bg-success-500/10 p-3 text-sm text-success-200">{saveSuccess}</p>
	{/if}

	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<p class="text-surface-500 text-sm">
			Hit save to write everything to Supabase. You can revisit this builder to tweak opportunities, shifts, and
			messaging later.
		</p>
		<button
			type="button"
			class="btn preset-filled-primary-500 flex items-center gap-2"
			onclick={onSubmit}
			disabled={saving}
		>
			{#if saving}
				<IconLoader class="h-4 w-4 animate-spin" />
			{/if}
			<span>{saving ? 'Saving…' : 'Save volunteer event'}</span>
		</button>
	</div>
</div>
