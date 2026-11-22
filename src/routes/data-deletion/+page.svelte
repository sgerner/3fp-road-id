<script>
	import LegalDocumentShell from '#lib/components/legal/LegalDocumentShell.svelte';
</script>

<LegalDocumentShell
	metaTitle="Data Deletion Instructions | 3 Feet Please"
	metaDescription="Instructions for requesting deletion of your 3 Feet Please account and connected social data."
	headingId="data-deletion-heading"
	titlePrefix="Data Deletion"
	titleAccent="Instructions"
	lead="You can request deletion of your data from 3 Feet Please at any time. This page satisfies Meta's requirement for Facebook/Instagram-connected apps to provide data deletion instructions."
	lastUpdated="March 14, 2026"
	currentPath="/data-deletion"
	headingSizeClass="text-[clamp(2.6rem,6.4vw,5.75rem)]"
>
	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">01</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">
			Option 1: Disconnect Connected Social Accounts
		</h2>
		<p class="text-surface-200 m-0 text-base leading-relaxed">
			If you only want to stop Facebook/Instagram publishing access, disconnect your social accounts
			from the Group Social Manager on your claimed group page.
		</p>
	</div>

	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">02</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">
			Option 2: Request Full Data Deletion
		</h2>
		<ol class="text-surface-200 m-0 list-decimal space-y-2 pl-5 text-base leading-relaxed">
			<li>
				Email <a href="mailto:hi@3fp.org" class="text-primary-500 font-bold underline">hi@3fp.org</a
				> from your account email.
			</li>
			<li>Use subject line: "Data Deletion Request".</li>
			<li>
				Include your 3FP account email and, if relevant, the group slug(s) tied to the connected
				social accounts.
			</li>
		</ol>
	</div>

	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">03</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">What We Delete</h2>
		<ul class="text-surface-200 m-0 list-disc space-y-2 pl-5 text-base leading-relaxed">
			<li>Stored social access tokens and account connection records for the requested scope.</li>
			<li>Cached social comments and locally tracked replies associated with those connections.</li>
			<li>
				Social post drafts/scheduling history and uploaded social media assets where applicable.
			</li>
			<li>Account/profile data as part of full account deletion requests.</li>
		</ul>
	</div>

	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">04</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">Processing Time</h2>
		<p class="text-surface-200 m-0 text-base leading-relaxed">
			We typically process deletion requests within 30 days and will confirm completion by email.
		</p>
	</div>
</LegalDocumentShell>
