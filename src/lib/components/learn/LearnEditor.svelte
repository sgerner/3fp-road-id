<script>
	import { onMount } from 'svelte';
	import '@toast-ui/editor/dist/toastui-editor.css';
	import { attachLearnEditorAccessibility } from '#lib/learn/editorAccessibility.js';

	let {
		name = 'bodyMarkdown',
		modeName = 'editorMode',
		value = '',
		mode = 'wysiwyg',
		height = '560px',
		placeholder = 'Write something useful.',
		label = 'Article',
		ariaLabel = '',
		onReady = null
	} = $props();

	const instanceId = $props.id();
	const labelId = `${instanceId}-label`;
	const hasVisibleLabel = $derived(Boolean(String(label ?? '').trim()));
	const resolvedAriaLabel = $derived(
		String(ariaLabel ?? '').trim() ||
			String(label ?? '').trim() ||
			String(placeholder ?? '').trim() ||
			'Rich text editor'
	);

	/** @type {HTMLDivElement | null} */
	let editorEl = $state(null);
	/** @type {HTMLTextAreaElement | null} */
	let textareaEl = $state(null);
	/** @type {HTMLInputElement | null} */
	let modeEl = $state(null);
	let currentMode = $state('wysiwyg');
	let lastExternalValue = '';
	/** @type {any} */
	let editor = null;
	/** @type {any} */
	let detachAccessibility = null;
	let ready = $state(false);

	$effect(() => {
		if (!ready) {
			currentMode = mode === 'markdown' ? 'markdown' : 'wysiwyg';
		}
	});

	$effect(() => {
		const nextLabelId = hasVisibleLabel ? labelId : '';
		const nextAriaLabel = resolvedAriaLabel;
		if (!ready || !detachAccessibility) return;
		detachAccessibility.sync({
			labelId: nextLabelId,
			ariaLabel: nextAriaLabel
		});
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
		detachAccessibility?.sync({
			labelId: hasVisibleLabel ? labelId : '',
			ariaLabel: resolvedAriaLabel
		});
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

	function setMarkdown(nextValue) {
		if (!editor || !ready) return false;
		const normalized = String(nextValue ?? '');
		try {
			editor.setMarkdown(normalized, false);
			lastExternalValue = normalized;
			syncHiddenFields();
			editor.focus();
			return true;
		} catch {
			return false;
		}
	}

	$effect(() => {
		const normalized = String(value ?? '');
		if (!ready || !editor) {
			lastExternalValue = normalized;
			return;
		}
		if (normalized === lastExternalValue) return;
		if (editor.getMarkdown() !== normalized) {
			editor.setMarkdown(normalized, false);
			syncHiddenFields();
		}
		lastExternalValue = normalized;
	});

	onMount(() => {
		let destroyed = false;
		void (async () => {
			const mod = await import('@toast-ui/editor');
			if (destroyed) return;
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

			detachAccessibility = attachLearnEditorAccessibility(editorEl, {
				editor,
				labelId: hasVisibleLabel ? labelId : '',
				ariaLabel: resolvedAriaLabel
			});

			ready = true;
			syncHiddenFields();
			onReady?.({
				insertSnippet,
				setMarkdown,
				focus: () => editor?.focus?.(),
				getMarkdown: () => editor?.getMarkdown?.() ?? ''
			});
		})();

		return () => {
			destroyed = true;
			ready = false;
			onReady?.(null);
			detachAccessibility?.destroy?.();
			detachAccessibility = null;
			editor?.destroy?.();
			editor = null;
		};
	});
</script>

<div class="learn-editor-shell space-y-3">
	<div class="flex flex-wrap items-center justify-between gap-3">
		{#if hasVisibleLabel}
			<p id={labelId} class="label">{label}</p>
		{/if}
		<div
			class="border-surface-500/20 bg-surface-900/60 inline-flex rounded-full border p-1"
			role="group"
			aria-label="Editor format"
		>
			<button
				type="button"
				aria-pressed={currentMode !== 'markdown'}
				class="btn btn-sm {currentMode !== 'markdown'
					? 'preset-filled-primary-500'
					: 'preset-tonal-surface'}"
				onclick={() => changeMode('wysiwyg')}
			>
				Rich text
			</button>
			<button
				type="button"
				aria-pressed={currentMode === 'markdown'}
				class="btn btn-sm {currentMode === 'markdown'
					? 'preset-filled-primary-500'
					: 'preset-tonal-surface'}"
				onclick={() => changeMode('markdown')}
			>
				Markdown
			</button>
		</div>
	</div>

	<div class="learn-editor border-surface-500/20 overflow-hidden rounded-xl border">
		<div bind:this={editorEl}></div>
	</div>

	<textarea bind:this={textareaEl} {name} hidden readonly></textarea>
	<input bind:this={modeEl} name={modeName} type="hidden" value={mode} />
</div>

<style>
	.learn-editor :global(.toastui-editor-contents),
	.learn-editor :global(.toastui-editor-defaultUI .ProseMirror) {
		font-size: 16px;
		line-height: 1.75;
	}

	/* Toast UI Editor Customizations for Dark Theme */
	:global(.toastui-editor-defaultUI) {
		border: none !important;
	}

	:global(.toastui-editor-toolbar) {
		background: color-mix(in oklab, var(--color-surface-800) 95%, transparent) !important;
		border-bottom: 1px solid color-mix(in oklab, var(--color-surface-600) 25%, transparent) !important;
		padding: 8px !important;
	}

	/* Toolbar buttons - no background styling */
	:global(.toastui-editor-toolbar button) {
		border: 1px solid color-mix(in oklab, var(--color-surface-400) 20%, transparent) !important;
		border-radius: 0.375rem !important;
		margin: 0 2px !important;
		min-width: 32px !important;
		min-height: 32px !important;
	}

	:global(.toastui-editor-toolbar button:hover) {
		border-color: color-mix(in oklab, var(--color-surface-300) 35%, transparent) !important;
	}

	:global(.toastui-editor-toolbar button.active) {
		border-color: color-mix(in oklab, var(--color-primary-400) 60%, transparent) !important;
	}

	/* The toolbar icons are white sprites on transparent - invert for dark theme */
	:global(.toastui-editor-toolbar-icons) {
		filter: invert(1) brightness(1.2) !important;
		opacity: 0.9 !important;
	}

	:global(.toastui-editor-toolbar button:hover .toastui-editor-toolbar-icons) {
		filter: invert(1) brightness(1.4) !important;
		opacity: 1 !important;
	}

	:global(.toastui-editor-toolbar button.active .toastui-editor-toolbar-icons) {
		filter: invert(1) brightness(1.4) !important;
		opacity: 1 !important;
	}

	:global(.toastui-editor-md-tab-container),
	:global(.toastui-editor-mode-switch) {
		background: color-mix(in oklab, var(--color-surface-800) 95%, transparent) !important;
		border-color: color-mix(in oklab, var(--color-surface-600) 25%, transparent) !important;
	}

	:global(.toastui-editor-md-tab-container button),
	:global(.toastui-editor-mode-switch button) {
		color: var(--color-surface-300) !important;
		background: transparent !important;
	}

	:global(.toastui-editor-md-tab-container button.active),
	:global(.toastui-editor-mode-switch button.active) {
		color: var(--color-primary-400) !important;
	}

	:global(.toastui-editor-defaultUI .ProseMirror) {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent) !important;
		color: var(--color-surface-200) !important;
	}

	:global(.toastui-editor-md-preview .toastui-editor-contents) {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent) !important;
	}

	:global(.toastui-editor-contents p),
	:global(.toastui-editor-contents li) {
		color: var(--color-surface-300) !important;
	}

	:global(.toastui-editor-ww-container),
	:global(.toastui-editor-md-container) {
		background: color-mix(in oklab, var(--color-surface-950) 70%, transparent) !important;
	}

	/* Ensure editor has proper min-height */
	:global(.toastui-editor .ProseMirror) {
		min-height: 200px !important;
	}

	@media only screen and (max-width: 480px) {
		.learn-editor :global(.toastui-editor-popup) {
			left: 0 !important;
			max-width: min(300px, 100%);
			margin-left: 0;
		}

		.learn-editor :global(.toastui-editor-dropdown-toolbar) {
			left: 0 !important;
			right: auto !important;
			max-width: 100%;
			height: auto;
			flex-wrap: wrap;
		}
	}
</style>
