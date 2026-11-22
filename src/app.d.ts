// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
interface TurnstileRenderOptions {
	sitekey?: string;
	execution?: string;
	appearance?: string;
	retry?: string;
	callback?: (token: string) => void;
	'error-callback'?: (code?: string) => boolean | void;
	'expired-callback'?: () => void;
	'timeout-callback'?: () => void;
	'unsupported-callback'?: () => void;
	[key: string]: unknown;
}

interface TurnstileApi {
	render(element: HTMLElement | string, options?: TurnstileRenderOptions): string;
	execute(widgetId?: HTMLElement | string, options?: TurnstileRenderOptions): void;
	reset(widgetId?: HTMLElement | string): void;
	remove(widgetId?: HTMLElement | string): void;
}

interface GoogleMapsLatLng {
	lat: (() => number) | number;
	lng: (() => number) | number;
}

interface GoogleMapsPlaceResult {
	name?: string;
	formatted_address?: string;
	address_components?: Array<{
		long_name?: string;
		short_name?: string;
		types?: string[];
	}>;
	geometry?: {
		location?: GoogleMapsLatLng;
	};
}

interface GoogleMapsGeocoder {
	geocode(
		request: Record<string, unknown>,
		callback?: (results: GoogleMapsPlaceResult[] | null, status: string) => void
	): Promise<{ results: GoogleMapsPlaceResult[] }>;
}

interface GoogleMapsPlaceAutocompleteElement extends HTMLElement {
	value?: string;
}

interface GoogleMapsAutocomplete {
	addListener(eventName: string, handler: () => void): void;
	getPlace(): GoogleMapsPlaceResult | undefined;
}

interface GoogleMapsApi {
	Geocoder: new () => GoogleMapsGeocoder;
	GeocoderStatus?: {
		OK?: string;
		[key: string]: string | undefined;
	};
	places?: {
		PlaceAutocompleteElement?: new () => GoogleMapsPlaceAutocompleteElement;
		Autocomplete?: new (
			inputField: HTMLInputElement,
			opts?: Record<string, unknown>
		) => GoogleMapsAutocomplete;
	};
}

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			micrositeSlug?: string;
			micrositePublicPathname?: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		turnstile?: TurnstileApi;
		__TURNSTILE_TEST_SITE_KEY__?: string;
		google?: {
			maps?: GoogleMapsApi;
		};
		initGooglePlaces?: () => void;
		initVolunteerEventPlaces?: () => void;
		initGroupsNewPlaces?: () => void;
	}
}

export {};
