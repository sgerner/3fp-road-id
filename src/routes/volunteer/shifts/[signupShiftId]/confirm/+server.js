import { redirect } from '@sveltejs/kit';
import { shiftActionsHelpers } from '../../shift-actions.server.js';

const { confirmShiftAction } = shiftActionsHelpers;

function buildRedirectUrl(result, successNotice) {
	const params = new URLSearchParams();
	if (result.success) {
		params.set('notice', successNotice);
		if (result.newAssignmentId) {
			params.set('shift', String(result.newAssignmentId));
		} else if (result.assignmentId) {
			params.set('shift', String(result.assignmentId));
		}
		if (result.event?.slug) {
			params.set('event', result.event.slug);
		}
	} else {
		const noticeKey =
			result.reason === 'login_required'
				? 'login_required'
				: result.reason === 'not_found'
					? 'not_found'
					: result.reason === 'forbidden'
						? 'forbidden'
						: result.reason === 'too_early' || result.reason === 'already_started'
							? 'confirm_window'
							: 'error';
		params.set('notice', noticeKey);
		if (result.message) {
			params.set('error', result.message);
		}
		if (result.assignmentId) {
			params.set('shift', String(result.assignmentId));
		}
	}
	const qs = params.toString();
	return `/volunteer/shifts${qs ? `?${qs}` : ''}`;
}

export const GET = async (event) => {
	const assignmentId = event.params.signupShiftId;
	if (!assignmentId) {
		throw redirect(303, '/volunteer/shifts?notice=not_found');
	}
	const result = await confirmShiftAction(event, assignmentId);
	throw redirect(303, buildRedirectUrl(result, 'confirm_success'));
};
