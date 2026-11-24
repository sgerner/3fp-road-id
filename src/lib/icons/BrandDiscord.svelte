<script>
	import { siDiscord } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
	let klass = '';
	export { klass as class };
</script>

<BrandIcon
	path={siDiscord.path}
	title={siDiscord.title}
	className={[className, klass].filter(Boolean).join(' ')}
/>
