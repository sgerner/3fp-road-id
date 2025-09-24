<script>
	import IconUsers from '@lucide/svelte/icons/users';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconMail from '@lucide/svelte/icons/mail';

	export let volunteers = [];
	export let shiftMap;

	function shiftLabels(volunteer) {
		const ids = volunteer?.shiftIds ?? [];
		if (!ids.length) return ['Unassigned'];
		return ids
			.map((id) =>
				shiftMap?.get ? (shiftMap.get(id)?.optionLabel ?? shiftMap.get(id)?.windowLabel) : null
			)
			.filter(Boolean);
	}
</script>

<section
	class="border-surface-700 bg-surface-900/70 rounded-2xl border p-6 shadow-xl shadow-black/30"
>
	<div class="flex items-center justify-between gap-4">
		<div>
			<h2 class="!text-left text-xl font-semibold text-white">Approved Volunteers</h2>
			<p class="text-surface-300 text-sm">Day-of roster for quick reference and contact.</p>
		</div>
		<span
			class="bg-surface-800 text-surface-200 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm"
		>
			<IconUsers class="h-4 w-4" />
			{volunteers.length} approved
		</span>
	</div>

	{#if volunteers.length}
		<div class="mt-4 grid gap-4 md:grid-cols-2">
			{#each volunteers as volunteer (volunteer.id)}
				<article class="bg-surface-950/40 border-surface-700/60 rounded-xl border p-4">
					<header class="flex items-center justify-between">
						<p class="text-lg font-semibold text-white">{volunteer.name}</p>
					</header>
					<div class="text-surface-400 text-xs tracking-wide uppercase">
						{shiftLabels(volunteer).join(' • ')}
					</div>
					{#if volunteer.email}
						<p class="text-surface-300 mt-2 flex items-center gap-2 text-sm">
							<IconMail class="h-4 w-4" />
							<span>{volunteer.email}</span>
						</p>
					{/if}
					{#if volunteer.phone}
						<p class="text-surface-400 flex items-center gap-2 text-xs">
							<IconPhone class="h-4 w-4" />
							<span>{volunteer.phone}</span>
						</p>
					{/if}
					<p class="text-surface-500 mt-3 text-xs">
						{volunteer.attended && volunteer.checkIn
							? `Checked in ${volunteer.checkIn}`
							: 'Awaiting arrival'}
					</p>
				</article>
			{/each}
		</div>
	{:else}
		<p class="text-surface-400 mt-4 text-sm">No approved volunteers yet.</p>
	{/if}
</section>
