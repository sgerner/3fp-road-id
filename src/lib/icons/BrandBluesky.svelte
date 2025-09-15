<script>
  import { siBluesky } from 'simple-icons/icons';
  import BrandIcon from './BrandIcon.svelte';
  export let className = '';
</script>

<BrandIcon path={siBluesky.path} title={siBluesky.title} className={className} />
