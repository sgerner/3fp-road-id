<script>
	import { onMount } from 'svelte';

	let {
		name = 'bodyMarkdown',
		modeName = 'editorMode',
		value = '',
		mode = 'wysiwyg',
		height = '560px',
		placeholder = 'Write something useful.',
		label = 'Article',
		onReady = null
	} = $props();

	let editorEl = $state(null);
	let textareaEl = $state(null);
	let modeEl = $state(null);
	let currentMode = $state('wysiwyg');
	let editor = null;
	let ready = $state(false);

	$effect(() => {
		if (!ready) {
			currentMode = mode === 'markdown' ? 'markdown' : 'wysiwyg';
		}
	});

	function syncHiddenFields() {
		if (!editor || !textareaEl || !modeEl) return;
		textareaEl.value = editor.getMarkdown();
		currentMode = editor.isMarkdownMode() ? 'markdown' : 'wysiwyg';
		modeEl.value = currentMode;
	}

	function changeMode(nextMode) {
		if (!editor || !ready) return;
		editor.changeMode(nextMode === 'markdown' ? 'markdown' : 'wysiwyg', true);
		syncHiddenFields();
	}

	function insertSnippet(text) {
		if (!editor || !ready || !text) return false;
		try {
			editor.insertText(text);
			editor.focus();
			syncHiddenFields();
			return true;
		} catch {
			return false;
		}
	}

	onMount(async () => {
		const mod = await import('@toast-ui/editor');
		const Editor = mod.Editor;

		editor = new Editor({
			el: editorEl,
			height,
			initialEditType: mode === 'markdown' ? 'markdown' : 'wysiwyg',
			initialValue: value || '',
			hideModeSwitch: true,
			placeholder,
			usageStatistics: false,
			events: {
				change: syncHiddenFields
			}
		});

		ready = true;
		syncHiddenFields();
		onReady?.({
			insertSnippet,
			focus: () => editor?.focus?.(),
			getMarkdown: () => editor?.getMarkdown?.() ?? ''
		});

		return () => {
			onReady?.(null);
			editor?.destroy?.();
			editor = null;
		};
	});
</script>

<div class="learn-editor-shell space-y-3">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="label">{label}</p>
		<div class="border-surface-500/20 bg-surface-900/60 inline-flex rounded-full border p-1">
			<button
				type="button"
				class="btn btn-sm {currentMode !== 'markdown'
					? 'preset-filled-primary-500'
					: 'preset-tonal-surface'}"
				onclick={() => changeMode('wysiwyg')}
			>
				Rich text
			</button>
			<button
				type="button"
				class="btn btn-sm {currentMode === 'markdown'
					? 'preset-filled-primary-500'
					: 'preset-tonal-surface'}"
				onclick={() => changeMode('markdown')}
			>
				Markdown
			</button>
		</div>
	</div>

	<div
		class="learn-editor border-surface-500/20 bg-surface-950/55 rounded-[1.75rem] border p-2 shadow-xl"
	>
		<div bind:this={editorEl}></div>
	</div>

	<textarea bind:this={textareaEl} {name} hidden readonly></textarea>
	<input bind:this={modeEl} name={modeName} type="hidden" value={mode} />
</div>
