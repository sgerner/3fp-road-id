<script>
	let { text = '', className = '', linkClass = '' } = $props();

	const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

	function parseSegments(value) {
		const source = typeof value === 'string' ? value : String(value ?? '');
		if (!source) return [];

		const segments = [];
		let lastIndex = 0;
		for (const match of source.matchAll(URL_PATTERN)) {
			const matched = match[0] ?? '';
			const start = match.index ?? 0;
			const end = start + matched.length;

			if (start > lastIndex) {
				segments.push({ type: 'text', text: source.slice(lastIndex, start) });
			}

			let linkText = matched;
			let trailing = '';
			while (/[),.;!?]$/.test(linkText)) {
				trailing = linkText.slice(-1) + trailing;
				linkText = linkText.slice(0, -1);
			}

			if (linkText) {
				segments.push({
					type: 'link',
					text: linkText,
					href: linkText.startsWith('www.') ? `https://${linkText}` : linkText
				});
			}
			if (trailing) {
				segments.push({ type: 'text', text: trailing });
			}

			lastIndex = end;
		}

		if (lastIndex < source.length) {
			segments.push({ type: 'text', text: source.slice(lastIndex) });
		}

		return segments;
	}

	const segments = $derived(parseSegments(text));
</script>

<span class={className}>
	{#each segments as segment, idx (idx)}
		{#if segment.type === 'link'}
			<a
				href={segment.href}
				target="_blank"
				rel="noopener noreferrer"
				class={linkClass ||
					'text-primary-600-300 decoration-primary-500/60 underline underline-offset-2'}
			>
				{segment.text}
			</a>
		{:else}
			{segment.text}
		{/if}
	{/each}
</span>
