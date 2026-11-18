import { redirect } from '@sveltejs/kit';

export function GET({ params }) {
	const search = new URLSearchParams({ shift: params.signupShiftId, notice: 'review_confirm' });
	redirect(303, `/volunteer/shifts?${search}`);
}
