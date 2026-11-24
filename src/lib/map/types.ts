export interface LeafletLatLng {
	lat: number;
	lng: number;
}

export interface LeafletBounds {
	pad: (bufferRatio: number) => LeafletBounds;
}

export interface LeafletIconInstance {
	createIcon: (oldIcon?: HTMLElement) => HTMLElement;
	createShadow: (oldIcon?: HTMLElement) => HTMLElement | null;
}

export interface LeafletIconConstructor {
	new (options?: Record<string, unknown>): LeafletIconInstance;
	extend: (definition: Record<string, unknown>) => LeafletIconConstructor;
}

export interface LeafletMarkerInstance {
	addTo: (target: LeafletMapInstance | LeafletLayerInstance) => LeafletMarkerInstance;
	setLatLng: (coords: [number, number]) => LeafletMarkerInstance;
	getElement: () => HTMLElement | null | undefined;
	on: (event: string, handler: (ev: LeafletPointerEvent) => void) => LeafletMarkerInstance;
	remove: () => void;
}

export interface LeafletLayerInstance {
	addTo: (map: LeafletMapInstance) => LeafletLayerInstance;
	addLayer: (layer: LeafletMarkerInstance) => LeafletLayerInstance;
	clearLayers: () => LeafletLayerInstance;
}

export interface LeafletPointerEvent {
	latlng?: LeafletLatLng;
}

export interface LeafletMapInstance {
	setView: (
		coords: [number, number],
		zoom: number,
		options?: { animate?: boolean }
	) => LeafletMapInstance;
	panTo: (coords: [number, number], options?: { animate?: boolean }) => LeafletMapInstance;
	fitBounds: (
		bounds: LeafletBounds,
		options?: { maxZoom?: number; padding?: [number, number]; animate?: boolean }
	) => LeafletMapInstance;
	addLayer: (layer: LeafletLayerInstance) => LeafletMapInstance;
	getCenter: () => LeafletLatLng;
	getZoom: () => number;
	getContainer: () => HTMLElement | undefined;
	invalidateSize: () => void;
	on: (event: string, handler: (ev: LeafletPointerEvent) => void) => LeafletMapInstance;
	remove: () => void;
}

export interface ClusterNode {
	getChildCount: () => number;
}

export interface LeafletModule {
	map: (el: HTMLElement, options?: { scrollWheelZoom?: boolean }) => LeafletMapInstance;
	tileLayer: (
		url: string,
		options?: { maxZoom?: number; attribution?: string }
	) => { addTo: (map: LeafletMapInstance) => unknown };
	marker: (coords: [number, number], options?: Record<string, unknown>) => LeafletMarkerInstance;
	layerGroup: () => LeafletLayerInstance;
	markerClusterGroup?: (options?: {
		chunkedLoading?: boolean;
		chunkInterval?: number;
		chunkDelay?: number;
		removeOutsideVisibleBounds?: boolean;
		showCoverageOnHover?: boolean;
		iconCreateFunction?: (cluster: ClusterNode) => LeafletIconInstance;
	}) => LeafletLayerInstance;
	latLngBounds: (points: [number, number][]) => LeafletBounds;
	Icon: LeafletIconConstructor;
}

export interface GoogleMapsLocation {
	lat: number | (() => number);
	lng: number | (() => number);
}

export interface GooglePlaceResult {
	geometry?: { location?: GoogleMapsLocation };
	formatted_address?: string;
	name?: string;
}

export interface GoogleMapsAutocomplete {
	addListener: (event: string, handler: () => void) => void;
	getPlace: () => GooglePlaceResult | undefined;
}

export interface GoogleMapsGeocoder {
	geocode: (
		request: Record<string, unknown>,
		callback: (
			results: Array<{ geometry?: { location?: GoogleMapsLocation } }>,
			status: string
		) => void
	) => void;
}

export interface GoogleMapsApi {
	Geocoder?: new () => GoogleMapsGeocoder;
	GeocoderStatus?: { OK?: string };
	places?: {
		Autocomplete?: new (
			input: HTMLInputElement,
			options?: Record<string, unknown>
		) => GoogleMapsAutocomplete;
	};
}
