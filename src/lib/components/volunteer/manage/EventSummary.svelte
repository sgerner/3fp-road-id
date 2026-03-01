<script>
	import IconUsers from '@lucide/svelte/icons/users';
	import IconCheckSquare from '@lucide/svelte/icons/check-square';
	import IconUserX from '@lucide/svelte/icons/user-x';
	import IconClock from '@lucide/svelte/icons/clock';

	export let title = 'Volunteer Event Management';
	export let status = '';
	export let schedule = '';
	export let location = '';
	export let description = '';
	export let counts = {
		total: 0,
		pending: 0,
		waitlisted: 0,
		declined: 0,
		approved: 0,
		attending: 0,
		hours: 0
	};

	const statusLabel = status ? status : 'Active';
</script>

<section class="flex flex-col gap-6 pb-6">
	<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
		<div class="space-y-2">
			<h1 class="text-surface-950-50 !text-left text-3xl font-bold">{title}</h1>
			{#if description}
				<p class="text-surface-700-300 max-w-2xl text-sm leading-relaxed">{description}</p>
			{/if}
			<div class="grid gap-4 md:grid-cols-3">
				<article
					class="bg-surface-100-900/70 border-surface-300-700 rounded-xl border px-4 py-1 shadow-lg"
				>
					<div class="text-surface-700-300 flex items-center justify-between text-sm">
						<span class=" text-surface-950-50 text-2xl font-semibold">{counts.total ?? 0}</span>
						<span>Signups</span>
						<IconUsers class="h-5 w-5" />
					</div>
				</article>
				<article
					class="bg-surface-100-900/70 border-surface-300-700 rounded-xl border px-4 py-1 shadow-lg"
				>
					<div class="text-surface-700-300 flex items-center justify-between text-sm">
						<span class="text-surface-950-50 text-2xl font-semibold">{counts.approved ?? 0}</span>
						<span>Approved</span>
						<IconCheckSquare class="h-5 w-5" />
					</div>
				</article>

				<article
					class="bg-surface-100-900/70 border-surface-300-700 rounded-xl border px-4 py-1 shadow-lg"
				>
					<div class="text-surface-700-300 flex items-center justify-between text-sm">
						<span class="text-surface-950-50 text-2xl font-semibold">{counts.pending ?? 0}</span>
						<span>Pending</span>
						<IconUserX class="h-5 w-5" />
					</div>
				</article>
			</div>
		</div>
		<div
			class="bg-surface-100-900/70 border-surface-300-700 flex flex-col gap-3 rounded-2xl border p-4 shadow-xl"
		>
			<div>
				<p class="text-surface-600-400 text-xs tracking-wide uppercase">Schedule</p>
				<p class="text-surface-900-100 mt-1 text-sm font-semibold">
					{schedule || 'Schedule coming soon'}
				</p>
			</div>
			<div>
				<p class="text-surface-600-400 text-xs tracking-wide uppercase">Location</p>
				<p class="text-surface-900-100 mt-1 text-sm font-semibold">
					{location || 'Location to be announced'}
				</p>
			</div>
		</div>
	</div>
</section>
