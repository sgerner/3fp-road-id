import { getActivityClient } from '#lib/server/activities';
import { loadRiderSafetyState, reconcileRiderSafetyData } from '#lib/server/roadIdProfile';

export const load = async ({ cookies }) => {
	const { user, supabase } = await getActivityClient(cookies);

	if (!user?.id) {
		return {
			currentUser: null,
			claimedCodes: [],
			safetySummary: null
		};
	}

	const [profileRes, safetyState] = await Promise.all([
		supabase
			.from('profiles')
			.select('full_name,phone,emergency_contact_name,emergency_contact_phone')
			.eq('user_id', user.id)
			.maybeSingle(),
		loadRiderSafetyState(supabase, user.id).catch((err) => {
			console.warn('Unable to load Road ID state for /roadid', err);
			return { roadIdProfile: null, emergencyContacts: [], claimedCodes: [] };
		})
	]);

	const reconciled = reconcileRiderSafetyData({
		profileRow: profileRes.data ?? null,
		roadIdRow: safetyState.roadIdProfile,
		emergencyContacts: safetyState.emergencyContacts
	});

	return {
		currentUser: user,
		claimedCodes: safetyState.claimedCodes,
		safetySummary: {
			blood_type: reconciled.blood_type || null,
			has_allergies: Boolean(reconciled.allergies),
			has_medication: Boolean(reconciled.medication),
			emergency_contact_count: reconciled.emergency_contacts.length
		}
	};
};
