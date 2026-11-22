<script>
	import LegalDocumentShell from '#lib/components/legal/LegalDocumentShell.svelte';
</script>

<LegalDocumentShell
	metaTitle="Privacy Policy | 3 Feet Please"
	metaDescription="Privacy Policy for 3 Feet Please, including account, social, and optional SMS data handling."
	headingId="privacy-heading"
	titlePrefix="Privacy"
	titleAccent="Policy"
	lead="3 Feet Please (&quot;3FP&quot;, &quot;we&quot;, &quot;our&quot;) respects your privacy. This policy explains what information we collect, how we use it, and your choices when using 3fp.org and related services."
	lastUpdated="September 23, 2026"
	currentPath="/privacy"
>
	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">01</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">
			Information We Collect
		</h2>
		<ul class="text-surface-200 m-0 list-disc space-y-2 pl-5 text-base leading-relaxed">
			<li>Account details you provide, such as email and profile information.</li>
			<li>
				If you opt in to SMS, your mobile number, selected notification categories, consent text and
				version, opt-in/opt-out timestamps, and delivery status.
			</li>
			<li>
				SMS message content and conversation context needed to deliver replies, ride or volunteer
				reminders, and future bike valet coordination. We store message text and media counts, but
				do not support or retain MMS files.
			</li>
			<li>Group and event information you submit for public pages and management tools.</li>
			<li>
				Usage and operational data, including logs needed to secure, maintain, and improve the
				service.
			</li>
			<li>
				When social tools are connected, limited Facebook/Instagram account metadata, post content,
				and comment data required to support publishing and engagement workflows.
			</li>
		</ul>
	</div>

	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">02</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">
			How We Use Information
		</h2>
		<ul class="text-surface-200 m-0 list-disc space-y-2 pl-5 text-base leading-relaxed">
			<li>Provide and operate the 3FP platform and requested features.</li>
			<li>Authenticate users and enforce group permission controls.</li>
			<li>Publish and schedule social posts when explicitly requested by authorized users.</li>
			<li>
				Send optional, recurring plain-text SMS messages that you request, including reminders for
				rides you RSVP for, volunteer shifts, messages from event administrators, and bike valet
				coordination when that feature is available.
			</li>
			<li>Process HELP, STOP, and START replies and maintain consent and delivery records.</li>
			<li>Respond to support requests, prevent abuse, and comply with legal obligations.</li>
		</ul>
	</div>

	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">03</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">Optional SMS Program</h2>
		<p class="text-surface-200 m-0 text-base leading-relaxed">
			SMS is optional and requires an authenticated user to provide a mobile number, choose a
			message category, and provide explicit consent. You can manage categories from your Profile.
			From a ride or volunteer page, you can also opt in for the relevant messages; if your Profile
			has no mobile number, signup asks you to enter one and confirm consent. We do not require a
			separate app-generated verification code; please enter only a number you control or are
			authorized to use. Message frequency varies based on your RSVPs, volunteer assignments, and
			conversations. Message and data rates may apply. Reply STOP to opt out, START to rejoin after
			opting out, or HELP for help. We send plain text only; multimedia messages are not supported.
			You can also pause categories from your profile or contact
			<a href="mailto:hi@3fp.org" class="text-primary-500 font-bold underline">hi@3fp.org</a>.
		</p>
	</div>

	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">04</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">
			Facebook and Instagram Data
		</h2>
		<p class="text-surface-200 m-0 text-base leading-relaxed">
			If you connect a Facebook Page or Instagram professional account, we use Meta APIs to read
			permitted account metadata, publish posts, and fetch comments for connected assets. Access
			tokens are stored server-side and are never exposed to clients.
		</p>
	</div>

	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">05</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">Sharing and Retention</h2>
		<p class="text-surface-200 m-0 text-base leading-relaxed">
			We do not sell personal data. We may share data with service providers that help us operate
			the platform (for example, hosting, infrastructure, email, database, and SignalWire SMS
			providers) under appropriate safeguards. SMS providers receive the phone number and message
			needed to send or receive a text. Data is retained only as long as needed for product
			operation, consent and delivery records, abuse prevention, compliance, and legitimate business
			needs.
		</p>
	</div>

	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">06</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">Your Choices</h2>
		<ul class="text-surface-200 m-0 list-disc space-y-2 pl-5 text-base leading-relaxed">
			<li>You can disconnect social accounts from the group social manager at any time.</li>
			<li>You can pause SMS categories, update your number, or opt out by replying STOP.</li>
			<li>
				You can request deletion of your account/social data via our
				<a href="/data-deletion" class="text-primary-500 font-bold underline">
					Data Deletion Instructions
				</a>.
			</li>
			<li>You can request account-related support by emailing us.</li>
		</ul>
	</div>

	<div
		class="border-surface-800 grid gap-4 border-b py-8 lg:grid-cols-[4.5rem_minmax(0,18rem)_minmax(0,1fr)] lg:gap-8"
	>
		<span
			class="text-tertiary-500 text-3xl leading-none font-black italic tabular-nums sm:text-4xl"
			aria-hidden="true">07</span
		>
		<h2 class="text-surface-50! m-0 text-2xl font-black uppercase italic">Contact</h2>
		<p class="text-surface-200 m-0 text-base leading-relaxed">
			Questions about this policy can be sent to
			<a href="mailto:hi@3fp.org" class="text-primary-500 font-bold underline">hi@3fp.org</a>.
		</p>
	</div>
</LegalDocumentShell>
