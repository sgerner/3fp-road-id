import { requireAdmin } from '$lib/server/admin';

export async function load({ cookies }) {
	const { user, supabase } = await requireAdmin(cookies);
	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name,email')
		.eq('user_id', user.id)
		.maybeSingle();

	return {
		profile: {
			full_name: profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Your Name',
			email: profile?.email || user?.email || ''
		}
	};
}
