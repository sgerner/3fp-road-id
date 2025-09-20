<script>
	import { siDiscord } from 'simple-icons/icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
</script>

<BrandIcon path={siDiscord.path} title={siDiscord.title} {className} />
