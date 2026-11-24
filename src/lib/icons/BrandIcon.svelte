<script>
	export let path = '';
	export let title = '';
	export let className = '';
	let klass = '';
	export { klass as class };
	export let ariaLabel = title || undefined;
</script>

<svg
	class={[className, klass].filter(Boolean).join(' ')}
	role="img"
	aria-label={ariaLabel}
	viewBox="0 0 24 24"
	xmlns="http://www.w3.org/2000/svg"
	fill="currentColor"
>
	<path d={path} />
</svg>
