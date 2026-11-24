<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type AccessibleNameProps =
		| {
				label: string;
				ariaLabel?: string;
				iconOnly?: boolean;
		  }
		| {
				label?: undefined;
				ariaLabel: string;
				iconOnly?: true;
		  };

	export type ActionTone =
		'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';

	export type ActionVariant = 'filled' | 'outlined';

	type Props = AccessibleNameProps & {
		icon?: Component<{ class?: string }>;
		tone?: ActionTone;
		variant?: ActionVariant;
		selected?: boolean;
		fullWidth?: boolean;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		title?: string;
		class?: string;
		onclick?: HTMLButtonAttributes['onclick'];
	};

	const {
		label,
		ariaLabel,
		iconOnly = false,
		icon: Icon = undefined,
		tone = 'surface',
		variant = 'filled',
		selected = undefined,
		fullWidth = false,
		type = 'button',
		disabled = false,
		title = undefined,
		class: className = '',
		onclick = undefined
	}: Props = $props();

	const showVisibleLabel = $derived(Boolean(label) && !iconOnly);
	const computedAriaLabel = $derived(ariaLabel ?? label);

	const toneClasses = $derived.by(() => {
		const isFilled = variant === 'filled' || selected === true;

		if (isFilled) {
			switch (tone) {
				case 'primary':
					return 'border-primary-500 bg-primary-500 text-surface-950 hover:bg-primary-400';
				case 'secondary':
					return 'border-secondary-500 bg-secondary-500 text-surface-50 hover:bg-primary-500 hover:border-primary-500 hover:text-surface-950';
				case 'tertiary':
					return 'border-tertiary-500 bg-tertiary-500 text-surface-950 hover:bg-primary-500 hover:border-primary-500';
				case 'success':
					return 'border-success-500 bg-success-500 text-surface-950 hover:bg-success-400';
				case 'warning':
					return 'border-warning-500 bg-warning-500 text-surface-950 hover:bg-warning-400';
				case 'error':
					return 'border-error-500 bg-error-500 text-surface-950 hover:bg-error-400';
				case 'surface':
				default:
					return 'border-surface-300 bg-surface-300 text-surface-950 hover:bg-primary-500 hover:border-primary-500';
			}
		}

		switch (tone) {
			case 'primary':
				return 'border-primary-500 bg-surface-950 text-primary-500 hover:bg-primary-500 hover:text-surface-950';
			case 'secondary':
				return 'border-secondary-300 bg-surface-950 text-surface-50 hover:bg-secondary-500 hover:border-secondary-500 hover:text-surface-50';
			case 'tertiary':
				return 'border-tertiary-400 bg-surface-950 text-surface-50 hover:bg-tertiary-500 hover:border-tertiary-500 hover:text-surface-950';
			case 'success':
				return 'border-success-500 bg-surface-950 text-success-300 hover:bg-success-500 hover:text-surface-950';
			case 'warning':
				return 'border-warning-500 bg-surface-950 text-warning-300 hover:bg-warning-500 hover:text-surface-950';
			case 'error':
				return 'border-error-400 bg-surface-950 text-error-200 hover:bg-error-500 hover:border-error-500 hover:text-surface-950';
			case 'surface':
			default:
				return 'border-surface-400 bg-surface-950 text-surface-50 hover:border-primary-500 hover:text-primary-500';
		}
	});
</script>

<button
	{type}
	{disabled}
	{title}
	aria-label={computedAriaLabel}
	aria-pressed={selected}
	{onclick}
	class={`focus-visible:outline-primary-500 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-none border-2 px-2.5 py-2 text-center text-xs leading-tight font-black tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
		fullWidth ? 'w-full' : ''
	} ${toneClasses} ${className}`}
>
	{#if Icon}
		<Icon class="h-4 w-4 shrink-0" />
	{/if}
	{#if showVisibleLabel}
		<span class="min-w-0 truncate">{label}</span>
	{:else}
		<span class="sr-only">{computedAriaLabel}</span>
	{/if}
</button>
