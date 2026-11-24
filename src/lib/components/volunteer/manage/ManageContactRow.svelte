<script lang="ts">
	import IconMail from '@lucide/svelte/icons/mail';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconShieldAlert from '@lucide/svelte/icons/shield-alert';
	import IconChevronDown from '@lucide/svelte/icons/chevron-down';
	import { slide } from 'svelte/transition';

	type Props = {
		name: string;
		email?: string;
		phone?: string;
		emergencyContactName?: string;
		emergencyContactPhone?: string;
		collapsibleEmergency?: boolean;
		emergencyExpanded?: boolean;
		onToggleEmergency?: (() => void) | undefined;
		class?: string;
	};

	const {
		name,
		email = '',
		phone = '',
		emergencyContactName = '',
		emergencyContactPhone = '',
		collapsibleEmergency = true,
		emergencyExpanded = undefined,
		onToggleEmergency = undefined,
		class: className = ''
	}: Props = $props();

	let localExpanded = $state(false);
	const isEmergencyOpen = $derived(
		emergencyExpanded !== undefined ? emergencyExpanded : localExpanded
	);

	function handleToggleEmergency() {
		if (onToggleEmergency) {
			onToggleEmergency();
		} else {
			localExpanded = !localExpanded;
		}
	}

	function formatPhoneNumber(value: string): string {
		if (!value) return '';
		const digits = String(value).replace(/\D/g, '');
		if (digits.length < 10) {
			return String(value).trim();
		}
		const tenDigits = digits.slice(-10);
		const area = tenDigits.slice(0, 3);
		const prefix = tenDigits.slice(3, 6);
		const line = tenDigits.slice(6);
		return `${area}-${prefix}-${line}`;
	}

	const trimmedEmail = $derived((email || '').trim());
	const trimmedPhone = $derived((phone || '').trim());
	const trimmedEmergencyName = $derived((emergencyContactName || '').trim());
	const trimmedEmergencyPhone = $derived((emergencyContactPhone || '').trim());
	const hasEmergency = $derived(Boolean(trimmedEmergencyName || trimmedEmergencyPhone));
</script>

<div class={`flex w-full min-w-0 flex-col gap-2 ${className}`}>
	{#if trimmedEmail || trimmedPhone}
		<div class="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap">
			{#if trimmedEmail}
				<a
					href={`mailto:${trimmedEmail}`}
					aria-label={`Email ${name || 'volunteer'} at ${trimmedEmail}`}
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-none border-2 px-3 py-2 text-xs font-bold transition-colors hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
				>
					<IconMail class="h-4 w-4 shrink-0" aria-hidden="true" />
					<span class="min-w-0 truncate">{trimmedEmail}</span>
				</a>
			{/if}

			{#if trimmedPhone}
				<a
					href={`tel:${trimmedPhone}`}
					aria-label={`Call ${name || 'volunteer'} at ${formatPhoneNumber(trimmedPhone)}`}
					class="border-surface-500 bg-surface-950 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-none border-2 px-3 py-2 text-xs font-bold tabular-nums transition-colors hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
				>
					<IconPhone class="h-4 w-4 shrink-0" aria-hidden="true" />
					<span class="min-w-0 truncate">{formatPhoneNumber(trimmedPhone)}</span>
				</a>
			{/if}
		</div>
	{/if}

	{#if hasEmergency}
		{#if collapsibleEmergency}
			<div class="flex min-w-0 flex-col gap-2">
				<button
					type="button"
					aria-expanded={isEmergencyOpen}
					aria-label={`Emergency contact for ${name || 'volunteer'}`}
					onclick={handleToggleEmergency}
					class="border-tertiary-400 bg-surface-950 text-surface-50 hover:bg-tertiary-500 hover:border-tertiary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex min-h-11 w-full min-w-11 items-center justify-between gap-2 rounded-none border-2 px-3 py-2 text-xs font-black tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
				>
					<span class="inline-flex items-center gap-2">
						<IconShieldAlert class="h-4 w-4 shrink-0" aria-hidden="true" />
						<span>Emergency Contact</span>
					</span>
					<IconChevronDown
						class={`h-4 w-4 shrink-0 transition-transform ${isEmergencyOpen ? 'rotate-180' : ''}`}
						aria-hidden="true"
					/>
				</button>

				{#if isEmergencyOpen}
					<div
						class="border-tertiary-500 bg-surface-950 flex flex-col gap-2 border-l-4 p-3"
						transition:slide
					>
						{#if trimmedEmergencyName}
							<p class="text-surface-50 m-0 text-sm font-bold">{trimmedEmergencyName}</p>
						{/if}
						{#if trimmedEmergencyPhone}
							<a
								href={`tel:${trimmedEmergencyPhone}`}
								aria-label={`Call emergency contact ${trimmedEmergencyName || 'for ' + name} at ${formatPhoneNumber(trimmedEmergencyPhone)}`}
								class="border-surface-500 bg-surface-900 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex min-h-11 w-full min-w-11 items-center gap-2 rounded-none border-2 px-3 py-2 text-xs font-bold tabular-nums transition-colors hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
							>
								<IconPhone class="h-4 w-4 shrink-0" aria-hidden="true" />
								<span class="min-w-0 truncate">{formatPhoneNumber(trimmedEmergencyPhone)}</span>
							</a>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<div class="border-tertiary-500 bg-surface-950 flex flex-col gap-2 border-l-4 p-3">
				<span class="text-surface-300 text-xs font-bold tracking-[0.18em] uppercase">
					Emergency Contact
				</span>
				{#if trimmedEmergencyName}
					<p class="text-surface-50 m-0 text-sm font-bold">{trimmedEmergencyName}</p>
				{/if}
				{#if trimmedEmergencyPhone}
					<a
						href={`tel:${trimmedEmergencyPhone}`}
						aria-label={`Call emergency contact ${trimmedEmergencyName || 'for ' + name} at ${formatPhoneNumber(trimmedEmergencyPhone)}`}
						class="border-surface-500 bg-surface-900 text-surface-50 hover:border-primary-500 hover:bg-primary-500 hover:text-surface-950 focus-visible:outline-primary-500 inline-flex min-h-11 w-full min-w-11 items-center gap-2 rounded-none border-2 px-3 py-2 text-xs font-bold tabular-nums transition-colors hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
					>
						<IconPhone class="h-4 w-4 shrink-0" aria-hidden="true" />
						<span class="min-w-0 truncate">{formatPhoneNumber(trimmedEmergencyPhone)}</span>
					</a>
				{/if}
			</div>
		{/if}
	{/if}
</div>
