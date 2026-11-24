<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		columns?: 1 | 2 | 3;
		ariaLabel?: string;
		class?: string;
		children: Snippet;
	};

	const { columns = 3, ariaLabel = undefined, class: className = '', children }: Props = $props();

	const gridClasses = $derived.by(() => {
		switch (columns) {
			case 1:
				return 'grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-3';
			case 2:
				return 'grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center';
			case 3:
			default:
				return 'grid w-full min-w-0 grid-cols-3 gap-2 md:flex md:w-auto md:flex-wrap md:items-center';
		}
	});
</script>

<div
	role={ariaLabel ? 'group' : undefined}
	aria-label={ariaLabel}
	class={`${gridClasses} ${className}`}
>
	{@render children()}
</div>
