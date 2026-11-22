// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface VisitorLocation {
			city: string;
			region: string;
			stateRegion: string;
			country: string;
			label: string;
			latitude: number | null;
			longitude: number | null;
			source: 'profile' | 'approximate' | null;
			hasCoordinates: boolean;
			hasLocalScope: boolean;
		}

		// interface Error {}
		interface Locals {
			micrositeSlug?: string;
			micrositePublicPathname?: string;
			visitorLocation?: VisitorLocation | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
