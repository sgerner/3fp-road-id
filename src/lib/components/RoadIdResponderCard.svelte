<script>
	import IconPhone from '@lucide/svelte/icons/phone';
	import { normalizePhoneNumber, formatPhoneNumber } from '#lib/utils/phone';
	import { normalizeMedicationItem, splitCommaItems } from '#lib/utils/roadId';

	let { profile = null, contacts = null, code = '', preview = false } = $props();

	const fullName = $derived(String(profile?.full_name ?? '').trim());
	const rawPhone = $derived(String(profile?.phone ?? '').trim());
	const dialablePhone = $derived(normalizePhoneNumber(rawPhone));
	const bloodType = $derived(String(profile?.blood_type ?? '').trim());
	const allergiesText = $derived(splitCommaItems(profile?.allergies ?? '').join(', '));
	const medicationText = $derived(
		splitCommaItems(profile?.medication ?? '', normalizeMedicationItem).join(', ')
	);
	const resolvedContacts = $derived(
		Array.isArray(contacts)
			? contacts
			: Array.isArray(profile?.emergency_contacts)
				? profile.emergency_contacts
				: []
	);
	const visibleContacts = $derived(
		resolvedContacts.filter(
			(item) =>
				String(item?.contact_name ?? '').trim() ||
				String(item?.contact_phone ?? '').trim() ||
				String(item?.contact_relationship ?? '').trim()
		)
	);
</script>

<div
	class={preview
		? 'bg-surface-950 text-surface-50 border-surface-500 flex flex-col border-2'
		: 'flex flex-col gap-10'}
>
	{#if preview}
		<div
			class="bg-tertiary-500 text-surface-950 border-surface-950 flex flex-wrap items-center justify-between gap-2 border-b-2 px-5 py-3"
		>
			<div class="flex items-center gap-2.5">
				<span class="bg-surface-950 h-2.5 w-2.5 shrink-0" aria-hidden="true"></span>
				<span class="text-xs font-black tracking-[0.2em] uppercase"> Responder View Preview </span>
			</div>
			{#if code}
				<span
					class="bg-surface-950 text-primary-500 px-2.5 py-1 text-xs font-black tracking-[0.18em] uppercase"
				>
					Code: {code}
				</span>
			{/if}
		</div>
	{/if}

	<div class={preview ? 'grid gap-8 p-6' : 'grid gap-12 lg:grid-cols-2'}>
		<div class="flex flex-col gap-5">
			<h3 class="text-surface-50! m-0 text-2xl font-black uppercase">Emergency Information</h3>
			<div class="border-surface-50 divide-surface-800 flex flex-col divide-y border-t-2">
				<div class="flex items-start justify-between gap-4 py-3.5 sm:items-center">
					<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">Name</span>
					<strong class="min-w-0 text-right text-lg font-black break-words">
						{fullName || 'Not provided'}
					</strong>
				</div>

				<div class="flex items-start justify-between gap-4 py-3.5 sm:items-center">
					<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">Phone</span>
					{#if rawPhone && dialablePhone}
						<a
							href={`tel:${dialablePhone}`}
							class="bg-surface-900 border-primary-500 text-primary-500 hover:bg-primary-500 hover:text-surface-950 inline-flex min-h-11 shrink-0 items-center gap-2 border-2 px-3.5 py-2 text-base font-black whitespace-nowrap transition"
						>
							<IconPhone class="h-4 w-4 shrink-0" />
							{formatPhoneNumber(rawPhone)}
						</a>
					{:else if rawPhone}
						<span class="text-base font-black">{rawPhone}</span>
					{:else}
						<span class="text-surface-300 text-sm">Not provided</span>
					{/if}
				</div>

				<div class="flex items-start justify-between gap-4 py-3.5 sm:items-center">
					<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
						Blood Type
					</span>
					{#if bloodType}
						<strong class="bg-tertiary-500 text-surface-950 px-3 py-1 text-base font-black">
							{bloodType}
						</strong>
					{:else}
						<span class="text-surface-300 text-sm">Not listed</span>
					{/if}
				</div>

				<div class="flex items-start justify-between gap-4 py-3.5">
					<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
						Allergies
					</span>
					{#if allergiesText}
						<strong class="max-w-[70%] min-w-0 text-right font-bold break-words">
							{allergiesText}
						</strong>
					{:else}
						<span class="text-surface-300 text-sm">None listed</span>
					{/if}
				</div>

				<div class="flex items-start justify-between gap-4 py-3.5">
					<span class="text-primary-500 text-xs font-bold tracking-[0.22em] uppercase">
						Medication
					</span>
					{#if medicationText}
						<strong class="max-w-[70%] min-w-0 text-right font-bold break-words">
							{medicationText}
						</strong>
					{:else}
						<span class="text-surface-300 text-sm">None listed</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-5">
			<h3 class="text-surface-50! m-0 text-2xl font-black uppercase">Emergency Contacts</h3>
			<div class="border-surface-50 border-t-2 pt-3">
				{#if visibleContacts.length}
					<ul class="divide-surface-800 m-0 list-none divide-y p-0">
						{#each visibleContacts as contact, idx (contact.id ?? `${contact.contact_name}-${idx}`)}
							{@const contactPhone = normalizePhoneNumber(contact.contact_phone)}
							<li class="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-1">
								<div class="min-w-0">
									<strong class="block font-black uppercase">
										{contact.contact_name || 'Emergency Contact'}
									</strong>
									{#if contact.contact_relationship}
										<span class="text-surface-300 text-xs font-bold tracking-wider uppercase">
											{contact.contact_relationship}
										</span>
									{/if}
								</div>
								{#if contactPhone}
									<a
										href={`tel:${contactPhone}`}
										class="bg-primary-500 text-surface-950 hover:bg-surface-50 inline-flex min-h-11 shrink-0 items-center gap-2 px-4 py-2 text-sm font-black whitespace-nowrap uppercase transition"
									>
										<IconPhone class="h-4 w-4 shrink-0" />
										{formatPhoneNumber(contact.contact_phone)}
									</a>
								{:else if contact.contact_phone}
									<span class="font-black">{contact.contact_phone}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-surface-300 m-0 py-2 text-sm">No emergency contacts provided.</p>
				{/if}
			</div>
		</div>
	</div>
</div>
