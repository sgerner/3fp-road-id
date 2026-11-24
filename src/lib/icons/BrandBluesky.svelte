<script>
	import { siBluesky } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
	let klass = '';
	export { klass as class };
</script>

<BrandIcon
	path={siBluesky.path}
	title={siBluesky.title}
	className={[className, klass].filter(Boolean).join(' ')}
/>
