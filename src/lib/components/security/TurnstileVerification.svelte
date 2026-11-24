<script>
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';
	import {
		TURNSTILE_FAILURE_MESSAGE,
		TURNSTILE_TIMEOUT_MS,
		createTurnstileGate
	} from '#lib/security/turnstile';

	let {
		enabled = true,
		siteKey = PUBLIC_TURNSTILE_SITE_KEY,
		name = '',
		variant = 'public',
		timeoutMs = TURNSTILE_TIMEOUT_MS,
		failureMessage = TURNSTILE_FAILURE_MESSAGE,
		busy = $bindable(false),
		verifying = $bindable(false),
		error = $bindable(''),
		class: className = ''
	} = $props();

	/** @type {HTMLDivElement | null} */
	let slotEl = $state(null);
	let interactive = $state(false);

	function resolveSiteKey() {
		if (typeof window !== 'undefined' && window.__TURNSTILE_TEST_SITE_KEY__) {
			return String(window.__TURNSTILE_TEST_SITE_KEY__);
		}
		return String(siteKey || '');
	}

	const turnstileActive = $derived(
		Boolean(enabled) && Boolean(resolveSiteKey()) && page.data?.turnstileEnabled !== false
	);

	const gate = createTurnstileGate({
		isEnabled: () =>
			Boolean(enabled) && Boolean(resolveSiteKey()) && page.data?.turnstileEnabled !== false,
		getSiteKey: resolveSiteKey,
		prepareElement: async () => {
			await tick();
			return slotEl;
		},
		getTimeoutMs: () => timeoutMs,
		getFailureMessage: () => failureMessage,
		onStateChange: (next) => {
			verifying = next.verifying;
			busy = next.busy;
			interactive = next.interactive;
			error = next.error;
		}
	});

	$effect(() => {
		if (!turnstileActive) {
			gate.abort();
			gate.clearError();
		}
	});

	$effect(() => {
		return () => {
			gate.abort();
		};
	});

	export function requestToken() {
		return gate.requestToken();
	}

	export function submit(options) {
		return gate.submit(options);
	}

	export function enhance(options) {
		return gate.enhance({
			fieldName: name || 'turnstileToken',
			...options
		});
	}

	export function clearError() {
		gate.clearError();
	}

	const wrapperSpacingClass = $derived.by(() => {
		if (!verifying && !error) return 'contents';
		if (variant === 'modal') {
			return interactive || error
				? 'mt-2 flex w-full min-w-0 max-w-full flex-col gap-2'
				: 'w-full min-w-0 max-w-full';
		}
		if (variant === 'editor') {
			return interactive || error
				? 'mt-3 flex w-full min-w-0 max-w-full flex-col gap-2'
				: 'w-full min-w-0 max-w-full';
		}
		return 'flex w-full min-w-0 max-w-full flex-col gap-2';
	});

	const statusClass = $derived.by(() => {
		if (!error) return 'sr-only';
		if (variant === 'modal') {
			return 'bg-error-500 text-surface-950 rounded-md px-3 py-2 text-xs font-semibold';
		}
		if (variant === 'editor') {
			return 'bg-error-500 text-surface-950 px-3.5 py-2 text-xs font-bold';
		}
		return 'bg-error-500 text-surface-950 px-4 py-2.5 text-xs font-black tracking-wide uppercase';
	});
</script>

<div
	data-turnstile-verification
	data-turnstile-variant={variant}
	data-turnstile-active={turnstileActive ? 'true' : 'false'}
	class="{wrapperSpacingClass} {verifying || error ? className : ''}"
>
	{#if name}
		<input type="hidden" {name} value="" />
	{/if}
	{#if verifying}
		<div
			bind:this={slotEl}
			data-turnstile-slot
			data-turnstile-interactive={interactive ? 'true' : undefined}
			class="w-full max-w-full min-w-0"
		></div>
	{/if}
	<div
		role="status"
		aria-live="polite"
		aria-atomic="true"
		data-turnstile-status
		class={statusClass}
	>
		{error}
	</div>
</div>
