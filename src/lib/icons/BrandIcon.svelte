<script>
  export let path = '';
  export let title = '';
  export let className = '';
  export let ariaLabel = title || undefined;
</script>

<svg
  class={className}
  role="img"
  aria-label={ariaLabel}
  viewBox="0 0 24 24"
  xmlns="http://www.w3.org/2000/svg"
  fill="currentColor"
>
  <path d={path} />
</svg>
