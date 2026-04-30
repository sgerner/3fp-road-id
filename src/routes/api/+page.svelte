<script>
	let { data } = $props();

	const canonicalUrl = $derived(data.siteOrigin ? `${data.siteOrigin}/api` : '/api');
</script>

<svelte:head>
	<title>API — 3 Feet Please</title>
	<meta
		name="description"
		content="Public API discovery, OpenAPI metadata, and health checks for 3 Feet Please."
	/>
	<link rel="canonical" href={canonicalUrl} />
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-10">
	<div class="space-y-4">
		<p class="text-surface-600-400 text-sm font-semibold tracking-[0.2em] uppercase">
			API discovery
		</p>
		<h1 class="text-3xl font-black tracking-tight">Public API</h1>
		<p class="text-surface-700-300 max-w-2xl">
			Discovery metadata, a lightweight health check, and machine-readable documentation for the
			public endpoints exposed by this site.
		</p>
	</div>

	<div class="mt-8 grid gap-4 md:grid-cols-3">
		<a href="/.well-known/api-catalog" class="card border p-4">
			<div class="text-sm font-semibold">API catalog</div>
			<div class="text-surface-700-300 mt-1 text-sm">Linkset metadata for automated discovery.</div>
		</a>
		<a href="/api/openapi.json" class="card border p-4">
			<div class="text-sm font-semibold">OpenAPI spec</div>
			<div class="text-surface-700-300 mt-1 text-sm">Machine-readable endpoint descriptions.</div>
		</a>
		<a href="/api/health" class="card border p-4">
			<div class="text-sm font-semibold">Health check</div>
			<div class="text-surface-700-300 mt-1 text-sm">A simple JSON status response.</div>
		</a>
	</div>

	<div class="mt-8 space-y-2">
		<p class="text-sm font-semibold">Useful endpoints</p>
		<ul class="text-surface-700-300 list-disc space-y-1 pl-5 text-sm">
			<li><code>/api/v1/groups/check-slug</code></li>
			<li><code>/api/v1/groups/check-microsite-slug</code></li>
			<li><code>/api/timezone</code></li>
			<li><code>/api/geocode</code></li>
		</ul>
	</div>
</div>
