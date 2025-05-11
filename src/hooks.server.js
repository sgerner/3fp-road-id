const redirectCodes = new Set([
	'1NOS2hP3',
	'3feetpls',
	'49y051AL',
	'7TdxihGT',
	'87EzrSTD',
	'8mXja9Bi',
	'brbWc9Wt',
	'cgebSvLJ',
	'cIiYtomM',
	'f4nA6gQ9',
	'GoLFpbz7',
	'GykzHI7g',
	'hw87evAy',
	'J6p2LDn0',
	'kb1DlLij',
	'L3UROZDC',
	'LBsLxXfT',
	'LIiNAkPh',
	'LIKdWjDp',
	'mhEWnzsw',
	'mlzSKnFF',
	'mSlveUhE',
	'N3q1WvT7',
	'OzwFh9wJ',
	'qM540UyA',
	'R9PnlNMv',
	'RoIwoKOp',
	't04XPKxh',
	't2vz0k3w',
	'v7FbGYwz',
	'YdXQh5Ho',
	'YpIDE3Lz',
	'ZCwL6ysl'
]);

export const handle = async ({ event, resolve }) => {
	const path = event.url.pathname.slice(1); // remove leading slash
	if (redirectCodes.has(path)) {
		return Response.redirect(`${event.url.origin}/roadid/${path}`, 301);
	}

	return resolve(event);
};
