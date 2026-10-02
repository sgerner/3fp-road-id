<script>
	import LearnAuthoringForm from '$lib/components/learn/LearnAuthoringForm.svelte';

	const { data, form } = $props();
</script>

<LearnAuthoringForm {data} {form} editing />
