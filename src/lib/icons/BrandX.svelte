<script>
  import { siX } from 'simple-icons/icons';
  import BrandIcon from './BrandIcon.svelte';
  export let className = '';
</script>

<BrandIcon path={siX.path} title={siX.title} className={className} />
