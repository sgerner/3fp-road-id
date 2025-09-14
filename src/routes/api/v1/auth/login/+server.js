import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';
import { PUBLIC_URL_BASE } from '$env/static/public';

// Expect a payload like:
// {
//    code: "ABC123XY",
//    email: "user@example.com",
//    createProfile: true   // if creating a new profile; false for normal login
// }
export async function POST({ request, url }) {
	try {
		const { code, email, createProfile, returnTo } = await request.json();

		// Construct the redirect URL so the magic link returns the user to your app
		// and appends the code as a query parameter.
		// Ensure you have set PUBLIC_BASE_URL in your environment.
		// Build confirm URL with return_to to get users back where they started
		const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : '/';
		const params = new URLSearchParams({ return_to: safeReturn });
		if (code) params.set('rid', code);
		// Ensure at least one param so your email template `&token_hash=` works
		const redirectUrl = `${PUBLIC_URL_BASE}/auth/confirm?${params.toString()}`;

		// Call signInWithOtp (Magic Link) with shouldCreateUser toggled.
    const { data: authData, error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: createProfile,
            emailRedirectTo: redirectUrl
        }
    });

		if (authError) {
			return json({ error: authError.message }, { status: 400 });
		}

		// If we are creating a new profile, insert it into the profiles table
		// and update the qr_codes table to link the code to the new profile.
		/*if (createProfile) {
			const { data: profileData, error: profileError } = await supabase
				.from('profiles')
				.insert([{ full_name, user_id: authData.user.uid }])
				.select()
				.single();

			if (profileError) {
				return json({ error: profileError.message }, { status: 400 });
			}

			// Update the qr_codes record to associate the new profile.
			const { error: qrError } = await supabase
				.from('qr_codes')
				.update({ profile_id: profileData.user_id })
				.eq('code', code);

			if (qrError) {
				return json({ error: qrError.message }, { status: 400 });
			}
		}*/

		// Return a message. The magic link email will be sent by Supabase.
		return json({ message: 'Magic link sent. Please check your email.' });
	} catch (error) {
		console.error('Unexpected error in auth login endpoint:', error);
		return json({ error: 'Unexpected error occurred' }, { status: 500 });
	}
}
