<script>
	import { siThreads } from 'simple-icons';
	import BrandIcon from './BrandIcon.svelte';
	export let className = '';
	let klass = '';
	export { klass as class };
</script>

<BrandIcon
	path={siThreads.path}
	title={siThreads.title}
	className={[className, klass].filter(Boolean).join(' ')}
/>
