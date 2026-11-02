import { redirect } from '@sveltejs/kit';

export function load() {
	redirect(308, '/learn/safer-cycling-better-messages');
}
