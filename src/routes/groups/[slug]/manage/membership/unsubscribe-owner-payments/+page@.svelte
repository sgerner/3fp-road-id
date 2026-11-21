<script>
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Membership payment emails | 3 Feet Please</title>
</svelte:head>

<section class="mx-auto max-w-xl space-y-4 p-6">
	<h1 class="h2">Membership payment emails</h1>
	{#if form?.unsubscribed}
		<p role="status">You’re unsubscribed from membership payment emails for this group.</p>
	{:else}
		<p>Turn off membership payment emails for this group.</p>
		{#if form?.error}
			<p role="alert">{form.error}</p>
		{/if}
		{#if data.user}
			<form method="POST">
				<button class="btn preset-filled-primary-500" type="submit">Unsubscribe</button>
			</form>
		{:else}
			<button
				class="btn preset-filled-primary-500"
				type="button"
				onclick={() => window.dispatchEvent(new Event('open-login'))}
			>
				Sign in
			</button>
		{/if}
	{/if}
</section>
