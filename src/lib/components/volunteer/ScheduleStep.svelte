<script>
	import CoordinatePinPicker from '#lib/components/map/CoordinatePinPicker.svelte';

	let {
		eventDetails,
		timezoneOptions = [],
		showDateTimeFields = false,
		onEventDetailsChange = () => {}
	} = $props();

	let geocodeRevision = $state(0);

	function handleAddressBlur() {
		if ((eventDetails?.locationName || '').trim()) {
			geocodeRevision += 1;
		}
	}
</script>

<div class="grid gap-4 md:grid-cols-2">
	{#if showDateTimeFields}
		<div class="flex flex-col gap-1.5">
			<label class="text-surface-800-200 text-sm font-medium" for="event-start">Start *</label>
			<input
				id="event-start"
				type="datetime-local"
				class="input preset-tonal-surface min-h-11 w-full px-4 py-2"
				value={eventDetails.eventStart}
				oninput={(e) => onEventDetailsChange({ eventStart: e.currentTarget.value })}
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<label class="text-surface-800-200 text-sm font-medium" for="event-end">End</label>
			<input
				id="event-end"
				type="datetime-local"
				class="input preset-tonal-surface min-h-11 w-full px-4 py-2"
				value={eventDetails.eventEnd}
				oninput={(e) => onEventDetailsChange({ eventEnd: e.currentTarget.value })}
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<label class="text-surface-800-200 text-sm font-medium" for="event-timezone">Timezone</label>
			<select
				id="event-timezone"
				class="select preset-tonal-surface min-h-11 w-full px-4 py-2"
				value={eventDetails.timezone}
				onchange={(e) => onEventDetailsChange({ timezone: e.currentTarget.value })}
			>
				{#each timezoneOptions as tz}
					<option value={tz}>{tz}</option>
				{/each}
			</select>
		</div>
	{/if}
	<div class="flex flex-col gap-1.5 md:col-span-2">
		<label class="text-surface-800-200 text-sm font-medium" for="event-location-name">Address</label
		>
		<input
			id="event-location-name"
			class="input preset-tonal-surface min-h-11 w-full px-4 py-2"
			value={eventDetails.locationName}
			oninput={(e) => onEventDetailsChange({ locationName: e.currentTarget.value })}
			onblur={handleAddressBlur}
			placeholder="123 River Rd, Tempe, AZ 85281"
		/>
	</div>
	<div class="flex flex-col gap-1.5 md:col-span-2">
		<label class="text-surface-800-200 text-sm font-medium" for="event-location-address"
			>Location notes</label
		>
		<textarea
			id="event-location-address"
			class="textarea preset-tonal-surface min-h-24 w-full px-4 py-2"
			value={eventDetails.locationAddress}
			oninput={(e) => onEventDetailsChange({ locationAddress: e.currentTarget.value })}
			placeholder="Look for the bike repair tent near the main entrance. Parking is limited — roll or carpool if you can."
		></textarea>
	</div>
	<div class="flex flex-col gap-2 md:col-span-2">
		<CoordinatePinPicker
			regionLabel="Volunteer event meeting point map"
			latitude={eventDetails.latitude}
			longitude={eventDetails.longitude}
			searchLabel="Pin on map"
			searchValue={eventDetails.locationName || ''}
			externalGeocodeQuery={eventDetails.locationName || ''}
			{geocodeRevision}
			pinnedZoom={13}
			canvasClass="h-64 w-full"
			onCoordinatesChange={({ latitudeText, longitudeText }) => {
				onEventDetailsChange({ latitude: latitudeText, longitude: longitudeText });
			}}
			onPlaceSelect={({ formattedAddress, name }) => {
				const candidate = formattedAddress || name;
				if (candidate) {
					onEventDetailsChange({ locationName: candidate });
				}
			}}
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<label class="text-surface-800-200 text-sm font-medium" for="event-contact-email"
			>Contact email</label
		>
		<input
			id="event-contact-email"
			class="input preset-tonal-surface min-h-11 w-full px-4 py-2"
			type="email"
			value={eventDetails.contactEmail}
			oninput={(e) => onEventDetailsChange({ contactEmail: e.currentTarget.value })}
			placeholder="volunteers@yourgroup.org"
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<label class="text-surface-800-200 text-sm font-medium" for="event-contact-phone"
			>Contact phone</label
		>
		<input
			id="event-contact-phone"
			class="input preset-tonal-surface min-h-11 w-full px-4 py-2"
			type="tel"
			value={eventDetails.contactPhone}
			oninput={(e) => onEventDetailsChange({ contactPhone: e.currentTarget.value })}
			placeholder="(555) 123-4567"
		/>
	</div>
</div>
