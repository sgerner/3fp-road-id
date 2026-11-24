import { getLearnClient, getLearnProfilesMap } from '#lib/server/learn.js';
import { handleLearnSearchRequest } from '#lib/server/learnSearch.js';

export const GET = (event) =>
	handleLearnSearchRequest(event, {
		getClient: getLearnClient,
		getProfilesMap: getLearnProfilesMap
	});
