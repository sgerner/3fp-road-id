<script>
  import { siThreads } from 'simple-icons/icons';
  import BrandIcon from './BrandIcon.svelte';
  export let className = '';
</script>

<BrandIcon path={siThreads.path} title={siThreads.title} className={className} />
