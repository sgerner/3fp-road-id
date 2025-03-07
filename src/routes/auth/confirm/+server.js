import { redirect } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient';

export const GET = async ({ url, cookies }) => {
	const token_hash = url.searchParams.get('token_hash');
	const code = url.searchParams.get('code');

	if (!token_hash || !code) {
		throw redirect(303, '/auth/error');
	}

	// Verify the OTP and retrieve session details
	const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: 'email' });

	if (error) {
		throw redirect(303, '/auth/error');
	}

	// Store the session in a cookie
	const session = data?.session;
	if (session) {
		cookies.set('sb_session', JSON.stringify(session), {
			httpOnly: true,
			sameSite: 'lax',
			secure: true, // Ensure it's secure (must be https in production)
			path: '/',
			maxAge: session.expires_in // Use session expiration time
		});
	}

	// Claim the code for the user if needed
	const { data: codeData, error: codeError } = await supabase
		.from('qr_codes')
		.select('*')
		.eq('code', code)
		.single();

	if (!codeError) {
		if (!codeData.profile_id) {
			const { data: claimCode, error: claimError } = await supabase
				.from('qr_codes')
				.update({ profile_id: data.user.id })
				.match({ code });
			if (claimError) throw redirect(303, '/auth/error');
		}
	}

	// Redirect to profile
	throw redirect(303, `/${code}`);
};
