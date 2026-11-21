<script>
	let { children } = $props();
</script>

<!-- Lane Lines asphalt ground for every admin page (see docs/design-language.md). -->
<div
	class="admin-shell bg-surface-950 text-surface-50 -m-4 flex min-h-[calc(100dvh-var(--app-header-height))] flex-col"
>
	{@render children()}
</div>

<style>
	/* app.css colors headings with primary-950-50, which disappears on asphalt in light mode. */
	.admin-shell :global(:is(h1, h2, h3, h4, h5, h6)) {
		color: var(--color-surface-50);
	}

	/* Skeleton's default field colors follow the light/dark theme; this ground never changes. */
	.admin-shell :global(:is(.input, .select, .textarea)) {
		background-color: var(--color-surface-950);
		border-color: var(--color-surface-500);
		color: var(--color-surface-50);
	}

	.admin-shell :global(:is(.input, .select, .textarea):focus) {
		border-color: var(--color-primary-500);
	}

	.admin-shell :global(:is(.input, .textarea)::placeholder) {
		color: var(--color-surface-400);
	}

	/* The Forms plugin draws a white check, so checked boxes need a dark fill (violet). */
	.admin-shell :global(.checkbox) {
		background-color: var(--color-surface-950);
		border: 2px solid var(--color-surface-400);
	}

	.admin-shell :global(.checkbox:checked) {
		background-color: var(--color-secondary-500);
		border-color: var(--color-secondary-500);
	}

	/* Outlined presets only set a 1px border, so give them the heavy outline and light text
	   (anchor buttons would otherwise take the lemon link color). */
	.admin-shell :global(.btn[class*='preset-outlined']) {
		border-width: 2px;
		color: var(--color-surface-50);
	}

	.admin-shell :global(.btn[class*='preset-outlined-surface']:hover) {
		border-color: var(--color-primary-500);
		color: var(--color-primary-500);
	}

	/* Filled error buttons need dark text to reach AA, like the other saturated fields. */
	.admin-shell {
		--color-error-contrast-500: var(--color-surface-950);
	}
</style>
