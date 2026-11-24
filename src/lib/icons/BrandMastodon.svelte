<script>
	import { siMastodon } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
	let klass = '';
	export { klass as class };
</script>

<BrandIcon
	path={siMastodon.path}
	title={siMastodon.title}
	className={[className, klass].filter(Boolean).join(' ')}
/>
