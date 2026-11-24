<script>
	let { dateLabel, itemLabel, items, hiddenCount } = $props();
	const headingId = $props.id();
	let dialog = $state();
</script>

<button
	type="button"
	class="text-primary-500 hover:text-surface-50 min-h-6 shrink-0 self-start text-left text-[10px] font-black uppercase underline"
	aria-haspopup="dialog"
	aria-label={`+${hiddenCount} more. Show all ${itemLabel} for ${dateLabel}`}
	onclick={(event) => {
		event.currentTarget.focus();
		dialog.showModal();
	}}
>
	+{hiddenCount} more
</button>

<dialog
	bind:this={dialog}
	aria-labelledby={headingId}
	class="border-primary-500 bg-surface-950 text-surface-50 fixed inset-0 m-auto max-h-[85dvh] w-[min(32rem,calc(100%-2rem))] overflow-y-auto border-t-4 p-5 backdrop:bg-black/70"
>
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<h2 id={headingId} class="text-surface-50! m-0 text-xl font-black">
			{itemLabel} for {dateLabel}
		</h2>
		<form method="dialog">
			<button
				class="bg-primary-500 text-surface-950 hover:bg-surface-50 min-h-11 px-4 text-sm font-black uppercase"
			>
				Close
			</button>
		</form>
	</div>
	<ul class="border-surface-800 divide-surface-800 divide-y border-t border-b">
		{#each items as item}
			<li>
				<a
					class="hover:bg-primary-500 hover:text-surface-950 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2 py-3 font-semibold hover:no-underline"
					href={item.href}
				>
					<span class="shrink-0 tabular-nums">{item.time}</span>
					{#if item.timezoneBadge}
						<span
							class="border-surface-600 bg-surface-950 text-primary-500 shrink-0 border px-1.5 py-0.5 text-[10px] leading-none font-black tracking-[0.14em] uppercase"
						>
							{item.timezoneBadge}
						</span>
					{/if}
					<span class="min-w-0 wrap-anywhere">{item.title}</span>
				</a>
			</li>
		{/each}
	</ul>
</dialog>
