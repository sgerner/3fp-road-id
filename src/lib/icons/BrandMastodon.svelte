<script>
  import { siMastodon } from 'simple-icons/icons';
  import BrandIcon from './BrandIcon.svelte';
  export let className = '';
</script>

<BrandIcon path={siMastodon.path} title={siMastodon.title} className={className} />
