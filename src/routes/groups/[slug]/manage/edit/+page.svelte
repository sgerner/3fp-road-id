<script>
	import EditPage from '$lib/components/groups/GroupEditPage.svelte';
	import IconCheckCircle from '@lucide/svelte/icons/check-circle';
	import { slide } from 'svelte/transition';
	import { page } from '$app/stores';

	let { data, form } = $props();

	const showSaved = $derived($page.url.searchParams.get('saved') === '1');
</script>

<div class="edit-manage space-y-6 pb-10">
	{#if showSaved}
		<section
			class="success-banner relative overflow-hidden rounded-xl p-4"
			in:slide={{ duration: 250 }}
		>
			<div class="success-glow" aria-hidden="true"></div>
			<div class="relative z-10 flex items-start gap-3">
				<div
					class="bg-success-500/15 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
				>
					<IconCheckCircle class="text-success-400 h-5 w-5" />
				</div>
				<div>
					<h3 class="font-semibold">Changes saved successfully!</h3>
					<p class="text-surface-600-400 text-sm">
						Your group profile has been updated and is now live.
					</p>
				</div>
			</div>
		</section>
	{/if}

	<EditPage {data} {form} embedded={true} />
</div>

<style>
	.success-banner {
		background: color-mix(in oklab, var(--color-success-500) 10%, var(--color-surface-900) 90%);
		border: 1px solid color-mix(in oklab, var(--color-success-500) 25%, transparent);
	}

	.success-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse 50% 40% at 0% 50%,
			color-mix(in oklab, var(--color-success-500) 15%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}
</style>
