import { json } from '@sveltejs/kit';

// Kept as a compatibility response for clients that still have the previous
// profile bundle cached. SMS enrollment now uses authenticated consent rather
// than an app-generated one-time code.
export async function POST() {
	return json(
		{
			error: 'Mobile verification is no longer required. Save your SMS preferences again.'
		},
		{ status: 410 }
	);
}
