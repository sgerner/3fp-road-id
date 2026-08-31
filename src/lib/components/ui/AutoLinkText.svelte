<script>
	let { text = '', className = '', linkClass = '' } = $props();

	const LINK_PATTERN =
		/(?:\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|\/)[^)]+)\))|((?:https?:\/\/|www\.)[^\s<]+)/gi;

	function safeHref(value) {
		const href = String(value || '').trim();
		if (
			/^(?:https?:\/\/|mailto:|tel:)/i.test(href) ||
			(href.startsWith('/') && !href.startsWith('//'))
		) {
			return href;
		}
		return '';
	}

	function parseSegments(value) {
		const source = typeof value === 'string' ? value : String(value ?? '');
		if (!source) return [];

		const segments = [];
		let lastIndex = 0;
		for (const match of source.matchAll(LINK_PATTERN)) {
			const markdownLabel = match[1] ?? '';
			const markdownHref = safeHref(match[2]);
			const matched = match[3] ?? '';
			const start = match.index ?? 0;
			const end = start + (match[0]?.length || 0);

			if (start > lastIndex) {
				segments.push({ type: 'text', text: source.slice(lastIndex, start) });
			}

			if (match[1] !== undefined) {
				segments.push(
					markdownHref
						? { type: 'link', text: markdownLabel, href: markdownHref }
						: { type: 'text', text: match[0] ?? '' }
				);
				lastIndex = end;
				continue;
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
				target={/^https?:\/\//i.test(segment.href) ? '_blank' : undefined}
				rel={/^https?:\/\//i.test(segment.href) ? 'noopener noreferrer' : undefined}
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
