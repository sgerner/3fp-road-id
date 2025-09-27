<script>
	import IconUsers from '@lucide/svelte/icons/users';
	import IconPhone from '@lucide/svelte/icons/phone';
	import IconMail from '@lucide/svelte/icons/mail';
	import IconDownload from '@lucide/svelte/icons/download';
	import IconPrinter from '@lucide/svelte/icons/printer';
	import { SvelteMap } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';

	const {
		volunteers = [],
		shiftMap = new SvelteMap(),
		onPresent = (/** @type {string} */ assignmentId, /** @type {boolean} */ isPresent) => {},
		onBulkPresent = (/** @type {string[]} */ assignmentIds) => {}
	} = $props();

	const shiftsWithVolunteers = $derived.by(() => {
		const map = new SvelteMap();
		for (const volunteer of volunteers) {
			// Only include approved volunteers in this roster
			if (volunteer.status !== 'approved') continue;

			for (const assignment of volunteer.assignments) {
				const shiftId = assignment.shiftId;
				if (!shiftId) continue;

				if (!map.has(shiftId)) {
					map.set(shiftId, {
						shift: shiftMap.get(shiftId),
						volunteers: []
					});
				}
				map.get(shiftId)?.volunteers.push({
					...volunteer,
					assignmentId: assignment.id,
					attended: assignment.attended
				});
			}
		}

		return Array.from(map.values()).sort((a, b) => {
			const timeA = a.shift?.startsAt ? new Date(a.shift.startsAt).getTime() : 0;
			const timeB = b.shift?.startsAt ? new Date(b.shift.startsAt).getTime() : 0;
			return timeA - timeB;
		});
	});

	function handleMarkAllPresent(volunteersInShift) {
		const assignmentIds = volunteersInShift
			.map((v) => v.assignmentId)
			.filter((id) => id !== null && id !== undefined);
		if (assignmentIds.length > 0) {
			onBulkPresent(assignmentIds);
		}
	}

	let expandedContacts = new SvelteMap();
	function toggleEmergencyVisibility(assignmentId) {
		if (!assignmentId) return;
		const current = expandedContacts.get(assignmentId) ?? false;
		expandedContacts.set(assignmentId, !current);
	}

	function formatPhoneNumber(value) {
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

	function formatCsvValue(value) {
		if (value === null || value === undefined) return '""';
		const str = String(value).replace(/"/g, '""');
		return `"${str}"`;
	}

	function exportCsv() {
		let csvContent =
			'data:text/csv;charset=utf-8,' +
			[
				'Volunteer Name',
				'Email',
				'Phone',
				'Emergency Contact Name',
				'Emergency Contact Phone',
				'Shift',
				'Shift Time',
				'Status'
			].join(',') +
			'\n';

		shiftsWithVolunteers.forEach((group) => {
			const opportunityTitle = group.shift?.opportunityTitle ?? '';
			const shiftLabel = group.shift?.optionLabel ?? group.shift?.windowLabel ?? '';
			group.volunteers.forEach((v) => {
				const row = [
					formatCsvValue(v.name),
					formatCsvValue(v.email),
					formatCsvValue(v.phone),
					formatCsvValue(v.emergencyContactName),
					formatCsvValue(v.emergencyContactPhone),
					formatCsvValue(opportunityTitle),
					formatCsvValue(shiftLabel),
					formatCsvValue(v.attended ? 'Present' : 'Not Present')
				].join(',');
				csvContent += row + '\n';
			});
		});

		const encodedUri = encodeURI(csvContent);
		const link = document.createElement('a');
		link.setAttribute('href', encodedUri);
		link.setAttribute('download', 'approved_volunteers.csv');
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	function escapeHtml(value) {
		if (value === null || value === undefined) return '';
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
	function printRoster() {
		window.print();
	}
</script>

<section
	class="border-surface-700 bg-surface-900/70 printable-roster rounded-2xl border p-6 shadow-xl shadow-black/30"
>
	<div class="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
		<div class="flex-1">
			<h2 class="!text-left text-xl font-semibold text-white">
				Approved Volunteers
				<span
					class="bg-surface-800 text-surface-200 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm"
				>
					<IconUsers class="h-4 w-4" />
					{volunteers.length}
				</span>
			</h2>
			<p class="text-surface-300 text-sm">Day-of roster for quick reference and contact.</p>
		</div>
		<div class="no-print flex flex-wrap items-center gap-2">
			<button class="chip preset-tonal-primary-500" onclick={exportCsv}>
				<IconDownload class="h-4 w-4" />
				<span>Export</span>
			</button>
			<button class="chip preset-tonal-primary-500" onclick={printRoster}>
				<IconPrinter class="h-4 w-4" />
				<span>Print</span>
			</button>
		</div>
	</div>

	<div class="mt-6 space-y-6">
		{#if shiftsWithVolunteers.length === 0}
			<p class="text-surface-400 mt-4 text-sm">No approved volunteers yet.</p>
		{:else}
			{#each shiftsWithVolunteers as group (group.shift.id)}
				<div class="shift-group">
					<div
						class="border-surface-700 flex flex-col items-center justify-between gap-3 border-b pb-3 md:flex-row md:items-center"
					>
						<div class="flex items-center gap-4">
							<h3 class="h6 font-semibold text-white">{group.shift.opportunityTitle}</h3>
							<span class="font-bold">{group.shift.optionLabel}</span>
						</div>
						<button
							class="no-print chip preset-filled-secondary-500"
							onclick={() => handleMarkAllPresent(group.volunteers)}
						>
							Check In All
						</button>
					</div>
					<div class="mt-4 grid gap-4 md:grid-cols-2">
						{#each group.volunteers as volunteer (volunteer.assignmentId)}
							<article class="bg-surface-950/40 border-surface-700/60 rounded-xl border p-4">
								<header class="flex items-start justify-between gap-4">
									<div>
										<p class="text-lg font-semibold text-white">{volunteer.name}</p>
										<a
											href={`mailto:${volunteer.email}`}
											class="text-surface-400 mt-1 flex items-center gap-2 text-sm"
										>
											<IconMail class="h-4 w-4 flex-shrink-0" />
											<span>{volunteer.email}</span>
										</a>
										<a
											href={`tel:${volunteer.phone}`}
											class="text-surface-400 mt-1 flex items-center gap-2 text-sm"
										>
											<IconPhone class="h-4 w-4 flex-shrink-0" />
											<span>{formatPhoneNumber(volunteer.phone)}</span>
										</a>
									</div>
									<div class="no-print flex-shrink-0">
										<label class="flex cursor-pointer items-center">
											<div class="relative">
												<input
													type="checkbox"
													class="peer sr-only"
													checked={volunteer.attended}
													onchange={(event) =>
														onPresent(volunteer.assignmentId, event.currentTarget.checked)}
												/>
												<div
													class="bg-surface-600 peer-checked:bg-primary-500 h-6 w-10 rounded-full"
												></div>
												<div
													class="peer-checked:border-primary-500 absolute top-0.5 left-0.5 h-5 w-5 rounded-full border border-transparent bg-white transition peer-checked:translate-x-full"
												></div>
											</div>
										</label>
									</div>
								</header>
								{#if volunteer.emergencyContactName}
									<div class="mt-4">
										<button
											class="chip preset-tonal-tertiary capitalize"
											onclick={() => toggleEmergencyVisibility(volunteer.assignmentId)}
										>
											Emergency Contact
										</button>
										{#if expandedContacts.get(volunteer.assignmentId)}
											<div class="mt-2 flex items-center gap-2 text-sm" transition:slide>
												<div>
													<p class="font-medium text-white">{volunteer.emergencyContactName}</p>
													{#if volunteer.emergencyContactPhone}
														<a
															href={`tel:${volunteer.emergencyContactPhone}`}
															class="text-surface-400 mt-1 flex items-center gap-2 text-sm"
														>
															<IconPhone class="text-surface-500 h-4 w-4 flex-shrink-0" />
															<span>{formatPhoneNumber(volunteer.emergencyContactPhone)}</span>
														</a>
													{/if}
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</article>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</section>

<div class="printable-roster-table">
	<h1>Approved Volunteer Roster</h1>
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Email</th>
				<th>Phone</th>
				<th>Emergency Contact</th>
				<th>Emergency Phone</th>
				<th>Assignment</th>
				<th>Shift Time</th>
				<th>Status</th>
			</tr>
		</thead>
		<tbody>
			{#each shiftsWithVolunteers as group}
				{#each group.volunteers as v}
					<tr>
						<td>{v.name ?? ''}</td>
						<td>{v.email ?? ''}</td>
						<td>{v.phone ?? ''}</td>
						<td>{v.emergencyContactName ?? ''}</td>
						<td>{v.emergencyContactPhone ?? ''}</td>
						<td>{group.shift?.opportunityTitle ?? ''}</td>
						<td>{group.shift?.optionLabel ?? group.shift?.windowLabel ?? ''}</td>
						<td>{v.attended ? 'Present' : 'Not Present'}</td>
					</tr>
				{/each}
			{/each}
		</tbody>
	</table>
</div>

<style>
	.printable-roster-table {
		display: none;
	}

	@media print {
		body * {
			visibility: hidden;
		}
		.printable-roster-table,
		.printable-roster-table * {
			visibility: visible;
		}
		.printable-roster-table {
			display: block;
			position: absolute;
			left: 0;
			top: 0;
			width: 100%;
			padding: 1rem;
		}
		h1 {
			font-size: 1.5rem;
			margin-bottom: 1rem;
		}
		table {
			width: 100%;
			border-collapse: collapse;
			font-size: 0.9rem;
		}
		th,
		td {
			border: 1px solid #ddd;
			padding: 0.5rem;
			text-align: left;
		}
		th {
			background-color: #f2f2f2;
		}
		.no-print {
			display: none;
		}
	}
</style>
