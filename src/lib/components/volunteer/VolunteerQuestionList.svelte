<script>
	import { renderMarkdown } from '$lib/markdown';

	export let questions = [];
	export let heading = 'Signup questions you’ll answer';
</script>

{#if questions.length}
	<div class="border-surface-500/40 bg-surface-800/40 rounded-xl border p-4 text-xs">
		<p class="text-surface-300 mb-2 font-semibold tracking-wide uppercase">{heading}</p>
		<ul class="space-y-1">
			{#each questions as question (question.id)}
				<li class="text-surface-200">
					<strong>{question.label}</strong>
					{#if question.is_required}
						<span class="text-warning-300 ml-1">(required)</span>
					{/if}
					{#if question.help_text}
						<div class="text-surface-400 mt-1 text-xs">
							{@html renderMarkdown(question.help_text)}
						</div>
					{/if}
					{#if question.options?.length}
						<ul class="text-surface-300 mt-1 flex flex-wrap gap-2 text-[11px]">
							{#each question.options as option}
								<li class="chip preset-tonal-surface">{option}</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
